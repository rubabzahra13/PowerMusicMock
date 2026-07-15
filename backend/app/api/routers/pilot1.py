from typing import List, Optional
from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, case, func

from app import models
from app import schemas
from app.api.auth import AuthenticatedUser, require_admin, require_manager, auth_is_required
from app.api.rate_limit import rate_limit, prune_old_rate_limit_buckets
from app.api.cron_auth import require_cron_secret
from app.input_validation import normalize_search_query
from app.api.dependencies import get_db
from app.request_display import (
    allocate_request_ids,
    hydrate_request_display,
    request_id_numeric_desc,
)
from app.user_display import hydrate_request_users
from app.manager_request_serialize import (
    directory_rows_to_api_dicts,
    manager_requests_list_to_api_dicts,
    request_to_api_dict,
    requests_to_api_dicts,
)
from app.manager_request_activity import list_partner_activity
from app.manager_request_intake import intake_manager_submission, manager_id_for_email
from app.manager_request_views import (
    mark_all_handled_seen,
    mark_request_seen,
)
from app.manager_submission_jobs import (
    enqueue_manager_batch,
    get_manager_submission_job,
    process_manager_submission_job_by_id,
    process_pending_manager_submission_jobs,
)
from app.manager_request_summary_cache import (
    get_manager_request_summary,
    invalidate_manager_request_summary,
    set_manager_request_summary,
)
from app.manager_request_stats import (
    decrement_manager_pending_stat,
    get_stored_manager_request_stats,
    increment_manager_request_stats,
)
from app.partner_requests_realtime import notify_admin_requests_changed
from app.dashboard_insights import build_dashboard_insights
from app.partner_allowlists import (
    assert_manager_email_allowed,
    create_automated_source,
    create_manager_domain,
    delete_automated_source,
    delete_manager_domain,
    list_automated_sources,
    list_manager_domain_strings,
    list_manager_domains,
)
from app.manager_request_tags import (
    TAG_ALREADY_EXISTS,
    TAG_AUTO_MAIL,
    TAG_UNVERIFIED,
    TAG_VERIFIED,
)
from app.directory_person_match import (
    find_roster_person,
    roster_match_candidates,
    removed_snapshot_rows,
    roster_snapshot_rows,
    search_roster_rows,
)

router = APIRouter()

_limit_submit = rate_limit("manager_submit", max_requests=20, window_seconds=3600, user_dep=require_manager)
_limit_duplicate = rate_limit("manager_duplicate", max_requests=120, window_seconds=60, user_dep=require_manager)
_limit_search = rate_limit("manager_search", max_requests=60, window_seconds=60, user_dep=require_manager)
_limit_match = rate_limit("manager_match", max_requests=120, window_seconds=60, user_dep=require_manager)
# One directory snapshot per page visit — generous so managers never see throttle errors.
_limit_directory = rate_limit("manager_directory", max_requests=30, window_seconds=60, user_dep=require_manager)
# Full history list only (summary is cached server-side and not rate-limited).
_limit_requests_list = rate_limit("manager_requests_list", max_requests=60, window_seconds=60, user_dep=require_manager)

_REASON_RANK = {
    "Email": 6,
    "Name + location": 5,
    "Name": 4,
    "Email + location": 3,
    "First name + location": 2,
    "Last name + location": 1,
}


def _handled_directory_query(db: Session):
    return db.query(models.ManagerRequest).filter(
        models.ManagerRequest.status == "handled",
        models.ManagerRequest.outcome.isnot(None),
    )


def _person_search_row(row: models.ManagerRequest) -> dict:
    return {
        "id": row.id,
        "firstName": row.person_first_name,
        "lastName": row.person_last_name,
        "email": row.person_email,
        "location": row.person_location,
        "status": row.outcome,
        "dateAdded": row.handled_at,
    }


