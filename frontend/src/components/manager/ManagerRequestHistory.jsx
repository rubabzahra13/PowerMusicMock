import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ClipboardList, Loader2 } from 'lucide-react';
import ManagerRequestHistoryModal from './ManagerRequestHistoryModal';
import {
  countManagerHandledRequestUnseen,
  countManagerPendingUnseen,
  dismissManagerPendingHighlights,
  registerManagerHandledPageVisit,
} from '../../utils/managerUiHighlights';
import {
  useManagerRequestSummary,
  useManagerRequests,
} from '../../hooks/useManagerRequests';

function requestSummary({ total, pendingCount, pendingUnseenCount, unreadCount, loading, error, historyOpen }) {
  if (historyOpen && loading) return 'Loading your request history…';
  if (error) return error;
  if (total === 0) return 'You have not submitted any requests yet.';
  const parts = [];
  if (pendingUnseenCount > 0) {
    parts.push(`${pendingUnseenCount} new pending`);
  } else if (pendingCount > 0) {
    parts.push(`${pendingCount} pending`);
  }
  parts.push(`${total} total`);
  if (unreadCount > 0) {
    parts.push(`${unreadCount} new update${unreadCount === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

export default function ManagerRequestHistory({ refreshToken = 0 }) {
  const location = useLocation();
  const [showAllModal, setShowAllModal] = useState(false);
  const [highlightVersion, setHighlightVersion] = useState(0);

  const bumpHighlights = useCallback(() => setHighlightVersion((v) => v + 1), []);
  const { meta: summaryMeta, loading: summaryLoading, error: summaryError, refresh: refreshSummary } =
    useManagerRequestSummary(refreshToken);
  const {
    requests,
    meta,
    initialLoading,
    error: historyError,
    refresh: refreshRequests,
  } = useManagerRequests(refreshToken, bumpHighlights, {
    enabled: true,
    backgroundPollEnabled: showAllModal,
    pollIntervalMs: 15000,
  });

  const unreadCount = useMemo(() => {
    void highlightVersion;
    return countManagerHandledRequestUnseen();
  }, [highlightVersion]);

  const pendingUnseenCount = useMemo(() => {
    void highlightVersion;
    return countManagerPendingUnseen();
  }, [highlightVersion]);

  useEffect(() => {
    registerManagerHandledPageVisit(location.key);
    bumpHighlights();
  }, [location.key, bumpHighlights]);

  const summary = requestSummary({
    total: summaryMeta.total,
    pendingCount: summaryMeta.pendingCount,
    pendingUnseenCount,
    unreadCount,
    loading: summaryLoading,
    error: summaryError,
    historyOpen: showAllModal,
  });

  const handleCloseModal = () => {
    dismissManagerPendingHighlights(requests);
    bumpHighlights();
    setShowAllModal(false);
    refreshSummary();
    refreshRequests();
  };

  return (
    <>
      <section
        className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/40 p-4"
        aria-labelledby="manager-requests-heading"
      >
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-[var(--color-border-default)]"
            aria-hidden="true"
          >
            <ClipboardList className="h-4 w-4 text-[var(--color-brand-primary)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="manager-requests-heading"
                className="text-sm font-semibold text-[var(--color-text-primary)]"
              >
                Your requests
              </h2>
              {pendingUnseenCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {pendingUnseenCount} pending
                </span>
              )}
              {unreadCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-[var(--color-brand-primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
                  {unreadCount} update{unreadCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
              Track submissions and see when Power Music has actioned them.
            </p>
            <p
              className={`mt-2 text-xs ${
                summaryError ? 'text-red-600' : 'text-[var(--color-text-secondary)]'
              }`}
              role={summaryError ? 'alert' : 'status'}
            >
              {summaryLoading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  {summary}
                </span>
              ) : (
                summary
              )}
            </p>
            <button
              type="button"
              onClick={() => setShowAllModal(true)}
              disabled={summaryLoading}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-[var(--color-brand-primary)] px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-surface-sidebar-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
            >
              View your requests
            </button>
          </div>
        </div>
      </section>

      <ManagerRequestHistoryModal
        isOpen={showAllModal}
        onClose={handleCloseModal}
        requests={requests}
        pendingCount={meta.pendingCount || summaryMeta.pendingCount}
        pendingUnseenCount={pendingUnseenCount}
        loading={initialLoading && requests.length === 0}
        error={historyError}
        highlightVersion={highlightVersion}
        onHighlightChange={bumpHighlights}
      />
    </>
  );
}
