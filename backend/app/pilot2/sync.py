"""Gmail backfill, History API delta sync, and async AI batch processing."""

import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, Set

from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal
from app.automated_person_intake import intake_puregym_roster_message, is_puregym_roster_notification
from app.pilot2 import config, gmail, gmail_labels, ignore_list, pipeline

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


def _is_puregym_roster_message(message: gmail.InboundMessage) -> bool:
    return is_puregym_roster_notification(
        message.from_email,
        message.subject,
        message.body,
        from_name=message.from_name,
    )


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
    if _is_puregym_roster_message(message):
        return False
    if _is_no_reply_sender(message.from_email):
        return True
    if message.is_automated:
        return True
    # NOTE: we intentionally do NOT skip messages on threads Andrea has
    # already replied to. Gmail delivers customer follow-ups on those threads
    # and Andrea needs to see them (the previous skip silently dropped every
    # reply after her first send). Dedup against our own outbound copies
    # happens above via `message.from_email == account.email` and, for the
    # message she sent from this app, via `sent_gmail_message_id` on the
    # thread's original row.
    return False


def _eligible_for_ai(account: models.EmailAccount, message: gmail.InboundMessage) -> bool:
    if _is_puregym_roster_message(message):
        return False
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

    # Gmail also echoes back messages Andrea sent from this app (SENT label
    # arrives via history sync). We record the outbound copy on the original
    # inbound row's `sent_gmail_message_id` at send-time, so we can suppress
    # the reimport here instead of creating a duplicate row for her own send.
    sent_dupe = (
        db.query(models.Email)
        .filter(models.Email.sent_gmail_message_id == message.gmail_message_id)
        .first()
    )
    if sent_dupe:
        return sent_dupe

    if intake_puregym_roster_message(
        db,
        from_email=message.from_email,
        from_name=message.from_name,
        subject=message.subject,
        body=message.body,
        received_at=message.received_at,
        gmail_message_id=message.gmail_message_id,
    ):
        db.commit()
        return None

    if _should_skip_import(account, message):
        return None

    rules = ignore_list.load_rules_for_inbox(db, account.email)
    if ignore_list.is_message_ignored(
        message.from_email,
        account.email,
        rules,
        original_from_email=message.original_from_email,
    ):
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
        to_emails=list(message.to_emails or []),
        cc_emails=list(message.cc_emails or []),
        subject=message.subject,
        body=message.body,
        html_body=message.html_body,
        snippet=message.snippet,
        received_at=message.received_at,
        message_id_header=message.message_id_header,
        in_reply_to_header=message.in_reply_to_header,
        references_header=message.references_header,
        is_forward=message.is_forward,
        forwarded_by_name=message.forwarded_by_name,
        forwarded_by_email=message.forwarded_by_email,
        original_from_name=message.original_from_name,
        original_from_email=message.original_from_email,
        draft_status="Imported" if ai else "No Draft",
        **flags,
    )
    gmail_labels.apply_label_flags(email, flags)
    db.add(email)
    db.flush()
    pipeline.persist_attachments(db, email.id, message.attachments)

    return email


