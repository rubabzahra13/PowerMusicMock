"""Pydantic schemas for Pilot 2 (Inbound Email Management).

Field names are camelCase to match the frontend's mockData shapes so the
React app can swap its mock imports for API calls without remapping.
"""

from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class InboxOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    email: str
    title: str
    status: str
    connectedAt: Optional[datetime] = Field(default=None, validation_alias="connected_at")
    lastSyncedAt: Optional[datetime] = Field(default=None, validation_alias="last_synced_at")


class InboxConnectIn(BaseModel):
    email: str
    title: str


class EmailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    from_: str = Field(validation_alias="from_name", serialization_alias="from")
    fromEmail: str = Field(validation_alias="from_email")
    subject: str
    inbox: str = Field(validation_alias="account_email")
    body: str
    receivedAt: datetime = Field(validation_alias="received_at")

    intent: Optional[str] = None
    intentConfidence: Optional[int] = Field(default=None, validation_alias="intent_confidence")
    language: Optional[str] = None
    templateUsed: Optional[str] = Field(default=None, validation_alias="template_used")
    draftBody: Optional[str] = Field(default=None, validation_alias="draft_body")
    draftTweakLevel: Optional[str] = Field(default=None, validation_alias="draft_tweak_level")
    draftStatus: str = Field(validation_alias="draft_status")

    flagged: bool = False
    flagReason: Optional[str] = Field(default=None, validation_alias="flag_reason")
    urgent: bool = False
    read: bool = False
    archived: bool = False
    deleted: bool = False
    sentAt: Optional[datetime] = Field(default=None, validation_alias="sent_at")


class EmailIngestIn(BaseModel):
    """Simulates a new message arriving in a connected inbox (dev/testing,
    and the payload shape the Gmail poller feeds into the pipeline)."""

    inbox: str
    fromName: str
    fromEmail: str
    subject: str
    body: str
    receivedAt: Optional[datetime] = None
    gmailMessageId: Optional[str] = None
    gmailThreadId: Optional[str] = None


class EmailPatchIn(BaseModel):
    read: Optional[bool] = None
    flagged: Optional[bool] = None
    flagReason: Optional[str] = None
    archived: Optional[bool] = None
    deleted: Optional[bool] = None


class EmailBulkPatchIn(EmailPatchIn):
    """One request for many emails — keeps bulk toolbar actions to a single
    round trip instead of one PATCH per message."""

    ids: List[str]


class DraftUpdateIn(BaseModel):
    draftBody: str


class SendIn(BaseModel):
    """Final body as it appears in the editor when the admin clicks Send."""

    finalBody: str


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    name: str
    category: str
    intent: Optional[str] = None
    status: str
    subject: str
    body: str
    timesUsed: int = Field(validation_alias="times_used")
    lastUpdated: datetime = Field(validation_alias="last_updated")


class TemplateIn(BaseModel):
    name: str
    category: str
    intent: Optional[str] = None
    status: str = "Active"
    subject: str
    body: str


class GuidanceNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    intent: str
    rules: List[str]
    version: int
    updatedAt: datetime = Field(validation_alias="updated_at")


class TemplateSuggestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    kind: str
    templateId: Optional[str] = Field(default=None, validation_alias="template_id")
    intent: Optional[str] = None
    suggestedName: str = Field(validation_alias="suggested_name")
    suggestedSubject: str = Field(validation_alias="suggested_subject")
    suggestedBody: str = Field(validation_alias="suggested_body")
    rationale: Optional[str] = None
    status: str
    createdAt: datetime = Field(validation_alias="created_at")


class ProcessingLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    timestamp: datetime
    type: str
    description: str
    emailId: Optional[str] = Field(default=None, validation_alias="email_id")


class DistillResultOut(BaseModel):
    editsProcessed: int
    intentsUpdated: List[str]
    suggestionsCreated: int


class Pilot2WorkspaceOut(BaseModel):
    emails: List[EmailOut]
    inboxes: List[InboxOut]
