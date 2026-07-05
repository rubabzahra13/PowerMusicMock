"""PureGym automated roster emails → manager_requests (not the email queue)."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Literal, Optional

from sqlalchemy.orm import Session

from app import models, schemas
from app.manager_request_intake import create_manager_request
from app.manager_request_tags import TAG_AUTOMATED_EMAIL

logger = logging.getLogger(__name__)

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


def _is_puregym_sender(from_email: str, from_name: str = "") -> bool:
    email = (from_email or "").strip().lower()
    name = (from_name or "").strip().lower()
    if "puregym" in email or email.endswith("@puregym.com"):
        return True
    return name == "puregym" or "puregym" in name


def classify_puregym_roster_email(
    from_email: str,
    subject: str,
    body: str,
    *,
    from_name: str = "",
) -> Optional[Literal["Add", "Remove"]]:
    """Match the two known PureGym automated notification formats."""
    subj = _norm_subject(subject)
    sender = (from_email or "").strip().lower()

    if REMOVE_SUBJECT in subj and sender == PUREGYM_LEAVER_SENDER:
        return "Remove"

    if ADD_SUBJECT in subj and _is_puregym_sender(from_email, from_name):
        return "Add"

    return None


def parse_labelled_roster_body(
    body: str,
    *,
    action: Literal["Add", "Remove"],
) -> Optional[schemas.PersonInfo]:
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


def is_puregym_roster_notification(
    from_email: str,
    subject: str,
    body: str,
    *,
    from_name: str = "",
) -> bool:
    return classify_puregym_roster_email(
        from_email,
        subject,
        body,
        from_name=from_name,
    ) is not None


# Backward-compatible alias used by sync.py
def looks_like_puregym_roster_email(
    from_email: str,
    subject: str,
    body: str,
    *,
    is_automated: bool = False,
    from_name: str = "",
) -> bool:
    return is_puregym_roster_notification(
        from_email,
        subject,
        body,
        from_name=from_name,
    )


def parse_puregym_roster_email(
    subject: str,
    body: str,
    *,
    sender_email: str,
    from_name: str = "",
) -> Optional[tuple[schemas.PersonInfo, Literal["Add", "Remove"]]]:
    action = classify_puregym_roster_email(
        sender_email,
        subject,
        body,
        from_name=from_name,
    )
    if action is None:
        return None
    person = parse_labelled_roster_body(body, action=action)
    if person is None:
        return None
    return person, action


def _manager_notes(subject: str, body: str, action: str) -> str:
    leave = _LEAVE_DATE_RE.search(body or "")
    parts = [f"Automated PureGym email — {action}", f"Subject: {subject.strip()}"]
    if leave:
        parts.append(f"Leave date: {_clean_field(leave.group(1))}")
    return "\n".join(parts)


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
    """Create a manager_request and return True if this message was consumed."""
    parsed = parse_puregym_roster_email(
        subject,
        body,
        sender_email=from_email,
        from_name=from_name,
    )
    if parsed is None:
        if is_puregym_roster_notification(from_email, subject, body, from_name=from_name):
            logger.warning(
                "PureGym roster notification matched but body could not be parsed (%s)",
                subject,
            )
            return True
        return False

    person, action = parsed
    create_manager_request(
        db,
        person=person,
        action=action,
        manager_notes=_manager_notes(subject, body, action),
        extra_tags=[TAG_AUTOMATED_EMAIL],
        received_at=received_at,
        source_gmail_message_id=gmail_message_id,
    )
    return True


def try_intake_automated_person_request(
    db: Session,
    email: models.Email,
    *,
    is_automated: bool = False,
) -> Optional[models.ManagerRequest]:
    """Legacy path when an emails row already exists (ingest API / re-processing)."""
    if not intake_puregym_roster_message(
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
