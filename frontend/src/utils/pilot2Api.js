// Pilot 2 API client — same base URL convention as the Pilot 1 pages
// (see utils/api.js: localhost in dev, same-origin in production).
import { fetchJson, authFetch } from './api';

const ADMIN_TIMEOUT_MS = 45000;

async function request(path, options = {}) {
  return fetchJson(path, {
    headers: { 'Content-Type': 'application/json' },
    timeout: ADMIN_TIMEOUT_MS,
    ...options,
  });
}

function isApiErrorPayload(data) {
  return (
    data != null
    && typeof data === 'object'
    && !Array.isArray(data)
    && typeof data.detail === 'string'
    && Object.keys(data).length === 1
  );
}

function isRateLimitError(err) {
  const msg = err?.message || '';
  return msg.includes('Too many requests') || msg.includes('429');
}

export { isRateLimitError };

function readSessionCache(key) {
  try {
    const cached = sessionStorage.getItem(`pm_cache_${key}`);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (isApiErrorPayload(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

const inFlightFreshByKey = new Map();

async function fetchFreshWithRateLimitRetry(fetcher, cacheKey) {
  if (inFlightFreshByKey.has(cacheKey)) {
    return inFlightFreshByKey.get(cacheKey);
  }

  const run = async () => {
    try {
      return await fetcher();
    } catch (err) {
      if (!isRateLimitError(err) || !readSessionCache(cacheKey)) {
        throw err;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      return fetcher();
    }
  };

  const promise = run().finally(() => {
    inFlightFreshByKey.delete(cacheKey);
  });
  inFlightFreshByKey.set(cacheKey, promise);
  return promise;
}

// Stale-while-revalidate: show the last known data instantly from
// sessionStorage, then fetch fresh data and update. `apply(data, isStale)`
// is called up to twice — once with cached data, once with fresh data.
export async function loadWithCache(key, fetcher, apply) {
  const cached = readSessionCache(key);
  if (cached) apply(cached, true);

  try {
    const fresh = await fetchFreshWithRateLimitRetry(fetcher, key);
    if (isApiErrorPayload(fresh)) {
      throw new Error(fresh.detail);
    }
    try { sessionStorage.setItem(`pm_cache_${key}`, JSON.stringify(fresh)); } catch { /* quota */ }
    apply(fresh, false);
    return fresh;
  } catch (err) {
    if (cached && isRateLimitError(err)) {
      return cached;
    }
    throw err;
  }
}

// Network-only refresh for post-mutation revalidation. Skips the stale
// sessionStorage apply so optimistic updates are not briefly reverted.
export async function refreshCache(key, fetcher, apply) {
  try {
    const fresh = await fetchFreshWithRateLimitRetry(fetcher, key);
    if (isApiErrorPayload(fresh)) {
      throw new Error(fresh.detail);
    }
    try { sessionStorage.setItem(`pm_cache_${key}`, JSON.stringify(fresh)); } catch { /* quota */ }
    apply(fresh, false);
    return fresh;
  } catch (err) {
    const cached = readSessionCache(key);
    if (cached && isRateLimitError(err)) {
      apply(cached, true);
      return cached;
    }
    throw err;
  }
}

// Write-through: keep the cache in step with an optimistic local update so
// navigating away and back never shows the pre-change data.
export function writeCache(key, data) {
  try { sessionStorage.setItem(`pm_cache_${key}`, JSON.stringify(data)); } catch { /* quota */ }
}

export function clearCache(key) {
  try { sessionStorage.removeItem(`pm_cache_${key}`); } catch { /* ignore */ }
}

export function patchCache(key, patch) {
  try {
    const cached = sessionStorage.getItem(`pm_cache_${key}`);
    const existing = cached ? JSON.parse(cached) : {};
    if (!isApiErrorPayload(existing)) {
      sessionStorage.setItem(`pm_cache_${key}`, JSON.stringify({ ...existing, ...patch }));
    }
  } catch { /* quota */ }
}

// Combined page payloads (one round trip per view)
export const getDashboard = () => request('/api/dashboard');
export const getPilot2Overview = () => request('/api/pilot2/overview');
export const getNewRequestsPage = () => request('/api/admin/requests/page');
export const getPilot2Workspace = () => request('/api/pilot2/workspace');

// Inboxes
export const getInboxes = () => request('/api/pilot2/inboxes');
export const connectInbox = (email, title) =>
  request('/api/pilot2/inboxes/connect', { method: 'POST', body: JSON.stringify({ email, title }) });
export const disconnectInbox = (id) =>
  request(`/api/pilot2/inboxes/${id}/disconnect`, { method: 'POST' });
export const updateInbox = (id, title) =>
  request(`/api/pilot2/inboxes/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
export const deleteInbox = (id) =>
  request(`/api/pilot2/inboxes/${id}`, { method: 'DELETE' });

// Ignore list
export const getIgnoreList = (inbox) => {
  const query = inbox ? `?inbox=${encodeURIComponent(inbox)}` : '';
  return request(`/api/pilot2/ignore-list${query}`);
};
export const createIgnoreRule = (inbox, pattern) =>
  request('/api/pilot2/ignore-list', { method: 'POST', body: JSON.stringify({ inbox, pattern }) });
export const deleteIgnoreRule = (id) =>
  request(`/api/pilot2/ignore-list/${id}`, { method: 'DELETE' });

// Emails
export const getEmails = () => request('/api/pilot2/emails');
export const patchEmail = (id, patch) =>
  request(`/api/pilot2/emails/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const updateDraft = (id, draftBody) =>
  request(`/api/pilot2/emails/${id}/draft`, { method: 'PUT', body: JSON.stringify({ draftBody }) });
export const sendEmail = (id, finalBody) =>
  request(`/api/pilot2/emails/${id}/send`, { method: 'POST', body: JSON.stringify({ finalBody }) });
export const sendReplyAll = (id, finalBody, toEmails, ccEmails = []) =>
  request(`/api/pilot2/emails/${id}/reply-all`, {
    method: 'POST',
    body: JSON.stringify({ finalBody, toEmails, ccEmails }),
  });
export const sendForward = (id, finalBody, toEmails, ccEmails = []) =>
  request(`/api/pilot2/emails/${id}/forward`, {
    method: 'POST',
    body: JSON.stringify({ finalBody, toEmails, ccEmails }),
  });
export const composeMessage = ({ inbox, toEmails, ccEmails = [], bccEmails = [], subject, finalBody }) =>
  request('/api/pilot2/compose', {
    method: 'POST',
    body: JSON.stringify({ inbox, toEmails, ccEmails, bccEmails, subject, finalBody }),
  });

// Attachment bytes need the auth header, so we can't use a plain <a href>.
// Fetch the blob, then trigger a client-side download via an object URL.
export async function downloadAttachment(emailId, attachmentId, filename) {
  const res = await authFetch(
    `/api/pilot2/emails/${emailId}/attachments/${attachmentId}`,
  );
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* keep statusText */
    }
    throw new Error(typeof detail === 'string' ? detail : 'Download failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'attachment';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
export const bulkPatchEmails = (ids, patch) =>
  request('/api/pilot2/emails/bulk-patch', { method: 'POST', body: JSON.stringify({ ids, ...patch }) });
export const deleteEmailForever = (id) =>
  request(`/api/pilot2/emails/${id}`, { method: 'DELETE' });
export const emptyBin = () =>
  request('/api/pilot2/emails/bin/empty', { method: 'POST' });

// Templates
export const getTemplates = (inbox) => {
  const query = inbox ? `?inbox=${encodeURIComponent(inbox)}` : '';
  return request(`/api/pilot2/templates${query}`);
};
export const createTemplate = (template) =>
  request('/api/pilot2/templates', { method: 'POST', body: JSON.stringify(template) });
export const updateTemplate = (id, template) =>
  request(`/api/pilot2/templates/${id}`, { method: 'PUT', body: JSON.stringify(template) });
export const deleteTemplate = (id) =>
  request(`/api/pilot2/templates/${id}`, { method: 'DELETE' });
export const restoreTemplate = (id) =>
  request(`/api/pilot2/templates/${id}/restore`, { method: 'POST' });
export const deleteTemplateForever = (id) =>
  request(`/api/pilot2/templates/${id}/forever`, { method: 'DELETE' });

// Template suggestions (AI learning)
export const getTemplateSuggestions = (inbox) => {
  const params = new URLSearchParams({ status: 'pending' });
  if (inbox) params.set('inbox', inbox);
  return request(`/api/pilot2/suggestions?${params.toString()}`);
};
export const approveTemplateSuggestion = (id) =>
  request(`/api/pilot2/suggestions/${id}/approve`, { method: 'POST' });
export const rejectTemplateSuggestion = (id) =>
  request(`/api/pilot2/suggestions/${id}/reject`, { method: 'POST' });
