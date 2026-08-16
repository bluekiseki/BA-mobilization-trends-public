import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { browserSupportsWebAuthnAutofill, startAuthentication, WebAuthnAbortService, type AuthenticationResponseJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { useAuthStore, type User } from '~/store/authStore';
import { localeLink } from '~/utils/localeLink';
import { LuFingerprint } from 'react-icons/lu';

interface Props {
  enableAutofill?: boolean;
}

interface VerifyResponse {
  message?: string;
  user?: User;
}

async function getAuthenticationOptions(errorMessage: string, signal?: AbortSignal): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const response = await fetch('/api/auth/passkey/generate-authenticate-options', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal,
  });

  if (!response.ok) throw new Error(errorMessage);
  return response.json();
}

async function verifyAuthentication(credential: AuthenticationResponseJSON, errorMessage: string): Promise<VerifyResponse> {
  const response = await fetch('/api/auth/passkey/verify-authentication', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: credential }),
  });
  const data: VerifyResponse = await response.json();

  if (!response.ok) throw new Error(data.message || errorMessage);
  return data;
}

export function PasskeyLoginButton({ enableAutofill = true }: Props) {
  const { t } = useTranslation('auth');
  const { locale } = useParams();
  const { setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enableAutofill) return;

    const controller = new AbortController();
    let active = true;

    const startAutofill = async () => {
      try {
        if (!(await browserSupportsWebAuthnAutofill()) || !active) return;

        const options = await getAuthenticationOptions(t('passkey.errors.failedToGetOptions'), controller.signal);
        if (!active) return;

        const credential = await startAuthentication({
          optionsJSON: options,
          useBrowserAutofill: true,
        });
        if (!active) return;

        const data = await verifyAuthentication(credential, t('passkey.errors.failedToAuthenticate'));
        if (!active) return;

        if (data.user) setUser(data.user);
        window.location.href = localeLink(locale, '/settings');
      } catch (err) {
        if (!active) return;

        const authenticationError = err as Error & { code?: string };
        const wasCancelled = authenticationError.name === 'AbortError' || authenticationError.name === 'NotAllowedError' || authenticationError.code === 'ERROR_CEREMONY_ABORTED';
        if (wasCancelled) return;

        console.error('[Passkey] autofill authentication error', err);
        setError(err instanceof Error ? err.message : t('passkey.errors.failedToAuthenticate'));
      }
    };

    void startAutofill();

    return () => {
      active = false;
      controller.abort();
      WebAuthnAbortService.cancelCeremony();
    };
  }, [enableAutofill, locale, setUser, t]);

  const handleClick = async () => {
    WebAuthnAbortService.cancelCeremony();
    setIsLoading(true);
    setError('');

    try {
      // 1. Get challenge options from server
      const options = await getAuthenticationOptions(t('passkey.errors.failedToGetOptions'));

      // 2. Prompt user for passkey via browser WebAuthn API
      const credential = await startAuthentication({ optionsJSON: options });

      // 3. Verify credential with server
      const data = await verifyAuthentication(credential, t('passkey.errors.failedToAuthenticate'));
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
