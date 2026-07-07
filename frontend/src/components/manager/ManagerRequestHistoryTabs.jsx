import { useCallback } from 'react';
import { CheckCircle2, Clock3, Layers } from 'lucide-react';
import { MANAGER_REQUEST_TABS } from '../../utils/managerRequestHistory';

export const MANAGER_REQUEST_HISTORY_PANEL_ID = 'manager-request-history-panel';

const TAB_ICONS = {
  all: Layers,
  new: Clock3,
  handled: CheckCircle2,
};

function tabAriaLabel(tab, count, attentionCount) {
  const noun = count === 1 ? 'request' : 'requests';
  let label = `${tab.label}, ${count} ${noun}`;

  if (tab.value === 'new' && attentionCount > 0) {
    label += ', awaiting review';
  } else if (tab.value === 'handled' && attentionCount > 0) {
    const updateNoun = attentionCount === 1 ? 'update' : 'updates';
    label += `, ${attentionCount} unread ${updateNoun}`;
  }

  return label;
}

export default function ManagerRequestHistoryTabs({
  activeTab,
  onChange,
  counts,
  pendingUnseenCount = 0,
  unreadCount = 0,
}) {
  const tabIds = MANAGER_REQUEST_TABS.map((tab) => tab.value);

  const focusTab = useCallback((tabId) => {
    requestAnimationFrame(() => {
      document.getElementById(`manager-request-history-tab-${tabId}`)?.focus();
    });
  }, []);

  const handleKeyDown = (event, tabId) => {
    const index = tabIds.indexOf(tabId);
    if (index < 0) return;

    let nextId = null;
    if (event.key === 'ArrowRight') nextId = tabIds[(index + 1) % tabIds.length];
    else if (event.key === 'ArrowLeft') nextId = tabIds[(index - 1 + tabIds.length) % tabIds.length];
    else if (event.key === 'Home') nextId = tabIds[0];
    else if (event.key === 'End') nextId = tabIds[tabIds.length - 1];

    if (!nextId) return;
    event.preventDefault();
    onChange(nextId);
    focusTab(nextId);
  };

  return (
    <div className="shrink-0 -mx-6 border-b border-[var(--color-border-default)] px-6">
      <div
        role="tablist"
        aria-label="Filter request history"
        aria-orientation="horizontal"
        className="grid grid-cols-3"
      >
        {MANAGER_REQUEST_TABS.map((tab) => {
          const selected = activeTab === tab.value;
          const count = counts[tab.value] ?? 0;
          const attentionCount =
            tab.value === 'new' ? pendingUnseenCount : tab.value === 'handled' ? unreadCount : 0;
          const Icon = TAB_ICONS[tab.value];

          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              id={`manager-request-history-tab-${tab.value}`}
              aria-controls={MANAGER_REQUEST_HISTORY_PANEL_ID}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              aria-label={tabAriaLabel(tab, count, attentionCount)}
              title={tab.hint}
              onClick={() => onChange(tab.value)}
              onKeyDown={(event) => handleKeyDown(event, tab.value)}
              className={`group relative flex flex-col items-center gap-1.5 px-2 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-brand-primary)]/35 ${
                selected
                  ? 'text-[var(--color-brand-primary)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-panel)]/60 hover:text-[var(--color-text-secondary)]'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                    selected
                      ? 'text-[var(--color-brand-primary)]'
                      : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]'
                  }`}
                  aria-hidden="true"
                />
                <span
                  aria-hidden="true"
                  className={`text-sm font-semibold leading-none ${
                    selected
                      ? 'text-[var(--color-brand-primary)]'
                      : 'text-[var(--color-text-primary)] group-hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {tab.label}
                </span>
              </span>

              <span className="flex min-h-[1rem] items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`text-[11px] font-medium tabular-nums leading-none ${
                    selected
                      ? 'text-[var(--color-brand-primary)]/85'
                      : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {count}
                </span>
                {tab.value === 'new' && attentionCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500 ring-2 ring-amber-500/20"
                  />
                )}
                {tab.value === 'handled' && attentionCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center rounded-full bg-[var(--color-brand-primary)]/10 px-1.5 py-px text-[10px] font-semibold leading-none text-[var(--color-brand-primary)]"
                  >
                    {attentionCount} unread
                  </span>
                )}
              </span>

              <span
                aria-hidden="true"
                className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-all duration-200 ${
                  selected ? 'bg-[var(--color-brand-primary)]' : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
