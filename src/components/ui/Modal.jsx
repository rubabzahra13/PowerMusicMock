import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, footer }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60]">
      {/* Backdrop overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 cursor-pointer transition-opacity duration-300"
      />

      {/* Modal Dialog Box */}
      <div
        className="bg-white rounded-lg shadow-[var(--shadow-modal)] w-[90%] max-w-[440px] flex flex-col z-[70] overflow-hidden transform transition-all duration-300 scale-100 border border-[var(--color-border-default)]"
      >
        {/* Header */}
        <div className="h-14 border-b border-[var(--color-border-default)] px-6 flex items-center justify-between select-none shrink-0">
          <h3
            className="font-semibold text-[var(--color-text-primary)]"
            style={{ fontSize: 'var(--font-size-md)' }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--color-text-secondary)] hover:bg-gray-100 hover:text-[var(--color-text-primary)] transition-colors focus:outline-none"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 overflow-y-auto text-sm text-[var(--color-text-primary)] bg-white leading-relaxed">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-[var(--color-border-default)] bg-[#f9fafb] flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