def run_backfill(
    db: Session,
    account: models.EmailAccount,
    *,
    deadline: Optional[float] = None,
) -> int:
    """Import the last N days of mail for one inbox (no AI — batched later).

    `deadline` (a time.monotonic() value) time-boxes the import so it can run
    synchronously inside a serverless request without exceeding the platform
    timeout. When the deadline is hit we stop and still mark the backfill
    "done": messages are imported recent-first (Gmail lists newest first, inbox
    query first), and gmail_history_id is set up front, so push sync already
    covers everything from connect-time forward — the only thing a partial
    backfill drops is some of the older historical tail, never new mail.
    """
    if not gmail.is_live():
        account.backfill_status = "done"
        return 0

    account.backfill_status = "running"
    account.backfill_error = None
    account.backfill_imported_count = 0
    db.commit()

    imported = 0
    seen: Set[str] = set()
    hit_deadline = False
    try:
        profile = gmail.get_profile(account)
        if profile.get("historyId"):
            account.gmail_history_id = str(profile["historyId"])

        for query in _backfill_queries(config.BACKFILL_DAYS):
            if hit_deadline:
                break
            message_ids = gmail.list_all_message_ids(
                account,
                query,
                max_messages=config.BACKFILL_MAX_MESSAGES_PER_QUERY,
                pause_seconds=config.GMAIL_API_PAUSE_SECONDS,
            )
            for message_id in message_ids:
                if deadline is not None and time.monotonic() >= deadline:
                    hit_deadline = True
                    logger.warning(
                        "Backfill for %s hit time budget after %d messages; "
                        "marking done (push covers all new mail).",
                        account.email,
                        account.backfill_imported_count,
                    )
                    break
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
    if not gmail.is_live():
        return 0

    # A backfill in progress defers history sync to avoid double-importing the
    # same messages. But on serverless the backfill runs in a background thread
    # Vercel may freeze/kill before it marks itself "done", leaving the status
    # stuck at "running" forever — which would permanently disable push sync for
    # that inbox. So only defer when a backfill is genuinely active *in this
    # process* (_backfill_running); a persisted "running" with no live thread is
    # stale, so we clear it and proceed. Import is idempotent, so this is safe.
    if account.backfill_status == "running":
        with _backfill_lock:
            actively_running = account.id in _backfill_running
        if actively_running:
            return 0
        logger.warning(
            "Clearing stale backfill 'running' for %s (no live backfill thread); "
            "resuming history sync.",
            account.email,
        )
        account.backfill_status = "done"
        db.commit()

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

    Also reclaims rows stuck in "Processing"/"Drafting": the lock guarantees
    only one batch runs per process, so any committed Processing/Drafting row
    seen here was orphaned by an interrupted run (restart/serverless freeze) and
    must be retried — otherwise it shows "drafting" in the UI forever.
    """
    if not _ai_batch_lock.acquire(blocking=False):
        return 0
    try:
        rows = (
            db.query(models.Email)
            .filter(models.Email.draft_status.in_(["Imported", "Processing", "Drafting"]))
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


# ── Gmail push (watch) lifecycle ─────────────────────────────

# Re-arm a watch when it's within this window of expiring. Gmail watches last
# 7 days; renewing daily with a 24h cushion means a missed renewal still has
# slack before push goes silent.
WATCH_RENEW_CUSHION = timedelta(hours=24)


def arm_watch(db: Session, account: models.EmailAccount) -> bool:
    """Arm (or re-arm) Gmail push for one inbox and persist the expiry.

    No-op in mock mode or when no Pub/Sub topic is configured, so this is safe
    to call unconditionally on connect. Returns True when a watch was armed.
    """
    if not config.gmail_push_enabled():
        return False
    try:
        result = gmail.start_watch(account)
    except Exception:
        logger.exception("Gmail watch failed for %s", account.email)
        return False
    if not result:
        return False

    history_id = result.get("historyId")
    if history_id:
        account.gmail_history_id = str(history_id)
    expiration = result.get("expiration")
    if expiration:
        account.watch_expiration = datetime.fromtimestamp(
            int(expiration) / 1000, tz=timezone.utc
        )
    db.commit()
    pipeline.log(
        db,
        "gmail_watch_armed",
        f"Gmail push armed for {account.email} (expires {account.watch_expiration}).",
    )
    db.commit()
    return True


def renew_expiring_watches(db: Session) -> int:
    """Re-arm every connected inbox whose watch is missing or near expiry.

    Runs daily (scheduler) / via cron on serverless. Gmail requires a fresh
    watch call at least weekly or push silently stops.
    """
    if not config.gmail_push_enabled():
        return 0
    cutoff = datetime.now(timezone.utc) + WATCH_RENEW_CUSHION
    accounts = (
        db.query(models.EmailAccount)
        .filter(models.EmailAccount.status == "Connected")
        .all()
    )
    renewed = 0
    for account in accounts:
        if account.watch_expiration is None or account.watch_expiration <= cutoff:
            if arm_watch(db, account):
                renewed += 1
    return renewed


def handle_push_notification(
    db: Session,
    email_address: str,
    history_id: Optional[str] = None,
) -> int:
    """Process one Gmail Pub/Sub push: delta-sync that inbox now, then draft.

    Gmail's push payload only says "something changed in this mailbox" (plus a
    historyId), so we run the same History API delta sync the poller uses —
    it's idempotent, so duplicate/again-later notifications are harmless.
    """
    if not email_address:
        return 0
    account = (
        db.query(models.EmailAccount)
        .filter(
            models.EmailAccount.email == email_address,
            models.EmailAccount.status == "Connected",
        )
        .first()
    )
    if account is None:
        logger.info("Push notification for unknown/disconnected inbox %s", email_address)
        return 0

    changes = sync_account_history(db, account)
    # Draft replies right away so the new mail shows a ready draft, not a
    # "composing" spinner, by the time Andrea looks.
    try:
        process_ai_batch(db)
    except Exception:
        logger.exception("AI batch after push failed for %s", email_address)

    # Nudge the open dashboard to refetch now instead of on its next poll.
    from app.pilot2 import realtime

    realtime.workspace_changed("push", changes)
    return changes
