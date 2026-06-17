import { useState } from 'react';
import { redirect, Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Route } from './+types/signup';
import { MagicLinkForm } from '~/components/auth/MagicLinkForm';
import { SignupForm } from '~/components/auth/SignupForm';
import { GithubButton } from '~/components/auth/GithubButton';
import { localeLink } from '~/utils/localeLink';
import { env } from 'cloudflare:workers';
import { ClientOnly } from '~/components/common/ClientOnly';
import { getInstance } from '~/middleware/i18next';
import { createMetaDescriptor, createLinkHreflang } from '~/components/head';

export async function loader({ context, request, params }: Route.LoaderArgs) {
  try {
    const resp = await env.AUTH_WORKER.fetch(new Request(new URL('/__internal/session', request.url), { headers: request.headers }));
    if (resp.status === 200) return redirect(localeLink(params.locale, '/settings'));
  } catch {}
  const i18n = getInstance(context);
  return {
    pageTitle: `${i18n.t('auth:common.createAccount')} - Yuzu Trends`,
    headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' },
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.pageTitle ?? 'Create account - Yuzu Trends';
  return createMetaDescriptor(title, '');
}

export function links() {
  return createLinkHreflang('/signup');
}

type Tab = 'password' | 'magic';

export default function SignupPage() {
  const { t } = useTranslation('auth');
  const { locale } = useParams();
  const [tab, setTab] = useState<Tab>('password');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);

  const consentGiven = agreedTerms && agreedPrivacy;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">{t('common.createAccount')}</h1>
        </div>

        <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          <div className="p-6 space-y-5">
            {/* Consent checkboxes */}
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  {t('signup.termsConsent')}{' '}
                  <Link to="/terms" target="_blank" className="text-blue-500 hover:underline">
                    {t('signup.termsOfService')}
                  </Link>
                  .
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedPrivacy}
                  onChange={(e) => setAgreedPrivacy(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  {t('signup.privacyConsent')}{' '}
                  <Link to="/privacy" target="_blank" className="text-blue-500 hover:underline">
                    {t('signup.privacyPolicy')}
                  </Link>
                  {t('signup.privacyNote')}
                </span>
              </label>
            </div>

            {/* Method tabs */}
            <div className="flex border-b border-neutral-200 dark:border-neutral-700">
              {(
                [
                  ['password', t('signup.tabs.password')],
                  ['magic', t('signup.tabs.emailLink')],
                ] as [Tab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 py-3 text-sm font-medium transition border-b-2 -mb-px ${
                    tab === key
                      ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                      : 'text-neutral-500 dark:text-neutral-400 border-transparent hover:text-neutral-800 dark:hover:text-neutral-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'password' && (
              <ClientOnly>
                <SignupForm consentGiven={consentGiven} />
              </ClientOnly>
            )}
            {tab === 'magic' && <MagicLinkForm consentGiven={consentGiven} />}

            <Divider />

            <GithubButton disabled={!consentGiven} />

            <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center">
              {t('common.haveAccount')}{' '}
              <Link to={localeLink(locale, '/login')} className="text-blue-500 hover:underline font-medium">
                {t('common.logIn')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Divider() {
  const { t } = useTranslation('auth');
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
      <span className="text-xs text-neutral-400">{t('common.divider')}</span>
      <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700" />
    </div>
  );
}
