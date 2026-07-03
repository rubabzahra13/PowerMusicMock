"""Email processing pipeline: ingest → classify → compose → persist.

This is the single entry point for new mail whether it arrives from the Gmail
poller or the /ingest endpoint, so both paths behave identically.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app import models
from app.pilot2 import gmail
from app.pilot2.ai import classifier, composer

logger = logging.getLogger(__name__)


def next_id(db: Session, model, prefix: str) -> str:
    max_num = 0
    for (row_id,) in db.query(model.id).all():
        if row_id and row_id.startswith(f"{prefix}-"):
            try:
                max_num = max(max_num, int(row_id.split("-")[1]))
            except ValueError:
                pass
    return f"{prefix}-{max_num + 1:03d}"


def log(db: Session, type_: str, description: str, email_id: Optional[str] = None) -> None:
    db.add(models.ProcessingLog(
        timestamp=datetime.now(timezone.utc),
        type=type_,
        description=description,
        email_id=email_id,
    ))


def process_incoming(
    db: Session,
    *,
    account_email: str,
    from_name: str,
    from_email: str,
    subject: str,
    body: str,
    received_at: Optional[datetime] = None,
    gmail_message_id: Optional[str] = None,
    gmail_thread_id: Optional[str] = None,
) -> models.Email:
    """Run one inbound email through the full pipeline and persist it.

    Idempotent per Gmail message: the scheduler and the manual poll endpoint
    can race, so a message that is already stored is returned as-is.
    """
    if gmail_message_id:
        existing = (
            db.query(models.Email)
            .filter(models.Email.gmail_message_id == gmail_message_id)
            .first()
        )
        if existing:
            return existing

    templates = (
        db.query(models.EmailTemplate)
        .filter(models.EmailTemplate.status == "Active")
        .all()
    )

    classification = classifier.classify(from_name, from_email, subject, body, templates)

    email = models.Email(
        id=next_id(db, models.Email, "email"),
        account_email=account_email,
        gmail_message_id=gmail_message_id,
        gmail_thread_id=gmail_thread_id,
        from_name=from_name,
        from_email=from_email,
        subject=subject,
        body=body,
        received_at=received_at or datetime.now(timezone.utc),
        intent=classification.intent,
        intent_confidence=classification.confidence,
        language=classification.language,
        sender_first_name=classification.sender_first_name,
        urgent=classification.urgent,
    )
    db.add(email)

    if classification.should_ignore:
        email.draft_status = "Ignored"
        email.archived = True
        email.read = True
        log(db, "email_ignored", f"Ignored email from {from_email} (spam/noise).", email.id)
        db.commit()
        db.refresh(email)
        return email

    templates_by_id = {t.id: t for t in templates}
    matched = [templates_by_id[tid] for tid in classification.template_ids if tid in templates_by_id]

    translations_by_template = {}
    if matched and classification.language != "en":
        rows = (
            db.query(models.TemplateTranslation)
            .filter(
                models.TemplateTranslation.template_id.in_([t.id for t in matched]),
                models.TemplateTranslation.language == classification.language,
                models.TemplateTranslation.reviewed.is_(True),
            )
            .all()
        )
        translations_by_template = {(r.template_id, r.language): r for r in rows}

    note = (
        db.query(models.GuidanceNote)
        .filter(models.GuidanceNote.intent == classification.intent)
        .first()
    )
    guidance_rules = list(note.rules) if note else []

    draft = composer.compose(
        body, subject, classification, matched, translations_by_template, guidance_rules
    )

    email.template_ids = [t.id for t in matched]
    email.template_used = matched[0].name if matched else None
    email.draft_body = draft.body
    email.draft_tweak_level = draft.tweak_level

    if classification.flag or draft.tweak_level == "fallback":
        email.flagged = True
        email.flag_reason = classification.flag_reason or "No suitable template found"
        email.draft_status = "Flagged"
        log(db, "email_flagged", f"Flagged: {email.flag_reason}", email.id)
    else:
        email.draft_status = "Draft Created"

    for t in matched:
        t.times_used += 1

    log(
        db, "draft_created",
        f"Draft ({draft.tweak_level}) created for '{subject}' — intent "
        f"{classification.intent} at {classification.confidence}% confidence.",
        email.id,
    )
    db.commit()
    db.refresh(email)
    return email


def sync_flags_to_gmail(db: Session, emails: list, *, read=None, archived=None, deleted=None) -> None:
    """Mirror dashboard state changes onto the real Gmail messages.

    Best-effort: a Gmail hiccup must never break the dashboard action, so
    failures are logged and the local change stands (the next action or
    reconnect converges the states).
    """
    if not gmail.is_live():
        return

    by_account = {}
    for email in emails:
        if email.gmail_message_id:
            by_account.setdefault(email.account_email, []).append(email)
    if not by_account:
        return

    accounts = {
        a.email: a
        for a in db.query(models.EmailAccount)
        .filter(models.EmailAccount.email.in_(by_account.keys()),
                models.EmailAccount.status == "Connected")
        .all()
    }
    for account_email, rows in by_account.items():
        account = accounts.get(account_email)
        if account is None:
            continue
        message_ids = [r.gmail_message_id for r in rows]
        try:
            if read is not None:
                # Gmail models "unread" as a label; read=True removes it.
                add, remove = ([], ["UNREAD"]) if read else (["UNREAD"], [])
                gmail.modify_labels_batch(account, message_ids, add, remove)
            if archived is not None:
                # Archiving in Gmail = removing the INBOX label.
                add, remove = ([], ["INBOX"]) if archived else (["INBOX"], [])
                gmail.modify_labels_batch(account, message_ids, add, remove)
            if deleted is not None:
                for mid in message_ids:
                    if deleted:
                        gmail.trash_message(account, mid)
                    else:
                        gmail.untrash_message(account, mid)
        except Exception:
            logger.exception("Gmail sync failed for %s", account_email)
            log(db, "gmail_sync_failed",
                f"Could not mirror a change to Gmail for {account_email}.")


def delete_forever_in_gmail(db: Session, email: models.Email) -> None:
    """Permanently remove the message from Gmail (used by bin actions)."""
    if not gmail.is_live() or not email.gmail_message_id:
        return
    account = (
        db.query(models.EmailAccount)
        .filter(models.EmailAccount.email == email.account_email,
                models.EmailAccount.status == "Connected")
        .first()
    )
    if account is None:
        return
    try:
        gmail.delete_message_forever(account, email.gmail_message_id)
    except Exception:
        logger.exception("Gmail permanent delete failed for %s", email.gmail_message_id)


def _sync_states_from_gmail(db: Session, account: models.EmailAccount) -> None:
    """Pull Gmail's state so the dashboard mirrors it (Gmail is the truth):

    - trash  → Bin (both directions, including mail we never processed)
    - UNREAD → read/unread state
    - INBOX  → archived state (archived in Gmail = no INBOX label)
    """
    trash_ids = gmail.fetch_label_ids(account, "TRASH")
    unread_ids = gmail.fetch_label_ids(account, "UNREAD")
    inbox_ids = gmail.fetch_label_ids(account, "INBOX")
    now = datetime.now(timezone.utc)

    rows = (
        db.query(models.Email)
        .filter(models.Email.account_email == account.email,
                models.Email.gmail_message_id.isnot(None))
        .all()
    )
    known_ids = set()
    for row in rows:
        known_ids.add(row.gmail_message_id)
        if row.gmail_message_id in trash_ids and not row.deleted:
            row.deleted = True
            row.deleted_at = now
        elif row.deleted and row.gmail_message_id not in trash_ids:
            row.deleted = False
            row.deleted_at = None

        row.read = row.gmail_message_id not in unread_ids
        if not row.deleted:
            row.archived = row.gmail_message_id not in inbox_ids

    for message_id in trash_ids - known_ids:
        try:
            message = gmail.fetch_message(account, message_id)
        except Exception:
            logger.exception("Could not fetch trashed message %s", message_id)
            continue
        if message is None:
            continue
        db.add(models.Email(
            id=next_id(db, models.Email, "email"),
            account_email=account.email,
            gmail_message_id=message.gmail_message_id,
            gmail_thread_id=message.gmail_thread_id,
            from_name=message.from_name,
            from_email=message.from_email,
            subject=message.subject,
            body=message.body,
            received_at=message.received_at,
            draft_status="No Draft",
            read=True,
            deleted=True,
            deleted_at=now,
        ))
        db.commit()  # commit per row so next_id stays unique


def poll_all_accounts(db: Session) -> int:
    """Fetch new Gmail messages for every connected inbox (live mode)."""
    if not gmail.is_live():
        return 0

    processed = 0
    accounts = (
        db.query(models.EmailAccount)
        .filter(models.EmailAccount.status == "Connected")
        .all()
    )
    known_ids = {
        gid for (gid,) in db.query(models.Email.gmail_message_id).all() if gid
    }
    for account in accounts:
        try:
            messages = gmail.fetch_new_messages(account, known_ids)
        except Exception:
            logger.exception("Polling failed for %s", account.email)
            continue
        for message in messages:
            # One bad email must not abort the rest of the batch.
            try:
                process_incoming(
                    db,
                    account_email=account.email,
                    from_name=message.from_name,
                    from_email=message.from_email,
                    subject=message.subject,
                    body=message.body,
                    received_at=message.received_at,
                    gmail_message_id=message.gmail_message_id,
                    gmail_thread_id=message.gmail_thread_id,
                )
                processed += 1
            except Exception:
                db.rollback()
                logger.exception(
                    "Failed to process message %s for %s",
                    message.gmail_message_id, account.email,
                )
        try:
            _sync_states_from_gmail(db, account)
        except Exception:
            logger.exception("State sync failed for %s", account.email)
        account.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    return processed
