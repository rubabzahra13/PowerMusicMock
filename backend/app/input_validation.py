"""Shared input validation for API payloads (form abuse, injection, DoS)."""

from __future__ import annotations

import re
from typing import Optional

# Control characters and null bytes — common in injection / log-forging attempts
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_HTML_TAG = re.compile(r"<[^>]+>")


def strip_control_chars(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = _CONTROL_CHARS.sub("", value)
    return cleaned.strip() or None


def normalize_text(
    value: Optional[str],
    *,
    max_length: int,
    allow_empty: bool = False,
    field_name: str = "value",
) -> Optional[str]:
    if value is None:
        return None if allow_empty else ""
    cleaned = strip_control_chars(str(value))
    if cleaned is None:
        return None if allow_empty else ""
    if not cleaned and not allow_empty:
        raise ValueError(f"{field_name} is required")
    if len(cleaned) > max_length:
        raise ValueError(f"{field_name} must be at most {max_length} characters")
    return cleaned


def normalize_email(value: Optional[str], *, required: bool = False) -> Optional[str]:
    cleaned = normalize_text(
        value,
        max_length=254,
        allow_empty=not required,
        field_name="email",
    )
    if cleaned is None:
        return None
    if not _EMAIL_RE.match(cleaned):
        raise ValueError("invalid email format")
    return cleaned.lower()


def normalize_person_name(value: Optional[str], *, field_name: str = "name") -> Optional[str]:
    cleaned = normalize_text(value, max_length=100, allow_empty=True, field_name=field_name)
    if cleaned and _HTML_TAG.search(cleaned):
        raise ValueError(f"{field_name} must not contain HTML")
    return cleaned


def normalize_search_query(value: str, *, max_length: int = 100) -> str:
    cleaned = normalize_text(value, max_length=max_length, allow_empty=True, field_name="query")
    return cleaned or ""


def csv_cell(value: object) -> str:
    """Escape CSV cells and block spreadsheet formula injection (=, +, -, @)."""
    text = "" if value is None else str(value)
    text = text.replace('"', '""')
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        text = f"'{text}"
    return f'"{text}"'
