import { useState, useEffect } from 'react';
import { Mail, Link2, Unlink, Plus, Trash2, Pencil } from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import DottedScroll from '../components/ui/DottedScroll';
import { Modal, Toast, useToast } from '../components/ui';

const STORAGE_KEY = 'power_music_email_accounts_v1';

const INITIAL_ACCOUNTS = [
  {
    id: 1,
    title: 'Customer Care',
    email: 'cc@powermusic.com',
    date: '21 Jun 2026',
    status: 'Connected',
  },
  {
    id: 2,
    title: 'Music Apps',
    email: 'cc@powermusicapp.com',
    date: '21 Jun 2026',
    status: 'Connected',
  },
  {
    id: 3,
    title: 'General Info',
    email: 'info@powermusic.com',
    date: '21 Jun 2026',
    status: 'Connected',
  },
  {
    id: 4,
    title: 'Tracks',
    email: 'tracks@powermusic.com',
    date: '21 Jun 2026',
    status: 'Connected',
  },
  {
    id: 5,
    title: 'Royalty Free Music',
    email: 'royaltyfree@powermusic.com',
    date: '21 Jun 2026',
    status: 'Connected',
  },
];

function loadAccounts() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      /* fallthrough */
    }
  }
  return INITIAL_ACCOUNTS;
}

export default function EmailAccounts() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState(loadAccounts);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  }, [accounts]);

  const openRenameModal = (account) => {
    setRenameTarget(account);
    setRenameValue(account.title);
  };

  const closeRenameModal = () => {
    setRenameTarget(null);
    setRenameValue('');
  };

  const handleRename = () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      showToast('Please enter a name for this account.', 'error');
      return;
    }
    setAccounts((prev) =>
      prev.map((account) =>
        account.id === renameTarget.id ? { ...account, title: trimmed } : account
      )
    );
    showToast(`Renamed to "${trimmed}".`, 'success');
    closeRenameModal();
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const title = deleteTarget.title;
    setAccounts((prev) => prev.filter((account) => account.id !== deleteTarget.id));
    setDeleteTarget(null);
    showToast(`"${title}" has been removed.`, 'success');
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] overflow-hidden">
      <Toast />

      <PageHeader
        section="Customer support"
        title="Manage connected accounts"
        description="Manage connected email inboxes for each vertical."
        className="mb-4 shrink-0"
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

      <DottedScroll>
        {accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border-default)] bg-white p-8 text-center shrink-0">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">No connected accounts</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Add a email inbox to get started.</p>
          </div>
        ) : (
          accounts.map((account) => (
            <div
              key={account.id}
              className="group bg-white border border-[var(--color-border-default)] rounded-xl shadow-sm p-5 flex flex-col hover:border-[var(--color-surface-highlight-strong)] hover:bg-[var(--color-surface-panel)] transition-colors shrink-0"
            >
              {/* Top Section */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[var(--color-surface-highlight)] group-hover:bg-[var(--color-surface-highlight-strong)] rounded-xl flex items-center justify-center shrink-0 transition-colors">
                    <Mail className="w-5 h-5 text-[var(--color-brand-primary)]" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-[var(--color-text-primary)] leading-tight group-hover:text-[var(--color-brand-primary)] transition-colors truncate">
                      {account.title}
                    </h2>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Connect the email inbox used for this vertical</p>
                    <button
                      type="button"
                      onClick={() => openRenameModal(account)}
                      aria-label={`Rename ${account.title}`}
                      className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--color-brand-primary)] bg-[var(--color-surface-highlight)] hover:bg-[var(--color-surface-highlight-strong)] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Rename
                    </button>
                  </div>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)] shrink-0">
                  {account.status}
                </span>
              </div>

              {/* Divider */}
              <div className="h-px bg-[var(--color-border-default)] w-full mb-4" />

              {/* Bottom Section */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-[var(--color-text-primary)]">{account.email}</div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5">Connected {account.date}</div>
                </div>
                <div className="flex items-start gap-3">
                  <button type="button" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] bg-white border border-[var(--color-border-default)] rounded-lg hover:bg-gray-50 transition-colors shadow-sm cursor-pointer">
                    <Link2 className="w-4 h-4 text-[var(--color-text-secondary)]" />
                    Reconnect
                  </button>
                  <button type="button" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[var(--color-brand-primary)] bg-white border border-[var(--color-border-default)] rounded-lg hover:bg-[var(--color-surface-highlight)] hover:border-[var(--color-surface-highlight-strong)] transition-colors shadow-sm cursor-pointer">
                    <Unlink className="w-4 h-4 text-[var(--color-text-secondary)]" />
                    Disconnect
                  </button>
                </div>
              </div>
              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(account)}
                  aria-label={`Remove ${account.title}`}
                  title="Remove account"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </DottedScroll>

      <Modal
        isOpen={Boolean(renameTarget)}
        onClose={closeRenameModal}
        title="Rename account"
        footer={
          <>
            <button
              type="button"
              onClick={closeRenameModal}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-medium text-[var(--color-text-primary)] hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRename}
              className="px-4 py-2 text-white text-sm font-semibold rounded-md bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] transition-colors shadow-sm cursor-pointer"
            >
              Save
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[var(--color-text-secondary)]">
            Update the display name for <strong>{renameTarget?.email}</strong>.
          </p>
          <label className="block">
            <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Account name</span>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
              }}
              autoFocus
              className="mt-1.5 w-full px-3 py-2 text-sm border border-[var(--color-border-default)] rounded-lg focus:outline-none focus:border-[var(--color-border-focus)]"
            />
          </label>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete account"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-medium text-[var(--color-text-primary)] hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 text-white text-sm font-semibold rounded-md bg-red-600 hover:bg-red-700 transition-colors shadow-sm cursor-pointer"
            >
              Delete account
            </button>
          </>
        }
      >
        <div className="text-sm text-[var(--color-text-primary)] space-y-2">
          <p>
            Are you sure you want to delete <strong>{deleteTarget?.title}</strong> ({deleteTarget?.email})?
          </p>
          <p className="text-[var(--color-text-secondary)]">This removes the account from your connected inboxes. This action cannot be undone.</p>
        </div>
      </Modal>
    </div>
  );
}
