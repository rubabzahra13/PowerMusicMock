"""Directory conflict detection for already-exists tagging and comparison."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app import models, schemas
from app.intake_persons import bootstrap_intake_persons, get_auto_mail_snapshot, get_partner_snapshot
from app.manager_request_tags import TAG_ALREADY_EXISTS
from app.person_match import person_from_model, same_person


def handled_directory_rows(db: Session) -> List[models.ManagerRequest]:
    return (
        db.query(models.ManagerRequest)
        .filter(
            models.ManagerRequest.status == "handled",
            models.ManagerRequest.outcome.isnot(None),
        )
        .all()
    )


def directory_outcome_conflicts(action: str, outcome: Optional[str]) -> bool:
    """True when a new request repeats an Add/Remove that already applies in the ledger."""
    if action == "Add" and outcome == "Added":
        return True
    if action == "Remove" and outcome == "Removed":
        return True
    return False


def _handled_at_sort_key(row: models.ManagerRequest) -> datetime:
    return row.handled_at or row.received_at or datetime.min.replace(tzinfo=timezone.utc)


def find_latest_directory_match(
    person: schemas.PersonInfo,
    directory_rows: List[models.ManagerRequest],
) -> Optional[models.ManagerRequest]:
    """Most recent handled row for the same person (same_person rules)."""
    for row in sorted(directory_rows, key=_handled_at_sort_key, reverse=True):
        if same_person(row, person):
            return row
    return None


def find_directory_conflict(
    *,
    person: schemas.PersonInfo,
    action: str,
    directory_rows: List[models.ManagerRequest],
) -> Optional[models.ManagerRequest]:
    """Directory row that triggers already-exists for this request action."""
    match = find_latest_directory_match(person, directory_rows)
    if match and directory_outcome_conflicts(action, match.outcome):
        return match
    return None


def active_roster_rows(db: Session) -> List[models.ManagerRequest]:
    """People currently on the roster (latest handled state is Added)."""
    handled = sorted(handled_directory_rows(db), key=_handled_at_sort_key, reverse=True)
    roster: List[models.ManagerRequest] = []
    represented: List[models.ManagerRequest] = []

    for row in handled:
        if any(same_person(row, prior) for prior in represented):
            continue
        represented.append(row)
        if row.outcome == "Added":
            roster.append(row)
    return roster


def find_roster_person(
    db: Session,
    person: schemas.PersonInfo,
) -> Optional[models.ManagerRequest]:
    """Latest directory row when the person is currently Added to the roster."""
    match = find_latest_directory_match(person, handled_directory_rows(db))
    if match and match.outcome == "Added":
        return match
    return None


def roster_match_candidates(
    db: Session,
    person: schemas.PersonInfo,
    *,
    limit: int = 10,
) -> List[models.ManagerRequest]:
    """Roster rows that match the person probe (same_person rules)."""
    matches: List[models.ManagerRequest] = []
    for row in active_roster_rows(db):
        if same_person(row, person):
            matches.append(row)
            if len(matches) >= limit:
                break
    return matches


def request_person_for_match(req: models.ManagerRequest) -> schemas.PersonInfo:
    bootstrap_intake_persons(req)
    partner = get_partner_snapshot(req)
    if partner:
        return partner
    auto_mail = get_auto_mail_snapshot(req)
    if auto_mail:
        return auto_mail
    return person_from_model(req)


def duplicate_tags_for_person(
    db: Session,
    person: schemas.PersonInfo,
    *,
    action: str,
) -> List[str]:
    if find_directory_conflict(
        person=person,
        action=action,
        directory_rows=handled_directory_rows(db),
    ):
        return [TAG_ALREADY_EXISTS]
    return []
