from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app import models
from app import schemas
from app.api.dependencies import get_db, verify_admin, verify_manager_or_admin, get_current_user, verify_manager
from app.config import ENFORCE_DOMAIN_CHECK
from app.display import assign_display_ids

router = APIRouter()

@router.get("/api/config")
def get_config():
    return {
        "enforceDomainCheck": ENFORCE_DOMAIN_CHECK
    }

@router.get("/api/auth/me")
def get_me(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = user.get("sub") or user.get("id")
    email = user.get("email")
    
    role_record = db.query(models.UserRole).filter(models.UserRole.user_id == user_id).first()
    if not role_record:
        raise HTTPException(status_code=403, detail="Role not configured in user_roles table")
        
    user_metadata = user.get("user_metadata", {}) or user.get("raw_user_meta_data", {}) or {}
    
    return {
        "uid": user_id,
        "email": email,
        "role": role_record.role,
        "firstName": user_metadata.get("firstName", ""),
        "lastName": user_metadata.get("lastName", ""),
        "club": user_metadata.get("club", "")
    }


@router.get("/api/requests", response_model=List[schemas.RequestOut])
def get_requests(db: Session = Depends(get_db), user: dict = Depends(verify_admin)):
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
def get_people(db: Session = Depends(get_db), user: dict = Depends(verify_manager_or_admin)):
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
def get_kpis(db: Session = Depends(get_db), user: dict = Depends(verify_admin)):
    pending = db.query(models.Request).filter(models.Request.status == "new").count()
    users = db.query(models.Person).count()
    return {"pendingRequests": pending, "usersInLedger": users}

@router.get("/api/activity", response_model=List[schemas.ActivityOut])
def get_activity(db: Session = Depends(get_db), user: dict = Depends(verify_admin)):
    return db.query(models.Activity).order_by(models.Activity.timestamp.desc()).limit(10).all()

@router.post("/api/requests", response_model=schemas.RequestOut)
def create_request(req_in: schemas.RequestIn, db: Session = Depends(get_db), user: dict = Depends(verify_manager)):
    # 1. Validate submitted_by_email ends in @puregym.com
    # ENFORCE_DOMAIN_CHECK loaded from app.config
    
    sub_email = (req_in.submittedBy.email or "").strip()
    if ENFORCE_DOMAIN_CHECK and not sub_email.lower().endswith("@puregym.com"):
        raise HTTPException(status_code=400, detail="Submitter email must be a puregym.com address.")
        
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
def get_admin_requests(status: Optional[str] = None, db: Session = Depends(get_db), user: dict = Depends(verify_admin)):
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

@router.post("/api/admin/requests/{request_id}/mark-handled", response_model=schemas.RequestOut)
def mark_request_handled(request_id: str, db: Session = Depends(get_db), user: dict = Depends(verify_admin)):
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
def create_manual_requests(req_in: schemas.ManualRequestIn, db: Session = Depends(get_db), user: dict = Depends(verify_admin)):
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
