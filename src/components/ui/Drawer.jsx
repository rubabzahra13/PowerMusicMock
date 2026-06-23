import { X } from 'lucide-react';

export default function Drawer({ isOpen, onClose, title, children }) {
  return (
    <>
      {/* Dark Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 cursor-pointer animate-fade-in"
        />
      )}

      {/* Drawer Container Panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-full max-w-[480px] bg-white shadow-[var(--shadow-drawer)] z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="h-14 border-b border-[var(--color-border-default)] px-6 flex items-center justify-between shrink-0 select-none">
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

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {children}
        </div>
      </div>
    </>
  );
}
