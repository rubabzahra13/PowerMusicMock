"""Gmail integration.

Two modes, selected by PILOT2_GMAIL_MODE:
- "mock": no Google calls. Inboxes connect instantly, sends are recorded
  locally. This is the development default so the whole stack runs without
  Google Cloud credentials.
- "live": real Gmail API. OAuth per inbox (one-time consent screen), message
  polling, and replies sent inside the original thread.

Google client libraries are imported lazily so mock mode works without them
installed.
"""

import base64
import logging
import os

# Google may return MORE scopes than requested (it merges previously granted
# ones). oauthlib treats that as an error by default; relax it — extra scopes
# are fine for us.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import parseaddr, parsedate_to_datetime
from typing import List, Optional, Tuple

from app import models
from app.pilot2 import config

logger = logging.getLogger(__name__)

# Full mail scope: gmail.modify covers read/trash/label changes, but the
# dashboard's "empty bin" must also permanently delete in Gmail, and
# messages.delete requires the full scope.
GMAIL_SCOPES = ["https://mail.google.com/"]

# System label ids returned by the Gmail API.
LABEL_INBOX = "INBOX"
LABEL_SENT = "SENT"
LABEL_TRASH = "TRASH"
LABEL_SPAM = "SPAM"
LABEL_STARRED = "STARRED"
LABEL_UNREAD = "UNREAD"
LABEL_DRAFT = "DRAFT"

# Bulk categories that are never customer enquiries in a support inbox.
# Genuinely ambiguous mail (Primary/Updates) still flows through and the AI
# classifier decides whether to ignore it.
NO_PROMOTIONS = "-category:promotions -category:social -category:forums"


@dataclass
class InboundMessage:
    gmail_message_id: str
    gmail_thread_id: str
    from_name: str
    from_email: str
    subject: str
    body: str
    received_at: datetime
    label_ids: List[str] = field(default_factory=list)
    # True when bulk/automated-mail headers are present (List-Unsubscribe,
    # Precedence: bulk/list, Auto-Submitted). Real customers never set these.
    is_automated: bool = False


def is_no_reply_address(address: str) -> bool:
    """True for addresses that cannot receive replies (no-reply@, bounces, …)."""
    local = (address or "").split("@", 1)[0].lower()
    if local in {"mailer-daemon", "postmaster", "bounce", "bounces"}:
        return True
    compact = local.replace("-", "").replace(".", "").replace("_", "")
    return "noreply" in compact or "donotreply" in compact


def _is_automated_headers(headers: dict) -> bool:
    if "list-unsubscribe" in headers or "list-id" in headers:
        return True
    if headers.get("auto-submitted", "").lower().startswith("auto"):
        return True
    if headers.get("precedence", "").lower() in {"bulk", "list", "junk", "auto_reply"}:
        return True
    # Bulk-ESP feedback-loop marker (Amazon SES, SendGrid, …); never present
    # on mail a human wrote in a mail client.
    if "feedback-id" in headers or "x-ses-outgoing" in headers:
        return True
    # Replies routed to a dead mailbox = notification, not correspondence
    # (e.g. Vercel alerts: From notifications@ with Reply-To no-reply@).
    _, reply_to = parseaddr(headers.get("reply-to", ""))
    if reply_to and is_no_reply_address(reply_to):
        return True
    return False


def is_live() -> bool:
    return config.GMAIL_MODE == "live"


# ── OAuth ────────────────────────────────────────────────────


