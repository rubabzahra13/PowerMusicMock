"""Unit tests for directory already-exists matching."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from app import models, schemas
from app.directory_person_match import (
    active_roster_rows,
    directory_outcome_conflicts,
    duplicate_tags_for_person,
    find_directory_conflict,
    find_roster_person,
)
from app.manager_request_intake import intake_automated_email_request, intake_manager_submission
from app.manager_request_tags import TAG_ALREADY_EXISTS
from app.database import SessionLocal


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
        session.rollback()
    finally:
        session.close()


@pytest.fixture
def manager_id(db: Session) -> str:
    manager = (
        db.query(models.PowermusicUser)
        .filter(models.PowermusicUser.role == "manager")
        .first()
    )
    if manager is None:
        pytest.skip("No manager profile in database for intake tests")
    return str(manager.id)


def _person(**kwargs):
    defaults = dict(
        firstName="Sara",
        lastName="Malik",
        email=f"dir-match-{uuid.uuid4().hex[:8]}@example.com",
        location="Oxford",
    )
    defaults.update(kwargs)
    return schemas.PersonInfo(**defaults)


def _handled_row(db: Session, person: schemas.PersonInfo, *, outcome: str, action: str) -> models.ManagerRequest:
    row = models.ManagerRequest(
        id=f"test-handled-{uuid.uuid4().hex[:8]}",
        received_at=datetime.now(timezone.utc),
        handled_at=datetime.now(timezone.utc),
        person_first_name=person.firstName,
        person_last_name=person.lastName,
        person_email=person.email,
        person_location=person.location,
        action=action,
        tags=[],
        status="handled",
        outcome=outcome,
    )
    db.add(row)
    db.flush()
    return row


class TestDirectoryOutcomeConflicts:
    def test_add_request_conflicts_with_added(self):
        assert directory_outcome_conflicts("Add", "Added")

    def test_remove_request_conflicts_with_removed(self):
        assert directory_outcome_conflicts("Remove", "Removed")

    def test_add_request_does_not_conflict_with_removed(self):
        assert not directory_outcome_conflicts("Add", "Removed")

    def test_remove_request_does_not_conflict_with_added(self):
        assert not directory_outcome_conflicts("Remove", "Added")


class TestDirectoryPersonMatch:
    def test_add_request_tags_when_person_already_added(self, db: Session, manager_id: str):
        email = f"add-added-{uuid.uuid4().hex[:8]}@example.com"
        directory_person = _person(email=email)
        _handled_row(db, directory_person, outcome="Added", action="Add")

        row = intake_manager_submission(
            db,
            person=_person(email=email, firstName="Other", lastName="Name", location="London"),
            action="Add",
            manager_id=manager_id,
        )
        db.flush()

        assert TAG_ALREADY_EXISTS in row.tags

    def test_remove_request_tags_when_person_already_removed(self, db: Session, manager_id: str):
        email = f"remove-removed-{uuid.uuid4().hex[:8]}@example.com"
        directory_person = _person(email=email)
        _handled_row(db, directory_person, outcome="Removed", action="Remove")

        row = intake_manager_submission(
            db,
            person=_person(email=email, firstName="Other", lastName="Name", location="London"),
            action="Remove",
            manager_id=manager_id,
        )
        db.flush()

        assert TAG_ALREADY_EXISTS in row.tags

    def test_add_request_no_tag_when_person_was_removed(self, db: Session, manager_id: str):
        email = f"add-after-remove-{uuid.uuid4().hex[:8]}@example.com"
        directory_person = _person(email=email)
        _handled_row(db, directory_person, outcome="Removed", action="Remove")

        row = intake_manager_submission(
            db,
            person=_person(email=email),
            action="Add",
            manager_id=manager_id,
        )
        db.flush()

        assert TAG_ALREADY_EXISTS not in row.tags

    def test_remove_request_no_tag_when_person_still_added(self, db: Session, manager_id: str):
        email = f"remove-added-{uuid.uuid4().hex[:8]}@example.com"
        directory_person = _person(email=email)
        _handled_row(db, directory_person, outcome="Added", action="Add")

        row = intake_manager_submission(
            db,
            person=_person(email=email),
            action="Remove",
            manager_id=manager_id,
        )
        db.flush()

        assert TAG_ALREADY_EXISTS not in row.tags

    def test_auto_email_gets_already_exists_on_add(self, db: Session):
        email = f"auto-add-added-{uuid.uuid4().hex[:8]}@example.com"
        directory_person = _person(email=email)
        _handled_row(db, directory_person, outcome="Added", action="Add")

        row = intake_automated_email_request(
            db,
            person=_person(email=email, firstName="Auto", lastName="Name", location="Leeds"),
            action="Add",
            source_gmail_message_id=f"gmail-{uuid.uuid4().hex}",
        )
        db.flush()

        assert TAG_ALREADY_EXISTS in row.tags

    def test_latest_directory_state_wins(self, db: Session, manager_id: str):
        email = f"latest-state-{uuid.uuid4().hex[:8]}@example.com"
        person = _person(email=email)
        older = _handled_row(db, person, outcome="Added", action="Add")
        older.handled_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        newer = _handled_row(db, person, outcome="Removed", action="Remove")
        newer.handled_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
        db.flush()

        conflict = find_directory_conflict(
            person=_person(email=email),
            action="Remove",
            directory_rows=[older, newer],
        )
        assert conflict is not None
        assert conflict.outcome == "Removed"

        tags = duplicate_tags_for_person(db, _person(email=email), action="Remove")
        assert tags == [TAG_ALREADY_EXISTS]

        tags = duplicate_tags_for_person(db, _person(email=email), action="Add")
        assert tags == []


class TestActiveRoster:
    def test_active_roster_uses_latest_state(self, db: Session):
        email = f"roster-{uuid.uuid4().hex[:8]}@example.com"
        person = _person(email=email)
        older = _handled_row(db, person, outcome="Added", action="Add")
        older.handled_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        newer = _handled_row(db, person, outcome="Removed", action="Remove")
        newer.handled_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
        db.flush()

        roster = active_roster_rows(db)
        roster_ids = {row.id for row in roster}
        assert older.id not in roster_ids
        assert newer.id not in roster_ids

    def test_find_roster_person_returns_added_only(self, db: Session):
        email = f"roster-find-{uuid.uuid4().hex[:8]}@example.com"
        person = _person(email=email)
        row = _handled_row(db, person, outcome="Added", action="Add")
        db.flush()

        match = find_roster_person(db, _person(email=email, firstName="Other", lastName="Name"))
        assert match is not None
        assert match.id == row.id

    def test_find_roster_person_skips_removed(self, db: Session):
        email = f"roster-removed-{uuid.uuid4().hex[:8]}@example.com"
        person = _person(email=email)
        _handled_row(db, person, outcome="Removed", action="Remove")
        db.flush()

        assert find_roster_person(db, person) is None
