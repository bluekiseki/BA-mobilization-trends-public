import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { filterPrintableAscii } from '~/features/account/logic/authHash';

interface Props {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  label?: string;
  /** When defined, a message line is reserved under the field (empty string = no error). */
  error?: string;
  onBlur?: () => void;
  inputRef?: Ref<HTMLInputElement>;
}

export function ConfirmPasswordField({ value, onChange, compact = false, label, error, onBlur, inputRef }: Props) {
  const { t } = useTranslation('auth');
  const resolvedLabel = label ?? t('common.confirmPassword');

  const labelClass = compact ? 'block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1' : 'block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1';

  return (
    <div>
      <label className={labelClass}>
        {resolvedLabel}
        {!compact && <span className="text-red-500">{t('forms.confirmPasswordRequired')}</span>}
      </label>
      <input
        ref={inputRef}
        type="password"
        value={value}
        onChange={(e) => onChange(filterPrintableAscii(e.target.value))}
        onBlur={onBlur}
        required
        className={`w-full px-3 py-2${compact ? ' text-sm' : ''} border ${error ? 'border-red-400 dark:border-red-500' : 'border-neutral-300 dark:border-neutral-600'} rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
        placeholder={t('common.passwordPlaceholder')}
        autoComplete="new-password"
        aria-invalid={!!error}
      />
      {error !== undefined && <p className="mt-0.5 min-h-4 text-xs leading-4 text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
