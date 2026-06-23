import { X, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { useToast } from './useToast';

const animationStyle = `
  @keyframes toastSlideIn {
    from {
      transform: translateX(120%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  .animate-toast-slide-in {
    animation: toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
`;

export default function Toast() {
  const { toasts, dismissToast } = useToast();

  if (!toasts || toasts.length === 0) return null;

  return (
    <>
      <style>{animationStyle}</style>
      <div className="fixed bottom-6 right-6 z-[70] flex flex-col gap-3 pointer-events-none select-none">
        {toasts.map((toast) => {
          let borderClass = 'border-l-[var(--color-signal-green)]';
          let Icon = CheckCircle2;
          let iconColor = 'text-[var(--color-signal-green)]';

          if (toast.type === 'error') {
            borderClass = 'border-l-[var(--color-signal-red)]';
            Icon = AlertCircle;
            iconColor = 'text-[var(--color-signal-red)]';
          } else if (toast.type === 'warning') {
            borderClass = 'border-l-[var(--color-signal-amber)]';
            Icon = AlertTriangle;
            iconColor = 'text-[var(--color-signal-amber)]';
          }

          return (
            <div
              key={toast.id}
              className={`w-[320px] bg-white border border-[var(--color-border-default)] border-l-4 ${borderClass} rounded shadow-[var(--shadow-modal)] p-4 flex items-start gap-3 pointer-events-auto transform transition-all duration-300 animate-toast-slide-in`}
            >
              {/* Status Icon */}
              <Icon className={`w-5 h-5 shrink-0 ${iconColor}`} />

              {/* Message */}
              <div className="flex-1 text-sm text-[var(--color-text-primary)] font-medium leading-tight pt-0.5">
                {toast.message}
              </div>

              {/* Close Button */}
              <button
                onClick={() => dismissToast(toast.id)}
                className="p-0.5 rounded-md text-[var(--color-text-secondary)] hover:bg-gray-100 hover:text-[var(--color-text-primary)] transition-colors focus:outline-none shrink-0"
                aria-label="Dismiss toast"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
