import { useState } from 'react';
import { filterUsernameInput, validateUsernameRaw } from '~/utils/authHash';

export function useUsernameField(initialValue = '') {
  const [username, setUsername] = useState(initialValue);
  const [usernameError, setUsernameError] = useState('');

  const handleUsernameChange = (raw: string) => {
    const filtered = filterUsernameInput(raw);
    setUsername(filtered);
    setUsernameError(validateUsernameRaw(filtered) ?? '');
  };

  return { username, usernameError, handleUsernameChange };
}

interface UsernameFieldProps {
  value: string;
  error: string;
  onChange: (raw: string) => void;
  compact?: boolean;
  label?: string;
  placeholder?: string;
}

export function UsernameField({ value, error, onChange, compact = false, label, placeholder }: UsernameFieldProps) {
  // Use provided label/placeholder, or set defaults (caller will provide via useTranslation)
  const displayLabel = label ?? 'Username';
  const displayPlaceholder = placeholder ?? '3–20 chars: letters, numbers, _ or -';
  const labelClass = compact ? 'block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1' : 'block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1';

  const inputClass = [
    'w-full px-3 py-2',
    compact ? 'text-sm' : '',
    'border rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500',
    error ? 'border-red-400 dark:border-red-500' : 'border-neutral-300 dark:border-neutral-600',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <label className={labelClass}>
        {displayLabel}
        {!compact && <span className="text-red-500"> *</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        maxLength={20}
        className={inputClass}
        placeholder={displayPlaceholder}
        autoComplete="username"
        autoCapitalize="none"
      />
      {error && <p className={`mt-0.5 text-xs ${compact ? 'text-red-500' : 'text-red-600 dark:text-red-400'}`}>{error}</p>}
    </div>
  );
}
