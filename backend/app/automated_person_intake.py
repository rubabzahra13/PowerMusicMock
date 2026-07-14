"""Automated partner roster emails → manager_requests (not the email queue)."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Literal, Optional, Sequence

from sqlalchemy.orm import Session

from app import models, schemas
from app.manager_request_intake import intake_automated_email_request
from app.partner_allowlists import list_automated_sources, sender_matches_automated_sources

logger = logging.getLogger(__name__)

# Legacy PureGym constants kept for tests / docs
PUREGYM_LEAVER_SENDER = "em@myptzone.co"
ADD_SUBJECT = "new puregym user"
REMOVE_SUBJECT = "puregym leaver"

_NAME_RE = re.compile(r"^Name:\s*(.+)$", re.MULTILINE | re.IGNORECASE)
_EMAIL_RE = re.compile(r"^Email:\s*(\S+)$", re.MULTILINE | re.IGNORECASE)
_CLUB_RE = re.compile(r"^Club:\s*(.+)$", re.MULTILINE | re.IGNORECASE)
_LEAVE_DATE_RE = re.compile(r"^Leave date:\s*(.+)$", re.MULTILINE | re.IGNORECASE)


def _norm_subject(subject: str) -> str:
    return re.sub(r"\s+", " ", (subject or "").strip().lower())


def _split_full_name(full_name: str) -> tuple[str, str]:
    text = (full_name or "").strip()
    if not text:
        return "", ""
    parts = text.split(None, 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


def _clean_field(value: str) -> str:
    return (value or "").strip().splitlines()[0].strip().strip(".,;:")


def _resolve_sources(
    *,
    db: Optional[Session] = None,
    sources: Optional[Sequence[models.AutomatedRosterSource]] = None,
) -> Sequence[models.AutomatedRosterSource]:
    if sources is not None:
        return sources
    if db is not None:
        return list_automated_sources(db)
    return ()


def _subject_action(subject: str) -> Optional[Literal["Add", "Remove"]]:
    subj = _norm_subject(subject)
    if "leaver" in subj or ("remove" in subj and "user" in subj):
        return "Remove"
    if "new" in subj and "user" in subj:
        return "Add"
    return None


def classify_roster_email(
    from_email: str,
    subject: str,
    body: str,
    *,
    from_name: str = "",
    db: Optional[Session] = None,
    sources: Optional[Sequence[models.AutomatedRosterSource]] = None,
) -> Optional[Literal["Add", "Remove"]]:
    """Match allowlisted senders against add/remove roster subject patterns."""
    del body, from_name  # body parsed separately; display name not required
    resolved = _resolve_sources(db=db, sources=sources)
    if not resolved:
        return None
    if not sender_matches_automated_sources(from_email, resolved):
        return None
    return _subject_action(subject)


def classify_puregym_roster_email(
    from_email: str,
    subject: str,
    body: str,
    *,
    from_name: str = "",
    db: Optional[Session] = None,
    sources: Optional[Sequence[models.AutomatedRosterSource]] = None,
) -> Optional[Literal["Add", "Remove"]]:
    """Backward-compatible alias for classify_roster_email."""
    return classify_roster_email(
        from_email,
        subject,
        body,
        from_name=from_name,
        db=db,
        sources=sources,
    )


def parse_labelled_roster_body(
    body: str,
    *,
    action: Literal["Add", "Remove"],
) -> Optional[schemas.PersonInfo]:
    del action
    text = body or ""
    name_match = _NAME_RE.search(text)
    email_match = _EMAIL_RE.search(text)
    club_match = _CLUB_RE.search(text)
    if not name_match or not email_match:
        return None

    first, last = _split_full_name(_clean_field(name_match.group(1)))
    person_email = _clean_field(email_match.group(1))
    club = _clean_field(club_match.group(1)) if club_match else ""

    if not person_email:
        return None

    return schemas.PersonInfo(
        firstName=first,
        lastName=last,
        email=person_email,
        location=club,
    )


def is_roster_notification(
    from_email: str,
    subject: str,
    body: str,
    *,
    from_name: str = "",
    db: Optional[Session] = None,
    sources: Optional[Sequence[models.AutomatedRosterSource]] = None,
) -> bool:
    return classify_roster_email(
        from_email,
        subject,
        body,
        from_name=from_name,
        db=db,
        sources=sources,
    ) is not None


def is_puregym_roster_notification(
    from_email: str,
    subject: str,
    body: str,
    *,
    from_name: str = "",
    db: Optional[Session] = None,
    sources: Optional[Sequence[models.AutomatedRosterSource]] = None,
) -> bool:
    return is_roster_notification(
        from_email,
        subject,
        body,
        from_name=from_name,
        db=db,
        sources=sources,
    )


def looks_like_puregym_roster_email(
    from_email: str,
    subject: str,
    body: str,
    *,
    is_automated: bool = False,
    from_name: str = "",
    db: Optional[Session] = None,
    sources: Optional[Sequence[models.AutomatedRosterSource]] = None,
) -> bool:
    del is_automated
    return is_roster_notification(
        from_email,
        subject,
        body,
        from_name=from_name,
        db=db,
        sources=sources,
    )


def parse_roster_email(
    subject: str,
    body: str,
    *,
    sender_email: str,
    from_name: str = "",
    db: Optional[Session] = None,
    sources: Optional[Sequence[models.AutomatedRosterSource]] = None,
) -> Optional[tuple[schemas.PersonInfo, Literal["Add", "Remove"]]]:
    action = classify_roster_email(
        sender_email,
        subject,
        body,
        from_name=from_name,
        db=db,
        sources=sources,
    )
    if action is None:
        return None
    person = parse_labelled_roster_body(body, action=action)
    if person is None:
        return None
    return person, action


def parse_puregym_roster_email(
    subject: str,
    body: str,
    *,
    sender_email: str,
    from_name: str = "",
    db: Optional[Session] = None,
    sources: Optional[Sequence[models.AutomatedRosterSource]] = None,
) -> Optional[tuple[schemas.PersonInfo, Literal["Add", "Remove"]]]:
    return parse_roster_email(
        subject,
        body,
        sender_email=sender_email,
        from_name=from_name,
        db=db,
        sources=sources,
    )


def _manager_notes(subject: str, body: str, action: str) -> str:
    leave = _LEAVE_DATE_RE.search(body or "")
    parts = [f"Automated roster email — {action}", f"Subject: {subject.strip()}"]
    if leave:
        parts.append(f"Leave date: {_clean_field(leave.group(1))}")
    return "\n".join(parts)


def intake_roster_message(
    db: Session,
    *,
    from_email: str,
    from_name: str,
    subject: str,
    body: str,
    received_at: Optional[datetime] = None,
    gmail_message_id: Optional[str] = None,
) -> bool:
    """Create a manager_request and return True if this message was consumed."""
    sources = list_automated_sources(db)
    parsed = parse_roster_email(
        subject,
        body,
        sender_email=from_email,
        from_name=from_name,
        sources=sources,
    )
    if parsed is None:
        if is_roster_notification(
            from_email,
            subject,
            body,
            from_name=from_name,
            sources=sources,
        ):
            logger.warning(
                "Roster notification matched but body could not be parsed (%s)",
                subject,
            )
            return True
        return False

    person, action = parsed
    intake_automated_email_request(
        db,
        person=person,
        action=action,
        manager_notes=_manager_notes(subject, body, action),
        received_at=received_at,
        source_gmail_message_id=gmail_message_id,
    )
    return True


def intake_puregym_roster_message(
    db: Session,
    *,
    from_email: str,
    from_name: str,
    subject: str,
    body: str,
    received_at: Optional[datetime] = None,
    gmail_message_id: Optional[str] = None,
) -> bool:
    return intake_roster_message(
        db,
        from_email=from_email,
        from_name=from_name,
        subject=subject,
        body=body,
        received_at=received_at,
        gmail_message_id=gmail_message_id,
    )


def try_intake_automated_person_request(
    db: Session,
    email: models.Email,
    *,
    is_automated: bool = False,
) -> Optional[models.ManagerRequest]:
    """Legacy path when an emails row already exists (ingest API / re-processing)."""
    del is_automated
    if not intake_roster_message(
        db,
        from_email=email.from_email,
        from_name=email.from_name,
        subject=email.subject,
        body=email.body,
        received_at=email.received_at,
        gmail_message_id=email.gmail_message_id,
    ):
        return None

    if email.gmail_message_id:
        return (
            db.query(models.ManagerRequest)
            .filter(models.ManagerRequest.source_gmail_message_id == email.gmail_message_id)
            .first()
        )
    return (
        db.query(models.ManagerRequest)
        .filter(models.ManagerRequest.source_email_id == email.id)
        .first()
    )


def make_source(*, kind: str, pattern: str) -> models.AutomatedRosterSource:
    """Test helper — lightweight source stand-in without DB."""
    return models.AutomatedRosterSource(
        id="test",
        kind=kind,
        pattern=pattern,
        created_at=datetime.now(timezone.utc),
    )
