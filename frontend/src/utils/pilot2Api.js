// Pilot 2 API client — same base URL convention as the Pilot 1 pages
// (see utils/api.js: localhost in dev, same-origin in production).
import API_BASE, { fetchJson } from './api';

async function request(path, options = {}) {
  return fetchJson(path, {
    headers: { 'Content-Type': 'application/json' },
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

// Stale-while-revalidate: show the last known data instantly from
// sessionStorage, then fetch fresh data and update. `apply(data, isStale)`
// is called up to twice — once with cached data, once with fresh data.
export async function loadWithCache(key, fetcher, apply) {
  try {
    const cached = sessionStorage.getItem(`pm_cache_${key}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (!isApiErrorPayload(parsed)) apply(parsed, true);
    }
  } catch { /* corrupt cache — ignore */ }
  const fresh = await fetcher();
  if (isApiErrorPayload(fresh)) {
    throw new Error(fresh.detail);
  }
  try { sessionStorage.setItem(`pm_cache_${key}`, JSON.stringify(fresh)); } catch { /* quota */ }
  apply(fresh, false);
  return fresh;
}

// Write-through: keep the cache in step with an optimistic local update so
// navigating away and back never shows the pre-change data.
export function writeCache(key, data) {
  try { sessionStorage.setItem(`pm_cache_${key}`, JSON.stringify(data)); } catch { /* quota */ }
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
export const getNewRequestsPage = () => request('/api/admin/requests/page');
export const getPilot2Workspace = () => request('/api/pilot2/workspace');

// Inboxes
export const getInboxes = () => request('/api/pilot2/inboxes');
export const connectInbox = (email, title) =>
  request('/api/pilot2/inboxes/connect', { method: 'POST', body: JSON.stringify({ email, title }) });
export const disconnectInbox = (id) =>
  request(`/api/pilot2/inboxes/${id}/disconnect`, { method: 'POST' });

// Emails
export const getEmails = () => request('/api/pilot2/emails');
export const patchEmail = (id, patch) =>
  request(`/api/pilot2/emails/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const updateDraft = (id, draftBody) =>
  request(`/api/pilot2/emails/${id}/draft`, { method: 'PUT', body: JSON.stringify({ draftBody }) });
export const sendEmail = (id, finalBody) =>
  request(`/api/pilot2/emails/${id}/send`, { method: 'POST', body: JSON.stringify({ finalBody }) });
export const bulkPatchEmails = (ids, patch) =>
  request('/api/pilot2/emails/bulk-patch', { method: 'POST', body: JSON.stringify({ ids, ...patch }) });
export const deleteEmailForever = (id) =>
  request(`/api/pilot2/emails/${id}`, { method: 'DELETE' });
export const emptyBin = () =>
  request('/api/pilot2/emails/bin/empty', { method: 'POST' });

// Templates
export const getTemplates = () => request('/api/pilot2/templates');
export const createTemplate = (template) =>
  request('/api/pilot2/templates', { method: 'POST', body: JSON.stringify(template) });
export const updateTemplate = (id, template) =>
  request(`/api/pilot2/templates/${id}`, { method: 'PUT', body: JSON.stringify(template) });
export const deleteTemplate = (id) =>
  request(`/api/pilot2/templates/${id}`, { method: 'DELETE' });
