"""Serialize manager_requests for API responses."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

from sqlalchemy.orm import Session

from app import models
from app.directory_person_match import (
    find_directory_conflict,
    request_person_for_match,
)
from app.manager_request_views import is_request_unread
from app.manager_request_tags import (
    TAG_ALREADY_EXISTS,
    TAG_AUTO_MAIL,
    TAG_PARTNER_REQUEST,
    TAG_VERIFIED,
    has_tag,
    merge_tags,
)
from app.request_display import parse_request_display_number
from app.request_match_summary import build_directory_match, build_intake_match
from app.user_display import (
    hydrate_request_users,
    resolve_handled_by_name,
    resolve_manager_fields,
    resolve_manager_name,
)


def _directory_conflict_for_request(
    db: Session,
    req: models.ManagerRequest,
) -> Optional[models.ManagerRequest]:
    person = request_person_for_match(req)
    from app.directory_person_match import _probe_handled_rows

    return find_directory_conflict(
        person=person,
        action=req.action or "",
        directory_rows=_probe_handled_rows(db, person),
    )


def _effective_tags(
    req: models.ManagerRequest,
    directory_row: Optional[models.ManagerRequest],
) -> List[str]:
    tags = list(req.tags or [])
    if directory_row:
        return merge_tags(tags, [TAG_ALREADY_EXISTS])
    return tags


def _connected_inbox_email(db: Session) -> str:
    row = (
        db.query(models.EmailAccount)
        .filter(models.EmailAccount.status == "Connected")
        .order_by(models.EmailAccount.connected_at.desc().nullslast())
        .first()
    )
    return (row.email if row else "") or ""


def _backfill_auto_mail_from_gmail(
    db: Session,
    req: models.ManagerRequest,
) -> Dict[str, Any]:
    """Recover sender/inbox for older roster intakes that never stored Email rows."""
    from app.intake_persons import get_auto_mail_meta, set_auto_mail_meta
    from app.pilot2 import gmail as gmail_api

    gmail_id = (req.source_gmail_message_id or "").strip()
    meta = get_auto_mail_meta(req)
    if not gmail_id or meta.get("fromEmailLookupFailed") or meta.get("fromEmail"):
        return {}
    # Demo / synthetic ids are never recoverable from Gmail.
    if gmail_id.startswith("demo-") or gmail_id.startswith("test-"):
        return {}

    accounts = (
        db.query(models.EmailAccount)
        .filter(models.EmailAccount.status == "Connected")
        .all()
    )
    for account in accounts:
        if not (account.oauth_refresh_token or "").strip():
            continue
        try:
            message = gmail_api.fetch_message(account, gmail_id)
        except Exception:
            continue
        if not message:
            continue
        set_auto_mail_meta(
            req,
            from_email=message.from_email or "",
            received_at=message.received_at or req.received_at,
            subject=message.subject or "",
            inbox_email=account.email or "",
        )
        try:
            db.add(req)
            db.commit()
        except Exception:
            db.rollback()
        return {
            "fromEmail": message.from_email or "",
            "subject": message.subject or "",
            "receivedAt": message.received_at or req.received_at,
            "inboxEmail": account.email or "",
        }

    # Avoid hammering Gmail when the message is gone / wrong inbox.
    current = dict(get_auto_mail_meta(req))
    current["fromEmailLookupFailed"] = True
    if not current.get("inboxEmail"):
        inbox = _connected_inbox_email(db)
        if inbox:
            current["inboxEmail"] = inbox
    persons = dict(req.intake_persons or {}) if isinstance(req.intake_persons, dict) else {}
    persons["autoMailMeta"] = current
    req.intake_persons = persons
    try:
        db.add(req)
        db.commit()
    except Exception:
        db.rollback()
    return {"inboxEmail": current.get("inboxEmail") or ""} if current.get("inboxEmail") else {}


def _automated_email_meta(
    db: Session,
    req: models.ManagerRequest,
) -> Optional[Dict[str, Any]]:
    """Sender + inbox + time for roster auto-mail, when present."""
    from app.intake_persons import get_auto_mail_meta, set_auto_mail_meta

    email_row = None
    if req.source_email_id:
        email_row = (
            db.query(models.Email)
            .filter(models.Email.id == req.source_email_id)
            .first()
        )
    elif req.source_gmail_message_id:
        email_row = (
            db.query(models.Email)
            .filter(models.Email.gmail_message_id == req.source_gmail_message_id)
            .first()
        )

    meta = get_auto_mail_meta(req)
    inbox_email = (
        (email_row.account_email if email_row else None)
        or meta.get("inboxEmail")
        or ""
    )
    raw_from = (email_row.from_email if email_row else None) or meta.get("fromEmail") or ""
    original_from = ""
    if email_row is not None:
        original_from = (getattr(email_row, "original_from_email", None) or "").strip()
    # Prefer original sender when this was a forward into the connected inbox.
    if (
        original_from
        and inbox_email
        and raw_from.lower() == inbox_email.lower()
    ):
        from_email = original_from
    else:
        from_email = raw_from
    subject = (email_row.subject if email_row else None) or meta.get("subject") or ""
    received_at = (
        (email_row.received_at if email_row else None)
        or meta.get("receivedAt")
        or req.received_at
    )
    _, notes_auto = _split_manager_and_automated_notes(req.manager_notes)
    details = (meta.get("details") or "").strip() or notes_auto or subject or ""

    has_auto_tag = TAG_AUTO_MAIL in (req.tags or [])
    if not from_email and req.source_gmail_message_id and (has_auto_tag or req.source_gmail_message_id):
        recovered = _backfill_auto_mail_from_gmail(db, req)
        if recovered:
            from_email = recovered.get("fromEmail") or from_email
            subject = recovered.get("subject") or subject
            inbox_email = recovered.get("inboxEmail") or inbox_email
            received_at = recovered.get("receivedAt") or received_at

    if not inbox_email and (has_auto_tag or req.source_gmail_message_id or from_email):
        inbox_email = _connected_inbox_email(db)
        if inbox_email and not meta.get("inboxEmail"):
            set_auto_mail_meta(req, inbox_email=inbox_email)
            try:
                db.add(req)
                db.commit()
            except Exception:
                db.rollback()

    # Persist details migrated out of polluted manager_notes (legacy rows).
    if notes_auto and not (meta.get("details") or "").strip():
        manager_only, _ = _split_manager_and_automated_notes(req.manager_notes)
        set_auto_mail_meta(req, details=notes_auto)
        req.manager_notes = manager_only
        try:
            db.add(req)
            db.commit()
        except Exception:
            db.rollback()

    if (
        email_row is None
        and not meta
        and not has_auto_tag
        and not req.source_gmail_message_id
        and not from_email
        and not inbox_email
        and not details
    ):
        return None

    if (
        not has_auto_tag
        and not req.source_gmail_message_id
        and not from_email
        and not inbox_email
        and not details
    ):
        return None

    return {
        "fromEmail": from_email,
        "subject": subject,
        "receivedAt": received_at,
        "inboxEmail": inbox_email,
        "details": details,
    }


def _looks_like_automated_notes(raw: Optional[str]) -> bool:
    text = (raw or "").strip().lower()
    if not text:
        return False
    return text.startswith("automated roster email") or text.startswith("automated puregym email")


def _looks_like_seed_notes(raw: Optional[str]) -> bool:
    text = (raw or "").strip().lower()
    return text.startswith("seed:")


def _split_manager_and_automated_notes(raw: Optional[str]) -> Tuple[Optional[str], str]:
    """Return (manager_form_notes, automated_details). Seed text is dropped."""
    text = (raw or "").strip()
    if not text:
        return None, ""
    if _looks_like_seed_notes(text):
        return None, ""
    if _looks_like_automated_notes(text):
        return None, text

    parts = [part.strip() for part in re.split(r"\n{2,}", text) if part.strip()]
    manager_parts: List[str] = []
    auto_parts: List[str] = []
    for part in parts:
        if _looks_like_seed_notes(part):
            continue
        if _looks_like_automated_notes(part):
            auto_parts.append(part)
        else:
            manager_parts.append(part)
    manager = "\n\n".join(manager_parts).strip() or None
    auto = "\n\n".join(auto_parts).strip()
    return manager, auto


def request_to_api_dict(
    req: models.ManagerRequest,
    *,
    manager_user: Optional[models.PowermusicUser] = None,
    admin_user: Optional[models.PowermusicUser] = None,
    directory_row: Optional[models.ManagerRequest] = None,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    if manager_user is None:
        manager_user = getattr(req, "_manager_user", None)
    if admin_user is None:
        admin_user = getattr(req, "_admin_user", None)

    submitted_by = resolve_manager_fields(req, manager_user=manager_user)
    created_by = resolve_manager_name(req, manager_user=manager_user)
    intake_match = build_intake_match(req)
    directory_match = build_directory_match(req, directory_row)
    tags = _effective_tags(req, directory_row)
    manager_notes, _ = _split_manager_and_automated_notes(req.manager_notes)

    payload = {
        "id": req.id,
        "displayId": getattr(req, "displayId", None) or parse_request_display_number(req.id),
        "receivedAt": req.received_at,
        "handledAt": req.handled_at,
        "submittedBy": submitted_by,
        "person": {
            "firstName": req.person_first_name,
            "lastName": req.person_last_name,
            "email": req.person_email,
            "location": req.person_location,
        },
        "action": req.action,
        "notes": manager_notes,
        "managerNotes": manager_notes,
        "tags": tags,
        "createdBy": created_by,
        "status": req.status,
        "handledBy": resolve_handled_by_name(req, admin_user=admin_user),
        "managerId": str(req.manager_id) if req.manager_id else None,
        "handledByAdminId": str(req.handled_by_admin_id) if req.handled_by_admin_id else None,
    }
    if intake_match:
        payload["intakeMatch"] = intake_match
    if directory_match:
        payload["directoryMatch"] = directory_match
    if db is not None:
        automated = _automated_email_meta(db, req)
        if automated is not None:
            payload["automatedEmail"] = automated
    return payload


def requests_to_api_dicts(db: Session, requests: List[models.ManagerRequest]) -> List[Dict[str, Any]]:
    rows = list(requests)
    hydrate_request_users(db, rows)
    results: List[Dict[str, Any]] = []
    for req in rows:
        directory_row = _directory_conflict_for_request(db, req)
        results.append(
            request_to_api_dict(req, directory_row=directory_row, db=db),
        )
    return results


def directory_person_to_api_dict(
    req: models.ManagerRequest,
    *,
    manager_user: Optional[models.PowermusicUser] = None,
    admin_user: Optional[models.PowermusicUser] = None,
    db: Optional[Session] = None,
    related_rows: Optional[List[models.ManagerRequest]] = None,
) -> Dict[str, Any]:
    if manager_user is None:
        manager_user = getattr(req, "_manager_user", None)
    if admin_user is None:
        admin_user = getattr(req, "_admin_user", None)

    manager_fields = resolve_manager_fields(req, manager_user=manager_user)
    manager_name = resolve_manager_name(req, manager_user=manager_user)
    handled_by = resolve_handled_by_name(req, admin_user=admin_user)
    manager_notes, _ = _split_manager_and_automated_notes(req.manager_notes)

    history_source = related_rows if related_rows is not None else [req]
    request_history = _build_directory_request_history(db, history_source)

    return {
        "id": req.id,
        "displayId": parse_request_display_number(req.id),
        "firstName": req.person_first_name,
        "lastName": req.person_last_name,
        "email": req.person_email,
        "location": req.person_location,
        "status": req.outcome or "",
        "dateAdded": req.handled_at,
        "addedBy": handled_by,
        "managerName": manager_name,
        "handledBy": handled_by,
        "managerEmail": manager_fields["email"],
        "club": manager_fields["club"],
        "sourceRequestId": req.id,
        "sourceRequestNumber": parse_request_display_number(req.id),
        "requestReceivedAt": req.received_at,
        "managerNotes": manager_notes,
        "adminNotes": req.admin_notes,
        "notes": manager_notes,
        "requestHistory": request_history,
    }


def _light_auto_mail_snapshot(req: models.ManagerRequest) -> Optional[Dict[str, Any]]:
    """Auto-mail summary without DB round-trips (safe for list serialization)."""
    from app.intake_persons import get_auto_mail_meta

    tags = req.tags or []
    meta = get_auto_mail_meta(req)
    _, notes_auto = _split_manager_and_automated_notes(req.manager_notes)
    if (
        not has_tag(tags, TAG_AUTO_MAIL)
        and not meta
        and not req.source_gmail_message_id
        and not notes_auto
    ):
        return None
    return {
        "fromEmail": (meta.get("fromEmail") or "").strip(),
        "subject": (meta.get("subject") or "").strip(),
        "inboxEmail": (meta.get("inboxEmail") or "").strip(),
        "receivedAt": meta.get("receivedAt") or req.received_at,
        "details": ((meta.get("details") or "").strip() or notes_auto or ""),
    }


def _history_sort_key(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return datetime.min
    return datetime.min


def _build_directory_request_history(
    _db: Optional[Session],
    rows: List[models.ManagerRequest],
) -> List[Dict[str, Any]]:
    """Timeline of manager submissions, auto-mail receipts, and handled outcomes."""
    events: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for req in rows:
        tags = req.tags or []
        manager_user = getattr(req, "_manager_user", None)
        admin_user = getattr(req, "_admin_user", None)
        manager_name = resolve_manager_name(req, manager_user=manager_user)
        handled_by = resolve_handled_by_name(req, admin_user=admin_user)
        display_id = parse_request_display_number(req.id)
        action = req.action or ""
        action_verb = "add" if action == "Add" else "remove" if action == "Remove" else action.lower()

        auto = _light_auto_mail_snapshot(req)

        if auto is not None:
            event_id = f"{req.id}-auto-mail"
            if event_id not in seen:
                seen.add(event_id)
                subject = (auto.get("subject") or "").strip()
                from_email = (auto.get("fromEmail") or "").strip()
                detail_bits = []
                if from_email:
                    detail_bits.append(f"From {from_email}")
                if subject:
                    detail_bits.append(subject)
                events.append(
                    {
                        "id": event_id,
                        "type": "auto_mail",
                        "at": auto.get("receivedAt") or req.received_at,
                        "requestId": req.id,
                        "displayId": display_id,
                        "action": action,
                        "title": f"Automated email received for {action_verb or 'update'}",
                        "detail": " · ".join(detail_bits) if detail_bits else None,
                        "fromEmail": from_email or None,
                        "subject": subject or None,
                    }
                )

        has_manager = (
            has_tag(tags, TAG_PARTNER_REQUEST)
            or has_tag(tags, TAG_VERIFIED)
            or bool(req.manager_id)
        )
        if has_manager:
            event_id = f"{req.id}-manager-request"
            if event_id not in seen:
                seen.add(event_id)
                who = manager_name or "a manager"
                events.append(
                    {
                        "id": event_id,
                        "type": "manager_request",
                        "at": req.received_at,
                        "requestId": req.id,
                        "displayId": display_id,
                        "action": action,
                        "title": f"Manager request to {action_verb or 'update'}",
                        "detail": f"Submitted by {who}",
                        "managerName": manager_name or None,
                    }
                )

        if req.status == "handled" and req.handled_at:
            event_id = f"{req.id}-handled"
            if event_id not in seen:
                seen.add(event_id)
                outcome = req.outcome or action
                events.append(
                    {
                        "id": event_id,
                        "type": "handled",
                        "at": req.handled_at,
                        "requestId": req.id,
                        "displayId": display_id,
                        "action": action,
                        "title": f"Marked as {outcome}",
                        "detail": f"By {handled_by}" if handled_by else None,
                        "handledBy": handled_by or None,
                        "outcome": outcome,
                    }
                )

    events.sort(key=lambda e: _history_sort_key(e.get("at")), reverse=True)
    return events


def manager_request_list_item_to_api_dict(
    req: models.ManagerRequest,
    *,
    seen_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    return {
        "id": req.id,
        "displayId": parse_request_display_number(req.id),
        "receivedAt": req.received_at,
        "handledAt": req.handled_at,
        "person": {
            "firstName": req.person_first_name,
            "lastName": req.person_last_name,
            "email": req.person_email,
            "location": req.person_location,
        },
        "action": req.action,
        "status": req.status,
        "outcome": req.outcome,
        "notes": _split_manager_and_automated_notes(req.manager_notes)[0],
        "isUnread": is_request_unread(req, seen_at),
    }


def manager_requests_list_to_api_dicts(
    requests: List[models.ManagerRequest],
    *,
    seen_map: Optional[Dict[str, datetime]] = None,
) -> List[Dict[str, Any]]:
    seen_map = seen_map or {}
    return [
        manager_request_list_item_to_api_dict(req, seen_at=seen_map.get(req.id))
        for req in requests
    ]


def directory_rows_to_api_dicts(db: Session, rows: List[models.ManagerRequest]) -> List[Dict[str, Any]]:
    from collections import defaultdict

    from sqlalchemy import func

    items = list(rows)
    hydrate_request_users(db, items)

    emails = {
        (row.person_email or "").strip().lower()
        for row in items
        if (row.person_email or "").strip()
    }
    related_by_email: Dict[str, List[models.ManagerRequest]] = defaultdict(list)
    if emails:
        related = (
            db.query(models.ManagerRequest)
            .filter(func.lower(models.ManagerRequest.person_email).in_(list(emails)))
            .order_by(models.ManagerRequest.received_at.desc().nullslast())
            .limit(max(200, len(emails) * 12))
            .all()
        )
        hydrate_request_users(db, related)
        for row in related:
            key = (row.person_email or "").strip().lower()
            if key:
                related_by_email[key].append(row)

    return [
        directory_person_to_api_dict(
            req,
            db=db,
            related_rows=related_by_email.get(
                (req.person_email or "").strip().lower(),
                [req],
            ),
        )
        for req in items
    ]
