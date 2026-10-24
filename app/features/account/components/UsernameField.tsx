import { useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { filterUsernameInput, validateUsernameRaw, type UsernameErrorCode } from '~/features/account/logic/authHash';

export const USERNAME_ERROR_KEYS = {
  tooShort: 'validation.usernameMinLength',
  tooLong: 'validation.usernameMaxLength',
  invalidChars: 'validation.usernameInvalidChars',
  unavailable: 'validation.usernameUnavailable',
} as const satisfies Record<UsernameErrorCode, string>;

export function useUsernameField(initialValue = '') {
  const { t } = useTranslation('auth');
  const [username, setUsername] = useState(initialValue);
  const [usernameError, setUsernameError] = useState('');

  const handleUsernameChange = (raw: string) => {
    const filtered = filterUsernameInput(raw);
    const code = validateUsernameRaw(filtered);
    setUsername(filtered);
    setUsernameError(code ? t(USERNAME_ERROR_KEYS[code]) : '');
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
  /** Shown under the field only while it has focus and there is no error. */
  hint?: string;
  /** Show the error even if the field was never blurred (e.g. after a submit attempt). */
  forceShowError?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

export function UsernameField({ value, error, onChange, compact = false, label, placeholder, hint, forceShowError = false, inputRef }: UsernameFieldProps) {
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  // Use provided label/placeholder, or set defaults (caller will provide via useTranslation)
  const displayLabel = label ?? 'Username';
  const displayPlaceholder = placeholder ?? '3–20 chars: letters, numbers, _ or -';
  const labelClass = compact ? 'block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1' : 'block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1';

  const visibleError = error && (touched || forceShowError || compact) ? error : '';

  const inputClass = [
    'w-full px-3 py-2',
    compact ? 'text-sm' : '',
    'border rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500',
    visibleError ? 'border-red-400 dark:border-red-500' : 'border-neutral-300 dark:border-neutral-600',
  ]
    .filter(Boolean)
    .join(' ');

  const message = visibleError || (focused ? hint : '');
  // A hint reserves its line so the layout does not shift when it appears
  const showLine = hint !== undefined || !!visibleError;

  return (
    <div>
      <label className={labelClass}>
        {displayLabel}
        {!compact && <span className="text-red-500"> *</span>}
      </label>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setTouched(true);
        }}
        required
        maxLength={20}
        className={inputClass}
        placeholder={displayPlaceholder}
        autoComplete="username"
        autoCapitalize="none"
        aria-invalid={!!visibleError}
      />
      {showLine && (
        <p className={`mt-0.5 min-h-4 text-xs leading-4 ${visibleError ? (compact ? 'text-red-500' : 'text-red-600 dark:text-red-400') : 'text-neutral-500 dark:text-neutral-400'}`}>{message}</p>
      )}
    </div>
  );
}
