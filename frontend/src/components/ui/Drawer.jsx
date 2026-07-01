import { X } from 'lucide-react';

export default function Drawer({ isOpen, onClose, title, children, fill = false }) {
  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 cursor-pointer animate-fade-in"
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 h-dvh w-full max-w-[480px] bg-white shadow-[var(--shadow-drawer)] z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-14 border-b border-[var(--color-border-default)] px-6 flex items-center justify-between shrink-0 select-none bg-white">
          <h2
            className="font-semibold text-[var(--color-text-primary)]"
            style={{ fontSize: 'var(--font-size-md)' }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--color-text-secondary)] hover:bg-gray-100 hover:text-[var(--color-text-primary)] transition-colors focus:outline-none"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`flex-1 min-h-0 flex flex-col p-5 bg-white ${
          fill ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain'
        }`}>
          {children}
        </div>
      </div>
    </>
  );
}
