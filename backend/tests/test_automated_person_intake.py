"""Unit tests for PureGym automated roster email intake."""

from app.automated_person_intake import (
    ADD_SUBJECT,
    PUREGYM_LEAVER_SENDER,
    classify_puregym_roster_email,
    intake_puregym_roster_message,
    is_puregym_roster_notification,
    parse_puregym_roster_email,
)

ADD_BODY = """\
Name: Nik Hall
Email: nik1285@hotmail.co.uk
Club: Alfreton
"""

REMOVE_BODY = """\
Name: Jess Randle
Email: wellnesswithjess@gmail.com
Club: Witney
Leave date: 2024-08-14
"""


class TestAutomatedPersonIntake:
    def test_classifies_new_puregym_user_as_add(self):
        assert classify_puregym_roster_email(
            "notifications@puregym.com",
            "New PureGym user",
            ADD_BODY,
            from_name="PureGym",
        ) == "Add"

    def test_classifies_puregym_leaver_as_remove(self):
        assert classify_puregym_roster_email(
            PUREGYM_LEAVER_SENDER,
            "PureGym Leaver",
            REMOVE_BODY,
        ) == "Remove"

    def test_parses_add_request_fields(self):
        parsed = parse_puregym_roster_email(
            "New PureGym user",
            ADD_BODY,
            sender_email="notifications@puregym.com",
            from_name="PureGym",
        )
        assert parsed is not None
        person, action = parsed
        assert action == "Add"
        assert person.firstName == "Nik"
        assert person.lastName == "Hall"
        assert person.email == "nik1285@hotmail.co.uk"
        assert person.location == "Alfreton"

    def test_parses_remove_request_fields(self):
        parsed = parse_puregym_roster_email(
            "PureGym Leaver",
            REMOVE_BODY,
            sender_email=PUREGYM_LEAVER_SENDER,
        )
        assert parsed is not None
        person, action = parsed
        assert action == "Remove"
        assert person.firstName == "Jess"
        assert person.lastName == "Randle"
        assert person.email == "wellnesswithjess@gmail.com"
        assert person.location == "Witney"

    def test_ignores_unrelated_puregym_mail(self):
        assert not is_puregym_roster_notification(
            "ops@puregym.com",
            "Partnership review Q3",
            "We would like to schedule a Q3 partnership review.",
            from_name="PureGym",
        )

    def test_ignores_wrong_sender_for_leaver(self):
        assert classify_puregym_roster_email(
            "noreply@puregym.com",
            "PureGym Leaver",
            REMOVE_BODY,
        ) is None

    def test_subject_normalization(self):
        assert classify_puregym_roster_email(
            "notifications@puregym.com",
            "  new   PureGym   user  ",
            ADD_BODY,
            from_name="PureGym",
        ) == "Add"
