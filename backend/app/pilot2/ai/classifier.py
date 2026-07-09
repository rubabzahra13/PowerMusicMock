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
- intent: the single best-matching intent from the KNOWN INTENTS list below.
  If — and only if — none of them fit this email's purpose, return a concise
  NEW intent name in Title Case (1-3 words, e.g. "Order Timing"). Prefer reusing
  an existing intent over inventing a near-duplicate.
  KNOWN INTENTS: {intents}
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


# Common words carry no matching signal — drop them before scoring overlap.
_STOPWORDS = {
    "the", "and", "for", "you", "your", "our", "with", "this", "that", "have",
    "are", "was", "were", "will", "would", "can", "could", "should", "from",
    "about", "would", "there", "hello", "hi", "hey", "dear", "team", "please",
    "thanks", "thank", "regards", "kind", "best", "any", "all", "how", "what",
    "when", "where", "who", "why", "get", "got", "has", "had", "not", "but",
    "just", "know", "let", "would", "like", "want", "need", "power", "music",
}


def _keywords(text: str) -> set:
    return {
        word
        for word in re.findall(r"[a-z]{3,}", (text or "").lower())
        if word not in _STOPWORDS
    }


def match_templates_by_keywords(
    subject: str,
    body: str,
    templates: list,
    *,
    max_matches: int = 1,
    min_score: int = 1,
) -> List[str]:
    """Lexical fallback matcher — no LLM, no reliance on the template `intent`
    field. Scores each ACTIVE template by how many meaningful words it shares
    with the email (matched on the signal-rich name/subject/category, not the
    noisy full body), and returns the best match(es). Used when the model is
    unavailable or returned no match, so template drafts still work on the free
    tier / during rate limits. Deterministic and side-effect free.
    """
    email_words = _keywords(f"{subject} {subject} {body}")  # subject counts twice
    if not email_words:
        return []
    scored: list[tuple[int, str]] = []
    for t in templates:
        if getattr(t, "status", None) != "Active":
            continue
        template_words = _keywords(f"{t.name} {t.subject} {getattr(t, 'category', '') or ''}")
        score = len(email_words & template_words)
        if score >= min_score:
            scored.append((score, t.id))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [tid for _, tid in scored[:max_matches]]


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

    first_name = _clean_first_name(from_name)
    urgent = any(k in text for k in ["urgent", "asap", "immediately", "unacceptable"])
    should_ignore = any(k in text for k in ["unsubscribe", "no-reply", "noreply"]) or not body.strip()

    # Match by keyword overlap, not the (often-null) template intent label.
    matched = match_templates_by_keywords(subject, body, templates, max_matches=1)
    flag = not matched or "refund" in text
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


def _clean_first_name(value) -> str:
    """First name for the greeting: letters only, first word, capitalised.
    Falls back to 'there' (kept lowercase — reads right in 'Hi there,')."""
    raw = re.sub(r"[^A-Za-z'\-]", " ", str(value or "")).strip()
    first = raw.split(" ")[0] if raw else ""
    if not first:
        return "there"
    return first[:1].upper() + first[1:]


def _sanitize_intent(value) -> str:
    """Normalise a returned intent name (known or newly proposed) to a clean,
    capped Title-Case label. Falls back to 'Enquiry' when empty."""
    text = re.sub(r"\s+", " ", str(value or "").strip())
    text = re.sub(r"[^A-Za-z0-9 &/-]", "", text)[:40].strip()
    if not text:
        return "Enquiry"
    return " ".join(word[:1].upper() + word[1:] if word else word for word in text.split(" "))


def classify(
    from_name: str,
    from_email: str,
    subject: str,
    body: str,
    templates: list,
    known_intents: Optional[List[str]] = None,
) -> Classification:
    if not llm_available():
        return _heuristic(from_name, subject, body, templates)

    intents_list = known_intents or config.INTENTS

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
        _SYSTEM.format(intents=", ".join(intents_list)),
        prompt,
    )
    if result is None:
        return _heuristic(from_name, subject, body, templates)

    valid_ids = {t.id for t in templates}
    # Accept the returned intent as-is (known OR a newly proposed one) — no
    # longer forced into a fixed list, so genuinely new intents are captured.
    intent = _sanitize_intent(result.get("intent"))
    language = str(result.get("language") or "en").lower()[:5]
    if not re.fullmatch(r"[a-z]{2}(-[a-z]{2})?", language):
        language = "en"
    return Classification(
        intent=intent,
        confidence=max(0, min(100, int(result.get("confidence") or 0))),
        language=language,
        sender_first_name=_clean_first_name(result.get("sender_first_name")),
        urgent=bool(result.get("urgent")),
        should_ignore=bool(result.get("should_ignore")),
        flag=bool(result.get("flag")),
        flag_reason=result.get("flag_reason"),
        template_ids=[tid for tid in (result.get("template_ids") or []) if tid in valid_ids],
    )
