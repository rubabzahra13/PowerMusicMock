import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Modal, HoverTip } from '../ui';
import ManagerRequestHistoryRow, {
  MANAGER_REQUEST_HISTORY_GRID,
} from './ManagerRequestHistoryRow';
import ManagerRequestHistoryTabs, {
  MANAGER_REQUEST_HISTORY_PANEL_ID,
} from './ManagerRequestHistoryTabs';
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

export default function ManagerRequestHistoryModal({
  isOpen,
  onClose,
  requests = [],
  pendingCount = 0,
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
    if (!isOpen) return;
    setPage(1);
  }, [activeTab, isOpen]);

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
      new: pendingCount || pending,
      handled,
    };
  }, [requests, pendingCount]);

  const dateColumnLabel =
    activeTab === 'new' ? 'Submitted' : activeTab === 'handled' ? 'Handled at' : 'Date';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Your request history"
      extraWide
      stableHeight
      headerExtra={
        unreadCount > 0 ? (
          <button
            type="button"
            onClick={handleDismissAll}
            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-[var(--color-brand-primary)] transition-colors hover:bg-[var(--color-surface-highlight)] sm:px-2.5 sm:text-[11px]"
          >
            Dismiss all
          </button>
        ) : null
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <p className="shrink-0 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          Browse by status below. Handled requests stay highlighted until you open them.
        </p>

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
          className="flex min-h-0 flex-1 flex-col"
        >
          {loading && (
            <div className="flex flex-1 items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading your requests…
            </div>
          )}

          {!loading && error && (
            <p className="flex flex-1 items-center justify-center text-center text-xs text-red-600" role="alert">
              {error}
            </p>
          )}

          {!loading && !error && tabbedRequests.length === 0 && (
            <p className="flex flex-1 items-center justify-center text-center text-xs text-[var(--color-text-muted)]">
              {activeTab === 'handled'
                ? 'No handled requests in this view yet.'
                : activeTab === 'new'
                  ? 'No pending requests right now.'
                  : 'You have not submitted any requests yet.'}
            </p>
          )}

          {hasList && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--color-border-default)]">
              <div
                className={`hidden shrink-0 sm:grid ${MANAGER_REQUEST_HISTORY_GRID} gap-x-4 border-b border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/60 px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]`}
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
                className="min-h-0 flex-1 divide-y divide-[var(--color-border-default)] overflow-y-auto overscroll-contain"
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

        <div
          className={`flex shrink-0 flex-col gap-2 border-t border-[var(--color-border-default)] pt-3 sm:h-10 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
            hasList ? '' : 'invisible'
          }`}
          aria-hidden={!hasList}
        >
          <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
            Showing {pageRangeStart}–{pageRangeEnd} of {tabbedRequests.length}
            {pageCount > 1 ? ` · Page ${paged.page} of ${pageCount}` : ''}
            {activeTab === 'new' && pendingOnPage > 0
              ? ` · ${pendingOnPage} pending on this page`
              : ''}
          </p>
          <div className="flex items-center gap-1.5">
            <HoverTip label="Previous page">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
                tabIndex={hasList ? 0 : -1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-panel)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </HoverTip>
            <HoverTip label="Next page">
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                disabled={page >= pageCount}
                aria-label="Next page"
                tabIndex={hasList ? 0 : -1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-panel)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </HoverTip>
          </div>
        </div>
      </div>
    </Modal>
  );
}
