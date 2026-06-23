import { format } from 'date-fns';

export default function TopBar({ title }) {
  const currentDate = format(new Date(), 'EEE dd MMM yyyy');

  return (
    <header className="h-14 bg-white border-b border-[var(--color-border-default)] flex items-center justify-between px-6 sticky top-0 z-10 select-none">
      {/* Page Title */}
      <h1 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
        {title || 'Power Music'}
      </h1>

      {/* User and Date Info */}
      <div className="flex items-center gap-4">
        {/* Date Display */}
        <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">
          {currentDate}
        </span>

        {/* Vertical Divider */}
        <div className="w-[1px] h-4 bg-[var(--color-border-default)]"></div>

        {/* User profile dropdown stub */}
        <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
          <span className="text-[13px] font-medium text-[var(--color-text-primary)]">
            Andrea
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">▾</span>
          <div className="w-7 h-7 rounded-full bg-[var(--color-brand-accent)] text-white flex items-center justify-center font-bold text-xs shadow-sm">
            A
          </div>
        </div>
      </div>
    </header>
  );
}
