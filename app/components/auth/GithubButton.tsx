import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaGithub } from 'react-icons/fa6';
import { localeLink } from '~/utils/localeLink';

interface Props {
  disabled?: boolean;
}

export function GithubButton({ disabled: disabledProp = false }: Props) {
  const { t, i18n } = useTranslation('auth');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClick = async () => {
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
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading || disabledProp}
        className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-800 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-700 disabled:opacity-60 transition font-medium text-sm"
      >
        <FaGithub size={18} />
        {loading ? t('buttons.redirecting') : t('buttons.continueWithGithub')}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400 text-center">{error}</p>}
    </div>
  );
}
