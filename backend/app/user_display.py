"""Resolve manager/admin display fields from powermusic_users FKs."""

from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app import models


def split_full_name(full_name: Optional[str]) -> tuple[str, str]:
    text = (full_name or "").strip()
    if not text:
        return "", ""
    parts = text.split(None, 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


def user_manager_fields(user: models.PowermusicUser) -> Dict[str, str]:
    first = (user.first_name or "").strip()
    last = (user.last_name or "").strip()
    if not first and not last:
        first, last = split_full_name(user.full_name)
    return {
        "firstName": first,
        "lastName": last,
        "email": user.email or "",
        "club": (user.club or "").strip(),
    }


def user_display_name(user: Optional[models.PowermusicUser]) -> str:
    if user is None:
        return ""
    fields = user_manager_fields(user)
    name = f"{fields['firstName']} {fields['lastName']}".strip()
    return name or (user.full_name or "").strip() or user.email or ""


def load_users_by_id(db: Session, ids: set) -> Dict[Any, models.PowermusicUser]:
    if not ids:
        return {}
    rows = db.query(models.PowermusicUser).filter(models.PowermusicUser.id.in_(ids)).all()
    return {row.id: row for row in rows}


def resolve_manager_fields(
    req: models.ManagerRequest,
    *,
    manager_user: Optional[models.PowermusicUser] = None,
) -> Dict[str, str]:
    if manager_user is not None:
        return user_manager_fields(manager_user)
    return {
        "firstName": "",
        "lastName": "",
        "email": "",
        "club": "",
    }


def resolve_manager_name(
    req: models.ManagerRequest,
    *,
    manager_user: Optional[models.PowermusicUser] = None,
) -> str:
    if manager_user is not None:
        return user_display_name(manager_user)
    return ""


def resolve_handled_by_name(
    req: models.ManagerRequest,
    *,
    admin_user: Optional[models.PowermusicUser] = None,
) -> str:
    if admin_user is not None:
        return user_display_name(admin_user)
    if req.status == "handled":
        return "Power Music Admin"
    return ""


def hydrate_request_users(
    db: Session,
    requests: list[models.ManagerRequest],
) -> None:
    manager_ids = {req.manager_id for req in requests if req.manager_id}
    admin_ids = {req.handled_by_admin_id for req in requests if req.handled_by_admin_id}
    managers = load_users_by_id(db, manager_ids)
    admins = load_users_by_id(db, admin_ids)
    for req in requests:
        req._manager_user = managers.get(req.manager_id)
        req._admin_user = admins.get(req.handled_by_admin_id)
