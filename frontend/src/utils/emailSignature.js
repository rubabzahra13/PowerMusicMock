export const SIGNATURE_PERSON = 'Andrea Petty';
export const SIGNATURE_COMPANY = 'Power Music Inc.';
export const LEGACY_SIGNATURE = 'Kind regards,\nPower Music Team';

const LEGACY_SIGNATURE_RE = /\n*Kind regards,?\s*\n\s*Power Music Team\s*$/i;
const NEW_SIGNATURE_MARKER = `Thank you.\n\n${SIGNATURE_PERSON}`;

export function buildEmailSignature(inboxTitle) {
  const title = (inboxTitle || '').trim() || 'Power Music';
  return `Thank you.\n\n${SIGNATURE_PERSON}\n${title}\n${SIGNATURE_COMPANY}`;
}

export function resolveInboxTitle(inboxes, accountEmail) {
  const match = (inboxes || []).find((row) => row.email === accountEmail);
  return match?.title?.trim() || accountEmail || 'Power Music';
}

/** Remove lines that open with thank-you phrasing (signature handles closing thanks). */
export function stripGratitudePhrases(text) {
  if (!text?.trim()) return text;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    return !/^(thanks|thank you)\b/i.test(trimmed);
  });
  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function stripLegacySignature(text) {
  return text.replace(/\r\n/g, '\n').replace(LEGACY_SIGNATURE_RE, '').trimEnd();
}

export function hasNewSignature(text) {
  return text.includes(NEW_SIGNATURE_MARKER);
}

/** Normalize stored drafts: drop body thanks, swap legacy sign-off for inbox signature. */
export function normalizeDraftSignature(body, inboxTitle) {
  if (!body?.trim()) return body;

  let text = body.replace(/\r\n/g, '\n').trimEnd();
  const hadLegacy = LEGACY_SIGNATURE_RE.test(text);
  text = stripLegacySignature(text);
  text = stripGratitudePhrases(text);

  const signature = buildEmailSignature(inboxTitle);
  if (!text.endsWith(signature)) {
    if (hadLegacy || !hasNewSignature(text)) {
      text = text ? `${text}\n\n${signature}` : signature;
    }
  }
  return text;
}

export function splitDraftBody(body, inboxTitle) {
  const text = normalizeDraftSignature(body, inboxTitle);
  const signature = buildEmailSignature(inboxTitle);
  if (text.endsWith(signature)) {
    const main = text.slice(0, text.length - signature.length).replace(/\s+$/, '');
    return { main, signature };
  }
  return { main: text, signature: null };
}
