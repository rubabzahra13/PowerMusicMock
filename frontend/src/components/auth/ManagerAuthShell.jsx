import { Toast } from '../ui';
import { AUTH_PAGE_CANVAS, useAuthPageCanvas } from './useAuthPageCanvas';

const inputClass =
  'w-full h-11 px-3.5 bg-white text-sm rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] transition-colors focus:outline-none focus-visible:border-[var(--color-brand-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/20 disabled:opacity-60 disabled:cursor-not-allowed';

const labelClass = 'mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]';

const buttonClass =
  'mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-primary)] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-surface-sidebar-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const errorClass =
  'mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-900';

export { inputClass, labelClass, buttonClass, errorClass };

function AuthCanvasBackground() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1020] via-[#121f3d] to-[#1a2d52]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(233,69,96,0.18),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(56,100,180,0.28),transparent_50%)]" />
      <div className="absolute -top-32 right-1/4 h-96 w-96 rounded-full bg-[var(--color-brand-accent)]/15 blur-[100px]" />
      <div className="absolute -bottom-40 left-1/4 h-[28rem] w-[28rem] rounded-full bg-[#3b5bdb]/20 blur-[120px]" />
    </div>
  );
}

export function ManagerAuthLoading() {
  useAuthPageCanvas();

  return (
    <div
      className="fixed inset-0 z-0 flex items-center justify-center overflow-hidden overscroll-y-none"
      style={{ backgroundColor: AUTH_PAGE_CANVAS }}
    >
      <div className="flex flex-col items-center gap-3 text-center px-6">
        <div
          className="w-10 h-10 border-[3px] border-white/90 border-t-transparent rounded-full animate-spin"
          role="status"
          aria-label="Loading"
        />
        <p className="text-sm font-medium text-white/80">Loading Power Music Ops…</p>
      </div>
    </div>
  );
}

export default function ManagerAuthShell({ children, wide = false, footnote = 'PureGym managers only.' }) {
  useAuthPageCanvas();

  return (
    <div
      className="fixed inset-0 z-0 overflow-y-auto overscroll-y-none"
      style={{ backgroundColor: AUTH_PAGE_CANVAS }}
    >
      <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-10 sm:px-6 antialiased font-sans overflow-hidden">
        <Toast />
        <AuthCanvasBackground />

        <main className={`relative z-10 w-full ${wide ? 'max-w-[460px]' : 'max-w-[420px]'}`}>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.35)]">
            <div className="border-b border-[var(--color-border-default)] bg-gradient-to-b from-white to-[var(--color-surface-panel)]/40 px-8 pb-7 pt-8 text-center">
              <div className="mx-auto mb-4 inline-flex items-center justify-center rounded-xl bg-white p-3 shadow-[0_2px_12px_rgba(26,26,46,0.08)] ring-1 ring-black/[0.06]">
                <img src="/image.png" alt="" className="h-10 w-auto object-contain" width={120} height={40} />
              </div>
              <h1 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
                Power Music Ops
              </h1>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Request adding or removing PureGym users
              </p>
            </div>

            <div className="px-8 py-7">{children}</div>
          </div>

          <p className="mt-6 text-center text-xs text-white/45">{footnote}</p>
        </main>
      </div>
    </div>
  );
}
