import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, headerExtra, children, footer, wide = false }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
      <div
        onClick={onClose}
        className="fixed inset-0 bg-[var(--color-brand-primary)]/25 backdrop-blur-[2px] cursor-pointer transition-opacity duration-300"
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        className={`relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full flex flex-col z-[70] overflow-hidden border border-[var(--color-border-default)] max-h-[min(90dvh,calc(100dvh-2rem))] ${
          wide ? 'max-w-[560px]' : 'max-w-[480px]'
        }`}
      >
        <div className="px-5 py-4 border-b border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/60 flex items-center justify-between gap-4 shrink-0">
          <h3 className="font-semibold text-[var(--color-text-primary)] text-base tracking-tight truncate">
            {title}
          </h3>
          <div className="flex items-center gap-2.5 shrink-0">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-white hover:text-[var(--color-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,26,46,0.12)]"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 flex-1 min-h-0 overflow-y-auto overscroll-contain text-sm text-[var(--color-text-primary)] bg-white leading-relaxed">
          {children}
        </div>

        {footer && (
          <div className="px-6 py-4 border-t border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/40 flex items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
