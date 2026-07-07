import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search, Flag, Send, AlertTriangle, Inbox,
  ChevronLeft, ChevronRight, Mail, MailOpen, Sparkles, SlidersHorizontal,
  SortAsc, Archive, X, Pencil, Trash2, RotateCcw, Link2, Unlink
} from 'lucide-react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { patchEmail, sendEmail, bulkPatchEmails, deleteEmailForever, emptyBin, loadWithCache, refreshCache, patchCache, getPilot2Workspace } from '../utils/pilot2Api';
import { Toast, useToast, SelectDropdown, Modal, EmailListSkeleton, DraftCreatingPanel } from '../components/ui';
import PageHeader from '../components/layout/PageHeader';
import { adminPageShellClass } from '../utils/responsiveLayout';
import DraftBodyDisplay from '../components/email/DraftBodyDisplay';
import { buildEmailSignature, normalizeDraftSignature, resolveInboxTitle } from '../utils/emailSignature';

const PAGE_SIZE = 20;

function normalizeEmail(email) {
  return {
    ...email,
    read: Boolean(email.read),
    deleted: Boolean(email.deleted),
    archived: Boolean(email.archived),
    flagged: Boolean(email.flagged),
  };
}

function shouldRevalidateAfterMutation(result) {
  if (result == null) return true;
  if (Array.isArray(result)) return false;
  if (typeof result === 'object' && 'deleted' in result) {
    const { deleted } = result;
    return typeof deleted !== 'number' && typeof deleted !== 'string';
  }
  return true;
}

// ── Optimistic-mutation ledger ──
// Lives at module scope so it survives unmount/remount: navigating away and
// back mid-save must not resurrect state an in-flight mutation is changing.
// Every server snapshot is reconciled against it, so a stale fetch can never
// flash the pre-mutation state (e.g. a restored email reappearing in Bin).
const PENDING_PATCH_TTL = 15000;
const pendingEmailPatches = new Map(); // id -> { patch, until }
const pendingEmailRemovals = new Map(); // id -> until

function notePendingPatches(ids, patch) {
  const now = Date.now();
  ids.forEach((id) => {
    const existing = pendingEmailPatches.get(id);
    const base = existing && existing.until > now ? existing.patch : {};
    pendingEmailPatches.set(id, { patch: { ...base, ...patch }, until: now + PENDING_PATCH_TTL });
  });
}

function clearPendingPatches(ids, keys) {
  ids.forEach((id) => {
    const entry = pendingEmailPatches.get(id);
    if (!entry) return;
    if (!keys) {
      pendingEmailPatches.delete(id);
      return;
    }
    const rest = { ...entry.patch };
    keys.forEach((key) => delete rest[key]);
    if (Object.keys(rest).length === 0) pendingEmailPatches.delete(id);
    else pendingEmailPatches.set(id, { ...entry, patch: rest });
  });
}

function notePendingRemovals(ids) {
  const until = Date.now() + PENDING_PATCH_TTL;
  ids.forEach((id) => pendingEmailRemovals.set(id, until));
}

function clearPendingRemovals(ids) {
  ids.forEach((id) => pendingEmailRemovals.delete(id));
}

const sameValue = (a, b) => a === b || (a == null && b == null);

// Overlay unconfirmed local changes onto server rows. With `retire: true`
// (full workspace snapshots) an entry is dropped once the server reflects it;
// mutation responses must NOT retire entries, because a stale fetch dispatched
// before the mutation can still land afterwards and needs the overlay.
function reconcileWithPending(rows, { retire = false } = {}) {
  const now = Date.now();
  pendingEmailPatches.forEach((entry, id) => {
    if (entry.until < now) pendingEmailPatches.delete(id);
  });
  pendingEmailRemovals.forEach((until, id) => {
    if (until < now) pendingEmailRemovals.delete(id);
  });
  return (rows ?? [])
    .filter((raw) => !pendingEmailRemovals.has(raw.id))
    .map((raw) => {
      const email = normalizeEmail(raw);
      const entry = pendingEmailPatches.get(email.id);
      if (!entry) return email;
      const caughtUp = Object.entries(entry.patch).every(([key, value]) => sameValue(email[key], value));
      if (caughtUp) {
        if (retire) pendingEmailPatches.delete(email.id);
        return email;
      }
      return { ...email, ...entry.patch };
    });
}

const MAILBOXES = [
  { id: 'inbox', label: 'Inbox', shortLabel: 'Inbox', icon: Inbox },
  { id: 'urgent', label: 'Urgent', shortLabel: 'Urgent', icon: AlertTriangle },
  { id: 'flagged', label: 'Flagged', shortLabel: 'Flagged', icon: Flag },
  { id: 'archive', label: 'Archive', shortLabel: 'Archive', icon: Archive },
  { id: 'sent', label: 'Sent', shortLabel: 'Sent', icon: Send },
  { id: 'bin', label: 'Bin', shortLabel: 'Bin', icon: Trash2 },
];
const MAILBOX_IDS = new Set(MAILBOXES.map((m) => m.id));

const INTENTS = ['All', 'Enquiry', 'Cancellation', 'Renewal', 'Partnership', 'Finance', 'Events'];
const READ_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

function getFirstName(from) {
  if (!from) return 'there';
  return from.split(' ')[0];
}

function buildDraft(email, inboxes) {
  const inboxTitle = resolveInboxTitle(inboxes, email.inbox);
  const signature = buildEmailSignature(inboxTitle);
  if (email.draftBody?.trim()) {
    return normalizeDraftSignature(email.draftBody, inboxTitle);
  }
  return `Hi ${getFirstName(email.from)},\n\nWe've received your message. A member of our team will review your enquiry and respond shortly.\n\n${signature}`;
}

// Only Imported/Processing mean the AI is still working. Statuses like
// Flagged or No Draft must NOT show the composing panel (they never get a
// draft automatically), otherwise flagging a stuck email looks like it did
// nothing and "Composing your reply" spins forever.
function isDraftPending(email) {
  if (!email || email.deleted) return false;
  return email.draftStatus === 'Imported' || email.draftStatus === 'Processing';
}

function formatListTime(iso) {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return format(d, 'h:mm a');
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'd MMM');
  } catch {
    return iso;
  }
}

function getDateGroupLabel(iso) {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'EEEE, d MMMM');
  } catch {
    return 'Earlier';
  }
}

function groupEmailsByDateAndIntent(emails) {
  const dateMap = new Map();
  emails.forEach((email) => {
    const dateLabel = getDateGroupLabel(email.receivedAt);
    const intent = email.intent || 'Pending';
    if (!dateMap.has(dateLabel)) dateMap.set(dateLabel, new Map());
    const intentMap = dateMap.get(dateLabel);
    if (!intentMap.has(intent)) intentMap.set(intent, []);
    intentMap.get(intent).push(email);
  });

  return Array.from(dateMap.entries()).map(([dateLabel, intentMap]) => ({
    dateLabel,
    intentGroups: Array.from(intentMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([intent, items]) => ({ intent, items })),
  }));
}

function formatDetailTime(iso) {
  try {
    return format(parseISO(iso), 'EEE, d MMM yyyy · HH:mm');
  } catch {
    return iso;
  }
}

function matchesMailbox(email, mailbox) {
  switch (mailbox) {
    case 'inbox': return email.draftStatus !== 'Sent';
    case 'urgent': return email.urgent;
    case 'flagged': return email.flagged;
    case 'sent': return email.draftStatus === 'Sent';
    default: return true;
  }
}

