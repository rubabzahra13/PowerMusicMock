import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search, Plus, SortAsc, ChevronDown, Filter, Eye, Trash2
} from 'lucide-react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { DataTable, Tag, Modal, Toast, useToast, SelectDropdown, StackedTextCell, TruncateCell } from '../components/ui';
import RequestDetailDrawer from '../components/RequestDetailDrawer';
import PageHeader from '../components/layout/PageHeader';
import { getManagerDisplayName, isManualEntry } from '../utils/manualEntry';
import { loadWithCache, writeCache } from '../utils/pilot2Api';
import { getApiUrl } from '../utils/api';

const SORT_PRESETS = [
  { value: 'displayId-asc', label: 'ID (newest first)' },
  { value: 'displayId-desc', label: 'ID (oldest first)' },
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

const DEFAULT_SORT = 'displayId-asc';

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

const formatDisplayId = (displayId) => `R-${String(displayId).padStart(2, '0')}`;

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
  location: ''
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

  // ── Action tab (Add / Remove) ──
  const [actionTab, setActionTab] = useState('All');

  // ── New requests data ──
  const [newRequests, setNewRequests] = useState([]);
  const [liveDirectory, setLiveDirectory] = useState([]);

  useEffect(() => {
    // Cached copies render instantly; fresh data replaces them.
    const load = () => {
      loadWithCache('requests_new', () =>
        fetch(getApiUrl('/api/admin/requests?status=new')).then((res) => res.json()),
        setNewRequests,
      ).catch((err) => console.error(err));

      loadWithCache('directory_persons', () =>
        fetch(getApiUrl('/api/persons')).then((res) => res.json()),
        setLiveDirectory,
      ).catch((err) => console.error(err));
    };
    load();
    const refresh = () => { if (!document.hidden) load(); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
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
  const [selectedNewRequest, setSelectedNewRequest] = useState(null);
  const [confirmActionRequest, setConfirmActionRequest] = useState(null);
  const [showAddManualModal, setShowAddManualModal] = useState(false);

  // ── Manual form states ──
  const [managerForm, setManagerForm] = useState(emptyManagerForm());
  const [personForms, setPersonForms] = useState([emptyPersonForm()]);
  const [action, setAction] = useState('Add');
  const [notes, setNotes] = useState('');

  const resetManualForm = (nextAction = actionTab) => {
    setManagerForm(emptyManagerForm());
    setPersonForms([emptyPersonForm()]);
    setAction(nextAction);
    setNotes('');
  };

  const updatePersonForm = (index, field, value) => {
    setPersonForms((prev) => prev.map((person, i) => (
      i === index ? { ...person, [field]: value } : person
    )));
  };

  const addPersonForm = () => {
    setPersonForms((prev) => [...prev, emptyPersonForm()]);
  };

  const removePersonForm = (index) => {
    setPersonForms((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  // Reset filters when switching Add / Remove
  const handleActionTabSwitch = (tab) => {
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
      const managerName = isManual ? 'admin' : `${req.submittedBy?.firstName || ''} ${req.submittedBy?.lastName || ''}`.toLowerCase();

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
      const hasAlreadyExists = req.tags?.includes('Already Exists');
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
  const isPersonFormValid = (person) =>
    person.firstName.trim() &&
    person.lastName.trim() &&
    person.email.trim() &&
    person.location.trim();

  const isModalFormValid =
    managerForm.firstName.trim() &&
    managerForm.lastName.trim() &&
    managerForm.email.trim() &&
    managerForm.club.trim() &&
    personForms.every(isPersonFormValid);

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    if (!isModalFormValid) return;

    try {
      const response = await fetch(getApiUrl('/api/admin/requests/manual'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submittedBy: managerForm,
          people: personForms,
          action: action,
          notes: notes
        })
      });
      if (!response.ok) throw new Error('Failed to create manual requests');
      const created = await response.json();

      setNewRequests((prev) => {
        const next = [...created, ...prev];
        writeCache('requests_new', next);
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

  const completeRequest = async (req) => {
    try {
      const response = await fetch(getApiUrl(`/api/admin/requests/${req.id}/mark-handled`), {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to mark handled');
      
      setNewRequests((prev) => {
        const next = prev.filter((r) => r.id !== req.id);
        writeCache('requests_new', next);
        return next;
      });
      showToast(
        `${req.person.firstName} ${req.person.lastName} marked as ${req.action === 'Add' ? 'Added' : 'Removed'}.`,
        'success'
      );
      setSelectedNewRequest((current) => (current?.id === req.id ? null : current));
      setConfirmActionRequest(null);
    } catch (err) {
      console.error(err);
      showToast('Failed to complete request.', 'error');
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
          {formatDisplayId(val)}
        </span>
      )
    },
    {
      key: 'timestamp',
      label: 'Timestamp',
      width: '108px',
      noShrink: true,
      cellClassName: 'align-middle whitespace-nowrap',
      render: (_, row) => <TimestampCell val={row.receivedAt} />
    },
    {
      key: 'action',
      label: 'Type',
      width: '72px',
      noShrink: true,
      cellClassName: 'align-middle whitespace-nowrap',
      render: (val) => <Tag variant={val === 'Add' ? 'add-action' : 'remove-action'} label={val} />
    },
    {
      key: 'person',
      label: 'Person',
      width: '19%',
      render: (_, row) => (
        <StackedTextCell
          primary={`${row.person.firstName} ${row.person.lastName}`.trim()}
          secondary={row.person.email}
        />
      )
    },
    {
      key: 'personLocation',
      label: 'Location',
      width: '9%',
      render: (_, row) => (
        <TruncateCell className="text-xs text-[var(--color-text-secondary)]">
          {row.person.location || '—'}
        </TruncateCell>
      )
    },
    {
      key: 'manager',
      label: 'Manager',
      width: '19%',
      render: (_, row) => (
        <StackedTextCell
          primary={getManagerDisplayName(row.submittedBy)}
          secondary={row.submittedBy?.email || '—'}
        />
      )
    },
    {
      key: 'managerClub',
      label: 'Manager Club',
      width: '13%',
      cellClassName: 'align-middle max-w-0 overflow-hidden',
      render: (_, row) => (
        <TruncateCell className="text-xs text-[var(--color-text-secondary)]">
          {row.submittedBy?.club}
        </TruncateCell>
      )
    }
  ];

  const newColumns = [
    ...sharedStartColumns,
    {
      key: 'tags',
      label: 'Tags',
      width: '10%',
      cellClassName: 'align-middle max-w-0 overflow-hidden pl-2 pr-1',
      render: (val) => (
        <div className="flex items-center justify-start min-w-0 -ml-1">
          {(val || []).map((t) => (
            <Tag key={t} variant={t === 'Already Exists' ? 'already-exists' : 'neutral'} label={t} compact={t === 'Already Exists'} />
          ))}
        </div>
      )
    },
    {
      key: 'actions',
      label: 'Mark as',
      width: '128px',
      noShrink: true,
      cellClassName: 'text-right align-middle whitespace-nowrap pl-0 pr-2',
      render: (_, row) => (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setSelectedNewRequest(row)}
            aria-label="View request details"
            className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-highlight)] rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmActionRequest(row)}
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

  const displayedRows = useMemo(
    () => filteredRequests.map((req) => ({ ...req, alreadyExists: req.tags?.includes('Already Exists') })),
    [filteredRequests]
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 select-none">
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
            <div className="flex items-center bg-[var(--color-surface-panel)] rounded-xl p-1 gap-1 ring-1 ring-[rgba(26,26,46,0.05)] w-fit">
            {[
              { key: 'All', label: 'All', count: allCount },
              { key: 'Add', label: 'Add', count: addCount },
              { key: 'Remove', label: 'Remove', count: removeCount }
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => handleActionTabSwitch(key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  actionTab === key
                    ? 'bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)] shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {label}
                <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  actionTab === key
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

      {/* Table */}
      <div className="w-full">
        <DataTable
          columns={newColumns}
          rows={displayedRows}
          onRowClick={(row) => setSelectedNewRequest(row)}
          emptyMessage={`No ${actionTab === 'All' ? '' : `${actionTab.toLowerCase()} `}requests matching your filters.`}
          compact
          centerHeaders
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
            <button onClick={handleCreateRequest} disabled={!isModalFormValid}
              className={`px-4 py-2 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm cursor-pointer ${isModalFormValid ? 'bg-[var(--color-brand-accent)] hover:bg-[var(--color-brand-accent-hover)]' : 'bg-gray-300 cursor-not-allowed'}`}>
              {personForms.length === 1 ? 'Create Request' : `Create ${personForms.length} Requests`}
            </button>
          </>
        }
      >
        <form onSubmit={handleCreateRequest} className="space-y-4 text-left">
          <div className="space-y-3">
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Manager Details</span>
            <div className="grid grid-cols-2 gap-3">
              {[['First Name *', 'firstName', 'text'], ['Last Name *', 'lastName', 'text']].map(([label, field, type]) => (
                <div key={field}>
                  <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1">{label}</label>
                  <input type={type} required value={managerForm[field]}
                    onChange={(e) => setManagerForm({ ...managerForm, [field]: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--color-surface-panel)]/50 border border-[var(--color-border-default)] rounded-lg text-sm focus:outline-none focus:bg-white focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[rgba(233,69,96,0.08)] transition-all" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[['Email *', 'email', 'email'], ['Club Location *', 'club', 'text']].map(([label, field, type]) => (
                <div key={field}>
                  <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1">{label}</label>
                  <input type={type} required value={managerForm[field]}
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
                <div className="grid grid-cols-2 gap-3">
                  {[['First Name *', 'firstName', 'text'], ['Last Name *', 'lastName', 'text']].map(([label, field, type]) => (
                    <div key={field}>
                      <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1">{label}</label>
                      <input
                        type={type}
                        required
                        value={person[field]}
                        onChange={(e) => updatePersonForm(index, field, e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[var(--color-border-default)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[rgba(233,69,96,0.08)] transition-all"
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[['Email *', 'email', 'email'], ['Location *', 'location', 'text']].map(([label, field, type]) => (
                    <div key={field}>
                      <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1">{label}</label>
                      <input
                        type={type}
                        required
                        value={person[field]}
                        onChange={(e) => updatePersonForm(index, field, e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[var(--color-border-default)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[rgba(233,69,96,0.08)] transition-all"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            </div>

            <button
              type="button"
              onClick={addPersonForm}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-[var(--color-border-default)] text-sm font-semibold text-[var(--color-brand-primary)] bg-[var(--color-surface-panel)]/40 hover:bg-[var(--color-surface-highlight)] transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add one more</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Additional Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional notes..."
              className="w-full h-16 px-3 py-2 bg-[var(--color-surface-panel)]/50 border border-[var(--color-border-default)] rounded-lg text-sm placeholder-[var(--color-text-muted)] focus:outline-none focus:bg-white focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[rgba(233,69,96,0.08)] transition-all resize-none" />
          </div>
          <div className="text-[11px] font-medium text-[var(--color-text-muted)] select-none pt-3 border-t border-[var(--color-border-default)]/80">
            Created by Andrea (Admin)
          </div>
        </form>
      </Modal>

      {/* ── Confirm action modal (list + drawer) ── */}
      <Modal
        isOpen={confirmActionRequest !== null}
        onClose={() => setConfirmActionRequest(null)}
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
              onClick={() => confirmActionRequest && completeRequest(confirmActionRequest)}
              className="px-4 py-2 text-white text-sm font-semibold rounded-lg bg-[var(--color-brand-accent)] hover:bg-[var(--color-brand-accent-hover)] shadow-sm cursor-pointer"
            >
              Confirm
            </button>
          </>
        }
      >
        {confirmActionRequest && (
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed text-left">
            Confirm you have {confirmActionRequest.action === 'Add' ? 'added' : 'removed'}{' '}
            <strong className="text-[var(--color-text-primary)] font-bold">
              {confirmActionRequest.person.firstName} {confirmActionRequest.person.lastName}
            </strong>{' '}
            in Power Music before continuing. This cannot be undone.
          </p>
        )}
      </Modal>

      {/* ── New Request Detail Drawer ── */}
      <RequestDetailDrawer
        request={selectedNewRequest}
        isOpen={selectedNewRequest !== null}
        onClose={() => setSelectedNewRequest(null)}
        ledger={liveDirectory}
        onConfirmAction={(req) => setConfirmActionRequest(req)}
      />

    </div>
  );
}
