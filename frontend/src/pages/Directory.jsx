import { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Download, Info, SortAsc, ChevronDown, Filter, Eye } from 'lucide-react';

import { format, parseISO } from 'date-fns';
import { DataTable, Tag, Drawer, SelectDropdown, StackedTextCell, TruncateCell, EMPTY_CELL } from '../components/ui';
import PageHeader from '../components/layout/PageHeader';
import { loadWithCache } from '../utils/pilot2Api';
import { fetchJson } from '../utils/api';
import {
  registerDirectoryPageVisit,
  isDirectoryPersonHighlighted,
  clearDirectoryPersonHighlight,
  ADMIN_NEW_ROW_HIGHLIGHT_CLASS,
} from '../utils/adminUiHighlights';
import { formatRequestDisplayId, formatAdminDateTime, formatAdminDate } from '../utils/requestDisplayId';
import { csvCell } from '../utils/csvSafe';

const directoryHighlightClass = (row) =>
  isDirectoryPersonHighlighted(row.email) ? ADMIN_NEW_ROW_HIGHLIGHT_CLASS : '';

const personManagerName = (user) => user.managerName || '';
const personHandledBy = (user) => user.handledBy || user.addedBy || 'Power Music Admin';
const personManagerNotes = (user) => user.managerNotes || user.notes || '';
const personAdminNotes = (user) => user.adminNotes || '';

