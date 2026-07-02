// Pilot 2 API client — same base URL convention as the Pilot 1 pages.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* keep statusText */ }
    throw new Error(detail);
  }
  return res.json();
}

// Stale-while-revalidate: show the last known data instantly from
// sessionStorage, then fetch fresh data and update. `apply(data, isStale)`
// is called up to twice — once with cached data, once with fresh data.
export async function loadWithCache(key, fetcher, apply) {
  try {
    const cached = sessionStorage.getItem(`pm_cache_${key}`);
    if (cached) apply(JSON.parse(cached), true);
  } catch { /* corrupt cache — ignore */ }
  const fresh = await fetcher();
  try { sessionStorage.setItem(`pm_cache_${key}`, JSON.stringify(fresh)); } catch { /* quota */ }
  apply(fresh, false);
  return fresh;
}

// Write-through: keep the cache in step with an optimistic local update so
// navigating away and back never shows the pre-change data.
export function writeCache(key, data) {
  try { sessionStorage.setItem(`pm_cache_${key}`, JSON.stringify(data)); } catch { /* quota */ }
}

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
