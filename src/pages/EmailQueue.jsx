import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Flag, Send, AlertTriangle, Inbox,
  ChevronLeft, ChevronRight, Mail, Sparkles, SlidersHorizontal,
  SortAsc, Archive, X, Pencil
} from 'lucide-react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { emailQueue, templates, connectedInboxes, initialArchivedEmailIds } from '../data/mockData';
import { Toast, useToast, SelectDropdown } from '../components/ui';
import PageHeader from '../components/layout/PageHeader';

const PAGE_SIZE = 10;
const SIGNATURE = 'Kind regards,\nPower Music Team';

const MAILBOXES = [
  { id: 'inbox', label: 'Inbox', shortLabel: 'Inbox', icon: Inbox },
  { id: 'urgent', label: 'Urgent', shortLabel: 'Urgent', icon: AlertTriangle },
  { id: 'flagged', label: 'Flagged', shortLabel: 'Flagged', icon: Flag },
  { id: 'archive', label: 'Archive', shortLabel: 'Archive', icon: Archive },
  { id: 'sent', label: 'Sent', shortLabel: 'Sent', icon: Send },
];
const MAILBOX_IDS = new Set(MAILBOXES.map((m) => m.id));

const INTENTS = ['All', 'Enquiry', 'Cancellation', 'Renewal', 'Partnership', 'Finance', 'Events'];

function getFirstName(from) {
  if (!from) return 'there';
  return from.split(' ')[0];
}

