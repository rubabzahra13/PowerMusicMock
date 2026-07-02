"""Call 1 — inbound processing agent.

One cheap structured-output call per email: intent, confidence, language,
sender first name, urgency, template match, and the handle-vs-flag decision.
Falls back to keyword heuristics when the LLM is unavailable so the pipeline
keeps moving in dev or during an outage.
"""

import json
import re
from dataclasses import dataclass, field
from typing import List, Optional

from app.pilot2 import config
from app.pilot2.ai.client import generate_json, llm_available


@dataclass
class Classification:
    intent: str
    confidence: int
    language: str
    sender_first_name: str
    urgent: bool
    should_ignore: bool
    flag: bool
    flag_reason: Optional[str]
    template_ids: List[str] = field(default_factory=list)


_SYSTEM = """You are the email triage agent for Power Music, a fitness-music company.
Analyse the inbound email and return ONLY a JSON object with these keys:
- intent: one of {intents}
- confidence: integer 0-100
- language: ISO 639-1 code of the email body (en, fr, de, es, ja, ...)
- sender_first_name: the sender's first name, or "there" if unknown
- urgent: boolean — time-sensitive or strongly negative sentiment
- should_ignore: boolean — spam, vendor/newsletter noise, internal forwards, or empty messages
- flag: boolean — true if this needs the admin's judgment instead of a template reply
  (account- or order-specific questions, refunds, novel technical issues, aggressive tone,
  repeated follow-ups, or no template fits)
- flag_reason: short human-readable reason when flag is true, else null
- template_ids: ids of templates from the provided library that answer this email,
  best match first; empty array if none fit"""


def _heuristic(from_name: str, subject: str, body: str, templates: list) -> Classification:
    text = f"{subject}\n{body}".lower()
    keyword_map = [
        ("Cancellation", ["cancel", "cancellation", "terminate"]),
        ("Renewal", ["renew", "renewal", "expire", "expiring"]),
        ("Finance", ["invoice", "payment", "billing", "charge", "refund"]),
        ("Partnership", ["partner", "partnership", "collaboration", "licensing partner"]),
        ("Events", ["event", "invitation", "workshop"]),
    ]
    intent, confidence = "Enquiry", 50
    for name, keywords in keyword_map:
        if any(k in text for k in keywords):
            intent, confidence = name, 75
            break

    first_name = from_name.split()[0] if from_name.strip() else "there"
    urgent = any(k in text for k in ["urgent", "asap", "immediately", "unacceptable"])
    should_ignore = any(k in text for k in ["unsubscribe", "no-reply", "noreply"]) or not body.strip()

    matched = [t.id for t in templates if t.status == "Active" and t.intent == intent]
    flag = not matched or confidence < 60 or "refund" in text
    flag_reason = None
    if flag:
        if "refund" in text:
            flag_reason = "Refund request needs admin review"
        elif not matched:
            flag_reason = "No suitable template found"
        else:
            flag_reason = "Low classification confidence"

    return Classification(
        intent=intent,
        confidence=confidence,
        language="en",
        sender_first_name=first_name,
        urgent=urgent,
        should_ignore=should_ignore,
        flag=flag,
        flag_reason=flag_reason,
        template_ids=matched[:1],
    )


def classify(from_name: str, from_email: str, subject: str, body: str, templates: list) -> Classification:
    if not llm_available():
        return _heuristic(from_name, subject, body, templates)

    library = [
        {"id": t.id, "name": t.name, "intent": t.intent, "category": t.category, "subject": t.subject}
        for t in templates
        if t.status == "Active"
    ]
    prompt = (
        f"TEMPLATE LIBRARY:\n{json.dumps(library, indent=2)}\n\n"
        f"EMAIL:\nFrom: {from_name} <{from_email}>\nSubject: {subject}\n\n{body}"
    )
    result = generate_json(
        config.CLASSIFIER_MODEL,
        _SYSTEM.format(intents=", ".join(config.INTENTS)),
        prompt,
    )
    if result is None:
        return _heuristic(from_name, subject, body, templates)

    valid_ids = {t.id for t in templates}
    intent = result.get("intent") if result.get("intent") in config.INTENTS else "Enquiry"
    language = str(result.get("language") or "en").lower()[:5]
    if not re.fullmatch(r"[a-z]{2}(-[a-z]{2})?", language):
        language = "en"
    return Classification(
        intent=intent,
        confidence=max(0, min(100, int(result.get("confidence") or 0))),
        language=language,
        sender_first_name=str(result.get("sender_first_name") or "there").strip() or "there",
        urgent=bool(result.get("urgent")),
        should_ignore=bool(result.get("should_ignore")),
        flag=bool(result.get("flag")),
        flag_reason=result.get("flag_reason"),
        template_ids=[tid for tid in (result.get("template_ids") or []) if tid in valid_ids],
    )
