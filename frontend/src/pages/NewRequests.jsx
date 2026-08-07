import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, Plus, SortAsc, ChevronDown, Filter, ArrowRight, Trash2
} from 'lucide-react';
import { formatTimestampSplit, isTodayInTimeZone, isYesterdayInTimeZone } from '../utils/dateTime';
import { DataTable, Tag, Modal, Toast, useToast, SelectDropdown, StackedTextCell, TruncateCell, EMPTY_CELL, CountTabs, AdminPageScroll, TablePagination } from '../components/ui';
import RequestComparison from '../components/RequestComparison';
import PageHeader from '../components/layout/PageHeader';
import { getManagerColumnContent, getManagerDisplayName, isManualEntry, isAdminEntry } from '../utils/manualEntry';
import { loadWithCache, patchCache, writeCache, refreshCache, bumpCacheEpoch, getNewRequestsPage, REQUESTS_PAGE_CACHE_KEY } from '../utils/pilot2Api';
import { fetchJson } from '../utils/api';
import { useRealtimeBroadcast } from '../hooks/useRealtimeBroadcast';
import { useClientPagination } from '../hooks/useClientPagination';
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
import { usePartners } from '../context/PartnerContext';
import { formatRequestDisplayId } from '../utils/requestDisplayId';
import { formatManagerNotes, readManagerNotes } from '../utils/managerNotes';
import { formatPersonFields, formatPersonName, formatPersonEmail, formatPersonLocation } from '../utils/personDisplay';
import { TAG_AUTO_MAIL, TAG_PARTNER_REQUEST, requestTagVariant, sentViaTableRequestTags, requestTagLabel, isAwaitingManagerSubmission, requestStatusTag, requestStatusTags, matchesSentViaFilter, SENT_VIA_BOTH } from '../utils/requestTags';
import { hasAnyDataDiffs } from '../utils/requestComparison';
import { MAX_MANAGER_PERSON_ROWS } from '../utils/managerFormDraft';
import { writeDirectoryCache } from '../utils/managerDirectoryCache';
import { formGridClass } from '../utils/responsiveLayout';
import {
  PERSON_FIELD_LIMITS,
  sanitizePersonFieldInput,
  validatePersonForms,
  firstInvalidPersonField,
} from '../utils/managerFormValidation';

