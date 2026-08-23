import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useAuthStore, type User } from '~/store/authStore';
import { filterUsernameInput, filterPrintableAscii } from '~/utils/authHash';
import { localeLink } from '~/utils/localeLink';
import { TurnstileWidget } from './TurnstileWidget';

// type Mode = 'login' | 'signup';

interface Props {
  // initialMode?: Mode;
  onSwitchToSignup?: () => void;
}

function getLoginErrorKey(message: string): 'common.invalidCredentials' | null {
  if (message.toLowerCase().includes('invalid username or password')) return 'common.invalidCredentials';
  return null;
}

export function LoginForm({ onSwitchToSignup }: Props) {
  const { t } = useTranslation('auth');
  const { locale } = useParams();
  const { setUser, setLoading, setError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);
    setLoading(true);

    try {
      interface LoginResponse {
        message?: string;
        user?: User;
      }
      interface PasskeyListItem {
        id: string;
      }

      const response = await fetch('/api/auth/sign-in/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, 'cf-turnstile-response': turnstileToken }),
      });

      if (!response.ok) {
        if (response.status === 503) throw new Error(t('common.authServerMaintenance'));
        const data: LoginResponse = await response.json();
        const rawMsg = data?.message || t('common.loginFailed');
        const key = getLoginErrorKey(rawMsg);
        throw new Error(key ? t(key) : rawMsg);
      }

      const data: LoginResponse = await response.json();
      if (data?.user) setUser(data.user);
      const passkeyRes = await fetch('/api/auth/passkey/list-user-passkeys');
      const passkeys: PasskeyListItem[] = passkeyRes.ok ? await passkeyRes.json() : [];
      window.location.href = localeLink(locale, passkeys.length > 0 ? '/settings' : '/signup-passkey');
    } catch (err) {
      const raw = err instanceof Error ? err.message : t('common.loginFailed');
      const key = getLoginErrorKey(raw);
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
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          {t('common.username')} <span className="text-red-500">{t('forms.usernameRequired')}</span>
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(filterUsernameInput(e.target.value))}
          required
          maxLength={20}
          className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={t('forms.usernamePlaceholder')}
          autoComplete="username webauthn"
          autoCapitalize="none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
          {t('common.password')} <span className="text-red-500">{t('forms.passwordRequired')}</span>
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(filterPrintableAscii(e.target.value))}
          required
          className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={t('common.passwordPlaceholder')}
          autoComplete="current-password"
        />
      </div>

      <TurnstileWidget key={widgetKey} onToken={setTurnstileToken} />

      {errorMsg && <div className="p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm rounded">{errorMsg}</div>}

      <button type="submit" disabled={isLoading || !turnstileToken} className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white font-medium rounded-md transition">
        {isLoading ? t('common.loggingIn') : t('common.logIn')}
      </button>

      {onSwitchToSignup && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center pt-1">
          {t('common.noAccount')}{' '}
          <button type="button" onClick={onSwitchToSignup} className="text-blue-600 dark:text-blue-400 hover:underline">
            {t('common.signUp')}
          </button>
        </p>
      )}
    </form>
  );
}
