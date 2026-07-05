"""Create manager_requests rows (portal + automated email intake)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.manager_request_tags import TAG_ALREADY_EXISTS
from app.request_display import allocate_request_ids


def _handled_directory_query(db: Session):
    return db.query(models.ManagerRequest).filter(
        models.ManagerRequest.status == "handled",
        models.ManagerRequest.outcome.isnot(None),
    )


def duplicate_tags_for_person(db: Session, person: schemas.PersonInfo) -> List[str]:
    tags: List[str] = []
    p_email = (person.email or "").strip().lower()
    p_first = (person.firstName or "").strip().lower()
    p_last = (person.lastName or "").strip().lower()

    duplicate = False
    if p_email:
        duplicate = (
            _handled_directory_query(db)
            .filter(func.lower(models.ManagerRequest.person_email) == p_email)
            .first()
            is not None
        )

    if not duplicate and p_first and p_last:
        duplicate = (
            _handled_directory_query(db)
            .filter(
                func.lower(models.ManagerRequest.person_first_name) == p_first,
                func.lower(models.ManagerRequest.person_last_name) == p_last,
            )
            .first()
            is not None
        )

    if duplicate:
        tags.append(TAG_ALREADY_EXISTS)
    return tags


def manager_id_for_email(db: Session, email: str) -> Optional[str]:
    normalized = (email or "").strip().lower()
    if not normalized:
        return None
    linked = (
        db.query(models.PowermusicUser)
        .filter(
            func.lower(models.PowermusicUser.email) == normalized,
            models.PowermusicUser.role == "manager",
        )
        .first()
    )
    return str(linked.id) if linked else None


def build_tags(
    db: Session,
    person: schemas.PersonInfo,
    *,
    extra_tags: Optional[List[str]] = None,
) -> List[str]:
    tags = list(extra_tags or [])
    for tag in duplicate_tags_for_person(db, person):
        if tag not in tags:
            tags.append(tag)
    return tags


def create_manager_request(
    db: Session,
    *,
    person: schemas.PersonInfo,
    action: str,
    manager_notes: Optional[str] = None,
    manager_user_id: Optional[str] = None,
    manager_id: Optional[str] = None,
    extra_tags: Optional[List[str]] = None,
    new_id: Optional[str] = None,
    received_at: Optional[datetime] = None,
    source_email_id: Optional[str] = None,
    source_gmail_message_id: Optional[str] = None,
) -> models.ManagerRequest:
    if source_gmail_message_id:
        existing = (
            db.query(models.ManagerRequest)
            .filter(models.ManagerRequest.source_gmail_message_id == source_gmail_message_id)
            .first()
        )
        if existing:
            return existing

    if source_email_id:
        existing = (
            db.query(models.ManagerRequest)
            .filter(models.ManagerRequest.source_email_id == source_email_id)
            .first()
        )
        if existing:
            return existing

    resolved_manager_id = manager_id
    if resolved_manager_id is None and manager_user_id and manager_user_id != "dev-bypass":
        resolved_manager_id = manager_user_id

    row = models.ManagerRequest(
        id=new_id or allocate_request_ids(db, 1)[0],
        received_at=received_at or datetime.now(timezone.utc),
        manager_id=resolved_manager_id,
        person_first_name=person.firstName,
        person_last_name=person.lastName,
        person_email=person.email,
        person_location=person.location or "",
        action=action,
        manager_notes=manager_notes,
        tags=build_tags(db, person, extra_tags=extra_tags),
        status="new",
        source_email_id=source_email_id,
        source_gmail_message_id=source_gmail_message_id,
    )
    db.add(row)
    return row
