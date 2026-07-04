from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app import models
from app import schemas
from app.api.auth import require_admin, require_manager, auth_is_required
from app.api.rate_limit import rate_limit
from app.input_validation import normalize_search_query
from app.api.dependencies import get_db
from app.display import assign_display_ids

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


def _active_people_query(db: Session):
    return db.query(models.Person).filter(models.Person.status == _ACTIVE_PERSON_STATUS)


def _person_search_row(person: models.Person) -> dict:
    return {
        "id": person.id,
        "firstName": person.first_name,
        "lastName": person.last_name,
        "email": person.email,
        "location": person.location,
        "status": person.status,
        "dateAdded": person.date_added,
    }


def _duplicate_response(person: models.Person) -> dict:
    return {
        "duplicate": True,
        "id": person.id,
        "firstName": person.first_name,
        "lastName": person.last_name,
        "email": person.email,
        "status": person.status,
        "dateAdded": person.date_added,
        "location": person.location,
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
) -> models.Person | None:
    if email:
        match = db.query(models.Person).filter(func.lower(models.Person.email) == email).first()
        if match:
            return match

    if first_name and last_name:
        name_q = db.query(models.Person).filter(
            func.lower(models.Person.first_name) == first_name,
            func.lower(models.Person.last_name) == last_name,
        )
        if location:
            match = name_q.filter(func.lower(models.Person.location) == location).first()
            if match:
                return match
        match = name_q.first()
        if match:
            return match

    if location and not first_name and not last_name and email:
        match = (
            db.query(models.Person)
            .filter(
                func.lower(models.Person.email) == email,
                func.lower(models.Person.location) == location,
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
) -> list[tuple[models.Person, set[str]]]:
    """Return all directory rows that share any form field (or field + location)."""
    results: dict[str, tuple[models.Person, set[str]]] = {}

    def add(person: models.Person | None, reason: str) -> None:
        if person is None or person.status != _ACTIVE_PERSON_STATUS:
            return
        if person.id not in results:
            results[person.id] = (person, set())
        results[person.id][1].add(reason)

    def add_all(people: list[models.Person], reason: str) -> None:
        for person in people:
            add(person, reason)

    if email:
        add_all(
            _active_people_query(db).filter(func.lower(models.Person.email) == email).all(),
            "Email",
        )

    if first_name and last_name:
        add_all(
            _active_people_query(db)
            .filter(
                func.lower(models.Person.first_name) == first_name,
                func.lower(models.Person.last_name) == last_name,
            )
            .all(),
            "Name",
        )

    if first_name and location:
        add_all(
            _active_people_query(db)
            .filter(
                func.lower(models.Person.first_name) == first_name,
                func.lower(models.Person.location) == location,
            )
            .all(),
            "First name + location",
        )

    if last_name and location:
        add_all(
            _active_people_query(db)
            .filter(
                func.lower(models.Person.last_name) == last_name,
                func.lower(models.Person.location) == location,
            )
            .all(),
            "Last name + location",
        )

    if email and location:
        add_all(
            _active_people_query(db)
            .filter(
                func.lower(models.Person.email) == email,
                func.lower(models.Person.location) == location,
            )
            .all(),
            "Email + location",
        )

    if first_name and last_name and location:
        add_all(
            _active_people_query(db)
            .filter(
                func.lower(models.Person.first_name) == first_name,
                func.lower(models.Person.last_name) == last_name,
                func.lower(models.Person.location) == location,
            )
            .all(),
            "Name + location",
        )

    reason_rank = _REASON_RANK

    def sort_key(item: tuple[models.Person, set[str]]) -> tuple:
        person, reasons = item
        best_reason = max((reason_rank.get(r, 0) for r in reasons), default=0)
        added = person.date_added
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


def _search_people(db: Session, query: str, *, limit: int) -> list[models.Person]:
    pattern = f"%{query}%"
    return (
        _active_people_query(db)
        .filter(
            or_(
                func.lower(models.Person.first_name).like(pattern),
                func.lower(models.Person.last_name).like(pattern),
                func.lower(models.Person.email).like(pattern),
                func.lower(func.coalesce(models.Person.location, "")).like(pattern),
            )
        )
        .order_by(models.Person.date_added.desc())
        .limit(limit)
        .all()
    )

@router.get("/api/requests", response_model=List[schemas.RequestOut])
def get_requests(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    db_requests = (
        db.query(models.Request)
        .order_by(models.Request.received_at.desc())
        .all()
    )
    assign_display_ids(
        db_requests,
        status_attr="status",
        date_attr="received_at",
    )
    return db_requests

@router.get("/api/persons", response_model=List[schemas.PersonOut])
def get_people(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    people = (
        db.query(models.Person)
        .order_by(models.Person.date_added.desc())
        .all()
    )
    assign_display_ids(
        people,
        status_attr="status",
        date_attr="date_added",
    )
    return people

@router.get("/api/kpis", response_model=schemas.KpiOut)
def get_kpis(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    pending = db.query(models.Request).filter(models.Request.status == "new").count()
    users = db.query(models.Person).count()
    return {"pendingRequests": pending, "usersInLedger": users}


@router.get("/api/dashboard", response_model=schemas.DashboardOut)
def get_dashboard(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    pending = (
        db.query(models.Request)
        .filter(models.Request.status == "new")
        .order_by(models.Request.received_at.desc())
        .all()
    )
    assign_display_ids(pending, status_attr="status", date_attr="received_at")
    activity = (
        db.query(models.Activity)
        .order_by(models.Activity.timestamp.desc())
        .limit(10)
        .all()
    )
    users = db.query(models.Person).count()
    return {
        "kpis": {
            "pendingRequests": len(pending),
            "usersInLedger": users,
        },
        "pendingRequests": pending,
        "activity": activity,
    }

@router.get("/api/activity", response_model=List[schemas.ActivityOut])
def get_activity(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    return db.query(models.Activity).order_by(models.Activity.timestamp.desc()).limit(10).all()

@router.post("/api/requests", response_model=schemas.RequestOut)
def create_request(
    req_in: schemas.RequestIn,
    db: Session = Depends(get_db),
    manager=Depends(_limit_submit),
):
    # Submitter must match the signed-in manager (prevents impersonation).
    sub_email = (req_in.submittedBy.email or "").strip()
    if auth_is_required() and sub_email.lower() != manager.email.lower():
        raise HTTPException(
            status_code=403,
            detail="Submitter email must match your signed-in account.",
        )

    # 2. Duplicate check
    tags = []
    p_email = (req_in.person.email or "").strip().lower()
    p_first = (req_in.person.firstName or "").strip().lower()
    p_last = (req_in.person.lastName or "").strip().lower()
    
    duplicate = False
    if p_email:
        dup_email = db.query(models.Person).filter(func.lower(models.Person.email) == p_email).first()
        if dup_email:
            duplicate = True
    
    if not duplicate and p_first and p_last:
        dup_name = db.query(models.Person).filter(
            func.lower(models.Person.first_name) == p_first,
            func.lower(models.Person.last_name) == p_last
        ).first()
        if dup_name:
            duplicate = True
            
    if duplicate:
        tags.append("Already Exists")
        
    # Generate ID "req-XXX"
    all_ids = db.query(models.Request.id).all()
    max_num = 0
    for (rid,) in all_ids:
        if rid and rid.startswith("req-"):
            try:
                num = int(rid.split("-")[1])
                if num > max_num:
                    max_num = num
            except ValueError:
                pass
    new_id = f"req-{max_num + 1:03d}"
    
    created_by_name = f"{req_in.submittedBy.firstName or ''} {req_in.submittedBy.lastName or ''}".strip()
    
    new_request = models.Request(
        id=new_id,
        received_at=datetime.now(timezone.utc),
        submitted_by_first_name=req_in.submittedBy.firstName,
        submitted_by_last_name=req_in.submittedBy.lastName,
        submitted_by_email=req_in.submittedBy.email,
        submitted_by_club=req_in.submittedBy.club,
        person_first_name=req_in.person.firstName,
        person_last_name=req_in.person.lastName,
        person_email=req_in.person.email,
        person_location=req_in.person.location,
        action=req_in.action,
        notes=req_in.notes,
        tags=tags,
        created_by=created_by_name,
        status="new"
    )
    db.add(new_request)
    
    # Activity logging
    act_submitted = models.Activity(
        timestamp=new_request.received_at,
        type="request_submitted",
        description=f"Request submitted by {created_by_name}",
        linked_request_id=new_id
    )
    db.add(act_submitted)
    if "Already Exists" in tags:
        act_tag = models.Activity(
            timestamp=new_request.received_at,
            type="tag_applied",
            description="Duplicate detection: 'Already Exists' tag applied.",
            linked_request_id=new_id
        )
        db.add(act_tag)

    db.commit()
    db.refresh(new_request)
    
    new_request.displayId = 1
    return new_request

@router.get("/api/admin/requests", response_model=List[schemas.RequestOut])
def get_admin_requests(status: Optional[str] = None, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    query = db.query(models.Request)
    if status:
        query = query.filter(models.Request.status == status)
    
    if status == "handled":
        db_requests = query.order_by(models.Request.handled_at.desc()).all()
        assign_display_ids(db_requests, status_attr="status", date_attr="handled_at")
    else:
        db_requests = query.order_by(models.Request.received_at.desc()).all()
        assign_display_ids(db_requests, status_attr="status", date_attr="received_at")
        
    return db_requests

@router.get("/api/admin/requests/page", response_model=schemas.NewRequestsPageOut)
def get_new_requests_page(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    db_requests = (
        db.query(models.Request)
        .filter(models.Request.status == "new")
        .order_by(models.Request.received_at.desc())
        .all()
    )
    assign_display_ids(db_requests, status_attr="status", date_attr="received_at")
    people = (
        db.query(models.Person)
        .order_by(models.Person.date_added.desc())
        .all()
    )
    assign_display_ids(people, status_attr="status", date_attr="date_added")
    return {"requests": db_requests, "persons": people}

@router.post("/api/admin/requests/{request_id}/mark-handled", response_model=schemas.RequestOut)
def mark_request_handled(request_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    req = db.query(models.Request).filter(models.Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
        
    if req.status == "handled":
        return req
        
    outcome = "Added" if req.action == "Add" else "Removed"
    
    req.status = "handled"
    req.handled_at = datetime.now(timezone.utc)
    
    current_tags = list(req.tags) if req.tags else []
    if outcome not in current_tags:
        current_tags.append(outcome)
    req.tags = current_tags
    
    person_email = (req.person_email or "").strip().lower()
    
    person = None
    if person_email:
        person = db.query(models.Person).filter(func.lower(models.Person.email) == person_email).first()
        
    if outcome == "Added":
        if person:
            person.status = "Added"
            person.date_added = req.handled_at
            person.source_request_id = req.id
            person.first_name = req.person_first_name
            person.last_name = req.person_last_name
            person.location = req.person_location
        else:
            all_people_ids = db.query(models.Person.id).all()
            max_p_num = 0
            for (pid,) in all_people_ids:
                if pid and pid.startswith("ul-"):
                    try:
                        max_p_num = max(max_p_num, int(pid.split("-")[1]))
                    except ValueError:
                        pass
            new_pid = f"ul-{max_p_num + 1:03d}"
            person = models.Person(
                id=new_pid,
                first_name=req.person_first_name,
                last_name=req.person_last_name,
                email=req.person_email,
                location=req.person_location,
                status="Added",
                date_added=req.handled_at,
                added_by=req.created_by,
                manager_email=req.submitted_by_email,
                club=req.submitted_by_club,
                source_request_id=req.id,
                notes=""
            )
            db.add(person)
    else: # outcome == "Removed"
        if person:
            person.status = "Removed"
            person.date_added = req.handled_at
        else:
            all_people_ids = db.query(models.Person.id).all()
            max_p_num = 0
            for (pid,) in all_people_ids:
                if pid and pid.startswith("ul-"):
                    try:
                        max_p_num = max(max_p_num, int(pid.split("-")[1]))
                    except ValueError:
                        pass
            new_pid = f"ul-{max_p_num + 1:03d}"
            person = models.Person(
                id=new_pid,
                first_name=req.person_first_name,
                last_name=req.person_last_name,
                email=req.person_email,
                location=req.person_location,
                status="Removed",
                date_added=req.handled_at,
                added_by=req.created_by,
                manager_email=req.submitted_by_email,
                club=req.submitted_by_club,
                source_request_id=req.id,
                notes="Legacy removal"
            )
            db.add(person)
            
    # Activity logging
    act_type = "marked_added" if outcome == "Added" else "marked_removed"
    act_handled = models.Activity(
        timestamp=req.handled_at,
        type=act_type,
        description=f"Request marked as {outcome}.",
        linked_request_id=req.id
    )
    db.add(act_handled)

    db.commit()
    db.refresh(req)
    req.displayId = 0
    return req

@router.post("/api/admin/requests/manual", response_model=List[schemas.RequestOut])
def create_manual_requests(req_in: schemas.ManualRequestIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    all_ids = db.query(models.Request.id).all()
    max_num = 0
    for (rid,) in all_ids:
        if rid and rid.startswith("req-"):
            try:
                max_num = max(max_num, int(rid.split("-")[1]))
            except ValueError:
                pass
                
    new_requests = []
    created_by_name = "Andrea (Admin)"
    
    for i, person_in in enumerate(req_in.people):
        new_id = f"req-{max_num + 1 + i:03d}"
        new_req = models.Request(
            id=new_id,
            received_at=datetime.now(timezone.utc),
            submitted_by_first_name=req_in.submittedBy.firstName,
            submitted_by_last_name=req_in.submittedBy.lastName,
            submitted_by_email=req_in.submittedBy.email,
            submitted_by_club="Manual entry",
            person_first_name=person_in.firstName,
            person_last_name=person_in.lastName,
            person_email=person_in.email,
            person_location=person_in.location,
            action=req_in.action,
            notes=req_in.notes,
            tags=[],
            created_by=created_by_name,
            status="new"
        )
        db.add(new_req)
        new_requests.append(new_req)
        
        act_submitted = models.Activity(
            timestamp=new_req.received_at,
            type="request_submitted",
            description=f"Manual request submitted by {created_by_name}",
            linked_request_id=new_id
        )
        db.add(act_submitted)

    db.commit()
    
    for req in new_requests:
        db.refresh(req)
        req.displayId = 0
        
    return new_requests


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
    people = (
        _active_people_query(db)
        .order_by(models.Person.date_added.desc())
        .limit(1000)
        .all()
    )
    return [_person_search_row(person) for person in people]


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
