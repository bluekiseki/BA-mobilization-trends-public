import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { startRegistration, WebAuthnError, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { LuFingerprint, LuCheck, LuX } from 'react-icons/lu';

interface PasskeyRegisterButtonProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  showNameInput?: boolean;
}

export function PasskeyRegisterButton({ onSuccess, onError, showNameInput = true }: PasskeyRegisterButtonProps) {
  const { t } = useTranslation('auth');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [success, setSuccess] = useState(false);
  const [passkeyName, setPasskeyName] = useState('');

  const handleRegister = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // 1. Get registration options from server
      const optRes = await fetch('/api/auth/passkey/generate-register-options', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!optRes.ok) {
        throw new Error(t('passkey.errors.failedToGetRegistrationOptions'));
      }

      const options: PublicKeyCredentialCreationOptionsJSON = await optRes.json();

      // 2. Prompt user for passkey via browser WebAuthn API
      const credential = await startRegistration({ optionsJSON: options });

      // 3. Verify credential with server
      const verifyRes = await fetch('/api/auth/passkey/verify-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: credential,
          name: passkeyName.trim() || undefined,
        }),
      });

      if (!verifyRes.ok) {
        const data: { message?: string } = await verifyRes.json();
        throw new Error(data.message ?? t('passkey.errors.failedToRegister'));
      }

      setSuccess(true);
      setPasskeyName('');
      if (onSuccess) onSuccess();
    } catch (err) {
      const message = t('passkey.errors.failedToRegister');
      if (err instanceof WebAuthnError) {
        console.error('[Passkey] registration error', err.code, err);
        if (err.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
          setError({ message: t('passkey.errors.alreadyRegistered') });
          if (onError) onError(t('passkey.errors.alreadyRegistered'));
          return;
        }
        setError({ message, detail: `${err.message} (${err.code})` });
      } else {
        console.error('[Passkey] registration error', err);
        const detail = err instanceof Error ? err.message : undefined;
        setError({ message, detail });
      }
      if (onError) onError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-3">
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg flex items-center gap-3">
          <LuCheck className="text-green-600 dark:text-green-400" size={20} />
          <div>
            <p className="font-medium text-green-800 dark:text-green-200">{t('passkey.register.successTitle')}</p>
            <p className="text-sm text-green-700 dark:text-green-300">{t('passkey.register.successNote')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showNameInput && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t('passkey.register.nameLabel')}</label>
          <input
            type="text"
            value={passkeyName}
            onChange={(e) => setPasskeyName(e.target.value)}
            maxLength={50}
            disabled={isLoading}
            className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            placeholder={t('passkey.register.namePlaceholder')}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleRegister()}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
      >
        <LuFingerprint size={18} />
        {isLoading ? t('passkey.register.registering') : t('passkey.register.button')}
      </button>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md flex items-start gap-2">
          <LuX className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" size={16} />
          <div>
            <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
            {error.detail && <p className="text-xs text-red-500 dark:text-red-400 mt-1 font-mono break-all">{error.detail}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
