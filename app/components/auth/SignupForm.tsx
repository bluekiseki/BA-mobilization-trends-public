import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, type User } from '~/store/authStore';
import { PASSWORD_MIN_SCORE } from '~/utils/passwordValidate';
import { PasswordStrengthInput, usePasswordScore } from './PasswordStrengthInput.client';
import { UsernameField, useUsernameField } from './UsernameField';
import { ConfirmPasswordField } from './ConfirmPasswordField';
import { TurnstileWidget } from './TurnstileWidget';
import { localeLink } from '~/utils/localeLink';

interface Props {
  consentGiven: boolean;
}

function getServerErrorKey(message: string): 'common.passwordTooWeak' | 'common.usernameTaken' | 'validation.passwordMinLength' | null {
  if (message.includes('too weak')) return 'common.passwordTooWeak';
  if (message.toLowerCase().includes('already taken')) return 'common.usernameTaken';
  if (message.toLowerCase().includes('at least') && message.includes('characters')) return 'validation.passwordMinLength';
  if (message.toLowerCase().includes('at most') && message.includes('characters')) return 'validation.passwordMinLength';
  return null;
}

export function SignupForm({ consentGiven }: Props) {
  const { t, i18n } = useTranslation('auth');
  const { setUser, setLoading, setError } = useAuthStore();
  const { username, usernameError, handleUsernameChange } = useUsernameField();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);

  const passwordScore = usePasswordScore(password, [username]);

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!consentGiven) return;
    if (usernameError) return;
    if (password !== confirmPassword) {
      setErrorMsg(t('common.passwordsMismatch'));
      return;
    }
    if (passwordScore !== null && passwordScore < PASSWORD_MIN_SCORE) {
      setErrorMsg(t('common.passwordTooWeak'));
      return;
    }

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
      setTurnstileToken(null);
      setWidgetKey((k) => k + 1);
    } finally {
      setIsLoading(false);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <UsernameField value={username} error={usernameError} onChange={handleUsernameChange} label={t('common.username')} placeholder={t('forms.usernameHint')} />

      <PasswordStrengthInput value={password} onChange={setPassword} userInputs={[username]} label={t('common.password')} autoComplete="new-password" />

      <ConfirmPasswordField value={confirmPassword} onChange={setConfirmPassword} label={t('common.confirmPassword')} />

      <TurnstileWidget key={widgetKey} onToken={setTurnstileToken} />

      {errorMsg && <div className="p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm rounded">{errorMsg}</div>}

      <button
        type="submit"
        disabled={isLoading || !consentGiven || !!usernameError || !turnstileToken || (passwordScore !== null && passwordScore < PASSWORD_MIN_SCORE)}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white font-medium rounded-md transition"
      >
        {isLoading ? t('signup.creatingAccount') : t('common.signUp')}
      </button>
    </form>
  );
}
