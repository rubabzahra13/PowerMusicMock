import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { HoverTip } from '../ui';
import ManagerRequestHistoryRow, {
  MANAGER_REQUEST_HISTORY_GRID,
} from './ManagerRequestHistoryRow';
import ManagerRequestHistoryTabs, {
  MANAGER_REQUEST_HISTORY_PANEL_ID,
} from './ManagerRequestHistoryTabs';
import ManagerRequestHistoryEmpty, {
  ManagerRequestHistoryNotice,
} from './ManagerRequestHistoryEmpty';
import {
  countManagerHandledRequestUnseen,
  countManagerPendingUnseen,
  dismissAllManagerHandledHighlights,
  dismissManagerPendingHighlights,
  markManagerHandledRequestViewed,
} from '../../utils/managerUiHighlights';
import { totalPages } from '../../utils/managerRequestHistory';
import { paginateManagerRequests, sortManagerRequestsForTab } from '../../hooks/useManagerRequests';
import { useAdaptiveListPageSize } from '../../hooks/useAdaptiveListPageSize';

function latestHandledRequestId(requests) {
  let latestId = null;
  let latestTime = -1;
  for (const request of requests) {
    if (request.status !== 'handled') continue;
    const time = request.handledAt ? new Date(request.handledAt).getTime() : 0;
    if (time > latestTime) {
      latestTime = time;
      latestId = request.id;
    }
  }
  return latestId;
}

function latestPendingRequestId(requests) {
  let latestId = null;
  let latestTime = -1;
  for (const request of requests) {
    if (request.status !== 'new') continue;
    const time = request.receivedAt ? new Date(request.receivedAt).getTime() : 0;
    if (time > latestTime) {
      latestTime = time;
      latestId = request.id;
    }
  }
  return latestId;
}

/**
 * Inline request history — same content as the former modal, embedded in the portal.
 */
