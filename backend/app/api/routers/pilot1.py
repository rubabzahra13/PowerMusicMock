from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app import models
from app import schemas
from app.api.auth import AuthenticatedUser, require_admin, require_manager, auth_is_required
from app.api.rate_limit import rate_limit
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
    request_to_api_dict,
    requests_to_api_dicts,
)
from app.manager_request_activity import list_partner_activity
from app.manager_request_intake import create_manager_request, manager_id_for_email

router = APIRouter()

_limit_submit = rate_limit("manager_submit", max_requests=20, window_seconds=3600, user_dep=require_manager)
_limit_duplicate = rate_limit("manager_duplicate", max_requests=120, window_seconds=60, user_dep=require_manager)
_limit_search = rate_limit("manager_search", max_requests=60, window_seconds=60, user_dep=require_manager)
_limit_match = rate_limit("manager_match", max_requests=120, window_seconds=60, user_dep=require_manager)
_limit_directory = rate_limit("manager_directory", max_requests=100, window_seconds=300, user_dep=require_manager)

_REASON_RANK = {
    "Email": 6,
    "Name + location": 5,
    "Name": 4,
    "Email + location": 3,
    "First name + location": 2,
    "Last name + location": 1,
}

_ACTIVE_PERSON_STATUS = "Added"


def _handled_directory_query(db: Session):
    return db.query(models.ManagerRequest).filter(
        models.ManagerRequest.status == "handled",
        models.ManagerRequest.outcome.isnot(None),
    )


def _active_directory_query(db: Session):
    return _handled_directory_query(db).filter(models.ManagerRequest.outcome == _ACTIVE_PERSON_STATUS)


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
    if email:
        match = (
            _handled_directory_query(db)
            .filter(func.lower(models.ManagerRequest.person_email) == email)
            .order_by(models.ManagerRequest.handled_at.desc())
            .first()
        )
        if match:
            return match

    if first_name and last_name:
        name_q = _handled_directory_query(db).filter(
            func.lower(models.ManagerRequest.person_first_name) == first_name,
            func.lower(models.ManagerRequest.person_last_name) == last_name,
        )
        if location:
            match = name_q.filter(func.lower(models.ManagerRequest.person_location) == location).first()
            if match:
                return match
        match = name_q.first()
        if match:
            return match

    if location and not first_name and not last_name and email:
        match = (
            _handled_directory_query(db)
            .filter(
                func.lower(models.ManagerRequest.person_email) == email,
                func.lower(models.ManagerRequest.person_location) == location,
            )
            .first()
        )
        if match:
            return match

    return None


def _find_related_people(
    db: Session,
    *,
    email: str,
    first_name: str,
    last_name: str,
    location: str,
) -> list[tuple[models.ManagerRequest, set[str]]]:
    """Return all directory rows that share any form field (or field + location)."""
    results: dict[str, tuple[models.ManagerRequest, set[str]]] = {}

    def add(row: models.ManagerRequest | None, reason: str) -> None:
        if row is None or row.outcome != _ACTIVE_PERSON_STATUS:
            return
        if row.id not in results:
            results[row.id] = (row, set())
        results[row.id][1].add(reason)

    def add_all(rows: list[models.ManagerRequest], reason: str) -> None:
        for row in rows:
            add(row, reason)

    if email:
        add_all(
            _active_directory_query(db).filter(func.lower(models.ManagerRequest.person_email) == email).all(),
            "Email",
        )

    if first_name and last_name:
        add_all(
            _active_directory_query(db)
            .filter(
                func.lower(models.ManagerRequest.person_first_name) == first_name,
                func.lower(models.ManagerRequest.person_last_name) == last_name,
            )
            .all(),
            "Name",
        )

    if first_name and location:
        add_all(
            _active_directory_query(db)
            .filter(
                func.lower(models.ManagerRequest.person_first_name) == first_name,
                func.lower(models.ManagerRequest.person_location) == location,
            )
            .all(),
            "First name + location",
        )

    if last_name and location:
        add_all(
            _active_directory_query(db)
            .filter(
                func.lower(models.ManagerRequest.person_last_name) == last_name,
                func.lower(models.ManagerRequest.person_location) == location,
            )
            .all(),
            "Last name + location",
        )

    if email and location:
        add_all(
            _active_directory_query(db)
            .filter(
                func.lower(models.ManagerRequest.person_email) == email,
                func.lower(models.ManagerRequest.person_location) == location,
            )
            .all(),
            "Email + location",
        )

    if first_name and last_name and location:
        add_all(
            _active_directory_query(db)
            .filter(
                func.lower(models.ManagerRequest.person_first_name) == first_name,
                func.lower(models.ManagerRequest.person_last_name) == last_name,
                func.lower(models.ManagerRequest.person_location) == location,
            )
            .all(),
            "Name + location",
        )

    reason_rank = _REASON_RANK

    def sort_key(item: tuple[models.ManagerRequest, set[str]]) -> tuple:
        row, reasons = item
        best_reason = max((reason_rank.get(r, 0) for r in reasons), default=0)
        added = row.handled_at
        if added is None:
            added = datetime.min.replace(tzinfo=timezone.utc)
        return (-len(reasons), -best_reason, added)

    return sorted(results.values(), key=sort_key)


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
    pattern = f"%{query}%"
    return (
        _active_directory_query(db)
        .filter(
            or_(
                func.lower(models.ManagerRequest.person_first_name).like(pattern),
                func.lower(models.ManagerRequest.person_last_name).like(pattern),
                func.lower(models.ManagerRequest.person_email).like(pattern),
                func.lower(func.coalesce(models.ManagerRequest.person_location, "")).like(pattern),
            )
        )
        .order_by(models.ManagerRequest.handled_at.desc())
        .limit(limit)
        .all()
    )

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
    rows = (
        _handled_directory_query(db)
        .order_by(models.ManagerRequest.handled_at.desc())
        .all()
    )
    return directory_rows_to_api_dicts(db, rows)

