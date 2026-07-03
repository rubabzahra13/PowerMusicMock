"""Gmail backfill, History API delta sync, and async AI batch processing."""

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Optional, Set

from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal
from app.pilot2 import config, gmail, gmail_labels, pipeline

logger = logging.getLogger(__name__)

_backfill_lock = threading.Lock()
_backfill_running: Set[str] = set()


def _backfill_queries(days: int) -> list[str]:
    window = f"newer_than:{days}d"
    promo = gmail.NO_PROMOTIONS
    return [
        f"{window} in:inbox {promo}",
        f"{window} is:starred {promo}",
        (
            f"{window} -in:inbox -in:trash -in:spam -in:draft -in:sent {promo}"
        ),
    ]


def _is_no_reply_sender(from_email: str) -> bool:
    """Senders that cannot receive replies have no place in a reply queue."""
    return gmail.is_no_reply_address(from_email)


def _should_skip_import(
    account: models.EmailAccount,
    message: gmail.InboundMessage,
) -> bool:
    labels = set(message.label_ids or [])
    if gmail.LABEL_TRASH in labels or gmail.LABEL_SPAM in labels:
        return True
    if gmail.LABEL_DRAFT in labels:
        return True
    if message.from_email.lower() == account.email.lower():
        return True
    if _is_no_reply_sender(message.from_email):
        return True
    if message.is_automated:
        return True
    if gmail.thread_has_sent(account, message.gmail_thread_id):
        return True
    return False


def _eligible_for_ai(account: models.EmailAccount, message: gmail.InboundMessage) -> bool:
    if _should_skip_import(account, message):
        return False
    labels = set(message.label_ids or [])
    if gmail.LABEL_SENT in labels:
        return False
    return True


def import_message(
    db: Session,
    account: models.EmailAccount,
    message: gmail.InboundMessage,
    *,
    queue_ai: bool = True,
) -> Optional[models.Email]:
    """Idempotent fast import — AI runs separately when queue_ai=True."""
    existing = (
        db.query(models.Email)
        .filter(models.Email.gmail_message_id == message.gmail_message_id)
        .first()
    )
    if existing:
        flags = gmail_labels.derive_label_flags(
            message.label_ids,
            account_email=account.email,
            from_email=message.from_email,
        )
        gmail_labels.apply_label_flags(existing, flags)
        return existing

    if _should_skip_import(account, message):
        return None

    flags = gmail_labels.derive_label_flags(
        message.label_ids,
        account_email=account.email,
        from_email=message.from_email,
    )
    ai = queue_ai and _eligible_for_ai(account, message)

    email = models.Email(
        id=pipeline.next_id(db, models.Email, "email"),
        account_email=account.email,
        gmail_message_id=message.gmail_message_id,
        gmail_thread_id=message.gmail_thread_id,
        from_name=message.from_name,
        from_email=message.from_email,
        subject=message.subject,
        body=message.body,
        received_at=message.received_at,
        draft_status="Imported" if ai else "No Draft",
        **flags,
    )
    gmail_labels.apply_label_flags(email, flags)
    db.add(email)
    db.flush()
    return email


def run_backfill(db: Session, account: models.EmailAccount) -> int:
    """Import the last N days of mail for one inbox (no AI — batched later)."""
    if not gmail.is_live():
        account.backfill_status = "done"
        return 0

    account.backfill_status = "running"
    account.backfill_error = None
    account.backfill_imported_count = 0
    db.commit()

    imported = 0
    seen: Set[str] = set()
    try:
        profile = gmail.get_profile(account)
        if profile.get("historyId"):
            account.gmail_history_id = str(profile["historyId"])

        for query in _backfill_queries(config.BACKFILL_DAYS):
            message_ids = gmail.list_all_message_ids(
                account,
                query,
                max_messages=config.BACKFILL_MAX_MESSAGES_PER_QUERY,
                pause_seconds=config.GMAIL_API_PAUSE_SECONDS,
            )
            for message_id in message_ids:
                if message_id in seen:
                    continue
                seen.add(message_id)
                try:
                    message = gmail.get_message(account, message_id)
                except Exception:
                    logger.exception(
                        "Backfill fetch failed for %s on %s",
                        message_id,
                        account.email,
                    )
                    continue
                if message is None:
                    continue
                row = import_message(db, account, message, queue_ai=True)
                if row is not None:
                    account.backfill_imported_count += 1
                    if row.draft_status == "Imported":
                        imported += 1
                if account.backfill_imported_count % 25 == 0:
                    db.commit()

        account.backfill_status = "done"
        account.last_synced_at = datetime.now(timezone.utc)
        db.commit()
        pipeline.log(
            db,
            "backfill_complete",
            f"Backfill imported {account.backfill_imported_count} messages for {account.email}.",
        )
        db.commit()
        return imported
    except Exception as exc:
        logger.exception("Backfill failed for %s", account.email)
        account.backfill_status = "failed"
        account.backfill_error = str(exc)[:500]
        db.commit()
        raise


def _backfill_worker(account_id: str) -> None:
    with _backfill_lock:
        if account_id in _backfill_running:
            return
        _backfill_running.add(account_id)
    db = SessionLocal()
    try:
        account = (
            db.query(models.EmailAccount)
            .filter(models.EmailAccount.id == account_id)
            .first()
        )
        if account is None:
            return
        run_backfill(db, account)
    finally:
        db.close()
        with _backfill_lock:
            _backfill_running.discard(account_id)


def start_backfill(account_id: str) -> None:
    """Kick off initial backfill in a background thread (OAuth connect)."""
    if not gmail.is_live():
        return
    thread = threading.Thread(
        target=_backfill_worker,
        args=(account_id,),
        name=f"gmail-backfill-{account_id}",
        daemon=True,
    )
    thread.start()