export default function ManagerRequestHistoryPanel({
  onBack,
  requests = [],
  pendingUnseenCount = 0,
  loading = false,
  error = null,
  highlightVersion = 0,
  onHighlightChange,
}) {
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const listRef = useRef(null);
  const firstRowRef = useRef(null);

  const unreadCount = useMemo(() => {
    void highlightVersion;
    return countManagerHandledRequestUnseen();
  }, [highlightVersion]);

  const pendingUnseenInSession = useMemo(() => {
    void highlightVersion;
    return countManagerPendingUnseen();
  }, [highlightVersion]);

  const tabbedRequests = useMemo(
    () => sortManagerRequestsForTab(requests, activeTab),
    [requests, activeTab],
  );

  const hasList = !loading && !error && tabbedRequests.length > 0;
  const pageSize = useAdaptiveListPageSize(listRef, firstRowRef, hasList);

  const paged = useMemo(
    () => paginateManagerRequests(tabbedRequests, page, pageSize),
    [tabbedRequests, page, pageSize],
  );

  const pageCount = useMemo(
    () => totalPages(paged.total, pageSize),
    [paged.total, pageSize],
  );

  const spotlightRequestId = useMemo(() => {
    void highlightVersion;
    if (unreadCount > 0 && (activeTab === 'handled' || activeTab === 'all')) {
      return latestHandledRequestId(tabbedRequests);
    }
    if (pendingUnseenInSession > 0 && (activeTab === 'new' || activeTab === 'all')) {
      return latestPendingRequestId(tabbedRequests);
    }
    return null;
  }, [activeTab, highlightVersion, pendingUnseenInSession, tabbedRequests, unreadCount]);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const handleOpenRequest = (request) => {
    if (request.status !== 'handled') return;
    if (request.id === spotlightRequestId) {
      dismissAllManagerHandledHighlights();
    } else {
      markManagerHandledRequestViewed(request.id);
    }
    onHighlightChange?.();
  };

  const handleDismissAll = () => {
    dismissAllManagerHandledHighlights();
    onHighlightChange?.();
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    dismissManagerPendingHighlights(requests);
    dismissAllManagerHandledHighlights();
    onHighlightChange?.();
  };

  const pendingOnPage = paged.items.filter((row) => row.status === 'new').length;

  const pageRangeStart = tabbedRequests.length === 0 ? 0 : (paged.page - 1) * pageSize + 1;
  const pageRangeEnd = tabbedRequests.length === 0
    ? 0
    : Math.min(paged.page * pageSize, tabbedRequests.length);

  const tabCounts = useMemo(() => {
    const pending = requests.filter((request) => request.status === 'new').length;
    const handled = requests.filter((request) => request.status === 'handled').length;
    return {
      all: requests.length,
      new: pending,
      handled,
    };
  }, [requests]);

  const showPagination = hasList && pageCount > 1;

  const dateColumnLabel =
    activeTab === 'new' ? 'Submitted' : activeTab === 'handled' ? 'Handled at' : 'Date';

  return (
    <section
      aria-labelledby="manager-request-history-heading"
      className="relative overflow-hidden rounded-2xl border border-[var(--color-manager-border)] bg-[var(--color-manager-card)] shadow-[var(--shadow-manager-form)]"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--color-brand-accent)]/80 via-[var(--color-brand-secondary)] to-[var(--color-brand-accent)]/80"
        aria-hidden="true"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-manager-border)] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-manager-panel)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/30"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </button>
          <div className="min-w-0">
            <h1
              id="manager-request-history-heading"
              className="truncate text-base font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-lg"
            >
              Your requests
            </h1>
          </div>
        </div>

        {!loading && !error && requests.length > 0 && (
          <p className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
            {tabCounts.new > 0 ? (
              <>
                <span className="font-semibold text-amber-700">{tabCounts.new}</span> pending
                <span aria-hidden="true"> · </span>
              </>
            ) : null}
            {tabCounts.handled} handled
          </p>
        )}
      </div>

      <ManagerRequestHistoryNotice unreadCount={unreadCount} onDismissAll={handleDismissAll} />

      <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
        <ManagerRequestHistoryTabs
          activeTab={activeTab}
          onChange={handleTabChange}
          counts={tabCounts}
          pendingUnseenCount={pendingUnseenCount}
          unreadCount={unreadCount}
        />

        <div
          role="tabpanel"
          id={MANAGER_REQUEST_HISTORY_PANEL_ID}
          aria-labelledby={`manager-request-history-tab-${activeTab}`}
        >
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-[var(--color-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading your requests…
            </div>
          )}

          {!loading && error && (
            <p className="py-16 text-center text-xs text-red-600" role="alert">
              {error}
            </p>
          )}

          {!loading && !error && tabbedRequests.length === 0 && (
            <ManagerRequestHistoryEmpty activeTab={activeTab} />
          )}

          {hasList && (
            <div className="overflow-hidden rounded-xl border border-[var(--color-manager-border)] bg-white">
              <div
                className={`hidden shrink-0 sm:grid ${MANAGER_REQUEST_HISTORY_GRID} gap-x-4 border-b border-[var(--color-manager-border)] bg-[var(--color-manager-panel)]/60 px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]`}
                aria-hidden="true"
              >
                <span className="text-left">#</span>
                <span>Type</span>
                <span>{dateColumnLabel}</span>
                <span className="text-left">Person</span>
                <span>Status</span>
              </div>

              <ul
                ref={listRef}
                className="divide-y divide-[var(--color-manager-border)] overflow-y-auto overscroll-contain"
              >
                {paged.items.map((request, index) => (
                  <ManagerRequestHistoryRow
                    key={request.id}
                    ref={index === 0 ? firstRowRef : undefined}
                    request={request}
                    rowNumber={pageRangeStart + index}
                    onOpen={handleOpenRequest}
                    showAsNew={request.id === spotlightRequestId}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>

        {hasList && (
          <div
            className={`flex flex-col gap-2 sm:flex-row sm:items-center ${
              showPagination ? 'sm:justify-between' : 'sm:justify-start'
            }`}
          >
            <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
              {tabbedRequests.length === 1
                ? '1 request'
                : `${tabbedRequests.length} requests`}
              {pageCount > 1
                ? ` · Showing ${pageRangeStart}–${pageRangeEnd}`
                : ''}
              {activeTab === 'new' && pendingOnPage > 0
                ? ` · ${pendingOnPage} pending on this page`
                : ''}
            </p>
            {showPagination && (
              <div className="flex items-center gap-1.5">
                <HoverTip label="Previous page">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    aria-label="Previous page"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-manager-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-manager-panel)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </HoverTip>
                <span className="min-w-[4.5rem] text-center text-[11px] tabular-nums text-[var(--color-text-muted)]">
                  {paged.page} / {pageCount}
                </span>
                <HoverTip label="Next page">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    disabled={page >= pageCount}
                    aria-label="Next page"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-manager-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-manager-panel)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </HoverTip>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
