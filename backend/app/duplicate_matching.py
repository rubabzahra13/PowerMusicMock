"""Duplicate matching logic supporting name derivatives, location probes, and false-positive dismissal checks."""

from __future__ import annotations

from typing import Callable, List, Optional, Set, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app import models, schemas


import re

# ---------------------------------------------------------------------------
# Partner capability detection
# ---------------------------------------------------------------------------

_HEALTHTECH_PARTNER_CACHE: dict[str, bool] = {}


def is_healthtech_partner(db: Session, partner_id: Optional[str]) -> bool:
    """Return True when *partner_id* belongs to the HealthTech partner.

    The check is name-based (case-insensitive substring) so it survives
    partner renames as long as the word 'healthtech' or 'health tech' is
    present. Results are cached for the lifetime of the process (partners
    don't change at runtime).
    """
    if not partner_id:
        return False
    if partner_id in _HEALTHTECH_PARTNER_CACHE:
        return _HEALTHTECH_PARTNER_CACHE[partner_id]
    partner = db.query(models.Partner).filter(models.Partner.id == partner_id).first()
    name_lower = (partner.name if partner else "").lower()
    result = "healthtech" in name_lower or "health tech" in name_lower
    _HEALTHTECH_PARTNER_CACHE[partner_id] = result
    return result


def is_healthtech_from_request(db: Session, req: models.ManagerRequest) -> bool:
    """Convenience wrapper — detect HealthTech from a ManagerRequest instance."""
    return is_healthtech_partner(db, req.partner_id)

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


POTENTIAL_DUPLICATE_THRESHOLD = 45.0

def match_classification(
    left: schemas.PersonInfo,
    right: schemas.PersonInfo,
) -> Tuple[Optional[str], float]:
    """Returns ('confirmed_duplicate' | 'potential_duplicate' | None, score).

    PureGym / legacy 4-field implementation. DO NOT MODIFY — this function
    is the source of truth for all non-HealthTech partners. HealthTech uses
    match_classification_for_partner() instead.
    """
    first_l, last_l, email_l, loc_l = _norm(left.firstName), _norm(left.lastName), _norm(left.email), _norm(left.location)
    first_r, last_r, email_r, loc_r = _norm(right.firstName), _norm(right.lastName), _norm(right.email), _norm(right.location)

    if not last_l or not last_r:
        return None

    same_last = (last_l == last_r)
    same_first = (first_l == first_r)
    same_email = bool(email_l and email_r and email_l == email_r)
    same_loc = bool(loc_l and loc_r and loc_l == loc_r)

    # 2. Potential Duplicate (Deterministic Field Scoring)
    first_name_score = jaro_winkler(first_l, first_r) * 30.0
    last_name_score = jaro_winkler(last_l, last_r) * 35.0
    loc_score = 25.0 if same_loc else 0.0
    email_score = 10.0 if same_email else 0.0

    total_score = first_name_score + last_name_score + email_score + loc_score

    # 1. Confirmed Duplicate (strict rule)
    # Identical across all relevant fields (First Name + Last Name + Email + Location)
    # Empty fields do not contribute to a confirmed match due to existing safeguards in same_email/same_loc.
    if same_first and same_last and same_email and same_loc:
        return "confirmed_duplicate", total_score

    if total_score >= POTENTIAL_DUPLICATE_THRESHOLD:
        return "potential_duplicate", total_score

    return None, total_score


# ---------------------------------------------------------------------------
# HealthTech 6-field matching
# ---------------------------------------------------------------------------

# HealthTech weights for the two new fields — treated as normal peers, not
# boosted. The base 4-field total is 100 pts; we rescale so the 6-field
# total is still 100 pts, keeping the existing threshold meaningful.
#
# Original weights:  first=30, last=35, loc=25, email=10  => 100
# New weights:       first=25, last=29, loc=21, email=8, supervisor=9, hospital=8  => 100
#
# The threshold (45.0) is identical — conceptually the same fraction of
# the maximum score must be met.

_HT_W_FIRST    = 25.0
_HT_W_LAST     = 29.0
_HT_W_LOC      = 21.0
_HT_W_EMAIL    =  8.0
_HT_W_SUPER    =  9.0
_HT_W_HOSP     =  8.0


def _match_classification_healthtech(
    left: schemas.PersonInfo,
    right: schemas.PersonInfo,
) -> Tuple[Optional[str], float]:
    """HealthTech 6-field variant. Returns same classification tokens as the
    4-field version so all downstream code is unchanged."""
    first_l = _norm(left.firstName)
    last_l  = _norm(left.lastName)
    email_l = _norm(left.email)
    loc_l   = _norm(left.location)
    sup_l   = _norm(getattr(left,  'supervisor', None))
    hosp_l  = _norm(getattr(left,  'hospital',   None))

    first_r = _norm(right.firstName)
    last_r  = _norm(right.lastName)
    email_r = _norm(right.email)
    loc_r   = _norm(right.location)
    sup_r   = _norm(getattr(right, 'supervisor', None))
    hosp_r  = _norm(getattr(right, 'hospital',   None))

    if not last_l or not last_r:
        return None

    same_first  = (first_l == first_r)
    same_last   = (last_l  == last_r)
    same_email  = bool(email_l and email_r and email_l == email_r)
    same_loc    = bool(loc_l   and loc_r   and loc_l   == loc_r)
    same_super  = bool(sup_l   and sup_r   and sup_l   == sup_r)
    same_hosp   = bool(hosp_l  and hosp_r  and hosp_l  == hosp_r)

    # Potential duplicate scoring — reuse Jaro-Winkler for name fields,
    # exact-match for the remaining deterministic fields.
    first_score = jaro_winkler(first_l, first_r) * _HT_W_FIRST
    last_score  = jaro_winkler(last_l,  last_r)  * _HT_W_LAST
    loc_score   = _HT_W_LOC   if same_loc   else 0.0
    email_score = _HT_W_EMAIL if same_email  else 0.0
    super_score = _HT_W_SUPER if same_super  else 0.0
    hosp_score  = _HT_W_HOSP  if same_hosp   else 0.0

    total_score = first_score + last_score + loc_score + email_score + super_score + hosp_score

    # Confirmed duplicate: ALL SIX fields must match exactly.
    if same_first and same_last and same_email and same_loc and same_super and same_hosp:
        return "confirmed_duplicate", total_score

    if total_score >= POTENTIAL_DUPLICATE_THRESHOLD:
        return "potential_duplicate", total_score

    return None, total_score


def match_classification_for_partner(
    left: schemas.PersonInfo,
    right: schemas.PersonInfo,
    *,
    is_healthtech: bool = False,
) -> Tuple[Optional[str], float]:
    """Partner-aware wrapper.

    When *is_healthtech* is True, evaluates all six HealthTech fields.
    Otherwise delegates to the unchanged 4-field PureGym implementation.
    """
    if is_healthtech:
        return _match_classification_healthtech(left, right)
    return match_classification(left, right)