const SORT_PRESETS = [
  { value: 'displayId-desc', label: 'ID (newest first)' },
  { value: 'displayId-asc', label: 'ID (oldest first)' },
  { value: 'dateAdded-desc', label: 'Timestamp (newest first)' },
  { value: 'dateAdded-asc', label: 'Timestamp (oldest first)' },
  { value: 'personName-asc', label: 'Person name (A–Z)' },
  { value: 'personName-desc', label: 'Person name (Z–A)' },
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

const buildFilterOptions = (values) => [
  { value: 'All', label: 'All' },
  ...values.map((v) => ({ value: v, label: v }))
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTimestamp(iso) {
  try {
    const d = parseISO(iso);
    return { date: format(d, 'dd MMM yyyy'), time: format(d, 'hh:mm a') };
  } catch {
    return { date: iso, time: '' };
  }
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function UserLedger() {
  const location = useLocation();
  const [liveUserLedger, setLiveUserLedger] = useState([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [highlightVersion, setHighlightVersion] = useState(0);

  useEffect(() => {
    registerDirectoryPageVisit(location.key);
    setHighlightVersion((v) => v + 1);
  }, [location.key]);

  useEffect(() => {
    // Cached copy renders instantly; fresh data replaces it.
    const applyPersons = (data) => {
      setLiveUserLedger(Array.isArray(data) ? data : []);
      setTableLoading(false);
    };
    const load = () => {
      loadWithCache('directory_persons', () =>
        fetchJson('/api/persons'),
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
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusTab, setStatusTab] = useState(() => {
    const pending = sessionStorage.getItem('pm_directory_pending_tab');
    if (pending === 'Added' || pending === 'Removed' || pending === 'All') {
      sessionStorage.removeItem('pm_directory_pending_tab');
      return pending;
    }
    return 'All';
  });
  const [filterLocation, setFilterLocation] = useState('All');
  const [filterClub, setFilterClub] = useState('All');
  const [selectedUser, setSelectedUser] = useState(null);
  const [sortPreset, setSortPreset] = useState(DEFAULT_SORT);
  const [filterOpen, setFilterOpen] = useState(true);

  const handleStatusTabSwitch = (tab) => {
    setStatusTab(tab);
    setSearchQuery('');
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
        (personManagerNotes(user) && personManagerNotes(user).toLowerCase().includes(query)) ||
        (personAdminNotes(user) && personAdminNotes(user).toLowerCase().includes(query));
      const matchesLocation = filterLocation === 'All' || user.location === filterLocation;
      const matchesClub = filterClub === 'All' || user.club === filterClub;
      return matchesSearch && matchesLocation && matchesClub;
    });

    return [...filtered].sort((a, b) => {
      if (field === 'managerName') return personManagerName(a).localeCompare(personManagerName(b)) * sortDir;
      if (field === 'personName') {
        const nA = `${a.firstName} ${a.lastName}`.toLowerCase();
        const nB = `${b.firstName} ${b.lastName}`.toLowerCase();
        return nA.localeCompare(nB) * sortDir;
      }
      if (field === 'dateAdded') return (new Date(a.dateAdded) - new Date(b.dateAdded)) * sortDir;
      return (a.displayId - b.displayId) * sortDir;
    });
  }, [statusTabRows, searchQuery, filterLocation, filterClub, sortPreset]);

  const activeFilterCount = [
    filterLocation !== 'All',
    filterClub !== 'All'
  ].filter(Boolean).length;

  const handleOpenUser = (row) => {
    clearDirectoryPersonHighlight(row.email);
    setHighlightVersion((v) => v + 1);
    setSelectedUser(row);
  };

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
        personManagerNotes(user),
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
      key: 'status',
      label: 'Status',
      width: '72px',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'align-middle whitespace-nowrap text-center',
      render: (val) => <Tag variant={val === 'Added' ? 'added' : 'removed'} label={val} />
    },
    {
      key: 'person',
      label: 'Person',
      width: '19%',
      headerClassName: 'text-center',
      cellClassName: 'align-middle max-w-0 overflow-hidden text-left',
      render: (_, row) => {
        const name = `${row.firstName} ${row.lastName}`.trim();
        return (
          <div className="min-w-0">
            <TruncateCell className="text-sm font-semibold text-[var(--color-text-primary)]">
              {name}
            </TruncateCell>
            <TruncateCell className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              {row.email}
            </TruncateCell>
          </div>
        );
      },
    },
    {
      key: 'location',
      label: 'Location',
      width: '9%',
      headerClassName: 'text-center',
      cellClassName: 'align-middle max-w-0 overflow-hidden text-left',
      render: (val) => (
        <TruncateCell className="text-xs text-[var(--color-text-secondary)]">
          {val || EMPTY_CELL}
        </TruncateCell>
      )
    },
    {
      key: 'manager',
      label: 'Manager',
      width: '19%',
      headerClassName: 'text-center',
      cellClassName: 'align-middle max-w-0 overflow-hidden text-left',
      render: (_, row) => (
        <StackedTextCell
          primary={personManagerName(row)}
          secondary={row.managerEmail || EMPTY_CELL}
        />
      )
    },
    {
      key: 'club',
      label: 'Manager Club',
      width: '13%',
      headerClassName: 'text-center',
      cellClassName: 'align-middle max-w-0 overflow-hidden text-left',
      render: (val) => (
        <TruncateCell className="text-xs text-[var(--color-text-secondary)]">
          {val || EMPTY_CELL}
        </TruncateCell>
      )
    },
    {
      key: 'managerNotes',
      label: 'Manager notes',
      width: '11%',
      cellClassName: 'align-middle max-w-0 overflow-hidden',
      render: (_, row) => (
        <TruncateCell className="text-xs text-[var(--color-text-secondary)]">
          {personManagerNotes(row).trim() || EMPTY_CELL}
        </TruncateCell>
      )
    },
    {
      key: 'adminNotes',
      label: 'Admin notes',
      width: '11%',
      cellClassName: 'align-middle max-w-0 overflow-hidden',
      render: (_, row) => (
        <TruncateCell className="text-xs text-[var(--color-text-secondary)]">
          {personAdminNotes(row).trim() || EMPTY_CELL}
        </TruncateCell>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '56px',
      noShrink: true,
      headerClassName: 'text-center',
      cellClassName: 'text-center align-middle whitespace-nowrap px-2',
      render: (_, row) => (
        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => handleOpenUser(row)}
            aria-label="View user details"
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-highlight)] rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <Eye className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  const statusTabs = [
    { key: 'All', label: 'All', count: allCount },
    { key: 'Added', label: 'Added', count: addedCount },
    { key: 'Removed', label: 'Removed', count: removedCount }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 select-none">
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
            <div className="flex items-center bg-[var(--color-surface-panel)] rounded-xl p-1 gap-1 ring-1 ring-[rgba(26,26,46,0.05)] w-fit">
            {statusTabs.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => handleStatusTabSwitch(key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  statusTab === key
                    ? 'bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)] shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {label}
                <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  statusTab === key
                    ? 'bg-[var(--color-brand-primary)] text-white'
                    : 'bg-[var(--color-surface-highlight)] text-[var(--color-text-secondary)]'
                }`}>
                  {count}
                </span>
              </button>
            ))}
            </div>
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
            label: 'User Location',
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
      <div className="w-full">
        <DataTable
          columns={columns}
          rows={filteredLedger}
          onRowClick={handleOpenUser}
          getRowClassName={(row) => {
            void highlightVersion;
            return directoryHighlightClass(row);
          }}
          emptyMessage={`No ${statusTab === 'All' ? '' : statusTab.toLowerCase() + ' '}users matching your search.`}
          compact
          centerHeaders
          loading={tableLoading}
        />
      </div>

      {/* Footer */}
      <div className="px-2 text-xs font-medium text-[var(--color-text-secondary)]">
        {filteredLedger.length} records
      </div>

      {/* History Drawer */}
      <Drawer
        isOpen={selectedUser !== null}
        onClose={() => setSelectedUser(null)}
        title={selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName}` : ''}
      >
        {selectedUser && (
          <div className="space-y-5 text-left select-none">
            <div className="rounded-lg border border-[var(--color-border-default)] bg-white p-4 space-y-2 shadow-[0_1px_2px_rgba(26,26,46,0.04)]">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Status
              </span>
              <div className="flex items-center gap-2">
                <Tag variant={selectedUser.status === 'Added' ? 'added' : 'removed'} label={selectedUser.status} />
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium">
                <div>Request ID: {formatRequestDisplayId(selectedUser.displayId)}</div>
                <div>Handled: {formatAdminDateTime(selectedUser.dateAdded)}</div>
                <div>Handled by: {personHandledBy(selectedUser)}</div>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--color-border-default)] bg-white p-4 space-y-2 shadow-[0_1px_2px_rgba(26,26,46,0.04)]">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                {selectedUser.status === 'Added' ? 'Added person' : 'Removed person'}
              </span>
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                {selectedUser.firstName} {selectedUser.lastName}
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium">
                <div>Email: {selectedUser.email}</div>
                <div>Location: {selectedUser.location}</div>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--color-border-default)] bg-white p-4 space-y-2 shadow-[0_1px_2px_rgba(26,26,46,0.04)]">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Manager details
              </span>
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                {personManagerName(selectedUser) || EMPTY_CELL}
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium">
                {selectedUser.managerEmail && <div>Email: {selectedUser.managerEmail}</div>}
                <div>Club: {selectedUser.club}</div>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--color-border-default)] bg-white p-4 space-y-2 shadow-[0_1px_2px_rgba(26,26,46,0.04)]">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Notes by manager
              </span>
              <p className="text-sm text-[var(--color-text-primary)] leading-normal whitespace-pre-wrap">
                {personManagerNotes(selectedUser).trim() ? personManagerNotes(selectedUser) : EMPTY_CELL}
              </p>
            </div>

            <div className="rounded-lg border border-[var(--color-border-default)] bg-white p-4 space-y-2 shadow-[0_1px_2px_rgba(26,26,46,0.04)]">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Notes by admin
              </span>
              <p className="text-sm text-[var(--color-text-primary)] leading-normal whitespace-pre-wrap">
                {personAdminNotes(selectedUser).trim() ? personAdminNotes(selectedUser) : EMPTY_CELL}
              </p>
            </div>

            <div className="space-y-3 border-t border-[var(--color-border-default)] pt-3">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Request history
              </span>
              <div className="relative space-y-5 border-l border-[var(--color-border-default)] py-1 pl-6">
                <div className="relative">
                  <div className="absolute -left-[29px] top-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white bg-[var(--color-brand-primary)] shadow-sm" />
                  <time className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
                    {formatAdminDateTime(selectedUser.dateAdded)}
                  </time>
                  <div className="mt-0.5 text-xs font-semibold text-[var(--color-text-primary)]">
                    Marked as {selectedUser.status} by {personHandledBy(selectedUser)}
                  </div>
                </div>
                {selectedUser.requestReceivedAt ? (
                  <div className="relative">
                    <div className="absolute -left-[29px] top-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white bg-gray-300 shadow-sm" />
                    <time className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
                      {formatAdminDateTime(selectedUser.requestReceivedAt)}
                    </time>
                    <div className="mt-0.5 text-xs font-semibold text-[var(--color-text-primary)]">
                      Request submitted by {personManagerName(selectedUser)}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {selectedUser.status === 'Added' && (
              <div className="flex items-start gap-2.5 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-panel)] p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand-primary)]" />
                <span className="text-xs font-semibold leading-normal text-[var(--color-text-secondary)]">
                  This user will trigger a duplicate warning on new Manager Form submissions.
                </span>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
