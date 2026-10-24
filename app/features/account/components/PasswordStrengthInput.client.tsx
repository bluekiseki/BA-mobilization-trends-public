import { useEffect, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { filterPrintableAscii } from '~/features/account/logic/authHash';
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_SCORE } from '~/utils/passwordValidate';

interface Props {
  value: string;
  onChange: (value: string) => void;
  userInputs?: string[];
  label?: string;
  autoComplete?: string;
  minLength?: number;
  className?: string;
  /** Shown after a submit attempt; takes priority over the live status line. */
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}

type ZxcvbnCheck = (password: string, userInputs?: (string | number)[]) => { score: number };

let zxcvbnReady: Promise<ZxcvbnCheck> | null = null;

function loadZxcvbn() {
  if (!zxcvbnReady) {
    zxcvbnReady = Promise.all([import('@zxcvbn-ts/core'), import('@zxcvbn-ts/language-common'), import('@zxcvbn-ts/language-en')]).then(([{ ZxcvbnFactory }, common, en]) => {
      const factory = new ZxcvbnFactory({
        translations: en.translations,
        graphs: common.adjacencyGraphs,
        dictionary: { ...common.dictionary, ...en.dictionary },
      });
      return (password: string, userInputs?: (string | number)[]) => factory.check(password, userInputs);
    });
  }
  return zxcvbnReady;
}

export async function checkPasswordScore(password: string, userInputs: string[] = []): Promise<number> {
  const zxcvbn = await loadZxcvbn();
  return zxcvbn(password, userInputs).score;
}

export function PasswordStrengthInput({
  value,
  onChange,
  userInputs = [],
  label = 'Password',
  autoComplete = 'new-password',
  minLength = PASSWORD_MIN_LENGTH,
  className = '',
  error = '',
  inputRef,
}: Props) {
  const { t } = useTranslation('auth');
  const [score, setScore] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);

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

  // One line under the field: submit error, else live status once typing started, else the requirement while focused
  let message = '';
  let tone = 'text-neutral-500 dark:text-neutral-400';
  if (error) {
    message = error;
    tone = 'text-red-600 dark:text-red-400';
  } else if (value && value.length < minLength) {
    message = t('forms.passwordRequirement', { min: minLength });
  } else if (value && score !== null) {
    if (score >= PASSWORD_MIN_SCORE) {
      message = t('passwordStrength.hintOk');
      tone = 'text-green-600 dark:text-green-400';
    } else if (score < 2) {
      message = t('passwordStrength.hintWeak');
      tone = 'text-red-600 dark:text-red-400';
    } else {
      message = t('passwordStrength.hintFair');
      tone = 'text-amber-600 dark:text-amber-400';
    }
  } else if (focused) {
    message = t('forms.passwordRequirement', { min: minLength });
  }

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        {label} <span className="text-red-500">{t('forms.passwordRequired')}</span>
      </label>
      <input
        ref={inputRef}
        type="password"
        value={value}
        onChange={(e) => onChange(filterPrintableAscii(e.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={t('common.passwordPlaceholder')}
        className={`w-full px-3 py-2 border ${error ? 'border-red-400 dark:border-red-500' : 'border-neutral-300 dark:border-neutral-600'} rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
        aria-invalid={!!error}
      />
      <p className={`mt-0.5 min-h-4 text-xs leading-4 ${tone}`} aria-live="polite">
        {message}
      </p>
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
