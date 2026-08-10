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
    """True when all of the agreed identity fields match exactly."""
    if isinstance(left, models.ManagerRequest):
        left = person_from_model(left)
    if isinstance(right, models.ManagerRequest):
        right = person_from_model(right)

    first_l = _norm(left.firstName)
    first_r = _norm(right.firstName)
    last_l = _norm(left.lastName)
    last_r = _norm(right.lastName)
    email_l = _norm(left.email)
    email_r = _norm(right.email)
    loc_l = _norm(left.location)
    loc_r = _norm(right.location)

    same_first = (first_l == first_r)
    same_last = (last_l == last_r)
    same_email = bool(email_l and email_r and email_l == email_r)
    same_loc = bool(loc_l and loc_r and loc_l == loc_r)

    if same_first and same_last and same_email and same_loc:
        return True

    return False
