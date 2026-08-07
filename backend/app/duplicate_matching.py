"""Duplicate matching logic supporting name derivatives, location probes, and false-positive dismissal checks."""

from __future__ import annotations

from typing import List, Optional, Set, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app import models, schemas


import re

def _norm(val: Optional[str]) -> str:
    if not val:
        return ""
    val = val.strip().lower()
    return re.sub(r'\s+', ' ', val)

def jaro_winkler(s1: str, s2: str) -> float:
    if s1 == s2:
        return 1.0
    if not s1 or not s2:
        return 0.0

    len1, len2 = len(s1), len(s2)
    match_distance = max(len1, len2) // 2 - 1

    matches = 0
    hash1 = [False] * len1
    hash2 = [False] * len2

    for i in range(len1):
        start = max(0, i - match_distance)
        end = min(len2, i + match_distance + 1)
        for j in range(start, end):
            if not hash2[j] and s1[i] == s2[j]:
                hash1[i] = True
                hash2[j] = True
                matches += 1
                break

    if matches == 0:
        return 0.0

    t = 0
    point = 0
    for i in range(len1):
        if hash1[i]:
            while not hash2[point]:
                point += 1
            if s1[i] != s2[point]:
                t += 1
            point += 1
    t /= 2

    m = float(matches)
    jaro = (m / len1 + m / len2 + (m - t) / m) / 3.0

    prefix = 0
    for i in range(min(4, min(len1, len2))):
        if s1[i] == s2[i]:
            prefix += 1
        else:
            break

    return jaro + prefix * 0.1 * (1.0 - jaro)


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


POTENTIAL_DUPLICATE_THRESHOLD = 60.0

def match_classification(
    left: schemas.PersonInfo,
    right: schemas.PersonInfo,
) -> Optional[str]:
    """Returns 'confirmed_duplicate', 'potential_duplicate', or None."""
    first_l, last_l, email_l, loc_l = _norm(left.firstName), _norm(left.lastName), _norm(left.email), _norm(left.location)
    first_r, last_r, email_r, loc_r = _norm(right.firstName), _norm(right.lastName), _norm(right.email), _norm(right.location)

    if not last_l or not last_r:
        return None

    same_last = (last_l == last_r)
    same_first = (first_l == first_r)
    same_email = bool(email_l and email_r and email_l == email_r)
    same_loc = bool(loc_l and loc_r and loc_l == loc_r)

    # 1. Confirmed Duplicate (existing hard rules retained)
    # Identical name + email OR identical email + location OR identical name + email + location
    if same_first and same_last and same_email:
        return "confirmed_duplicate"
    if same_email and same_loc and same_last:
        return "confirmed_duplicate"
    if same_email and same_first and same_last:
        return "confirmed_duplicate"

    # 2. Potential Duplicate (Deterministic Field Scoring)
    first_name_score = jaro_winkler(first_l, first_r) * 25.0
    last_name_score = jaro_winkler(last_l, last_r) * 30.0
    email_score = 25.0 if same_email else 0.0
    loc_score = 20.0 if same_loc else 0.0

    total_score = first_name_score + last_name_score + email_score + loc_score

    if total_score >= POTENTIAL_DUPLICATE_THRESHOLD:
        return "potential_duplicate"

    return None
