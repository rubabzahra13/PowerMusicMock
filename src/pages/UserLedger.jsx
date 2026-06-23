import { useState, useMemo } from 'react';
import { Search, Download, Info, SortAsc, SortDesc, ChevronDown, Filter } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { userLedger } from '../data/mockData';
import { DataTable, Tag, Drawer } from '../components/ui';

// ─── Shared Controls Bar ──────────────────────────────────────────────────────
function ControlsBar({
  searchQuery, setSearchQuery,
  filterOpen, setFilterOpen,
  sortOpen, setSortOpen,
  filterSlots,
  sortFields,
  sortField, setSortField,
  sortDir, setSortDir,
  activeFilterCount
}) {
  return (
    <div className="w-full bg-white rounded-xl border border-[var(--color-border-default)] overflow-hidden shadow-sm">
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-0 divide-y md:divide-y-0 md:divide-x divide-[var(--color-border-default)]">
        <div className="flex items-center gap-2 px-4 py-3 flex-1">
          <Search className="h-4 w-4 text-[var(--color-text-muted)] shrink-0" />
          <input
            type="text"
            placeholder="Search name, email, club or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-xs leading-none cursor-pointer">✕</button>
          )}
        </div>

        <button
          onClick={() => { setFilterOpen(o => !o); setSortOpen(false); }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
            filterOpen || activeFilterCount > 0
              ? 'bg-[var(--color-brand-accent)] text-white'
              : 'bg-white text-[var(--color-text-primary)] hover:bg-gray-50'
          }`}
        >
          <Filter className="h-4 w-4" />
          <span>Filter</span>
          {activeFilterCount > 0 && (
            <span className="ml-0.5 bg-white/30 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
        </button>

        <button
          onClick={() => { setSortOpen(o => !o); setFilterOpen(false); }}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
            sortOpen ? 'bg-[var(--color-brand-accent)] text-white' : 'bg-white text-[var(--color-text-primary)] hover:bg-gray-50'
          }`}
        >
          {sortDir === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
          <span>Sort</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {filterOpen && (
        <div className="border-t border-[var(--color-border-default)] bg-gray-50 px-4 py-3 flex flex-wrap items-center gap-4">
          {filterSlots.map((slot) => (
            <div key={slot.label} className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">{slot.label}</span>
              <div className="flex gap-1 flex-wrap">
                {slot.options.map(opt => (
                  <button key={opt.value} onClick={() => slot.onChange(opt.value)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                      slot.value === opt.value
                        ? 'bg-[var(--color-brand-accent)] text-white'
                        : 'bg-white border border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:border-[var(--color-brand-accent)] hover:text-[var(--color-brand-accent)]'
                    }`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
          ))}
          {activeFilterCount > 0 && (
            <button onClick={() => filterSlots.forEach(s => s.onChange(s.options[0].value))}
              className="ml-auto text-xs font-semibold text-[var(--color-text-secondary)] hover:text-red-500 transition-colors cursor-pointer">
              Clear filters
            </button>
          )}
        </div>
      )}

      {sortOpen && (
        <div className="border-t border-[var(--color-border-default)] bg-gray-50 px-4 py-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Sort by</span>
            <div className="flex gap-1 flex-wrap">
              {sortFields.map(opt => (
                <button key={opt.value} onClick={() => setSortField(opt.value)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    sortField === opt.value
                      ? 'bg-[var(--color-brand-accent)] text-white'
                      : 'bg-white border border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:border-[var(--color-brand-accent)] hover:text-[var(--color-brand-accent)]'
                  }`}
                >{opt.label}</button>
              ))}
            </div>
          </div>
          <div className="h-5 w-px bg-[var(--color-border-default)] hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Direction</span>
            <div className="flex gap-1">
              {[{ value: 'asc', label: 'Ascending', Icon: SortAsc }, { value: 'desc', label: 'Descending', Icon: SortDesc }].map(({ value, label, Icon }) => (
                <button key={value} onClick={() => setSortDir(value)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    sortDir === value
                      ? 'bg-[var(--color-brand-accent)] text-white'
                      : 'bg-white border border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:border-[var(--color-brand-accent)] hover:text-[var(--color-brand-accent)]'
                  }`}
                ><Icon className="h-3 w-3" />{label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function UserLedger() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [selectedUser, setSelectedUser] = useState(null);

  // Sort states
  const [sortField, setSortField] = useState('displayId');
  const [sortDir, setSortDir] = useState('asc');

  // Panel open states
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // ── Formatters ──
  const formatTimestamp = (iso) => {
    try {
      const d = parseISO(iso);
      return { date: format(d, 'dd MMM yyyy'), time: format(d, 'hh:mm a') };
    } catch { return { date: iso, time: '' }; }
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

  // ── Filter + Sort ──
  const filteredLedger = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = userLedger.filter((user) => {
      const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
      const matchesSearch =
        query === '' ||
        fullName.includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.location.toLowerCase().includes(query) ||
        user.addedBy.toLowerCase().includes(query) ||
        (user.managerEmail && user.managerEmail.toLowerCase().includes(query)) ||
        user.club.toLowerCase().includes(query);
      const matchesStatus = filterStatus === 'All' || user.status === filterStatus;
      return matchesSearch && matchesStatus;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortField === 'managerName') return a.addedBy.localeCompare(b.addedBy) * dir;
      if (sortField === 'personName') {
        const nA = `${a.firstName} ${a.lastName}`.toLowerCase();
        const nB = `${b.firstName} ${b.lastName}`.toLowerCase();
        return nA.localeCompare(nB) * dir;
      }
      if (sortField === 'dateAdded') return (new Date(a.dateAdded) - new Date(b.dateAdded)) * dir;
      // default: displayId
      return (a.displayId - b.displayId) * dir;
    });
  }, [searchQuery, filterStatus, sortField, sortDir]);

  // ── CSV Export ──
  const handleExportCSV = () => {
    const headers = ['#', 'Person Name', 'Person Email', 'Location', 'Status', 'Date Added', 'Manager Name', 'Manager Email', 'Club'];
    const csvRows = filteredLedger.map((user) =>
      [
        user.displayId,
        `${user.firstName} ${user.lastName}`,
        user.email,
        user.location,
        user.status,
        formatDate(user.dateAdded),
        user.addedBy,
        user.managerEmail || '',
        user.club
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

  const activeFilterCount = [filterStatus !== 'All'].filter(Boolean).length;

  // ── Column definitions ──
  const columns = [
    {
      key: 'displayId',
      label: '#',
      render: (val) => <span className="text-xs font-bold text-[var(--color-text-muted)]">{val}</span>
    },
    {
      key: 'dateAdded',
      label: 'Timestamp',
      render: (val) => {
        const { date, time } = formatTimestamp(val);
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">{date}</span>
            <span className="text-xs text-[var(--color-text-muted)]">{time}</span>
          </div>
        );
      }
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => <Tag variant={val === 'Added' ? 'added' : 'removed'} label={val} />
    },
    {
      key: 'personName',
      label: 'Person Name',
      render: (_, row) => (
        <span className="font-semibold text-sm text-[var(--color-text-primary)]">
          {row.firstName} {row.lastName}
        </span>
      )
    },
    {
      key: 'email',
      label: 'Person Email',
      render: (val) => <span className="text-xs text-[var(--color-text-secondary)]">{val}</span>
    },
    {
      key: 'location',
      label: 'Location',
      render: (val) => <span className="text-xs text-[var(--color-text-secondary)]">{val}</span>
    },
    {
      key: 'managerName',
      label: 'Manager Name',
      render: (_, row) => (
        <span className="font-semibold text-sm text-[var(--color-text-primary)]">{row.addedBy}</span>
      )
    },
    {
      key: 'managerEmail',
      label: 'Manager Email',
      render: (_, row) => (
        <span className="text-xs text-[var(--color-text-secondary)]">{row.managerEmail || '—'}</span>
      )
    },
    {
      key: 'club',
      label: 'Manager Club',
      render: (val) => <span className="text-xs text-[var(--color-text-secondary)]">{val}</span>
    },
    {
      key: 'sourceRequest',
      label: 'Source',
      render: (_, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); alert(`This would navigate to request ${row.sourceRequestId}.`); }}
          className="text-xs font-semibold text-[var(--color-brand-accent)] hover:underline focus:outline-none cursor-pointer bg-transparent border-0"
        >View →</button>
      )
    }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] pb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">User Ledger</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">47 records</span>
        </div>
        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-1.5 px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-semibold bg-white hover:bg-gray-50 transition-colors shadow-sm focus:outline-none cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Controls Bar */}
      <ControlsBar
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        filterOpen={filterOpen} setFilterOpen={setFilterOpen}
        sortOpen={sortOpen} setSortOpen={setSortOpen}
        activeFilterCount={activeFilterCount}
        filterSlots={[
          {
            label: 'Status', value: filterStatus, onChange: setFilterStatus,
            options: [{ value: 'All', label: 'All' }, { value: 'Added', label: 'Added' }, { value: 'Removed', label: 'Removed' }]
          }
        ]}
        sortFields={[
          { value: 'displayId', label: 'ID' },
          { value: 'dateAdded', label: 'Timestamp' },
          { value: 'personName', label: 'Person Name' },
          { value: 'managerName', label: 'Manager Name' }
        ]}
        sortField={sortField} setSortField={setSortField}
        sortDir={sortDir} setSortDir={setSortDir}
      />

      {/* Table */}
      <div className="w-full">
        <DataTable
          columns={columns}
          rows={filteredLedger}
          onRowClick={(row) => setSelectedUser(row)}
          emptyMessage="No users matching your search."
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-2 text-xs font-semibold text-[var(--color-text-secondary)]">
        <span>{filteredLedger.length} records shown</span>
      </div>

      {/* History Drawer */}
      <Drawer
        isOpen={selectedUser !== null}
        onClose={() => setSelectedUser(null)}
        title={selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName}` : ''}
      >
        {selectedUser && (
          <div className="space-y-6 text-left select-none">
            {/* Person Details */}
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

            {/* Manager Details */}
            <div className="bg-[#f9fafb] border border-[var(--color-border-default)] rounded-md p-4 space-y-2">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Manager Details</span>
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">{selectedUser.addedBy}</div>
              <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium">
                {selectedUser.managerEmail && <div>Email: {selectedUser.managerEmail}</div>}
                <div>Club: {selectedUser.club}</div>
              </div>
            </div>

            {/* Ledger Status */}
            <div className="bg-[#f9fafb] border border-[var(--color-border-default)] rounded-md p-4 space-y-2">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Ledger Status</span>
              <div className="flex items-center gap-2 mb-1">
                <Tag variant={selectedUser.status === 'Added' ? 'added' : 'removed'} label={selectedUser.status} />
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium">
                <div>Date: {formatDate(selectedUser.dateAdded)}</div>
                <div>Added By: {selectedUser.addedBy}</div>
              </div>
            </div>

            {/* Request History */}
            <div className="space-y-3 pt-3 border-t border-[var(--color-border-default)]">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Request History</span>
              <div className="relative pl-6 border-l border-[var(--color-border-default)] space-y-5 py-1">
                <div className="relative">
                  <div className="absolute -left-[29px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white bg-[var(--color-brand-accent)] shadow-sm shrink-0" />
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

            {/* Duplicate Check Note */}
            {selectedUser.status === 'Added' && (
              <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-md p-4 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <span className="text-xs text-blue-800 font-semibold leading-normal">
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
