"""Environment-driven configuration for Pilot 2."""

import os

from dotenv import load_dotenv

load_dotenv()

# AI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
# Cheap, fast model for the high-volume classification call.
CLASSIFIER_MODEL = os.getenv("PILOT2_CLASSIFIER_MODEL", "gemini-2.5-flash-lite")
# Composer runs on every email too, so it also defaults to Flash; bump via env
# if draft quality needs it.
COMPOSER_MODEL = os.getenv("PILOT2_COMPOSER_MODEL", "gemini-2.5-flash")
# Distiller runs once a day on a batch, so a stronger model is affordable.
DISTILLER_MODEL = os.getenv("PILOT2_DISTILLER_MODEL", "gemini-2.5-flash")
# Tried when the primary model is overloaded or rate-limited.
BACKUP_MODEL = os.getenv("PILOT2_BACKUP_MODEL", "gemini-2.5-flash-lite")

# Learning loop bounds — these guarantee a flat context size forever.
MAX_RULES_PER_INTENT = int(os.getenv("PILOT2_MAX_RULES_PER_INTENT", "10"))
MAX_RULE_CHARS = int(os.getenv("PILOT2_MAX_RULE_CHARS", "200"))
DISTILL_BATCH_SIZE = int(os.getenv("PILOT2_DISTILL_BATCH_SIZE", "50"))
# Same-template edits needed before the distiller proposes a template revision.
SUGGESTION_MIN_EDITS = int(os.getenv("PILOT2_SUGGESTION_MIN_EDITS", "3"))

# Gmail integration: "mock" (no Google calls; drafts/sends are recorded
# locally) or "live" (real Gmail API via OAuth).
GMAIL_MODE = os.getenv("PILOT2_GMAIL_MODE", "mock")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/pilot2/inboxes/oauth/callback"
)

# Shared secret for the poll/distill trigger endpoints. When set, callers
# must send it (X-Cron-Secret header, Authorization: Bearer, or ?secret=).
# Leave empty in local dev to keep the endpoints open.
CRON_SECRET = os.getenv("PILOT2_CRON_SECRET", "")

# Background jobs
POLL_INTERVAL_MINUTES = int(os.getenv("PILOT2_POLL_INTERVAL_MINUTES", "1"))
DISTILL_HOUR_UTC = int(os.getenv("PILOT2_DISTILL_HOUR_UTC", "2"))
SCHEDULER_ENABLED = os.getenv("PILOT2_SCHEDULER_ENABLED", "true").lower() == "true"

SIGNATURE = os.getenv("PILOT2_SIGNATURE", "Kind regards,\nPower Music Team")

INTENTS = ["Enquiry", "Cancellation", "Renewal", "Partnership", "Finance", "Events"]
SUPPORTED_LANGUAGES = ["en", "fr", "de", "es", "ja"]
