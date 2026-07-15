import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Link2,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Trash2,
  Unlink,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import PageHeader from '../components/layout/PageHeader';
import { AdminPageScroll, Toast, useToast, CardListSkeleton, Modal } from '../components/ui';
import { getUserTimeZoneLabel } from '../utils/dateTime';
import { clearManagerAllowedDomainsCache } from '../utils/managerAuth';
import {
  clearCache,
  connectInbox,
  createAutomatedSource,
  createManagerDomain,
  deleteAutomatedSource,
  deleteInbox,
  deleteManagerDomain,
  disconnectInbox,
  getAutomatedSources,
  getInboxes,
  getManagerDomains,
  loadWithCache,
  updateInbox,
  writeCache,
} from '../utils/pilot2Api';

const MAX_CONNECTED_INBOXES = 7;

function readPmCache(key) {
  try {
    const raw = sessionStorage.getItem(`pm_cache_${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function connectedDate(iso) {
  if (!iso) return null;
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}

function formatAdded(iso) {
  if (!iso) return '';
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}

function formatSourcePattern(source) {
  if (source.kind === 'domain') return `@${source.pattern}`;
  return source.pattern;
}

function SectionCard({ title, description, actions, children }) {
  return (
    <section className="rounded-xl border border-[var(--color-border-default)] bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-text-primary)]">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-[var(--color-text-secondary)] leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function FeatureGroup({ title, description, children }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)] leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

export default function PartnerSettings() {
  const { showToast } = useToast();

  const [accounts, setAccounts] = useState(() => readPmCache('inboxes') || []);
  const [inboxesLoading, setInboxesLoading] = useState(() => !readPmCache('inboxes'));
  const [busyId, setBusyId] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  const [managerDomains, setManagerDomains] = useState(() => readPmCache('manager_domains') || []);
  const [domainsLoading, setDomainsLoading] = useState(() => !readPmCache('manager_domains'));
  const [domainInput, setDomainInput] = useState('');
  const [domainAdding, setDomainAdding] = useState(false);
  const [pendingDomainRemove, setPendingDomainRemove] = useState(null);

  const [autoSources, setAutoSources] = useState(() => readPmCache('automated_sources') || []);
  const [sourcesLoading, setSourcesLoading] = useState(() => !readPmCache('automated_sources'));
  const [sourceInput, setSourceInput] = useState('');
  const [sourceAdding, setSourceAdding] = useState(false);
  const [pendingSourceRemove, setPendingSourceRemove] = useState(null);

  const connectedAccounts = useMemo(
    () => accounts.filter((account) => account.status === 'Connected'),
    [accounts],
  );
  const atAccountLimit = connectedAccounts.length >= MAX_CONNECTED_INBOXES;

  const refreshInboxes = useCallback(() => {
    loadWithCache('inboxes', getInboxes, (rows) => {
      setAccounts(rows);
      setInboxesLoading(false);
    }).catch((err) => {
      setInboxesLoading(false);
      showToast(`Could not load inboxes: ${err.message}`, 'error');
    });
  }, [showToast]);

  const refreshDomains = useCallback(() => {
    loadWithCache('manager_domains', getManagerDomains, (rows) => {
      setManagerDomains(Array.isArray(rows) ? rows : []);
      setDomainsLoading(false);
    }).catch((err) => {
      setDomainsLoading(false);
      showToast(`Could not load manager domains: ${err.message}`, 'error');
    });
  }, [showToast]);

  const refreshSources = useCallback(() => {
    loadWithCache('automated_sources', getAutomatedSources, (rows) => {
      setAutoSources(Array.isArray(rows) ? rows : []);
      setSourcesLoading(false);
    }).catch((err) => {
      setSourcesLoading(false);
      showToast(`Could not load automated sources: ${err.message}`, 'error');
    });
  }, [showToast]);

  useEffect(() => {
    refreshInboxes();
    refreshDomains();
    refreshSources();
    window.addEventListener('focus', refreshInboxes);
    return () => window.removeEventListener('focus', refreshInboxes);
  }, [refreshInboxes, refreshDomains, refreshSources]);

  const handleAddAccount = async () => {
    const title = addTitle.trim();
    if (!title) {
      showToast('Enter a display name for this inbox.', 'error');
      return;
    }
    if (atAccountLimit) {
      showToast(`Maximum of ${MAX_CONNECTED_INBOXES} connected inboxes reached.`, 'error');
      return;
    }
    setAddBusy(true);
    try {
      const result = await connectInbox(title);
      clearCache('pilot2_workspace');
      if (result.authUrl) {
        window.location.assign(result.authUrl);
        return;
      }
      showToast('Inbox connected.', 'success');
      setAddOpen(false);
      setAddTitle('');
      refreshInboxes();
    } catch (err) {
      showToast(`Connect failed: ${err.message}`, 'error');
    } finally {
      setAddBusy(false);
    }
  };

  const handleConnect = async (account) => {
    setBusyId(account.id);
    try {
      const result = await connectInbox(account.title, account.email);
      clearCache('pilot2_workspace');
      if (result.authUrl) {
        window.location.assign(result.authUrl);
        return;
      }
      showToast(`${account.email} connected.`, 'success');
      refreshInboxes();
    } catch (err) {
      showToast(`Connect failed: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async (account) => {
    setBusyId(account.id);
    try {
      await disconnectInbox(account.id);
      clearCache('pilot2_workspace');
      showToast(`${account.email} disconnected.`, 'success');
      refreshInboxes();
    } catch (err) {
      showToast(`Disconnect failed: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const title = renameValue.trim();
    if (!title) {
      showToast('Name cannot be empty.', 'error');
      return;
    }
    setBusyId(renameTarget.id);
    try {
      const updated = await updateInbox(renameTarget.id, title);
      setAccounts((prev) => {
        const next = prev.map((a) => (a.id === updated.id ? updated : a));
        writeCache('inboxes', next);
        return next;
      });
      showToast('Inbox renamed.', 'success');
      setRenameTarget(null);
    } catch (err) {
      showToast(`Rename failed: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteInbox = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteInbox(deleteTarget.id);
      const next = accounts.filter((a) => a.id !== deleteTarget.id);
      setAccounts(next);
      writeCache('inboxes', next);
      clearCache('pilot2_workspace');
      showToast(`${deleteTarget.email} removed.`, 'success');
      setDeleteTarget(null);
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleAddDomain = async (event) => {
    event.preventDefault();
    const value = domainInput.trim();
    if (!value) {
      showToast('Enter a domain like activegym.com.', 'error');
      return;
    }
    setDomainAdding(true);
    try {
      const created = await createManagerDomain(value);
      setManagerDomains((prev) => {
        const next = [created, ...prev.filter((row) => row.id !== created.id)];
        writeCache('manager_domains', next);
        return next;
      });
      setDomainInput('');
      clearManagerAllowedDomainsCache();
      showToast('Manager domain added.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not add domain.', 'error');
    } finally {
      setDomainAdding(false);
    }
  };

  const handleRemoveDomain = async (row) => {
    setBusyId(row.id);
    try {
      await deleteManagerDomain(row.id);
      setManagerDomains((prev) => {
        const next = prev.filter((item) => item.id !== row.id);
        writeCache('manager_domains', next);
        return next;
      });
      clearManagerAllowedDomainsCache();
      setPendingDomainRemove(null);
      showToast('Manager domain removed.', 'success');
    } catch (err) {
      showToast(`Remove failed: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleAddSource = async (event) => {
    event.preventDefault();
    const value = sourceInput.trim();
    if (!value) {
      showToast('Enter an email or domain.', 'error');
      return;
    }
    setSourceAdding(true);
    try {
      const created = await createAutomatedSource(value);
      setAutoSources((prev) => {
        const next = [created, ...prev.filter((row) => row.id !== created.id)];
        writeCache('automated_sources', next);
        return next;
      });
      setSourceInput('');
      showToast('Automated source added.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not add source.', 'error');
    } finally {
      setSourceAdding(false);
    }
  };

  const handleRemoveSource = async (row) => {
    setBusyId(row.id);
    try {
      await deleteAutomatedSource(row.id);
      setAutoSources((prev) => {
        const next = prev.filter((item) => item.id !== row.id);
        writeCache('automated_sources', next);
        return next;
      });
      setPendingSourceRemove(null);
      showToast('Automated source removed.', 'success');
    } catch (err) {
      showToast(`Remove failed: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminPageScroll dataPage="partner-settings" contentClassName="flex flex-col gap-6 min-w-0 select-none pb-2">
      <Toast />
      <PageHeader
        section="Partner support"
        title="Partner settings"
        description="Manage who can access the manager portal, and set up automated add/remove email intake."
        compact
      />

      <FeatureGroup
        title="Manager access"
        description="Controls who can sign up, sign in, and submit requests on the manager portal."
      >
            <SectionCard
              title="Allowed domains"
              description="Only emails on these domains can use the manager portal."
            >
              <form onSubmit={handleAddDomain} className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor="manager-domain" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Domain
                  </label>
                  <input
                    id="manager-domain"
                    type="text"
                    value={domainInput}
                    onChange={(event) => setDomainInput(event.target.value)}
                    placeholder="activegym.com"
                    className="w-full h-10 rounded-lg border border-[var(--color-border-default)] px-3 text-sm focus:border-[var(--color-brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]/20"
                  />
                </div>
                <button
                  type="submit"
                  disabled={domainAdding || !domainInput.trim()}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-surface-sidebar-hover)] disabled:opacity-50"
                >
                  {domainAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </button>
              </form>

              {domainsLoading ? (
                <CardListSkeleton rows={2} />
              ) : managerDomains.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  No domains allowed yet. Managers cannot sign in until you add at least one.
                </p>
              ) : (
                <ul className="space-y-2">
                  {managerDomains.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border-default)] bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">@{row.domain}</p>
                        {row.createdAt && (
                          <p className="text-xs text-[var(--color-text-muted)]">Added {formatAdded(row.createdAt)}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingDomainRemove(row)}
                        disabled={busyId === row.id}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        aria-label={`Remove ${row.domain}`}
                      >
                        {busyId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </FeatureGroup>

          <FeatureGroup
            title="Admin automation"
            description="Connect the inbox that receives add/remove emails, and choose which senders can create requests automatically."
          >
            <SectionCard
              title="Connected inbox"
              description={`Used only to receive automated add/remove emails. Times in ${getUserTimeZoneLabel()}.`}
              actions={(
                <button
                  type="button"
                  onClick={() => { setAddTitle(''); setAddOpen(true); }}
                  disabled={addBusy || atAccountLimit}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold text-white bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors shadow-sm cursor-pointer shrink-0 disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" />
                  Connect inbox
                </button>
              )}
            >
              {inboxesLoading ? (
                <CardListSkeleton rows={2} />
              ) : connectedAccounts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/40 px-4 py-10 text-center">
                  <Mail className="mx-auto mb-3 h-8 w-8 text-[var(--color-text-muted)]" aria-hidden="true" />
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">No inbox connected</p>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    Connect 1–2 inboxes where partner systems send add/remove notifications.
                  </p>
                </div>
              ) : connectedAccounts.map((account) => {
                const isConnected = account.status === 'Connected';
                const isBusy = busyId === account.id;
                return (
                  <div
                    key={account.id}
                    className="mb-3 last:mb-0 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/30 p-4"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{account.title}</h3>
                        <p className="text-sm text-[var(--color-text-secondary)] break-all mt-0.5">{account.email}</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">
                          {isConnected && account.connectedAt
                            ? `Connected ${connectedDate(account.connectedAt)}`
                            : 'Not connected yet'}
                        </p>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {account.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setRenameTarget(account); setRenameValue(account.title); }}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-white disabled:opacity-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConnect(account)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:bg-white disabled:opacity-50"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        {isBusy ? 'Redirecting…' : isConnected ? 'Reconnect' : 'Connect'}
                      </button>
                      {isConnected && (
                        <button
                          type="button"
                          onClick={() => handleDisconnect(account)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--color-border-default)] text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                          Disconnect
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(account)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--color-border-default)] text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </SectionCard>

            <SectionCard
              title="Automated email sources"
              description="Emails or domains allowed to create add/remove requests automatically when they write to your connected inbox."
            >
              <form onSubmit={handleAddSource} className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor="auto-source" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Email or domain
                  </label>
                  <input
                    id="auto-source"
                    type="text"
                    value={sourceInput}
                    onChange={(event) => setSourceInput(event.target.value)}
                    placeholder="rubabzahra248@gmail.com or @activegym.com"
                    className="w-full h-10 rounded-lg border border-[var(--color-border-default)] px-3 text-sm focus:border-[var(--color-brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]/20"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sourceAdding || !sourceInput.trim()}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-surface-sidebar-hover)] disabled:opacity-50"
                >
                  {sourceAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </button>
              </form>
              <p className="mb-4 text-xs text-[var(--color-text-muted)]">
                Captures subjects like “New user” or “Remove user”, with Name, Email, and Club in the body.
              </p>

              {sourcesLoading ? (
                <CardListSkeleton rows={3} />
              ) : autoSources.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  No automated sources configured.
                </p>
              ) : (
                <ul className="space-y-2">
                  {autoSources.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border-default)] bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                          {formatSourcePattern(row)}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {row.kind === 'domain' ? 'Whole domain' : 'Email address'}
                          {row.createdAt ? ` · Added ${formatAdded(row.createdAt)}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingSourceRemove(row)}
                        disabled={busyId === row.id}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        aria-label={`Remove ${formatSourcePattern(row)}`}
                      >
                        {busyId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </FeatureGroup>

      <Modal
        isOpen={addOpen}
        onClose={() => !addBusy && setAddOpen(false)}
        title="Connect inbox"
        footer={(
          <>
            <button type="button" onClick={() => setAddOpen(false)} disabled={addBusy} className="px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
              Cancel
            </button>
            <button type="button" onClick={handleAddAccount} disabled={addBusy || !addTitle.trim()} className="px-4 py-2 text-white text-sm font-semibold rounded-md bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] disabled:opacity-40">
              {addBusy ? 'Redirecting…' : 'Continue to Google'}
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
              Display name
            </label>
            <input
              type="text"
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder="e.g. Partner notifications"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddAccount(); }}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border-default)] rounded-lg focus:outline-none focus:border-[var(--color-brand-primary)]"
              autoFocus
            />
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            You will be redirected to Google to sign in with the inbox that should receive automated roster emails.
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={renameTarget != null}
        onClose={() => setRenameTarget(null)}
        title="Rename inbox"
        footer={(
          <>
            <button type="button" onClick={() => setRenameTarget(null)} className="px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={handleRename} disabled={!renameValue.trim() || busyId === renameTarget?.id} className="px-4 py-2 text-white text-sm font-semibold rounded-md bg-[var(--color-brand-primary)] disabled:opacity-40">Save</button>
          </>
        )}
      >
        <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">Display name</label>
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
          className="w-full px-3 py-2 text-sm border border-[var(--color-border-default)] rounded-lg focus:outline-none focus:border-[var(--color-brand-primary)]"
          autoFocus
        />
      </Modal>

      <Modal
        isOpen={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        confirm
        title="Remove inbox"
        footer={(
          <>
            <button type="button" onClick={() => setDeleteTarget(null)} className="px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={handleDeleteInbox} disabled={busyId === deleteTarget?.id} className="px-4 py-2 text-white text-sm font-semibold rounded-md bg-[var(--color-brand-primary)] disabled:opacity-40">Remove inbox</button>
          </>
        )}
      >
        <p>Remove <strong>{deleteTarget?.title}</strong> ({deleteTarget?.email})? Automated emails will no longer be imported from this inbox.</p>
      </Modal>

      <Modal
        isOpen={pendingDomainRemove != null}
        onClose={() => !busyId && setPendingDomainRemove(null)}
        confirm
        title="Remove manager domain"
        footer={(
          <>
            <button type="button" onClick={() => setPendingDomainRemove(null)} disabled={busyId != null} className="px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={() => pendingDomainRemove && handleRemoveDomain(pendingDomainRemove)} disabled={busyId != null} className="px-4 py-2 text-white text-sm font-semibold rounded-md bg-[var(--color-brand-primary)] disabled:opacity-50">Remove</button>
          </>
        )}
      >
        <p>Managers with <strong>@{pendingDomainRemove?.domain}</strong> emails will no longer be able to sign in or sign up.</p>
      </Modal>

      <Modal
        isOpen={pendingSourceRemove != null}
        onClose={() => !busyId && setPendingSourceRemove(null)}
        confirm
        title="Remove automated source"
        footer={(
          <>
            <button type="button" onClick={() => setPendingSourceRemove(null)} disabled={busyId != null} className="px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={() => pendingSourceRemove && handleRemoveSource(pendingSourceRemove)} disabled={busyId != null} className="px-4 py-2 text-white text-sm font-semibold rounded-md bg-[var(--color-brand-primary)] disabled:opacity-50">Remove</button>
          </>
        )}
      >
        <p>Stop treating messages from <strong>{pendingSourceRemove ? formatSourcePattern(pendingSourceRemove) : ''}</strong> as automated add/remove requests.</p>
      </Modal>
    </AdminPageScroll>
  );
}
