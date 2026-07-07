import { CheckCircle2, Clock3, Inbox, Sparkles } from 'lucide-react';
import { MANAGER_REQUEST_TABS } from '../../utils/managerRequestHistory';

const EMPTY_STATES = {
  all: {
    icon: Inbox,
    title: 'No requests yet',
    description: 'When you submit add or remove requests from the form, they will appear here.',
  },
  new: {
    icon: Clock3,
    title: 'Nothing pending',
    description: 'You have no requests waiting for review right now.',
  },
  handled: {
    icon: CheckCircle2,
    title: 'No handled requests',
    description: 'Completed requests will show up here once Power Music has actioned them.',
  },
};

export default function ManagerRequestHistoryEmpty({ activeTab }) {
  const tab = MANAGER_REQUEST_TABS.find((item) => item.value === activeTab) ?? MANAGER_REQUEST_TABS[0];
  const state = EMPTY_STATES[activeTab] ?? EMPTY_STATES.all;
  const Icon = state.icon;

  return (
    <div
      role="status"
      aria-label={`${tab.label}: ${state.title}`}
      className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center"
    >
      <span
        aria-hidden="true"
        className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface-panel)] ring-1 ring-[var(--color-border-default)]"
      >
        <Icon className="h-5 w-5 text-[var(--color-text-muted)]" />
      </span>
      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{state.title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-[var(--color-text-secondary)]">
        {state.description}
      </p>
    </div>
  );
}

export function ManagerRequestHistoryNotice({ unreadCount, onDismissAll }) {
  if (unreadCount <= 0) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-start gap-3 border-b border-[var(--color-brand-primary)]/15 bg-[var(--color-brand-primary)]/[0.04] px-5 py-3"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-primary)]/10 text-[var(--color-brand-primary)]"
      >
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-xs font-semibold text-[var(--color-text-primary)]">
          {unreadCount} handled update{unreadCount === 1 ? '' : 's'} to review
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
          Open a highlighted request to mark it as seen.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismissAll}
        className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-brand-primary)] transition-colors hover:bg-[var(--color-brand-primary)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/30"
      >
        Mark all seen
      </button>
    </div>
  );
}
