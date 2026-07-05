from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.input_validation import (
    normalize_email,
    normalize_person_name,
    normalize_text,
)


class SubmittedBy(BaseModel):
    firstName: Optional[str] = Field(default=None, max_length=100)
    lastName: Optional[str] = Field(default=None, max_length=100)
    email: Optional[str] = Field(default=None, max_length=254)
    club: Optional[str] = Field(default=None, max_length=200)

    @field_validator("firstName", "lastName", "club", mode="before")
    @classmethod
    def clean_submitter_text(cls, value, info):
        if value is None:
            return None
        return normalize_person_name(value, field_name=info.field_name)

    @field_validator("email", mode="before")
    @classmethod
    def clean_submitter_email(cls, value):
        return normalize_email(value)


class PersonInfo(BaseModel):
    firstName: Optional[str] = Field(default=None, max_length=100)
    lastName: Optional[str] = Field(default=None, max_length=100)
    email: Optional[str] = Field(default=None, max_length=254)
    location: Optional[str] = Field(default=None, max_length=200)

    @field_validator("firstName", "lastName", "location", mode="before")
    @classmethod
    def clean_person_text(cls, value, info):
        if value is None:
            return None
        if info.field_name == "location":
            return normalize_text(value, max_length=200, allow_empty=True, field_name="location")
        return normalize_person_name(value, field_name=info.field_name)

    @field_validator("email", mode="before")
    @classmethod
    def clean_person_email(cls, value):
        return normalize_email(value)


class RequestIn(BaseModel):
    submittedBy: SubmittedBy
    person: PersonInfo
    action: Literal["Add", "Remove"]
    notes: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("notes", mode="before")
    @classmethod
    def clean_notes(cls, value):
        return normalize_text(value, max_length=5000, allow_empty=True, field_name="notes")


class ManualRequestIn(BaseModel):
    submittedBy: SubmittedBy
    people: List[PersonInfo] = Field(min_length=1, max_length=50)
    action: Literal["Add", "Remove"]
    notes: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("notes", mode="before")
    @classmethod
    def clean_notes(cls, value):
        return normalize_text(value, max_length=5000, allow_empty=True, field_name="notes")


class ManagerBatchRequestIn(BaseModel):
    submittedBy: SubmittedBy
    people: List[PersonInfo] = Field(min_length=1, max_length=20)
    action: Literal["Add", "Remove"]
    notes: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("notes", mode="before")
    @classmethod
    def clean_notes(cls, value):
        return normalize_text(value, max_length=5000, allow_empty=True, field_name="notes")