def _flow():
    from google_auth_oauthlib.flow import Flow

    return Flow.from_client_config(
        {
            "web": {
                "client_id": config.GOOGLE_CLIENT_ID,
                "client_secret": config.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=GMAIL_SCOPES,
        redirect_uri=config.GOOGLE_REDIRECT_URI,
    )


# PKCE verifiers by OAuth state. The authorization URL carries a one-time
# code challenge; the callback must present the matching verifier, so it is
# kept here between the two requests. (Single-process only — fine for this
# pilot; move to the database if the API ever runs on multiple workers.)
_code_verifiers: dict = {}


def get_authorization_url(state: str) -> str:
    flow = _flow()
    # No include_granted_scopes: merging previously granted scopes into the
    # token response is what trips oauthlib's scope check on reconnects.
    url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",  # force refresh_token issuance on reconnect
        state=state,
    )
    _code_verifiers[state] = flow.code_verifier
    return url


def exchange_code(code: str, state: str) -> Tuple[str, str]:
    """Exchange the OAuth callback code. Returns (email, refresh_token)."""
    flow = _flow()
    verifier = _code_verifiers.pop(state, None)
    if verifier:
        flow.code_verifier = verifier
    flow.fetch_token(code=code)
    credentials = flow.credentials
    service = _service_from_credentials(credentials)
    profile = service.users().getProfile(userId="me").execute()
    return profile["emailAddress"], credentials.refresh_token


def _service_from_credentials(credentials):
    from googleapiclient.discovery import build

    return build("gmail", "v1", credentials=credentials, cache_discovery=False)


def _service_for_account(account: models.EmailAccount):
    from google.oauth2.credentials import Credentials

    # scopes=None → refresh with whatever scopes the token was granted.
    # Pinning GMAIL_SCOPES here breaks tokens issued under the older, narrower
    # scope (invalid_scope on refresh); permanent-delete simply degrades to
    # trash until the inbox is reconnected with the full scope.
    credentials = Credentials(
        token=None,
        refresh_token=account.oauth_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=config.GOOGLE_CLIENT_ID,
        client_secret=config.GOOGLE_CLIENT_SECRET,
        scopes=None,
    )
    return _service_from_credentials(credentials)


# ── Reading ──────────────────────────────────────────────────


def _decode_part(payload) -> str:
    if payload.get("mimeType") == "text/plain" and payload.get("body", {}).get("data"):
        return base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", "replace")
    for part in payload.get("parts", []) or []:
        text = _decode_part(part)
        if text:
            return text
    return ""


def _parse_full_message(full: dict) -> InboundMessage:
    headers = {h["name"].lower(): h["value"] for h in full["payload"].get("headers", [])}
    from_name, from_email = parseaddr(headers.get("from", ""))
    try:
        received_at = parsedate_to_datetime(headers.get("date", ""))
    except (TypeError, ValueError):
        received_at = datetime.now(timezone.utc)
    return InboundMessage(
        gmail_message_id=full["id"],
        gmail_thread_id=full.get("threadId", full["id"]),
        from_name=from_name or from_email or "Unknown Sender",
        from_email=from_email or "unknown@unknown",
        subject=headers.get("subject", "(no subject)"),
        body=_decode_part(full["payload"]),
        received_at=received_at,
        label_ids=list(full.get("labelIds") or []),
        is_automated=_is_automated_headers(headers),
    )


def fetch_new_messages(account: models.EmailAccount, known_ids: set) -> List[InboundMessage]:
    """Pull recent inbox messages not yet in our database (legacy fallback)."""
    if not is_live():
        return []

    service = _service_for_account(account)
    listing = (
        service.users()
        .messages()
        .list(
            userId="me",
            q=f"newer_than:2d in:inbox {NO_PROMOTIONS}",
            maxResults=50,
        )
        .execute()
    )
    messages = []
    for ref in listing.get("messages", []) or []:
        if ref["id"] in known_ids:
            continue
        full = service.users().messages().get(userId="me", id=ref["id"], format="full").execute()
        messages.append(_parse_full_message(full))
    return messages


def list_message_ids(
    account: models.EmailAccount,
    query: str,
    *,
    page_token: Optional[str] = None,
    max_results: int = 100,
) -> Tuple[List[str], Optional[str]]:
    """One page of Gmail message ids for a search query."""
    if not is_live():
        return [], None
    service = _service_for_account(account)
    listing = (
        service.users()
        .messages()
        .list(
            userId="me",
            q=query,
            maxResults=max_results,
            pageToken=page_token,
        )
        .execute()
    )
    ids = [ref["id"] for ref in listing.get("messages", []) or []]
    return ids, listing.get("nextPageToken")


def list_all_message_ids(
    account: models.EmailAccount,
    query: str,
    *,
    max_messages: int = 500,
    pause_seconds: float = 0.08,
) -> List[str]:
    """Paginate a Gmail search query up to max_messages ids."""
    import time

    collected: List[str] = []
    page_token: Optional[str] = None
    while len(collected) < max_messages:
        batch, page_token = list_message_ids(
            account,
            query,
            page_token=page_token,
            max_results=min(100, max_messages - len(collected)),
        )
        if not batch:
            break
        collected.extend(batch)
        if pause_seconds:
            time.sleep(pause_seconds)
        if not page_token:
            break
    return collected[:max_messages]


def get_profile(account: models.EmailAccount) -> dict:
    if not is_live():
        return {"historyId": "0", "emailAddress": account.email}
    service = _service_for_account(account)
    return service.users().getProfile(userId="me").execute()


def list_history(
    account: models.EmailAccount,
    start_history_id: str,
    *,
    page_token: Optional[str] = None,
) -> dict:
    if not is_live():
        return {"history": [], "historyId": start_history_id}
    service = _service_for_account(account)
    return (
        service.users()
        .history()
        .list(
            userId="me",
            startHistoryId=start_history_id,
            historyTypes=["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
            pageToken=page_token,
        )
        .execute()
    )


def thread_has_sent(account: models.EmailAccount, thread_id: str) -> bool:
    """True when this Gmail thread already contains a message sent by the account."""
    if not is_live() or not thread_id:
        return False
    service = _service_for_account(account)
    thread = (
        service.users()
        .threads()
        .get(userId="me", id=thread_id, format="metadata", metadataHeaders=[])
        .execute()
    )
    for msg in thread.get("messages", []) or []:
        if LABEL_SENT in (msg.get("labelIds") or []):
            return True
    return False


def get_message(account: models.EmailAccount, message_id: str) -> Optional[InboundMessage]:
    """Fetch one full message by Gmail id."""
    if not is_live():
        return None
    service = _service_for_account(account)
    full = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    return _parse_full_message(full)


def fetch_label_ids(account: models.EmailAccount, label: str, max_pages: int = 2) -> set:
    """Gmail message ids carrying one label (TRASH, UNREAD, INBOX, ...).

    Paged to max_pages*100 most recent messages — plenty for the emails this
    dashboard tracks.
    """
    if not is_live():
        return set()
    service = _service_for_account(account)
    ids, page_token = set(), None
    for _ in range(max_pages):
        listing = (
            service.users()
            .messages()
            .list(userId="me", labelIds=[label], maxResults=100, pageToken=page_token)
            .execute()
        )
        ids |= {ref["id"] for ref in listing.get("messages", []) or []}
        page_token = listing.get("nextPageToken")
        if not page_token:
            break
    return ids


def fetch_message(account: models.EmailAccount, message_id: str) -> Optional[InboundMessage]:
    """Fetch one full message (used to show Gmail-trashed mail we never saw)."""
    return get_message(account, message_id)


# ── Writing state back to Gmail ──────────────────────────────


def modify_labels_batch(account: models.EmailAccount, message_ids: list,
                        add_labels: list, remove_labels: list) -> None:
    """One batched label change for many messages (read/unread, archive)."""
    if not is_live() or not message_ids:
        return
    service = _service_for_account(account)
    service.users().messages().batchModify(
        userId="me",
        body={"ids": message_ids, "addLabelIds": add_labels, "removeLabelIds": remove_labels},
    ).execute()


def trash_message(account: models.EmailAccount, message_id: str) -> None:
    if not is_live():
        return
    service = _service_for_account(account)
    service.users().messages().trash(userId="me", id=message_id).execute()


def untrash_message(account: models.EmailAccount, message_id: str) -> None:
    if not is_live():
        return
    service = _service_for_account(account)
    service.users().messages().untrash(userId="me", id=message_id).execute()


def delete_message_forever(account: models.EmailAccount, message_id: str) -> None:
    """Permanent Gmail delete. Falls back to trash when the connected token
    only has the older gmail.modify scope (reconnect upgrades it)."""
    if not is_live():
        return
    service = _service_for_account(account)
    try:
        service.users().messages().delete(userId="me", id=message_id).execute()
    except Exception:
        logger.warning(
            "Permanent delete failed for %s (token may lack full scope); trashing instead",
            message_id,
        )
        service.users().messages().trash(userId="me", id=message_id).execute()


# ── Sending ──────────────────────────────────────────────────


def send_reply(account: models.EmailAccount, email_row: models.Email, body: str) -> Optional[str]:
    """Send the reply inside the original Gmail thread. Returns the Gmail
    message id, or None in mock mode (send is recorded locally only)."""
    if not is_live():
        logger.info("[mock gmail] send from %s to %s", account.email, email_row.from_email)
        return None

    message = EmailMessage()
    message["To"] = f"{email_row.from_name} <{email_row.from_email}>"
    message["From"] = account.email
    subject = email_row.subject or ""
    message["Subject"] = subject if subject.lower().startswith("re:") else f"Re: {subject}"
    message.set_content(body)

    payload = {"raw": base64.urlsafe_b64encode(message.as_bytes()).decode()}
    if email_row.gmail_thread_id:
        payload["threadId"] = email_row.gmail_thread_id

    service = _service_for_account(account)
    sent = service.users().messages().send(userId="me", body=payload).execute()
    return sent.get("id")
