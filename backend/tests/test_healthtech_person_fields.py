import pytest
from app.input_validation import normalize_supervisor, normalize_hospital
from app import schemas, models
from app.manager_request_serialize import request_to_api_dict, directory_person_to_api_dict


def test_validation_supervisor_and_hospital():
    assert normalize_supervisor("  Dr. Sarah Connor  ") == "Dr. Sarah Connor"
    assert normalize_hospital("  St. Jude Medical Center  ") == "St. Jude Medical Center"
    assert normalize_supervisor(None) is None
    assert normalize_hospital("") is None

    # HTML injection rejection
    with pytest.raises(ValueError):
        normalize_supervisor("<script>alert('xss')</script>")

    with pytest.raises(ValueError):
        normalize_hospital("<b>St. Jude</b>")


def test_pydantic_schemas_healthtech_fields():
    info = schemas.PersonInfo(
        firstName="John",
        lastName="Doe",
        email="john@healthtech.com",
        location="London",
        supervisor="  Dr. Smith  ",
        hospital="  General Hospital  ",
    )
    assert info.supervisor == "Dr. Smith"
    assert info.hospital == "General Hospital"

    update_in = schemas.PersonUpdateIn(
        firstName="John",
        lastName="Doe",
        email="john@healthtech.com",
        location="London",
        supervisor="  Dr. Jones  ",
        hospital="  City Clinic  ",
    )
    assert update_in.supervisor == "Dr. Jones"
    assert update_in.hospital == "City Clinic"


def test_model_and_serialization_isolation():
    # PureGym request (no supervisor / hospital)
    puregym_req = models.ManagerRequest(
        id="req-puregym-001",
        person_first_name="Jane",
        person_last_name="Smith",
        person_email="jane@puregym.com",
        person_location="Manchester",
        partner_id="partner-001",
    )
    assert puregym_req.person_supervisor is None
    assert puregym_req.person_hospital is None

    puregym_api = request_to_api_dict(puregym_req)
    assert puregym_api["person"]["supervisor"] is None
    assert puregym_api["person"]["hospital"] is None

    # HealthTech request (with supervisor and hospital)
    healthtech_req = models.ManagerRequest(
        id="req-healthtech-001",
        person_first_name="Alice",
        person_last_name="Wong",
        person_email="alice@healthtech.com",
        person_location="Central Ward",
        partner_id="partner-003",
    )
    healthtech_req.person_supervisor = "Dr. Robert Vance"
    healthtech_req.person_hospital = "St. Thomas Hospital"

    assert healthtech_req.person_supervisor == "Dr. Robert Vance"
    assert healthtech_req.person_hospital == "St. Thomas Hospital"

    healthtech_api = request_to_api_dict(healthtech_req)
    assert healthtech_api["person"]["supervisor"] == "Dr. Robert Vance"
    assert healthtech_api["person"]["hospital"] == "St. Thomas Hospital"

    dir_api = directory_person_to_api_dict(healthtech_req)
    assert dir_api["supervisor"] == "Dr. Robert Vance"
    assert dir_api["hospital"] == "St. Thomas Hospital"
