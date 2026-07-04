import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { inputClass } from './ManagerAuthShell';

export default function PasswordInput({
  id,
  name,
  value,
  onChange,
  disabled = false,
  autoComplete,
  required,
  minLength,
  placeholder,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        className={`${inputClass} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((show) => !show)}
        disabled={disabled}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] disabled:opacity-50"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
