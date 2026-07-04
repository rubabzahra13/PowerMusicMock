from sqlalchemy import Boolean, Column, DateTime, Float, String, Text, Integer
from sqlalchemy.dialects.postgresql import ARRAY, UUID

from app.database import Base


class Profile(Base):
    """Supabase auth profile (role source of truth for API authorization)."""

    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), primary_key=True)
    email = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    role = Column(String, nullable=False)


class Request(Base):
    __tablename__ = "requests"

    id = Column(String, primary_key=True)
    received_at = Column(DateTime(timezone=True), nullable=False)
    handled_at = Column(DateTime(timezone=True), nullable=True)

    submitted_by_first_name = Column(String, nullable=False)
    submitted_by_last_name = Column(String, nullable=False)
    submitted_by_email = Column(String, nullable=False)
    submitted_by_club = Column(String, nullable=False)

    person_first_name = Column(String, nullable=False)
    person_last_name = Column(String, nullable=False)
    person_email = Column(String, nullable=False)
    person_location = Column(String, nullable=False)

    action = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    tags = Column(ARRAY(String), nullable=False, server_default="{}")
    created_by = Column(String, nullable=False)
    status = Column(String, nullable=False)


class Person(Base):
    __tablename__ = "people"

    id = Column(String, primary_key=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    location = Column(String, nullable=False)

    status = Column(String, nullable=False)
    date_added = Column(DateTime(timezone=True), nullable=False)
    added_by = Column(String, nullable=False)
    manager_email = Column(String, nullable=False)
    club = Column(String, nullable=False)

    source_request_id = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True))
    type = Column(String)
    description = Column(String)
    linked_request_id = Column(String, nullable=True)


# ─────────────────────────────────────────────────────────────
#  Pilot 2 · Inbound Email Management
# ─────────────────────────────────────────────────────────────


class EmailAccount(Base):
    """A connected Gmail inbox (one per business vertical)."""

    __tablename__ = "email_accounts"

    id = Column(String, primary_key=True)
    email = Column(String, nullable=False, unique=True)
    title = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Disconnected")  # Connected | Disconnected
    connected_at = Column(DateTime(timezone=True), nullable=True)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)

    # OAuth material issued by Google for this inbox. Refresh token is the
    # long-lived credential; access tokens are re-minted from it on demand.
    oauth_refresh_token = Column(Text, nullable=True)
    gmail_history_id = Column(String, nullable=True)

    # Initial Gmail backfill (last N days on first connect).
    backfill_status = Column(String, nullable=False, default="idle")  # idle|running|done|failed
    backfill_imported_count = Column(Integer, nullable=False, default=0)
    backfill_error = Column(Text, nullable=True)


class Email(Base):
    """An inbound email plus the AI-generated draft attached to it."""

    __tablename__ = "emails"

    id = Column(String, primary_key=True)
    account_email = Column(String, nullable=False, index=True)
    gmail_message_id = Column(String, nullable=True, unique=True)
    gmail_thread_id = Column(String, nullable=True)
    gmail_label_ids = Column(ARRAY(String), nullable=False, server_default="{}")

    # Snapshot of Gmail label state (derived on import / history sync).
    gmail_in_inbox = Column(Boolean, nullable=False, default=False)
    gmail_in_trash = Column(Boolean, nullable=False, default=False)
    gmail_in_sent = Column(Boolean, nullable=False, default=False)
    gmail_starred = Column(Boolean, nullable=False, default=False)
    gmail_archived = Column(Boolean, nullable=False, default=False)
    gmail_is_outbound = Column(Boolean, nullable=False, default=False)

    from_name = Column(String, nullable=False)
    from_email = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    received_at = Column(DateTime(timezone=True), nullable=False)

    # Classifier output
    intent = Column(String, nullable=True)
    intent_confidence = Column(Integer, nullable=True)
    language = Column(String, nullable=True)
    sender_first_name = Column(String, nullable=True)
    urgent = Column(Boolean, nullable=False, default=False)

    # Composer output
    template_used = Column(String, nullable=True)  # template name shown in UI
    template_ids = Column(ARRAY(String), nullable=False, server_default="{}")
    draft_body = Column(Text, nullable=True)
    draft_tweak_level = Column(String, nullable=True)  # verbatim | personalized | merged | fallback
    draft_status = Column(String, nullable=False, default="Processing")
    # Imported | Processing | Draft Created | Flagged | Reviewed | Sent | Ignored

    flagged = Column(Boolean, nullable=False, default=False)
    flag_reason = Column(String, nullable=True)
    read = Column(Boolean, nullable=False, default=False)
    archived = Column(Boolean, nullable=False, default=False)
    # Soft delete (the "Bin"). Rows are only hard-deleted by "empty bin" /
    # "delete forever" actions on the dashboard.
    deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    sent_at = Column(DateTime(timezone=True), nullable=True)
    sent_body = Column(Text, nullable=True)


