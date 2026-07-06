"""Integration tests for manager + automated email request intake."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from app import models, schemas
from app.manager_request_intake import (
    intake_automated_email_request,
    intake_manager_submission,
)
from app.manager_request_tags import (
    TAG_ALREADY_EXISTS,
    TAG_AUTO_MAIL,
    TAG_PARTNER_REQUEST,
    TAG_UNVERIFIED,
    TAG_VERIFIED,
)
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
        email=f"intake-test-{uuid.uuid4().hex[:8]}@example.com",
        location="Oxford",
    )
    defaults.update(kwargs)
    return schemas.PersonInfo(**defaults)


def _add_handled_directory_row(db: Session, person: schemas.PersonInfo) -> models.ManagerRequest:
    row = models.ManagerRequest(
        id=f"test-handled-{uuid.uuid4().hex[:8]}",
        received_at=datetime.now(timezone.utc),
        handled_at=datetime.now(timezone.utc),
        person_first_name=person.firstName,
        person_last_name=person.lastName,
        person_email=person.email,
        person_location=person.location,
        action="Add",
        tags=[TAG_VERIFIED],
        status="handled",
        outcome="Added",
    )
    db.add(row)
    db.flush()
    return row


class TestManagerRequestIntake:
    def test_auto_email_then_manager_same_email_diff_name_location(self, db: Session, manager_id: str):
        email = f"auto-then-mgr-{uuid.uuid4().hex[:8]}@example.com"
        auto_person = _person(email=email, firstName="Sara", lastName="Malik", location="Oxford")
        mgr_person = _person(email=email, firstName="Sara", lastName="Mal", location="Leeds")

        auto_row = intake_automated_email_request(
            db,
            person=auto_person,
            action="Remove",
            source_gmail_message_id=f"gmail-{uuid.uuid4().hex}",
        )
        db.flush()

        assert TAG_UNVERIFIED in auto_row.tags
        assert TAG_AUTO_MAIL in auto_row.tags
        assert auto_row.manager_id is None

        verified = intake_manager_submission(
            db,
            person=mgr_person,
            action="Remove",
            manager_id=manager_id,
            manager_notes="Manager confirmed leaver",
        )
        db.flush()

        assert verified.id == auto_row.id
        assert TAG_VERIFIED in verified.tags
        assert TAG_PARTNER_REQUEST in verified.tags
        assert TAG_AUTO_MAIL in verified.tags
        assert TAG_UNVERIFIED not in verified.tags
        assert verified.manager_id is not None
        assert verified.person_last_name == "Mal"
        assert verified.person_location == "Leeds"

    def test_manager_first_then_auto_email_same_email_diff_name(self, db: Session, manager_id: str):
        email = f"mgr-then-auto-{uuid.uuid4().hex[:8]}@example.com"
        mgr_person = _person(email=email, firstName="Sara", lastName="Mal", location="Leeds")
        auto_person = _person(email=email, firstName="Sara", lastName="Malik", location="Oxford")

        mgr_row = intake_manager_submission(
            db,
            person=mgr_person,
            action="Add",
            manager_id=manager_id,
        )
        db.flush()

        assert TAG_VERIFIED in mgr_row.tags
        assert TAG_PARTNER_REQUEST in mgr_row.tags
        assert TAG_AUTO_MAIL not in mgr_row.tags

        linked = intake_automated_email_request(
            db,
            person=auto_person,
            action="Add",
            source_gmail_message_id=f"gmail-{uuid.uuid4().hex}",
        )
        db.flush()

        assert linked.id == mgr_row.id
        assert TAG_AUTO_MAIL in linked.tags
        assert linked.person_email == mgr_person.email
        assert linked.intake_persons["partner"]["email"] == mgr_person.email
        assert linked.intake_persons["autoMail"]["email"] == auto_person.email
        assert TAG_VERIFIED in linked.tags
        assert TAG_PARTNER_REQUEST in linked.tags

    def test_same_email_different_action_does_not_merge(self, db: Session, manager_id: str):
        email = f"action-mismatch-{uuid.uuid4().hex[:8]}@example.com"
        auto_person = _person(email=email)

        auto_row = intake_automated_email_request(
            db,
            person=auto_person,
            action="Remove",
            source_gmail_message_id=f"gmail-{uuid.uuid4().hex}",
        )
        db.flush()

        mgr_row = intake_manager_submission(
            db,
            person=_person(email=email, firstName="Sara", lastName="Mal", location="Leeds"),
            action="Add",
            manager_id=manager_id,
        )
        db.flush()

        assert mgr_row.id != auto_row.id
        assert TAG_AUTO_MAIL not in mgr_row.tags
        assert TAG_UNVERIFIED in auto_row.tags

    def test_already_exists_tag_on_email_only_directory_match(self, db: Session, manager_id: str):
        email = f"already-exists-{uuid.uuid4().hex[:8]}@example.com"
        directory_person = _person(email=email, firstName="Directory", lastName="Person", location="Bristol")
        _add_handled_directory_row(db, directory_person)

        submit_person = _person(email=email, firstName="Different", lastName="Name", location="London")
        row = intake_manager_submission(
            db,
            person=submit_person,
            action="Add",
            manager_id=manager_id,
        )
        db.flush()

        assert TAG_ALREADY_EXISTS in row.tags
