/**
 * Modern filter tabs: no grey capsule track.
 * Active tab uses weight + brand underline; counts stay quiet until selected.
 */
export default function CountTabs({ tabs, value, onChange, className = '' }) {
  return (
    <div
      role="tablist"
      className={`flex max-w-full items-center gap-1 overflow-x-auto ${className}`.trim()}
    >
      {tabs.map(({ key, label, count }) => {
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange?.(key)}
            className={`relative inline-flex shrink-0 items-baseline gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm transition-colors ${
              selected
                ? 'border-[var(--color-brand-primary)] font-semibold text-[var(--color-text-primary)]'
                : 'border-transparent font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {label}
            {count != null ? (
              <span
                className={`tabular-nums text-xs ${
                  selected
                    ? 'font-semibold text-[var(--color-text-primary)]'
                    : 'font-medium text-[var(--color-text-muted)]'
                }`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
