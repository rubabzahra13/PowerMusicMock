"""Same-person matching for roster requests, auto-email intake, and directory checks."""

from __future__ import annotations

from typing import Optional, Union

from app import models, schemas


def _norm(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _norm_name(first: Optional[str], last: Optional[str]) -> str:
    return _norm(f"{first or ''} {last or ''}")


def person_from_model(row: models.ManagerRequest) -> schemas.PersonInfo:
    return schemas.PersonInfo(
        firstName=row.person_first_name or "",
        lastName=row.person_last_name or "",
        email=row.person_email or "",
        location=row.person_location or "",
    )


def same_person(
    left: Union[schemas.PersonInfo, models.ManagerRequest],
    right: Union[schemas.PersonInfo, models.ManagerRequest],
) -> bool:
    """True when any of the agreed identity rules match."""
    if isinstance(left, models.ManagerRequest):
        left = person_from_model(left)
    if isinstance(right, models.ManagerRequest):
        right = person_from_model(right)

    name_l = _norm_name(left.firstName, left.lastName)
    name_r = _norm_name(right.firstName, right.lastName)
    email_l = _norm(left.email)
    email_r = _norm(right.email)
    loc_l = _norm(left.location)
    loc_r = _norm(right.location)

    name_match = bool(name_l and name_r and name_l == name_r)
    email_match = bool(email_l and email_r and email_l == email_r)
    loc_match = bool(loc_l and loc_r and loc_l == loc_r)

    if name_match and email_match and loc_match:
        return True
    if name_match and email_match:
        return True
    if email_match and loc_match:
        return True
    if name_match and loc_match:
        return True
    if email_match:
        return True
    return False
