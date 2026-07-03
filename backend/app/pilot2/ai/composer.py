"""Call 2 — draft composer.

Runs on every email that gets a draft. The LLM always sees the original
email, the matched template(s) (in the sender's language when a reviewed
variant exists), and the capped guidance notes for the intent. It matches the
sender's tone and personalises wording; it returns the template verbatim only
when the template already answers the email 100%.

tweak_level values:
- verbatim      template fit as-is (placeholders filled only)
- personalized  single template, wording adapted to the email
- merged        multiple templates combined into one reply
- fallback      no template — polite acknowledgement, email gets flagged
"""

import json
from dataclasses import dataclass
from typing import List, Optional

from app.pilot2 import config
from app.pilot2.ai.classifier import Classification
from app.pilot2.ai.client import generate_json, llm_available


@dataclass
class Draft:
    body: str
    tweak_level: str


_SYSTEM = """You draft customer-support email replies for Power Music.
You are given the customer's email, one or more approved reply templates, and
"guidance notes" distilled from how the human admin edited past drafts.

Rules, in priority order:
1. The templates are the approved substance of the answer. Never invent
   policies, prices, or commitments that are not in a template.
2. Match the sender's tone and personalise the wording so the reply reads like
   it was written for this specific email (reference their situation, mirror
   their formality). Only if a template already answers the email 100% —
   nothing to acknowledge, nothing to adapt — return it verbatim with
   placeholders filled.
3. If several templates are provided, merge them into ONE coherent reply.
4. Follow every guidance note.
5. Reply in language "{language}". Open with a greeting to {first_name} and
   end with exactly this signature:
{signature}
6. Fill placeholders like {{{{first_name}}}} with real values; never leave
   double-brace placeholders in the output.

Return ONLY a JSON object:
- body: the full reply text
- tweak_level: "verbatim" | "personalized" | "merged"
"""


def _fill(template_body: str, first_name: str) -> str:
    return (
        template_body.replace("{{first_name}}", first_name)
        .replace("{{club_name}}", "your club")
        .replace("{{membership_type}}", "membership")
    )


def _fallback_acknowledgement(first_name: str) -> str:
    return (
        f"Hi {first_name},\n\n"
        "Thank you for your message. A member of our team will review your enquiry "
        "and respond shortly.\n\n"
        f"{config.SIGNATURE}"
    )


def compose(
    body: str,
    subject: str,
    classification: Classification,
    templates: list,
    translations_by_template: dict,
    guidance_rules: List[str],
) -> Draft:
    first_name = classification.sender_first_name

    if not templates:
        return Draft(body=_fallback_acknowledgement(first_name), tweak_level="fallback")

    # Prefer a reviewed translation of each template in the sender's language.
    template_payload = []
    for t in templates:
        variant = translations_by_template.get((t.id, classification.language))
        template_payload.append(
            {
                "name": t.name,
                "subject": variant.subject if variant else t.subject,
                "body": variant.body if variant else t.body,
            }
        )

    if not llm_available():
        return Draft(body=_fill(template_payload[0]["body"], first_name), tweak_level="verbatim")

    system = _SYSTEM.format(
        language=classification.language,
        first_name=first_name,
        signature=config.SIGNATURE,
    )
    prompt = (
        f"GUIDANCE NOTES for intent '{classification.intent}':\n"
        + (json.dumps(guidance_rules, indent=2) if guidance_rules else "(none yet)")
        + f"\n\nTEMPLATES:\n{json.dumps(template_payload, indent=2)}"
        + f"\n\nCUSTOMER EMAIL:\nSubject: {subject}\n\n{body}"
    )
    result = generate_json(config.COMPOSER_MODEL, system, prompt)

    if result is None or not str(result.get("body") or "").strip():
        return Draft(body=_fill(template_payload[0]["body"], first_name), tweak_level="verbatim")

    tweak_level = result.get("tweak_level")
    if tweak_level not in ("verbatim", "personalized", "merged"):
        tweak_level = "merged" if len(templates) > 1 else "personalized"
    return Draft(body=str(result["body"]).strip(), tweak_level=tweak_level)
