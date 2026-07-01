export default function PageHeader({ section, title, description, meta, actions, footer, className = '', compact = false, workspace = false }) {
  if (workspace) {
    return (
      <header className={`border-b border-[var(--color-border-default)] shrink-0 pb-2.5 mb-2 ${className}`}>
        <div className="flex items-center justify-between gap-3 min-w-0 min-h-9">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] leading-none mb-1">
                {section}
              </p>
              <h1 className="text-lg font-bold text-[var(--color-text-primary)] truncate leading-tight">{title}</h1>
            </div>
            {meta && <div className="hidden sm:block shrink-0">{meta}</div>}
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {actions}
            </div>
          )}
        </div>
        {description && <p className="sr-only">{description}</p>}
        {footer && <div className="mt-2.5">{footer}</div>}
      </header>
    );
  }

  return (
    <header className={`border-b border-[var(--color-border-default)] space-y-4 shrink-0 ${compact ? 'pb-4 mb-3' : 'pb-5 mb-8'} ${className}`}>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
          {section}
        </p>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] min-w-0">{title}</h1>
          {actions && (
            <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
              {actions}
            </div>
          )}
        </div>
        {description && (
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{description}</p>
        )}
        {meta && <div className="mt-2">{meta}</div>}
      </div>
      {footer}
    </header>
  );
}
