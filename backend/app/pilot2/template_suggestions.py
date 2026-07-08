"""Create template suggestions from Andrea's sends and distiller revisions."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app import models

_MIN_REPLY_CHARS = 80
_SUBJECT_PREFIX_RE = re.compile(r"^(re|fwd|fw):\s*", re.IGNORECASE)


def clean_email_subject(subject: str) -> str:
    text = (subject or "").strip()
    while True:
        match = _SUBJECT_PREFIX_RE.match(text)
        if not match:
            break
        text = text[match.end() :].strip()
    return text or "General enquiry"


def suggest_template_name(intent: str | None, subject: str) -> str:
    clean = clean_email_subject(subject)
    label = (intent or "Enquiry").strip()
    snippet = clean[:48].strip() or "Reply"
    return f"{label}: {snippet}"


def suggest_template_subject(subject: str) -> str:
    clean = clean_email_subject(subject)
    return clean[:200]


def _reply_is_substantial(final_body: str) -> bool:
    return len((final_body or "").strip()) >= _MIN_REPLY_CHARS


def maybe_suggest_new_template(
    db: Session,
    email: models.Email,
    final_body: str,
) -> bool:
    """Queue a new-template suggestion when Andrea sent a reply with no template match."""
    if email.template_ids:
        return False
    if not _reply_is_substantial(final_body):
        return False

    existing = (
        db.query(models.TemplateSuggestion)
        .filter(
            models.TemplateSuggestion.kind == "new",
            models.TemplateSuggestion.source_email_id == email.id,
            models.TemplateSuggestion.status == "pending",
        )
        .first()
    )
    if existing:
        return False

    now = datetime.now(timezone.utc)
    db.add(
        models.TemplateSuggestion(
            kind="new",
            template_id=None,
            source_email_id=email.id,
            account_email=email.account_email,
            intent=email.intent or "Enquiry",
            suggested_name=suggest_template_name(email.intent, email.subject),
            suggested_subject=suggest_template_subject(email.subject),
            suggested_body=final_body.strip(),
            rationale=(
                "Andrea wrote this reply without a matching template. "
                f"Source: {clean_email_subject(email.subject)}"
            ),
            status="pending",
            created_at=now,
        )
    )
    return True
