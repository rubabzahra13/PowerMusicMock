"""Persist partner vs auto-mail person snapshots on manager_requests."""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from app import models, schemas
from app.manager_request_tags import TAG_AUTO_MAIL, TAG_PARTNER_REQUEST, has_tag
from app.person_compare import person_from_mapping, person_to_mapping


def get_intake_persons(req: models.ManagerRequest) -> Dict[str, Any]:
    raw = req.intake_persons or {}
    if not isinstance(raw, dict):
        return {}
    return raw


def get_partner_snapshot(req: models.ManagerRequest) -> Optional[schemas.PersonInfo]:
    return person_from_mapping(get_intake_persons(req).get("partner"))


def get_auto_mail_snapshot(req: models.ManagerRequest) -> Optional[schemas.PersonInfo]:
    return person_from_mapping(get_intake_persons(req).get("autoMail"))


def _set_snapshot(req: models.ManagerRequest, key: str, person: schemas.PersonInfo) -> None:
    current = dict(get_intake_persons(req))
    current[key] = person_to_mapping(person)
    req.intake_persons = current


def apply_person_to_row(
    req: models.ManagerRequest,
    person: schemas.PersonInfo,
    *,
    source: Literal["partner", "autoMail"],
) -> None:
    _set_snapshot(req, source, person)
    sync_display_person(req)


def sync_display_person(req: models.ManagerRequest) -> None:
    """Prefer manager submission for list/detail person fields when both exist."""
    partner = get_partner_snapshot(req)
    auto_mail = get_auto_mail_snapshot(req)
    chosen = partner or auto_mail
    if chosen is None:
        return
    req.person_first_name = chosen.firstName or ""
    req.person_last_name = chosen.lastName or ""
    req.person_email = chosen.email or ""
    req.person_location = chosen.location or ""


def bootstrap_intake_persons(req: models.ManagerRequest) -> None:
    """Backfill snapshots from legacy single person columns when JSON is empty."""
    if get_intake_persons(req):
        return

    person = schemas.PersonInfo(
        firstName=req.person_first_name,
        lastName=req.person_last_name,
        email=req.person_email,
        location=req.person_location,
    )
    tags = req.tags or []
    current: Dict[str, Any] = {}

    if has_tag(tags, TAG_PARTNER_REQUEST) or req.manager_id:
        current["partner"] = person_to_mapping(person)
    if has_tag(tags, TAG_AUTO_MAIL) or req.source_gmail_message_id:
        current["autoMail"] = person_to_mapping(person)

    if current:
        req.intake_persons = current
