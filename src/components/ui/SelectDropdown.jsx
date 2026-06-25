import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

const TRIGGER_STYLES = {
  xs: 'px-3 py-2 text-xs font-semibold',
  sm: 'h-9 px-3 text-sm font-medium',
  md: 'px-3.5 py-2 text-sm font-semibold',
};

export default function SelectDropdown({
  value,
  onChange,
  options,
  size = 'sm',
  className = '',
  align = 'left',
  menuClassName = '',
  disabled = false,
  variant = 'default',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((opt) => opt.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const handleSelect = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 rounded-lg focus:outline-none transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          variant === 'brand'
            ? 'bg-[var(--color-surface-highlight-strong)] border-2 border-[var(--color-brand-primary)]/25 text-[var(--color-brand-primary)] font-semibold shadow-sm hover:border-[var(--color-brand-primary)]/50 focus:border-[var(--color-brand-primary)]'
            : variant === 'soft'
              ? 'bg-white/60 backdrop-blur-sm border border-[var(--color-brand-primary)]/15 text-[var(--color-brand-primary)] font-semibold hover:bg-white/80 focus:border-[var(--color-brand-primary)]/30'
              : variant === 'inverse'
              ? 'bg-white/10 border border-white/25 text-white font-semibold hover:bg-white/15 focus:border-white/40'
              : 'bg-white border border-[var(--color-border-default)] text-[var(--color-text-primary)] focus:border-[var(--color-border-focus)]'
        } ${TRIGGER_STYLES[size]}`}
      >
        <span className="truncate text-left">{selected?.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${
          variant === 'inverse' ? 'text-white/70' : 'text-[var(--color-text-muted)]'
        }`} />
      </button>

      {open && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-[calc(100%+6px)] z-30 w-full min-w-[12rem] max-h-72 overflow-y-auto py-1 bg-white rounded-xl border border-[var(--color-border-default)] shadow-[var(--shadow-modal)] ${menuClassName}`}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                value === opt.value
                  ? 'bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)]'
                  : 'text-[var(--color-text-primary)] hover:bg-[var(--color-surface-highlight)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
