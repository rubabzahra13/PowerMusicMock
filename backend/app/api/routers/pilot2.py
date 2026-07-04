"""Pilot 2 · Inbound Email Management API."""

import hmac
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app import models
from app.api.auth import require_admin
from app.api.dependencies import get_db
from app.pilot2 import config, diffing, gmail, oauth_pages, pipeline, sync
from app.pilot2 import schemas
from app.pilot2.ai.distiller import run_distillation

router = APIRouter(prefix="/api/pilot2", tags=["pilot2"])


# ── Connected inboxes ────────────────────────────────────────


@router.get("/inboxes", response_model=List[schemas.InboxOut])
def list_inboxes(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    return db.query(models.EmailAccount).order_by(models.EmailAccount.id).all()


@router.get("/workspace", response_model=schemas.Pilot2WorkspaceOut)
def get_workspace(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    inboxes = db.query(models.EmailAccount).order_by(models.EmailAccount.id).all()
    # Emails awaiting AI (Imported/Processing) are withheld: the queue must
    # only ever grow. An email appears once, fully classified, instead of
    # showing up and then vanishing when the classifier marks it Ignored.
    emails = (
        db.query(models.Email)
        .filter(models.Email.draft_status.notin_(["Ignored", "Imported", "Processing"]))
        .order_by(models.Email.received_at.desc())
        .all()
    )
    pending_ai = (
        db.query(models.Email)
        .filter(models.Email.draft_status.in_(["Imported", "Processing"]))
        .count()
    )
    return {"emails": emails, "inboxes": inboxes, "pendingAiCount": pending_ai}


@router.post("/inboxes/connect")
def connect_inbox(payload: schemas.InboxConnectIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    account = (
        db.query(models.EmailAccount)
        .filter(models.EmailAccount.email == payload.email)
        .first()
    )
    if account is None:
        account = models.EmailAccount(
            id=pipeline.next_id(db, models.EmailAccount, "inbox"),
            email=payload.email,
            title=payload.title,
        )
        db.add(account)

    if gmail.is_live():
        # The admin finishes the connection on Google's consent screen; the
        # callback below flips the account to Connected.
        db.commit()
        return {"authUrl": gmail.get_authorization_url(state=account.email)}

    account.status = "Connected"
    account.connected_at = datetime.now(timezone.utc)
    pipeline.log(db, "inbox_connected", f"Inbox {account.email} connected (mock mode).")
    db.commit()
    return {"status": "Connected", "email": account.email}


@router.get("/inboxes/oauth/callback", response_class=HTMLResponse)
def oauth_callback(code: str, state: str, db: Session = Depends(get_db)):
    try:
        authorized_email, refresh_token = gmail.exchange_code(code, state)
    except Exception as exc:
        return HTMLResponse(
            oauth_pages.oauth_error_page(message=str(exc)),
            status_code=400,
        )

    account = (
        db.query(models.EmailAccount)
        .filter(models.EmailAccount.email == authorized_email)
        .first()
    )
    if account is None:
        return HTMLResponse(
            oauth_pages.oauth_error_page(
                message=(
                    f"Authorized Gmail account {authorized_email} does not match a "
                    f"configured inbox (expected {state})."
                )
            ),
            status_code=400,
        )
    account.oauth_refresh_token = refresh_token
    account.status = "Connected"
    account.connected_at = datetime.now(timezone.utc)
    try:
        profile = gmail.get_profile(account)
        account.gmail_history_id = str(profile.get("historyId", "")) or None
    except Exception:
        pass
    pipeline.log(db, "inbox_connected", f"Inbox {account.email} connected via Google OAuth.")
    db.commit()
    sync.start_backfill(account.id)
    return HTMLResponse(
        oauth_pages.oauth_success_page(email=account.email, title=account.title)
    )


@router.get("/inboxes/{inbox_id}/sync-status", response_model=schemas.InboxSyncStatusOut)
def inbox_sync_status(inbox_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    account = db.query(models.EmailAccount).filter(models.EmailAccount.id == inbox_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="Inbox not found")
    return account


@router.post("/inboxes/{inbox_id}/disconnect", response_model=schemas.InboxOut)
def disconnect_inbox(inbox_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    account = db.query(models.EmailAccount).filter(models.EmailAccount.id == inbox_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="Inbox not found")
    account.status = "Disconnected"
    account.oauth_refresh_token = None
    pipeline.log(db, "inbox_disconnected", f"Inbox {account.email} disconnected.")
    db.commit()
    db.refresh(account)
    return account


@router.patch("/inboxes/{inbox_id}", response_model=schemas.InboxOut)
def update_inbox(inbox_id: str, payload: schemas.InboxUpdateIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    account = db.query(models.EmailAccount).filter(models.EmailAccount.id == inbox_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="Inbox not found")
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    account.title = title
    pipeline.log(db, "inbox_renamed", f"Inbox {account.email} renamed to '{title}'.")
    db.commit()
    db.refresh(account)
    return account


@router.delete("/inboxes/{inbox_id}")
def delete_inbox(inbox_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    account = db.query(models.EmailAccount).filter(models.EmailAccount.id == inbox_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="Inbox not found")
    email = account.email
    if account.status == "Connected":
        account.status = "Disconnected"
        account.oauth_refresh_token = None
    db.query(models.EmailTemplate).filter(
        models.EmailTemplate.account_email == email
    ).delete(synchronize_session=False)
    # Remove the inbox's imported emails too, otherwise they linger as
    # orphans in the workspace payload after the inbox is gone.
    db.query(models.Email).filter(
        models.Email.account_email == email
    ).delete(synchronize_session=False)
    db.delete(account)
    pipeline.log(db, "inbox_deleted", f"Inbox {email} removed.")
    db.commit()
    return {"deleted": inbox_id}


# ── Emails ───────────────────────────────────────────────────


@router.get("/emails", response_model=List[schemas.EmailOut])
def list_emails(inbox: Optional[str] = None, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    query = db.query(models.Email).filter(models.Email.draft_status != "Ignored")
    if inbox:
        query = query.filter(models.Email.account_email == inbox)
    return query.order_by(models.Email.received_at.desc()).all()


@router.get("/emails/{email_id}", response_model=schemas.EmailOut)
def get_email(email_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    email = db.query(models.Email).filter(models.Email.id == email_id).first()
    if email is None:
        raise HTTPException(status_code=404, detail="Email not found")
    return email


@router.post("/emails/ingest", response_model=schemas.EmailOut)
def ingest_email(payload: schemas.EmailIngestIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Feed one inbound email through the pipeline. Used for dev/testing in
    mock mode; in live mode the Gmail poller calls the same pipeline."""
    account = (
        db.query(models.EmailAccount)
        .filter(models.EmailAccount.email == payload.inbox)
        .first()
    )
    if account is None or account.status != "Connected":
        raise HTTPException(status_code=400, detail=f"Inbox {payload.inbox} is not connected.")
    return pipeline.process_incoming(
        db,
        account_email=payload.inbox,
        from_name=payload.fromName,
        from_email=payload.fromEmail,
        subject=payload.subject,
        body=payload.body,
        received_at=payload.receivedAt,
        gmail_message_id=payload.gmailMessageId,
        gmail_thread_id=payload.gmailThreadId,
    )


def _apply_email_patch(email: models.Email, payload: schemas.EmailPatchIn) -> None:
    if payload.read is not None:
        email.read = payload.read
    if payload.archived is not None:
        email.archived = payload.archived
    if payload.deleted is not None:
        email.deleted = payload.deleted
        email.deleted_at = datetime.now(timezone.utc) if payload.deleted else None
    if payload.flagged is not None:
        email.flagged = payload.flagged
        if email.draft_status != "Sent":
            if payload.flagged:
                email.flag_reason = payload.flagReason or "Manual review requested"
                email.draft_status = "Flagged"
            else:
                email.flag_reason = None
                email.draft_status = "Draft Created"


@router.patch("/emails/{email_id}", response_model=schemas.EmailOut)
def patch_email(email_id: str, payload: schemas.EmailPatchIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    email = db.query(models.Email).filter(models.Email.id == email_id).first()
    if email is None:
        raise HTTPException(status_code=404, detail="Email not found")
    if payload.deleted is not None:
        pipeline.note_bin_state_change([email_id])
    _apply_email_patch(email, payload)
    # Mirror the change onto the real Gmail message (best-effort).
    pipeline.sync_flags_to_gmail(
        db, [email],
        read=payload.read, archived=payload.archived, deleted=payload.deleted,
    )
    db.commit()
    db.refresh(email)
    return email


@router.post("/emails/bulk-patch", response_model=List[schemas.EmailOut])
def bulk_patch_emails(payload: schemas.EmailBulkPatchIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    if payload.deleted is not None:
        pipeline.note_bin_state_change(payload.ids)
    emails = db.query(models.Email).filter(models.Email.id.in_(payload.ids)).all()
    for email in emails:
        _apply_email_patch(email, payload)
    pipeline.sync_flags_to_gmail(
        db, emails,
        read=payload.read, archived=payload.archived, deleted=payload.deleted,
    )
    db.commit()
    for email in emails:
        db.refresh(email)
    return emails


@router.delete("/emails/{email_id}")
def delete_email_forever(email_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Hard delete one email here AND in Gmail. Only allowed from the bin."""
    email = db.query(models.Email).filter(models.Email.id == email_id).first()
    if email is None:
        raise HTTPException(status_code=404, detail="Email not found")
    if not email.deleted:
        raise HTTPException(status_code=400, detail="Move the email to the bin first.")
    pipeline.delete_forever_in_gmail(db, email)
    db.delete(email)
    pipeline.log(db, "email_deleted", f"Email deleted forever: '{email.subject}'", email_id)
    db.commit()
    return {"deleted": email_id}


@router.post("/emails/bin/empty")
def empty_bin(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Hard delete everything currently in the bin, here and in Gmail."""
    binned = db.query(models.Email).filter(models.Email.deleted.is_(True)).all()
    count = len(binned)
    for email in binned:
        pipeline.delete_forever_in_gmail(db, email)
        db.delete(email)
    if count:
        pipeline.log(db, "bin_emptied", f"Bin emptied — {count} emails deleted forever.")
    db.commit()
    return {"deleted": count}


@router.put("/emails/{email_id}/draft", response_model=schemas.EmailOut)
def update_draft(email_id: str, payload: schemas.DraftUpdateIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    email = db.query(models.Email).filter(models.Email.id == email_id).first()
    if email is None:
        raise HTTPException(status_code=404, detail="Email not found")
    if email.draft_status == "Sent":
        raise HTTPException(status_code=400, detail="Reply already sent.")
    email.draft_body = payload.draftBody
    if email.draft_status == "Draft Created":
        email.draft_status = "Reviewed"
    db.commit()
    db.refresh(email)
    return email


@router.post("/emails/{email_id}/send", response_model=schemas.EmailOut)
def send_email(email_id: str, payload: schemas.SendIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    email = db.query(models.Email).filter(models.Email.id == email_id).first()
    if email is None:
        raise HTTPException(status_code=404, detail="Email not found")
    if email.draft_status == "Sent":
        raise HTTPException(status_code=400, detail="Reply already sent.")

    account = (
        db.query(models.EmailAccount)
        .filter(models.EmailAccount.email == email.account_email)
        .first()
    )
    if account is None or account.status != "Connected":
        raise HTTPException(status_code=400, detail="Inbox is not connected.")

    final_body = payload.finalBody
    gmail.send_reply(account, email, final_body)

    # Learning signal: deterministic diff between what the AI drafted and what
    # the admin actually sent. Raw rows accumulate here; the nightly distiller
    # compresses them into the capped guidance notes.
    ai_draft = email.draft_body or ""
    db.add(models.DraftEdit(
        email_id=email.id,
        intent=email.intent,
        template_id=email.template_ids[0] if email.template_ids else None,
        language=email.language,
        draft_body=ai_draft,
        final_body=final_body,
        diff=diffing.unified_diff(ai_draft, final_body),
        edit_ratio=diffing.edit_ratio(ai_draft, final_body),
        created_at=datetime.now(timezone.utc),
    ))

    email.sent_at = datetime.now(timezone.utc)
    email.sent_body = final_body
    email.draft_status = "Sent"
    email.flagged = False
    email.flag_reason = None
    email.read = True

    pipeline.log(db, "reply_sent", f"Reply sent to {email.from_email}.", email.id)
    db.commit()
    db.refresh(email)
    return email


# ── Templates ────────────────────────────────────────────────


@router.get("/templates", response_model=List[schemas.TemplateOut])
def list_templates(inbox: Optional[str] = None, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    query = db.query(models.EmailTemplate)
    if inbox:
        query = query.filter(models.EmailTemplate.account_email == inbox)
    return query.order_by(models.EmailTemplate.name).all()


@router.post("/templates", response_model=schemas.TemplateOut)
def create_template(payload: schemas.TemplateIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    account = (
        db.query(models.EmailAccount)
        .filter(models.EmailAccount.email == payload.inbox)
        .first()
    )
    if account is None:
        raise HTTPException(status_code=400, detail=f"Inbox {payload.inbox} not found")
    now = datetime.now(timezone.utc)
    template = models.EmailTemplate(
        id=pipeline.next_id(db, models.EmailTemplate, "tmpl"),
        account_email=payload.inbox,
        name=payload.name,
        category=payload.category,
        intent=payload.intent,
        status=payload.status,
        subject=payload.subject,
        body=payload.body,
        times_used=0,
        created_at=now,
        last_updated=now,
    )
    db.add(template)
    pipeline.log(db, "template_created", f"Template created: {template.name}")
    db.commit()
    db.refresh(template)
    return template


@router.put("/templates/{template_id}", response_model=schemas.TemplateOut)
def update_template(template_id: str, payload: schemas.TemplateUpdateIn, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    template = (
        db.query(models.EmailTemplate)
        .filter(models.EmailTemplate.id == template_id)
        .first()
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    template.name = payload.name
    template.category = payload.category
    template.intent = payload.intent
    template.status = payload.status
    template.subject = payload.subject
    template.body = payload.body
    template.last_updated = datetime.now(timezone.utc)
    pipeline.log(db, "template_updated", f"Template updated: {template.name}")
    db.commit()
    db.refresh(template)
    return template


@router.delete("/templates/{template_id}", response_model=schemas.TemplateOut)
def delete_template(template_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Soft-delete: move template to Deleted (Archived)."""
    template = (
        db.query(models.EmailTemplate)
        .filter(models.EmailTemplate.id == template_id)
        .first()
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.status != "Archived":
        template.archived_from = template.status
    template.status = "Archived"
    template.last_updated = datetime.now(timezone.utc)
    pipeline.log(db, "template_archived", f"Template moved to deleted: {template.name}")
    db.commit()
    db.refresh(template)
    return template


@router.post("/templates/{template_id}/restore", response_model=schemas.TemplateOut)
def restore_template(template_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    template = (
        db.query(models.EmailTemplate)
        .filter(models.EmailTemplate.id == template_id)
        .first()
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    template.status = template.archived_from or "Active"
    template.archived_from = None
    template.last_updated = datetime.now(timezone.utc)
    pipeline.log(db, "template_restored", f"Template restored: {template.name}")
    db.commit()
    db.refresh(template)
    return template


@router.delete("/templates/{template_id}/forever")
def delete_template_forever(template_id: str, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    template = (
        db.query(models.EmailTemplate)
        .filter(models.EmailTemplate.id == template_id)
        .first()
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    name = template.name
    db.delete(template)
    pipeline.log(db, "template_deleted", f"Template deleted forever: {name}")
    db.commit()
    return {"deleted": template_id}


# ── Learning loop ────────────────────────────────────────────


@router.get("/guidance", response_model=List[schemas.GuidanceNoteOut])
def list_guidance(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    return db.query(models.GuidanceNote).order_by(models.GuidanceNote.intent).all()


@router.get("/suggestions", response_model=List[schemas.TemplateSuggestionOut])
def list_suggestions(status: str = "pending", db: Session = Depends(get_db), _admin=Depends(require_admin)):
    return (
        db.query(models.TemplateSuggestion)
        .filter(models.TemplateSuggestion.status == status)
        .order_by(models.TemplateSuggestion.created_at.desc())
        .all()
    )


@router.post("/suggestions/{suggestion_id}/approve", response_model=schemas.TemplateOut)
def approve_suggestion(suggestion_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    suggestion = (
        db.query(models.TemplateSuggestion)
        .filter(models.TemplateSuggestion.id == suggestion_id)
        .first()
    )
    if suggestion is None:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    if suggestion.status != "pending":
        raise HTTPException(status_code=400, detail="Suggestion already resolved.")

    now = datetime.now(timezone.utc)
    if suggestion.kind == "revision" and suggestion.template_id:
        template = (
            db.query(models.EmailTemplate)
            .filter(models.EmailTemplate.id == suggestion.template_id)
            .first()
        )
        if template is None:
            raise HTTPException(status_code=404, detail="Target template not found")
        template.subject = suggestion.suggested_subject
        template.body = suggestion.suggested_body
        template.last_updated = now
    else:
        account = db.query(models.EmailAccount).order_by(models.EmailAccount.id).first()
        if account is None:
            raise HTTPException(status_code=400, detail="No inbox configured for new template")
        template = models.EmailTemplate(
            id=pipeline.next_id(db, models.EmailTemplate, "tmpl"),
            account_email=account.email,
            name=suggestion.suggested_name,
            category="General Enquiries",
            intent=suggestion.intent,
            status="Active",
            subject=suggestion.suggested_subject,
            body=suggestion.suggested_body,
            times_used=0,
            created_at=now,
            last_updated=now,
        )
        db.add(template)

    suggestion.status = "approved"
    suggestion.resolved_at = now
    pipeline.log(
        db, "suggestion_approved",
        f"Template suggestion approved: {suggestion.suggested_name}",
    )
    db.commit()
    db.refresh(template)
    return template


@router.post("/suggestions/{suggestion_id}/reject", response_model=schemas.TemplateSuggestionOut)
def reject_suggestion(suggestion_id: int, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    suggestion = (
        db.query(models.TemplateSuggestion)
        .filter(models.TemplateSuggestion.id == suggestion_id)
        .first()
    )
    if suggestion is None:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    suggestion.status = "rejected"
    suggestion.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(suggestion)
    return suggestion


def require_cron_secret(request: Request, secret: Optional[str] = None) -> None:
    """Guard the job-trigger endpoints. Open when PILOT2_CRON_SECRET is unset
    (local dev only); in production the secret is mandatory."""
    import os

    expected = config.CRON_SECRET
    is_production = bool(os.getenv("VERCEL")) or os.getenv("ENVIRONMENT", "").lower() == "production"
    if is_production and not expected:
        raise HTTPException(
            status_code=503,
            detail="Cron endpoints require PILOT2_CRON_SECRET in production",
        )
    if not expected:
        return
    header_secret = request.headers.get("x-cron-secret")
    bearer = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if is_production:
        provided = header_secret or bearer or ""
    else:
        provided = header_secret or bearer or secret or ""
    if not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing cron secret.")


# GET is allowed because hosted cron services typically only send GET requests.
@router.api_route("/poll", methods=["GET", "POST"])
def trigger_poll(request: Request, secret: Optional[str] = None, db: Session = Depends(get_db)):
    """Manually fetch new Gmail messages (also runs on a schedule in live
    mode; an external cron service hits this endpoint on serverless hosting)."""
    require_cron_secret(request, secret)
    processed = pipeline.poll_all_accounts(db)
    return {"emailsProcessed": processed}


# GET is allowed because hosted cron services typically only send GET requests.
@router.api_route("/learning/distill", methods=["GET", "POST"], response_model=schemas.DistillResultOut)
def trigger_distillation(request: Request, secret: Optional[str] = None, db: Session = Depends(get_db)):
    """Manual trigger for the learning job (also runs nightly on a schedule)."""
    require_cron_secret(request, secret)
    result = run_distillation(db)
    return {
        "editsProcessed": result.edits_processed,
        "intentsUpdated": result.intents_updated,
        "suggestionsCreated": result.suggestions_created,
    }


# ── Activity ─────────────────────────────────────────────────


@router.get("/activity", response_model=List[schemas.ProcessingLogOut])
def list_activity(limit: int = 25, db: Session = Depends(get_db), _admin=Depends(require_admin)):
    return (
        db.query(models.ProcessingLog)
        .order_by(models.ProcessingLog.timestamp.desc())
        .limit(min(limit, 100))
        .all()
    )
