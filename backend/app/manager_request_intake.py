"""Create manager_requests rows (portal + automated email intake)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app import models, schemas
from app.directory_person_match import duplicate_tags_for_person
from app.manager_request_tags import (
    MANAGER_SUBMIT_TAGS,
    TAG_AUTO_MAIL,
    TAG_PARTNER_REQUEST,
    TAG_UNVERIFIED,
    TAG_VERIFIED,
    has_tag,
    merge_tags,
    normalize_tags,
)
from app.intake_persons import apply_person_to_row, set_auto_mail_meta, sync_display_person
from app.person_match import same_person
from app.manager_request_stats import increment_manager_request_stats
from app.request_display import allocate_request_ids


def _new_requests_query(db: Session):
    return db.query(models.ManagerRequest).filter(models.ManagerRequest.status == "new")


def manager_id_for_email(db: Session, email: str) -> Optional[str]:
    from sqlalchemy import func

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
    action: str,
    extra_tags: Optional[List[str]] = None,
) -> List[str]:
    return merge_tags(extra_tags, duplicate_tags_for_person(db, person, action=action))


def find_unverified_auto_mail_match(
    db: Session,
    person: schemas.PersonInfo,
    action: str,
) -> Optional[models.ManagerRequest]:
    candidates = (
        _new_requests_query(db)
        .filter(
            models.ManagerRequest.action == action,
            models.ManagerRequest.tags.contains([TAG_UNVERIFIED]),
            models.ManagerRequest.tags.contains([TAG_AUTO_MAIL]),
        )
        .all()
    )
    for row in candidates:
        if same_person(row, person):
            return row
    return None


def find_verified_new_match(
    db: Session,
    person: schemas.PersonInfo,
    action: str,
) -> Optional[models.ManagerRequest]:
    candidates = (
        _new_requests_query(db)
        .filter(
            models.ManagerRequest.action == action,
            models.ManagerRequest.tags.contains([TAG_VERIFIED]),
        )
        .all()
    )
    for row in candidates:
        if same_person(row, person):
            return row
    return None


def attach_auto_mail_to_request(
    db: Session,
    req: models.ManagerRequest,
    *,
    person: schemas.PersonInfo,
    manager_notes: Optional[str] = None,
    from_email: Optional[str] = None,
    received_at: Optional[datetime] = None,
    subject: Optional[str] = None,
    inbox_email: Optional[str] = None,
) -> models.ManagerRequest:
    apply_person_to_row(req, person, source="autoMail")
    # Never write roster auto text into manager_notes — that field is only for
    # notes the manager entered on the form.
    set_auto_mail_meta(
        req,
        from_email=from_email or "",
        received_at=received_at,
        subject=subject or "",
        inbox_email=inbox_email or "",
        details=(manager_notes or "").strip(),
    )
    if _looks_like_automated_notes(req.manager_notes):
        req.manager_notes = None
    req.tags = merge_tags(
        req.tags,
        [TAG_AUTO_MAIL],
        duplicate_tags_for_person(db, person, action=req.action),
    )
    sync_display_person(req)
    return req


def _looks_like_automated_notes(raw: Optional[str]) -> bool:
    text = (raw or "").strip().lower()
    if not text:
        return False
    return (
        text.startswith("automated roster email")
        or text.startswith("automated puregym email")
        or text.startswith("seed:")
    )


def verify_unverified_request(
    db: Session,
    req: models.ManagerRequest,
    *,
    person: schemas.PersonInfo,
    manager_id: Optional[str],
    manager_notes: Optional[str] = None,
) -> models.ManagerRequest:
    req.manager_id = manager_id
    apply_person_to_row(req, person, source="partner")
    # Keep form notes only. Existing auto-generated text stays out of manager_notes.
    if _looks_like_automated_notes(req.manager_notes):
        req.manager_notes = None
    if manager_notes and manager_notes.strip():
        req.manager_notes = manager_notes.strip()

    base = [t for t in (req.tags or []) if t not in {TAG_UNVERIFIED}]
    req.tags = merge_tags(
        base,
        MANAGER_SUBMIT_TAGS,
        duplicate_tags_for_person(db, person, action=req.action),
    )
    sync_display_person(req)
    return req


def intake_manager_submission(
    db: Session,
    *,
    person: schemas.PersonInfo,
    action: str,
    manager_id: Optional[str] = None,
    manager_notes: Optional[str] = None,
    new_id: Optional[str] = None,
) -> models.ManagerRequest:
    """Manager portal / admin manual submit — verifies pending auto-mail or creates verified row."""
    pending = find_unverified_auto_mail_match(db, person, action)
    if pending:
        return verify_unverified_request(
            db,
            pending,
            person=person,
            manager_id=manager_id,
            manager_notes=manager_notes,
        )

    return create_manager_request(
        db,
        person=person,
        action=action,
        manager_notes=manager_notes,
        manager_id=manager_id,
        extra_tags=MANAGER_SUBMIT_TAGS,
        new_id=new_id,
    )


def intake_automated_email_request(
    db: Session,
    *,
    person: schemas.PersonInfo,
    action: str,
    manager_notes: Optional[str] = None,
    received_at: Optional[datetime] = None,
    source_email_id: Optional[str] = None,
    source_gmail_message_id: Optional[str] = None,
    from_email: Optional[str] = None,
    subject: Optional[str] = None,
    inbox_email: Optional[str] = None,
) -> models.ManagerRequest:
    """PureGym auto email — attach to verified row or store as unverified (hidden)."""
    if source_gmail_message_id:
        existing = (
            db.query(models.ManagerRequest)
            .filter(models.ManagerRequest.source_gmail_message_id == source_gmail_message_id)
            .first()
        )
        if existing:
            return existing

    verified = find_verified_new_match(db, person, action)
    if verified:
        if source_gmail_message_id:
            verified.source_gmail_message_id = source_gmail_message_id
        if source_email_id:
            verified.source_email_id = source_email_id
        return attach_auto_mail_to_request(
            db,
            verified,
            person=person,
            manager_notes=manager_notes,
            from_email=from_email,
            received_at=received_at,
            subject=subject,
            inbox_email=inbox_email,
        )

    pending = find_unverified_auto_mail_match(db, person, action)
    if pending:
        return attach_auto_mail_to_request(
            db,
            pending,
            person=person,
            manager_notes=manager_notes,
            from_email=from_email,
            received_at=received_at,
            subject=subject,
            inbox_email=inbox_email,
        )

    row = create_manager_request(
        db,
        person=person,
        action=action,
        manager_notes=None,
        manager_id=None,
        extra_tags=[TAG_UNVERIFIED, TAG_AUTO_MAIL],
        received_at=received_at,
        source_email_id=source_email_id,
        source_gmail_message_id=source_gmail_message_id,
    )
    set_auto_mail_meta(
        row,
        from_email=from_email or "",
        received_at=received_at,
        subject=subject or "",
        inbox_email=inbox_email or "",
        details=(manager_notes or "").strip(),
    )
    return row


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
        tags=build_tags(db, person, action=action, extra_tags=extra_tags),
        status="new",
        source_email_id=source_email_id,
        source_gmail_message_id=source_gmail_message_id,
        intake_persons={},
    )
    normalized_extra = normalize_tags(extra_tags)
    if resolved_manager_id or has_tag(normalized_extra, TAG_PARTNER_REQUEST):
        apply_person_to_row(row, person, source="partner")
    elif has_tag(normalized_extra, TAG_AUTO_MAIL):
        apply_person_to_row(row, person, source="autoMail")
    sync_display_person(row)
    db.add(row)
    return row