function buildDraft(email) {
  if (!email.templateUsed) {
    return `Hi ${getFirstName(email.from)},\n\nThank you for your message. A member of our team will review your enquiry and respond shortly.\n\n${SIGNATURE}`;
  }
  const tmpl = templates.find((t) => t.name === email.templateUsed);
  if (!tmpl) {
    return `Hi ${getFirstName(email.from)},\n\nThank you for getting in touch.\n\n${SIGNATURE}`;
  }
  return tmpl.body
    .replace(/\{\{first_name\}\}/g, getFirstName(email.from))
    .replace(/\{\{club_name\}\}/g, 'your club')
    .replace(/\{\{membership_type\}\}/g, 'membership')
    .replace(/\{\{inbox_name\}\}/g, email.inbox?.split('@')[0] ?? 'support');
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
  const meaningful = lines.find((line) => line.length > 8 && !/^hi,?$/i.test(line)) || lines.join(' ');
  return meaningful.length > 80 ? `${meaningful.slice(0, 80)}...` : meaningful;
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

function EmailListItem({ email, selected, checked, onClick, onCheck }) {
  const unread = !email.read;

  // Unread = cool blue tint + dot (attention). Selected = neutral grey + left bar (focus).
  const rowClass = selected
    ? 'bg-[#f4f5f7] shadow-[inset_3px_0_0_0_var(--color-brand-primary)]'
    : unread
      ? 'bg-[#eef5ff] hover:bg-[#e3effc]'
      : 'bg-white hover:bg-[var(--color-surface-panel)]/80';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={`w-full text-left px-4 py-3 border-b border-[var(--color-border-default)] transition-colors cursor-pointer ${rowClass}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => { e.stopPropagation(); onCheck(); }}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 h-4 w-4 rounded border-[var(--color-brand-primary)]/35 text-[var(--color-brand-primary)] focus:ring-[var(--color-brand-primary)] cursor-pointer shrink-0 accent-[var(--color-brand-primary)]"
          aria-label={`Select ${email.from}`}
        />

        <div className="flex-1 min-w-0">
          <p className={`text-sm truncate ${
            selected
              ? 'font-normal text-[var(--color-brand-primary)]'
              : unread
                ? 'font-bold text-[var(--color-text-primary)]'
                : 'font-normal text-[var(--color-text-secondary)]'
          }`}>
            {email.subject}
          </p>
          <p className={`text-xs mt-1 truncate ${
            selected
              ? 'text-[var(--color-text-secondary)]'
              : unread
                ? 'font-bold text-[var(--color-text-secondary)]'
                : 'text-[var(--color-text-muted)]'
          }`}>
            From: {email.from}
          </p>
          <p className="text-xs mt-0.5 truncate text-[var(--color-text-muted)]">
            {getPreviewLine(email.body)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0 mt-0.5 min-w-[2.5rem]">
          {unread && (
            <span
              className={`w-2 h-2 rounded-full bg-[var(--color-brand-primary)] ring-2 shrink-0 ${
                selected ? 'ring-[#f4f5f7]' : 'ring-[#eef5ff]'
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
  const [emails, setEmails] = useState(emailQueue);
  const [mailbox, setMailbox] = useState(() =>
    MAILBOX_IDS.has(mailboxFromUrl) ? mailboxFromUrl : 'inbox'
  );
  const [inboxFilter, setInboxFilter] = useState(() => connectedInboxes[0]?.email ?? '');
  const [intentFilter, setIntentFilter] = useState('All');
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
  const [archivedIds, setArchivedIds] = useState(() => new Set(initialArchivedEmailIds));
  const sortRef = useRef(null);

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

  const mailboxCounts = useMemo(() => ({
    inbox: emails.filter((e) => !archivedIds.has(e.id) && matchesMailbox(e, 'inbox')).length,
    urgent: emails.filter((e) => !archivedIds.has(e.id) && matchesMailbox(e, 'urgent')).length,
    flagged: emails.filter((e) => !archivedIds.has(e.id) && matchesMailbox(e, 'flagged')).length,
    archive: emails.filter((e) => archivedIds.has(e.id)).length,
    sent: emails.filter((e) => !archivedIds.has(e.id) && matchesMailbox(e, 'sent')).length,
  }), [emails, archivedIds]);

  const filteredEmails = useMemo(() => {
    const q = search.trim().toLowerCase();
    return emails
      .filter((email) => {
        if (mailbox === 'archive') return archivedIds.has(email.id);
        return !archivedIds.has(email.id) && matchesMailbox(email, mailbox);
      })
      .filter((email) => email.inbox === inboxFilter)
      .filter((email) => intentFilter === 'All' || email.intent === intentFilter)
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
  }, [emails, mailbox, inboxFilter, intentFilter, search, dateFrom, dateTo, sortOrder, archivedIds]);

  const totalPages = Math.max(1, Math.ceil(filteredEmails.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const paginatedEmails = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredEmails.slice(start, start + PAGE_SIZE);
  }, [filteredEmails, safePage]);

  const listGroups = useMemo(() => groupEmailsByDateAndIntent(paginatedEmails), [paginatedEmails]);

  const accountOptions = useMemo(
    () => connectedInboxes.map((inbox) => ({
      value: inbox.email,
      label: inbox.title,
    })),
    []
  );

  const selectedInbox = useMemo(
    () => connectedInboxes.find((inbox) => inbox.email === inboxFilter),
    [inboxFilter]
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

  const activeMailboxLabel = MAILBOXES.find((m) => m.id === mailbox)?.label ?? 'Inbox';

  useEffect(() => {
    setPage(1);
    setCheckedIds(new Set());
  }, [mailbox, inboxFilter, intentFilter, search, dateFrom, dateTo, sortOrder]);

  const hasActiveSearch = Boolean(search.trim());
  const hasActiveFilters = intentFilter !== 'All' || dateFrom || dateTo;

  const selectedEmail = emails.find((e) => e.id === selectedId) ?? null;

  const getDraftForEmail = useCallback((email) => {
    if (draftEdits[email.id] != null) return draftEdits[email.id];
    return buildDraft(email);
  }, [draftEdits]);

  const handleSelect = (email) => {
    setSelectedId(email.id);
    setIsEditingDraft(false);
    setEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, read: true } : e))
    );
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
    setCheckedIds(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
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
    setCheckedIds(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    showToast(`${ids.length} email${ids.length > 1 ? 's' : ''} restored to Inbox.`, 'success');
    setMailbox('inbox');
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

  const handleSend = () => {
    if (!selectedEmail) return;
    if (selectedEmail.flagged && !selectedEmail.templateUsed) {
      showToast('Resolve the flag before sending this reply.', 'error');
      return;
    }
    const now = new Date().toISOString();
    setEmails((prev) =>
      prev.map((e) =>
        e.id === selectedEmail.id
          ? { ...e, draftStatus: 'Sent', sentAt: now, flagged: false, read: true }
          : e
      )
    );
    showToast(`Reply sent to ${selectedEmail.fromEmail} via Gmail.`, 'success');
    setIsEditingDraft(false);
    setMailbox('sent');
  };

  const pageStart = filteredEmails.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(safePage * PAGE_SIZE, filteredEmails.length);

  return (
    <div className="max-w-7xl mx-auto flex flex-col h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] overflow-hidden select-none">
      <Toast />

      <PageHeader
        section="Customer service"
        title="Email Responses"
        description="Review incoming mail, edit AI drafts, and send replies from connected inboxes."
        compact
      />

      <div className="flex flex-1 min-h-0 flex-col rounded-xl border border-[var(--color-border-default)] overflow-hidden shadow-sm bg-white">
        {/* Connected account */}
        <div className="shrink-0 px-4 py-3 border-b border-[var(--color-border-default)] bg-white">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-brand-primary)]/25 bg-gradient-to-br from-[#f4f7fd] via-[#e9eff9] to-[#eef3fb] px-3.5 py-2.5 shadow-[0_1px_3px_rgba(26,26,46,0.04)]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg border border-[var(--color-brand-primary)]/15 bg-white/60 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-[var(--color-brand-primary)]" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand-primary)]/60">
                  Connected account
                </p>
                <p className="text-sm font-semibold text-[var(--color-brand-primary)] truncate">
                  {selectedInbox?.title ?? 'Account'}
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] truncate">{inboxFilter}</p>
              </div>
            </div>
            <SelectDropdown
              value={inboxFilter}
              onChange={setInboxFilter}
              options={accountOptions}
              size="xs"
              variant="soft"
              className="w-44 shrink-0"
            />
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
        {/* ── Email list (Team Inbox style) ── */}
        <div className="w-[380px] shrink-0 flex flex-col border-r border-[var(--color-border-default)] min-h-0 bg-white">
          {/* List header */}
          <div className="shrink-0 px-4 pt-4 pb-2 border-b border-[var(--color-border-default)]">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">{activeMailboxLabel}</h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setSearchOpen((o) => !o); setFilterOpen(false); setSortOpen(false); }}
                  className={`p-2 rounded-lg transition-colors cursor-pointer ${
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
                  className={`p-2 rounded-lg transition-colors cursor-pointer ${
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
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${
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
            <div className="flex items-stretch gap-0 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {MAILBOXES.map(({ id, shortLabel, icon: Icon }) => {
                const count = mailboxCounts[id];
                const active = mailbox === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setMailbox(id); setSelectedId(null); }}
                    className={`relative flex flex-col items-center justify-center gap-1 min-w-[72px] px-2 py-2 transition-colors cursor-pointer shrink-0 ${
                      active ? 'text-[var(--color-brand-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                    }`}
                  >
                    <div className="relative">
                      <Icon className="w-5 h-5" />
                      {count > 0 && (id === 'inbox' || id === 'archive' || id === 'flagged' || id === 'sent') && (
                        <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[var(--color-brand-primary)] text-white text-[9px] font-bold flex items-center justify-center">
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </div>
                    <span className={`text-[11px] font-semibold whitespace-nowrap ${active ? 'text-[var(--color-brand-primary)]' : ''}`}>
                      {shortLabel}
                    </span>
                    {active && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[var(--color-brand-primary)]" />
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

          {/* Collapsible filters (date + intent only) */}
          {filterOpen && (
            <div className="shrink-0 px-4 py-3 border-b border-[var(--color-border-default)] space-y-2 bg-[var(--color-surface-panel)]/50">
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
                  Clear date filter
                </button>
              )}
              <SelectDropdown value={intentFilter} onChange={setIntentFilter} options={intentOptions} size="xs" className="w-full" />
            </div>
          )}

          {/* Select all + bulk actions */}
          {filteredEmails.length > 0 && (
            <div className="shrink-0 border-b border-[var(--color-border-default)] bg-[var(--color-surface-highlight)]/30">
              <label className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-[var(--color-surface-highlight)]/50">
                <input
                  type="checkbox"
                  checked={allPageChecked}
                  ref={(el) => { if (el) el.indeterminate = somePageChecked && !allPageChecked; }}
                  onChange={toggleSelectAllPage}
                  className="h-4 w-4 rounded border-[var(--color-brand-primary)]/30 text-[var(--color-brand-primary)] focus:ring-[var(--color-brand-primary)] cursor-pointer accent-[var(--color-brand-primary)]"
                />
                <span className="text-sm font-semibold text-[var(--color-brand-primary)]">
                  Select all{hasSelection ? ` · ${selectedCount} selected` : ''}
                </span>
              </label>
              {hasSelection && (
                <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
                  {mailbox === 'archive' ? (
                    <button
                      type="button"
                      onClick={handleUnarchive}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-brand-primary)] bg-white border border-[var(--color-border-default)] hover:bg-[var(--color-surface-highlight-strong)] transition-colors cursor-pointer"
                    >
                      <Inbox className="w-3.5 h-3.5" />
                      Restore to inbox
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleArchive}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors cursor-pointer shadow-sm"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      Archive ({selectedCount})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={flagSelected}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-brand-primary)] bg-[var(--color-surface-highlight-strong)] hover:bg-[var(--color-surface-highlight)] transition-colors cursor-pointer"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    Flag
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0">
            {filteredEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <Mail className="w-10 h-10 text-[var(--color-text-muted)] mb-3 opacity-40" />
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">No emails here</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Try another mailbox or inbox filter.</p>
              </div>
            ) : (
              listGroups.map(({ dateLabel, intentGroups }) => (
                <section key={dateLabel}>
                  <div className="sticky top-0 z-20 px-4 py-2 bg-white/95 backdrop-blur-sm border-b border-[var(--color-border-default)] shadow-[inset_0_-1px_0_0_var(--color-brand-primary)]/20">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-brand-primary)]/75">{dateLabel}</p>
                  </div>
                  {intentGroups.map(({ intent, items }) => (
                    <div key={`${dateLabel}-${intent}`}>
                      <div className="sticky top-[36px] z-10 flex items-center justify-between gap-2 px-4 py-1 bg-white border-b border-[var(--color-border-default)]">
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
                  <div className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/50 p-6 space-y-4">
                    <p className="text-sm font-bold text-[var(--color-brand-primary)]">
                      {selectedCount} email{selectedCount > 1 ? 's' : ''} selected
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Choose an action for the selected messages.
                    </p>
                    <div className="flex flex-col gap-2">
                      {mailbox === 'archive' ? (
                        <button
                          type="button"
                          onClick={handleUnarchive}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-[var(--color-brand-primary)] bg-white border border-[var(--color-border-default)] hover:bg-[var(--color-surface-highlight)] transition-colors cursor-pointer"
                        >
                          <Inbox className="w-4 h-4" />
                          Restore to inbox
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleArchive}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors cursor-pointer shadow-sm"
                        >
                          <Archive className="w-4 h-4" />
                          Move to archive
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={flagSelected}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-[var(--color-brand-primary)] bg-[var(--color-surface-highlight-strong)] hover:bg-[var(--color-surface-highlight)] transition-colors cursor-pointer"
                      >
                        <Flag className="w-4 h-4" />
                        Flag for review
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
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              {/* Selected email context */}
              <div className="shrink-0 px-6 py-4 border-b border-[var(--color-border-default)] bg-white">
                <p className="text-base font-bold leading-snug text-[var(--color-brand-primary)]">
                  {selectedEmail.subject}
                </p>
                <p className="text-sm mt-1 text-[var(--color-text-secondary)]">
                  From: {selectedEmail.from}
                </p>
                <p className="text-sm text-[var(--color-text-muted)] mt-0.5 truncate">
                  {getPreviewLine(selectedEmail.body)}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <IntentBadge intent={selectedEmail.intent} confidence={selectedEmail.intentConfidence} />
                  {selectedEmail.flagged && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700">
                      <Flag className="w-3 h-3 fill-red-700" />
                      Flagged
                    </span>
                  )}
                  {selectedEmail.urgent && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800">
                      <AlertTriangle className="w-3 h-3" />
                      Urgent
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleFlagEmail(selectedEmail.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        selectedEmail.flagged
                          ? 'text-red-700 bg-red-50 border border-red-200 hover:bg-red-100'
                          : 'text-[var(--color-brand-primary)] bg-[var(--color-surface-highlight-strong)] hover:bg-[var(--color-surface-highlight)]'
                      }`}
                    >
                      <Flag className={`w-3.5 h-3.5 ${selectedEmail.flagged ? 'fill-red-700' : ''}`} />
                      {selectedEmail.flagged ? 'Unflag' : 'Flag'}
                    </button>
                    {archivedIds.has(selectedEmail.id) ? (
                      <button
                        type="button"
                        onClick={() => unarchiveEmails([selectedEmail.id])}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-brand-primary)] bg-[var(--color-surface-highlight-strong)] hover:bg-[var(--color-surface-highlight)] transition-colors cursor-pointer"
                      >
                        <Inbox className="w-3.5 h-3.5" />
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => archiveEmails([selectedEmail.id])}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors cursor-pointer shadow-sm"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 px-6 py-5 space-y-6 bg-[var(--color-surface-bg)]">
                {/* AI Generated Response */}
                <section>
                  <div className="rounded-xl border border-[var(--color-border-default)] bg-white shadow-sm overflow-hidden">
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
                  <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-4">Original email</h3>
                  <div className="text-xs text-[var(--color-text-secondary)] space-y-1 mb-4">
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
    </div>
  );
}
