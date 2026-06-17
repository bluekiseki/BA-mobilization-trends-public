import { useTranslation } from 'react-i18next';
import { filterPrintableAscii } from '~/utils/authHash';

interface Props {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  label?: string;
}

export function ConfirmPasswordField({ value, onChange, compact = false, label }: Props) {
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
        type="password"
        value={value}
        onChange={(e) => onChange(filterPrintableAscii(e.target.value))}
        required
        className={`w-full px-3 py-2${compact ? ' text-sm' : ''} border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
        placeholder={t('common.passwordPlaceholder')}
        autoComplete="new-password"
      />
    </div>
  );
}
