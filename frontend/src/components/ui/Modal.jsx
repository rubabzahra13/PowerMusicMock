import { X } from 'lucide-react';

const closeButtonClass =
  'p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-highlight)] hover:text-[var(--color-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,26,46,0.12)]';

export default function Modal({
  isOpen,
  onClose,
  title,
  headerExtra,
  children,
  footer,
  wide = false,
  confirm = false,
}) {
  if (!isOpen) return null;

  const backdrop = (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-[var(--color-brand-primary)]/25 backdrop-blur-[2px] cursor-pointer transition-opacity duration-300"
      aria-hidden="true"
    />
  );

  if (confirm) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
        {backdrop}

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-confirm-title"
          className="relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-[400px] flex flex-col z-[70] overflow-hidden border border-[var(--color-border-default)]"
        >
          <button
            type="button"
            onClick={onClose}
            className={`absolute top-3 right-3 z-10 ${closeButtonClass}`}
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="px-6 pt-6 pb-4 text-center">
            <h3
              id="modal-confirm-title"
              className="font-semibold text-[var(--color-text-primary)] text-base tracking-tight px-6"
            >
              {title}
            </h3>
            <div className="mt-3 text-sm text-[var(--color-text-secondary)] leading-relaxed [&_strong]:text-[var(--color-text-primary)] [&_strong]:font-semibold">
              {children}
            </div>
          </div>

          {footer && (
            <div className="px-6 pb-6 pt-1 flex items-center justify-center gap-2.5 shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
      {backdrop}

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
              className={closeButtonClass}
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
