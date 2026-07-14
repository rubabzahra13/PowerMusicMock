"""Compute overview insights for the admin dashboard."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List

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
) -> dict:
    pending_add = sum(1 for row in pending if (row.action or "").lower() == "add")
    pending_remove = sum(1 for row in pending if (row.action or "").lower() == "remove")
    duplicates = sum(1 for row in pending if row.tags and TAG_ALREADY_EXISTS in row.tags)
    auto_mail = sum(1 for row in pending if row.tags and TAG_AUTO_MAIL in row.tags)
    partner_req = sum(1 for row in pending if row.tags and TAG_PARTNER_REQUEST in row.tags)
    awaiting_partner = sum(
        1
        for row in pending
        if row.tags
        and TAG_UNVERIFIED in row.tags
        and TAG_AUTO_MAIL in row.tags
        and TAG_PARTNER_REQUEST not in row.tags
        and TAG_VERIFIED not in row.tags
    )

    users_added = len(roster_snapshot_rows(db, limit=10_000))
    users_removed = len(removed_snapshot_rows(db, limit=10_000))

    now = datetime.now(timezone.utc)
    week_start = _day_start(now) - timedelta(days=6)

    received_this_week = (
        db.query(func.count(models.ManagerRequest.id))
        .filter(models.ManagerRequest.received_at >= week_start)
        .scalar()
        or 0
    )
    handled_this_week = (
        db.query(func.count(models.ManagerRequest.id))
        .filter(
            models.ManagerRequest.status == "handled",
            models.ManagerRequest.handled_at >= week_start,
        )
        .scalar()
        or 0
    )

    received_rows = (
        db.query(models.ManagerRequest.received_at)
        .filter(models.ManagerRequest.received_at >= week_start)
        .all()
    )
    handled_rows = (
        db.query(models.ManagerRequest.handled_at)
        .filter(
            models.ManagerRequest.status == "handled",
            models.ManagerRequest.handled_at >= week_start,
        )
        .all()
    )

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
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        key = day.date().isoformat()
        weekly_trend.append(
            {
                "date": key,
                "label": day.strftime("%a"),
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
