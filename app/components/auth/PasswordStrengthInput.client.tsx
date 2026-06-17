import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { filterPrintableAscii } from '~/utils/authHash';
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_SCORE } from '~/utils/passwordValidate';

const STRENGTH_COLORS = ['bg-red-500', 'bg-orange-500', 'bg-yellow-400', 'bg-lime-500', 'bg-green-500'];

interface Props {
  value: string;
  onChange: (value: string) => void;
  userInputs?: string[];
  label?: string;
  autoComplete?: string;
  minLength?: number;
  className?: string;
}

let zxcvbnReady: Promise<typeof import('@zxcvbn-ts/core').zxcvbn> | null = null;

function loadZxcvbn() {
  if (!zxcvbnReady) {
    zxcvbnReady = Promise.all([import('@zxcvbn-ts/core'), import('@zxcvbn-ts/language-common'), import('@zxcvbn-ts/language-en')]).then(([{ zxcvbn, zxcvbnOptions }, common, en]) => {
      zxcvbnOptions.setOptions({
        translations: en.translations,
        graphs: common.adjacencyGraphs,
        dictionary: { ...common.dictionary, ...en.dictionary },
      });
      return zxcvbn;
    });
  }
  return zxcvbnReady;
}

export function PasswordStrengthInput({ value, onChange, userInputs = [], label = 'Password', autoComplete = 'new-password', minLength = PASSWORD_MIN_LENGTH, className = '' }: Props) {
  const { t } = useTranslation('auth');
  const [score, setScore] = useState<number | null>(null);
  const strengthLabels = [t('passwordStrength.veryWeak'), t('passwordStrength.weak'), t('passwordStrength.fair'), t('passwordStrength.strong'), t('passwordStrength.veryStrong')];

  useEffect(() => {
    if (!value) {
      setScore(null);
      return;
    }
    let cancelled = false;
    void loadZxcvbn().then((zxcvbn) => {
      if (!cancelled) setScore(zxcvbn(value, userInputs).score);
    });
    return () => {
      cancelled = true;
    };
  }, [value, userInputs]);

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        {label} <span className="text-red-500">{t('forms.passwordRequired')}</span>
      </label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(filterPrintableAscii(e.target.value))}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder={t('forms.passwordMinHint', { min: minLength })}
      />
      {score !== null && (
        <div className="mt-1.5 space-y-1">
          <div className="flex gap-1 h-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`flex-1 rounded-full transition-colors ${i <= score ? STRENGTH_COLORS[score] : 'bg-neutral-200 dark:bg-neutral-700'}`} />
            ))}
          </div>
          <p
            className={`text-xs ${score < PASSWORD_MIN_SCORE - 1 ? 'text-red-500' : score === PASSWORD_MIN_SCORE - 1 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}
          >
            {strengthLabels[score]}
          </p>
        </div>
      )}
    </div>
  );
}

export function usePasswordScore(password: string, userInputs: string[] = []) {
  const [score, setScore] = useState<number | null>(null);
  useEffect(() => {
    if (!password) {
      setScore(null);
      return;
    }
    let cancelled = false;
    void loadZxcvbn().then((zxcvbn) => {
      if (!cancelled) setScore(zxcvbn(password, userInputs).score);
    });
    return () => {
      cancelled = true;
    };
  }, [password, userInputs]);
  return score;
}
