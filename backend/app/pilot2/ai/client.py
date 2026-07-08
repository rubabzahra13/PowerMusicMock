"""Thin Gemini wrapper.

All LLM traffic goes through `generate_json` so prompt/response logging,
retries, and the no-API-key fallback live in one place. Callers must always
handle a `None` return by falling back to their deterministic path — the
pipeline must never hard-fail because the model is down.
"""

import json
import logging
import re
import time
from typing import Any, Optional

from app.pilot2 import config

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None and config.GEMINI_API_KEY:
        from google import genai

        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def llm_available() -> bool:
    return bool(config.GEMINI_API_KEY)


def _extract_json(text: str) -> Optional[dict]:
    """Parse a JSON object from model output, tolerating code fences."""
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    else:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        if brace:
            text = brace.group(0)
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def generate_json(model: str, system: str, prompt: str) -> Optional[dict[str, Any]]:
    """One structured-output call. Returns None on any failure.

    Transient errors (overload, rate limit) are retried, then the backup
    model is tried, so a busy Google model degrades to a slightly different
    model instead of a template-only draft.
    """
    client = _get_client()
    if client is None:
        return None

    backup = config.BACKUP_MODEL
    if not backup or backup == model:
        # Cross-fallback: Gemini quotas are per-model, so a backup only helps
        # if it's a DIFFERENT model. When the configured backup equals the
        # primary (e.g. composer already runs on flash), fall back to the
        # other workhorse model instead of skipping the fallback entirely.
        backup = "gemini-2.5-flash" if "lite" in model else "gemini-2.5-flash-lite"
    attempts = [model, model] + ([backup] if backup != model else [])
    for attempt, attempt_model in enumerate(attempts):
        if attempt > 0:
            time.sleep(1.5 * attempt)
        try:
            response = client.models.generate_content(
                model=attempt_model,
                contents=prompt,
                config={
                    "system_instruction": system,
                    "temperature": 0.2,
                    "response_mime_type": "application/json",
                },
            )
            return _extract_json(response.text or "")
        except Exception:
            logger.warning(
                "Gemini call failed (model=%s, attempt %d/%d)",
                attempt_model, attempt + 1, len(attempts),
                exc_info=attempt == len(attempts) - 1,
            )
    return None
