"""Duplicate matching logic supporting name derivatives, location probes, and false-positive dismissal checks."""

from __future__ import annotations

from typing import List, Optional, Set, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app import models, schemas


# Bidirectional alias sets for name derivatives
ALIAS_GROUPS: List[Set[str]] = [
    {"steve", "steven", "stephen"},
    {"mike", "michael"},
    {"josh", "joshua"},
    {"dan", "daniel", "danny"},
    {"alex", "alexander", "alexandra"},
    {"chris", "christopher", "christine"},
    {"matt", "matthew"},
    {"sam", "samantha", "samuel"},
    {"rob", "robert", "bob", "bobby"},
    {"dave", "david"},
    {"tom", "thomas", "tommy"},
    {"jim", "james", "jimmy"},
    {"ben", "benjamin"},
    {"nick", "nicholas"},
    {"ed", "edward", "eddie"},
    {"joe", "joseph"},
    {"will", "william", "bill"},
    {"greg", "gregory"},
    {"andy", "andrew"},
]


def _norm(val: Optional[str]) -> str:
    return (val or "").strip().lower()


def is_name_alias(first1: Optional[str], first2: Optional[str]) -> bool:
    f1 = _norm(first1)
    f2 = _norm(first2)
    if not f1 or not f2:
        return False
    if f1 == f2:
        return True
    if f1.startswith(f2) or f2.startswith(f1):
        if min(len(f1), len(f2)) >= 3:
            return True
    for group in ALIAS_GROUPS:
        if f1 in group and f2 in group:
            return True
    return False


def get_all_dismissed_pairs(db: Session) -> Set[Tuple[str, str]]:
    """Fetch all dismissed duplicate match pairs as a set of (id1, id2) tuples."""
    rows = db.query(models.DismissedDuplicateMatch).all()
    pairs = set()
    for r in rows:
        pairs.add((r.request_id_1, r.request_id_2))
        pairs.add((r.request_id_2, r.request_id_1))
    return pairs


def are_requests_dismissed(
    db: Session,
    req_id_1: str,
    req_id_2: str,
    dismissed_set: Optional[Set[Tuple[str, str]]] = None,
) -> bool:
    """True if admin previously unlinked/dismissed a match between these two requests."""
    if not req_id_1 or not req_id_2:
        return False
    if dismissed_set is not None:
        return (req_id_1, req_id_2) in dismissed_set
    existing = (
        db.query(models.DismissedDuplicateMatch)
        .filter(
            or_(
                (models.DismissedDuplicateMatch.request_id_1 == req_id_1) & (models.DismissedDuplicateMatch.request_id_2 == req_id_2),
                (models.DismissedDuplicateMatch.request_id_1 == req_id_2) & (models.DismissedDuplicateMatch.request_id_2 == req_id_1),
            )
        )
        .first()
    )
    return existing is not None


def get_dismissed_request_ids_for(db: Session, req_id: str) -> Set[str]:
    """Set of all request IDs dismissed against req_id."""
    if not req_id:
        return set()
    rows = (
        db.query(models.DismissedDuplicateMatch)
        .filter(
            or_(
                models.DismissedDuplicateMatch.request_id_1 == req_id,
                models.DismissedDuplicateMatch.request_id_2 == req_id,
            )
        )
        .all()
    )
    dismissed = set()
    for row in rows:
        dismissed.add(row.request_id_2 if row.request_id_1 == req_id else row.request_id_1)
    return dismissed


def match_classification(
    left: schemas.PersonInfo,
    right: schemas.PersonInfo,
) -> Optional[str]:
    """Returns 'confirmed_duplicate', 'potential_duplicate', or None."""
    first_l, last_l, email_l, loc_l = _norm(left.firstName), _norm(left.lastName), _norm(left.email), _norm(left.location)
    first_r, last_r, email_r, loc_r = _norm(right.firstName), _norm(right.lastName), _norm(right.email), _norm(right.location)

    if not last_l or not last_r:
        return None

    # Exact or alias name match check
    same_last = (last_l == last_r)
    same_first = (first_l == first_r)
    alias_first = is_name_alias(first_l, first_r)
    same_email = bool(email_l and email_r and email_l == email_r)
    same_loc = bool(loc_l and loc_r and loc_l == loc_r)

    # 1. Confirmed Duplicate:
    # Identical name + email OR identical email + location OR identical name + email + location
    if same_first and same_last and same_email:
        return "confirmed_duplicate"
    if same_last and alias_first and same_email and same_loc:
        return "confirmed_duplicate"
    if same_email and same_loc and same_last:
        return "confirmed_duplicate"
    if same_email and same_first and same_last:
        return "confirmed_duplicate"

    # 2. Potential Duplicate:
    # Same last name + location + (same first or alias first)
    if same_last and same_loc and (same_first or alias_first):
        return "potential_duplicate"
    # Same name + location, but different emails
    if same_first and same_last and same_loc:
        return "potential_duplicate"
    # Same email only (different name/location)
    if same_email:
        return "potential_duplicate"

    return None