function getPreviewLine(body) {
  if (!body) return '';
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  const meaningful = lines.find((line) => line.length > 8 && !/^(hi|hello)(\s+there)?,?$/i.test(line)) || lines.join(' ');
  const trimmed = meaningful.length > 80 ? meaningful.slice(0, 80).trimEnd() : meaningful;
  return trimmed ? `${trimmed}...` : '';
}

function emailMatchesDateRange(iso, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  try {
    const d = parseISO(iso);
    if (dateFrom) {
      const from = parseISO(dateFrom);
      from.setHours(0, 0, 0, 0);
      if (d < from) return false;
    }
    if (dateTo) {
      const to = parseISO(dateTo);
      to.setHours(23, 59, 59, 999);
      if (d > to) return false;
    }
    return true;
  } catch {
    return true;
  }
}

function IntentBadge({ intent, confidence }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)]">
      {intent}
      {confidence != null && <span className="opacity-70">· {confidence}%</span>}
    </span>
  );
}

function BulkActionChip({ icon: Icon, label, onClick, variant = 'default', disabled = false, fullWidth = false, iconOnly = false, active = false, iconClass = '' }) {
  if (iconOnly) {
    // Gmail-style: flat icon button with a dark tooltip on hover/focus.
    const iconVariants = {
      primary: 'text-[var(--color-brand-primary)] hover:bg-[var(--color-surface-highlight-strong)]',
      default: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-highlight)] hover:text-[var(--color-text-primary)]',
      outline: 'text-[var(--color-brand-primary)] hover:bg-[var(--color-surface-highlight-strong)]',
      soft: 'text-[var(--color-brand-primary)] hover:bg-[var(--color-surface-highlight-strong)]',
      delete: 'text-[var(--color-text-secondary)] hover:text-red-600 hover:bg-red-50',
      danger: 'text-red-600 hover:bg-red-50 hover:text-red-700',
      dangerSolid: 'text-red-600 hover:bg-red-50 hover:text-red-700',
    };
    const activeVariants = {
      delete: 'text-red-600 bg-red-50 hover:bg-red-100',
      danger: 'text-red-700 bg-red-50 hover:bg-red-100',
      default: 'text-[var(--color-brand-primary)] bg-[var(--color-surface-highlight-strong)] hover:bg-[var(--color-surface-highlight)]',
    };
    const idle = iconVariants[variant] ?? iconVariants.default;
    const activeCls = activeVariants[variant] ?? activeVariants.default;
    return (
      <div className="relative group shrink-0">
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active || undefined}
          className={`peer inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35 disabled:opacity-40 disabled:cursor-not-allowed ${active ? activeCls : idle}`}
        >
          <Icon className={`w-4 h-4 ${iconClass}`} aria-hidden="true" />
        </button>
        {/* peer-focus-visible (not focus-within): a mouse click leaves the
            button focused, which used to pin the tooltip open after hover. */}
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-[calc(100%+4px)] z-40 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 scale-95 transition-all duration-100 group-hover:opacity-100 group-hover:scale-100 peer-focus-visible:opacity-100 peer-focus-visible:scale-100"
        >
          {label}
        </span>
      </div>
    );
  }

  const base =
    'inline-flex items-center justify-center gap-1.5 h-8 min-w-[2rem] px-2.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35 focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary:
      'text-white bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] shadow-sm',
    default:
      'text-[var(--color-text-primary)] bg-white border border-[var(--color-border-default)] hover:bg-[var(--color-surface-highlight)] hover:border-[var(--color-brand-primary)]/20',
    outline:
      'text-[var(--color-brand-primary)] bg-white border border-[var(--color-border-default)] hover:bg-[var(--color-surface-highlight)]',
    soft:
      'text-[var(--color-brand-primary)] bg-[var(--color-surface-highlight-strong)]/70 hover:bg-[var(--color-surface-highlight-strong)]',
    delete:
      'text-[var(--color-text-secondary)] bg-white border border-[var(--color-border-default)] hover:text-red-600 hover:border-red-200 hover:bg-red-50',
    danger:
      'text-red-700 bg-red-50 border border-red-200/70 hover:bg-red-100',
    dangerSolid:
      'text-white bg-red-600 hover:bg-red-700 shadow-sm',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`${base} ${variants[variant] ?? variants.default} ${fullWidth ? 'w-full' : ''}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function EmailListItem({ email, selected, checked, onClick, onCheck }) {
  const unread = !email.read;

  const rowClass = selected
    ? unread
      ? 'bg-[#eef5ff] hover:bg-[#e3effc]'
      : 'bg-[#f4f5f7] hover:bg-[#eceef2]'
    : unread
      ? 'bg-[#eef5ff] hover:bg-[#e3effc]'
      : 'bg-white hover:bg-[var(--color-surface-panel)]/80';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected || undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`relative w-full text-left px-4 py-2 border-b border-[var(--color-border-default)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-brand-primary)]/40 ${rowClass} ${
        selected ? 'shadow-[inset_3px_0_0_0_var(--color-brand-primary)]' : ''
      }`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => { e.stopPropagation(); onCheck(); }}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--color-brand-primary)]/35 text-[var(--color-brand-primary)] focus:ring-[var(--color-brand-primary)] cursor-pointer shrink-0 accent-[var(--color-brand-primary)]"
          aria-label={`Select ${email.from}`}
        />

        <div className="flex-1 min-w-0">
          <p className={`text-sm truncate leading-snug ${
            unread
              ? 'font-bold text-[var(--color-text-primary)]'
              : selected
                ? 'font-normal text-[var(--color-brand-primary)]'
                : 'font-normal text-[var(--color-text-secondary)]'
          }`}>
            {email.subject}
          </p>
          <p className={`text-xs mt-0.5 truncate ${
            unread
              ? 'font-semibold text-[var(--color-text-secondary)]'
              : 'text-[var(--color-text-muted)]'
          }`}>
            {email.from}
          </p>
          <p className="text-[11px] mt-0.5 truncate leading-snug text-[var(--color-text-muted)]">
            {getPreviewLine(email.body)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0 min-w-[2.25rem]">
          {unread && (
            <span
              className={`w-2 h-2 rounded-full bg-[var(--color-brand-primary)] ring-2 shrink-0 ${
                selected ? 'ring-[#eef5ff]' : 'ring-[#eef5ff]'
              }`}
              aria-label="Unread"
            />
          )}
          <span className={`text-[10px] tabular-nums ${
            unread
              ? 'font-bold text-[var(--color-brand-primary)]/75'
              : 'text-[var(--color-text-muted)]'
          }`}>
            {formatListTime(email.receivedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function EmailQueue() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mailboxFromUrl = searchParams.get('mailbox');
  const [emails, setEmails] = useState([]);
  const [inboxes, setInboxes] = useState([]);
  const [mailbox, setMailbox] = useState(() =>
    MAILBOX_IDS.has(mailboxFromUrl) ? mailboxFromUrl : 'inbox'
  );
  const [inboxFilter, setInboxFilter] = useState('');
  const [intentFilter, setIntentFilter] = useState('All');
  const [readFilter, setReadFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [draftEdits, setDraftEdits] = useState({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [archivedIds, setArchivedIds] = useState(() => new Set());
  const [listLoading, setListLoading] = useState(true);
  const [pendingAiCount, setPendingAiCount] = useState(0);
  const sortRef = useRef(null);

  // Load emails and inboxes: cached copy renders instantly, then fresh data
  // replaces it. Refreshes on window focus and every 30s so changes made in
  // Gmail (or another tab) show up without a manual reload. Every snapshot is
  // reconciled against the pending-mutation ledger so unconfirmed local
  // changes (restore, delete, archive, read…) are never flashed away.
  const applyEmails = useCallback((emailRows) => {
    const next = reconcileWithPending(emailRows, { retire: true });
    setArchivedIds(new Set(next.filter((e) => e.archived).map((e) => e.id)));
    patchCache('pilot2_workspace', { emails: next });
    setEmails(next);
  }, []);

  const updateEmailsOptimistic = useCallback((updater) => {
    setEmails((prev) => {
      const next = updater(prev);
      patchCache('pilot2_workspace', { emails: next });
      return next;
    });
  }, []);

  // Merge a mutation response into local state. The response goes through the
  // same ledger reconciliation, which also retires ledger entries the server
  // has confirmed.
  const mergeEmailPatches = useCallback((patches) => {
    const rows = Array.isArray(patches) ? patches : [patches];
    const byId = new Map(reconcileWithPending(rows).map((email) => [email.id, email]));
    setEmails((prev) => {
      const next = prev.map((email) => (byId.has(email.id) ? { ...email, ...byId.get(email.id) } : email));
      patchCache('pilot2_workspace', { emails: next });
      return next;
    });
  }, []);

  // Keep every inbox selectable (a disconnected one shows a "connect again"
  // state), but drop the selection if the inbox was deleted.
  const applyInboxes = useCallback((inboxRows) => {
    setInboxes(inboxRows);
    setInboxFilter((prev) => {
      if (prev && inboxRows.some((i) => i.email === prev)) return prev;
      const connected = inboxRows.filter((i) => i.status === 'Connected');
      return (connected[0] ?? inboxRows[0])?.email || '';
    });
  }, []);

  // In-flight mutation counter. Background refreshes are skipped while a
  // change is being saved, otherwise a stale fetch racing the save would
  // briefly revert the optimistic UI (looked like "archive doesn't work").
  const pendingRef = useRef(0);
  const cancelledRef = useRef(false);

  const revalidate = useCallback(() => {
    refreshCache('pilot2_workspace', getPilot2Workspace, (data) => {
      if (!cancelledRef.current && pendingRef.current === 0) applyEmails(data.emails ?? []);
      if (!cancelledRef.current) applyInboxes(data.inboxes ?? []);
      if (!cancelledRef.current) setPendingAiCount(data.pendingAiCount ?? 0);
      if (!cancelledRef.current) setListLoading(false);
    }).catch(() => {});
  }, [applyEmails, applyInboxes]);

  // Wrap every write call: pause refreshes while saving, then re-sync state
  // and cache from the server as soon as the last save lands.
  const track = useCallback(async (promise) => {
    pendingRef.current += 1;
    let result;
    try {
      result = await promise;
      return result;
    } finally {
      pendingRef.current -= 1;
      // Bulk-patch / bin responses already carry saved state — re-fetching can
      // race Gmail sync and briefly revert bin actions.
      if (pendingRef.current === 0 && shouldRevalidateAfterMutation(result)) {
        setTimeout(revalidate, 250);
      }
    }
  }, [revalidate]);

  useEffect(() => {
    cancelledRef.current = false;
    loadWithCache('pilot2_workspace', getPilot2Workspace, (data) => {
      if (!cancelledRef.current && pendingRef.current === 0) applyEmails(data.emails ?? []);
      if (!cancelledRef.current) applyInboxes(data.inboxes ?? []);
      if (!cancelledRef.current) setPendingAiCount(data.pendingAiCount ?? 0);
      if (!cancelledRef.current) setListLoading(false);
    }).catch((err) => {
      setListLoading(false);
      showToast(`Could not load emails: ${err.message}`, 'error');
    });

    // Background revalidation — silent, keeps the page current (picks up
    // changes made in Gmail or another tab).
    const refresh = () => { if (!document.hidden) revalidate(); };
    const interval = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sortOpen) return;
    const onClickOutside = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [sortOpen]);

  const selectedEmail = emails.find((e) => e.id === selectedId) ?? null;
  const selectedDraftPending = selectedEmail ? isDraftPending(selectedEmail) : false;

  useEffect(() => {
    if (!selectedId || !selectedDraftPending) return undefined;

    const refresh = () => {
      if (!document.hidden) revalidate();
    };
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [selectedId, selectedDraftPending, revalidate]);

  const intentOptions = useMemo(
    () => INTENTS.map((intent) => ({ value: intent, label: intent === 'All' ? 'All intents' : intent })),
    []
  );

  const mailboxCounts = useMemo(() => {
    const forInbox = (predicate) =>
      emails.filter((e) => e.inbox === inboxFilter && predicate(e));
    return {
      inbox: forInbox((e) => !e.deleted && !archivedIds.has(e.id) && matchesMailbox(e, 'inbox')).length,
      urgent: forInbox((e) => !e.deleted && !archivedIds.has(e.id) && matchesMailbox(e, 'urgent')).length,
      flagged: forInbox((e) => !e.deleted && !archivedIds.has(e.id) && matchesMailbox(e, 'flagged')).length,
      archive: forInbox((e) => !e.deleted && archivedIds.has(e.id)).length,
      sent: forInbox((e) => !e.deleted && !archivedIds.has(e.id) && matchesMailbox(e, 'sent')).length,
      bin: forInbox((e) => e.deleted).length,
    };
  }, [emails, archivedIds, inboxFilter]);

  const filteredEmails = useMemo(() => {
    const q = search.trim().toLowerCase();
    return emails
      .filter((email) => {
        if (mailbox === 'bin') return email.deleted;
        if (email.deleted) return false;
        if (mailbox === 'archive') return archivedIds.has(email.id);
        return !archivedIds.has(email.id) && matchesMailbox(email, mailbox);
      })
      .filter((email) => email.inbox === inboxFilter)
      .filter((email) => intentFilter === 'All' || email.intent === intentFilter)
      .filter((email) => {
        if (readFilter === 'unread') return !email.read;
        if (readFilter === 'read') return email.read;
        return true;
      })
      .filter((email) => emailMatchesDateRange(email.receivedAt, dateFrom, dateTo))
      .filter((email) => {
        if (!q) return true;
        return (
          email.from.toLowerCase().includes(q) ||
          email.fromEmail.toLowerCase().includes(q) ||
          email.inbox.toLowerCase().includes(q) ||
          email.subject.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const diff = new Date(a.receivedAt) - new Date(b.receivedAt);
        return sortOrder === 'oldest' ? diff : -diff;
      });
  }, [emails, mailbox, inboxFilter, intentFilter, readFilter, search, dateFrom, dateTo, sortOrder, archivedIds]);

  const totalPages = Math.max(1, Math.ceil(filteredEmails.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const paginatedEmails = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEmails.slice(start, start + PAGE_SIZE);
  }, [filteredEmails, currentPage]);

  const listGroups = useMemo(() => groupEmailsByDateAndIntent(paginatedEmails), [paginatedEmails]);

  const accountOptions = useMemo(
    () => inboxes.map((inbox) => ({
      value: inbox.email,
      label: inbox.title,
    })),
    [inboxes]
  );

  const selectedInbox = inboxes.find((i) => i.email === inboxFilter) ?? null;
  const inboxDisconnected = Boolean(selectedInbox && selectedInbox.status !== 'Connected');

  // Import/AI drafting still in progress: show the sync banner and poll
  // faster so newly drafted emails appear promptly.
  const isSyncing = pendingAiCount > 0 || selectedInbox?.backfillStatus === 'running';

  useEffect(() => {
    if (!isSyncing) return undefined;
    const refresh = () => {
      if (!document.hidden) revalidate();
    };
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [isSyncing, revalidate]);

  const allPageChecked = paginatedEmails.length > 0 && paginatedEmails.every((e) => checkedIds.has(e.id));
  const somePageChecked = paginatedEmails.some((e) => checkedIds.has(e.id));

  const toggleCheck = (id) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    if (allPageChecked) {
      setCheckedIds((prev) => {
        const next = new Set(prev);
        paginatedEmails.forEach((e) => next.delete(e.id));
        return next;
      });
    } else {
      setCheckedIds((prev) => {
        const next = new Set(prev);
        paginatedEmails.forEach((e) => next.add(e.id));
        return next;
      });
    }
  };

  const activeMailbox = MAILBOXES.find((m) => m.id === mailbox);
  const activeMailboxLabel = activeMailbox?.label ?? 'Inbox';
  const ActiveMailboxIcon = activeMailbox?.icon;

  useLayoutEffect(() => {
    setPage(1);
    setCheckedIds(new Set());
    setSelectedId(null);
  }, [mailbox, inboxFilter, intentFilter, readFilter, search, dateFrom, dateTo, sortOrder]);

  useLayoutEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredEmails.length / PAGE_SIZE));
    if (page > maxPage) setPage(maxPage);
  }, [filteredEmails.length, page]);

  const hasActiveSearch = Boolean(search.trim());
  const hasActiveFilters = intentFilter !== 'All' || readFilter !== 'all' || dateFrom || dateTo;

  const clearFilters = () => {
    setIntentFilter('All');
    setReadFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const getDraftForEmail = useCallback((email) => {
    if (draftEdits[email.id] != null) return draftEdits[email.id];
    return buildDraft(email, inboxes);
  }, [draftEdits, inboxes]);

  const handleSelect = (email) => {
    const isNewSelection = selectedId !== email.id;
    setSelectedId(email.id);
    setIsEditingDraft(false);
    // Only auto-mark read when opening a different email (not re-clicking the same row).
    if (isNewSelection && !email.read) {
      notePendingPatches([email.id], { read: true });
      updateEmailsOptimistic((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, read: true } : e))
      );
      track(patchEmail(email.id, { read: true }))
        .then((updated) => mergeEmailPatches(updated))
        .catch(() => clearPendingPatches([email.id], ['read']));
    }
    if (draftEdits[email.id] == null && !isDraftPending(email)) {
      setDraftEdits((prev) => ({ ...prev, [email.id]: buildDraft(email, inboxes) }));
    }
  };

  const handleCancelDraft = () => {
    if (!selectedEmail) return;
    setDraftEdits((prev) => ({ ...prev, [selectedEmail.id]: buildDraft(selectedEmail, inboxes) }));
    setIsEditingDraft(false);
  };

  const selectedCount = checkedIds.size;
  const hasSelection = selectedCount > 0;

  const archiveEmails = (ids) => {
    if (ids.length === 0) {
      showToast('Select one or more emails to archive.', 'error');
      return;
    }
    notePendingPatches(ids, { archived: true });
    setArchivedIds((prev) => new Set([...prev, ...ids]));
    updateEmailsOptimistic((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, archived: true } : e)));
    setCheckedIds(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} moved to Archive.`, 'success');
    track(bulkPatchEmails(ids, { archived: true }))
      .then((updated) => mergeEmailPatches(updated))
      .catch(() => {
        clearPendingPatches(ids, ['archived']);
        setArchivedIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
        updateEmailsOptimistic((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, archived: false } : e)));
        showToast('Could not archive email.', 'error');
      });
  };

  const unarchiveEmails = (ids) => {
    if (ids.length === 0) return;
    notePendingPatches(ids, { archived: false });
    setArchivedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    updateEmailsOptimistic((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, archived: false } : e)));
    setCheckedIds(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} restored to Inbox.`, 'success');
    track(bulkPatchEmails(ids, { archived: false }))
      .then((updated) => mergeEmailPatches(updated))
      .catch(() => {
        clearPendingPatches(ids, ['archived']);
        setArchivedIds((prev) => new Set([...prev, ...ids]));
        updateEmailsOptimistic((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, archived: true } : e)));
        showToast('Could not restore email to Inbox.', 'error');
      });
  };

  // ── Read / unread (bulk, one request) ──
  const markEmailsRead = async (ids, read) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const previous = emails.filter((e) => idSet.has(e.id)).map((e) => ({ id: e.id, read: e.read }));

    notePendingPatches(ids, { read });
    updateEmailsOptimistic((prev) => prev.map((e) => (idSet.has(e.id) ? { ...e, read } : e)));

    try {
      const updated = await track(bulkPatchEmails(ids, { read }));
      if (updated?.length) mergeEmailPatches(updated);
      showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} marked as ${read ? 'read' : 'unread'}.`, 'success');
    } catch (err) {
      clearPendingPatches(ids, ['read']);
      updateEmailsOptimistic((prev) => prev.map((e) => {
        const prior = previous.find((p) => p.id === e.id);
        return prior ? { ...e, read: prior.read } : e;
      }));
      showToast(`Could not update read status: ${err.message}`, 'error');
    }
  };

  // ── Bin (soft delete, Gmail-style) ──
  const [confirmDelete, setConfirmDelete] = useState(null); // { type: 'forever'|'empty', ids }

  const deleteEmails = (ids) => {
    if (ids.length === 0) {
      showToast('Select one or more emails to delete.', 'error');
      return;
    }
    notePendingPatches(ids, { deleted: true });
    updateEmailsOptimistic((prev) =>
      prev.map((e) => (ids.includes(e.id) ? { ...e, deleted: true } : e)),
    );
    setCheckedIds(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} moved to Bin.`, 'success');
    track(bulkPatchEmails(ids, { deleted: true }))
      .then((updated) => {
        mergeEmailPatches(updated);
      })
      .catch(() => {
        clearPendingPatches(ids, ['deleted']);
        updateEmailsOptimistic((prev) =>
          prev.map((e) => (ids.includes(e.id) ? { ...e, deleted: false } : e)),
        );
        showToast('Could not move email to Bin.', 'error');
      });
  };

  const restoreEmails = (ids) => {
    if (ids.length === 0) return;
    const snapshot = emails;

    notePendingPatches(ids, { deleted: false });
    updateEmailsOptimistic((prev) =>
      prev.map((e) => (ids.includes(e.id) ? { ...e, deleted: false, deletedAt: null } : e)),
    );
    setCheckedIds(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} restored from Bin.`, 'success');

    track(bulkPatchEmails(ids, { deleted: false }))
      .then((updated) => {
        mergeEmailPatches(updated);
      })
      .catch(() => {
        clearPendingPatches(ids, ['deleted']);
        updateEmailsOptimistic(() => snapshot);
        showToast('Could not restore email from Bin.', 'error');
      });
  };

  const handleConfirmedDelete = () => {
    if (!confirmDelete) return;

    const action = confirmDelete;
    const snapshot = emails;
    setConfirmDelete(null);

    if (action.type === 'empty') {
      const binnedIds = [...new Set(emails.filter((e) => e.deleted).map((e) => e.id))];

      notePendingRemovals(binnedIds);
      updateEmailsOptimistic((prev) => prev.filter((e) => !e.deleted));
      setCheckedIds(new Set());
      if (selectedId && binnedIds.includes(selectedId)) setSelectedId(null);

      track(emptyBin())
        .then((result) => {
          showToast(
            `Bin emptied. ${result.deleted} email${result.deleted === 1 ? '' : 's'} deleted forever.`,
            'success',
          );
        })
        .catch((err) => {
          clearPendingRemovals(binnedIds);
          updateEmailsOptimistic(() => snapshot);
          showToast(`Could not empty bin: ${err.message}`, 'error');
        });
      return;
    }

    const ids = action.ids;
    notePendingRemovals(ids);
    updateEmailsOptimistic((prev) => prev.filter((e) => !ids.includes(e.id)));
    setCheckedIds(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);

    track(Promise.all(ids.map((id) => deleteEmailForever(id))))
      .then(() => {
        showToast(
          `${ids.length} email${ids.length > 1 ? 's' : ''} deleted forever.`,
          'success',
        );
      })
      .catch((err) => {
        clearPendingRemovals(ids);
        updateEmailsOptimistic(() => snapshot);
        showToast(`Delete failed: ${err.message}`, 'error');
      });
  };

  const flagSelected = () => {
    const ids = hasSelection ? [...checkedIds] : selectedId ? [selectedId] : [];
    if (ids.length === 0) {
      showToast('Select one or more emails to flag.', 'error');
      return;
    }
    flagEmails(ids);
    setCheckedIds(new Set());
  };

  const flagEmails = (ids) => {
    notePendingPatches(ids, { flagged: true });
    updateEmailsOptimistic((prev) =>
      prev.map((e) =>
        ids.includes(e.id)
          ? { ...e, flagged: true, draftStatus: e.draftStatus === 'Sent' ? 'Sent' : 'Flagged', flagReason: 'Manual review requested' }
          : e
      )
    );
    track(bulkPatchEmails(ids, { flagged: true }))
      .then((updated) => mergeEmailPatches(updated))
      .catch(() => clearPendingPatches(ids, ['flagged']));
    showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} flagged.`, 'warning');
  };

  const unflagEmails = (ids) => {
    notePendingPatches(ids, { flagged: false });
    updateEmailsOptimistic((prev) =>
      prev.map((e) => {
        if (!ids.includes(e.id) || !e.flagged) return e;
        const nextStatus = e.draftStatus === 'Sent' ? 'Sent' : 'Draft Created';
        return { ...e, flagged: false, draftStatus: nextStatus, flagReason: undefined };
      })
    );
    track(bulkPatchEmails(ids, { flagged: false }))
      .then((updated) => mergeEmailPatches(updated))
      .catch(() => clearPendingPatches(ids, ['flagged']));
    showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} unflagged.`, 'success');
  };

  const toggleFlagEmail = (id) => {
    const email = emails.find((e) => e.id === id);
    if (!email) return;
    if (email.flagged) unflagEmails([id]);
    else flagEmails([id]);
  };

  const handleArchive = () => {
    const ids = hasSelection ? [...checkedIds] : selectedId ? [selectedId] : [];
    archiveEmails(ids);
  };

  const handleUnarchive = () => {
    const ids = hasSelection ? [...checkedIds] : selectedId ? [selectedId] : [];
    unarchiveEmails(ids);
  };

  const clearSelection = () => setCheckedIds(new Set());

  const handleSend = async () => {
    if (!selectedEmail) return;
    if (selectedEmail.flagged && !selectedEmail.templateUsed) {
      showToast('Resolve the flag before sending this reply.', 'error');
      return;
    }
    try {
      // The backend sends via Gmail and records the draft-vs-sent diff
      // (the learning signal) in the same call.
      const updated = await track(sendEmail(selectedEmail.id, getDraftForEmail(selectedEmail)));
      notePendingPatches([updated.id], { draftStatus: updated.draftStatus });
      updateEmailsOptimistic((prev) => prev.map((e) => (e.id === updated.id ? normalizeEmail(updated) : e)));
      showToast(`Reply sent to ${selectedEmail.fromEmail} via Gmail.`, 'success');
      setIsEditingDraft(false);
      setMailbox('sent');
    } catch (err) {
      showToast(`Send failed: ${err.message}`, 'error');
    }
  };

  const pageStart = filteredEmails.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, filteredEmails.length);

  return (
    <div className={`${adminPageShellClass} select-none`}>
      <Toast />

      <PageHeader
        section="Customer Support"
        title="Email Responses"
        description="Review incoming mail, edit AI drafts, and send replies from connected inboxes."
        workspace
        actions={
          <div
            className="flex items-center gap-1.5 h-9 rounded-lg border border-[var(--color-brand-primary)]/25 bg-gradient-to-r from-[#f4f7fd] via-[#e9eff9] to-[#eef3fb] pl-2.5 pr-1 shadow-[0_1px_2px_rgba(26,26,46,0.04)]"
            title={inboxFilter}
          >
            <Mail className="w-3.5 h-3.5 text-[var(--color-brand-primary)] shrink-0" aria-hidden="true" />
            <SelectDropdown
              value={inboxFilter}
              onChange={setInboxFilter}
              options={accountOptions}
              size="xs"
              variant="soft"
              className="w-32 sm:w-36"
            />
          </div>
        }
      />

      <div className="flex flex-1 min-h-0 flex-col rounded-xl border border-[var(--color-border-default)] overflow-hidden shadow-sm bg-white">
        {inboxDisconnected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-12">
            <span className="flex items-center justify-center h-14 w-14 rounded-full bg-[var(--color-surface-highlight)] mb-5" aria-hidden="true">
              <Unlink className="w-6 h-6 text-[var(--color-text-secondary)]" />
            </span>
            <h2 className="text-base font-bold text-[var(--color-text-primary)] mb-1.5">
              {selectedInbox?.title} is disconnected
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] max-w-sm leading-relaxed mb-6">
              Emails for <span className="font-semibold text-[var(--color-text-primary)]">{selectedInbox?.email}</span> are
              hidden while the inbox is disconnected. Connect it again to load its mail.
            </p>
            <button
              type="button"
              onClick={() => navigate('/email-accounts')}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors shadow-sm cursor-pointer"
            >
              <Link2 className="w-4 h-4" aria-hidden="true" />
              Connect inbox
            </button>
          </div>
        ) : (
        <>
        {isSyncing && (
          <div
            role="status"
            aria-live="polite"
            className="shrink-0 flex items-center gap-2.5 px-4 py-2 border-b border-[var(--color-border-default)] bg-gradient-to-r from-[#f4f7fd] via-[#e9eff9] to-[#eef3fb]"
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--color-brand-primary)] shrink-0 animate-pulse" aria-hidden="true" />
            <p className="flex-1 min-w-0 text-[11px] leading-snug text-[var(--color-text-secondary)]">
              <span className="font-semibold text-[var(--color-text-primary)]">Importing and drafting emails.</span>{' '}
              {pendingAiCount > 0
                ? `${pendingAiCount} email${pendingAiCount === 1 ? '' : 's'} being classified — they'll appear here once their drafts are ready.`
                : 'New mail is being imported — emails appear here once their drafts are ready.'}
            </p>
          </div>
        )}
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        {/* ── Email list (Team Inbox style) ── */}
        <div className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-[320px] shrink-0 flex-col border-b md:border-b-0 md:border-r border-[var(--color-border-default)] min-h-0 bg-white`}>
          {/* List header */}
          <div className="shrink-0 px-4 pt-3 pb-1.5 border-b border-[var(--color-border-default)]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="flex items-center gap-2 text-base font-bold text-[var(--color-text-primary)] min-w-0">
                {ActiveMailboxIcon && <ActiveMailboxIcon className="w-4 h-4 shrink-0" aria-hidden="true" />}
                <span className="truncate">{activeMailboxLabel}</span>
              </h2>
              <div className="flex items-center gap-0.5 -mr-1 shrink-0">
                <button
                  type="button"
                  onClick={() => { setSearchOpen((o) => !o); setFilterOpen(false); setSortOpen(false); }}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    searchOpen || hasActiveSearch
                      ? 'bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-highlight)]'
                  }`}
                  aria-label="Search"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { setFilterOpen((o) => !o); setSearchOpen(false); setSortOpen(false); }}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    filterOpen || hasActiveFilters
                      ? 'bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-highlight)]'
                  }`}
                  aria-label="Filter"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
                <div className="relative" ref={sortRef}>
                  <button
                    type="button"
                    onClick={() => { setSortOpen((o) => !o); setFilterOpen(false); setSearchOpen(false); }}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      sortOpen || sortOrder !== 'newest'
                        ? 'bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-highlight)]'
                    }`}
                    aria-label="Sort"
                  >
                    <SortAsc className="w-4 h-4" />
                  </button>
                  {sortOpen && (
                    <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-48 py-1 bg-white rounded-xl border border-[var(--color-border-default)] shadow-[var(--shadow-modal)]">
                      <button
                        type="button"
                        onClick={() => { setSortOrder('newest'); setSortOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-sm font-medium cursor-pointer ${
                          sortOrder === 'newest'
                            ? 'bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)]'
                            : 'text-[var(--color-text-primary)] hover:bg-[var(--color-surface-highlight)]'
                        }`}
                      >
                        Newest first
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSortOrder('oldest'); setSortOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-sm font-medium cursor-pointer ${
                          sortOrder === 'oldest'
                            ? 'bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)]'
                            : 'text-[var(--color-text-primary)] hover:bg-[var(--color-surface-highlight)]'
                        }`}
                      >
                        Oldest first
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Horizontal mailbox tabs */}
            <div className="flex items-stretch gap-0 -mx-1 px-1">
              {MAILBOXES.map(({ id, shortLabel, icon: Icon }) => {
                const count = mailboxCounts[id];
                const active = mailbox === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setMailbox(id); setSelectedId(null); }}
                    className={`relative flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 transition-colors cursor-pointer ${
                      active ? 'text-[var(--color-brand-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                    }`}
                  >
                    <div className="relative">
                      <Icon className="w-4 h-4" />
                      {count > 0 && (id === 'inbox' || id === 'archive' || id === 'flagged' || id === 'sent' || id === 'bin') && (
                        <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-[var(--color-brand-primary)] text-white text-[8px] font-bold flex items-center justify-center">
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] font-semibold whitespace-nowrap truncate max-w-full ${active ? 'text-[var(--color-brand-primary)]' : ''}`}>
                      {shortLabel}
                    </span>
                    {active && (
                      <span className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-[var(--color-brand-primary)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Collapsible search */}
          {searchOpen && (
            <div className="shrink-0 px-4 py-3 border-b border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  placeholder="Search sender, recipient, or subject..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-8 py-2 bg-white border border-[var(--color-border-default)] rounded-lg text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-focus)]"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Collapsible filters */}
          {filterOpen && (
            <div className="shrink-0 px-4 py-3 border-b border-[var(--color-border-default)] space-y-2.5 bg-[var(--color-surface-panel)]/50">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
                  Read status
                </label>
                <div
                  className="flex rounded-lg border border-[var(--color-border-default)] bg-white p-0.5"
                  role="group"
                  aria-label="Filter by read status"
                >
                  {READ_FILTERS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReadFilter(value)}
                      aria-pressed={readFilter === value}
                      className={`flex-1 h-7 rounded-md text-[11px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35 ${
                        readFilter === value
                          ? 'bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)] shadow-sm'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-highlight)]/60'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1">From date</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white border border-[var(--color-border-default)] rounded-lg text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-1">To date</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white border border-[var(--color-border-default)] rounded-lg text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)]"
                  />
                </div>
              </div>
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="text-xs font-semibold text-[var(--color-brand-primary)] hover:underline cursor-pointer"
                >
                  Clear dates
                </button>
              )}
              <SelectDropdown value={intentFilter} onChange={setIntentFilter} options={intentOptions} size="xs" className="w-full" />
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="w-full text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer py-1"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {/* Select all + bulk actions */}
          {filteredEmails.length > 0 && (
            <div
              className={`shrink-0 border-b border-[var(--color-border-default)] transition-colors ${
                hasSelection ? 'bg-[var(--color-brand-primary)]/[0.04]' : 'bg-[var(--color-surface-highlight)]/25'
              }`}
            >
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <label className="flex items-center gap-2.5 min-w-0 cursor-pointer rounded-md -ml-1 pl-1 pr-2 py-0.5 hover:bg-white/60 transition-colors shrink-0">
                  <input
                    type="checkbox"
                    checked={allPageChecked}
                    ref={(el) => { if (el) el.indeterminate = somePageChecked && !allPageChecked; }}
                    onChange={toggleSelectAllPage}
                    aria-label={allPageChecked ? 'Deselect all on this page' : 'Select all on this page'}
                    className="h-4 w-4 rounded border-[var(--color-brand-primary)]/35 text-[var(--color-brand-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35 cursor-pointer accent-[var(--color-brand-primary)]"
                  />
                  <span className="text-xs font-medium text-[var(--color-text-secondary)] whitespace-nowrap tabular-nums">
                    {hasSelection ? `${selectedCount} selected` : 'Select all'}
                  </span>
                </label>

                {hasSelection && (
                  <>
                    <div
                      role="toolbar"
                      aria-label={`Actions for ${selectedCount} selected email${selectedCount === 1 ? '' : 's'}`}
                      className="flex items-center gap-0.5 flex-1 min-w-0"
                    >
                      {mailbox === 'bin' ? (
                        <>
                          <BulkActionChip
                            icon={RotateCcw}
                            label="Restore"
                            onClick={() => restoreEmails([...checkedIds])}
                            variant="outline"
                            iconOnly
                          />
                          <BulkActionChip
                            icon={Trash2}
                            label="Delete forever"
                            onClick={() => setConfirmDelete({ type: 'forever', ids: [...checkedIds] })}
                            variant="delete"
                            iconOnly
                          />
                        </>
                      ) : (
                        <>
                          {mailbox === 'archive' ? (
                            <BulkActionChip
                              icon={Inbox}
                              label="Restore to inbox"
                              onClick={handleUnarchive}
                              variant="outline"
                              iconOnly
                            />
                          ) : (
                            <BulkActionChip
                              icon={Archive}
                              label="Archive"
                              onClick={handleArchive}
                              variant="primary"
                              iconOnly
                            />
                          )}
                          <BulkActionChip
                            icon={Flag}
                            label="Flag"
                            onClick={flagSelected}
                            variant="soft"
                            iconOnly
                          />
                          <BulkActionChip
                            icon={MailOpen}
                            label="Mark as read"
                            onClick={() => markEmailsRead([...checkedIds], true)}
                            variant="default"
                            iconOnly
                          />
                          <BulkActionChip
                            icon={Mail}
                            label="Mark as unread"
                            onClick={() => markEmailsRead([...checkedIds], false)}
                            variant="default"
                            iconOnly
                          />
                          <BulkActionChip
                            icon={Trash2}
                            label="Delete"
                            onClick={() => deleteEmails([...checkedIds])}
                            variant="delete"
                            iconOnly
                          />
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={clearSelection}
                      aria-label="Clear selection"
                      title="Clear selection"
                      className="inline-flex items-center justify-center h-7 w-7 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-white/80 transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Mailbox notices */}
          {mailbox === 'flagged' && (
            <div
              role="status"
              className="shrink-0 flex items-center gap-2.5 px-4 py-2 border-b border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/60"
            >
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-red-50 shrink-0" aria-hidden="true">
                <Flag className="w-3 h-3 text-red-500 fill-red-500" />
              </span>
              <p className="flex-1 min-w-0 text-[11px] leading-snug text-[var(--color-text-secondary)]">
                No template match, refunds, or emails you flagged.
              </p>
            </div>
          )}
          {mailbox === 'bin' && mailboxCounts.bin > 0 && (
            <div
              role="status"
              className="shrink-0 flex items-center gap-2.5 px-4 py-2 border-b border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/60"
            >
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-[var(--color-surface-highlight)] shrink-0" aria-hidden="true">
                <Trash2 className="w-3 h-3 text-[var(--color-text-secondary)]" />
              </span>
              <p className="flex-1 min-w-0 text-[11px] leading-snug text-[var(--color-text-secondary)]">
                Empty bin to remove forever
              </p>
              <button
                type="button"
                onClick={() => setConfirmDelete({ type: 'empty' })}
                className="shrink-0 inline-flex items-center h-7 px-2.5 rounded-lg text-[11px] font-semibold text-red-700 border border-red-200 bg-white hover:bg-red-50 hover:border-red-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/35"
              >
                Empty bin
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0">
            {listLoading ? (
              <EmailListSkeleton rows={10} />
            ) : filteredEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                {mailbox === 'bin' ? (
                  <>
                    <Trash2 className="w-10 h-10 text-[var(--color-text-muted)] mb-3 opacity-40" />
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">Bin is empty</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-[220px]">
                      Deleted emails appear here. Use Delete on any message to move it to the Bin.
                    </p>
                  </>
                ) : (
                  <>
                    <Mail className="w-10 h-10 text-[var(--color-text-muted)] mb-3 opacity-40" />
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">No emails here</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">Try another mailbox or inbox filter.</p>
                  </>
                )}
              </div>
            ) : (
              listGroups.map(({ dateLabel, intentGroups }) => (
                <section key={dateLabel}>
                  <div className="sticky top-0 z-20 px-4 py-1.5 bg-white/95 backdrop-blur-sm border-b border-[var(--color-border-default)] shadow-[inset_0_-1px_0_0_var(--color-brand-primary)]/20">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand-primary)]/75">{dateLabel}</p>
                  </div>
                  {intentGroups.map(({ intent, items }) => (
                    <div key={`${dateLabel}-${intent}`}>
                      <div className="sticky top-[26px] z-10 flex items-center justify-between gap-2 px-4 py-0.5 bg-white border-b border-[var(--color-border-default)]">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                          {intent}
                        </p>
                        <span className="text-[10px] font-medium tabular-nums text-[var(--color-text-muted)]">
                          {items.length}
                        </span>
                      </div>
                      {items.map((email) => (
                        <EmailListItem
                          key={email.id}
                          email={email}
                          selected={selectedId === email.id}
                          checked={checkedIds.has(email.id)}
                          onClick={() => handleSelect(email)}
                          onCheck={() => toggleCheck(email.id)}
                        />
                      ))}
                    </div>
                  ))}
                </section>
              ))
            )}
          </div>

          {/* Pagination */}
          {filteredEmails.length > 0 && (
            <div className="shrink-0 border-t border-[var(--color-border-default)] px-3 py-2 flex items-center justify-between bg-white">
              <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
                {pageStart}–{pageEnd} of {filteredEmails.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-highlight)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold text-[var(--color-text-primary)] px-1">
                  {currentPage}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-highlight)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Reading pane ── */}
        <div className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 min-h-0 bg-white md:border-l md:border-[var(--color-border-default)]`}>
          {!selectedEmail ? (
            <div className="flex-1 flex flex-col p-8">
              {hasSelection ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto">
                  <div className="w-full rounded-xl border border-[var(--color-border-default)] bg-white p-6 space-y-4 shadow-sm">
                    <div className="inline-flex items-center justify-center h-10 px-4 rounded-full bg-[var(--color-brand-primary)]/10 text-sm font-bold text-[var(--color-brand-primary)] tabular-nums">
                      {selectedCount} selected
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Choose an action for the selected messages.
                    </p>
                    <div
                      role="toolbar"
                      aria-label={`Actions for ${selectedCount} selected email${selectedCount === 1 ? '' : 's'}`}
                      className="flex flex-col gap-2"
                    >
                      {mailbox === 'bin' ? (
                        <>
                          <BulkActionChip
                            icon={RotateCcw}
                            label="Restore from bin"
                            onClick={() => restoreEmails([...checkedIds])}
                            variant="primary"
                            fullWidth
                          />
                          <BulkActionChip
                            icon={Trash2}
                            label="Delete forever"
                            onClick={() => setConfirmDelete({ type: 'forever', ids: [...checkedIds] })}
                            variant="delete"
                            fullWidth
                          />
                        </>
                      ) : mailbox === 'archive' ? (
                        <BulkActionChip
                          icon={Inbox}
                          label="Restore to inbox"
                          onClick={handleUnarchive}
                          variant="outline"
                          fullWidth
                        />
                      ) : (
                        <>
                          <BulkActionChip
                            icon={Archive}
                            label="Archive"
                            onClick={handleArchive}
                            variant="primary"
                            fullWidth
                          />
                          <BulkActionChip
                            icon={Flag}
                            label="Flag for review"
                            onClick={flagSelected}
                            variant="soft"
                            fullWidth
                          />
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <BulkActionChip
                              icon={MailOpen}
                              label="Mark read"
                              onClick={() => markEmailsRead([...checkedIds], true)}
                              variant="default"
                              fullWidth
                            />
                            <BulkActionChip
                              icon={Mail}
                              label="Mark unread"
                              onClick={() => markEmailsRead([...checkedIds], false)}
                              variant="default"
                              fullWidth
                            />
                          </div>
                          <BulkActionChip
                            icon={Trash2}
                            label="Move to bin"
                            onClick={() => deleteEmails([...checkedIds])}
                            variant="delete"
                            fullWidth
                          />
                        </>
                      )}
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="mt-1 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35 rounded-md px-2 py-1"
                      >
                        Clear selection
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface-highlight)] flex items-center justify-center mb-4">
                    <Mail className="w-8 h-8 text-[var(--color-brand-primary)]/40" />
                  </div>
                  <p className="text-sm font-bold text-[var(--color-text-primary)]">Select an email to review</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1 max-w-xs">
                    Review the AI draft, then read the original message below. Select multiple to archive or flag in bulk.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Selected email context — compact */}
              <div className="shrink-0 px-4 py-2 border-b border-[var(--color-border-default)] bg-white">
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="mb-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--color-brand-primary)] transition-colors hover:bg-[var(--color-surface-highlight)] md:hidden"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      Back to list
                    </button>
                    <p className="text-sm font-bold leading-snug text-[var(--color-brand-primary)] truncate">
                      {selectedEmail.subject}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 truncate">
                      {selectedEmail.from} · {formatListTime(selectedEmail.receivedAt)}
                    </p>
                  </div>
                  <div
                    role="toolbar"
                    aria-label="Email actions"
                    className="flex items-center gap-0.5 shrink-0"
                  >
                    {selectedEmail.deleted ? (
                      <>
                        <BulkActionChip
                          icon={RotateCcw}
                          label="Restore"
                          onClick={() => restoreEmails([selectedEmail.id])}
                          variant="outline"
                          iconOnly
                        />
                        <BulkActionChip
                          icon={Trash2}
                          label="Delete forever"
                          onClick={() => setConfirmDelete({ type: 'forever', ids: [selectedEmail.id] })}
                          variant="delete"
                          iconOnly
                        />
                      </>
                    ) : (
                      <>
                        <BulkActionChip
                          icon={Flag}
                          label={selectedEmail.flagged ? 'Unflag' : 'Flag'}
                          onClick={() => toggleFlagEmail(selectedEmail.id)}
                          variant={selectedEmail.flagged ? 'danger' : 'soft'}
                          active={selectedEmail.flagged}
                          iconClass={selectedEmail.flagged ? 'fill-red-700' : ''}
                          iconOnly
                        />
                        <BulkActionChip
                          icon={selectedEmail.read ? Mail : MailOpen}
                          label={selectedEmail.read ? 'Mark as unread' : 'Mark as read'}
                          onClick={() => markEmailsRead([selectedEmail.id], !selectedEmail.read)}
                          variant="default"
                          active={!selectedEmail.read}
                          iconOnly
                        />
                        {archivedIds.has(selectedEmail.id) ? (
                          <BulkActionChip
                            icon={Inbox}
                            label="Restore to inbox"
                            onClick={() => unarchiveEmails([selectedEmail.id])}
                            variant="outline"
                            iconOnly
                          />
                        ) : (
                          <BulkActionChip
                            icon={Archive}
                            label="Archive"
                            onClick={() => archiveEmails([selectedEmail.id])}
                            variant="primary"
                            iconOnly
                          />
                        )}
                        <BulkActionChip
                          icon={Trash2}
                          label="Delete"
                          onClick={() => deleteEmails([selectedEmail.id])}
                          variant="delete"
                          iconOnly
                        />
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <IntentBadge intent={selectedEmail.intent} confidence={selectedEmail.intentConfidence} />
                  {selectedEmail.flagged && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700">
                      <Flag className="w-2.5 h-2.5 fill-red-700" />
                      Flagged
                    </span>
                  )}
                  {selectedEmail.urgent && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Urgent
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4 bg-[var(--color-surface-bg)]">
                {selectedEmail.deleted && (
                  <div className="rounded-lg border border-red-200 bg-red-50/80 px-4 py-2.5 text-xs text-red-800">
                    This email is in the Bin. Restore it to reply, or delete forever to remove it from this dashboard.
                  </div>
                )}

                {/* AI Generated Response */}
                <section>
                  <div className={`rounded-xl border border-[var(--color-border-default)] bg-white shadow-sm overflow-hidden ${selectedEmail.deleted ? 'opacity-60 pointer-events-none' : ''}`}>
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--color-border-default)]/70">
                      <div className="flex items-center gap-2 min-w-0">
                        {selectedDraftPending ? (
                          <span className="inline-flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-md bg-[#edf4fc] text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand-primary)]">
                            <Sparkles className="w-3 h-3 animate-pulse" style={{ animationDuration: '1.6s' }} />
                            Creating reply draft
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-md bg-[var(--color-surface-highlight)] text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand-primary)]">
                            <Sparkles className="w-3 h-3" />
                            Reply draft ready
                          </span>
                        )}
                        {selectedEmail.draftStatus === 'Sent' && (
                          <span className="text-[10px] font-medium text-[var(--color-text-muted)]">Sent</span>
                        )}
                      </div>
                      {selectedEmail.draftStatus !== 'Sent' && !selectedDraftPending && (
                        <div className="flex items-center gap-2 shrink-0">
                          {!isEditingDraft ? (
                            <button
                              type="button"
                              onClick={() => setIsEditingDraft(true)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-primary)] hover:underline cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              Edit
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={handleCancelDraft}
                              className="text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="px-4 py-4 bg-[var(--color-surface-bg)]/40">
                      {selectedDraftPending ? (
                        <DraftCreatingPanel subject={selectedEmail.subject} />
                      ) : selectedEmail.draftStatus === 'Sent' || !isEditingDraft ? (
                        <div className="rounded-lg bg-white px-4 py-3.5 text-sm text-[var(--color-text-primary)] min-h-[120px] border border-[var(--color-border-default)]/60">
                          <DraftBodyDisplay
                            body={getDraftForEmail(selectedEmail)}
                            inboxTitle={resolveInboxTitle(inboxes, selectedEmail.inbox)}
                          />
                        </div>
                      ) : (
                        <textarea
                          value={getDraftForEmail(selectedEmail)}
                          onChange={(e) => setDraftEdits((prev) => ({ ...prev, [selectedEmail.id]: e.target.value }))}
                          rows={10}
                          className="w-full rounded-lg border border-[var(--color-border-default)] bg-white px-4 py-3.5 text-sm text-[var(--color-text-primary)] leading-relaxed font-sans resize-none focus:outline-none focus:border-[var(--color-brand-primary)]/30 focus:ring-2 focus:ring-[var(--color-brand-primary)]/10 min-h-[120px]"
                        />
                      )}
                    </div>

                    {selectedEmail.draftStatus !== 'Sent' && !selectedDraftPending && (
                      <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-[var(--color-border-default)]/70 bg-white">
                        <p className="text-[11px] text-[var(--color-text-muted)] truncate min-w-0">
                          From <span className="font-medium text-[var(--color-text-secondary)]">{selectedEmail.inbox}</span>
                          <span className="mx-1.5 text-[var(--color-border-default)]">·</span>
                          Opens with Hi {getFirstName(selectedEmail.from)}
                        </p>
                        <button
                          type="button"
                          onClick={handleSend}
                          disabled={selectedEmail.flagged && !selectedEmail.templateUsed}
                          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        >
                          <Send className="w-4 h-4" />
                          Send
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                <hr className="border-[var(--color-border-default)]" />

                {/* Original email — below, per wireframe */}
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">Original email</h3>
                  <div className="text-[11px] text-[var(--color-text-secondary)] space-y-0.5 mb-2">
                    <p><span className="font-semibold text-[var(--color-text-primary)]">From:</span> {selectedEmail.from} &lt;{selectedEmail.fromEmail}&gt;</p>
                    <p><span className="font-semibold text-[var(--color-text-primary)]">To:</span> {selectedEmail.inbox}</p>
                    <p><span className="font-semibold text-[var(--color-text-primary)]">Received:</span> {formatDetailTime(selectedEmail.receivedAt)}</p>
                  </div>
                  <div className="text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
                    {selectedEmail.body}
                  </div>
                  {selectedEmail.templateUsed && (
                    <p className="mt-4 text-xs text-[var(--color-text-muted)]">
                      Matched template: <span className="font-semibold text-[var(--color-text-primary)]">{selectedEmail.templateUsed}</span>
                    </p>
                  )}
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
        </>
        )}
    </div>

      {/* Destructive-action confirmation (Gmail-style: deletion is forever) */}
      <Modal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        confirm
        title={confirmDelete?.type === 'empty' ? 'Empty bin' : 'Delete forever'}
        footer={
          <>
            <button
              onClick={() => setConfirmDelete(null)}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-medium text-[var(--color-text-primary)] hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmedDelete}
              className="px-4 py-2 text-white text-sm font-semibold rounded-md bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors shadow-sm cursor-pointer"
            >
              {confirmDelete?.type === 'empty' ? 'Empty bin' : 'Delete forever'}
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <p>
            {confirmDelete?.type === 'empty'
              ? `Permanently delete all ${mailboxCounts.bin} email${mailboxCounts.bin === 1 ? '' : 's'} in the Bin?`
              : `Permanently delete ${confirmDelete?.ids?.length === 1 ? 'this email' : `these ${confirmDelete?.ids?.length} emails`}?`}
          </p>
          <p>
            This only removes them from this dashboard. The original messages stay in Gmail.
            This action cannot be undone here.
          </p>
        </div>
      </Modal>
    </div>
  );
}
