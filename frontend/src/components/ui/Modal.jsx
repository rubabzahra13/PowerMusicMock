import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const closeButtonClass =
  'p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-highlight)] hover:text-[var(--color-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(26,26,46,0.12)]';

const fullScreenShellStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 60,
};

const belowDrawerShellStyle = {
  position: 'fixed',
  top: 0,
  bottom: 0,
  left: 'var(--app-sidebar-width)',
  right: 'var(--drawer-width)',
  zIndex: 100,
};

export default function Modal({
  isOpen,
  onClose,
  title,
  headerExtra,
  children,
  footer,
  wide = false,
  confirm = false,
  belowDrawer = false,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const shellStyle = belowDrawer ? belowDrawerShellStyle : fullScreenShellStyle;

  const backdrop = (
    <div
      onClick={onClose}
      className="absolute inset-0 bg-[var(--color-brand-primary)]/25 backdrop-blur-[2px] cursor-pointer transition-opacity duration-300"
      aria-hidden="true"
    />
  );

  if (confirm) {
    return createPortal(
      <div className="flex items-center justify-center p-4" style={shellStyle}>
        {backdrop}

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-confirm-title"
          className="relative z-[1] flex w-full max-w-[400px] flex-col overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-white shadow-[var(--shadow-modal)]"
        >
          <button
            type="button"
            onClick={onClose}
            className={`absolute top-3 right-3 z-10 ${closeButtonClass}`}
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="px-6 pb-4 pt-6 text-center">
            <h3
              id="modal-confirm-title"
              className="px-6 text-base font-semibold tracking-tight text-[var(--color-text-primary)]"
            >
              {title}
            </h3>
            <div className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)] [&_strong]:font-semibold [&_strong]:text-[var(--color-text-primary)]">
              {children}
            </div>
          </div>

          {footer && (
            <div className="flex shrink-0 items-center justify-center gap-2.5 px-6 pb-6 pt-1">
              {footer}
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="flex items-center justify-center p-4" style={shellStyle}>
      {backdrop}

      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-[1] flex w-full max-h-[min(90dvh,calc(100dvh-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-white shadow-[var(--shadow-modal)] ${
          wide ? 'max-w-[560px]' : 'max-w-[480px]'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/60 px-5 py-4">
          <h3 className="truncate text-base font-semibold tracking-tight text-[var(--color-text-primary)]">
            {title}
          </h3>
          <div className="flex shrink-0 items-center gap-2.5">
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white p-6 text-sm leading-relaxed text-[var(--color-text-primary)]">
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/40 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
