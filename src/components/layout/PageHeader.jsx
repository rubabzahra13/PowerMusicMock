export default function PageHeader({ section, title, description, meta, actions, footer, className = '' }) {
  return (
    <header className={`border-b border-[var(--color-border-default)] pb-5 mb-8 space-y-4 ${className}`}>
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