const REQUESTS_POLL_MS = 10000;
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
        ? 'bg-white text-[var(--color-brand-secondary)] shadow-[0_1px_2px_rgba(44,95,143,0.12)] ring-1 ring-[var(--color-brand-secondary-border)]/55'
        : 'text-[var(--color-text-secondary)] hover:bg-white/80 hover:text-[var(--color-brand-secondary)]'
    }`;

  return (
    <div className="w-full rounded-2xl border border-[var(--color-brand-secondary-border)]/55 bg-white shadow-[var(--shadow-card)]">
      <div
        className={`bg-[var(--color-brand-secondary-muted)]/45 ${
          filterOpen
            ? 'border-b border-[var(--color-brand-secondary-border)]/40 rounded-t-2xl'
            : 'rounded-2xl'
        }`}
      >
        <div className="flex flex-col md:flex-row items-stretch gap-2 p-2">
          <div className="flex items-center gap-2.5 px-3 py-2 flex-1 bg-white rounded-xl border border-[var(--color-brand-secondary-border)]/35 shadow-sm focus-within:ring-2 focus-within:ring-[var(--color-brand-secondary)]/15 focus-within:border-[var(--color-brand-secondary-border)] transition-shadow">
          <Search className="h-4 w-4 text-[var(--color-brand-secondary)]/70 shrink-0" />
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
              <span className="ml-0.5 bg-[var(--color-brand-secondary)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
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
              <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 max-h-72 overflow-y-auto py-1 bg-white rounded-xl border border-[var(--color-brand-secondary-border)]/45 shadow-[var(--shadow-modal)]">
                {SORT_PRESETS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setSortPreset(opt.value); setSortOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      sortPreset === opt.value
                        ? 'bg-[var(--color-brand-secondary-muted)] text-[var(--color-brand-secondary)]'
                        : 'text-[var(--color-text-primary)] hover:bg-[var(--color-brand-secondary-muted)]/50'
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
        <div className="bg-[var(--color-brand-secondary-muted)]/35 px-4 py-4 rounded-b-2xl">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            {filterSlots.map((slot) => (
              <div key={slot.label} className="flex flex-col gap-1 min-w-[140px]">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-brand-secondary)]/80">
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
  return formatTimestampSplit(iso);
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
        const { name, email, location } = formatPersonFields(row.person);
        const manager = getManagerColumnContent(row);
        const isAdd = row.action === 'Add';
        const sentViaTags = sentViaTableRequestTags(row.tags || [], {
          isAdminEntry: isAdminEntry(row),
          includeAdminForm: false,
        });
        const statusTags = requestStatusTags(row);
        const directoryStatus = statusTags.length > 0 ? null : requestStatusTag(row);

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
                      {statusTags.length > 0 ? (
                        <span className="flex flex-wrap items-center justify-start gap-1.5">
                          {statusTags.map((tag) => (
                            <Tag
                              key={tag.label}
                              variant={tag.variant}
                              label={tag.label}
                              prefix={tag.prefix}
                              compact
                              wide
                            />
                          ))}
                        </span>
                      ) : directoryStatus.plain ? (
                        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                          {directoryStatus.label}
                        </span>
                      ) : (
                        <Tag
                          variant={directoryStatus.variant}
                          label={directoryStatus.label}
                          prefix={directoryStatus.prefix}
                          compact
                          wide
                        />
                      )}
                      {sentViaTags.map((tag) => (
                        <Tag key={tag} variant={requestTagVariant(tag)} label={requestTagLabel(tag)} compact />
                      ))}
                    </div>

                    <TimestampCell val={row.receivedAt} />

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{name}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">{email}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
                        {location}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                        Manager
                      </p>
                      <p
                        className={`mt-0.5 truncate ${
                          manager.placeholder
                            ? 'text-xs font-normal text-[var(--color-text-muted)]'
                            : manager.muted
                              ? 'text-xs font-semibold italic text-[var(--color-text-muted)]'
                              : 'text-xs font-semibold text-[var(--color-text-primary)]'
                        }`}
                      >
                        {manager.primary}
                      </p>
                      {(manager.lines?.length
                        ? manager.lines
                        : [manager.secondary, manager.tertiary].filter(Boolean)
                      ).map((line, index, all) => {
                        const isSectionHeading = String(line).trim().toLowerCase() === 'manager details';
                        const hasHeading = String(all[0] || '').trim().toLowerCase() === 'manager details';
                        const detailIndex = hasHeading ? index - 1 : index;
                        return (
                          <p
                            key={`${index}-${line}`}
                            className={`mt-0.5 truncate ${
                              isSectionHeading
                                ? 'text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]'
                                : `text-[11px] ${
                                  detailIndex === 0
                                    ? 'text-[var(--color-text-secondary)]'
                                    : 'text-[var(--color-text-muted)]'
                                }`
                            }`}
                          >
                            {line}
                          </p>
                        );
                      })}
                    </div>

                    <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                      <span className="font-semibold text-[var(--color-text-muted)]">Manager notes: </span>
                      <span className={readManagerNotes(row) ? '' : 'text-[var(--color-text-muted)]'}>
                        {formatManagerNotes(row)}
                      </span>
                    </p>
                  </div>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
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
                  onClick={() => onMarkAs(row)}
                  className={`min-w-[4.75rem] rounded-md border px-3 py-1.5 text-center text-xs font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all active:translate-y-px active:shadow-none ${
                    isAdd
                      ? 'border-[#15803d] bg-[#16a34a] hover:bg-[#15803d]'
                      : 'border-[#b91c1c] bg-[#dc2626] hover:bg-[#b91c1c]'
                  }`}
                >
                  {isAdd ? 'Added' : 'Removed'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenRequest(row)}
                  aria-label="Open request details"
                  className="inline-flex items-center justify-center rounded-lg p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-highlight)] hover:text-[var(--color-text-primary)]"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return true;
    if (filterDate === 'Today') return isTodayInTimeZone(d);
    if (filterDate === 'Yesterday') return isYesterdayInTimeZone(d);
    if (filterDate === 'Older') return !isTodayInTimeZone(d) && !isYesterdayInTimeZone(d);
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
  const { selectedPartnerId } = usePartners();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkRequestId = searchParams.get('id');
  const statusDeepLink = searchParams.get('status');
  const consumedDeepLinkRef = useRef(null);
  const pendingCreatedIdsRef = useRef(new Set());
  const adminDisplayName = profile?.full_name?.trim() || 'Power Music Admin';
  const requestsCacheKey = selectedPartnerId ? `${REQUESTS_PAGE_CACHE_KEY}:${selectedPartnerId}` : REQUESTS_PAGE_CACHE_KEY;
  const directoryCacheKey = selectedPartnerId ? `directory_persons:${selectedPartnerId}` : 'directory_persons';

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
    if (row.duplicateGroupId) {
      navigate(`/new-requests/group/${encodeURIComponent(row.duplicateGroupId)}`);
    } else {
      navigate(`/new-requests/${encodeURIComponent(row.id)}`);
    }
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

  useEffect(() => {
    if (
      statusDeepLink !== 'New'
      && statusDeepLink !== 'Not added/removed'
      && statusDeepLink !== 'Not added'
      && statusDeepLink !== 'Not removed'
      && statusDeepLink !== 'Already exists'
      && statusDeepLink !== 'Confirmed Duplicate'
      && statusDeepLink !== 'Potential Duplicate'
    ) return;
    setFilterStatus(
      statusDeepLink === 'New' || statusDeepLink === 'Not added/removed'
        ? 'Not added'
        : statusDeepLink,
    );
    setFilterOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('status');
      return next;
    }, { replace: true });
  }, [statusDeepLink, setSearchParams]);

  const applyRequestsPage = useCallback((data, isStale) => {
    if (Array.isArray(data.requests)) {
      setNewRequests((prev) => {
        const server = data.requests;
        const serverIds = new Set(server.map((row) => row.id));
        for (const id of [...pendingCreatedIdsRef.current]) {
          if (serverIds.has(id)) pendingCreatedIdsRef.current.delete(id);
        }
        // Fresh server payload is source of truth. Keeping "pending" rows that the
        // server no longer has resurrects deleted merges (e.g. ghost R-116) until
        // a hard refresh — especially painful while /page is slow.
        if (!isStale) {
          for (const id of [...pendingCreatedIdsRef.current]) {
            if (!serverIds.has(id)) pendingCreatedIdsRef.current.delete(id);
          }
          return server;
        }
        const pending = prev.filter(
          (row) => pendingCreatedIdsRef.current.has(row.id) && !serverIds.has(row.id),
        );
        return pending.length > 0 ? [...pending, ...server] : server;
      });
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
    const fetcher = () => getNewRequestsPage(selectedPartnerId || '');
    if (networkOnly) {
      return refreshCache(requestsCacheKey, fetcher, applyRequestsPage).catch((err) => {
        console.error(err);
        setTableLoading(false);
      });
    }
    // Cache key bumped to drop stale sessionStorage rows (deleted duplicates, etc.).
    return loadWithCache(requestsCacheKey, fetcher, applyRequestsPage).catch((err) => {
      console.error(err);
      setTableLoading(false);
    });
  }, [applyRequestsPage, requestsCacheKey, selectedPartnerId]);

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
  const [filterSentVia, setFilterSentVia] = useState('All');
  const [filterNeedsReview, setFilterNeedsReview] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
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
    setFilterSentVia('All');
    setFilterNeedsReview('All');
    setFilterStatus('All');
    setSortPreset(DEFAULT_SORT);
    setFilterOpen(true);
  };

  // ── Generic filter + sort function ──
  const applyFilterSort = (rows, timestampKey) => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = rows.filter((req) => {
      const personName = formatPersonName(req.person, { empty: '' }).toLowerCase();
      const isManual = isManualEntry(req.submittedBy);
      const awaitingManager = isAwaitingManagerSubmission(req.tags);
      const managerName = awaitingManager
        ? 'awaiting partner request'
        : isManual
          ? 'admin'
          : formatPersonName(req.submittedBy, { empty: '' }).toLowerCase();

      const matchesSearch =
        query === '' ||
        personName.includes(query) ||
        formatPersonEmail(req.person, { empty: '' }).toLowerCase().includes(query) ||
        formatPersonLocation(req.person, { empty: '' }).toLowerCase().includes(query) ||
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
      const tags = req.tags || [];
      const matchesSentVia = matchesSentViaFilter(tags, filterSentVia);
      const needsReview =
        req.needsReview === true ||
        hasAnyDataDiffs(req.intakeMatch, req.directoryMatch, req.adminPerson);
      const matchesNeedsReview =
        filterNeedsReview === 'All' ||
        (filterNeedsReview === 'Yes' && needsReview) ||
        (filterNeedsReview === 'No' && !needsReview);
      const statusLabels = requestStatusTags(req).map((tag) => tag.label.toLowerCase());
      const directoryStatus = requestStatusTag(req);
      const selectedStatus = filterStatus.toLowerCase();
      const matchesStatus =
        filterStatus === 'All'
        || statusLabels.includes(selectedStatus)
        || directoryStatus.label.toLowerCase() === selectedStatus;

      return (
        matchesSearch &&
        matchesAction &&
        matchesDate &&
        matchesLocation &&
        matchesClub &&
        matchesSentVia &&
        matchesNeedsReview &&
        matchesStatus
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
        const nA = formatPersonName(a.person, { empty: '' }).toLowerCase();
        const nB = formatPersonName(b.person, { empty: '' }).toLowerCase();
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
    [actionTabRows, searchQuery, actionTab, filterDate, filterLocation, filterClub, filterSentVia, filterNeedsReview, filterStatus, sortPreset]
  );

  const allCount = newRequests.length;
  const addCount = newRequests.filter((r) => r.action === 'Add').length;
  const removeCount = newRequests.filter((r) => r.action === 'Remove').length;

  const activeFilterCount = [
    filterDate !== 'All',
    filterLocation !== 'All',
    filterClub !== 'All',
    filterSentVia !== 'All',
    filterNeedsReview !== 'All',
    filterStatus !== 'All',
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
          partnerId: selectedPartnerId || undefined,
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

      if (action === 'Add') {
        const directoryRows = await fetchJson(`/api/persons${selectedPartnerId ? `?partner_id=${encodeURIComponent(selectedPartnerId)}` : ''}`);
        const nextDirectory = Array.isArray(directoryRows) ? directoryRows : [];
        setLiveDirectory(nextDirectory);
        writeCache(directoryCacheKey, nextDirectory);
        if (profile?.id) {
          writeDirectoryCache(profile.id, nextDirectory, 'Added', selectedPartnerId || '');
        }
        sessionStorage.setItem('pm_directory_pending_tab', 'Added');
      }

      showToast(
        action === 'Add'
          ? (created.length === 1 ? 'Added to Directory.' : `${created.length} users added to Directory.`)
          : (created.length === 1 ? 'Request created.' : `${created.length} requests created.`),
        'success',
      );
      setShowAddManualModal(false);
      resetManualForm();
    } catch (err) {
      console.error(err);
      showToast(action === 'Add' ? 'Failed to add to Directory.' : 'Failed to create request.', 'error');
    }
  };

  const completeRequest = async (req, adminNote = '') => {
    const personName = formatPersonName(req.person);
    const outcome = req.action === 'Add' ? 'Added' : 'Removed';
    const handledAt = new Date().toISOString();

    setConfirmActionRequest(null);
    removeRequestHighlight(req.id);
    pendingCreatedIdsRef.current.delete(req.id);
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
                partnerId: req.partnerId || p.partnerId || null,
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
            partnerId: req.partnerId || null,
          },
          ...liveDirectory,
        ];

    bumpCacheEpoch(requestsCacheKey);
    setNewRequests(nextRequests);
    setLiveDirectory(nextDirectory);
    patchCache(requestsCacheKey, { requests: nextRequests, persons: nextDirectory });
    writeCache(directoryCacheKey, nextDirectory);
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
      refreshCache(directoryCacheKey, () => fetchJson(`/api/persons${selectedPartnerId ? `?partner_id=${encodeURIComponent(selectedPartnerId)}` : ''}`), (data) => {
        setLiveDirectory(Array.isArray(data) ? data : []);
      }).catch(() => {});
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to save — refreshing list.', 'error');
      loadWithCache(requestsCacheKey, () => getNewRequestsPage(selectedPartnerId || ''), (data, isStale) => {
        if (!isStale && Array.isArray(data.requests)) {
          syncAdminNewRequestHighlights(data.requests, { isManualEntry });
        }
        setNewRequests(data.requests);
        setLiveDirectory(data.persons);
      }).catch(() => {});
    }
  };

  // ── Column order: #, Received, Person, Manager, Type, Sent via, Status, Notes, Needs review, Mark as, →
  const newColumns = [
    {
      key: 'displayId',
      label: '#',
      width: '3rem',
      minWidth: '3rem',
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
      width: '6.5rem',
      minWidth: '6.5rem',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'align-middle whitespace-nowrap',
      render: (_, row) => <TimestampCell val={row.receivedAt} />
    },
    {
      key: 'person',
      label: 'Person',
      width: '21%',
      minWidth: '11rem',
      headerClassName: 'text-center',
      cellClassName: 'align-middle max-w-0 overflow-hidden text-left',
      render: (_, row) => {
        const { name, email, location } = formatPersonFields(row.person);
        return (
          <StackedTextCell
            primary={name}
            secondary={email}
            tertiary={location}
          />
        );
      },
    },
    {
      key: 'manager',
      label: 'Manager',
      width: '18%',
      minWidth: '10rem',
      headerClassName: 'text-center',
      cellClassName: 'align-middle max-w-0 overflow-hidden text-left',
      render: (_, row) => {
        const manager = getManagerColumnContent(row);
        return (
          <StackedTextCell
            primary={manager.primary}
            secondary={manager.secondary || undefined}
            tertiary={manager.tertiary || undefined}
            lines={manager.lines || undefined}
            primaryClassName={
              manager.placeholder
                ? '!font-normal !text-xs text-[var(--color-text-muted)]'
                : manager.muted
                  ? 'font-medium text-[var(--color-text-muted)] italic'
                  : ''
            }
          />
        );
      }
    },
    {
      key: 'action',
      label: 'Type',
      width: '3.5rem',
      minWidth: '3.5rem',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'align-middle whitespace-nowrap text-center',
      render: (val) => <Tag variant={val === 'Add' ? 'add-action' : 'remove-action'} label={val} />
    },
    {
      key: 'sentVia',
      label: 'Sent via',
      width: '8.5rem',
      minWidth: '8.5rem',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'align-middle whitespace-nowrap text-center',
      render: (_, row) => {
        const viaTags = sentViaTableRequestTags(row.tags || [], {
          isAdminEntry: isAdminEntry(row),
          includeAdminForm: false,
        });
        if (!viaTags.length) {
          return (
            <span className="text-xs font-medium text-[var(--color-text-muted)]">—</span>
          );
        }
        return (
          <span className="inline-flex flex-col items-center gap-1">
            {viaTags.map((tag) => (
              <Tag key={tag} variant={requestTagVariant(tag)} label={requestTagLabel(tag)} />
            ))}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      width: '13rem',
      minWidth: '13rem',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'align-middle overflow-hidden text-center px-1',
      render: (_, row) => {
        const statusTags = requestStatusTags(row);
        const status = statusTags.length > 0 ? null : requestStatusTag(row);
        if (statusTags.length > 0) {
          return (
            <span className="flex flex-wrap items-center justify-center gap-1.5">
              {statusTags.map((tag) => (
                <Tag
                  key={tag.label}
                  variant={tag.variant}
                  label={tag.label}
                  prefix={tag.prefix}
                  compact
                  wide
                />
              ))}
            </span>
          );
        }
        if (status.plain) {
          return (
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {status.label}
            </span>
          );
        }
        return (
          <Tag
            variant={status.variant}
            label={status.label}
            prefix={status.prefix}
            compact
            wide
          />
        );
      },
    },
    {
      key: 'managerNotes',
      label: 'Manager notes',
      width: '8%',
      minWidth: '5rem',
      headerClassName: 'text-center',
      cellClassName: 'align-middle max-w-0 overflow-hidden text-left',
      render: (_, row) => {
        const notes = readManagerNotes(row);
        return (
          <TruncateCell
            className={`text-xs leading-relaxed ${
              notes ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-muted)]'
            }`}
            title={notes || undefined}
          >
            {formatManagerNotes(row)}
          </TruncateCell>
        );
      },
    },
    {
      key: 'remarks',
      label: 'Needs review',
      width: '7rem',
      minWidth: '7rem',
      headerClassName: 'text-center',
      cellClassName: 'align-middle max-w-0 overflow-hidden text-center px-2',
      render: (_, row) => (
        <RequestComparison
          intakeMatch={row.intakeMatch}
          directoryMatch={row.directoryMatch}
          directory={liveDirectory}
          requestPerson={row.person}
          needsReview={row.needsReview}
          duplicateGroupId={row.duplicateGroupId}
          variant="table"
          onViewDetails={() => handleOpenRequest(row)}
        />
      ),
    },
    {
      key: 'markAs',
      label: 'Mark as',
      width: '5rem',
      minWidth: '5rem',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'text-center align-middle whitespace-nowrap pl-1 pr-0 py-2',
      render: (_, row) => (
        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              if (row.duplicateGroupId) {
                handleOpenRequest(row);
              } else {
                setConfirmActionRequest({ request: row, adminNote: '' });
              }
            }}
            className={`min-w-[4.75rem] w-[4.75rem] text-center px-1.5 py-1.5 text-xs font-semibold rounded-md border transition-all cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.12)] active:translate-y-px active:shadow-none shrink-0 ${
              row.action === 'Add'
                ? 'bg-[#16a34a] text-white border-[#15803d] hover:bg-[#15803d]'
                : 'bg-[#dc2626] text-white border-[#b91c1c] hover:bg-[#b91c1c]'
            }`}
          >
            {row.action === 'Add' ? 'Added' : 'Removed'}
          </button>
        </div>
      ),
    },
    {
      key: 'open',
      label: '',
      width: '1.5rem',
      minWidth: '1.5rem',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'text-center align-middle whitespace-nowrap pl-0 pr-1 py-2',
      render: () => (
        <div className="flex items-center justify-center" aria-hidden="true">
          <ArrowRight className="h-4 w-4 text-[var(--color-brand-secondary)]" />
        </div>
      )
    },
  ];

  const displayedRows = filteredRequests;
  const listResetKey = [
    actionTab,
    searchQuery,
    filterDate,
    filterLocation,
    filterClub,
    filterSentVia,
    filterNeedsReview,
    filterStatus,
    sortPreset,
  ].join('|');
  const {
    pageItems,
    page,
    setPage,
    totalPages,
    total,
    pageStart,
    pageEnd,
  } = useClientPagination(displayedRows, { pageSize: 20, resetKey: listResetKey });

  return (
    <AdminPageScroll>
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
            label: 'Sent via', value: filterSentVia, onChange: setFilterSentVia,
            options: [
              { value: 'All', label: 'All' },
              { value: TAG_PARTNER_REQUEST, label: 'Manager Form' },
              { value: TAG_AUTO_MAIL, label: 'Automated email' },
              { value: SENT_VIA_BOTH, label: 'Both' },
            ]
          },
          {
            label: 'Needs review', value: filterNeedsReview, onChange: setFilterNeedsReview,
            options: [
              { value: 'All', label: 'All' },
              { value: 'Yes', label: 'Yes' },
              { value: 'No', label: 'No' },
            ]
          },
          {
            label: 'Status', value: filterStatus, onChange: setFilterStatus,
            options: [
              { value: 'All', label: 'All' },
              { value: 'Not added', label: 'Not added' },
              { value: 'Not removed', label: 'Not removed' },
              { value: 'Already exists', label: 'Already exists' },
              { value: 'Confirmed Duplicate', label: 'Confirmed Duplicate' },
              { value: 'Potential Duplicate', label: 'Potential Duplicate' },
            ]
          },
        ]}
        sortPreset={sortPreset}
        setSortPreset={setSortPreset}
      />

      <NewRequestsMobileList
        rows={pageItems}
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
          rows={pageItems}
          onRowClick={handleOpenRequest}
          getRowClassName={getRequestRowClassName}
          emptyMessage={`No ${actionTab === 'All' ? '' : `${actionTab.toLowerCase()} `}requests matching your filters.`}
          compact
          centerHeaders
          accent
          loading={tableLoading}
        />
      </div>

      <TablePagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageStart={pageStart}
        pageEnd={pageEnd}
        onPageChange={setPage}
        noun="requests"
      />

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
                  ? 'bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)]'
                  : 'bg-gray-300'
              }`}
            >
              {action === 'Add'
                ? (personForms.length === 1 ? 'Add to Directory' : `Add ${personForms.length} Users to Directory`)
                : (personForms.length === 1 ? 'Create Request' : `Create ${personForms.length} Requests`)}
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateRequest} noValidate className="space-y-4 text-left">
          <div className="space-y-3">
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Manager Details <span className="font-semibold normal-case tracking-normal text-[var(--color-text-muted)]">(optional)</span>
            </span>
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
              {formatPersonName(confirmActionRequest.request.person)}
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

    </AdminPageScroll>
  );
}