def _duplicate_response(row: models.ManagerRequest) -> dict:
    return {
        "duplicate": True,
        "id": row.id,
        "firstName": row.person_first_name,
        "lastName": row.person_last_name,
        "email": row.person_email,
        "status": row.outcome,
        "dateAdded": row.handled_at,
        "location": row.person_location,
    }


def _no_duplicate_response() -> dict:
    return {
        "duplicate": False,
        "id": None,
        "firstName": None,
        "lastName": None,
        "email": None,
        "status": None,
        "dateAdded": None,
        "location": None,
    }


def _find_duplicate_person(
    db: Session,
    *,
    email: str,
    first_name: str,
    last_name: str,
    location: str,
) -> models.ManagerRequest | None:
    probe = schemas.PersonInfo(
        firstName=first_name,
        lastName=last_name,
        email=email,
        location=location,
    )
    return find_roster_person(db, probe)


def _find_related_people(
    db: Session,
    *,
    email: str,
    first_name: str,
    last_name: str,
    location: str,
) -> list[tuple[models.ManagerRequest, set[str]]]:
    probe = schemas.PersonInfo(
        firstName=first_name,
        lastName=last_name,
        email=email,
        location=location,
    )
    return [(row, {"Match"}) for row in roster_match_candidates(db, probe)]


def _related_person_candidates(
    db: Session,
    *,
    email: str,
    first_name: str,
    last_name: str,
    location: str,
    limit: int = 10,
) -> list[dict]:
    related = _find_related_people(
        db,
        email=email,
        first_name=first_name,
        last_name=last_name,
        location=location,
    )
    rows = []
    for person, reasons in related[:limit]:
        row = _person_search_row(person)
        row["matchReasons"] = sorted(reasons, key=lambda r: -_REASON_RANK.get(r, 0))
        rows.append(row)
    return rows


def _form_has_match_criteria(email: str, first_name: str, last_name: str, location: str) -> bool:
    if email:
        return True
    if first_name and last_name:
        return True
    if location and (first_name or last_name):
        return True
    return False


def _search_people(db: Session, query: str, *, limit: int) -> list[models.ManagerRequest]:
    return search_roster_rows(db, query, limit=limit)