class RequestOut(BaseModel):
    id: str
    displayId: int
    receivedAt: Optional[datetime] = None
    handledAt: Optional[datetime] = None
    submittedBy: SubmittedBy
    person: PersonInfo
    action: str
    notes: Optional[str] = None
    tags: List[str] = []
    createdBy: Optional[str] = None
    status: str
    handledBy: Optional[str] = None
    managerId: Optional[str] = None
    handledByAdminId: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform_flat_to_nested(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "submittedBy" in data and "person" in data:
                return data
            return {
                "id": data.get("id"),
                "displayId": data.get("displayId", 0),
                "receivedAt": data.get("received_at"),
                "handledAt": data.get("handled_at"),
                "submittedBy": data.get("submittedBy") or {
                    "firstName": "",
                    "lastName": "",
                    "email": "",
                    "club": "",
                },
                "person": {
                    "firstName": data.get("person_first_name"),
                    "lastName": data.get("person_last_name"),
                    "email": data.get("person_email"),
                    "location": data.get("person_location"),
                },
                "action": data.get("action"),
                "notes": data.get("notes"),
                "tags": data.get("tags") or [],
                "createdBy": data.get("created_by"),
                "status": data.get("status"),
            }

        return {
            "id": getattr(data, "id", None),
            "displayId": getattr(data, "displayId", None) or 0,
            "receivedAt": getattr(data, "received_at", None),
            "handledAt": getattr(data, "handled_at", None),
            "submittedBy": {
                "firstName": "",
                "lastName": "",
                "email": "",
                "club": "",
            },
            "person": {
                "firstName": getattr(data, "person_first_name", None),
                "lastName": getattr(data, "person_last_name", None),
                "email": getattr(data, "person_email", None),
                "location": getattr(data, "person_location", None),
            },
            "action": getattr(data, "action", None),
            "notes": getattr(data, "notes", None),
            "tags": getattr(data, "tags", None) or [],
            "createdBy": None,
            "status": getattr(data, "status", None),
        }


class PersonOut(BaseModel):
    id: str
    displayId: int
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[str] = None
    location: Optional[str] = None
    status: str
    dateAdded: Optional[datetime] = None
    addedBy: Optional[str] = None
    managerName: Optional[str] = None
    handledBy: Optional[str] = None
    managerEmail: Optional[str] = None
    club: Optional[str] = None
    sourceRequestId: Optional[str] = None
    sourceRequestNumber: Optional[int] = None
    requestReceivedAt: Optional[datetime] = None
    managerNotes: Optional[str] = None
    adminNotes: Optional[str] = None
    notes: Optional[str] = None  # alias for managerNotes (legacy)

    @model_validator(mode="before")
    @classmethod
    def transform_person(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "firstName" in data:
                mgr = data.get("managerNotes") or data.get("notes")
                adm = data.get("adminNotes")
                return {**data, "managerNotes": mgr, "adminNotes": adm, "notes": mgr}
            mgr_notes = data.get("notes")
            adm_notes = data.get("admin_notes")
            return {
                "id": data.get("id"),
                "displayId": data.get("displayId", 0),
                "firstName": data.get("first_name"),
                "lastName": data.get("last_name"),
                "email": data.get("email"),
                "location": data.get("location"),
                "status": data.get("status"),
                "dateAdded": data.get("date_added"),
                "addedBy": data.get("handled_by") or data.get("added_by"),
                "managerName": data.get("manager_name") or data.get("added_by"),
                "handledBy": data.get("handled_by"),
                "managerEmail": data.get("manager_email"),
                "club": data.get("club"),
                "sourceRequestId": data.get("source_request_id"),
                "sourceRequestNumber": data.get("sourceRequestNumber"),
                "requestReceivedAt": data.get("request_received_at") or data.get("requestReceivedAt"),
                "managerNotes": mgr_notes,
                "adminNotes": adm_notes,
                "notes": mgr_notes,
            }

        mgr_notes = getattr(data, "notes", None)
        adm_notes = getattr(data, "admin_notes", None)
        return {
            "id": getattr(data, "id", None),
            "displayId": getattr(data, "displayId", None) or 0,
            "firstName": getattr(data, "first_name", None),
            "lastName": getattr(data, "last_name", None),
            "email": getattr(data, "email", None),
            "location": getattr(data, "location", None),
            "status": getattr(data, "status", None),
            "dateAdded": getattr(data, "date_added", None),
            "addedBy": getattr(data, "handled_by", None) or getattr(data, "added_by", None),
            "managerName": getattr(data, "manager_name", None) or getattr(data, "added_by", None),
            "handledBy": getattr(data, "handled_by", None),
            "managerEmail": getattr(data, "manager_email", None),
            "club": getattr(data, "club", None),
            "sourceRequestId": getattr(data, "source_request_id", None),
            "sourceRequestNumber": getattr(data, "sourceRequestNumber", None),
            "requestReceivedAt": getattr(data, "request_received_at", None),
            "managerNotes": mgr_notes,
            "adminNotes": adm_notes,
            "notes": mgr_notes,
        }

class ActivityOut(BaseModel):
    id: str
    timestamp: datetime
    type: str
    description: Optional[str] = None
    linkedRequestId: Optional[str] = None

class KpiOut(BaseModel):
    pendingRequests: int
    usersInLedger: int


class DashboardOut(BaseModel):
    kpis: KpiOut
    pendingRequests: List[RequestOut]
    activity: List[ActivityOut]


class NewRequestsPageOut(BaseModel):
    requests: List[RequestOut]
    persons: List[PersonOut]


class MarkHandledIn(BaseModel):
    adminNote: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("adminNote", mode="before")
    @classmethod
    def clean_admin_note(cls, value):
        return normalize_text(value, max_length=5000, allow_empty=True, field_name="adminNote")


class DuplicateCheckIn(BaseModel):
    email: Optional[str] = Field(default=None, max_length=254)
    firstName: Optional[str] = Field(default=None, max_length=100)
    lastName: Optional[str] = Field(default=None, max_length=100)
    location: Optional[str] = Field(default=None, max_length=100)

    @field_validator("email", mode="before")
    @classmethod
    def clean_email(cls, value):
        return normalize_email(value)

    @field_validator("firstName", "lastName", mode="before")
    @classmethod
    def clean_names(cls, value, info):
        return normalize_person_name(value, field_name=info.field_name)

    @field_validator("location", mode="before")
    @classmethod
    def clean_location(cls, value):
        return normalize_text(value, max_length=100, allow_empty=True, field_name="location")


class DuplicateCheckOut(BaseModel):
    duplicate: bool
    id: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None
    dateAdded: Optional[datetime] = None
    location: Optional[str] = None


class PersonSearchOut(BaseModel):
    id: str
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[str] = None
    location: Optional[str] = None
    status: str
    dateAdded: Optional[datetime] = None


class PersonMatchCandidateOut(PersonSearchOut):
    matchReasons: List[str] = Field(default_factory=list)
