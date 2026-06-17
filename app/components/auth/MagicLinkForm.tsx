import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LuMail, LuCircleCheck } from 'react-icons/lu';
import { TurnstileWidget } from './TurnstileWidget';
import { localeLink } from '~/utils/localeLink';

interface Props {
  consentGiven?: boolean;
}

export function MagicLinkForm({ consentGiven = true }: Props) {
  const { i18n, t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, callbackURL: localeLink(i18n.language, '/magic-link-redirect'), 'cf-turnstile-response': turnstileToken, metadata: { locale: i18n.language } }),
      });

      if (!res.ok) {
        let message = t('common.sendLinkFailed');
        try {
          const data: { message?: string } = await res.json();
          if (data?.message) message = data.message;
        } catch {}
        throw new Error(message);
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.sendLinkFailed'));
      setTurnstileToken(null);
      setWidgetKey((k) => k + 1);
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center py-6">
        <LuCircleCheck className="mx-auto mb-3 text-green-500" size={40} />
        <p className="font-medium text-neutral-800 dark:text-white mb-1">{t('magicLink.checkEmail')}</p>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {t('magicLink.linkSent')} <b>{email}</b>.<br />
          {t('magicLink.linkExpiry')}
        </p>
        <button
          onClick={() => {
            setSent(false);
            setEmail('');
          }}
          className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {t('magicLink.useDifferentEmail')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t('common.email')}</label>
        <div className="relative">
          <LuMail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full pl-9 pr-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t('common.emailPlaceholder')}
            autoComplete="email"
          />
        </div>
      </div>

      <TurnstileWidget key={widgetKey} onToken={setTurnstileToken} />

      {error && <div className="p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm rounded">{error}</div>}

      <button
        type="submit"
        disabled={isLoading || !consentGiven || !turnstileToken}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white font-medium rounded-md transition"
      >
        {isLoading ? t('common.sending') : t('buttons.sendLink')}
      </button>
    </form>
  );
}
