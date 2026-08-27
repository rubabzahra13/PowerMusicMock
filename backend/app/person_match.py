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
        supervisor=getattr(row, "person_supervisor", None) or getattr(row, "supervisor", None) or None,
        hospital=getattr(row, "person_hospital", None) or getattr(row, "hospital", None) or None,
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


def same_person_extended(
    left: Union[schemas.PersonInfo, models.ManagerRequest],
    right: Union[schemas.PersonInfo, models.ManagerRequest],
) -> bool:
    """True when all SIX HealthTech identity fields match exactly.

    This is the partner-aware exact-match check used when both requests
    belong to the HealthTech partner. The original same_person() (4 fields)
    is unchanged and must not be modified.
    """
    if isinstance(left, models.ManagerRequest):
        left = person_from_model(left)
    if isinstance(right, models.ManagerRequest):
        right = person_from_model(right)

    first_l = _norm(left.firstName)
    first_r = _norm(right.firstName)
    last_l  = _norm(left.lastName)
    last_r  = _norm(right.lastName)
    email_l = _norm(left.email)
    email_r = _norm(right.email)
    loc_l   = _norm(left.location)
    loc_r   = _norm(right.location)
    sup_l   = _norm(getattr(left,  'supervisor', None))
    sup_r   = _norm(getattr(right, 'supervisor', None))
    hosp_l  = _norm(getattr(left,  'hospital',   None))
    hosp_r  = _norm(getattr(right, 'hospital',   None))

    same_first = (first_l == first_r)
    same_last  = (last_l  == last_r)
    same_email = bool(email_l and email_r and email_l == email_r)
    same_loc   = bool(loc_l   and loc_r   and loc_l   == loc_r)
    same_super = bool(sup_l   and sup_r   and sup_l   == sup_r)
    same_hosp  = bool(hosp_l  and hosp_r  and hosp_l  == hosp_r)

    return same_first and same_last and same_email and same_loc and same_super and same_hosp


def same_person_for_partner(
    left: Union[schemas.PersonInfo, models.ManagerRequest],
    right: Union[schemas.PersonInfo, models.ManagerRequest],
    *,
    is_healthtech: bool = False,
) -> bool:
    """Partner-aware exact-match check.

    When *is_healthtech* is True, all six fields must match (same_person_extended).
    Otherwise delegates to the unchanged 4-field same_person() for PureGym.
    """
    if is_healthtech:
        return same_person_extended(left, right)
    return same_person(left, right)
