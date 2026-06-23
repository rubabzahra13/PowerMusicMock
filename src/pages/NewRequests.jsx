import { useState, useMemo } from 'react';
import {
  Search, Plus, SortAsc, SortDesc, ChevronDown, Filter,
  Download, Info
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pendingRequests, handledRequests, userLedger } from '../data/mockData';
import { DataTable, Tag, Modal, Toast, useToast, Drawer } from '../components/ui';
import RequestDetailDrawer from '../components/RequestDetailDrawer';

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

// ─── Timestamp formatter ───────────────────────────────────────────────────────
function formatTimestamp(iso) {
  try {
    const d = parseISO(iso);
    return { date: format(d, 'dd MMM yyyy'), time: format(d, 'hh:mm a') };
  } catch { return { date: iso, time: '' }; }
}
function formatDateTime(iso) {
  try { return format(parseISO(iso), 'dd MMM yyyy, hh:mm a'); }
  catch { return iso; }
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

// ─── Page Component ───────────────────────────────────────────────────────────
export default function Requests() {
  const { showToast } = useToast();

  // ── View toggle ──
  const [view, setView] = useState('new'); // 'new' | 'handled'

  // ── New requests data ──
  const [newRequests, setNewRequests] = useState(pendingRequests);

  // ── Filter / Sort states (shared for both views) ──
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('All');
  const [filterTag, setFilterTag] = useState('All');
  const [sortField, setSortField] = useState('displayId');
  const [sortDir, setSortDir] = useState('asc');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // ── Drawer / Modal states ──
  const [selectedNewRequest, setSelectedNewRequest] = useState(null);
  const [selectedHandledRequest, setSelectedHandledRequest] = useState(null);
  const [showAddManualModal, setShowAddManualModal] = useState(false);

  // ── Manual form states ──
  const [managerForm, setManagerForm] = useState({ firstName: '', lastName: '', email: '', club: '' });
  const [personForm, setPersonForm] = useState({ firstName: '', lastName: '', email: '', location: '' });
  const [action, setAction] = useState('Add');
  const [notes, setNotes] = useState('');

  // Reset filters when switching views
  const handleViewSwitch = (newView) => {
    setView(newView);
    setSearchQuery('');
    setFilterAction('All');
    setFilterTag('All');
    setSortField('displayId');
    setSortDir('asc');
    setFilterOpen(false);
    setSortOpen(false);
  };

  // ── Generic filter + sort function ──
  const applyFilterSort = (rows, timestampKey) => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = rows.filter((req) => {
      const personName = `${req.person.firstName} ${req.person.lastName}`.toLowerCase();
      const isManual = req.submittedBy?.club === 'Manual entry';
      const managerName = isManual ? 'andrea admin' : `${req.submittedBy?.firstName || ''} ${req.submittedBy?.lastName || ''}`.toLowerCase();

      const matchesSearch =
        query === '' ||
        personName.includes(query) ||
        req.person.email.toLowerCase().includes(query) ||
        (req.person.location && req.person.location.toLowerCase().includes(query)) ||
        managerName.includes(query) ||
        (req.submittedBy?.email && req.submittedBy.email.toLowerCase().includes(query)) ||
        (req.submittedBy?.club && req.submittedBy.club.toLowerCase().includes(query));

      const matchesAction = filterAction === 'All' || req.action === filterAction;

      let matchesTag = true;
      if (filterTag === 'Already Exists') matchesTag = req.tags?.includes('Already Exists');
      else if (filterTag === 'Added') matchesTag = req.tags?.includes('Added');
      else if (filterTag === 'Removed') matchesTag = req.tags?.includes('Removed');
      else if (filterTag === 'No Tag') matchesTag = (req.tags?.length ?? 0) === 0;

      return matchesSearch && matchesAction && matchesTag;
    });

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
      if (sortField === timestampKey) return (new Date(a[timestampKey]) - new Date(b[timestampKey])) * dir;
      return (a.displayId - b.displayId) * dir;
    });
  };

  const filteredNew = useMemo(
    () => applyFilterSort(newRequests, 'receivedAt'),
    [newRequests, searchQuery, filterAction, filterTag, sortField, sortDir]
  );
  const filteredHandled = useMemo(
    () => applyFilterSort(handledRequests, 'handledAt'),
    [searchQuery, filterAction, filterTag, sortField, sortDir]
  );

  const activeFilterCount = [filterAction !== 'All', filterTag !== 'All'].filter(Boolean).length;

  // ── CSV export for handled ──
  const handleExportCSV = () => {
    const headers = ['#', 'Timestamp', 'Handled At', 'Request Type', 'Person Name', 'Person Email', 'Person Location', 'Manager Name', 'Manager Email', 'Manager Club', 'Tags'];
    const csvRows = filteredHandled.map((req) => {
      const isManual = req.submittedBy.club === 'Manual entry';
      return [
        req.displayId, formatDateTime(req.receivedAt), formatDateTime(req.handledAt), req.action,
        `${req.person.firstName} ${req.person.lastName}`, req.person.email, req.person.location || '',
        isManual ? 'Andrea (Admin)' : `${req.submittedBy.firstName} ${req.submittedBy.lastName || ''}`.trim(),
        req.submittedBy.email || '', req.submittedBy.club, req.tags.join('; ')
      ].map((val) => `"${String(val).replace(/"/g, '""')}"`).join(',');
    });
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'previously-handled-export.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Manual form submit ──
  const handleCreateRequest = (e) => {
    e.preventDefault();
    const isValid =
      managerForm.firstName.trim() && managerForm.lastName.trim() &&
      managerForm.email.trim() && managerForm.club.trim() &&
      personForm.firstName.trim() && personForm.lastName.trim() &&
      personForm.email.trim() && personForm.location.trim();
    if (!isValid) return;
    const maxId = newRequests.reduce((m, r) => Math.max(m, r.displayId || 0), 0);
    const newRequest = {
      id: `req-manual-${Date.now()}`, displayId: maxId + 1,
      receivedAt: new Date().toISOString(), submittedBy: { ...managerForm },
      person: { ...personForm }, action, notes, tags: [], createdBy: 'Andrea (Admin)'
    };
    setNewRequests((prev) => [newRequest, ...prev]);
    showToast('Request created.', 'success');
    setShowAddManualModal(false);
    setManagerForm({ firstName: '', lastName: '', email: '', club: '' });
    setPersonForm({ firstName: '', lastName: '', email: '', location: '' });
    setAction('Add'); setNotes('');
  };

  const isModalFormValid =
    managerForm.firstName.trim() && managerForm.lastName.trim() &&
    managerForm.email.trim() && managerForm.club.trim() &&
    personForm.firstName.trim() && personForm.lastName.trim() &&
    personForm.email.trim() && personForm.location.trim();

  // ── Column definitions — shared structure ──
  const sharedStartColumns = [
    {
      key: 'displayId',
      label: '#',
      render: (val) => <span className="text-xs font-bold text-[var(--color-text-muted)]">{val}</span>
    },
    {
      key: 'timestamp',
      label: 'Timestamp',
      render: (_, row) => <TimestampCell val={view === 'new' ? row.receivedAt : row.receivedAt} />
    },
    {
      key: 'action',
      label: 'Request Type',
      render: (val) => <Tag variant={val === 'Add' ? 'add-action' : 'remove-action'} label={val} />
    },
    {
      key: 'personName',
      label: 'Person Name',
      render: (_, row) => (
        <span className="font-semibold text-sm text-[var(--color-text-primary)]">
          {row.person.firstName} {row.person.lastName}
        </span>
      )
    },
    {
      key: 'personEmail',
      label: 'Person Email',
      render: (_, row) => <span className="text-xs text-[var(--color-text-secondary)]">{row.person.email}</span>
    },
    {
      key: 'personLocation',
      label: 'Location',
      render: (_, row) => <span className="text-xs text-[var(--color-text-secondary)]">{row.person.location || '—'}</span>
    },
    {
      key: 'managerName',
      label: 'Manager Name',
      render: (_, row) => {
        const isManual = row.submittedBy?.club === 'Manual entry';
        return (
          <span className="font-semibold text-sm text-[var(--color-text-primary)]">
            {isManual ? 'Andrea (Admin)' : `${row.submittedBy?.firstName || ''} ${row.submittedBy?.lastName || ''}`.trim()}
          </span>
        );
      }
    },
    {
      key: 'managerEmail',
      label: 'Manager Email',
      render: (_, row) => <span className="text-xs text-[var(--color-text-secondary)]">{row.submittedBy?.email || '—'}</span>
    },
    {
      key: 'managerClub',
      label: 'Manager Club',
      render: (_, row) => <span className="text-xs text-[var(--color-text-secondary)]">{row.submittedBy?.club}</span>
    }
  ];

  const newColumns = [
    ...sharedStartColumns,
    {
      key: 'tags',
      label: 'Tags',
      render: (val) => (
        <div className="flex flex-wrap gap-1.5">
          {(val || []).map((t) => (
            <Tag key={t} variant={t === 'Already Exists' ? 'already-exists' : 'neutral'} label={t} />
          ))}
        </div>
      )
    },
    {
      key: 'expand',
      label: '',
      render: () => <span className="text-gray-300 text-xs select-none">▶</span>
    }
  ];

  const handledColumns = [
    ...sharedStartColumns,
    {
      key: 'tags',
      label: 'Status / Tags',
      render: (tagsList) => (
        <div className="flex flex-wrap gap-1.5">
          {(tagsList || []).map((t) => {
            let v = 'added';
            if (t === 'Removed') v = 'removed';
            else if (t === 'Already Exists') v = 'already-exists';
            return <Tag key={t} variant={v} label={t} />;
          })}
        </div>
      )
    }
  ];

  const displayedNewRows = useMemo(() =>
    filteredNew.map((req) => ({ ...req, alreadyExists: req.tags?.includes('Already Exists') })),
    [filteredNew]
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 select-none">
      <Toast />

      {/* ── Page Header with toggle ── */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] pb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Requests</h2>

          {/* Toggle switch */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => handleViewSwitch('new')}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all cursor-pointer ${
                view === 'new'
                  ? 'bg-white text-[var(--color-text-primary)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              New Requests
              <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                view === 'new'
                  ? 'bg-[var(--color-brand-accent)] text-white'
                  : 'bg-gray-300 text-gray-600'
              }`}>
                {newRequests.length}
              </span>
            </button>
            <button
              onClick={() => handleViewSwitch('handled')}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all cursor-pointer ${
                view === 'handled'
                  ? 'bg-white text-[var(--color-text-primary)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Previously Handled
              <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                view === 'handled'
                  ? 'bg-gray-100 text-gray-700'
                  : 'bg-gray-300 text-gray-600'
              }`}>
                44
              </span>
            </button>
          </div>
        </div>

        {/* Right actions */}
        {view === 'new' ? (
          <button
            onClick={() => setShowAddManualModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-semibold bg-white hover:bg-gray-50 transition-colors shadow-sm focus:outline-none cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Manually</span>
          </button>
        ) : (
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-semibold bg-white hover:bg-gray-50 transition-colors shadow-sm focus:outline-none cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        )}
      </div>

      {/* Read-only banner (handled view only) */}
      {view === 'handled' && (
        <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-md px-4 py-2.5 flex items-center gap-2.5">
          <Info className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="text-xs text-blue-800 font-semibold">This is a read-only log. Records cannot be edited.</span>
        </div>
      )}

      {/* Controls Bar */}
      <ControlsBar
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        filterOpen={filterOpen} setFilterOpen={setFilterOpen}
        sortOpen={sortOpen} setSortOpen={setSortOpen}
        activeFilterCount={activeFilterCount}
        filterSlots={[
          {
            label: 'Request Type', value: filterAction, onChange: setFilterAction,
            options: [{ value: 'All', label: 'All' }, { value: 'Add', label: 'Add' }, { value: 'Remove', label: 'Remove' }]
          },
          {
            label: 'Tag', value: filterTag, onChange: setFilterTag,
            options: view === 'new'
              ? [{ value: 'All', label: 'All Tags' }, { value: 'Already Exists', label: 'Already Exists' }, { value: 'No Tag', label: 'No Tag' }]
              : [{ value: 'All', label: 'All Tags' }, { value: 'Added', label: 'Added' }, { value: 'Removed', label: 'Removed' }, { value: 'Already Exists', label: 'Already Exists' }]
          }
        ]}
        sortFields={[
          { value: 'displayId', label: 'ID' },
          { value: view === 'new' ? 'receivedAt' : 'handledAt', label: 'Timestamp' },
          { value: 'personName', label: 'Person Name' },
          { value: 'managerName', label: 'Manager Name' }
        ]}
        sortField={sortField} setSortField={setSortField}
        sortDir={sortDir} setSortDir={setSortDir}
      />

      {/* Table */}
      <div className="w-full">
        {view === 'new' ? (
          <DataTable
            columns={newColumns}
            rows={displayedNewRows}
            onRowClick={(row) => setSelectedNewRequest(row)}
            emptyMessage="No pending requests matching your filters."
          />
        ) : (
          <DataTable
            columns={handledColumns}
            rows={filteredHandled}
            onRowClick={(row) => setSelectedHandledRequest(row)}
            emptyMessage="No handled requests matching your filters."
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-2 text-xs font-medium text-[var(--color-text-secondary)]">
        {view === 'new' ? `${filteredNew.length} requests` : `${filteredHandled.length} records shown`}
      </div>

      {/* ── Add Manually Modal ── */}
      <Modal
        isOpen={showAddManualModal}
        onClose={() => setShowAddManualModal(false)}
        title="Add Request Manually"
        footer={
          <>
            <button onClick={() => setShowAddManualModal(false)}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-medium text-[var(--color-text-primary)] hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleCreateRequest} disabled={!isModalFormValid}
              className={`px-4 py-2 text-white text-sm font-semibold rounded-md transition-colors shadow-sm ${isModalFormValid ? 'bg-[var(--color-brand-accent)] hover:bg-[var(--color-brand-accent-hover)] cursor-pointer' : 'bg-gray-300 cursor-not-allowed'}`}>
              Create Request
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateRequest} className="space-y-5 text-left">
          <div className="space-y-3">
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Manager Details</span>
            <div className="grid grid-cols-2 gap-3">
              {[['First Name *', 'firstName', 'text'], ['Last Name *', 'lastName', 'text']].map(([label, field, type]) => (
                <div key={field}>
                  <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-0.5">{label}</label>
                  <input type={type} required value={managerForm[field]}
                    onChange={(e) => setManagerForm({ ...managerForm, [field]: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-[var(--color-border-default)] rounded text-sm focus:outline-none focus:border-[var(--color-border-focus)] transition-colors" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[['Email *', 'email', 'email'], ['Club Location *', 'club', 'text']].map(([label, field, type]) => (
                <div key={field}>
                  <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-0.5">{label}</label>
                  <input type={type} required value={managerForm[field]}
                    onChange={(e) => setManagerForm({ ...managerForm, [field]: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-[var(--color-border-default)] rounded text-sm focus:outline-none focus:border-[var(--color-border-focus)] transition-colors" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Person Details</span>
            <div className="grid grid-cols-2 gap-3">
              {[['First Name *', 'firstName', 'text'], ['Last Name *', 'lastName', 'text']].map(([label, field, type]) => (
                <div key={field}>
                  <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-0.5">{label}</label>
                  <input type={type} required value={personForm[field]}
                    onChange={(e) => setPersonForm({ ...personForm, [field]: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-[var(--color-border-default)] rounded text-sm focus:outline-none focus:border-[var(--color-border-focus)] transition-colors" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[['Email *', 'email', 'email'], ['Location *', 'location', 'text']].map(([label, field, type]) => (
                <div key={field}>
                  <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-0.5">{label}</label>
                  <input type={type} required value={personForm[field]}
                    onChange={(e) => setPersonForm({ ...personForm, [field]: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-[var(--color-border-default)] rounded text-sm focus:outline-none focus:border-[var(--color-border-focus)] transition-colors" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Action *</span>
            <div className="flex items-center gap-4">
              {[['Add', 'Add Person'], ['Remove', 'Remove Person']].map(([val, label]) => (
                <label key={val} className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] cursor-pointer select-none">
                  <input type="radio" name="modalAction" checked={action === val} onChange={() => setAction(val)} className="w-3.5 h-3.5 cursor-pointer" />
                  <span className="font-medium">{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Additional Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional notes..."
              className="w-full h-14 px-2.5 py-1.5 bg-white border border-[var(--color-border-default)] rounded text-sm placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors resize-none" />
          </div>
          <div className="text-[11px] font-medium text-[var(--color-text-muted)] select-none pt-2 border-t border-[var(--color-border-default)]">
            Created By: Andrea (Admin)
          </div>
        </form>
      </Modal>

      {/* ── New Request Detail Drawer ── */}
      <RequestDetailDrawer
        request={selectedNewRequest}
        isOpen={selectedNewRequest !== null}
        onClose={() => setSelectedNewRequest(null)}
        ledger={userLedger}
        onAction={(id, actionType) => {
          setNewRequests((prev) => prev.filter((r) => r.id !== id));
          showToast(
            `${selectedNewRequest.person.firstName} ${selectedNewRequest.person.lastName} marked as ${actionType === 'Add' ? 'Added' : 'Removed'}.`,
            'success'
          );
          setSelectedNewRequest(null);
        }}
      />

      {/* ── Handled Request Read-Only Drawer ── */}
      <Drawer
        isOpen={selectedHandledRequest !== null}
        onClose={() => setSelectedHandledRequest(null)}
        title="Request Record"
      >
        {selectedHandledRequest && (
          <div className="space-y-6 text-left select-none">
            <div className="flex items-start justify-between border-b border-[var(--color-border-default)] pb-4">
              <div className="text-xs text-[var(--color-text-secondary)] font-medium space-y-0.5">
                <div>Submitted: {formatDateTime(selectedHandledRequest.receivedAt)}</div>
                <div>Handled: {formatDateTime(selectedHandledRequest.handledAt)}</div>
              </div>
              <div className="flex flex-wrap gap-1.5 shrink-0 max-w-[200px] justify-end">
                {selectedHandledRequest.tags.map((t) => (
                  <Tag key={t} variant={t === 'Added' ? 'added' : t === 'Removed' ? 'removed' : 'already-exists'} label={t} />
                ))}
              </div>
            </div>
            <div className="bg-[#f9fafb] border border-[var(--color-border-default)] rounded-md p-4 space-y-2">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Manager Details</span>
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                {selectedHandledRequest.submittedBy.club === 'Manual entry' ? 'Andrea (Admin)' : `${selectedHandledRequest.submittedBy.firstName} ${selectedHandledRequest.submittedBy.lastName || ''}`.trim()}
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium">
                {selectedHandledRequest.submittedBy.email && <div>Email: {selectedHandledRequest.submittedBy.email}</div>}
                <div>Club: {selectedHandledRequest.submittedBy.club}</div>
              </div>
            </div>
            <div className="bg-[#f9fafb] border border-[var(--color-border-default)] rounded-md p-4 space-y-2">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Person to {selectedHandledRequest.action === 'Add' ? 'Add' : 'Remove'}
              </span>
              <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                {selectedHandledRequest.person.firstName} {selectedHandledRequest.person.lastName}
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium">
                <div>Email: {selectedHandledRequest.person.email}</div>
                {selectedHandledRequest.person.location && <div>Location: {selectedHandledRequest.person.location}</div>}
              </div>
            </div>
            <div className="space-y-3 pt-3 border-t border-[var(--color-border-default)]">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Activity Log</span>
              <div className="divide-y divide-[var(--color-border-default)] font-medium text-xs">
                <div className="py-2 flex items-start gap-3">
                  <span className="text-[var(--color-text-secondary)] font-semibold shrink-0">{format(parseISO(selectedHandledRequest.receivedAt), 'HH:mm')}</span>
                  <span className="text-[var(--color-text-primary)]">
                    Request submitted by {selectedHandledRequest.submittedBy.club === 'Manual entry' ? 'Andrea (Admin)' : `${selectedHandledRequest.submittedBy.firstName} ${selectedHandledRequest.submittedBy.lastName || ''}`.trim()}
                  </span>
                </div>
                <div className="py-2 flex items-start gap-3">
                  <span className="text-[var(--color-text-secondary)] font-semibold shrink-0">{format(parseISO(selectedHandledRequest.handledAt), 'HH:mm')}</span>
                  <span className="text-[var(--color-text-primary)]">Marked as {selectedHandledRequest.action === 'Add' ? 'Added' : 'Removed'} by Andrea</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
