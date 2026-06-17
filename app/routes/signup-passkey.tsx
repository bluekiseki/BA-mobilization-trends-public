import { redirect, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { DEFAULT_LOCALE } from '~/utils/i18n/config';
import type { Route } from './+types/signup-passkey';
import { PasskeyRegisterButton } from '~/components/auth/PasskeyRegisterButton';
import { localeLink } from '~/utils/localeLink';
import { LuFingerprint, LuCheck, LuArrowRight } from 'react-icons/lu';
import { env } from 'cloudflare:workers';

export async function loader({ request, params }: Route.LoaderArgs) {
  try {
    const sessionResp = await env.AUTH_WORKER.fetch(new Request(new URL('/__internal/session', request.url), { headers: request.headers }));
    if (sessionResp.status !== 200) return redirect(localeLink(params.locale, '/login'));
    return {
      headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' },
    };
  } catch (err) {
    console.error('Session check failed:', err);
    return redirect(localeLink(params.locale, '/login'));
  }
}

export function meta() {
  return [{ title: 'Set up Passkey - Yuzu Trends' }];
}

export default function SignupPasskeyPage() {
  const { t, i18n } = useTranslation('auth');
  const { locale } = useParams();

  const handleSuccess = () => {
    setTimeout(() => {
      const resolvedLocale = locale || (i18n.language !== DEFAULT_LOCALE ? i18n.language : undefined);
      window.location.href = localeLink(resolvedLocale, '/settings');
    }, 1500);
  };

  const benefits = [t('passkey.benefits.faster'), t('passkey.benefits.biometric'), t('passkey.benefits.phishing')];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="flex justify-center mb-2">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                <LuFingerprint className="text-blue-600 dark:text-blue-400" size={32} />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t('passkey.title')}</h1>
            <p className="text-neutral-600 dark:text-neutral-400">{t('passkey.subtitle')}</p>
          </div>

          {/* Benefits */}
          <div className="space-y-2 bg-neutral-50 dark:bg-neutral-700/30 rounded-lg p-4">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-2">
                <LuCheck className="text-green-600 dark:text-green-400 shrink-0" size={18} />
                <span className="text-sm text-neutral-700 dark:text-neutral-300">{benefit}</span>
              </div>
            ))}
          </div>

          {/* Passkey Register Component */}
          <PasskeyRegisterButton onSuccess={handleSuccess} showNameInput={true} />

          {/* Skip Button */}
          <Link
            to={localeLink(locale, '/settings')}
            className="w-full flex items-center justify-center gap-1 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition font-medium"
          >
            {t('passkey.skipButton')}
            <LuArrowRight size={16} />
          </Link>

          {/* Footer note */}
          <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">{t('passkey.skipNote')}</p>
        </div>
      </div>
    </div>
  );
}
