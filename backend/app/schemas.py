from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, model_validator, Field


class SubmittedBy(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[str] = None
    club: Optional[str] = None


class PersonInfo(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[str] = None
    location: Optional[str] = None

class RequestIn(BaseModel):
    submittedBy: SubmittedBy
    person: PersonInfo
    action: str
    notes: Optional[str] = None

class ManualRequestIn(BaseModel):
    submittedBy: SubmittedBy
    people: List[PersonInfo]
    action: str
    notes: Optional[str] = None


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
                "submittedBy": {
                    "firstName": data.get("submitted_by_first_name"),
                    "lastName": data.get("submitted_by_last_name"),
                    "email": data.get("submitted_by_email"),
                    "club": data.get("submitted_by_club"),
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
            "displayId": getattr(data, "displayId", 0),
            "receivedAt": getattr(data, "received_at", None),
            "handledAt": getattr(data, "handled_at", None),
            "submittedBy": {
                "firstName": getattr(data, "submitted_by_first_name", None),
                "lastName": getattr(data, "submitted_by_last_name", None),
                "email": getattr(data, "submitted_by_email", None),
                "club": getattr(data, "submitted_by_club", None),
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
            "createdBy": getattr(data, "created_by", None),
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
    managerEmail: Optional[str] = None
    club: Optional[str] = None
    sourceRequestId: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def transform_person(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "firstName" in data:
                return data
            return {
                "id": data.get("id"),
                "displayId": data.get("displayId", 0),
                "firstName": data.get("first_name"),
                "lastName": data.get("last_name"),
                "email": data.get("email"),
                "location": data.get("location"),
                "status": data.get("status"),
                "dateAdded": data.get("date_added"),
                "addedBy": data.get("added_by"),
                "managerEmail": data.get("manager_email"),
                "club": data.get("club"),
                "sourceRequestId": data.get("source_request_id"),
                "notes": data.get("notes"),
            }

        return {
            "id": getattr(data, "id", None),
            "displayId": getattr(data, "displayId", 0),
            "firstName": getattr(data, "first_name", None),
            "lastName": getattr(data, "last_name", None),
            "email": getattr(data, "email", None),
            "location": getattr(data, "location", None),
            "status": getattr(data, "status", None),
            "dateAdded": getattr(data, "date_added", None),
            "addedBy": getattr(data, "added_by", None),
            "managerEmail": getattr(data, "manager_email", None),
            "club": getattr(data, "club", None),
            "sourceRequestId": getattr(data, "source_request_id", None),
            "notes": getattr(data, "notes", None),
        }

class ActivityOut(BaseModel):
    id: int
    timestamp: datetime
    type: str
    description: Optional[str] = None
    linkedRequestId: Optional[str] = Field(alias="linked_request_id", default=None)
    
    class Config:
        populate_by_name = True
        from_attributes = True

class KpiOut(BaseModel):
    pendingRequests: int
    usersInLedger: int
