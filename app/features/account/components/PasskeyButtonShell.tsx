import { useTranslation } from 'react-i18next';
import { LuFingerprint } from 'react-icons/lu';
import { AUTH_ALT_BUTTON_CLASS } from './authButtonStyles';

/** Inert stand-in rendered on the server and while the client-only passkey button loads, so the layout does not shift. */
export function PasskeyButtonShell() {
  const { t } = useTranslation('auth');
  return (
    <div className="space-y-2">
      <button type="button" disabled className={AUTH_ALT_BUTTON_CLASS}>
        <LuFingerprint size={18} />
        {t('passkey.login.button')}
      </button>
    </div>
  );
}