class EmailTemplate(Base):
    """Centrally managed reply template (single source of truth)."""

    __tablename__ = "email_templates"

    id = Column(String, primary_key=True)
    account_email = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    intent = Column(String, nullable=True)  # which classifier intent this answers
    status = Column(String, nullable=False, default="Active")  # Active | Draft | Archived
    archived_from = Column(String, nullable=True)  # Active | Draft — set when moved to Archived
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    times_used = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False)
    last_updated = Column(DateTime(timezone=True), nullable=False)


class TemplateTranslation(Base):
    """Reviewed language variant of a template (fr, de, es, ja)."""

    __tablename__ = "template_translations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    template_id = Column(String, nullable=False, index=True)
    language = Column(String, nullable=False)  # ISO 639-1
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    reviewed = Column(Boolean, nullable=False, default=False)


class DraftEdit(Base):
    """Delta between the AI draft and what the admin actually sent.

    Raw learning signal for the distiller. Rows are kept forever for audit;
    only distilled guidance notes ever reach the model's context.
    """

    __tablename__ = "draft_edits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email_id = Column(String, nullable=False, index=True)
    intent = Column(String, nullable=True, index=True)
    template_id = Column(String, nullable=True)
    language = Column(String, nullable=True)
    draft_body = Column(Text, nullable=False)
    final_body = Column(Text, nullable=False)
    diff = Column(Text, nullable=False)
    edit_ratio = Column(Float, nullable=False)  # 0 = sent verbatim, 1 = fully rewritten
    created_at = Column(DateTime(timezone=True), nullable=False)
    distilled = Column(Boolean, nullable=False, default=False)


class GuidanceNote(Base):
    """Distilled, capped drafting rules for one intent.

    The context-size guarantee lives here: the distiller merges new learnings
    into this fixed-size record instead of appending history.
    """

    __tablename__ = "guidance_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    intent = Column(String, nullable=False, unique=True)
    rules = Column(ARRAY(String), nullable=False, server_default="{}")
    version = Column(Integer, nullable=False, default=1)
    updated_at = Column(DateTime(timezone=True), nullable=False)


class TemplateSuggestion(Base):
    """Distiller-proposed template revision or new template, awaiting admin review."""

    __tablename__ = "template_suggestions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kind = Column(String, nullable=False)  # revision | new
    template_id = Column(String, nullable=True)
    intent = Column(String, nullable=True)
    suggested_name = Column(String, nullable=False)
    suggested_subject = Column(String, nullable=False)
    suggested_body = Column(Text, nullable=False)
    rationale = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending | approved | rejected
    created_at = Column(DateTime(timezone=True), nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)


class ProcessingLog(Base):
    """Audit trail of email pipeline and learning activity."""

    __tablename__ = "processing_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    type = Column(String, nullable=False)
    description = Column(String, nullable=False)
    email_id = Column(String, nullable=True)
