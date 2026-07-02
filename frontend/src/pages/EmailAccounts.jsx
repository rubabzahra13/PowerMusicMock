import { useEffect, useState, useCallback } from 'react';
import { Mail, Link2, Unlink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import PageHeader from '../components/layout/PageHeader';
import DottedScroll from '../components/ui/DottedScroll';
import { Toast, useToast } from '../components/ui';
import { getInboxes, connectInbox, disconnectInbox, loadWithCache } from '../utils/pilot2Api';

function connectedDate(iso) {
  if (!iso) return null;
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}

export default function GmailAccounts() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(() => {
    // Cached copy renders instantly; fresh data replaces it.
    loadWithCache('inboxes', getInboxes, setAccounts)
      .catch((err) => showToast(`Could not load inboxes: ${err.message}`, 'error'));
  }, [showToast]);

  useEffect(() => {
    refresh();
    // After the Google consent tab is closed, the user comes back here —
    // refresh on focus so the new "Connected" status shows up.
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  const handleConnect = async (account) => {
    setBusyId(account.id);
    try {
      const result = await connectInbox(account.email, account.title);
      if (result.authUrl) {
        window.open(result.authUrl, '_blank', 'noopener');
        showToast('Approve access in the Google tab, then return here.', 'info');
      } else {
        showToast(`${account.email} connected.`, 'success');
        refresh();
      }
    } catch (err) {
      showToast(`Connect failed: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async (account) => {
    setBusyId(account.id);
    try {
      await disconnectInbox(account.id);
      showToast(`${account.email} disconnected.`, 'success');
      refresh();
    } catch (err) {
      showToast(`Disconnect failed: ${err.message}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] overflow-hidden">
      <Toast />
      <PageHeader
        section="Customer support"
        title="Gmail accounts"
        description="Manage connected Gmail inboxes for each vertical."
        className="mb-4 shrink-0"
      />

      <DottedScroll>
        {accounts.map((account) => {
          const isConnected = account.status === 'Connected';
          return (
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
                  <div>
                    <h2 className="text-base font-bold text-[var(--color-text-primary)] leading-tight group-hover:text-[var(--color-brand-primary)] transition-colors">{account.title}</h2>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Connect the Gmail inbox used for this vertical</p>
                  </div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  isConnected
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {account.status}
                </span>
              </div>

              {/* Divider */}
              <div className="h-px bg-[var(--color-border-default)] w-full mb-4" />

              {/* Bottom Section */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-[var(--color-text-primary)]">{account.email}</div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {isConnected && account.connectedAt
                      ? `Connected ${connectedDate(account.connectedAt)}`
                      : 'Not connected yet'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleConnect(account)}
                    disabled={busyId === account.id}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] bg-white border border-[var(--color-border-default)] rounded-lg hover:bg-gray-50 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <Link2 className="w-4 h-4 text-[var(--color-text-secondary)]" />
                    {isConnected ? 'Reconnect' : 'Connect'}
                  </button>
                  {isConnected && (
                    <button
                      onClick={() => handleDisconnect(account)}
                      disabled={busyId === account.id}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 bg-white border border-[var(--color-border-default)] rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <Unlink className="w-4 h-4 text-red-500" />
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </DottedScroll>
    </div>
  );
}