@router.get("/api/kpis", response_model=schemas.KpiOut)
def get_kpis(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    pending = db.query(models.ManagerRequest).filter(models.ManagerRequest.status == "new").count()
    users = _handled_directory_query(db).count()
    return {"pendingRequests": pending, "usersInLedger": users}


@router.get("/api/dashboard", response_model=schemas.DashboardOut)
def get_dashboard(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    pending = (
        db.query(models.ManagerRequest)
        .filter(models.ManagerRequest.status == "new")
        .order_by(request_id_numeric_desc())
        .all()
    )
    hydrate_request_display(pending)
    users = _handled_directory_query(db).count()
    return {
        "kpis": {
            "pendingRequests": len(pending),
            "usersInLedger": users,
        },
        "pendingRequests": requests_to_api_dicts(db, pending),
        "activity": list_partner_activity(db, limit=10),
    }

@router.get("/api/activity", response_model=List[schemas.ActivityOut])
def get_activity(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    return list_partner_activity(db, limit=10)


def _assert_manager_submitter(submitted_by: schemas.SubmittedBy, manager) -> None:
    sub_email = (submitted_by.email or "").strip()
    if auth_is_required() and sub_email.lower() != manager.email.lower():
        raise HTTPException(
            status_code=403,
            detail="Submitter email must match your signed-in account.",
        )


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
    return create_manager_request(
        db,
        person=person,
        action=action,
        manager_notes=notes,
        manager_user_id=manager_user_id,
        new_id=new_id,
    )


@router.post("/api/requests", response_model=schemas.RequestOut)
def create_request(
    req_in: schemas.RequestIn,
    db: Session = Depends(get_db),
    manager=Depends(_limit_submit),
):
    _assert_manager_submitter(req_in.submittedBy, manager)

    new_request = _create_manager_request_row(
        db,
        submitted_by=req_in.submittedBy,
        person=req_in.person,
        action=req_in.action,
        notes=req_in.notes,
        manager_user_id=manager.id,
    )
    db.commit()
    db.refresh(new_request)
    hydrate_request_display([new_request])
    hydrate_request_users(db, [new_request])
    return request_to_api_dict(new_request)


@router.post("/api/requests/batch", response_model=List[schemas.RequestOut])
def create_requests_batch(
    req_in: schemas.ManagerBatchRequestIn,
    db: Session = Depends(get_db),
    manager=Depends(_limit_submit),
):
    _assert_manager_submitter(req_in.submittedBy, manager)

    request_ids = allocate_request_ids(db, len(req_in.people))
    new_requests = [
        _create_manager_request_row(
            db,
            submitted_by=req_in.submittedBy,
            person=person,
            action=req_in.action,
            notes=req_in.notes,
            new_id=request_id,
            manager_user_id=manager.id,
        )
        for request_id, person in zip(request_ids, req_in.people)
    ]
    db.commit()

    for req in new_requests:
        db.refresh(req)
    hydrate_request_display(new_requests)
    return requests_to_api_dicts(db, new_requests)

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
        db.query(models.ManagerRequest)
        .filter(models.ManagerRequest.status == "new")
        .order_by(request_id_numeric_desc())
        .all()
    )
    hydrate_request_display(db_requests)
    directory = (
        _handled_directory_query(db)
        .order_by(models.ManagerRequest.handled_at.desc())
        .all()
    )
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
    
    req.status = "handled"
    req.handled_at = datetime.now(timezone.utc)
    req.outcome = outcome
    if admin.id != "dev-bypass":
        req.handled_by_admin_id = admin.id
    if payload.adminNote:
        req.admin_notes = payload.adminNote

    db.commit()
    db.refresh(req)
    hydrate_request_display([req])
    hydrate_request_users(db, [req])
    return request_to_api_dict(req)

@router.post("/api/admin/requests/manual", response_model=List[schemas.RequestOut])
def create_manual_requests(req_in: schemas.ManualRequestIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    manual_submitter = schemas.SubmittedBy(
        firstName=req_in.submittedBy.firstName,
        lastName=req_in.submittedBy.lastName,
        email=req_in.submittedBy.email,
        club="Manual entry",
    )
    request_ids = allocate_request_ids(db, len(req_in.people))

    new_requests = [
        _create_manager_request_row(
            db,
            submitted_by=manual_submitter,
            person=person_in,
            action=req_in.action,
            notes=req_in.notes,
            new_id=new_id,
        )
        for new_id, person_in in zip(request_ids, req_in.people)
    ]

    db.commit()

    for req in new_requests:
        db.refresh(req)
    hydrate_request_display(new_requests)
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


@router.get("/api/manager/persons/directory", response_model=List[schemas.PersonSearchOut])
def manager_person_directory(
    db: Session = Depends(get_db),
    _manager=Depends(_limit_directory),
):
    """Active directory snapshot for instant client-side search on the manager form."""
    rows = (
        _active_directory_query(db)
        .order_by(models.ManagerRequest.handled_at.desc())
        .limit(1000)
        .all()
    )
    return [_person_search_row(row) for row in rows]


@router.get("/api/manager/persons/search", response_model=List[schemas.PersonSearchOut])
def search_persons_for_manager(
    q: str = "",
    limit: int = 5,
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

    capped = min(max(limit, 1), 10)
    people = _search_people(db, query, limit=capped)
    return [_person_search_row(person) for person in people]
