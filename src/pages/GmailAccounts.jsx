import { useState, useEffect } from 'react';
import { Mail, Link2, Unlink, Plus, Trash2, Pencil, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import { Modal, Toast, useToast } from '../components/ui';

const STORAGE_KEY = 'power_music_gmail_accounts_v1';

const INITIAL_ACCOUNTS = [
  { id: 1, title: 'Customer Care',    email: 'cc@powermusic.com',        date: '21 Jun 2026', status: 'Connected' },
  { id: 2, title: 'Music Apps',       email: 'cc@powermusicapp.com',      date: '21 Jun 2026', status: 'Connected' },
  { id: 3, title: 'General Info',     email: 'info@powermusic.com',       date: '21 Jun 2026', status: 'Connected' },
  { id: 4, title: 'Tracks',           email: 'tracks@powermusic.com',     date: '21 Jun 2026', status: 'Connected' },
  { id: 5, title: 'Royalty Free Music', email: 'royaltyfree@powermusic.com', date: '21 Jun 2026', status: 'Connected' },
];

function loadAccounts() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try { return JSON.parse(stored); } catch { /* fallthrough */ }
  }
  return INITIAL_ACCOUNTS;
}

export default function GmailAccounts() {
  const { showToast } = useToast();
  const [accounts, setAccounts]       = useState(loadAccounts);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue]   = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  }, [accounts]);

  const openRenameModal = (account) => { setRenameTarget(account); setRenameValue(account.title); };
  const closeRenameModal = () => { setRenameTarget(null); setRenameValue(''); };

  const handleRename = () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) { showToast('Please enter a name.', 'error'); return; }
    setAccounts(prev => prev.map(a => a.id === renameTarget.id ? { ...a, title: trimmed } : a));
    showToast(`Renamed to "${trimmed}".`, 'success');
    closeRenameModal();
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const title = deleteTarget.title;
    setAccounts(prev => prev.filter(a => a.id !== deleteTarget.id));
    setDeleteTarget(null);
    showToast(`"${title}" removed.`, 'success');
  };

  return (
    <div className="max-w-7xl mx-auto flex flex-col h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] overflow-hidden">
      <Toast />

      <PageHeader
        section="Customer Support"
        title="Settings"
        workspace
        className="shrink-0"
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        }
      />

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-6">

        {/* Section header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[var(--color-text-primary)]">Gmail inboxes</h2>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-surface-highlight-strong)] text-[var(--color-text-secondary)]">
              {accounts.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-signal-green)]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            All connected
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">

          {accounts.map((account) => (
            <div
              key={account.id}
              className="group bg-white border border-[var(--color-border-default)] rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[0_4px_16px_rgba(26,26,46,0.1)] hover:border-[var(--color-surface-highlight-strong)] transition-all duration-200"
            >
              {/* Card body */}
              <div className="p-5">
                {/* Top row: icon + name + status */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[var(--color-surface-highlight)] group-hover:bg-[var(--color-surface-highlight-strong)] flex items-center justify-center shrink-0 transition-colors">
                      <Mail className="w-4 h-4 text-[var(--color-brand-primary)]" />
                    </div>
                    <span className="text-sm font-bold text-[var(--color-text-primary)] truncate leading-snug">
                      {account.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-signal-green)]" />
                    <span className="text-[11px] font-semibold text-[var(--color-signal-green)]">
                      {account.status}
                    </span>
                  </div>
                </div>

                {/* Email + date */}
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                    {account.email}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    Since {account.date}
                  </p>
                </div>
              </div>

              {/* Card footer */}
              <div className="px-5 py-3 border-t border-[var(--color-border-default)] bg-[var(--color-surface-panel)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openRenameModal(account)}
                    title="Rename"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-brand-primary)] hover:bg-[var(--color-surface-highlight-strong)] transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                    Rename
                  </button>
                  <button
                    type="button"
                    title="Reconnect"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-brand-primary)] hover:bg-[var(--color-surface-highlight-strong)] transition-colors cursor-pointer"
                  >
                    <Link2 className="w-3 h-3" />
                    Reconnect
                  </button>
                  <button
                    type="button"
                    title="Disconnect"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-brand-primary)] hover:bg-[var(--color-surface-highlight-strong)] transition-colors cursor-pointer"
                  >
                    <Unlink className="w-3 h-3" />
                    Disconnect
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setDeleteTarget(account)}
                  title="Remove account"
                  className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Add Account tile */}
          <button
            type="button"
            className="group flex flex-col items-center justify-center gap-2.5 min-h-[152px] rounded-2xl border-2 border-dashed border-[var(--color-border-default)] hover:border-[var(--color-surface-highlight-strong)] hover:bg-white transition-all duration-200 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-[var(--color-surface-highlight)] group-hover:bg-[var(--color-surface-highlight-strong)] flex items-center justify-center transition-colors">
              <Plus className="w-4 h-4 text-[var(--color-text-secondary)]" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors">Add inbox</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Connect a Gmail account</p>
            </div>
          </button>

        </div>
      </div>

      {/* Rename Modal */}
      <Modal
        isOpen={Boolean(renameTarget)}
        onClose={closeRenameModal}
        title="Rename account"
        footer={
          <>
            <button type="button" onClick={closeRenameModal} className="px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-medium text-[var(--color-text-primary)] hover:bg-gray-50 transition-colors cursor-pointer">
              Cancel
            </button>
            <button type="button" onClick={handleRename} className="px-4 py-2 text-white text-sm font-semibold rounded-md bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors shadow-sm cursor-pointer">
              Save
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[var(--color-text-secondary)]">Update the display name for <strong>{renameTarget?.email}</strong>.</p>
          <label className="block">
            <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Account name</span>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
              autoFocus
              className="mt-1.5 w-full px-3 py-2 text-sm border border-[var(--color-border-default)] rounded-lg focus:outline-none focus:border-[var(--color-border-focus)]"
            />
          </label>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remove account"
        footer={
          <>
            <button type="button" onClick={() => setDeleteTarget(null)} className="px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-medium text-[var(--color-text-primary)] hover:bg-gray-50 transition-colors cursor-pointer">
              Cancel
            </button>
            <button type="button" onClick={handleDelete} className="px-4 py-2 text-white text-sm font-semibold rounded-md bg-red-600 hover:bg-red-700 transition-colors shadow-sm cursor-pointer">
              Remove
            </button>
          </>
        }
      >
        <div className="text-sm text-[var(--color-text-primary)] space-y-2">
          <p>Remove <strong>{deleteTarget?.title}</strong> ({deleteTarget?.email})?</p>
          <p className="text-[var(--color-text-secondary)]">This disconnects the inbox from Power Music Ops. This action cannot be undone.</p>
        </div>
      </Modal>
    </div>
  );
}
