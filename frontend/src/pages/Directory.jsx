import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Search, Download, Info, SortAsc, ChevronDown, Filter, ArrowRight, Mail, UserRound, CheckCircle2 } from 'lucide-react';

import { formatTimestampSplit } from '../utils/dateTime';
import { DataTable, Tag, Drawer, SelectDropdown, StackedTextCell, TruncateCell, EMPTY_CELL, CountTabs, AdminPageScroll, TablePagination } from '../components/ui';
import PageHeader from '../components/layout/PageHeader';
import { loadWithCache } from '../utils/pilot2Api';
import { fetchJson } from '../utils/api';
import { useClientPagination } from '../hooks/useClientPagination';
import {
  registerDirectoryPageVisit,
  isDirectoryPersonHighlighted,
  clearDirectoryPersonHighlight,
  ADMIN_NEW_ROW_HIGHLIGHT_CLASS,
} from '../utils/adminUiHighlights';
import { formatRequestDisplayId, formatAdminDateTime, formatAdminDate } from '../utils/requestDisplayId';
import { formatManagerNotes, readManagerNotes, MANAGER_NOTES_EMPTY_LABEL } from '../utils/managerNotes';
import { csvCell } from '../utils/csvSafe';
import { getDirectoryManagerColumnContent } from '../utils/manualEntry';
import { formatPersonFields } from '../utils/personDisplay';
import { usePartners } from '../context/PartnerContext';

const directoryHighlightClass = (row) =>
  isDirectoryPersonHighlighted(row.email) ? ADMIN_NEW_ROW_HIGHLIGHT_CLASS : '';

const personManagerName = (user) => user.managerName || '';
const personHandledBy = (user) => user.handledBy || user.addedBy || 'Power Music Admin';
const personAdminNotes = (user) => user.adminNotes || '';
const formatAdminNotes = (user) => personAdminNotes(user).trim() || MANAGER_NOTES_EMPTY_LABEL;

function buildFallbackHistory(user) {
  const events = [];
  if (user?.dateAdded) {
    events.push({
      id: `${user.id}-handled`,
      type: 'handled',
      at: user.dateAdded,
      title: `Marked as ${user.status}`,
      detail: `By ${personHandledBy(user)}`,
      displayId: user.displayId,
    });
  }
  if (user?.requestReceivedAt) {
    events.push({
      id: `${user.id}-manager-request`,
      type: 'manager_request',
      at: user.requestReceivedAt,
      title: 'Manager request received',
      detail: personManagerName(user)
        ? `Submitted by ${personManagerName(user)}`
        : null,
      displayId: user.displayId,
    });
  }
  return events;
}

function historyIcon(type) {
  if (type === 'auto_mail') return Mail;
  if (type === 'handled') return CheckCircle2;
  return UserRound;
}