@router.get("/api/requests", response_model=List[schemas.RequestOut])
def get_requests(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    db_requests = (
        db.query(models.ManagerRequest)
        .order_by(request_id_numeric_desc())
        .all()
    )
    hydrate_request_display(db_requests)
    return requests_to_api_dicts(db, db_requests)

@router.get("/api/persons", response_model=List[schemas.PersonOut])
def get_people(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    rows = roster_snapshot_rows(db, limit=2000)
    return directory_rows_to_api_dicts(db, rows)

def _visible_new_requests_query(db: Session):
    return (
        db.query(models.ManagerRequest)
        .filter(
            models.ManagerRequest.status == "new",
            or_(
                models.ManagerRequest.tags.contains([TAG_VERIFIED]),
                and_(
                    models.ManagerRequest.tags.contains([TAG_UNVERIFIED]),
                    models.ManagerRequest.tags.contains([TAG_AUTO_MAIL]),
                ),
            ),
        )
    )


@router.get("/api/kpis", response_model=schemas.KpiOut)
def get_kpis(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    pending = _visible_new_requests_query(db).count()
    users = len(roster_snapshot_rows(db, limit=10_000))
    return {"pendingRequests": pending, "usersInLedger": users}


@router.get("/api/dashboard", response_model=schemas.DashboardOut)
def get_dashboard(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    pending = (
        _visible_new_requests_query(db)
        .order_by(request_id_numeric_desc())
        .all()
    )
    hydrate_request_display(pending)
    pending_payloads = requests_to_api_dicts(db, pending)
    insights = build_dashboard_insights(db, pending=pending, pending_payloads=pending_payloads)
    return {
        "kpis": {
            "pendingRequests": len(pending),
            "usersInLedger": insights["usersAdded"],
        },
        "pendingRequests": pending_payloads,
        "activity": list_partner_activity(db, limit=8),
        "insights": insights,
    }

@router.get("/api/activity", response_model=List[schemas.ActivityOut])
def get_activity(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    return list_partner_activity(db, limit=10)


def _assert_manager_submitter(submitted_by: schemas.SubmittedBy, manager, db: Session) -> None:
    sub_email = (submitted_by.email or "").strip()
    if auth_is_required() and sub_email.lower() != manager.email.lower():
        raise HTTPException(
            status_code=403,
            detail="Submitter email must match your signed-in account.",
        )
    assert_manager_email_allowed(db, sub_email or manager.email)


def _manager_id_for_submitter(
    db: Session,
    submitted_by: schemas.SubmittedBy,
    *,
    manager_user_id: Optional[str] = None,
) -> Optional[str]:
    if manager_user_id and manager_user_id != "dev-bypass":
        return manager_user_id
    return manager_id_for_email(db, submitted_by.email or "")


def _create_manager_request_row(
    db: Session,
    *,
    submitted_by: schemas.SubmittedBy,
    person: schemas.PersonInfo,
    action: str,
    notes: Optional[str],
    new_id: Optional[str] = None,
    manager_user_id: Optional[str] = None,
) -> models.ManagerRequest:
    return intake_manager_submission(
        db,
        person=person,
        action=action,
        manager_notes=notes,
        manager_id=_manager_id_for_submitter(db, submitted_by, manager_user_id=manager_user_id),
        new_id=new_id,
    )


@router.post("/api/requests", response_model=schemas.RequestOut)
def create_request(
    req_in: schemas.RequestIn,
    db: Session = Depends(get_db),
    manager=Depends(_limit_submit),
):
    _assert_manager_submitter(req_in.submittedBy, manager, db)

    new_request = _create_manager_request_row(
        db,
        submitted_by=req_in.submittedBy,
        person=req_in.person,
        action=req_in.action,
        notes=req_in.notes,
        manager_user_id=manager.id,
    )
    increment_manager_request_stats(db, new_request)
    db.commit()
    db.refresh(new_request)
    hydrate_request_display([new_request])
    hydrate_request_users(db, [new_request])
    invalidate_manager_request_summary(manager.id)
    notify_admin_requests_changed("manager_submit")
    return request_to_api_dict(new_request)


@router.post(
    "/api/requests/batch",
    status_code=202,
    response_model=schemas.ManagerSubmissionJobOut,
)
def create_requests_batch(
    req_in: schemas.ManagerBatchRequestIn,
    db: Session = Depends(get_db),
    manager=Depends(_limit_submit),
):
    _assert_manager_submitter(req_in.submittedBy, manager, db)

    job = enqueue_manager_batch(db, manager_id=manager.id, req_in=req_in)
    invalidate_manager_request_summary(manager.id)
    job = process_manager_submission_job_by_id(db, job.id) or job

    return _submission_job_response(job)


def _submission_job_response(job: models.ManagerSubmissionJob) -> dict:
    result = job.result if isinstance(job.result, dict) else {}
    items = result.get("items") if isinstance(result.get("items"), list) else None
    return {
        "jobId": job.id,
        "status": job.status,
        "count": int(result.get("count") or len(job.payload.get("people") or [])),
        "error": job.error,
        "items": items,
    }


@router.get(
    "/api/manager/submission-jobs/{job_id}",
    response_model=schemas.ManagerSubmissionJobOut,
)
def get_manager_submission_job_status(
    job_id: str,
    db: Session = Depends(get_db),
    manager=Depends(require_manager),
):
    job = get_manager_submission_job(db, job_id=job_id, manager_id=manager.id)
    if job is None:
        raise HTTPException(status_code=404, detail="Submission job not found")
    return _submission_job_response(job)


@router.api_route("/api/jobs/process-manager-submissions", methods=["GET", "POST"])
def process_manager_submission_jobs(
    request: Request,
    secret: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Cron worker — processes queued manager batch submissions."""
    require_cron_secret(request, secret)
    stats = process_pending_manager_submission_jobs(db)
    stats["prunedRateLimitBuckets"] = prune_old_rate_limit_buckets(db)
    return stats

@router.get("/api/admin/requests", response_model=List[schemas.RequestOut])
def get_admin_requests(status: Optional[str] = None, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    query = db.query(models.ManagerRequest)
    if status:
        query = query.filter(models.ManagerRequest.status == status)
    
    if status == "handled":
        db_requests = query.order_by(models.ManagerRequest.handled_at.desc()).all()
    else:
        db_requests = query.order_by(request_id_numeric_desc()).all()

    hydrate_request_display(db_requests)
    return requests_to_api_dicts(db, db_requests)

@router.get("/api/admin/requests/page", response_model=schemas.NewRequestsPageOut)
def get_new_requests_page(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    db_requests = (
        _visible_new_requests_query(db)
        .order_by(request_id_numeric_desc())
        .all()
    )
    hydrate_request_display(db_requests)
    directory = roster_snapshot_rows(db, limit=2000)
    return {
        "requests": requests_to_api_dicts(db, db_requests),
        "persons": directory_rows_to_api_dicts(db, directory),
    }

@router.post("/api/admin/requests/{request_id}/mark-handled", response_model=schemas.RequestOut)
def mark_request_handled(
    request_id: str,
    payload: schemas.MarkHandledIn = schemas.MarkHandledIn(),
    db: Session = Depends(get_db),
    admin: AuthenticatedUser = Depends(require_admin),
):
    req = db.query(models.ManagerRequest).filter(models.ManagerRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
        
    if req.status == "handled":
        hydrate_request_users(db, [req])
        return request_to_api_dict(req)
        
    outcome = "Added" if req.action == "Add" else "Removed"
    was_new = req.status == "new"

    req.status = "handled"
    req.handled_at = datetime.now(timezone.utc)
    req.outcome = outcome
    if admin.id != "dev-bypass":
        req.handled_by_admin_id = admin.id
    if payload.adminNote:
        req.admin_notes = payload.adminNote

    if was_new:
        decrement_manager_pending_stat(db, req)

    db.commit()
    db.refresh(req)
    hydrate_request_display([req])
    hydrate_request_users(db, [req])
    if req.manager_id:
        invalidate_manager_request_summary(str(req.manager_id))
    if was_new:
        notify_admin_requests_changed("mark_handled")
    return request_to_api_dict(req)

@router.post("/api/admin/requests/manual", response_model=List[schemas.RequestOut])
def create_manual_requests(req_in: schemas.ManualRequestIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    manual_submitter = schemas.SubmittedBy(
        firstName=req_in.submittedBy.firstName,
        lastName=req_in.submittedBy.lastName,
        email=req_in.submittedBy.email,
        club=req_in.submittedBy.club,
    )
    request_ids = allocate_request_ids(db, len(req_in.people))

    new_requests = [
        _create_manager_request_row(
            db,
            submitted_by=manual_submitter,
            person=person_in,
            action=req_in.action,
            notes=person_in.notes or req_in.notes,
            new_id=new_id,
        )
        for new_id, person_in in zip(request_ids, req_in.people)
    ]

    db.commit()

    for req in new_requests:
        db.refresh(req)
    hydrate_request_display(new_requests)
    notify_admin_requests_changed("admin_manual")
    return requests_to_api_dicts(db, new_requests)


@router.post("/api/persons/check-duplicate", response_model=schemas.DuplicateCheckOut)
def check_person_duplicate(
    payload: schemas.DuplicateCheckIn,
    db: Session = Depends(get_db),
    _manager=Depends(_limit_duplicate),
):
    """Manager-portal helper — match by email, name, or name + location."""
    p_email = (payload.email or "").strip().lower()
    p_first = (payload.firstName or "").strip().lower()
    p_last = (payload.lastName or "").strip().lower()
    p_location = (payload.location or "").strip().lower()

    if not p_email and not (p_first and p_last):
        return _no_duplicate_response()

    match = _find_duplicate_person(
        db,
        email=p_email,
        first_name=p_first,
        last_name=p_last,
        location=p_location,
    )
    if match:
        return _duplicate_response(match)
    return _no_duplicate_response()


@router.post(
    "/api/manager/persons/match-candidates",
    response_model=List[schemas.PersonMatchCandidateOut],
)
def match_person_candidates(
    payload: schemas.DuplicateCheckIn,
    limit: int = 10,
    db: Session = Depends(get_db),
    _manager=Depends(_limit_match),
):
    """All directory rows that share any person-form field (or field + location)."""
    p_email = (payload.email or "").strip().lower()
    p_first = (payload.firstName or "").strip().lower()
    p_last = (payload.lastName or "").strip().lower()
    p_location = (payload.location or "").strip().lower()

    if not _form_has_match_criteria(p_email, p_first, p_last, p_location):
        return []

    capped = min(max(limit, 1), 15)
    return _related_person_candidates(
        db,
        email=p_email,
        first_name=p_first,
        last_name=p_last,
        location=p_location,
        limit=capped,
    )


def _manager_requests_query(db: Session, manager: AuthenticatedUser):
    query = db.query(models.ManagerRequest).filter(
        models.ManagerRequest.tags.contains([TAG_VERIFIED]),
    )
    if manager.id and manager.id != "dev-bypass":
        try:
            manager_uuid = uuid.UUID(str(manager.id))
        except ValueError:
            return query.filter(models.ManagerRequest.id.is_(None))
        query = query.filter(models.ManagerRequest.manager_id == manager_uuid)
    return query


@router.get("/api/manager/requests/summary", response_model=schemas.ManagerRequestsSummaryOut)
def manager_requests_summary(
    db: Session = Depends(get_db),
    manager: AuthenticatedUser = Depends(require_manager),
):
    """Lightweight counts for the manager portal card."""
    cached = get_manager_request_summary(manager.id)
    if cached is not None:
        return cached

    stored = get_stored_manager_request_stats(db, manager.id)
    if stored is not None:
        set_manager_request_summary(
            manager.id,
            total=stored["total"],
            pending_count=stored["pendingCount"],
        )
        return stored

    base = _manager_requests_query(db, manager)
    total, pending_count = base.with_entities(
        func.count(),
        func.sum(case((models.ManagerRequest.status == "new", 1), else_=0)),
    ).one()
    payload = {
        "total": int(total or 0),
        "pendingCount": int(pending_count or 0),
    }
    set_manager_request_summary(
        manager.id,
        total=payload["total"],
        pending_count=payload["pendingCount"],
    )
    return payload


@router.get("/api/manager/requests", response_model=schemas.ManagerRequestsPageOut)
def list_manager_requests(
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    manager: AuthenticatedUser = Depends(_limit_requests_list),
):
    """Paginated requests submitted by the signed-in manager (portal submissions only)."""
    if status and status not in ("new", "handled"):
        raise HTTPException(status_code=400, detail="status must be new or handled")

    safe_page = max(page, 1)
    safe_limit = min(max(limit, 1), 50)
    offset = (safe_page - 1) * safe_limit

    query = _manager_requests_query(db, manager)
    if status:
        query = query.filter(models.ManagerRequest.status == status)

    base = _manager_requests_query(db, manager)
    if status:
        total = query.count()
        pending_count = (
            total if status == "new" else base.filter(models.ManagerRequest.status == "new").count()
        )
    else:
        total, pending_count = base.with_entities(
            func.count(),
            func.sum(case((models.ManagerRequest.status == "new", 1), else_=0)),
        ).one()
        total = int(total or 0)
        pending_count = int(pending_count or 0)

    if status == "handled":
        rows = (
            query.order_by(models.ManagerRequest.handled_at.desc())
            .offset(offset)
            .limit(safe_limit)
            .all()
        )
    else:
        rows = query.order_by(request_id_numeric_desc()).offset(offset).limit(safe_limit).all()

    hydrate_request_display(rows)
    return {
        "items": manager_requests_list_to_api_dicts(rows),
        "total": total,
        "page": safe_page,
        "limit": safe_limit,
        "unreadCount": 0,
        "pendingCount": pending_count,
    }


@router.post("/api/manager/requests/{request_id}/mark-seen")
def mark_manager_request_seen(
    request_id: str,
    db: Session = Depends(get_db),
    manager: AuthenticatedUser = Depends(_limit_requests_list),
):
    """Mark a handled request as seen by the signed-in manager."""
    req = (
        _manager_requests_query(db, manager)
        .filter(models.ManagerRequest.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "handled":
        return {"ok": True, "marked": 0}

    mark_request_seen(db, manager_id=manager.id, request_id=request_id)
    db.commit()
    return {"ok": True, "marked": 1}


@router.post("/api/manager/requests/mark-all-seen")
def mark_all_manager_requests_seen(
    db: Session = Depends(get_db),
    manager: AuthenticatedUser = Depends(_limit_requests_list),
):
    """Mark all handled requests as seen for the signed-in manager."""
    marked = mark_all_handled_seen(
        db,
        manager_id=manager.id,
        base_query=_manager_requests_query(db, manager),
    )
    db.commit()
    return {"ok": True, "marked": marked}


@router.get("/api/manager/persons/directory", response_model=List[schemas.PersonSearchOut])
def manager_person_directory(
    outcome: str = "Added",
    db: Session = Depends(get_db),
    _manager=Depends(_limit_directory),
):
    """Roster snapshot for instant client-side search (load in background)."""
    if outcome not in {"Added", "Removed"}:
        raise HTTPException(status_code=422, detail="outcome must be Added or Removed")
    if outcome == "Removed":
        rows = removed_snapshot_rows(db, limit=1000)
    else:
        rows = roster_snapshot_rows(db, limit=1000)
    return [_person_search_row(row) for row in rows]


@router.get("/api/manager/persons/search", response_model=List[schemas.PersonSearchOut])
def search_persons_for_manager(
    q: str = "",
    limit: int = 25,
    db: Session = Depends(get_db),
    _manager=Depends(_limit_search),
):
    """Scoped search for the manager submit form — name, email, or location."""
    try:
        query = normalize_search_query(q, max_length=100).lower()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if len(query) < 2:
        return []

    capped = min(max(limit, 1), 25)
    people = _search_people(db, query, limit=capped)
    return [_person_search_row(person) for person in people]


# ── Partner allowlists (manager domains + automated roster sources) ──


@router.get("/api/manager/allowed-domains", response_model=schemas.ManagerAllowedDomainsPublicOut)
def public_manager_allowed_domains(db: Session = Depends(get_db)):
    """Public list used by the manager signup / login UI."""
    return {"domains": list_manager_domain_strings(db)}


@router.get("/api/admin/manager-domains", response_model=List[schemas.ManagerAllowedDomainOut])
def admin_list_manager_domains(
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    return list_manager_domains(db)


@router.post("/api/admin/manager-domains", response_model=schemas.ManagerAllowedDomainOut)
def admin_create_manager_domain(
    payload: schemas.ManagerAllowedDomainCreateIn,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    return create_manager_domain(db, payload.domain)


@router.delete("/api/admin/manager-domains/{domain_id}")
def admin_delete_manager_domain(
    domain_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    return {"deleted": delete_manager_domain(db, domain_id)}


@router.get("/api/admin/automated-sources", response_model=List[schemas.AutomatedRosterSourceOut])
def admin_list_automated_sources(
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    return list_automated_sources(db)


@router.post("/api/admin/automated-sources", response_model=schemas.AutomatedRosterSourceOut)
def admin_create_automated_source(
    payload: schemas.AutomatedRosterSourceCreateIn,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    return create_automated_source(db, payload.pattern)


@router.delete("/api/admin/automated-sources/{source_id}")
def admin_delete_automated_source(
    source_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    return {"deleted": delete_automated_source(db, source_id)}
