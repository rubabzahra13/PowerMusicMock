"""Serialize manager_requests for API responses."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from datetime import datetime

from sqlalchemy.orm import Session

from app import models
from app.directory_person_match import (
    find_directory_conflict,
    request_person_for_match,
)
from app.manager_request_views import is_request_unread
from app.manager_request_tags import TAG_ALREADY_EXISTS, merge_tags
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


def request_to_api_dict(
    req: models.ManagerRequest,
    *,
    manager_user: Optional[models.PowermusicUser] = None,
    admin_user: Optional[models.PowermusicUser] = None,
    directory_row: Optional[models.ManagerRequest] = None,
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
        "notes": req.manager_notes,
        "managerNotes": req.manager_notes,
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
    return payload


def requests_to_api_dicts(db: Session, requests: List[models.ManagerRequest]) -> List[Dict[str, Any]]:
    rows = list(requests)
    hydrate_request_users(db, rows)
    results: List[Dict[str, Any]] = []
    for req in rows:
        directory_row = _directory_conflict_for_request(db, req)
        results.append(
            request_to_api_dict(req, directory_row=directory_row),
        )
    return results


def directory_person_to_api_dict(
    req: models.ManagerRequest,
    *,
    manager_user: Optional[models.PowermusicUser] = None,
    admin_user: Optional[models.PowermusicUser] = None,
) -> Dict[str, Any]:
    if manager_user is None:
        manager_user = getattr(req, "_manager_user", None)
    if admin_user is None:
        admin_user = getattr(req, "_admin_user", None)

    manager_fields = resolve_manager_fields(req, manager_user=manager_user)
    manager_name = resolve_manager_name(req, manager_user=manager_user)
    handled_by = resolve_handled_by_name(req, admin_user=admin_user)

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
        "managerNotes": req.manager_notes,
        "adminNotes": req.admin_notes,
        "notes": req.manager_notes,
    }


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
        "notes": req.manager_notes,
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
    items = list(rows)
    hydrate_request_users(db, items)
    return [directory_person_to_api_dict(req) for req in items]