function DrawerMetaRow({ label, value, mono = false }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-[11px] font-medium text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd
        className={`min-w-0 text-right text-xs font-semibold text-[var(--color-text-primary)] ${
          mono ? 'font-mono break-all' : 'break-words'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function DrawerSection({ title, children, className = '' }) {
  return (
    <section
      className={`rounded-xl border border-[var(--color-border-default)] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(26,26,46,0.04)] ${className}`.trim()}
    >
      <h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function requestIdsMatch(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function findLedgerRowForRequestId(ledger, requestId) {
  return (ledger ?? []).find((user) =>
    requestIdsMatch(user.id, requestId) || requestIdsMatch(user.sourceRequestId, requestId),
  );
}

const SORT_PRESETS = [
  { value: 'displayId-desc', label: 'ID (newest first)' },
  { value: 'displayId-asc', label: 'ID (oldest first)' },
  { value: 'dateAdded-desc', label: 'Timestamp (newest first)' },
  { value: 'dateAdded-asc', label: 'Timestamp (oldest first)' },
  { value: 'personName-asc', label: 'Person name (A–Z)' },
  { value: 'personName-desc', label: 'Person name (Z–A)' },
  { value: 'personEmail-asc', label: 'Person email (A–Z)' },
  { value: 'personEmail-desc', label: 'Person email (Z–A)' },
  { value: 'personLocation-asc', label: 'Person location (A–Z)' },
  { value: 'personLocation-desc', label: 'Person location (Z–A)' },
  { value: 'managerName-asc', label: 'Manager name (A–Z)' },
  { value: 'managerName-desc', label: 'Manager name (Z–A)' }
];

const DEFAULT_SORT = 'displayId-desc';

function parseSortPreset(preset) {
  const match = preset.match(/^(.+)-(asc|desc)$/);
  if (!match) return { field: 'displayId', dir: 'asc' };
  return { field: match[1], dir: match[2] };
}

// ─── Controls Bar ─────────────────────────────────────────────────────────────
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
              placeholder="Search name, email, club or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-xs leading-none cursor-pointer"
              >
                ✕
              </button>
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

const buildFilterOptions = (values) => [
  { value: 'All', label: 'All' },
  ...values.map((v) => ({ value: v, label: v }))
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTimestamp(iso) {
  return formatTimestampSplit(iso);
}

const TimestampCell = ({ val }) => {
  if (!val) return <span className="text-xs text-[var(--color-text-muted)]">{EMPTY_CELL}</span>;
  const { date, time } = formatTimestamp(val);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">{date}</span>
      <span className="text-xs text-[var(--color-text-muted)]">{time}</span>
    </div>
  );
};

function DirectoryMobileList({
  rows,
  loading,
  emptyMessage,
  onOpenUser,
  highlightVersion,
  getRowClassName,
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
        void highlightVersion;
        const extraClass = getRowClassName ? getRowClassName(row) : '';
        const { name, email, location } = formatPersonFields(row);
        const manager = getDirectoryManagerColumnContent(row);

        return (
          <li key={row.id} className="border-b border-[var(--color-border-default)] last:border-b-0">
            <button
              type="button"
              onClick={() => onOpenUser(row)}
              aria-label={`View ${name}`}
              className={`flex w-full flex-col gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f9fafb] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-brand-primary)]/35 ${extraClass}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold tabular-nums text-[var(--color-text-muted)]">
                      {formatRequestDisplayId(row.displayId)}
                    </span>
                    <Tag variant={row.status === 'Added' ? 'added' : 'removed'} label={row.status} compact />
                  </div>

                  <TimestampCell val={row.dateAdded} />

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
                    <p className={`mt-0.5 truncate text-xs font-semibold ${
                      manager.muted ? 'text-[var(--color-text-muted)] italic' : 'text-[var(--color-text-primary)]'
                    }`}>
                      {manager.primary}
                    </p>
                    {manager.secondary ? (
                      <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-secondary)]">
                        {manager.secondary}
                      </p>
                    ) : null}
                    {manager.tertiary ? (
                      <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">
                        <span className="font-semibold">Club:</span> {manager.tertiary}
                      </p>
                    ) : null}
                  </div>
                </div>
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function UserLedger() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestIdFromUrl = searchParams.get('id');
  const consumedDirectoryDeepLinkRef = useRef(null);
  const { selectedPartnerId } = usePartners();
  const [liveUserLedger, setLiveUserLedger] = useState([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [highlightVersion, setHighlightVersion] = useState(0);

  useEffect(() => {
    registerDirectoryPageVisit(location.key);
    setHighlightVersion((v) => v + 1);
  }, [location.key]);

  useEffect(() => {
    const cacheKey = selectedPartnerId ? `directory_persons:${selectedPartnerId}` : 'directory_persons';
    const query = selectedPartnerId ? `?partner_id=${encodeURIComponent(selectedPartnerId)}` : '';
    // Cached copy renders instantly; fresh data replaces it.
    const applyPersons = (data) => {
      setLiveUserLedger(Array.isArray(data) ? data : []);
      setTableLoading(false);
    };
    const load = () => {
      loadWithCache(cacheKey, () =>
        fetchJson(`/api/persons${query}`),
        applyPersons,
      ).catch((err) => {
        console.error(err);
        setTableLoading(false);
      });
    };
    load();
    const refresh = () => { if (!document.hidden) load(); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [selectedPartnerId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusTab, setStatusTab] = useState(() => {
    const pending = sessionStorage.getItem('pm_directory_pending_tab');
    if (pending === 'Added' || pending === 'Removed' || pending === 'All') {
      sessionStorage.removeItem('pm_directory_pending_tab');
      return pending;
    }
    return 'All';
  });
  const [filterFirstName, setFilterFirstName] = useState('All');
  const [filterLastName, setFilterLastName] = useState('All');
  const [filterEmail, setFilterEmail] = useState('All');
  const [filterLocation, setFilterLocation] = useState('All');
  const [filterClub, setFilterClub] = useState('All');
  const [selectedUser, setSelectedUser] = useState(null);
  const selectedUserRef = useRef(selectedUser);
  selectedUserRef.current = selectedUser;
  const [sortPreset, setSortPreset] = useState(DEFAULT_SORT);
  const [filterOpen, setFilterOpen] = useState(true);

  const handleStatusTabSwitch = (tab) => {
    setStatusTab(tab);
    setSearchQuery('');
    setFilterFirstName('All');
    setFilterLastName('All');
    setFilterEmail('All');
    setFilterLocation('All');
    setFilterClub('All');
    setSortPreset(DEFAULT_SORT);
    setFilterOpen(true);
  };

  const addedCount = liveUserLedger.filter((u) => u.status === 'Added').length;
  const removedCount = liveUserLedger.filter((u) => u.status === 'Removed').length;
  const allCount = liveUserLedger.length;

  const statusTabRows = useMemo(
    () => (statusTab === 'All' ? liveUserLedger : liveUserLedger.filter((u) => u.status === statusTab)),
    [statusTab, liveUserLedger]
  );

  const firstNameOptions = useMemo(
    () => buildFilterOptions(
      [...new Set(statusTabRows.map((u) => u.firstName).filter(Boolean))].sort()
    ),
    [statusTabRows]
  );

  const lastNameOptions = useMemo(
    () => buildFilterOptions(
      [...new Set(statusTabRows.map((u) => u.lastName).filter(Boolean))].sort()
    ),
    [statusTabRows]
  );

  const emailOptions = useMemo(
    () => buildFilterOptions(
      [...new Set(statusTabRows.map((u) => u.email).filter(Boolean))].sort()
    ),
    [statusTabRows]
  );

  const locationOptions = useMemo(
    () => buildFilterOptions(
      [...new Set(statusTabRows.map((u) => u.location).filter(Boolean))].sort()
    ),
    [statusTabRows]
  );

  const clubOptions = useMemo(
    () => buildFilterOptions(
      [...new Set(statusTabRows.map((u) => u.club).filter(Boolean))].sort()
    ),
    [statusTabRows]
  );

  const filteredLedger = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const { field, dir } = parseSortPreset(sortPreset);
    const sortDir = dir === 'asc' ? 1 : -1;

    const filtered = statusTabRows.filter((user) => {
      const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
      const matchesSearch =
        query === '' ||
        fullName.includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.location.toLowerCase().includes(query) ||
        personManagerName(user).toLowerCase().includes(query) ||
        (user.managerEmail && user.managerEmail.toLowerCase().includes(query)) ||
        user.club.toLowerCase().includes(query) ||
        (readManagerNotes(user) && readManagerNotes(user).toLowerCase().includes(query)) ||
        (personAdminNotes(user) && personAdminNotes(user).toLowerCase().includes(query));
      const matchesFirstName = filterFirstName === 'All' || user.firstName === filterFirstName;
      const matchesLastName = filterLastName === 'All' || user.lastName === filterLastName;
      const matchesEmail = filterEmail === 'All' || user.email === filterEmail;
      const matchesLocation = filterLocation === 'All' || user.location === filterLocation;
      const matchesClub = filterClub === 'All' || user.club === filterClub;
      return matchesSearch && matchesFirstName && matchesLastName && matchesEmail && matchesLocation && matchesClub;
    });

    return [...filtered].sort((a, b) => {
      if (field === 'managerName') return personManagerName(a).localeCompare(personManagerName(b)) * sortDir;
      if (field === 'personName') {
        const nA = `${a.firstName} ${a.lastName}`.toLowerCase();
        const nB = `${b.firstName} ${b.lastName}`.toLowerCase();
        return nA.localeCompare(nB) * sortDir;
      }
      if (field === 'personEmail') {
        return (a.email || '').localeCompare(b.email || '') * sortDir;
      }
      if (field === 'personLocation') {
        return (a.location || '').localeCompare(b.location || '') * sortDir;
      }
      if (field === 'dateAdded') return (new Date(a.dateAdded) - new Date(b.dateAdded)) * sortDir;
      return (a.displayId - b.displayId) * sortDir;
    });
  }, [statusTabRows, searchQuery, filterFirstName, filterLastName, filterEmail, filterLocation, filterClub, sortPreset]);

  const activeFilterCount = [
    filterFirstName !== 'All',
    filterLastName !== 'All',
    filterEmail !== 'All',
    filterLocation !== 'All',
    filterClub !== 'All'
  ].filter(Boolean).length;

  const handleOpenUser = (row) => {
    clearDirectoryPersonHighlight(row.email);
    setHighlightVersion((v) => v + 1);
    setSelectedUser(row);
  };

  useEffect(() => {
    consumedDirectoryDeepLinkRef.current = null;
  }, [requestIdFromUrl]);

  useLayoutEffect(() => {
    if (!requestIdFromUrl || tableLoading || !liveUserLedger.length) return;

    const row = findLedgerRowForRequestId(liveUserLedger, requestIdFromUrl);
    if (!row) return;

    if (
      consumedDirectoryDeepLinkRef.current === requestIdFromUrl
      && selectedUserRef.current
      && requestIdsMatch(selectedUserRef.current.id, row.id)
    ) {
      return;
    }

    consumedDirectoryDeepLinkRef.current = requestIdFromUrl;
    if (row.status === 'Added' || row.status === 'Removed') {
      setStatusTab(row.status);
    }
    clearDirectoryPersonHighlight(row.email);
    setHighlightVersion((v) => v + 1);
    setSelectedUser(row);
  }, [requestIdFromUrl, liveUserLedger, tableLoading]);

  const handleExportCSV = () => {
    const headers = ['ID', 'Person Name', 'Person Email', 'Location', 'Status', 'Date Added', 'Manager Name', 'Manager Email', 'Club', 'Manager notes', 'Admin notes'];
    const csvRows = filteredLedger.map((user) =>
      [
        formatRequestDisplayId(user.displayId),
        `${user.firstName} ${user.lastName}`,
        user.email,
        user.location,
        user.status,
        formatAdminDate(user.dateAdded),
        personManagerName(user),
        user.managerEmail || '',
        user.club,
        readManagerNotes(user),
        personAdminNotes(user),
      ].map(csvCell).join(',')
    );
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'user-ledger-export.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns = [
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
      key: 'dateAdded',
      label: 'Timestamp',
      width: '108px',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'align-middle whitespace-nowrap',
      render: (val) => <TimestampCell val={val} />
    },
    {
      key: 'personName',
      label: 'Person Name',
      width: '18%',
      headerClassName: 'text-center',
      cellClassName: 'align-middle text-left max-w-0 overflow-hidden',
      render: (_, row) => {
        const { name } = formatPersonFields(row);
        return (
          <TruncateCell className="text-xs font-semibold text-[var(--color-text-primary)]" title={name}>
            {name}
          </TruncateCell>
        );
      },
    },
    {
      key: 'personEmail',
      label: 'Person Email',
      width: '20%',
      headerClassName: 'text-center',
      cellClassName: 'align-middle text-left max-w-0 overflow-hidden',
      render: (_, row) => {
        const { email } = formatPersonFields(row);
        return (
          <TruncateCell className="text-xs font-mono text-[var(--color-text-secondary)]" title={email}>
            {email}
          </TruncateCell>
        );
      },
    },
    {
      key: 'personLocation',
      label: 'Person Location',
      width: '16%',
      headerClassName: 'text-center',
      cellClassName: 'align-middle text-left max-w-0 overflow-hidden',
      render: (_, row) => {
        const { location } = formatPersonFields(row);
        return (
          <TruncateCell className="text-xs text-[var(--color-text-muted)]" title={location}>
            {location}
          </TruncateCell>
        );
      },
    },
    {
      key: 'manager',
      label: 'Manager',
      width: '22%',
      wrap: true,
      headerClassName: 'text-center',
      cellClassName: 'align-top text-left',
      render: (_, row) => {
        const manager = getDirectoryManagerColumnContent(row);
        return (
          <StackedTextCell
            primary={manager.primary}
            secondary={manager.secondary || undefined}
            tertiary={manager.tertiary || undefined}
            primaryClassName={manager.muted ? 'font-medium text-[var(--color-text-muted)] italic' : ''}
            truncate={false}
          />
        );
      }
    },
    {
      key: 'status',
      label: 'Status',
      width: '72px',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'align-middle whitespace-nowrap text-center',
      render: (val) => <Tag variant={val === 'Added' ? 'added' : 'removed'} label={val} />
    },
    {
      key: 'open',
      label: '',
      width: '40px',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'text-center align-middle whitespace-nowrap px-1',
      render: () => (
        <div className="flex items-center justify-center" aria-hidden="true">
          <ArrowRight className="h-4 w-4 text-[var(--color-brand-secondary)]" />
        </div>
      )
    }
  ];

  const statusTabs = [
    { key: 'All', label: 'All', count: allCount },
    { key: 'Added', label: 'Added', count: addedCount },
    { key: 'Removed', label: 'Removed', count: removedCount }
  ];

  const listResetKey = [statusTab, searchQuery, filterFirstName, filterLastName, filterEmail, filterLocation, filterClub, sortPreset].join('|');
  const {
    pageItems,
    page,
    setPage,
    totalPages,
    total,
    pageStart,
    pageEnd,
  } = useClientPagination(filteredLedger, { pageSize: 20, resetKey: listResetKey });

  return (
    <AdminPageScroll>
      <PageHeader
        section="Partner Support"
        title="Users"
        description="View and export the record of added and removed partner users."
        workspace
        actions={
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors shadow-sm cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        }
        footer={
          <CountTabs
            value={statusTab}
            onChange={handleStatusTabSwitch}
            tabs={statusTabs}
          />
        }
      />

      {/* Controls Bar */}
      <ControlsBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterOpen={filterOpen}
        setFilterOpen={setFilterOpen}
        activeFilterCount={activeFilterCount}
        filterSlots={[
          {
            label: 'Person First Name',
            value: filterFirstName,
            onChange: setFilterFirstName,
            options: firstNameOptions
          },
          {
            label: 'Person Last Name',
            value: filterLastName,
            onChange: setFilterLastName,
            options: lastNameOptions
          },
          {
            label: 'Person Email',
            value: filterEmail,
            onChange: setFilterEmail,
            options: emailOptions
          },
          {
            label: 'Person Location',
            value: filterLocation,
            onChange: setFilterLocation,
            options: locationOptions
          },
          {
            label: 'Manager Club',
            value: filterClub,
            onChange: setFilterClub,
            options: clubOptions
          }
        ]}
        sortPreset={sortPreset}
        setSortPreset={setSortPreset}
      />

      {/* Table */}
      <DirectoryMobileList
        rows={pageItems}
        loading={tableLoading}
        emptyMessage={`No ${statusTab === 'All' ? '' : statusTab.toLowerCase() + ' '}users matching your search.`}
        onOpenUser={handleOpenUser}
        highlightVersion={highlightVersion}
        getRowClassName={(row) => {
          void highlightVersion;
          return directoryHighlightClass(row);
        }}
      />

      <div className="hidden w-full sm:block">
        <DataTable
          columns={columns}
          rows={pageItems}
          onRowClick={handleOpenUser}
          getRowClassName={(row) => {
            void highlightVersion;
            return directoryHighlightClass(row);
          }}
          emptyMessage={`No ${statusTab === 'All' ? '' : statusTab.toLowerCase() + ' '}users matching your search.`}
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
        noun="records"
      />

      {/* History Drawer */}
      <Drawer
        isOpen={selectedUser !== null}
        onClose={() => setSelectedUser(null)}
        title={selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName}` : 'User details'}
        hideHeader
      >
        {selectedUser && (() => {
          const history =
            Array.isArray(selectedUser.requestHistory) && selectedUser.requestHistory.length
              ? selectedUser.requestHistory
              : buildFallbackHistory(selectedUser);
          const { name: fullName, email: personEmail, location: personLocation } = formatPersonFields(selectedUser);
          const manager = getDirectoryManagerColumnContent(selectedUser);
          const nameParts = fullName === 'No name' ? [] : fullName.split(/\s+/).filter(Boolean);
          const initials = (
            nameParts.length >= 2
              ? `${nameParts[0][0] || ''}${nameParts[nameParts.length - 1][0] || ''}`
              : (nameParts[0] || '?').slice(0, 2)
          ).toUpperCase();
          const isAdded = selectedUser.status === 'Added';

          return (
            <div className="space-y-3 text-left select-none">
              <div className="rounded-2xl border border-[var(--color-border-default)] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(26,26,46,0.04)]">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-brand-secondary-muted)] text-sm font-bold tracking-tight text-[var(--color-brand-primary)] ring-1 ring-[var(--color-brand-secondary-border)]/50">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1 pr-10">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-bold text-[var(--color-text-primary)]">
                        {fullName}
                      </h3>
                      <Tag
                        variant={isAdded ? 'added' : 'removed'}
                        label={selectedUser.status}
                        compact
                      />
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-[var(--color-text-secondary)]">
                      {personEmail}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                      {personLocation}
                    </p>
                  </div>
                </div>
                <dl className="mt-4 space-y-2 border-t border-[var(--color-border-default)] pt-3">
                  <DrawerMetaRow label="Request ID" value={formatRequestDisplayId(selectedUser.displayId)} />
                  <DrawerMetaRow label="Handled" value={formatAdminDateTime(selectedUser.dateAdded)} />
                  <DrawerMetaRow label="Handled by" value={personHandledBy(selectedUser)} />
                </dl>
              </div>

              <DrawerSection title="Manager details">
                <p className={`text-sm font-semibold ${
                  manager.muted ? 'italic text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'
                }`}>
                  {manager.primary}
                </p>
                <dl className="mt-2.5 space-y-2">
                  {manager.secondary ? (
                    <DrawerMetaRow label="Detail" value={manager.secondary} mono={!manager.muted} />
                  ) : null}
                  {manager.tertiary ? (
                    <DrawerMetaRow label="Club" value={manager.tertiary} />
                  ) : null}
                </dl>
              </DrawerSection>

              <DrawerSection title="Notes from manager">
                <p
                  className={`text-xs leading-relaxed ${
                    readManagerNotes(selectedUser)
                      ? 'whitespace-pre-wrap text-[var(--color-text-primary)]'
                      : 'italic text-[var(--color-text-muted)]'
                  }`}
                >
                  {formatManagerNotes(selectedUser)}
                </p>
              </DrawerSection>

              <DrawerSection title="Notes by admin">
                <p
                  className={`text-sm leading-normal ${
                    personAdminNotes(selectedUser).trim()
                      ? 'whitespace-pre-wrap text-[var(--color-text-primary)]'
                      : 'italic text-[var(--color-text-muted)]'
                  }`}
                >
                  {formatAdminNotes(selectedUser)}
                </p>
              </DrawerSection>

              <DrawerSection title="Request history">
                {history.length === 0 ? (
                  <p className="text-xs italic text-[var(--color-text-muted)]">No history available.</p>
                ) : (
                  <ol className="relative space-y-0 border-l border-[var(--color-border-default)] pl-5">
                    {history.map((event, index) => {
                      const Icon = historyIcon(event.type);
                      const isLast = index === history.length - 1;
                      return (
                        <li key={event.id || `${event.type}-${event.at}-${index}`} className={`relative ${isLast ? '' : 'pb-4'}`}>
                          <span className="absolute -left-[27px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-surface-panel)] text-[var(--color-text-secondary)] ring-2 ring-white">
                            <Icon className="h-3 w-3" aria-hidden="true" />
                          </span>
                          <time className="block text-[11px] font-semibold text-[var(--color-text-muted)]">
                            {event.at ? formatAdminDateTime(event.at) : EMPTY_CELL}
                          </time>
                          <p className="mt-0.5 text-xs font-semibold text-[var(--color-text-primary)]">
                            {event.title}
                          </p>
                          {event.detail ? (
                            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                              {event.detail}
                            </p>
                          ) : null}
                          {event.displayId != null ? (
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                              {formatRequestDisplayId(event.displayId)}
                              {event.action ? ` · ${event.action}` : ''}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </DrawerSection>

              {isAdded && (
                <div className="flex items-start gap-2.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-panel)] p-4">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
                  <span className="text-xs font-semibold leading-normal text-[var(--color-text-secondary)]">
                    This user will trigger a duplicate warning on new Manager Form submissions.
                  </span>
                </div>
              )}
            </div>
          );
        })()}
      </Drawer>
    </AdminPageScroll>
  );
}
