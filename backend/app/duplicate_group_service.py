"""Service functions for grouping related duplicate requests, maintaining representative requests,
and handling admin unlinking decisions.

Design constraints
──────────────────
* Do NOT modify or overwrite original request field values (first_name, email, …).
  Groups store the *relationship* between requests, not merged data.
* Each request keeps its original snapshot for audit/history purposes.
* The representative request is always the *latest* (by received_at) active member.
* db.commit() is intentionally absent here — callers (routers) commit.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Set, Tuple
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app import models, schemas
from app.duplicate_matching import are_requests_dismissed, get_all_dismissed_pairs, match_classification
from app.manager_request_tags import (
    TAG_ALREADY_EXISTS,
    TAG_CONFIRMED_DUPLICATE,
    TAG_POTENTIAL_DUPLICATE,
    merge_tags,
)
from app.person_match import person_from_model


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _new_group_id() -> str:
    return f"dup-grp-{uuid.uuid4().hex[:12]}"


def _clear_duplicate_tags(req: models.ManagerRequest) -> None:
    """Scrub all duplicate-related tags from a request."""
    if not req.tags:
        return
    tags_to_remove = {TAG_CONFIRMED_DUPLICATE, TAG_POTENTIAL_DUPLICATE, TAG_ALREADY_EXISTS}
    original_len = len(req.tags)
    req.tags = [t for t in req.tags if t not in tags_to_remove]
    if len(req.tags) != original_len:
        flag_modified(req, "tags")


def _best_classification(
    classification_a: Optional[str],
    classification_b: Optional[str],
) -> Optional[str]:
    """Return the more severe of two classification strings.

    Severity order: confirmed_duplicate > potential_duplicate > already_exists > None
    """
    order = {
        "confirmed_duplicate": 4,
        "already_exists_conflict": 3,
        "potential_duplicate": 2,
        "already_exists": 1,
        None: 0,
    }
    if order.get(classification_a, 0) >= order.get(classification_b, 0):
        return classification_a
    return classification_b


def _pending_candidates(
    db: Session,
    req: models.ManagerRequest,
    *,
    exclude_id: Optional[str] = None,
    limit: int = 100,
) -> List[models.ManagerRequest]:
    """Fetch candidate new requests in the same partner context matching last_name or email."""
    q = db.query(models.ManagerRequest).filter(
        models.ManagerRequest.status == "new",
    )
    if exclude_id:
        q = q.filter(models.ManagerRequest.id != exclude_id)
    if req.partner_id:
        q = q.filter(models.ManagerRequest.partner_id == req.partner_id)

    from sqlalchemy import func, and_
    last_name = (req.person_last_name or "").strip().lower()
    first_name = (req.person_first_name or "").strip().lower()
    email = (req.person_email or "").strip().lower()
    filters = []
    if last_name:
        filters.append(func.lower(models.ManagerRequest.person_last_name) == last_name)
    if email:
        filters.append(func.lower(models.ManagerRequest.person_email) == email)
    if first_name and len(first_name) >= 3 and last_name and len(last_name) >= 3:
        filters.append(and_(
            func.lower(models.ManagerRequest.person_first_name).startswith(first_name[:3]),
            func.lower(models.ManagerRequest.person_last_name).startswith(last_name[:3])
        ))
    if filters:
        q = q.filter(or_(*filters))

    return q.order_by(models.ManagerRequest.received_at.desc()).limit(limit).all()


def _directory_candidates(
    db: Session,
    req: models.ManagerRequest,
    *,
    limit: int = 100,
) -> List[models.ManagerRequest]:
    """Fetch handled directory rows for conflict detection matching last_name or email."""
    q = db.query(models.ManagerRequest).filter(
        models.ManagerRequest.status == "handled",
        models.ManagerRequest.outcome == "Added",
        models.ManagerRequest.archived_at.is_(None),
    )
    if req.partner_id:
        q = q.filter(models.ManagerRequest.partner_id == req.partner_id)

    from sqlalchemy import func, and_
    last_name = (req.person_last_name or "").strip().lower()
    first_name = (req.person_first_name or "").strip().lower()
    email = (req.person_email or "").strip().lower()
    filters = []
    if last_name:
        filters.append(func.lower(models.ManagerRequest.person_last_name) == last_name)
    if email:
        filters.append(func.lower(models.ManagerRequest.person_email) == email)
    if first_name and len(first_name) >= 3 and last_name and len(last_name) >= 3:
        filters.append(and_(
            func.lower(models.ManagerRequest.person_first_name).startswith(first_name[:3]),
            func.lower(models.ManagerRequest.person_last_name).startswith(last_name[:3])
        ))
    if filters:
        q = q.filter(or_(*filters))

    return q.order_by(models.ManagerRequest.handled_at.desc()).limit(limit).all()


# ---------------------------------------------------------------------------
# Core grouping entry point
# ---------------------------------------------------------------------------


def process_request_grouping(
    db: Session,
    req: models.ManagerRequest,
    *,
    pending_candidates: Optional[List[models.ManagerRequest]] = None,
    directory_candidates: Optional[List[models.ManagerRequest]] = None,
    dismissed_set: Optional[Set[Tuple[str, str]]] = None,
) -> Optional[models.DuplicateGroup]:
    """Find or create a DuplicateGroup for *req*, preserving all original request data."""
    if not req or req.status != "new":
        return None

    # If already grouped (e.g., re-evaluated), just sync and return.
    if req.duplicate_group_id:
        group = (
            db.query(models.DuplicateGroup)
            .filter(models.DuplicateGroup.id == req.duplicate_group_id)
            .first()
        )
        if group:
            _sync_group_representative_and_tags(db, group)
            return group

    req_person = person_from_model(req)

    # ── Step 1: scan pending new requests for a match ───────────────────────
    if pending_candidates is not None:
        candidates = [
            c for c in pending_candidates
            if c.id != req.id
            and c.status == "new"
            and (not req.partner_id or c.partner_id == req.partner_id)
        ]
    else:
        candidates = _pending_candidates(db, req, exclude_id=req.id)

    best_match_req: Optional[models.ManagerRequest] = None
    best_classification: Optional[str] = None

    for cand in candidates:
        if are_requests_dismissed(db, req.id, cand.id, dismissed_set=dismissed_set):
            continue
        classification = match_classification(req_person, person_from_model(cand))
        if classification:
            if best_classification is None or (
                classification == "confirmed_duplicate"
                and best_classification != "confirmed_duplicate"
            ):
                best_match_req = cand
                best_classification = classification
            if best_classification == "confirmed_duplicate":
                break

    # ── Step 2: scan directory for an already-exists conflict ───────────────
    if directory_candidates is not None:
        dir_candidates = [
            c for c in directory_candidates
            if c.status == "handled"
            and c.outcome == "Added"
            and not c.archived_at
            and (not req.partner_id or c.partner_id == req.partner_id)
        ]
    else:
        dir_candidates = _directory_candidates(db, req)

    dir_match_person: Optional[models.ManagerRequest] = None

    for dir_cand in dir_candidates:
        if are_requests_dismissed(db, req.id, dir_cand.id, dismissed_set=dismissed_set):
            continue
        classification = match_classification(req_person, person_from_model(dir_cand))
        if classification:
            dir_match_person = dir_cand
            break

    # ── Step 3: determine final classification ──────────────────────────────
    #
    # Case A — no directory match, just between pending requests
    # Case B — directory match only (no conflicting pending peers)
    # Case C — directory match + conflicting pending peers (already_exists_conflict)
    if best_match_req and dir_match_person:
        final_classification = "already_exists_conflict"
    elif best_match_req:
        final_classification = best_classification or "potential_duplicate"
    elif dir_match_person:
        final_classification = "already_exists"
    else:
        return None  # No match found — no group needed

    # ── Step 4: join an existing group or create a new one ──────────────────

    # If the best-matching pending request is already in a group, join that group.
    if best_match_req and best_match_req.duplicate_group_id:
        group = (
            db.query(models.DuplicateGroup)
            .filter(models.DuplicateGroup.id == best_match_req.duplicate_group_id)
            .first()
        )
        if group:
            req.duplicate_group_id = group.id
            # Upgrade classification if this new request makes it more severe.
            upgraded = _best_classification(group.classification, final_classification)
            if upgraded != group.classification:
                group.classification = upgraded
            if dir_match_person:
                group.directory_person_id = dir_match_person.id
            # Absorb any other ungrouped candidates into this group too.
            _absorb_ungrouped_matches(
                db, group, req_person, exclude_id=req.id, ungrouped_candidates=candidates
            )
            members = [req] + [c for c in candidates if c.duplicate_group_id == group.id]
            _sync_group_representative_and_tags(db, group, member_requests=members)
            # db.flush()
            return group

    # Create a brand-new group.
    group = models.DuplicateGroup(
        id=_new_group_id(),
        partner_id=req.partner_id,
        classification=final_classification,
        status="active",
        created_at=datetime.now(timezone.utc),
        directory_person_id=dir_match_person.id if dir_match_person else None,
        representative_request_id=req.id,
    )
    db.add(group)
    # db.flush()

    req.duplicate_group_id = group.id

    if best_match_req:
        best_match_req.duplicate_group_id = group.id

    # Absorb any remaining ungrouped candidates that also match.
    _absorb_ungrouped_matches(
        db, group, req_person, exclude_id=req.id, ungrouped_candidates=candidates, dismissed_set=dismissed_set
    )

    members = [req] + [c for c in candidates if c.duplicate_group_id == group.id]
    if best_match_req and best_match_req not in members:
        members.append(best_match_req)
    _sync_group_representative_and_tags(db, group, member_requests=members)
    # db.flush()
    return group


def _absorb_ungrouped_matches(
    db: Session,
    group: models.DuplicateGroup,
    req_person: schemas.PersonInfo,
    *,
    exclude_id: Optional[str] = None,
    ungrouped_candidates: Optional[List[models.ManagerRequest]] = None,
    dismissed_set: Optional[Set[Tuple[str, str]]] = None,
) -> None:
    """Pull any still-ungrouped pending requests that match req_person into *group*."""
    if ungrouped_candidates is not None:
        candidates = [
            c for c in ungrouped_candidates
            if c.status == "new"
            and not c.duplicate_group_id
            and (not group.partner_id or c.partner_id == group.partner_id)
            and (not exclude_id or c.id != exclude_id)
        ]
    else:
        ungrouped_q = db.query(models.ManagerRequest).filter(
            models.ManagerRequest.status == "new",
            models.ManagerRequest.duplicate_group_id.is_(None),
        )
        if group.partner_id:
            ungrouped_q = ungrouped_q.filter(
                models.ManagerRequest.partner_id == group.partner_id
            )
        if exclude_id:
            ungrouped_q = ungrouped_q.filter(models.ManagerRequest.id != exclude_id)
        candidates = ungrouped_q.limit(100).all()

    for cand in candidates:
        if are_requests_dismissed(db, exclude_id or "", cand.id, dismissed_set=dismissed_set):
            continue
        classification = match_classification(req_person, person_from_model(cand))
        if classification:
            cand.duplicate_group_id = group.id
            upgraded = _best_classification(group.classification, classification)
            if upgraded != group.classification:
                group.classification = upgraded


# ---------------------------------------------------------------------------
# Representative + tag sync
# ---------------------------------------------------------------------------


def _sync_group_representative_and_tags(
    db: Session,
    group: models.DuplicateGroup,
    member_requests: Optional[List[models.ManagerRequest]] = None,
) -> None:
    """Set representative to latest member; apply correct duplicate tags to it.

    Tags are only written to the REPRESENTATIVE request. Older non-representative
    group members keep their original tags for audit fidelity.
    """
    # Always fetch flushed DB members to guarantee we don't miss any older ones
    db_members = (
        db.query(models.ManagerRequest)
        .filter(models.ManagerRequest.duplicate_group_id == group.id)
        .all()
    )

    # Merge DB members with explicitly passed ones (which might not be flushed yet)
    all_members = {m.id: m for m in db_members}
    if member_requests:
        for m in member_requests:
            all_members[m.id] = m

    members = sorted(
        all_members.values(),
        key=lambda r: (
            r.received_at or datetime.min.replace(tzinfo=timezone.utc),
            r.id or "",
        ),
        reverse=True,
    )

    if not members:
        return

    latest_req = members[0]
    group.representative_request_id = latest_req.id

    # Determine which tags to apply based on the group classification.
    tags_to_add: List[str] = []
    cls = group.classification or ""

    if cls == "confirmed_duplicate":
        tags_to_add.append(TAG_CONFIRMED_DUPLICATE)
    elif cls == "potential_duplicate":
        tags_to_add.append(TAG_POTENTIAL_DUPLICATE)
    elif cls == "already_exists_conflict":
        # Both tags — there's a directory person AND conflicting pending peers.
        tags_to_add.append(TAG_ALREADY_EXISTS)
        tags_to_add.append(TAG_CONFIRMED_DUPLICATE)
    elif cls == "already_exists":
        tags_to_add.append(TAG_ALREADY_EXISTS)

    if tags_to_add:
        latest_req.tags = merge_tags(latest_req.tags, tags_to_add)
        flag_modified(latest_req, "tags")


# ---------------------------------------------------------------------------
# Admin unlink / false-positive dismissal
# ---------------------------------------------------------------------------


def unlink_duplicate_members(
    db: Session,
    group_id: str,
    request_id_1: str,
    request_id_2: str,
    admin_id: Optional[str] = None,
) -> bool:
    """Persist admin decision to unlink request_id_2 from its group.

    Stores the dismissed pair in dismissed_duplicate_matches so the engine
    never re-groups these two requests again.

    NOTE: Does NOT call db.commit() — the calling router is responsible for
    committing so this function is consistent with all other service functions.
    """
    group = (
        db.query(models.DuplicateGroup)
        .filter(models.DuplicateGroup.id == group_id)
        .first()
    )
    if not group:
        return False

    req1 = (
        db.query(models.ManagerRequest)
        .filter(models.ManagerRequest.id == request_id_1)
        .first()
    )
    req2 = (
        db.query(models.ManagerRequest)
        .filter(models.ManagerRequest.id == request_id_2)
        .first()
    )

    if not req1 or not req2:
        return False

    # Persist the dismissed pair (bidirectional guard in are_requests_dismissed).
    now = datetime.now(timezone.utc)
    dismissed = models.DismissedDuplicateMatch(
        id=f"dism-{uuid.uuid4().hex[:12]}",
        request_id_1=request_id_1,
        request_id_2=request_id_2,
        dismissed_by_admin_id=(
            admin_id if admin_id and admin_id != "dev-bypass" else None
        ),
        created_at=now,
    )
    db.add(dismissed)

    # Remove req2 from the group and scrub its tags.
    req2.duplicate_group_id = None
    _clear_duplicate_tags(req2)
    
    # Critical fix: flush the unlinked state and the new dismissed rule
    # so that subsequent database queries in the recalculation phase
    # accurately recognize that the relationship is dissolved!
    db.flush()

    # Re-evaluate remaining members.
    remaining = (
        db.query(models.ManagerRequest)
        .filter(models.ManagerRequest.duplicate_group_id == group.id)
        .all()
    )

    if len(remaining) == 0:
        group.status = "dismissed"
        group.resolved_at = now
    elif len(remaining) == 1 and not group.directory_person_id:
        remaining[0].duplicate_group_id = None
        _clear_duplicate_tags(remaining[0])
        group.status = "dismissed"
        group.resolved_at = now
    else:
        # Recalculate group classification
        dir_match = False
        peer_match_class = None

        if group.directory_person_id:
            dir_person = db.query(models.ManagerRequest).filter(models.ManagerRequest.id == group.directory_person_id).first()
            if dir_person:
                for m in remaining:
                    if not are_requests_dismissed(db, m.id, dir_person.id):
                        c = match_classification(person_from_model(m), person_from_model(dir_person))
                        if c:
                            dir_match = True
                            break
        
        for i in range(len(remaining)):
            for j in range(i+1, len(remaining)):
                if not are_requests_dismissed(db, remaining[i].id, remaining[j].id):
                    c = match_classification(person_from_model(remaining[i]), person_from_model(remaining[j]))
                    if c:
                        peer_match_class = _best_classification(peer_match_class, c)

        if dir_match and peer_match_class:
            new_class = "already_exists_conflict"
        elif dir_match:
            new_class = "already_exists"
        elif peer_match_class:
            new_class = peer_match_class
        else:
            new_class = None

        if not new_class:
            # Dissolve group! No match remains.
            for m in remaining:
                m.duplicate_group_id = None
                _clear_duplicate_tags(m)
            group.status = "dismissed"
            group.resolved_at = now
        else:
            group.classification = new_class
            for m in remaining:
                _clear_duplicate_tags(m)
            _sync_group_representative_and_tags(db, group, member_requests=remaining)

    db.flush()
    return True


# ---------------------------------------------------------------------------
# Convenience read helpers (no writes)
# ---------------------------------------------------------------------------


def get_group_members(
    db: Session,
    group_id: str,
) -> List[models.ManagerRequest]:
    """Chronologically ordered list of all requests in a group."""
    return (
        db.query(models.ManagerRequest)
        .filter(models.ManagerRequest.duplicate_group_id == group_id)
        .order_by(models.ManagerRequest.received_at.asc(), models.ManagerRequest.id.asc())
        .all()
    )


def get_active_groups(
    db: Session,
    *,
    partner_id: Optional[str] = None,
    limit: int = 200,
) -> List[models.DuplicateGroup]:
    """All active duplicate groups, optionally scoped to a partner."""
    q = db.query(models.DuplicateGroup).filter(
        models.DuplicateGroup.status == "active"
    )
    if partner_id:
        q = q.filter(models.DuplicateGroup.partner_id == partner_id)
    return q.order_by(models.DuplicateGroup.created_at.desc()).limit(limit).all()


# ---------------------------------------------------------------------------
# Task 2 — Resolution actions
# ---------------------------------------------------------------------------

# Outcome written to original group member requests when a group is resolved.
# Using "GroupResolved" (not "Added") so these rows are excluded from all
# Directory views (which filter outcome == "Added" or "Removed").
OUTCOME_GROUP_RESOLVED = "GroupResolved"


def _validate_final_values(final_values: schemas.PersonInfo) -> None:
    """Raise ValueError if any required identity field is empty."""
    errors = []
    if not (final_values.firstName or "").strip():
        errors.append("firstName")
    if not (final_values.lastName or "").strip():
        errors.append("lastName")
    if errors:
        raise ValueError(f"finalValues missing required field(s): {', '.join(errors)}")


def _mark_group_members_resolved(
    db: Session,
    group: models.DuplicateGroup,
    *,
    admin_id: Optional[str],
    now: datetime,
) -> int:
    """Set status='handled', outcome='GroupResolved' on all group member requests.

    Returns the count of rows updated.
    """
    members = get_group_members(db, group.id)
    admin_uuid = None
    if admin_id and admin_id != "dev-bypass":
        try:
            from uuid import UUID
            admin_uuid = UUID(admin_id)
        except ValueError:
            pass

    for req in members:
        if req.status == "new":
            req.status = "handled"
            req.handled_at = now
            req.outcome = OUTCOME_GROUP_RESOLVED
            if admin_uuid:
                req.handled_by_admin_id = admin_uuid
            # Strip any pending duplicate/review tags from the representative.
            from app.manager_request_tags import TAG_CONFIRMED_DUPLICATE, TAG_POTENTIAL_DUPLICATE, TAG_ALREADY_EXISTS
            cleaned = [
                t for t in (req.tags or [])
                if t not in (TAG_CONFIRMED_DUPLICATE, TAG_POTENTIAL_DUPLICATE, TAG_ALREADY_EXISTS)
            ]
            req.tags = cleaned

    return len(members)


def _finalize_group(
    db: Session,
    group: models.DuplicateGroup,
    *,
    resolution_type: str,
    final_values: Optional[schemas.PersonInfo],
    previous_values: Optional[schemas.PersonInfo],
    admin_id: Optional[str],
    admin_note: Optional[str],
    now: datetime,
) -> None:
    """Stamp resolution metadata onto the group and set status='resolved'."""
    meta: dict = {"resolution_type": resolution_type}
    if final_values:
        meta["final_values"] = {
            "firstName": final_values.firstName or "",
            "lastName": final_values.lastName or "",
            "email": final_values.email or "",
            "location": final_values.location or "",
        }
    if previous_values:
        meta["previous_values"] = {
            "firstName": previous_values.firstName or "",
            "lastName": previous_values.lastName or "",
            "email": previous_values.email or "",
            "location": previous_values.location or "",
        }
    if admin_note:
        meta["admin_note"] = admin_note

    group.resolution_metadata = meta
    group.status = "resolved"
    group.resolved_at = now
    admin_uuid = None
    if admin_id and admin_id != "dev-bypass":
        try:
            from uuid import UUID
            admin_uuid = UUID(admin_id)
        except ValueError:
            pass
    if admin_uuid:
        group.resolved_by_admin_id = admin_uuid


# ── Case A: Resolve & Add ────────────────────────────────────────────────────


def resolve_group_add(
    db: Session,
    group: models.DuplicateGroup,
    *,
    final_values: schemas.PersonInfo,
    admin_id: Optional[str],
    partner_id: Optional[str] = None,
    admin_note: Optional[str] = None,
) -> models.ManagerRequest:
    """Create ONE new Directory record from final_values, resolve the group.

    Invariants:
    - group must not already have a directory_person_id (caller should verify).
    - final_values fields are written as-is; the backend never derives them from
      the latest request automatically.
    - Original group member rows are left immutable in their historical state;
      only status/outcome/handled_at are updated on them.
    - Does NOT call db.commit() — router commits.

    Returns the newly created Directory ManagerRequest row.
    """
    _validate_final_values(final_values)

    now = datetime.now(timezone.utc)

    # Allocate an id for the new Directory row.
    from app.request_display import allocate_request_ids
    from app.manager_request_tags import TAG_VERIFIED, TAG_PARTNER_REQUEST
    (new_id,) = allocate_request_ids(db, 1)

    # Create the Directory row.  We set status="handled" and outcome="Added"
    # directly so it appears as a Directory entry.  This is a fresh row —
    # none of the original request rows are mutated into the Directory record.
    dir_row = models.ManagerRequest(
        id=new_id,
        received_at=now,
        handled_at=now,
        status="handled",
        outcome="Added",
        action="Add",
        person_first_name=(final_values.firstName or "").strip(),
        person_last_name=(final_values.lastName or "").strip(),
        person_email=(final_values.email or "").strip(),
        person_location=(final_values.location or "").strip(),
        intake_persons={
            "admin": {
                "firstName": (final_values.firstName or "").strip(),
                "lastName": (final_values.lastName or "").strip(),
                "email": (final_values.email or "").strip(),
                "location": (final_values.location or "").strip(),
            }
        },
        tags=[TAG_VERIFIED, TAG_PARTNER_REQUEST],
        partner_id=partner_id or group.partner_id,
    )
    if admin_id and admin_id != "dev-bypass":
        try:
            from uuid import UUID
            dir_row.handled_by_admin_id = UUID(admin_id)
        except ValueError:
            pass
    if admin_note:
        dir_row.admin_notes = admin_note
    db.add(dir_row)
    db.flush()

    # Link the group to the new Directory row.
    group.directory_person_id = dir_row.id

    # Mark all original group member requests as resolved (without touching their data).
    _mark_group_members_resolved(db, group, admin_id=admin_id, now=now)

    # Stamp the audit metadata and close the group.
    _finalize_group(
        db, group,
        resolution_type="add",
        final_values=final_values,
        previous_values=None,
        admin_id=admin_id,
        admin_note=admin_note,
        now=now,
    )
    db.flush()
    return dir_row


# ── Case B: Resolve & Update ─────────────────────────────────────────────────


def resolve_group_update(
    db: Session,
    group: models.DuplicateGroup,
    directory_person: models.ManagerRequest,
    *,
    final_values: schemas.PersonInfo,
    admin_id: Optional[str],
    admin_note: Optional[str] = None,
) -> models.ManagerRequest:
    """Update the existing Directory record in-place with final_values; resolve group.

    Invariants:
    - group.directory_person_id must equal directory_person.id (caller verifies).
    - Never creates a second Directory row.
    - Original group member rows are left immutable.
    - Does NOT call db.commit() — router commits.

    Returns the updated Directory ManagerRequest row.
    """
    _validate_final_values(final_values)

    now = datetime.now(timezone.utc)

    # Snapshot the current values for audit BEFORE modifying.
    previous = schemas.PersonInfo(
        firstName=directory_person.person_first_name or "",
        lastName=directory_person.person_last_name or "",
        email=directory_person.person_email or "",
        location=directory_person.person_location or "",
    )

    # Update the Directory row in-place.
    directory_person.person_first_name = (final_values.firstName or "").strip()
    directory_person.person_last_name = (final_values.lastName or "").strip()
    directory_person.person_email = (final_values.email or "").strip()
    directory_person.person_location = (final_values.location or "").strip()

    # Also keep the intake_persons JSONB snapshot in sync.
    if directory_person.intake_persons and isinstance(directory_person.intake_persons, dict):
        updated = dict(directory_person.intake_persons)
        new_snap = {
            "firstName": directory_person.person_first_name,
            "lastName": directory_person.person_last_name,
            "email": directory_person.person_email,
            "location": directory_person.person_location,
        }
        for key in ("partner", "autoMail", "admin"):
            if key in updated and isinstance(updated[key], dict):
                updated[key] = {**updated[key], **new_snap}
        directory_person.intake_persons = updated

    if admin_note:
        directory_person.admin_notes = admin_note

    # Mark all original group member requests as resolved.
    _mark_group_members_resolved(db, group, admin_id=admin_id, now=now)

    # Stamp audit metadata and close the group.
    _finalize_group(
        db, group,
        resolution_type="update",
        final_values=final_values,
        previous_values=previous,
        admin_id=admin_id,
        admin_note=admin_note,
        now=now,
    )
    db.flush()
    return directory_person


# ── Case C: Resolve — Keep Existing ─────────────────────────────────────────


def resolve_group_keep_existing(
    db: Session,
    group: models.DuplicateGroup,
    *,
    admin_id: Optional[str],
    admin_note: Optional[str] = None,
) -> int:
    """Resolve group without modifying the Directory; discard all incoming requests.

    Invariants:
    - Directory record is left completely unchanged.
    - Original group member rows are left immutable.
    - Does NOT call db.commit() — router commits.

    Returns the count of requests marked as resolved.
    """
    now = datetime.now(timezone.utc)

    count = _mark_group_members_resolved(db, group, admin_id=admin_id, now=now)

    _finalize_group(
        db, group,
        resolution_type="keep_existing",
        final_values=None,
        previous_values=None,
        admin_id=admin_id,
        admin_note=admin_note,
        now=now,
    )
    db.flush()
    return count


# ── Preview helper (no writes) ───────────────────────────────────────────────

_FIELD_LABELS = {
    "firstName": "First Name",
    "lastName": "Last Name",
    "email": "Email",
    "location": "Location",
}


def preview_resolve_update(
    directory_person: models.ManagerRequest,
    final_values: schemas.PersonInfo,
) -> dict:
    """Return a side-by-side diff of current vs proposed Directory values. No DB writes."""
    current = {
        "firstName": directory_person.person_first_name or "",
        "lastName": directory_person.person_last_name or "",
        "email": directory_person.person_email or "",
        "location": directory_person.person_location or "",
    }
    proposed = {
        "firstName": (final_values.firstName or "").strip(),
        "lastName": (final_values.lastName or "").strip(),
        "email": (final_values.email or "").strip(),
        "location": (final_values.location or "").strip(),
    }

    field_diffs = []
    any_changed = False
    for key, label in _FIELD_LABELS.items():
        changed = current[key] != proposed[key]
        if changed:
            any_changed = True
        field_diffs.append({
            "field": key,
            "label": label,
            "currentValue": current[key],
            "proposedValue": proposed[key],
            "changed": changed,
        })

    return {
        "directoryPersonId": directory_person.id,
        "currentValues": schemas.PersonInfo(
            firstName=current["firstName"],
            lastName=current["lastName"],
            email=current["email"],
            location=current["location"],
        ),
        "proposedValues": final_values,
        "fields": field_diffs,
        "anyChanged": any_changed,
    }


def backfill_duplicate_groups(db: Session, dry_run: bool = False) -> dict:
    """Evaluate all existing unhandled requests under duplicate/Directory matching rules.

    Assigns duplicate_group_id, creates DuplicateGroup records, and syncs tags.
    If dry_run=True, performs calculations in a transaction and rolls back at the end.
    """
    unhandled_requests = (
        db.query(models.ManagerRequest)
        .filter(models.ManagerRequest.status == "new")
        .order_by(models.ManagerRequest.received_at.asc(), models.ManagerRequest.id.asc())
        .all()
    )

    initial_grouped_ids = {r.id for r in unhandled_requests if r.duplicate_group_id is not None}
    initial_already_exists_ids = {r.id for r in unhandled_requests if TAG_ALREADY_EXISTS in (r.tags or [])}
    initial_needs_review_ids = {
        r.id
        for r in unhandled_requests
        if any(
            t in (r.tags or [])
            for t in (TAG_ALREADY_EXISTS, TAG_CONFIRMED_DUPLICATE, TAG_POTENTIAL_DUPLICATE)
        )
    }

    # Pre-build candidate index to avoid N^2 DB round-trips
    name_counts = {}
    email_counts = {}
    for req in unhandled_requests:
        l_name = (req.person_last_name or "").strip().lower()
        l_email = (req.person_email or "").strip().lower()
        if l_name:
            name_counts[l_name] = name_counts.get(l_name, 0) + 1
        if l_email:
            email_counts[l_email] = email_counts.get(l_email, 0) + 1

    directory_rows = (
        db.query(models.ManagerRequest)
        .filter(
            models.ManagerRequest.status == "handled",
            models.ManagerRequest.outcome == "Added",
            models.ManagerRequest.archived_at.is_(None),
        )
        .all()
    )
    dir_last_names = {(d.person_last_name or "").strip().lower() for d in directory_rows if d.person_last_name}
    dir_emails = {(d.person_email or "").strip().lower() for d in directory_rows if d.person_email}

    dismissed_set = get_all_dismissed_pairs(db)
    groups_created = []

    for req in unhandled_requests:
        if req.duplicate_group_id:
            continue

        l_name = (req.person_last_name or "").strip().lower()
        l_email = (req.person_email or "").strip().lower()

        # Check if there is any candidate peer or directory match
        has_peer = (l_name and name_counts.get(l_name, 0) > 1) or (l_email and email_counts.get(l_email, 0) > 1)
        has_dir = (l_name and l_name in dir_last_names) or (l_email and l_email in dir_emails)

        if not has_peer and not has_dir:
            continue

        group = process_request_grouping(
            db,
            req,
            pending_candidates=unhandled_requests,
            directory_candidates=directory_rows,
            dismissed_set=dismissed_set,
        )
        if group and group not in groups_created:
            groups_created.append(group)

    final_unhandled = unhandled_requests

    final_grouped_ids = {r.id for r in final_unhandled if r.duplicate_group_id is not None}
    final_already_exists_ids = {r.id for r in final_unhandled if TAG_ALREADY_EXISTS in (r.tags or [])}
    final_needs_review_ids = {
        r.id
        for r in final_unhandled
        if any(
            t in (r.tags or [])
            for t in (TAG_ALREADY_EXISTS, TAG_CONFIRMED_DUPLICATE, TAG_POTENTIAL_DUPLICATE)
        )
    }

    newly_grouped = final_grouped_ids - initial_grouped_ids
    newly_already_exists = final_already_exists_ids - initial_already_exists_ids
    newly_needs_review = final_needs_review_ids - initial_needs_review_ids

    sample_groupings = []
    for g in groups_created[:10]:
        members = [m for m in unhandled_requests if m.duplicate_group_id == g.id]
        sample_groupings.append({
            "group_id": g.id,
            "classification": g.classification,
            "directory_person_id": g.directory_person_id,
            "representative_request_id": g.representative_request_id,
            "member_count": len(members),
            "members": [
                {
                    "id": m.id,
                    "name": f"{m.person_first_name} {m.person_last_name}",
                    "email": m.person_email,
                    "received_at": m.received_at.isoformat() if m.received_at else None,
                }
                for m in members
            ],
        })

    summary = {
        "dry_run": dry_run,
        "total_unhandled_requests_scanned": len(unhandled_requests),
        "requests_newly_grouped": len(newly_grouped),
        "requests_newly_flagged_already_exists": len(newly_already_exists),
        "requests_newly_flagged_needs_review": len(newly_needs_review),
        "total_groups_created": len(groups_created),
        "sample_groupings": sample_groupings,
    }

    if dry_run:
        db.rollback()
    else:
        db.commit()

    return summary

