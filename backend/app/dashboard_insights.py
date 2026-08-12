"""Compute overview insights for the admin dashboard."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.directory_person_match import removed_snapshot_rows, roster_snapshot_rows
from app.manager_request_tags import (
    TAG_ALREADY_EXISTS,
    TAG_AUTO_MAIL,
    TAG_PARTNER_REQUEST,
    TAG_UNVERIFIED,
    TAG_VERIFIED,
)


def _day_start(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def build_dashboard_insights(
    db: Session,
    *,
    pending: List[models.ManagerRequest],
    pending_payloads: Optional[List[dict]] = None,
    partner_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict:
    pending_add = sum(1 for row in pending if (row.action or "").lower() == "add")
    pending_remove = sum(1 for row in pending if (row.action or "").lower() == "remove")

    # Prefer API payloads so "already exists" matches New requests (includes
    # directory-derived tags, not only rows that stored the tag in the DB).
    tag_rows = pending_payloads if pending_payloads is not None else [
        {"tags": list(row.tags or [])} for row in pending
    ]
    duplicates = sum(1 for row in tag_rows if TAG_ALREADY_EXISTS in (row.get("tags") or []))
    auto_mail = sum(1 for row in tag_rows if TAG_AUTO_MAIL in (row.get("tags") or []))
    partner_req = sum(1 for row in tag_rows if TAG_PARTNER_REQUEST in (row.get("tags") or []))
    awaiting_partner = sum(
        1
        for row in tag_rows
        if TAG_UNVERIFIED in (row.get("tags") or [])
        and TAG_AUTO_MAIL in (row.get("tags") or [])
        and TAG_PARTNER_REQUEST not in (row.get("tags") or [])
        and TAG_VERIFIED not in (row.get("tags") or [])
    )

    users_added = len(roster_snapshot_rows(db, limit=10_000, partner_id=partner_id))
    users_removed = len(removed_snapshot_rows(db, limit=10_000, partner_id=partner_id))

    now = datetime.now(timezone.utc)
    if start_date and end_date:
        filter_start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        filter_end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
    else:
        filter_start = _day_start(now) - timedelta(days=6)
        filter_end = now

    received_query = db.query(func.count(models.ManagerRequest.id)).filter(
        models.ManagerRequest.received_at >= filter_start,
        models.ManagerRequest.received_at <= filter_end
    )
    handled_query = db.query(func.count(models.ManagerRequest.id)).filter(
        models.ManagerRequest.status == "handled",
        models.ManagerRequest.handled_at >= filter_start,
        models.ManagerRequest.handled_at <= filter_end,
    )
    received_rows_query = db.query(models.ManagerRequest.received_at).filter(
        models.ManagerRequest.received_at >= filter_start,
        models.ManagerRequest.received_at <= filter_end
    )
    handled_rows_query = db.query(models.ManagerRequest.handled_at).filter(
        models.ManagerRequest.status == "handled",
        models.ManagerRequest.handled_at >= filter_start,
        models.ManagerRequest.handled_at <= filter_end,
    )

    if partner_id:
        received_query = received_query.filter(models.ManagerRequest.partner_id == partner_id)
        handled_query = handled_query.filter(models.ManagerRequest.partner_id == partner_id)
        received_rows_query = received_rows_query.filter(models.ManagerRequest.partner_id == partner_id)
        handled_rows_query = handled_rows_query.filter(models.ManagerRequest.partner_id == partner_id)

    received_this_week = received_query.scalar() or 0
    handled_this_week = handled_query.scalar() or 0
    received_rows = received_rows_query.all()
    handled_rows = handled_rows_query.all()

    received_by_day: dict[str, int] = {}
    handled_by_day: dict[str, int] = {}
    for (ts,) in received_rows:
        if not ts:
            continue
        key = _day_start(ts).date().isoformat()
        received_by_day[key] = received_by_day.get(key, 0) + 1
    for (ts,) in handled_rows:
        if not ts:
            continue
        key = _day_start(ts).date().isoformat()
        handled_by_day[key] = handled_by_day.get(key, 0) + 1

    weekly_trend = []
    days_delta = max((filter_end - filter_start).days + 1, 1)
    
    for offset in range(days_delta):
        day = filter_start + timedelta(days=offset)
        key = day.date().isoformat()
        weekly_trend.append(
            {
                "date": key,
                "label": day.strftime("%a") if days_delta <= 14 else day.strftime("%d %b"),
                "received": received_by_day.get(key, 0),
                "handled": handled_by_day.get(key, 0),
            }
        )

    return {
        "pendingAdd": pending_add,
        "pendingRemove": pending_remove,
        "awaitingPartner": awaiting_partner,
        "duplicates": duplicates,
        "autoMail": auto_mail,
        "partnerReq": partner_req,
        "usersAdded": users_added,
        "usersRemoved": users_removed,
        "handledThisWeek": int(handled_this_week),
        "receivedThisWeek": int(received_this_week),
        "weeklyTrend": weekly_trend,
    }
