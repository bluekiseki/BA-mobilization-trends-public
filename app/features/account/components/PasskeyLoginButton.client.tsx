import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { browserSupportsWebAuthnAutofill, startAuthentication, WebAuthnAbortService, type AuthenticationResponseJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { useAuthStore, type User } from '~/store/authStore';
import { localeLink } from '~/utils/localeLink';
import { LuFingerprint } from 'react-icons/lu';
import { AUTH_ALT_BUTTON_CLASS } from './authButtonStyles';

interface Props {
  enableAutofill?: boolean;
}

interface VerifyResponse {
  message?: string;
  user?: User;
}

// Errors whose message is already localized and safe to show; anything else (browser or library errors) is replaced by a generic message.
class PasskeyApiError extends Error {}

async function getAuthenticationOptions(errorMessage: string, maintenanceMessage: string, signal?: AbortSignal): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const response = await fetch('/api/auth/passkey/generate-authenticate-options', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal,
  });

  if (!response.ok) throw new PasskeyApiError(response.status === 503 ? maintenanceMessage : errorMessage);
  return response.json();
}

async function verifyAuthentication(credential: AuthenticationResponseJSON, errorMessage: string, maintenanceMessage: string): Promise<VerifyResponse> {
  const response = await fetch('/api/auth/passkey/verify-authentication', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: credential }),
  });
  const data: VerifyResponse = await response.json();

  if (!response.ok) {
    if (data.message) console.error('[Passkey] verification failed:', data.message);
    throw new PasskeyApiError(response.status === 503 ? maintenanceMessage : errorMessage);
  }
  return data;
}

export function PasskeyLoginButton({ enableAutofill = true }: Props) {
  const { t } = useTranslation('auth');
  const { locale } = useParams();
  const { setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // The "register a passkey in settings" hint only fits when no usable passkey was found, not for server or network errors
  const [showRegisterNote, setShowRegisterNote] = useState(false);

  useEffect(() => {
    if (!enableAutofill) return;

    const controller = new AbortController();
    let active = true;

    const startAutofill = async () => {
      try {
        if (!(await browserSupportsWebAuthnAutofill()) || !active) return;

        const options = await getAuthenticationOptions(t('passkey.errors.failedToGetOptions'), t('common.authServerMaintenance'), controller.signal);
        if (!active) return;

        const credential = await startAuthentication({
          optionsJSON: options,
          useBrowserAutofill: true,
        });
        if (!active) return;

        const data = await verifyAuthentication(credential, t('passkey.errors.failedToAuthenticate'), t('common.authServerMaintenance'));
        if (!active) return;

        if (data.user) setUser(data.user);
        window.location.href = localeLink(locale, '/settings');
      } catch (err) {
        if (!active) return;

        const authenticationError = err as Error & { code?: string };
        const wasCancelled = authenticationError.name === 'AbortError' || authenticationError.name === 'NotAllowedError' || authenticationError.code === 'ERROR_CEREMONY_ABORTED';
        if (wasCancelled) return;

        console.error('[Passkey] autofill authentication error', err);
        setError(err instanceof PasskeyApiError ? err.message : t('passkey.errors.failedToAuthenticate'));
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
    setShowRegisterNote(false);

    try {
      // 1. Get challenge options from server
      const options = await getAuthenticationOptions(t('passkey.errors.failedToGetOptions'), t('common.authServerMaintenance'));

      // 2. Prompt user for passkey via browser WebAuthn API
      const credential = await startAuthentication({ optionsJSON: options });

      // 3. Verify credential with server
      const data = await verifyAuthentication(credential, t('passkey.errors.failedToAuthenticate'), t('common.authServerMaintenance'));
      if (data?.user) setUser(data.user);
      window.location.href = localeLink(locale, '/settings');
    } catch (err) {
      const error = err as Error & { name?: string };
      if (error?.name === 'NotAllowedError') {
        setError(t('passkey.errors.cancelled'));
        setShowRegisterNote(true);
      } else {
        console.error('[Passkey] authentication error', err);
        setError(err instanceof PasskeyApiError ? err.message : t('passkey.errors.failedToAuthenticate'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => void handleClick()} disabled={isLoading} className={AUTH_ALT_BUTTON_CLASS}>
        <LuFingerprint size={18} />
        {isLoading ? t('passkey.login.loading') : t('passkey.login.button')}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400 text-center">{error}</p>}
      {error && showRegisterNote && <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">{t('passkey.login.registerNote')}</p>}
    </div>
  );
}
