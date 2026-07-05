import { MailOpen, Loader2 } from 'lucide-react';
import { formatCooldown } from '../../utils/otpCooldown';
import ManagerAuthShell, { buttonClass } from './ManagerAuthShell';

export default function ManagerAuthEmailNotice({
  title,
  children,
  backLabel = 'Back to sign in',
  onBack,
  onResend,
  resendLabel = 'Resend email',
  resendLoading = false,
  resendCooldownMs = 0,
  resendError = '',
  resendNotice = '',
}) {
  return (
    <ManagerAuthShell>
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
          <MailOpen className="h-6 w-6 text-emerald-600" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">{children}</p>

        {onResend && (
          <div className="mt-5 space-y-2">
            {resendNotice && (
              <p className="text-sm text-emerald-700" role="status">
                {resendNotice}
              </p>
            )}
            {resendError && (
              <p className="text-sm text-red-600" role="alert">
                {resendError}
              </p>
            )}
            <button
              type="button"
              onClick={onResend}
              disabled={resendLoading || resendCooldownMs > 0}
              className={buttonClass}
            >
              {resendLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {resendLoading
                ? 'Sending…'
                : resendCooldownMs > 0
                  ? `Resend in ${formatCooldown(resendCooldownMs)}`
                  : resendLabel}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onBack}
          className="mt-6 text-sm font-medium text-[var(--color-brand-accent)] hover:underline"
        >
          {backLabel}
        </button>
      </div>
    </ManagerAuthShell>
  );
}
