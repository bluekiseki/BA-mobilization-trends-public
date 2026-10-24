import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaGithub } from 'react-icons/fa6';
import { localeLink } from '~/utils/localeLink';
import { AUTH_ALT_BUTTON_CLASS } from './authButtonStyles';

interface Props {
  /** Runs before the redirect; return false to cancel (e.g. consent missing). */
  beforeStart?: () => boolean;
  /** Overrides the default "Continue with GitHub" label (e.g. on the login page). */
  label?: string;
}

export function GithubButton({ beforeStart, label }: Props) {
  const { t, i18n } = useTranslation('auth');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClick = async () => {
    if (beforeStart && !beforeStart()) return;
    setLoading(true);
    setError('');
    const callbackURL = localeLink(i18n.language, '/magic-link-redirect');
    try {
      const res = await fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'github', callbackURL }),
      });
      if (res.status === 503) {
        setError(t('common.authServerMaintenance'));
        return;
      }
      const data: { url?: string } = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => void handleClick()} disabled={loading} className={AUTH_ALT_BUTTON_CLASS}>
        <FaGithub size={18} />
        {loading ? t('buttons.redirecting') : (label ?? t('buttons.continueWithGithub'))}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400 text-center">{error}</p>}
    </div>
  );
}
