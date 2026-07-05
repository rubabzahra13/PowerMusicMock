"""Allowed manager_requests.tags values (flags only — not outcome)."""

TAG_ALREADY_EXISTS = "Already Exists"
TAG_AUTOMATED_EMAIL = "Automated email received"

ALLOWED_TAGS = frozenset({TAG_ALREADY_EXISTS, TAG_AUTOMATED_EMAIL})
