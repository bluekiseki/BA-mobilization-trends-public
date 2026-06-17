import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { useAuthStore, type User } from '~/store/authStore';
import { localeLink } from '~/utils/localeLink';
import { LuFingerprint } from 'react-icons/lu';

export function PasskeyLoginButton() {
  const { t } = useTranslation('auth');
  const { locale } = useParams();
  const { setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClick = async () => {
    setIsLoading(true);
    setError('');

    try {
      // 1. Get challenge options from server
      const optRes = await fetch('/api/auth/passkey/generate-authenticate-options', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!optRes.ok) throw new Error(t('passkey.errors.failedToGetOptions'));
      const options: PublicKeyCredentialRequestOptionsJSON = await optRes.json();

      // 2. Prompt user for passkey via browser WebAuthn API
      const credential = await startAuthentication({ optionsJSON: options });

      // 3. Verify credential with server
      const verifyRes = await fetch('/api/auth/passkey/verify-authentication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: credential }),
      });

      interface VerifyResponse {
        message?: string;
        user?: User;
      }

      if (!verifyRes.ok) {
        const data: VerifyResponse = await verifyRes.json();
        throw new Error(data?.message || t('passkey.errors.failedToAuthenticate'));
      }

      const data: VerifyResponse = await verifyRes.json();
      if (data?.user) setUser(data.user);
      window.location.href = localeLink(locale, '/settings');
    } catch (err) {
      const error = err as Error & { name?: string };
      if (error?.name === 'NotAllowedError') {
        setError(t('passkey.errors.cancelled'));
      } else {
        setError(err instanceof Error ? err.message : t('passkey.errors.failedToAuthenticate'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 transition font-medium"
      >
        <LuFingerprint size={18} />
        {isLoading ? t('passkey.login.loading') : t('passkey.login.button')}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400 text-center">{error}</p>}
      <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">{t('passkey.login.registerNote')}</p>
    </div>
  );
}
