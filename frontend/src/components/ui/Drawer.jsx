import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Drawer({
  isOpen,
  onClose,
  title,
  children,
  footer,
  fill = false,
  widthClass = 'max-w-[420px]',
}) {
  const titleId = useId();
  const closeRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
    };
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        aria-hidden={!isOpen}
        onClick={onClose}
        className={`fixed inset-0 z-[98] bg-[var(--color-text-primary)]/20 backdrop-blur-[1px] transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={!isOpen}
        inert={isOpen ? undefined : true}
        className={`fixed top-0 right-0 bottom-0 z-[101] flex w-full ${widthClass} flex-col border-l border-[var(--color-border-default)] bg-white shadow-[var(--shadow-drawer)] transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-default)] bg-white px-4">
          <h2
            id={titleId}
            className="truncate text-sm font-semibold tracking-tight text-[var(--color-text-primary)]"
          >
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-panel)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/25 focus-visible:ring-offset-1"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div
          className={`flex min-h-0 flex-1 flex-col bg-[var(--color-surface-bg)] ${
            fill ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain'
          }`}
        >
          <div className={`flex flex-1 flex-col px-4 py-4 ${fill ? 'min-h-0 overflow-hidden' : ''}`}>
            {children}
          </div>
        </div>

        {footer ? (
          <footer className="shrink-0 border-t border-[var(--color-border-default)] bg-white px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </>,
    document.body,
  );
}
