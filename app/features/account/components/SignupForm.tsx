import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, type User } from '~/store/authStore';
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_SCORE } from '~/utils/passwordValidate';
import { focusField } from '~/features/account/logic/focusField';
import { PasswordStrengthInput, checkPasswordScore } from './PasswordStrengthInput.client';
import { UsernameField, useUsernameField } from './UsernameField';
import { ConfirmPasswordField } from './ConfirmPasswordField';
import { TurnstileWidget } from './TurnstileWidget';
import { localeLink } from '~/utils/localeLink';

interface Props {
  /** Consent checkboxes rendered right above the submit button. */
  consent: ReactNode;
  /** Returns false (and surfaces the error) when consent is missing; `focus: false` shows the error without moving focus. */
  requireConsent: (options?: { focus?: boolean }) => boolean;
}

function getServerErrorKey(message: string): 'common.passwordTooWeak' | 'common.usernameTaken' | 'validation.passwordMinLength' | null {
  if (message.includes('too weak')) return 'common.passwordTooWeak';
  if (message.toLowerCase().includes('already taken')) return 'common.usernameTaken';
  if (message.toLowerCase().includes('at least') && message.includes('characters')) return 'validation.passwordMinLength';
  if (message.toLowerCase().includes('at most') && message.includes('characters')) return 'validation.passwordMinLength';
  return null;
}

export function SignupForm({ consent, requireConsent }: Props) {
  const { t, i18n } = useTranslation('auth');
  const { setUser, setLoading, setError } = useAuthStore();
  const { username, usernameError, handleUsernameChange } = useUsernameField();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const [turnstileWaiting, setTurnstileWaiting] = useState(false);
  const [widgetKey, setWidgetKey] = useState(0);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  const confirmMismatch = password !== confirmPassword;
  const confirmError = confirmMismatch && (submitted || (confirmTouched && confirmPassword !== '')) ? t('common.passwordsMismatch') : '';
  // An empty username has no live error, so surface one once a submit was attempted
  const shownUsernameError = usernameError || (submitted && !username ? t('validation.usernameMinLength') : '');

  const resetTurnstile = () => {
    setTurnstileToken(null);
    setTurnstileFailed(false);
    setWidgetKey((k) => k + 1);
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitted(true);

    // Check every field in screen order, show all problems, focus the first one
    const invalid: HTMLElement[] = [];
    const flag = (el: HTMLElement | null) => {
      if (el) invalid.push(el);
    };

    if (usernameError || !username) flag(usernameRef.current);

    let nextPasswordError = '';
    if (password.length < PASSWORD_MIN_LENGTH) {
      nextPasswordError = t('validation.passwordMinLength');
    } else {
      const score = await checkPasswordScore(password, [username]);
      if (score < PASSWORD_MIN_SCORE) nextPasswordError = t('common.passwordTooWeak');
    }
    setPasswordError(nextPasswordError);
    if (nextPasswordError) flag(passwordRef.current);

    if (confirmMismatch) flag(confirmRef.current);

    if (!turnstileToken) {
      setTurnstileWaiting(true);
      flag(turnstileRef.current);
    }

    const consentOk = requireConsent({ focus: invalid.length === 0 });
    if (invalid.length > 0) {
      focusField(invalid[0]);
      return;
    }
    if (!consentOk) return;

    setIsLoading(true);
    setLoading(true);

    try {
      interface SignupResponse {
        message?: string;
        user?: User;
      }

      const syntheticEmail = `${username}@users.internal`;

      const response = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: syntheticEmail,
          name: 'Sensei', // In-game player title
          password,
          username,
          'cf-turnstile-response': turnstileToken,
        }),
      });

      if (!response.ok) {
        if (response.status === 503) throw new Error(t('common.authServerMaintenance'));
        const data: SignupResponse = await response.json();
        const rawMsg = data?.message || t('common.signupFailed');
        const key = getServerErrorKey(rawMsg);
        throw new Error(key ? t(key) : rawMsg);
      }

      const data: SignupResponse = await response.json();
      if (data?.user) {
        setUser(data.user);
        window.location.href = localeLink(i18n.language, '/signup-passkey');
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : t('common.signupFailed');
      const key = getServerErrorKey(raw);
      const message = key ? t(key) : raw;
      setErrorMsg(message);
      setError(message);
      resetTurnstile();
    } finally {
      setIsLoading(false);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-4">
      <UsernameField
        value={username}
        error={shownUsernameError}
        onChange={handleUsernameChange}
        label={t('common.username')}
        placeholder={t('forms.usernamePlaceholder')}
        hint={t('forms.usernameHint')}
        forceShowError={submitted}
        inputRef={usernameRef}
      />

      <PasswordStrengthInput
        value={password}
        onChange={(v) => {
          setPassword(v);
          setPasswordError('');
        }}
        userInputs={[username]}
        label={t('common.password')}
        autoComplete="new-password"
        error={passwordError}
        inputRef={passwordRef}
      />

      <ConfirmPasswordField
        value={confirmPassword}
        onChange={setConfirmPassword}
        label={t('common.confirmPassword')}
        error={confirmError}
        onBlur={() => setConfirmTouched(true)}
        inputRef={confirmRef}
      />

      <div ref={turnstileRef} tabIndex={-1} className="space-y-1 outline-none">
        <TurnstileWidget
          key={widgetKey}
          onToken={(token) => {
            setTurnstileToken(token);
            if (token) setTurnstileWaiting(false);
          }}
          onError={() => setTurnstileFailed(true)}
        />
        {turnstileFailed ? (
          <p className="text-xs text-red-600 dark:text-red-400">
            {t('signup.turnstileFailed')}{' '}
            <button type="button" onClick={resetTurnstile} className="underline">
              {t('signup.turnstileRetry')}
            </button>
          </p>
        ) : (
          turnstileWaiting && <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('signup.turnstilePending')}</p>
        )}
      </div>

      {consent}

      {errorMsg && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {errorMsg}
        </p>
      )}

      <button type="submit" disabled={isLoading} className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-md transition">
        {isLoading ? t('signup.creatingAccount') : t('common.signUp')}
      </button>
    </form>
  );
}
