import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  AtSign,
  Check,
  Copy,
  Eye,
  LayoutTemplate,
  Loader2,
  Mail,
  Plus,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { AdminPageScroll, Toast, useToast, CardListSkeleton, Modal, HoverTip } from '../components/ui';
import { getUserTimeZoneLabel } from '../utils/dateTime';
import { clearManagerAllowedDomainsCache } from '../utils/managerAuth';
import { usePartners } from '../context/PartnerContext';
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
  getPartnerCustomForm,
  updatePartnerCustomForm,
} from '../utils/pilot2Api';

const MAX_CONNECTED_INBOXES = 7;

const SETTINGS_TABS = [
  {
    id: 'access',
    label: 'Access settings',
    descriptionFor: () => 'Partner name and who can sign in',
    Icon: Shield,
  },
  {
    id: 'automation',
    label: 'Email automation settings',
    descriptionFor: () => 'Inbox connection and auto sources',
    Icon: Mail,
  },
  {
    id: 'form-builder',
    label: 'Custom Manager Form',
    descriptionFor: () => 'Build a branded form for managers',
    Icon: LayoutTemplate,
  },
];

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

/** One white surface per tab page; sections stack with soft dividers. */
function SettingsPage({ children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-white shadow-sm divide-y divide-[var(--color-border-default)]/70">
      {children}
    </div>
  );
}

function SettingsSection({ id, title, hint, action, children, footer }) {
  return (
    <section id={id} className="px-5 py-5 sm:px-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">
            {title}
          </h2>
          {hint ? (
            <p className="mt-0.5 text-xs leading-4 text-[var(--color-text-muted)]">
              {hint}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
      {footer ? <div className="mt-4">{footer}</div> : null}
    </section>
  );
}

function StatusPill({ tone = 'muted', children }) {
  const tones = {
    ok: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
    warn: 'bg-amber-50 text-amber-800 ring-amber-100',
    muted: 'bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)] ring-[var(--color-border-default)]',
  };
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none ring-1 ring-inset ${tones[tone] || tones.muted}`}>
      {children}
    </span>
  );
}

function ItemList({ children, empty }) {
  if (empty) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/50 px-3.5 py-4 text-sm text-[var(--color-text-secondary)]">
        {empty}
      </div>
    );
  }
  return <ul className="space-y-2">{children}</ul>;
}

function ItemRow({ icon, title, meta, badge, action }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/40 px-3.5 py-3 transition-colors hover:bg-[var(--color-surface-highlight)] sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--color-text-muted)] ring-1 ring-[var(--color-border-default)]" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium leading-5 text-[var(--color-text-primary)]">{title}</p>
            {badge}
          </div>
          {meta ? (
            <p className="mt-0.5 break-all text-xs leading-4 text-[var(--color-text-muted)]">{meta}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center sm:justify-end">{action}</div> : null}
    </li>
  );
}

function AddBar({ onSubmit, children, submitLabel, busy, disabled }) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/50 p-2 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <FilledButton type="submit" disabled={busy || disabled}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {submitLabel}
      </FilledButton>
    </form>
  );
}

function IconButton({ label, onClick, disabled, danger = false, children }) {
  return (
    <HoverTip label={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors disabled:opacity-40 ${
          danger
            ? 'hover:bg-red-50 hover:text-red-600'
            : 'hover:bg-white hover:text-[var(--color-text-primary)]'
        }`}
      >
        {children}
      </button>
    </HoverTip>
  );
}

