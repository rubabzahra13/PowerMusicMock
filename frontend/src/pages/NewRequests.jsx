import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, Plus, SortAsc, ChevronDown, Filter, Eye, Trash2
} from 'lucide-react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { DataTable, Tag, Modal, Toast, useToast, SelectDropdown, StackedTextCell, TruncateCell, EMPTY_CELL, CountTabs } from '../components/ui';
import RequestComparison from '../components/RequestComparison';
import PageHeader from '../components/layout/PageHeader';
import { adminPageScrollClass } from '../utils/responsiveLayout';
import { getManagerColumnContent, getManagerDisplayName, isManualEntry } from '../utils/manualEntry';
import { loadWithCache, patchCache, writeCache, refreshCache, getNewRequestsPage } from '../utils/pilot2Api';
import { fetchJson } from '../utils/api';
import { useRealtimeBroadcast } from '../hooks/useRealtimeBroadcast';
import {
  markDirectoryPersonHighlight,
  isRequestUnseen,
  markRequestViewed,
  removeRequestHighlight,
  registerNewRequestsPageVisit,
  flushViewedRequestHighlights,
  recordNewRequestsPageDeparted,
  syncAdminNewRequestHighlights,
  ADMIN_NEW_ROW_HIGHLIGHT_CLASS,
} from '../utils/adminUiHighlights';
import { useAuth } from '../context/AuthContext';
import { formatRequestDisplayId } from '../utils/requestDisplayId';
import { formatManagerNotes, readManagerNotes } from '../utils/managerNotes';

const REQUESTS_POLL_MS = 10000;
import { TAG_ALREADY_EXISTS, requestTagVariant, sentViaTableRequestTags, requestTagLabel, isAwaitingManagerSubmission, directoryStatusTag } from '../utils/requestTags';
import { MAX_MANAGER_PERSON_ROWS } from '../utils/managerFormDraft';
import { formGridClass } from '../utils/responsiveLayout';
import {
  PERSON_FIELD_LIMITS,
  sanitizePersonFieldInput,
  validatePersonForms,
  firstInvalidPersonField,
} from '../utils/managerFormValidation';

const SORT_PRESETS = [
  { value: 'displayId-desc', label: 'ID (newest first)' },
  { value: 'displayId-asc', label: 'ID (oldest first)' },
  { value: 'receivedAt-desc', label: 'Received (newest first)' },
  { value: 'receivedAt-asc', label: 'Received (oldest first)' },
  { value: 'personName-asc', label: 'Person name (A–Z)' },
  { value: 'personName-desc', label: 'Person name (Z–A)' },
  { value: 'managerName-asc', label: 'Manager name (A–Z)' },
  { value: 'managerName-desc', label: 'Manager name (Z–A)' },
  { value: 'location-asc', label: 'Location (A–Z)' },
  { value: 'location-desc', label: 'Location (Z–A)' },
  { value: 'club-asc', label: 'Manager club (A–Z)' },
  { value: 'club-desc', label: 'Manager club (Z–A)' }
];

const DEFAULT_SORT = 'displayId-desc';

function parseSortPreset(preset) {
  const match = preset.match(/^(.+)-(asc|desc)$/);
  if (!match) return { field: 'displayId', dir: 'asc' };
  return { field: match[1], dir: match[2] };
}