def resume_interrupted_backfills() -> None:
    """Restart backfills orphaned by a previous process (status stuck 'running').

    A stuck 'running' status is worse than a wasted re-run: history sync skips
    accounts while a backfill is marked running, so new mail would never be
    imported again. Import is idempotent, so re-running is safe.
    """
    if not gmail.is_live():
        return
    db = SessionLocal()
    try:
        stuck = (
            db.query(models.EmailAccount)
            .filter(models.EmailAccount.backfill_status == "running")
            .all()
        )
        for account in stuck:
            logger.warning("Resuming interrupted backfill for %s", account.email)
            start_backfill(account.id)
    finally:
        db.close()


def sync_account_history(db: Session, account: models.EmailAccount) -> int:
    """Apply Gmail History API deltas for one connected inbox."""
    if not gmail.is_live() or account.backfill_status == "running":
        return 0

    if not account.gmail_history_id:
        profile = gmail.get_profile(account)
        account.gmail_history_id = str(profile.get("historyId", "0"))
        db.commit()
        return 0

    start_id = account.gmail_history_id
    page_token: Optional[str] = None
    changes = 0
    latest_history_id = start_id

    while True:
        try:
            result = gmail.list_history(account, start_id, page_token=page_token)
        except Exception as exc:
            # Stale history id — reset from profile and retry next poll.
            if "404" in str(exc) or "historyId" in str(exc).lower():
                profile = gmail.get_profile(account)
                account.gmail_history_id = str(profile.get("historyId", start_id))
                db.commit()
                logger.warning("Reset history id for %s after %s", account.email, exc)
                return changes
            raise

        latest_history_id = str(result.get("historyId", latest_history_id))
        for record in result.get("history", []) or []:
            changes += _apply_history_record(db, account, record)

        page_token = result.get("nextPageToken")
        if not page_token:
            break
        time.sleep(config.GMAIL_API_PAUSE_SECONDS)

    if latest_history_id != start_id:
        account.gmail_history_id = latest_history_id
    account.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    return changes


def _apply_history_record(
    db: Session,
    account: models.EmailAccount,
    record: dict,
) -> int:
    applied = 0
    now = datetime.now(timezone.utc)

    for item in record.get("messagesAdded", []) or []:
        ref = item.get("message") or {}
        message_id = ref.get("id")
        if not message_id:
            continue
        try:
            message = gmail.get_message(account, message_id)
        except Exception:
            logger.exception("History import fetch failed for %s", message_id)
            continue
        if message is None:
            continue
        before = (
            db.query(models.Email)
            .filter(models.Email.gmail_message_id == message_id)
            .count()
        )
        import_message(db, account, message, queue_ai=True)
        if before == 0:
            applied += 1

    for item in record.get("labelsAdded", []) or []:
        applied += _apply_label_change(db, account, item, added=item.get("labelIds") or [])

    for item in record.get("labelsRemoved", []) or []:
        applied += _apply_label_change(
            db, account, item, removed=item.get("labelIds") or []
        )

    for item in record.get("messagesDeleted", []) or []:
        ref = item.get("message") or {}
        message_id = ref.get("id")
        if not message_id:
            continue
        row = (
            db.query(models.Email)
            .filter(models.Email.gmail_message_id == message_id)
            .first()
        )
        if row:
            row.deleted = True
            row.deleted_at = now
            applied += 1

    return applied


def _apply_label_change(
    db: Session,
    account: models.EmailAccount,
    item: dict,
    *,
    added: list | None = None,
    removed: list | None = None,
) -> int:
    ref = item.get("message") or {}
    message_id = ref.get("id")
    if not message_id:
        return 0
    now = datetime.now(timezone.utc)
    row = (
        db.query(models.Email)
        .filter(
            models.Email.gmail_message_id == message_id,
            models.Email.account_email == account.email,
        )
        .first()
    )
    if row is None:
        try:
            message = gmail.get_message(account, message_id)
        except Exception:
            return 0
        if message is None:
            return 0
        row = import_message(db, account, message, queue_ai=False)
        if row is None:
            return 0
    merged = gmail_labels.merge_label_delta(
        row.gmail_label_ids,
        added=added,
        removed=removed,
    )
    flags = gmail_labels.derive_label_flags(
        merged,
        account_email=account.email,
        from_email=row.from_email,
    )
    gmail_labels.apply_label_flags(row, flags, now=now)
    return 1


_ai_batch_lock = threading.Lock()


def process_ai_batch(db: Session) -> int:
    """Run classifier + composer for imported messages (rate-limited batch).

    Also reclaims rows stuck in "Processing": the lock guarantees only one
    batch runs per process, so any committed Processing row seen here was
    orphaned by an interrupted run (restart/crash) and must be retried —
    otherwise it shows "composing" in the UI forever.
    """
    if not _ai_batch_lock.acquire(blocking=False):
        return 0
    try:
        rows = (
            db.query(models.Email)
            .filter(models.Email.draft_status.in_(["Imported", "Processing"]))
            .order_by(models.Email.received_at.asc())
            .limit(config.AI_BATCH_SIZE)
            .all()
        )
        processed = 0
        for email in rows:
            email.draft_status = "Processing"
            db.commit()
            try:
                pipeline.run_ai_for_email(db, email)
                processed += 1
            except Exception:
                db.rollback()
                email = db.query(models.Email).filter(models.Email.id == email.id).first()
                if email:
                    email.draft_status = "Flagged"
                    email.flagged = True
                    email.flag_reason = "AI processing failed"
                    db.commit()
                logger.exception("AI batch failed for %s", email.id if email else "?")
        return processed
    finally:
        _ai_batch_lock.release()