function TextButton({ children, onClick, disabled, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-[var(--color-brand-secondary)] transition-colors hover:bg-[var(--color-brand-secondary-muted)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function FilledButton({ children, onClick, disabled, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-brand-primary)] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-surface-sidebar-hover)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

const fieldClass =
  'h-9 w-full rounded-md border-0 bg-transparent px-2.5 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:ring-0 disabled:opacity-50';

const fieldStandaloneClass =
  'h-9 w-full rounded-lg border border-[var(--color-border-default)] bg-white px-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand-primary)] focus:ring-2 focus:ring-[var(--color-brand-primary)]/15 disabled:opacity-50';

export default function PartnerSettings() {
  const { showToast } = useToast();
  const {
    selectedPartner,
    selectedPartnerId,
    partnerLabel,
    updatePartner,
  } = usePartners();

  const [accounts, setAccounts] = useState(() => readPmCache(`inboxes:${selectedPartnerId || ''}`) || []);
  const [inboxesLoading, setInboxesLoading] = useState(() => !readPmCache(`inboxes:${selectedPartnerId || ''}`));
  const [busyId, setBusyId] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  const [managerDomains, setManagerDomains] = useState(() => readPmCache(`manager_domains:${selectedPartnerId || ''}`) || []);
  const [domainsLoading, setDomainsLoading] = useState(() => !readPmCache(`manager_domains:${selectedPartnerId || ''}`));
  const [domainInput, setDomainInput] = useState('');
  const [domainAdding, setDomainAdding] = useState(false);
  const [pendingDomainRemove, setPendingDomainRemove] = useState(null);

  const [autoSources, setAutoSources] = useState(() => readPmCache(`automated_sources:${selectedPartnerId || ''}`) || []);
  const [sourcesLoading, setSourcesLoading] = useState(() => !readPmCache(`automated_sources:${selectedPartnerId || ''}`));
  const [sourceInput, setSourceInput] = useState('');
  const [sourceAdding, setSourceAdding] = useState(false);
  const [pendingSourceRemove, setPendingSourceRemove] = useState(null);
  const [partnerNameDraft, setPartnerNameDraft] = useState('');
  const [partnerRenameBusy, setPartnerRenameBusy] = useState(false);
  const [partnerNameEditing, setPartnerNameEditing] = useState(false);
  const [settingsTab, setSettingsTab] = useState('access');

  // ── Form builder state ───────────────────────────────────────────────────
  const [formFields, setFormFields] = useState([]);
  const [logoDataUrl, setLogoDataUrl] = useState(null);  // base64 data URL — survives cross-tab
  const [builtForm, setBuiltForm] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [formAttempted, setFormAttempted] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const logoInputRef = useRef(null);

  const connectedAccounts = useMemo(
    () => accounts.filter((account) => account.status === 'Connected'),
    [accounts],
  );
  // Keep slots that were connected before (including token-expired) so Reconnect stays available.
  const displayAccounts = useMemo(
    () => accounts.filter((account) => account.status === 'Connected' || account.connectedAt),
    [accounts],
  );
  const atAccountLimit = connectedAccounts.length >= MAX_CONNECTED_INBOXES;

  const inboxCacheKey = `inboxes:${selectedPartnerId || ''}`;
  const domainsCacheKey = `manager_domains:${selectedPartnerId || ''}`;
  const sourcesCacheKey = `automated_sources:${selectedPartnerId || ''}`;

  const refreshInboxes = useCallback(() => {
    loadWithCache(inboxCacheKey, () => getInboxes(selectedPartnerId || ''), (rows) => {
      setAccounts(rows);
      setInboxesLoading(false);
    }).catch((err) => {
      setInboxesLoading(false);
      showToast(`Could not load inboxes: ${err.message}`, 'error');
    });
  }, [inboxCacheKey, selectedPartnerId, showToast]);

  const refreshDomains = useCallback(() => {
    loadWithCache(domainsCacheKey, () => getManagerDomains(selectedPartnerId || ''), (rows) => {
      setManagerDomains(Array.isArray(rows) ? rows : []);
      setDomainsLoading(false);
    }).catch((err) => {
      setDomainsLoading(false);
      showToast(`Could not load manager domains: ${err.message}`, 'error');
    });
  }, [domainsCacheKey, selectedPartnerId, showToast]);

  const refreshSources = useCallback(() => {
    loadWithCache(sourcesCacheKey, () => getAutomatedSources(selectedPartnerId || ''), (rows) => {
      setAutoSources(Array.isArray(rows) ? rows : []);
      setSourcesLoading(false);
    }).catch((err) => {
      setSourcesLoading(false);
      showToast(`Could not load automated sources: ${err.message}`, 'error');
    });
  }, [selectedPartnerId, showToast, sourcesCacheKey]);

  useEffect(() => {
    refreshInboxes();
    refreshDomains();
    refreshSources();
    window.addEventListener('focus', refreshInboxes);
    return () => window.removeEventListener('focus', refreshInboxes);
  }, [refreshInboxes, refreshDomains, refreshSources]);

  useEffect(() => {
    setPartnerNameDraft(selectedPartner?.name || '');
    setPartnerNameEditing(false);
    
    // Fetch custom form for partner
    if (selectedPartnerId) {
      getPartnerCustomForm(selectedPartnerId).then(res => {
        if (res && res.fields && res.fields.length > 0) {
          const config = {
            partnerName: selectedPartner?.name || 'Partner',
            logoDataUrl: res.logo_data_url,
            fields: res.fields
          };
          setBuiltForm(config);
          setLogoDataUrl(res.logo_data_url);
          setFormFields(res.fields);
        } else {
          setBuiltForm(null);
          setLogoDataUrl(null);
          setFormFields([]);
        }
      }).catch(err => {
        console.error("Could not load custom form", err);
      });
    } else {
      setBuiltForm(null);
      setLogoDataUrl(null);
      setFormFields([]);
    }
  }, [selectedPartner?.name, selectedPartnerId]);

  const startPartnerRename = () => {
    if (!selectedPartner) return;
    setPartnerNameDraft(selectedPartner.name || '');
    setPartnerNameEditing(true);
  };

  const cancelPartnerRename = () => {
    setPartnerNameDraft(selectedPartner?.name || '');
    setPartnerNameEditing(false);
  };

  const handleRenamePartner = async () => {
    if (!selectedPartner) return;
    const nextName = partnerNameDraft.trim();
    if (!nextName) {
      showToast(`${partnerLabel} name cannot be empty.`, 'error');
      return;
    }
    setPartnerRenameBusy(true);
    try {
      await updatePartner(selectedPartner.id, nextName);
      setPartnerNameEditing(false);
      showToast(`${partnerLabel} renamed.`, 'success');
    } catch (err) {
      showToast(err.message || `Could not rename ${partnerLabel.toLowerCase()}.`, 'error');
    } finally {
      setPartnerRenameBusy(false);
    }
  };

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
      const result = await connectInbox(title, '', selectedPartnerId || '');
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
      const result = await connectInbox(account.title, account.email, selectedPartnerId || '');
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
        writeCache(inboxCacheKey, next);
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
      writeCache(inboxCacheKey, next);
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
      const created = await createManagerDomain(value, selectedPartnerId || '');
      setManagerDomains((prev) => {
        const next = [created, ...prev.filter((row) => row.id !== created.id)];
        writeCache(domainsCacheKey, next);
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
        writeCache(domainsCacheKey, next);
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
      const created = await createAutomatedSource(value, selectedPartnerId || '');
      setAutoSources((prev) => {
        const next = [created, ...prev.filter((row) => row.id !== created.id)];
        writeCache(sourcesCacheKey, next);
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
        writeCache(sourcesCacheKey, next);
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

  const partnerDirty = Boolean(selectedPartner)
    && partnerNameDraft.trim() !== (selectedPartner?.name || '')
    && partnerNameDraft.trim().length > 0;

  // ── Form builder helpers ─────────────────────────────────────────────────
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogoDataUrl(ev.target.result);
      setFormErrors((prev) => ({ ...prev, logo: null }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoDataUrl(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleAddField = () => {
    setFormFields((prev) => [...prev, { id: `f_${Date.now()}`, name: '', type: 'Text' }]);
  };

  const handleRemoveField = (id) => {
    setFormFields((prev) => prev.filter((f) => f.id !== id));
  };

  const handleFieldChange = (id, key, value) => {
    setFormFields((prev) => prev.map((f) => f.id === id ? { ...f, [key]: value } : f));
  };

  const handleCreateForm = async () => {
    setFormAttempted(true);
    const errors = {};
    if (!logoDataUrl) errors.logo = 'Please upload a partner logo.';
    if (formFields.length === 0) errors.fields = 'Add at least one field to the form.';
    const fieldErrors = {};
    formFields.forEach((f) => { if (!f.name.trim()) fieldErrors[f.id] = 'Field name is required.'; });
    if (Object.keys(fieldErrors).length > 0) errors.fieldErrors = fieldErrors;
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    
    const partnerName = selectedPartner?.name || 'Partner';
    const config = { partnerName, logoDataUrl, fields: formFields.map((f) => ({ ...f })) };
    
    try {
      await updatePartnerCustomForm(selectedPartnerId, {
        logo_data_url: logoDataUrl,
        fields: config.fields
      });
      setBuiltForm(config);
      showToast('Custom form saved to database.', 'success');
    } catch (err) {
      showToast(`Could not save custom form: ${err.message}`, 'error');
    }
  };

  const handleEditForm = () => setBuiltForm(null);

  const builtFormSlug = builtForm
    ? (builtForm.partnerName || 'partner').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    : '';
  const builtFormUrl = builtForm ? `${window.location.origin}/${builtFormSlug}/submit` : '';

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(builtFormUrl).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  };

  return (
    <AdminPageScroll dataPage="partner-settings" contentClassName="min-w-0 select-none pb-16">
      <Toast />

      <div className="mx-auto w-full max-w-[42rem]">
        <header className="mb-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            {partnerLabel} support
          </p>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)] sm:text-2xl">
            {partnerLabel} settings
          </h1>
        </header>

        <div
          role="tablist"
          aria-label={`${partnerLabel} settings sections`}
          className="mb-5 grid grid-cols-1 gap-1 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-panel)] p-1 sm:grid-cols-3"
        >
          {SETTINGS_TABS.map((tab) => {
            const selected = settingsTab === tab.id;
            const Icon = tab.Icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`partner-settings-tab-${tab.id}`}
                aria-controls={`partner-settings-panel-${tab.id}`}
                aria-selected={selected}
                onClick={() => {
                  setSettingsTab(tab.id);
                  if (tab.id !== 'access') setPartnerNameEditing(false);
                }}
                className={`flex items-start gap-3 rounded-lg px-3.5 py-3 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35 ${
                  selected
                    ? 'bg-white shadow-sm ring-1 ring-[var(--color-border-default)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-white/70 hover:text-[var(--color-text-primary)]'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    selected
                      ? 'bg-[var(--color-brand-primary)]/10 text-[var(--color-brand-primary)]'
                      : 'bg-white/80 text-[var(--color-text-muted)]'
                  }`}
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-sm leading-5 ${
                      selected
                        ? 'font-semibold text-[var(--color-text-primary)]'
                        : 'font-medium'
                    }`}
                  >
                    {tab.label}
                  </span>
                  <span
                    className={`mt-0.5 block text-xs leading-4 ${
                      selected
                        ? 'text-[var(--color-text-secondary)]'
                        : 'text-[var(--color-text-muted)]'
                    }`}
                  >
                    {tab.descriptionFor(partnerLabel)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`partner-settings-panel-${settingsTab}`}
          aria-labelledby={`partner-settings-tab-${settingsTab}`}
        >
          {settingsTab === 'access' ? (
            <SettingsPage>
          <SettingsSection
            id="partner"
            title="Partner name"
            hint={`Shown across the admin app for ${selectedPartner?.name || 'this partner'}.`}
          >
            {partnerNameEditing ? (
              <div className="space-y-3">
                <input
                  id="partner-name"
                  type="text"
                  value={partnerNameDraft}
                  onChange={(event) => setPartnerNameDraft(event.target.value)}
                  placeholder="Partner name"
                  disabled={!selectedPartner || partnerRenameBusy}
                  autoFocus
                  className={fieldStandaloneClass}
                  aria-label="Partner name"
                />
                <div className="flex justify-end gap-2">
                  <TextButton onClick={cancelPartnerRename} disabled={partnerRenameBusy}>
                    Cancel
                  </TextButton>
                  <FilledButton
                    onClick={handleRenamePartner}
                    disabled={partnerRenameBusy || !partnerDirty}
                  >
                    {partnerRenameBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save
                  </FilledButton>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/40 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                    {selectedPartner?.name || 'No partner selected'}
                  </p>
                </div>
                <TextButton onClick={startPartnerRename} disabled={!selectedPartner}>
                  Edit
                </TextButton>
              </div>
            )}
          </SettingsSection>

          <SettingsSection
            id="manager-access"
            title="Manager access"
            hint="Only these email domains can sign in to the manager portal."
            footer={(
              <AddBar
                onSubmit={handleAddDomain}
                submitLabel="Add"
                busy={domainAdding}
                disabled={!domainInput.trim()}
              >
                <input
                  id="manager-domain"
                  type="text"
                  value={domainInput}
                  onChange={(event) => setDomainInput(event.target.value)}
                  placeholder="Domain (e.g. activegym.com)"
                  className={fieldClass}
                  aria-label="Domain"
                />
              </AddBar>
            )}
          >
            {domainsLoading ? (
              <CardListSkeleton rows={2} />
            ) : (
              <ItemList empty={managerDomains.length === 0 ? 'No domains yet. Add one below.' : null}>
                {managerDomains.map((row) => (
                  <ItemRow
                    key={row.id}
                    icon={<AtSign className="h-4 w-4" />}
                    title={`@${row.domain}`}
                    meta={row.createdAt ? `Added ${formatAdded(row.createdAt)}` : null}
                    action={(
                      <IconButton
                        label={`Remove ${row.domain}`}
                        onClick={() => setPendingDomainRemove(row)}
                        disabled={busyId === row.id}
                        danger
                      >
                        {busyId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </IconButton>
                    )}
                  />
                ))}
              </ItemList>
            )}
          </SettingsSection>
            </SettingsPage>
          ) : settingsTab === 'automation' ? (
            <SettingsPage>
          <SettingsSection
            id="connected-inbox"
            title="Connected inbox (Power Music)"
            hint={`Used for automated add/remove email · ${getUserTimeZoneLabel()}`}
            action={(
              <TextButton
                onClick={() => { setAddTitle(''); setAddOpen(true); }}
                disabled={addBusy || atAccountLimit}
              >
                <Plus className="h-4 w-4" />
                Connect
              </TextButton>
            )}
          >
            {inboxesLoading ? (
              <CardListSkeleton rows={2} />
            ) : displayAccounts.length === 0 ? (
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/50 px-3.5 py-4">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">No inbox connected</p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    Connect the inbox that receives {partnerLabel} add/remove mail.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {displayAccounts.map((account) => {
                  const isConnected = account.status === 'Connected';
                  const needsReconnect =
                    (isConnected && account.backfillError === 'oauth_revoked')
                    || (!isConnected && Boolean(account.connectedAt));
                  const isBusy = busyId === account.id;
                  const statusLine = isConnected && account.connectedAt && !needsReconnect
                    ? `Connected ${connectedDate(account.connectedAt)}`
                    : null;
                  return (
                    <li
                      key={account.id}
                      className="flex flex-col gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/40 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                            {account.title}
                          </p>
                          <StatusPill tone={needsReconnect ? 'warn' : isConnected ? 'ok' : 'muted'}>
                            {needsReconnect ? 'Reconnect required' : account.status}
                          </StatusPill>
                        </div>
                        <p className="mt-0.5 break-all text-xs text-[var(--color-text-secondary)]">
                          {account.email || 'No email yet'}
                        </p>
                        {statusLine ? (
                          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                            {statusLine}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1 sm:justify-end">
                        <TextButton
                          onClick={() => { setRenameTarget(account); setRenameValue(account.title); }}
                          disabled={isBusy}
                        >
                          Rename
                        </TextButton>
                        <TextButton onClick={() => handleConnect(account)} disabled={isBusy}>
                          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {needsReconnect || isConnected ? 'Reconnect' : 'Connect'}
                        </TextButton>
                        {isConnected ? (
                          <TextButton onClick={() => handleDisconnect(account)} disabled={isBusy}>
                            Disconnect
                          </TextButton>
                        ) : null}
                        <IconButton
                          label="Remove inbox"
                          onClick={() => setDeleteTarget(account)}
                          disabled={isBusy}
                          danger
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SettingsSection>

          <SettingsSection
            id="auto-sources"
            title={`Automated email sources (${partnerLabel})`}
            hint="Emails or domains that can create add/remove requests automatically."
            footer={(
              <AddBar
                onSubmit={handleAddSource}
                submitLabel="Add"
                busy={sourceAdding}
                disabled={!sourceInput.trim()}
              >
                <input
                  id="auto-source"
                  type="text"
                  value={sourceInput}
                  onChange={(event) => setSourceInput(event.target.value)}
                  placeholder="Email or @domain"
                  className={fieldClass}
                  aria-label="Email or domain"
                />
              </AddBar>
            )}
          >
            {sourcesLoading ? (
              <CardListSkeleton rows={3} />
            ) : (
              <ItemList empty={autoSources.length === 0 ? 'No sources yet. Add an email or domain below.' : null}>
                {autoSources.map((row) => (
                  <ItemRow
                    key={row.id}
                    icon={row.kind === 'domain' ? <AtSign className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                    title={formatSourcePattern(row)}
                    badge={<StatusPill>{row.kind === 'domain' ? 'Domain' : 'Email'}</StatusPill>}
                    meta={row.createdAt ? `Added ${formatAdded(row.createdAt)}` : null}
                    action={(
                      <IconButton
                        label={`Remove ${formatSourcePattern(row)}`}
                        onClick={() => setPendingSourceRemove(row)}
                        disabled={busyId === row.id}
                        danger
                      >
                        {busyId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </IconButton>
                    )}
                  />
                ))}
              </ItemList>
            )}
          </SettingsSection>
            </SettingsPage>
          ) : (
            // ── Custom Manager Form Builder ──────────────────────────────────
            <>
              {builtForm ? (
                // Preview
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 py-1">
                    <TextButton onClick={handleEditForm}>
                      <ArrowLeft className="h-4 w-4" /> Edit form
                    </TextButton>
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Form Preview</span>
                  </div>

                  {/* URL card */}
                  <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-white shadow-sm">
                    <div className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/50 px-5 py-4">
                      <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Manager Form URL</h2>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Share this link with managers. (Prototype, not yet active.)</p>
                    </div>
                    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                      <code className="min-w-0 flex-1 break-all rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-panel)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                        {builtFormUrl}
                      </code>
                      <FilledButton onClick={handleCopyUrl}>
                        {urlCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {urlCopied ? 'Copied!' : 'Copy URL'}
                      </FilledButton>
                    </div>
                  </div>

                  {/* Form preview card */}
                  <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-white shadow-sm">
                    <div className="flex items-center gap-2 border-b border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/50 px-5 py-3">
                      <Eye className="h-4 w-4 text-[var(--color-text-muted)]" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Preview: how managers will see this form</span>
                    </div>
                    <div className="mx-auto max-w-md space-y-6 px-6 py-8">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <img src={builtForm.logoDataUrl} alt={builtForm.partnerName} className="h-16 w-16 rounded-xl border border-[var(--color-border-default)] bg-white object-contain p-1.5" />
                        <div>
                          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{builtForm.partnerName}</h2>
                          <p className="mt-1 text-base font-bold text-[var(--color-text-primary)]">Submission Form</p>
                          <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">Power Music admin has invited you to fill out this form.</p>
                          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Please provide the requested information below.</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {builtForm.fields.map((field) => (
                          <div key={field.id}>
                            <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-primary)]">{field.name}</label>
                            {field.type === 'Date' ? (
                              <input type="date" className={fieldStandaloneClass} readOnly />
                            ) : field.type === 'Number' ? (
                              <input type="number" placeholder="0" className={fieldStandaloneClass} readOnly />
                            ) : field.type === 'Email' ? (
                              <input type="email" placeholder="name@example.com" className={fieldStandaloneClass} readOnly />
                            ) : (
                              <input type="text" className={fieldStandaloneClass} readOnly />
                            )}
                          </div>
                        ))}
                      </div>

                      <FilledButton
                        onClick={() => showToast('Form submission is not available in this prototype.', 'success')}
                      >
                        Submit
                      </FilledButton>

                      <p className="text-center text-[10px] text-[var(--color-text-muted)]">
                        Prototype preview only. Submission is not functional.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                // Builder
                <SettingsPage>
                  <SettingsSection id="form-partner" title="Partner" hint="The custom manager form will be created for this partner.">
                    <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/40 px-3.5 py-3">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">{selectedPartner?.name || 'No partner selected'}</p>
                    </div>
                  </SettingsSection>

                  <SettingsSection id="form-logo" title="Partner Logo" hint="Required. Shown at the top of the manager form.">
                    {logoDataUrl ? (
                      <div className="flex items-center gap-4">
                        <img src={logoDataUrl} alt="Partner logo" className="h-16 w-16 rounded-lg border border-[var(--color-border-default)] bg-white object-contain p-1.5" />
                        <div className="space-y-1">
                          <TextButton onClick={() => logoInputRef.current?.click()}>Replace logo</TextButton>
                          <div>
                            <button type="button" onClick={handleRemoveLogo} className="block rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50">
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/50 px-4 py-8 text-sm text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-brand-primary)]/40 hover:bg-[var(--color-surface-highlight)] hover:text-[var(--color-text-primary)]"
                      >
                        <Upload className="h-5 w-5" />
                        <span className="font-medium">Upload Logo</span>
                        <span className="text-xs text-[var(--color-text-muted)]">PNG, JPG, SVG, or WEBP</span>
                      </button>
                    )}
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    {formAttempted && formErrors.logo && (
                      <p className="mt-2 text-[11px] text-red-600">{formErrors.logo}</p>
                    )}
                  </SettingsSection>

                  <SettingsSection
                    id="form-fields"
                    title="Form Fields"
                    hint="Add the fields you want managers to fill in when submitting a request."
                    action={<TextButton onClick={handleAddField}><Plus className="h-4 w-4" /> Add Field</TextButton>}
                  >
                    {formFields.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/50 px-4 py-8 text-center">
                        <p className="text-sm font-medium text-[var(--color-text-secondary)]">No fields added yet.</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">Add fields to build your manager form.</p>
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {formFields.map((field, index) => (
                          <li key={field.id} className="space-y-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/40 px-3.5 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Field {index + 1}</p>
                              <IconButton label="Remove field" onClick={() => handleRemoveField(field.id)} danger>
                                <Trash2 className="h-4 w-4" />
                              </IconButton>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-primary)]">Field name</label>
                                <input
                                  type="text"
                                  placeholder="e.g. First Name"
                                  value={field.name}
                                  onChange={(e) => handleFieldChange(field.id, 'name', e.target.value)}
                                  className={fieldStandaloneClass + (formAttempted && formErrors.fieldErrors?.[field.id] ? ' !border-red-300 focus:!border-red-400' : '')}
                                />
                                {formAttempted && formErrors.fieldErrors?.[field.id] && (
                                  <p className="mt-1 text-[11px] text-red-600">{formErrors.fieldErrors[field.id]}</p>
                                )}
                              </div>
                              <div>
                                <label className="mb-1.5 block text-xs font-medium text-[var(--color-text-primary)]">Data type</label>
                                <select
                                  value={field.type}
                                  onChange={(e) => handleFieldChange(field.id, 'type', e.target.value)}
                                  className={fieldStandaloneClass}
                                >
                                  <option value="Text">Text</option>
                                  <option value="Number">Number</option>
                                  <option value="Email">Email</option>
                                  <option value="Date">Date</option>
                                  <option value="Text and Number">Text and Number</option>
                                </select>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {formAttempted && formErrors.fields && (
                      <p className="mt-2 text-[11px] text-red-600">{formErrors.fields}</p>
                    )}
                  </SettingsSection>

                  <section className="px-5 py-5 sm:px-6">
                    <FilledButton onClick={handleCreateForm}>
                      Create Custom Manager Form
                    </FilledButton>
                  </section>
                </SettingsPage>
              )}
            </>
          )}
        </div>
      </div>

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
            <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">
              Display name
            </label>
            <input
              type="text"
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder={`e.g. ${partnerLabel} notifications`}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddAccount(); }}
              className={fieldStandaloneClass}
              autoFocus
            />
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
            You’ll be redirected to Google to choose the inbox for automated roster emails.
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
        <label className="mb-1.5 block text-xs text-[var(--color-text-secondary)]">Display name</label>
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
          className={fieldStandaloneClass}
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
