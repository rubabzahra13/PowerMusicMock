import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Download, Info, SortAsc, ChevronDown, Filter, Eye } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { DataTable, Tag, Drawer, SelectDropdown } from '../components/ui';
import PageHeader from '../components/layout/PageHeader';
import { loadWithCache } from '../utils/pilot2Api';
import { getApiUrl } from '../utils/api';

const SORT_PRESETS = [
  { value: 'displayId-asc', label: 'ID (oldest first)' },
  { value: 'displayId-desc', label: 'ID (newest first)' },
  { value: 'dateAdded-desc', label: 'Timestamp (newest first)' },
  { value: 'dateAdded-asc', label: 'Timestamp (oldest first)' },
  { value: 'personName-asc', label: 'Person name (A–Z)' },
  { value: 'personName-desc', label: 'Person name (Z–A)' },
  { value: 'managerName-asc', label: 'Manager name (A–Z)' },
  { value: 'managerName-desc', label: 'Manager name (Z–A)' }
];

const DEFAULT_SORT = 'displayId-asc';

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
const formatDisplayId = (displayId) => `R-${String(displayId).padStart(2, '0')}`;

const TimestampCell = ({ val }) => {
  try {
    const d = parseISO(val);
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">{format(d, 'dd MMM yyyy')}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{format(d, 'hh:mm a')}</span>
      </div>
    );
  } catch {
    return <span className="text-xs text-[var(--color-text-secondary)]">{val}</span>;
  }
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function UserLedger() {
  const [liveUserLedger, setLiveUserLedger] = useState([]);

  useEffect(() => {
    // Cached copy renders instantly; fresh data replaces it.
    const load = () => {
      loadWithCache('directory_persons', () =>
        fetch(getApiUrl('/api/persons')).then((res) => res.json()),
        setLiveUserLedger,
      ).catch((err) => console.error(err));
    };
    load();
    const refresh = () => { if (!document.hidden) load(); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusTab, setStatusTab] = useState('All');
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

  const formatDate = (iso) => {
    try { return format(parseISO(iso), 'dd MMM yyyy'); }
    catch { return iso; }
  };

  const getEarlierDateStr = (iso) => {
    try {
      const d = parseISO(iso);
      return format(new Date(d.getTime() - 24 * 60 * 60 * 1000), 'dd MMM yyyy');
    } catch { return iso; }
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
        user.addedBy.toLowerCase().includes(query) ||
        (user.managerEmail && user.managerEmail.toLowerCase().includes(query)) ||
        user.club.toLowerCase().includes(query) ||
        (user.notes && user.notes.toLowerCase().includes(query));
      const matchesLocation = filterLocation === 'All' || user.location === filterLocation;
      const matchesClub = filterClub === 'All' || user.club === filterClub;
      return matchesSearch && matchesLocation && matchesClub;
    });

    return [...filtered].sort((a, b) => {
      if (field === 'managerName') return a.addedBy.localeCompare(b.addedBy) * sortDir;
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

  const handleExportCSV = () => {
    const headers = ['ID', 'Person Name', 'Person Email', 'Location', 'Status', 'Date Added', 'Manager Name', 'Manager Email', 'Club', 'Notes'];
    const csvRows = filteredLedger.map((user) =>
      [
        formatDisplayId(user.displayId),
        `${user.firstName} ${user.lastName}`,
        user.email,
        user.location,
        user.status,
        formatDate(user.dateAdded),
        user.addedBy,
        user.managerEmail || '',
        user.club,
        user.notes || ''
      ].map((val) => `"${String(val).replace(/"/g, '""')}"`).join(',')
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
      width: '60px',
      render: (val) => (
        <span className="text-xs font-bold text-[var(--color-text-muted)]">{formatDisplayId(val)}</span>
      )
    },
    {
      key: 'dateAdded',
      label: 'Timestamp',
      width: '130px',
      render: (val) => <TimestampCell val={val} />
    },
    {
      key: 'status',
      label: 'Status',
      width: '80px',
      render: (val) => <Tag variant={val === 'Added' ? 'added' : 'removed'} label={val} />
    },
    {
      key: 'personName',
      label: 'Person Name',
      width: '110px',
      render: (_, row) => (
        <span className="font-semibold text-sm text-[var(--color-text-primary)]">
          {row.firstName} {row.lastName}
        </span>
      )
    },
    {
      key: 'email',
      label: 'Person Email',
      width: '150px',
      render: (val) => <span className="text-xs text-[var(--color-text-secondary)]">{val}</span>
    },
    {
      key: 'location',
      label: 'Location',
      width: '95px',
      render: (val) => <span className="text-xs text-[var(--color-text-secondary)]">{val}</span>
    },
    {
      key: 'managerName',
      label: 'Manager Name',
      width: '120px',
      render: (_, row) => (
        <span className="font-semibold text-sm text-[var(--color-text-primary)]">{row.addedBy}</span>
      )
    },
    {
      key: 'managerEmail',
      label: 'Manager Email',
      width: '155px',
      render: (_, row) => (
        <span className="text-xs text-[var(--color-text-secondary)]">{row.managerEmail || '—'}</span>
      )
    },
    {
      key: 'club',
      label: 'Manager Club',
      width: '130px',
      cellClassName: 'align-middle whitespace-normal break-words leading-snug',
      render: (val) => <span className="text-xs text-[var(--color-text-secondary)]">{val}</span>
    },
    {
      key: 'notes',
      label: 'Notes',
      cellClassName: 'align-middle whitespace-normal break-words leading-snug',
      render: (val) => (
        <span className="text-xs text-[var(--color-text-secondary)]">
          {val?.trim() || ''}
        </span>
      )
    },
    {
      key: 'actions',
      label: '',
      width: '48px',
      headerClassName: 'text-center',
      cellClassName: 'text-center align-middle whitespace-nowrap',
      render: (_, row) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setSelectedUser(row); }}
          aria-label="View user details"
          className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-highlight)] rounded-lg transition-colors cursor-pointer"
        >
          <Eye className="h-4 w-4" />
        </button>
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
          onRowClick={(row) => setSelectedUser(row)}
          emptyMessage={`No ${statusTab === 'All' ? '' : statusTab.toLowerCase() + ' '}users matching your search.`}
          compact
          centerHeaders
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
          <div className="space-y-6 text-left select-none">
            <div className="bg-[#f9fafb] border border-[var(--color-border-default)] rounded-md p-4 space-y-2">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Person Details</span>
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                {selectedUser.firstName} {selectedUser.lastName}
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium">
                <div>Email: {selectedUser.email}</div>
                <div>Location: {selectedUser.location}</div>
              </div>
            </div>

            <div className="bg-[#f9fafb] border border-[var(--color-border-default)] rounded-md p-4 space-y-2">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Manager Details</span>
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedUser.addedBy}</div>
              <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium">
                {selectedUser.managerEmail && <div>Email: {selectedUser.managerEmail}</div>}
                <div>Club: {selectedUser.club}</div>
              </div>
            </div>

            <div className="bg-[#f9fafb] border border-[var(--color-border-default)] rounded-md p-4 space-y-2">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Notes</span>
              <p className="text-sm text-[var(--color-text-primary)] leading-normal whitespace-pre-wrap">
                {selectedUser.notes?.trim() ? selectedUser.notes : '—'}
              </p>
            </div>

            <div className="bg-[#f9fafb] border border-[var(--color-border-default)] rounded-md p-4 space-y-2">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Ledger Status</span>
              <div className="flex items-center gap-2 mb-1">
                <Tag variant={selectedUser.status === 'Added' ? 'added' : 'removed'} label={selectedUser.status} />
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium">
                <div>ID: {formatDisplayId(selectedUser.displayId)}</div>
                <div>Date: {formatDate(selectedUser.dateAdded)}</div>
                <div>Added By: {selectedUser.addedBy}</div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-[var(--color-border-default)]">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Request History</span>
              <div className="relative pl-6 border-l border-[var(--color-border-default)] space-y-5 py-1">
                <div className="relative">
                  <div className="absolute -left-[29px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white bg-[var(--color-brand-primary)] shadow-sm shrink-0" />
                  <div className="text-[11px] font-semibold text-[var(--color-text-secondary)]">{formatDate(selectedUser.dateAdded)}</div>
                  <div className="text-xs font-semibold text-[var(--color-text-primary)] mt-0.5">
                    Marked as {selectedUser.status} by {selectedUser.addedBy}
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute -left-[29px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white bg-gray-300 shadow-sm shrink-0" />
                  <div className="text-[11px] font-semibold text-[var(--color-text-secondary)]">{getEarlierDateStr(selectedUser.dateAdded)}</div>
                  <div className="text-xs font-semibold text-[var(--color-text-primary)] mt-0.5">
                    Request submitted by {selectedUser.addedBy}
                  </div>
                </div>
              </div>
            </div>

            {selectedUser.status === 'Added' && (
              <div className="bg-[var(--color-surface-panel)] border border-[var(--color-border-default)] rounded-md p-4 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-[var(--color-brand-primary)] shrink-0 mt-0.5" />
                <span className="text-xs text-[var(--color-text-secondary)] font-semibold leading-normal">
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