// ─── Shared Controls Bar ──────────────────────────────────────────────────────
function ControlsBar({
  searchQuery, setSearchQuery,
  filterOpen, setFilterOpen,
  filterSlots,
  sortPreset, setSortPreset,
  activeFilterCount
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef(null);
  const isSortCustom = sortPreset !== DEFAULT_SORT;
  const activeSortLabel = SORT_PRESETS.find((o) => o.value === sortPreset)?.label ?? 'Sort';

  useEffect(() => {
    if (!sortOpen) return;
    const onClickOutside = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [sortOpen]);

  const toolbarBtnClass = (active) =>
    `flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
      active
        ? 'bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)] shadow-sm ring-1 ring-[rgba(26,26,46,0.06)]'
        : 'text-[var(--color-text-secondary)] hover:bg-white hover:text-[var(--color-text-primary)]'
    }`;

  return (
    <div className="w-full rounded-2xl border border-[var(--color-border-default)] bg-white shadow-[var(--shadow-card)]">
      <div
        className={`bg-[var(--color-surface-panel)] ${
          filterOpen ? 'border-b border-[var(--color-border-default)] rounded-t-2xl' : 'rounded-2xl'
        }`}
      >
        <div className="flex flex-col md:flex-row items-stretch gap-2 p-2">
          <div className="flex items-center gap-2.5 px-3 py-2 flex-1 bg-white rounded-xl border border-[var(--color-border-default)] shadow-sm focus-within:ring-2 focus-within:ring-[rgba(26,26,46,0.08)] focus-within:border-transparent transition-shadow">
          <Search className="h-4 w-4 text-[var(--color-text-muted)] shrink-0" />
          <input
            type="text"
            placeholder="Search name, email or club..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-xs leading-none cursor-pointer">✕</button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => { setFilterOpen((o) => !o); setSortOpen(false); }}
            className={toolbarBtnClass(filterOpen || activeFilterCount > 0)}
          >
            <Filter className="h-4 w-4" />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="ml-0.5 bg-[var(--color-brand-primary)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
          </button>

          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setSortOpen((o) => !o)}
              className={toolbarBtnClass(sortOpen || isSortCustom)}
            >
              <SortAsc className="h-4 w-4" />
              <span className="max-w-[120px] truncate">{isSortCustom ? activeSortLabel : 'Sort'}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
            </button>

            {sortOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 max-h-72 overflow-y-auto py-1 bg-white rounded-xl border border-[var(--color-border-default)] shadow-[var(--shadow-modal)]">
                {SORT_PRESETS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setSortPreset(opt.value); setSortOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      sortPreset === opt.value
                        ? 'bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)]'
                        : 'text-[var(--color-text-primary)] hover:bg-[var(--color-surface-highlight)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                {isSortCustom && (
                  <>
                    <div className="my-1 h-px bg-[var(--color-border-default)]" />
                    <button
                      type="button"
                      onClick={() => { setSortPreset(DEFAULT_SORT); setSortOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-brand-accent)] transition-colors cursor-pointer"
                    >
                      Reset sort
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {filterOpen && (
        <div className="bg-[var(--color-surface-highlight)]/50 px-4 py-4 rounded-b-2xl">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            {filterSlots.map((slot) => (
              <div key={slot.label} className="flex flex-col gap-1 min-w-[140px]">
                <label className="text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  {slot.label}
                </label>
                <SelectDropdown
                  value={slot.value}
                  onChange={slot.onChange}
                  options={slot.options}
                  size="sm"
                  className="w-full"
                />
              </div>
            ))}
            {activeFilterCount > 0 && (
              <button
                onClick={() => filterSlots.forEach((s) => s.onChange(s.options[0].value))}
                className="ml-auto text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-brand-accent)] transition-colors cursor-pointer pb-2"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Timestamp formatter ───────────────────────────────────────────────────────
function formatTimestamp(iso) {
  try {
    const d = parseISO(iso);
    return { date: format(d, 'dd MMM yyyy'), time: format(d, 'hh:mm a') };
  } catch { return { date: iso, time: '' }; }
}

// ─── Shared 11-column table cell renderers ────────────────────────────────────
const TimestampCell = ({ val }) => {
  const { date, time } = formatTimestamp(val);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">{date}</span>
      <span className="text-xs text-[var(--color-text-muted)]">{time}</span>
    </div>
  );
};

function NewRequestsMobileList({
  rows,
  loading,
  emptyMessage,
  onOpenRequest,
  onMarkAs,
  getRowClassName,
  directory,
}) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-md border border-[var(--color-border-default)] bg-white sm:hidden">
        <ul className="divide-y divide-[var(--color-border-default)]">
          {Array.from({ length: 4 }).map((_, index) => (
            <li key={index} className="space-y-2 px-4 py-3">
              <div className="h-3.5 w-20 animate-pulse rounded bg-[var(--color-surface-highlight)]" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--color-surface-highlight)]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-surface-highlight)]" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-md border border-[var(--color-border-default)] bg-white px-4 py-8 text-center text-sm text-[var(--color-text-secondary)] sm:hidden">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ul className="overflow-hidden rounded-md border border-[var(--color-border-default)] bg-white sm:hidden">
      {rows.map((row) => {
        const extraClass = getRowClassName ? getRowClassName(row) : '';
        const name = `${row.person.firstName} ${row.person.lastName}`.trim();
        const manager = getManagerColumnContent(row);
        const isAdd = row.action === 'Add';
        const sentViaTags = sentViaTableRequestTags(row.tags || []);
        const directoryStatus = directoryStatusTag(row);

        return (
          <li key={row.id} className="border-b border-[var(--color-border-default)] last:border-b-0">
            <div className={`px-4 py-3 ${extraClass}`}>
              <button
                type="button"
                onClick={() => onOpenRequest(row)}
                className="flex w-full flex-col gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-brand-primary)]/35"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold tabular-nums text-[var(--color-text-muted)]">
                        {formatRequestDisplayId(row.displayId)}
                      </span>
                      <Tag variant={isAdd ? 'add-action' : 'remove-action'} label={row.action} compact />
                      <Tag
                        variant={directoryStatus.variant}
                        label={directoryStatus.label}
                        prefix={directoryStatus.prefix}
                        compact
                      />
                      {sentViaTags.map((tag) => (
                        <Tag key={tag} variant={requestTagVariant(tag)} label={requestTagLabel(tag)} compact />
                      ))}
                    </div>

                    <TimestampCell val={row.receivedAt} />

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{name}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">{row.person.email}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
                        {row.person.location || EMPTY_CELL}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                        Manager
                      </p>
                      <p
                        className={`mt-0.5 truncate text-xs font-semibold ${
                          manager.muted
                            ? 'italic text-[var(--color-text-muted)]'
                            : 'text-[var(--color-text-primary)]'
                        }`}
                      >
                        {manager.primary || EMPTY_CELL}
                      </p>
                      {manager.secondary ? (
                        <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-secondary)]">
                          {manager.secondary}
                        </p>
                      ) : null}
                      {manager.tertiary ? (
                        <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
                          {manager.tertiary}
                        </p>
                      ) : null}
                    </div>

                    <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                      <span className="font-semibold text-[var(--color-text-muted)]">Manager notes: </span>
                      <span className={readManagerNotes(row) ? '' : 'text-[var(--color-text-muted)]'}>
                        {formatManagerNotes(row)}
                      </span>
                    </p>
                  </div>
                  <Eye className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
                </div>
              </button>

              <div className="mt-2 border-t border-[var(--color-border-default)]/70 pt-2">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Needs review
                </p>
                <RequestComparison
                  intakeMatch={row.intakeMatch}
                  directoryMatch={row.directoryMatch}
                  directory={directory}
                  requestPerson={row.person}
                  variant="table"
                  onViewDetails={() => onOpenRequest(row)}
                />
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onOpenRequest(row)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-highlight)]"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  View
                </button>
                <button
                  type="button"
                  onClick={() => onMarkAs(row)}
                  className={`min-w-[4.75rem] rounded-md border px-3 py-1.5 text-center text-xs font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all active:translate-y-px active:shadow-none ${
                    isAdd
                      ? 'border-[#15803d] bg-[#16a34a] hover:bg-[#15803d]'
                      : 'border-[#b91c1c] bg-[#dc2626] hover:bg-[#b91c1c]'
                  }`}
                >
                  {isAdd ? 'Added' : 'Removed'}
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const matchesDateFilter = (iso, filterDate) => {
  if (filterDate === 'All') return true;
  try {
    const d = parseISO(iso);
    if (filterDate === 'Today') return isToday(d);
    if (filterDate === 'Yesterday') return isYesterday(d);
    if (filterDate === 'Older') return !isToday(d) && !isYesterday(d);
  } catch {
    return true;
  }
  return true;
};

const buildFilterOptions = (values) => [
  { value: 'All', label: 'All' },
  ...values.map((v) => ({ value: v, label: v }))
];

const emptyPersonForm = () => ({
  id: `person-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  firstName: '',
  lastName: '',
  email: '',
  location: '',
  notes: '',
});

const emptyManagerForm = () => ({
  firstName: '',
  lastName: '',
  email: '',
  club: ''
});

// ─── Page Component ───────────────────────────────────────────────────────────
export default function Requests() {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkRequestId = searchParams.get('id');
  const consumedDeepLinkRef = useRef(null);
  const adminDisplayName = profile?.full_name?.trim() || 'Power Music Admin';

  // ── Action tab (Add / Remove) ──
  const [actionTab, setActionTab] = useState('All');

  // ── New requests data ──
  const [newRequests, setNewRequests] = useState([]);
  const [liveDirectory, setLiveDirectory] = useState([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [highlightVersion, setHighlightVersion] = useState(0);

  const bumpHighlights = () => setHighlightVersion((v) => v + 1);

  const getRequestRowClassName = useCallback(
    (row) => (isRequestUnseen(row.id) ? ADMIN_NEW_ROW_HIGHLIGHT_CLASS : ''),
    [highlightVersion],
  );

  const handleOpenRequest = (row) => {
    markRequestViewed(row.id);
    bumpHighlights();
    navigate(`/new-requests/${encodeURIComponent(row.id)}`);
  };

  useEffect(() => {
    registerNewRequestsPageVisit(location.key);
    bumpHighlights();
  }, [location.key]);

  useEffect(() => {
    if (!deepLinkRequestId) return;
    if (consumedDeepLinkRef.current === deepLinkRequestId) return;
    consumedDeepLinkRef.current = deepLinkRequestId;
    setSearchParams({}, { replace: true });
    navigate(`/new-requests/${encodeURIComponent(deepLinkRequestId)}`, { replace: true });
  }, [deepLinkRequestId, navigate, setSearchParams]);

  const applyRequestsPage = useCallback((data, isStale) => {
    if (Array.isArray(data.requests)) {
      setNewRequests(data.requests);
      setLiveDirectory(data.persons);
      setTableLoading(false);
      if (!isStale) {
        const changed = syncAdminNewRequestHighlights(data.requests, { isManualEntry });
        if (changed) bumpHighlights();
      }
    }
  }, []);

  const refreshRequestsPage = useCallback((options = {}) => {
    const { networkOnly = false } = options;
    const fetcher = getNewRequestsPage;
    if (networkOnly) {
      return refreshCache('requests_page', fetcher, applyRequestsPage).catch((err) => {
        console.error(err);
        setTableLoading(false);
      });
    }
    return loadWithCache('requests_page', fetcher, applyRequestsPage).catch((err) => {
      console.error(err);
      setTableLoading(false);
    });
  }, [applyRequestsPage]);

  useEffect(() => {
    refreshRequestsPage();
    const refresh = () => {
      if (!document.hidden) refreshRequestsPage({ networkOnly: true });
    };
    window.addEventListener('focus', refresh);
    const poll = window.setInterval(refresh, REQUESTS_POLL_MS);
    return () => {
      window.removeEventListener('focus', refresh);
      window.clearInterval(poll);
    };
  }, [refreshRequestsPage]);

  useRealtimeBroadcast('requests-changed', () => {
    refreshRequestsPage({ networkOnly: true });
  });

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        recordNewRequestsPageDeparted();
        flushViewedRequestHighlights();
        bumpHighlights();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      recordNewRequestsPageDeparted();
    };
  }, []);

  // ── Filter / Sort states ──
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('All');
  const [filterLocation, setFilterLocation] = useState('All');
  const [filterClub, setFilterClub] = useState('All');
  const [filterAlreadyExists, setFilterAlreadyExists] = useState('All');
  const [sortPreset, setSortPreset] = useState(DEFAULT_SORT);
  const [filterOpen, setFilterOpen] = useState(true);

  // ── Drawer / Modal states ──
  const [confirmActionRequest, setConfirmActionRequest] = useState(null);
  const [showAddManualModal, setShowAddManualModal] = useState(false);

  // ── Manual form states ──
  const [managerForm, setManagerForm] = useState(emptyManagerForm());
  const [personForms, setPersonForms] = useState([emptyPersonForm()]);
  const [action, setAction] = useState('Add');
  const [manualSubmitAttempted, setManualSubmitAttempted] = useState(false);
  const [manualTouchedFields, setManualTouchedFields] = useState({});
  const personRowRefs = useRef([]);
  const manualPersonFieldRefs = useRef([]);
  const scrollToPersonIndexRef = useRef(null);

  const manualTouchKey = (index, field) => `${index}.${field}`;

  const resetManualForm = (nextAction = actionTab) => {
    setManagerForm(emptyManagerForm());
    setPersonForms([emptyPersonForm()]);
    setAction(nextAction);
    setManualSubmitAttempted(false);
    setManualTouchedFields({});
  };

  const personValidation = useMemo(() => validatePersonForms(personForms), [personForms]);

  const updatePersonForm = (index, field, value) => {
    const sanitized = sanitizePersonFieldInput(field, value);
    setPersonForms((prev) => prev.map((person, i) => (
      i === index ? { ...person, [field]: sanitized } : person
    )));
  };

  const handleManualPersonBlur = (index, field, rawValue) => {
    setManualTouchedFields((prev) => ({ ...prev, [manualTouchKey(index, field)]: true }));
    if (field === 'email') {
      updatePersonForm(index, 'email', String(rawValue ?? '').trim().toLowerCase());
    }
  };

  const setManualPersonFieldRef = (index, field, node) => {
    manualPersonFieldRefs.current[manualTouchKey(index, field)] = node;
  };

  const shouldShowManualFieldError = (index, field) =>
    manualSubmitAttempted || Boolean(manualTouchedFields[manualTouchKey(index, field)]);

  const getManualFieldError = (index, field) => {
    if (!shouldShowManualFieldError(index, field)) return null;
    return personValidation.errorsByRow[index]?.[field] || null;
  };

  const addPersonForm = () => {
    setPersonForms((prev) => {
      if (prev.length >= MAX_MANAGER_PERSON_ROWS) return prev;
      scrollToPersonIndexRef.current = prev.length;
      return [...prev, emptyPersonForm()];
    });
  };

  useEffect(() => {
    const index = scrollToPersonIndexRef.current;
    if (index == null) return;
    scrollToPersonIndexRef.current = null;
    requestAnimationFrame(() => {
      personRowRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [personForms]);

  const removePersonForm = (index) => {
    setPersonForms((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  // Reset filters when switching Add / Remove
  const handleActionTabSwitch = (tab) => {
    flushViewedRequestHighlights();
    bumpHighlights();
    setActionTab(tab);
    setAction(tab);
    setSearchQuery('');
    setFilterDate('All');
    setFilterLocation('All');
    setFilterClub('All');
    setFilterAlreadyExists('All');
    setSortPreset(DEFAULT_SORT);
    setFilterOpen(true);
  };

  // ── Generic filter + sort function ──
  const applyFilterSort = (rows, timestampKey) => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = rows.filter((req) => {
      const personName = `${req.person.firstName} ${req.person.lastName}`.toLowerCase();
      const isManual = isManualEntry(req.submittedBy);
      const awaitingManager = isAwaitingManagerSubmission(req.tags);
      const managerName = awaitingManager
        ? 'awaiting partner request'
        : isManual
          ? 'admin'
          : `${req.submittedBy?.firstName || ''} ${req.submittedBy?.lastName || ''}`.toLowerCase();

      const matchesSearch =
        query === '' ||
        personName.includes(query) ||
        req.person.email.toLowerCase().includes(query) ||
        (req.person.location && req.person.location.toLowerCase().includes(query)) ||
        managerName.includes(query) ||
        (req.submittedBy?.email && req.submittedBy.email.toLowerCase().includes(query)) ||
        (req.submittedBy?.club && req.submittedBy.club.toLowerCase().includes(query));

      const matchesAction =
        actionTab === 'All' ? true : req.action === actionTab;
      const matchesDate = matchesDateFilter(req[timestampKey], filterDate);
      const matchesLocation =
        filterLocation === 'All' || req.person.location === filterLocation;
      const matchesClub =
        filterClub === 'All' || req.submittedBy?.club === filterClub;
      const hasAlreadyExists = req.tags?.includes(TAG_ALREADY_EXISTS);
      const matchesAlreadyExists =
        filterAlreadyExists === 'All' ||
        (filterAlreadyExists === 'Yes' && hasAlreadyExists) ||
        (filterAlreadyExists === 'No' && !hasAlreadyExists);

      return (
        matchesSearch &&
        matchesAction &&
        matchesDate &&
        matchesLocation &&
        matchesClub &&
        matchesAlreadyExists
      );
    });

    const { field: sortField, dir: sortDir } = parseSortPreset(sortPreset);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortField === 'managerName') {
        const nA = `${a.submittedBy?.firstName || ''} ${a.submittedBy?.lastName || ''}`.toLowerCase();
        const nB = `${b.submittedBy?.firstName || ''} ${b.submittedBy?.lastName || ''}`.toLowerCase();
        return nA.localeCompare(nB) * dir;
      }
      if (sortField === 'personName') {
        const nA = `${a.person.firstName} ${a.person.lastName}`.toLowerCase();
        const nB = `${b.person.firstName} ${b.person.lastName}`.toLowerCase();
        return nA.localeCompare(nB) * dir;
      }
      if (sortField === 'location') {
        return (a.person.location || '').localeCompare(b.person.location || '') * dir;
      }
      if (sortField === 'club') {
        return (a.submittedBy?.club || '').localeCompare(b.submittedBy?.club || '') * dir;
      }
      if (sortField === 'receivedAt' || sortField === timestampKey) {
        return (new Date(a[timestampKey]) - new Date(b[timestampKey])) * dir;
      }
      return (a.displayId - b.displayId) * dir;
    });
  };

  const actionTabRows = useMemo(
    () => (actionTab === 'All' ? newRequests : newRequests.filter((r) => r.action === actionTab)),
    [newRequests, actionTab]
  );

  const locationOptions = useMemo(
    () => buildFilterOptions(
      [...new Set(actionTabRows.map((r) => r.person.location).filter(Boolean))].sort()
    ),
    [actionTabRows]
  );

  const clubOptions = useMemo(
    () => buildFilterOptions(
      [...new Set(actionTabRows.map((r) => r.submittedBy?.club).filter(Boolean))].sort()
    ),
    [actionTabRows]
  );

  const filteredRequests = useMemo(
    () => applyFilterSort(actionTabRows, 'receivedAt'),
    [actionTabRows, searchQuery, actionTab, filterDate, filterLocation, filterClub, filterAlreadyExists, sortPreset]
  );

  const allCount = newRequests.length;
  const addCount = newRequests.filter((r) => r.action === 'Add').length;
  const removeCount = newRequests.filter((r) => r.action === 'Remove').length;

  const activeFilterCount = [
    filterDate !== 'All',
    filterLocation !== 'All',
    filterClub !== 'All',
    filterAlreadyExists !== 'All',
  ].filter(Boolean).length;

  // ── Manual form submit ──
  const isModalFormValid = personValidation.ok;

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setManualSubmitAttempted(true);

    const validation = validatePersonForms(personForms);
    if (!validation.ok) {
      const firstInvalid = firstInvalidPersonField(validation.errorsByRow);
      if (firstInvalid) {
        const ref = manualPersonFieldRefs.current[manualTouchKey(firstInvalid.rowIndex, firstInvalid.field)];
        ref?.focus?.();
        ref?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        showToast(firstInvalid.message, 'error');
      } else {
        showToast('Fix the highlighted fields to create the request.', 'error');
      }
      return;
    }

    const normalizedPeople = validation.normalizedForms;

    try {
      const created = await fetchJson('/api/admin/requests/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submittedBy: managerForm,
          people: normalizedPeople.map(({ firstName, lastName, email, location, notes }) => ({
            firstName,
            lastName,
            email,
            location,
            notes: notes?.trim() || undefined,
          })),
          action: action,
        })
      });

      setNewRequests((prev) => {
        const next = [...created, ...prev];
        patchCache('requests_page', { requests: next });
        return next;
      });
      showToast(
        created.length === 1 ? 'Request created.' : `${created.length} requests created.`,
        'success'
      );
      setShowAddManualModal(false);
      resetManualForm();
    } catch (err) {
      console.error(err);
      showToast('Failed to create request.', 'error');
    }
  };

  const completeRequest = async (req, adminNote = '') => {
    const personName = `${req.person.firstName} ${req.person.lastName}`.trim();
    const outcome = req.action === 'Add' ? 'Added' : 'Removed';
    const handledAt = new Date().toISOString();

    setConfirmActionRequest(null);
    removeRequestHighlight(req.id);
    bumpHighlights();

    const nextRequests = newRequests.filter((r) => r.id !== req.id);
    const emailKey = req.person.email.toLowerCase();
    const existingPerson = liveDirectory.find((p) => p.email.toLowerCase() === emailKey);
    const nextDirectory = existingPerson
      ? liveDirectory.map((p) =>
          p.email.toLowerCase() === emailKey
            ? {
                ...p,
                status: outcome,
                dateAdded: handledAt,
                handledBy: adminDisplayName,
                adminNotes: adminNote || '',
              }
            : p,
        )
      : [
          {
            id: `temp-${req.id}`,
            displayId: req.displayId,
            sourceRequestNumber: req.displayId,
            firstName: req.person.firstName,
            lastName: req.person.lastName,
            email: req.person.email,
            location: req.person.location,
            status: outcome,
            dateAdded: handledAt,
            requestReceivedAt: req.receivedAt,
            addedBy: req.createdBy || getManagerDisplayName(req.submittedBy, req.tags),
            managerName: req.createdBy || getManagerDisplayName(req.submittedBy, req.tags),
            handledBy: adminDisplayName,
            managerEmail: req.submittedBy?.email || '',
            club: req.submittedBy?.club || '',
            managerNotes: req.notes || '',
            adminNotes: adminNote || '',
            notes: req.notes || '',
          },
          ...liveDirectory,
        ];

    setNewRequests(nextRequests);
    setLiveDirectory(nextDirectory);
    patchCache('requests_page', { requests: nextRequests, persons: nextDirectory });
    writeCache('directory_persons', nextDirectory);
    markDirectoryPersonHighlight(req.person.email);
    sessionStorage.setItem('pm_directory_pending_tab', outcome === 'Added' ? 'Added' : 'Removed');

    showToast(
      `${personName} marked as ${outcome}. They are now in the Directory.`,
      'success',
    );

    try {
      await fetchJson(`/api/admin/requests/${req.id}/mark-handled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNote: adminNote || null }),
      });
      refreshCache('directory_persons', () => fetchJson('/api/persons'), (data) => {
        setLiveDirectory(Array.isArray(data) ? data : []);
      }).catch(() => {});
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to save — refreshing list.', 'error');
      loadWithCache('requests_page', getNewRequestsPage, (data, isStale) => {
        if (!isStale && Array.isArray(data.requests)) {
          syncAdminNewRequestHighlights(data.requests, { isManualEntry });
        }
        setNewRequests(data.requests);
        setLiveDirectory(data.persons);
      }).catch(() => {});
    }
  };

  // ── Column definitions — shared structure ──
  const sharedStartColumns = [
    {
      key: 'displayId',
      label: '#',
      width: '52px',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'text-center align-middle whitespace-nowrap px-2',
      render: (val) => (
        <span className="text-xs font-bold text-[var(--color-text-muted)] whitespace-nowrap tabular-nums">
          {formatRequestDisplayId(val)}
        </span>
      )
    },
    {
      key: 'timestamp',
      label: 'Received',
      width: '108px',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'align-middle whitespace-nowrap',
      render: (_, row) => <TimestampCell val={row.receivedAt} />
    },
    {
      key: 'action',
      label: 'Type',
      width: '72px',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'align-middle whitespace-nowrap text-center',
      render: (val) => <Tag variant={val === 'Add' ? 'add-action' : 'remove-action'} label={val} />
    },
    {
      key: 'status',
      label: 'Status',
      width: '110px',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'align-middle whitespace-nowrap text-center px-1',
      render: (_, row) => {
        const status = directoryStatusTag(row);
        return (
          <Tag
            variant={status.variant}
            label={status.label}
            prefix={status.prefix}
            compact
          />
        );
      },
    },
    {
      key: 'person',
      label: 'Person',
      width: '17%',
      headerClassName: 'text-center',
      cellClassName: 'align-middle max-w-0 overflow-hidden text-left',
      render: (_, row) => {
        const name = `${row.person.firstName} ${row.person.lastName}`.trim();
        return (
          <div className="min-w-0">
            <TruncateCell className="text-sm font-semibold text-[var(--color-text-primary)]">
              {name}
            </TruncateCell>
            <TruncateCell className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              {row.person.email}
            </TruncateCell>
            <TruncateCell className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {row.person.location || EMPTY_CELL}
            </TruncateCell>
          </div>
        );
      },
    },
    {
      key: 'manager',
      label: 'Manager',
      width: '17%',
      headerClassName: 'text-center',
      cellClassName: 'align-middle max-w-0 overflow-hidden text-left',
      render: (_, row) => {
        const manager = getManagerColumnContent(row);
        return (
          <StackedTextCell
            primary={manager.primary || EMPTY_CELL}
            secondary={manager.secondary || undefined}
            tertiary={manager.tertiary || undefined}
            primaryClassName={manager.muted ? 'font-medium text-[var(--color-text-muted)] italic' : ''}
          />
        );
      }
    },
    {
      key: 'managerNotes',
      label: 'Manager notes',
      width: '14%',
      headerClassName: 'text-center',
      cellClassName: 'align-middle max-w-0 overflow-hidden text-left',
      render: (_, row) => {
        const notes = readManagerNotes(row);
        return (
          <TruncateCell
            className={`text-xs leading-relaxed ${
              notes ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-muted)]'
            }`}
          >
            {formatManagerNotes(row)}
          </TruncateCell>
        );
      },
    }
  ];

  const newColumns = [
    ...sharedStartColumns,
    {
      key: 'tags',
      label: 'Sent via',
      width: '18%',
      headerClassName: 'text-center',
      cellClassName: 'align-middle max-w-0 overflow-hidden pl-2 pr-1 text-center',
      render: (_, row) => (
        <div className="flex flex-col items-center justify-center gap-1 min-w-0 px-1">
          {sentViaTableRequestTags(row.tags || []).map((t) => (
            <Tag key={t} variant={requestTagVariant(t)} label={requestTagLabel(t)} compact />
          ))}
        </div>
      )
    },
    {
      key: 'remarks',
      label: 'Needs review',
      width: '22%',
      headerClassName: 'text-center',
      cellClassName: 'align-middle max-w-0 overflow-hidden text-center px-2 py-1.5',
      render: (_, row) => (
        <RequestComparison
          intakeMatch={row.intakeMatch}
          directoryMatch={row.directoryMatch}
          directory={liveDirectory}
          requestPerson={row.person}
          variant="table"
          onViewDetails={() => handleOpenRequest(row)}
        />
      )
    },
    {
      key: 'rowActions',
      label: 'Actions',
      width: '56px',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'text-center align-middle whitespace-nowrap px-2',
      render: (_, row) => (
        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => handleOpenRequest(row)}
            aria-label="View request details"
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-highlight)] rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <Eye className="h-4 w-4" />
          </button>
        </div>
      )
    },
    {
      key: 'markAs',
      label: 'Mark as',
      width: '128px',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'text-center align-middle whitespace-nowrap px-2',
      render: (_, row) => (
        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setConfirmActionRequest({ request: row, adminNote: '' })}
            className={`min-w-[4.75rem] w-[4.75rem] text-center px-2 py-1.5 text-xs font-semibold rounded-md border transition-all cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.12)] active:translate-y-px active:shadow-none shrink-0 ${
              row.action === 'Add'
                ? 'bg-[#16a34a] text-white border-[#15803d] hover:bg-[#15803d]'
                : 'bg-[#dc2626] text-white border-[#b91c1c] hover:bg-[#b91c1c]'
            }`}
          >
            {row.action === 'Add' ? 'Added' : 'Removed'}
          </button>
        </div>
      )
    }
  ];

  const displayedRows = filteredRequests;

  return (
    <div className={adminPageScrollClass}>
      <Toast />

      <PageHeader
        section="Partner Support"
        title="New Requests"
        description="Review and action incoming add and remove requests."
        workspace
        actions={
          <button
            onClick={() => { resetManualForm(actionTab === 'All' ? 'Add' : actionTab); setShowAddManualModal(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Manually</span>
          </button>
        }
        footer={
          <CountTabs
            value={actionTab}
            onChange={handleActionTabSwitch}
            tabs={[
              { key: 'All', label: 'All', count: allCount },
              { key: 'Add', label: 'Add', count: addCount },
              { key: 'Remove', label: 'Remove', count: removeCount },
            ]}
          />
        }
      />

      {/* Controls Bar */}
      <ControlsBar
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        filterOpen={filterOpen} setFilterOpen={setFilterOpen}
        activeFilterCount={activeFilterCount}
        filterSlots={[
          {
            label: 'Received',
            value: filterDate, onChange: setFilterDate,
            options: [
              { value: 'All', label: 'All' },
              { value: 'Today', label: 'Today' },
              { value: 'Yesterday', label: 'Yesterday' },
              { value: 'Older', label: 'Older' }
            ]
          },
          {
            label: 'User Location', value: filterLocation, onChange: setFilterLocation,
            options: locationOptions
          },
          {
            label: 'Manager Club', value: filterClub, onChange: setFilterClub,
            options: clubOptions
          },
          {
            label: 'Already Exists', value: filterAlreadyExists, onChange: setFilterAlreadyExists,
            options: [
              { value: 'All', label: 'All' },
              { value: 'Yes', label: 'Yes' },
              { value: 'No', label: 'No' }
            ]
          }
        ]}
        sortPreset={sortPreset}
        setSortPreset={setSortPreset}
      />

      <NewRequestsMobileList
        rows={displayedRows}
        loading={tableLoading}
        emptyMessage={`No ${actionTab === 'All' ? '' : `${actionTab.toLowerCase()} `}requests matching your filters.`}
        onOpenRequest={handleOpenRequest}
        onMarkAs={(row) => setConfirmActionRequest({ request: row, adminNote: '' })}
        getRowClassName={getRequestRowClassName}
        directory={liveDirectory}
      />

      <div className="hidden w-full sm:block">
        <DataTable
          columns={newColumns}
          rows={displayedRows}
          onRowClick={handleOpenRequest}
          getRowClassName={getRequestRowClassName}
          emptyMessage={`No ${actionTab === 'All' ? '' : `${actionTab.toLowerCase()} `}requests matching your filters.`}
          compact
          centerHeaders
          loading={tableLoading}
        />
      </div>

      {/* Footer */}
      <div className="px-2 text-xs font-medium text-[var(--color-text-secondary)]">
        {filteredRequests.length} requests
      </div>

      {/* ── Add Manually Modal ── */}
      <Modal
        isOpen={showAddManualModal}
        onClose={() => { setShowAddManualModal(false); resetManualForm(); }}
        title="Add Request Manually"
        wide
        headerExtra={
          <div className="flex items-center bg-white rounded-lg p-0.5 gap-0.5 ring-1 ring-[rgba(26,26,46,0.08)] shadow-sm">
            {[['Add', 'Add'], ['Remove', 'Remove']].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setAction(val)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  action === val
                    ? val === 'Add'
                      ? 'bg-[var(--color-tag-add-action-bg)] text-[var(--color-tag-add-action-text)] shadow-sm'
                      : 'bg-[var(--color-tag-remove-action-bg)] text-[var(--color-tag-remove-action-text)] shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
        footer={
          <>
            <button onClick={() => { setShowAddManualModal(false); resetManualForm(); }}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-lg text-sm font-medium text-[var(--color-text-primary)] hover:bg-white transition-colors cursor-pointer">Cancel</button>
            <button
              type="button"
              onClick={handleCreateRequest}
              className={`px-4 py-2 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm cursor-pointer ${
                isModalFormValid
                  ? 'bg-[var(--color-brand-accent)] hover:bg-[var(--color-brand-accent-hover)]'
                  : 'bg-gray-300'
              }`}
            >
              {personForms.length === 1 ? 'Create Request' : `Create ${personForms.length} Requests`}
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateRequest} noValidate className="space-y-4 text-left">
          <div className="space-y-3">
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Manager Details</span>
            <div className={formGridClass}>
              {[['First Name', 'firstName', 'text'], ['Last Name', 'lastName', 'text']].map(([label, field, type]) => (
                <div key={field}>
                  <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1">{label}</label>
                  <input type={type} value={managerForm[field]}
                    onChange={(e) => setManagerForm({ ...managerForm, [field]: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--color-surface-panel)]/50 border border-[var(--color-border-default)] rounded-lg text-sm focus:outline-none focus:bg-white focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[rgba(233,69,96,0.08)] transition-all" />
                </div>
              ))}
            </div>
            <div className={formGridClass}>
              {[['Email', 'email', 'email'], ['Club Location', 'club', 'text']].map(([label, field, type]) => (
                <div key={field}>
                  <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1">{label}</label>
                  <input type={type} value={managerForm[field]}
                    onChange={(e) => setManagerForm({ ...managerForm, [field]: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--color-surface-panel)]/50 border border-[var(--color-border-default)] rounded-lg text-sm focus:outline-none focus:bg-white focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[rgba(233,69,96,0.08)] transition-all" />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                People ({personForms.length})
              </span>
            </div>

            <div className="max-h-[40vh] overflow-y-auto overscroll-contain space-y-2.5 pr-1">
            {personForms.map((person, index) => (
              <div
                key={person.id}
                ref={(el) => { personRowRefs.current[index] = el; }}
                className="space-y-2.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/50 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-[var(--color-text-primary)]">
                    Person {index + 1}
                  </span>
                  {personForms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePersonForm(index)}
                      aria-label={`Remove person ${index + 1}`}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold text-[var(--color-text-secondary)] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
                <div className={formGridClass}>
                  {[['First Name *', 'firstName', 'text'], ['Last Name *', 'lastName', 'text']].map(([label, field, type]) => {
                    const error = getManualFieldError(index, field);
                    return (
                    <div key={field}>
                      <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1">{label}</label>
                      <input
                        type={type}
                        required
                        maxLength={PERSON_FIELD_LIMITS[field]}
                        value={person[field]}
                        onChange={(e) => updatePersonForm(index, field, e.target.value)}
                        onBlur={() => handleManualPersonBlur(index, field, person[field])}
                        ref={(node) => setManualPersonFieldRef(index, field, node)}
                        aria-invalid={error ? true : undefined}
                        className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:outline-none focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[rgba(233,69,96,0.08)] transition-all ${error ? 'border-red-500' : 'border-[var(--color-border-default)]'}`}
                      />
                      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
                    </div>
                    );
                  })}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1">Email *</label>
                  <input
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    maxLength={PERSON_FIELD_LIMITS.email}
                    value={person.email}
                    onChange={(e) => updatePersonForm(index, 'email', e.target.value)}
                    onBlur={() => handleManualPersonBlur(index, 'email', person.email)}
                    ref={(node) => setManualPersonFieldRef(index, 'email', node)}
                    aria-invalid={getManualFieldError(index, 'email') ? true : undefined}
                    className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:outline-none focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[rgba(233,69,96,0.08)] transition-all ${getManualFieldError(index, 'email') ? 'border-red-500' : 'border-[var(--color-border-default)]'}`}
                  />
                  {getManualFieldError(index, 'email') && (
                    <p className="mt-1 text-[11px] text-red-600">{getManualFieldError(index, 'email')}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1">Location *</label>
                  <input
                    type="text"
                    required
                    maxLength={PERSON_FIELD_LIMITS.location}
                    value={person.location}
                    onChange={(e) => updatePersonForm(index, 'location', e.target.value)}
                    onBlur={() => handleManualPersonBlur(index, 'location', person.location)}
                    ref={(node) => setManualPersonFieldRef(index, 'location', node)}
                    aria-invalid={getManualFieldError(index, 'location') ? true : undefined}
                    className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:outline-none focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[rgba(233,69,96,0.08)] transition-all ${getManualFieldError(index, 'location') ? 'border-red-500' : 'border-[var(--color-border-default)]'}`}
                  />
                  {getManualFieldError(index, 'location') && (
                    <p className="mt-1 text-[11px] text-red-600">{getManualFieldError(index, 'location')}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor={`manual-person-${person.id}-notes`}
                    className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1"
                  >
                    {personForms.length > 1
                      ? `Additional notes for Person ${index + 1} (optional)`
                      : 'Additional notes for this request (optional)'}
                  </label>
                  <textarea
                    id={`manual-person-${person.id}-notes`}
                    value={person.notes}
                    onChange={(e) => updatePersonForm(index, 'notes', e.target.value)}
                    onBlur={() => handleManualPersonBlur(index, 'notes', person.notes)}
                    ref={(node) => setManualPersonFieldRef(index, 'notes', node)}
                    placeholder="Any additional notes for this request..."
                    rows={2}
                    className="w-full px-3 py-2 bg-white border border-[var(--color-border-default)] rounded-lg text-sm placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[rgba(233,69,96,0.08)] transition-all resize-none"
                  />
                </div>
              </div>
            ))}
            </div>

            {personForms.length < MAX_MANAGER_PERSON_ROWS && (
              <button
                type="button"
                onClick={addPersonForm}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-[var(--color-border-default)] text-sm font-semibold text-[var(--color-brand-primary)] bg-[var(--color-surface-panel)]/40 hover:bg-[var(--color-surface-highlight)] transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add one more</span>
              </button>
            )}
          </div>

          <div className="text-[11px] font-medium text-[var(--color-text-muted)] select-none pt-3 border-t border-[var(--color-border-default)]/80">
            Created by Andrea (Admin)
          </div>
        </form>
      </Modal>

      {/* ── Confirm action modal ── */}
      <Modal
        isOpen={confirmActionRequest !== null}
        onClose={() => setConfirmActionRequest(null)}
        confirm
        title="Confirm action"
        footer={
          <>
            <button
              onClick={() => setConfirmActionRequest(null)}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-lg text-sm font-medium text-[var(--color-text-primary)] hover:bg-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (confirmActionRequest) {
                  completeRequest(confirmActionRequest.request, confirmActionRequest.adminNote);
                }
              }}
              className="px-4 py-2 text-white text-sm font-semibold rounded-lg bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] shadow-sm cursor-pointer"
            >
              Confirm
            </button>
          </>
        }
      >
        {confirmActionRequest && (
          <p>
            Confirm you have {confirmActionRequest.request.action === 'Add' ? 'added' : 'removed'}{' '}
            <strong>
              {confirmActionRequest.request.person.firstName} {confirmActionRequest.request.person.lastName}
            </strong>{' '}
            in Power Music before continuing. This cannot be undone.
            {confirmActionRequest.adminNote ? (
              <span className="mt-2 block text-xs text-[var(--color-text-muted)]">
                Admin note: {confirmActionRequest.adminNote}
              </span>
            ) : null}
          </p>
        )}
      </Modal>

    </div>
  );
}
