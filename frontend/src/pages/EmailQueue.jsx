import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Flag, Send, AlertTriangle, Inbox,
  ChevronLeft, ChevronRight, Mail, MailOpen, Sparkles, SlidersHorizontal,
  SortAsc, Archive, X, Pencil, Trash2, RotateCcw
} from 'lucide-react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { getEmails, getInboxes, patchEmail, sendEmail, bulkPatchEmails, deleteEmailForever, emptyBin, loadWithCache } from '../utils/pilot2Api';
import { Toast, useToast, SelectDropdown, Modal } from '../components/ui';
import PageHeader from '../components/layout/PageHeader';

const PAGE_SIZE = 10;
const SIGNATURE = 'Kind regards,\nPower Music Team';

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

function buildDraft(email) {
  // The AI-composed draft comes from the backend; fall back to a plain
  // acknowledgement only if a draft is somehow missing.
  if (email.draftBody) return email.draftBody;
  return `Hi ${getFirstName(email.from)},\n\nThank you for your message. A member of our team will review your enquiry and respond shortly.\n\n${SIGNATURE}`;
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
    if (!dateMap.has(dateLabel)) dateMap.set(dateLabel, new Map());
    const intentMap = dateMap.get(dateLabel);
    if (!intentMap.has(email.intent)) intentMap.set(email.intent, []);
    intentMap.get(email.intent).push(email);
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
      danger: 'text-red-600 hover:bg-red-50 hover:text-red-700',
      dangerSolid: 'text-red-600 hover:bg-red-50 hover:text-red-700',
    };
    const activeVariants = {
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
          className={`inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35 disabled:opacity-40 disabled:cursor-not-allowed ${active ? activeCls : idle}`}
        >
          <Icon className={`w-4 h-4 ${iconClass}`} aria-hidden="true" />
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-[calc(100%+4px)] z-40 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 scale-95 transition-all duration-100 group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100"
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
  const sortRef = useRef(null);

  // Load emails and inboxes: cached copy renders instantly, then fresh data
  // replaces it. Refreshes on window focus and every 30s so changes made in
  // Gmail (or another tab) show up without a manual reload.
  const applyEmails = useCallback((emailRows) => {
    setEmails(emailRows.map((e) => ({ ...e, read: Boolean(e.read) })));
    setArchivedIds(new Set(emailRows.filter((e) => e.archived).map((e) => e.id)));
  }, []);

  const applyInboxes = useCallback((inboxRows) => {
    const connected = inboxRows.filter((i) => i.status === 'Connected');
    setInboxes(connected.length > 0 ? connected : inboxRows);
    setInboxFilter((prev) => prev || (connected[0] ?? inboxRows[0])?.email || '');
  }, []);

  // In-flight mutation counter. Background refreshes are skipped while a
  // change is being saved, otherwise a stale fetch racing the save would
  // briefly revert the optimistic UI (looked like "archive doesn't work").
  const pendingRef = useRef(0);
  const cancelledRef = useRef(false);

  const revalidate = useCallback(() => {
    loadWithCache('emails', getEmails, (rows) => {
      if (!cancelledRef.current && pendingRef.current === 0) applyEmails(rows);
    }).catch(() => {});
  }, [applyEmails]);

  // Wrap every write call: pause refreshes while saving, then re-sync state
  // and cache from the server as soon as the last save lands.
  const track = useCallback(async (promise) => {
    pendingRef.current += 1;
    try {
      return await promise;
    } finally {
      pendingRef.current -= 1;
      if (pendingRef.current === 0) setTimeout(revalidate, 250);
    }
  }, [revalidate]);

  useEffect(() => {
    cancelledRef.current = false;
    loadWithCache('emails', getEmails, (rows) => {
      if (!cancelledRef.current && pendingRef.current === 0) applyEmails(rows);
    }).catch((err) => showToast(`Could not load emails: ${err.message}`, 'error'));
    loadWithCache('inboxes', getInboxes, (rows) => {
      if (!cancelledRef.current) applyInboxes(rows);
    }).catch(() => {});

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
  const safePage = Math.min(page, totalPages);

  const paginatedEmails = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredEmails.slice(start, start + PAGE_SIZE);
  }, [filteredEmails, safePage]);

  const listGroups = useMemo(() => groupEmailsByDateAndIntent(paginatedEmails), [paginatedEmails]);

  const accountOptions = useMemo(
    () => inboxes.map((inbox) => ({
      value: inbox.email,
      label: inbox.title,
    })),
    [inboxes]
  );

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

  useEffect(() => {
    setPage(1);
    setCheckedIds(new Set());
  }, [mailbox, inboxFilter, intentFilter, readFilter, search, dateFrom, dateTo, sortOrder]);

  const hasActiveSearch = Boolean(search.trim());
  const hasActiveFilters = intentFilter !== 'All' || readFilter !== 'all' || dateFrom || dateTo;

  const clearFilters = () => {
    setIntentFilter('All');
    setReadFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const selectedEmail = emails.find((e) => e.id === selectedId) ?? null;

  const getDraftForEmail = useCallback((email) => {
    if (draftEdits[email.id] != null) return draftEdits[email.id];
    return buildDraft(email);
  }, [draftEdits]);

  const handleSelect = (email) => {
    const isNewSelection = selectedId !== email.id;
    setSelectedId(email.id);
    setIsEditingDraft(false);
    // Only auto-mark read when opening a different email (not re-clicking the same row).
    if (isNewSelection && !email.read) {
      setEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, read: true } : e))
      );
      track(patchEmail(email.id, { read: true })).catch(() => {});
    }
    if (draftEdits[email.id] == null) {
      setDraftEdits((prev) => ({ ...prev, [email.id]: buildDraft(email) }));
    }
  };

  const handleCancelDraft = () => {
    if (!selectedEmail) return;
    setDraftEdits((prev) => ({ ...prev, [selectedEmail.id]: buildDraft(selectedEmail) }));
    setIsEditingDraft(false);
  };

  const selectedCount = checkedIds.size;
  const hasSelection = selectedCount > 0;

  const archiveEmails = (ids) => {
    if (ids.length === 0) {
      showToast('Select one or more emails to archive.', 'error');
      return;
    }
    setArchivedIds((prev) => new Set([...prev, ...ids]));
    setEmails((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, archived: true } : e)));
    setCheckedIds(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    track(bulkPatchEmails(ids, { archived: true })).catch(() => {});
    showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} moved to Archive.`, 'success');
    setMailbox('archive');
  };

  const unarchiveEmails = (ids) => {
    if (ids.length === 0) return;
    setArchivedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setEmails((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, archived: false } : e)));
    setCheckedIds(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    track(bulkPatchEmails(ids, { archived: false })).catch(() => {});
    showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} restored to Inbox.`, 'success');
    setMailbox('inbox');
  };

  // ── Read / unread (bulk, one request) ──
  const markEmailsRead = async (ids, read) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const previous = emails.filter((e) => idSet.has(e.id)).map((e) => ({ id: e.id, read: e.read }));

    setEmails((prev) => prev.map((e) => (idSet.has(e.id) ? { ...e, read } : e)));

    try {
      const updated = await track(bulkPatchEmails(ids, { read }));
      if (updated?.length) {
        const byId = Object.fromEntries(updated.map((e) => [e.id, e]));
        setEmails((prev) => prev.map((e) => (
          byId[e.id] ? { ...e, read: Boolean(byId[e.id].read) } : e
        )));
      }
      showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} marked as ${read ? 'read' : 'unread'}.`, 'success');
    } catch (err) {
      setEmails((prev) => prev.map((e) => {
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
    setEmails((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, deleted: true } : e)));
    setCheckedIds(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    setMailbox('bin');
    track(bulkPatchEmails(ids, { deleted: true })).catch(() => {});
    showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} moved to Bin.`, 'success');
  };

  const restoreEmails = (ids) => {
    if (ids.length === 0) return;
    setEmails((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, deleted: false } : e)));
    setCheckedIds(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    if (mailbox === 'bin') setMailbox('inbox');
    track(bulkPatchEmails(ids, { deleted: false })).catch(() => {});
    showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} restored from Bin.`, 'success');
  };

  const handleConfirmedDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.type === 'empty') {
        const result = await track(emptyBin());
        setEmails((prev) => prev.filter((e) => !e.deleted));
        showToast(`Bin emptied — ${result.deleted} email${result.deleted === 1 ? '' : 's'} deleted forever.`, 'success');
      } else {
        await track(Promise.all(confirmDelete.ids.map((id) => deleteEmailForever(id))));
        setEmails((prev) => prev.filter((e) => !confirmDelete.ids.includes(e.id)));
        showToast(`${confirmDelete.ids.length} email${confirmDelete.ids.length > 1 ? 's' : ''} deleted forever.`, 'success');
      }
      if (selectedId && (confirmDelete.type === 'empty' || confirmDelete.ids.includes(selectedId))) {
        setSelectedId(null);
      }
      setCheckedIds(new Set());
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'error');
    } finally {
      setConfirmDelete(null);
    }
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
    setEmails((prev) =>
      prev.map((e) =>
        ids.includes(e.id)
          ? { ...e, flagged: true, draftStatus: e.draftStatus === 'Sent' ? 'Sent' : 'Flagged', flagReason: 'Manual review requested' }
          : e
      )
    );
    track(bulkPatchEmails(ids, { flagged: true })).catch(() => {});
    showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} flagged.`, 'warning');
  };

  const unflagEmails = (ids) => {
    setEmails((prev) =>
      prev.map((e) => {
        if (!ids.includes(e.id) || !e.flagged) return e;
        const nextStatus = e.draftStatus === 'Sent' ? 'Sent' : 'Draft Created';
        return { ...e, flagged: false, draftStatus: nextStatus, flagReason: undefined };
      })
    );
    track(bulkPatchEmails(ids, { flagged: false })).catch(() => {});
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
      setEmails((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      showToast(`Reply sent to ${selectedEmail.fromEmail} via Gmail.`, 'success');
      setIsEditingDraft(false);
      setMailbox('sent');
    } catch (err) {
      showToast(`Send failed: ${err.message}`, 'error');
    }
  };

  const pageStart = filteredEmails.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(safePage * PAGE_SIZE, filteredEmails.length);

  return (
    <div className="max-w-7xl mx-auto flex flex-col h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] overflow-hidden select-none">
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
        <div className="flex flex-1 min-h-0">
        {/* ── Email list (Team Inbox style) ── */}
        <div className="w-[320px] shrink-0 flex flex-col border-r border-[var(--color-border-default)] min-h-0 bg-white">
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
              <div className="grid grid-cols-2 gap-2">
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
                            variant="danger"
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
                            variant="danger"
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
            {filteredEmails.length === 0 ? (
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
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-highlight)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold text-[var(--color-text-primary)] px-1">
                  {safePage}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
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
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white border-l border-[var(--color-border-default)]">
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
                            variant="outline"
                            fullWidth
                          />
                          <BulkActionChip
                            icon={Trash2}
                            label="Delete forever"
                            onClick={() => setConfirmDelete({ type: 'forever', ids: [...checkedIds] })}
                            variant="dangerSolid"
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
                          <div className="grid grid-cols-2 gap-2">
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
                            variant="danger"
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
                          variant="danger"
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
                          variant="danger"
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
                        <span className="inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-md bg-[var(--color-surface-highlight)] text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand-primary)]">
                          <Sparkles className="w-3 h-3" />
                          Reply draft generated
                        </span>
                        {selectedEmail.draftStatus === 'Sent' && (
                          <span className="text-[10px] font-medium text-[var(--color-text-muted)]">Sent</span>
                        )}
                      </div>
                      {selectedEmail.draftStatus !== 'Sent' && (
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
                      {selectedEmail.draftStatus === 'Sent' || !isEditingDraft ? (
                        <div className="rounded-lg bg-white px-4 py-3.5 text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap min-h-[120px] border border-[var(--color-border-default)]/60">
                          {getDraftForEmail(selectedEmail)}
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

                    {selectedEmail.draftStatus !== 'Sent' && (
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
    </div>

      {/* Destructive-action confirmation (Gmail-style: deletion is forever) */}
      <Modal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
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
              className="px-4 py-2 text-white text-sm font-semibold rounded-md bg-red-600 hover:bg-red-700 transition-colors shadow-sm cursor-pointer"
            >
              {confirmDelete?.type === 'empty' ? 'Empty bin' : 'Delete forever'}
            </button>
          </>
        }
      >
        <div className="text-sm text-[var(--color-text-primary)] space-y-2">
          <p>
            {confirmDelete?.type === 'empty'
              ? `Permanently delete all ${mailboxCounts.bin} email${mailboxCounts.bin === 1 ? '' : 's'} in the Bin?`
              : `Permanently delete ${confirmDelete?.ids?.length === 1 ? 'this email' : `these ${confirmDelete?.ids?.length} emails`}?`}
          </p>
          <p className="text-[var(--color-text-secondary)]">
            This only removes them from this dashboard — the original messages stay in Gmail.
            This action cannot be undone here.
          </p>
        </div>
      </Modal>
    </div>
  );
}
