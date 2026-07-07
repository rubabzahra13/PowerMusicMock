import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

let bodyScrollLockCount = 0;
let lockedScrollY = 0;
let savedBodyStyles = null;

function lockBodyScroll() {
  if (bodyScrollLockCount === 0) {
    lockedScrollY = window.scrollY;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    savedBodyStyles = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
      paddingRight: document.body.style.paddingRight,
    };

    document.body.style.position = 'fixed';
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  bodyScrollLockCount += 1;
}

function unlockBodyScroll() {
  bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
  if (bodyScrollLockCount !== 0 || savedBodyStyles == null) return;

  document.body.style.position = savedBodyStyles.position;
  document.body.style.top = savedBodyStyles.top;
  document.body.style.left = savedBodyStyles.left;
  document.body.style.right = savedBodyStyles.right;
  document.body.style.width = savedBodyStyles.width;
  document.body.style.overflow = savedBodyStyles.overflow;
  document.body.style.paddingRight = savedBodyStyles.paddingRight;
  savedBodyStyles = null;
  window.scrollTo(0, lockedScrollY);
}

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
  extraWide = false,
  confirm = false,
  belowDrawer = false,
  stableHeight = false,
  flushBody = false,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;

    lockBodyScroll();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      unlockBodyScroll();
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
      <div
        className="flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
        style={shellStyle}
      >
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

          <div className="px-5 pb-4 pt-6 text-center sm:px-6">
            <h3
              id="modal-confirm-title"
              className="px-2 text-base font-semibold tracking-tight text-[var(--color-text-primary)] sm:px-6"
            >
              {title}
            </h3>
            <div className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)] [&_strong]:font-semibold [&_strong]:text-[var(--color-text-primary)]">
              {children}
            </div>
          </div>

          {footer && (
            <div className="flex shrink-0 flex-col-reverse gap-2.5 px-5 pb-5 pt-1 sm:flex-row sm:items-center sm:justify-center sm:px-6 sm:pb-6 [&>button]:w-full sm:[&>button]:w-auto">
              {footer}
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="flex items-stretch justify-center p-0 sm:items-center sm:p-4" style={shellStyle}>
      {backdrop}

      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-[1] flex w-full max-h-[100dvh] flex-col overflow-hidden border border-[var(--color-border-default)] bg-white shadow-[var(--shadow-modal)] rounded-none sm:rounded-2xl ${
          stableHeight ? 'h-[100dvh] sm:h-[min(90dvh,calc(100dvh-2rem))]' : 'max-h-[100dvh] sm:max-h-[min(90dvh,calc(100dvh-2rem))]'
        } ${
          extraWide ? 'sm:max-w-[720px]' : wide ? 'sm:max-w-[560px]' : 'sm:max-w-[480px]'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/60 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <h3 className="min-w-0 truncate text-sm font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-base">
            {title}
          </h3>
          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
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

        <div
          className={`flex min-h-0 flex-1 flex-col overscroll-contain bg-white text-sm leading-relaxed text-[var(--color-text-primary)] ${
            flushBody ? 'p-0' : 'p-4 sm:p-6'
          } ${stableHeight ? 'overflow-hidden' : 'overflow-y-auto'}`}
        >
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 flex-col-reverse items-stretch gap-2.5 border-t border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/40 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:py-4 sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
