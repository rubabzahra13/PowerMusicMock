const DIRECTORY_EMAILS_KEY = 'pm_admin_directory_highlight_emails';
const VISITS_SINCE_MARK_KEY = 'pm_admin_directory_visits_since_mark';
const DIRECTORY_VISIT_DEDUPE_KEY = 'pm_admin_directory_visit_dedupe';
const UNSEEN_REQUESTS_KEY = 'pm_admin_unseen_request_ids';

/** LinkedIn-style unseen row highlight (new requests + directory). */
export const ADMIN_NEW_ROW_HIGHLIGHT_CLASS =
  'bg-[#e8f3fc] hover:bg-[#dbeafa] shadow-[inset_3px_0_0_0_var(--color-brand-primary)]';

function readJson(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota
  }
}

function readEmailSet() {
  return new Set(readJson(DIRECTORY_EMAILS_KEY, []));
}

function writeEmailSet(set) {
  writeJson(DIRECTORY_EMAILS_KEY, [...set]);
}

function readUnseenRequests() {
  return new Set(readJson(UNSEEN_REQUESTS_KEY, []));
}

function writeUnseenRequests(set) {
  writeJson(UNSEEN_REQUESTS_KEY, [...set]);
}

/**
 * Call once per real navigation to Directory (pass a stable dedupe key, e.g. location.key).
 * Skips duplicate effect runs (React StrictMode) with the same dedupe key.
 */
export function registerDirectoryPageVisit(dedupeKey) {
  if (dedupeKey) {
    const seen = sessionStorage.getItem(DIRECTORY_VISIT_DEDUPE_KEY);
    if (seen === dedupeKey) return;
    sessionStorage.setItem(DIRECTORY_VISIT_DEDUPE_KEY, dedupeKey);
  }

  const emails = readEmailSet();
  if (emails.size === 0) return;

  const visits = Number(sessionStorage.getItem(VISITS_SINCE_MARK_KEY) || '0') + 1;
  sessionStorage.setItem(VISITS_SINCE_MARK_KEY, String(visits));

  if (visits > 1) {
    writeEmailSet(new Set());
    sessionStorage.removeItem(VISITS_SINCE_MARK_KEY);
  }
}

export function markDirectoryPersonHighlight(email) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return;

  const emails = readEmailSet();
  emails.add(normalized);
  writeEmailSet(emails);
  sessionStorage.setItem(VISITS_SINCE_MARK_KEY, '0');
  sessionStorage.removeItem(DIRECTORY_VISIT_DEDUPE_KEY);
}

export function isDirectoryPersonHighlighted(email) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return false;
  return readEmailSet().has(normalized);
}

export function clearDirectoryPersonHighlight(email) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return;

  const emails = readEmailSet();
  emails.delete(normalized);
  writeEmailSet(emails);

  if (emails.size === 0) {
    sessionStorage.removeItem(VISITS_SINCE_MARK_KEY);
  }
}

export function markRequestUnseen(requestId) {
  if (!requestId) return;
  const ids = readUnseenRequests();
  ids.add(requestId);
  writeUnseenRequests(ids);
}

export function isRequestUnseen(requestId) {
  if (!requestId) return false;
  return readUnseenRequests().has(requestId);
}

export function clearRequestHighlight(requestId) {
  if (!requestId) return;
  const ids = readUnseenRequests();
  ids.delete(requestId);
  writeUnseenRequests(ids);
}
