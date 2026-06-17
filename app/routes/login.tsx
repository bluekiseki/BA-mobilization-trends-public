import { useState } from 'react';
import { redirect, Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Route } from './+types/login';
import { LoginForm } from '~/components/auth/LoginForm';
import { MagicLinkForm } from '~/components/auth/MagicLinkForm';
import { GithubButton } from '~/components/auth/GithubButton';
import { PasskeyLoginButton } from '~/components/auth/PasskeyLoginButton';
import { localeLink } from '~/utils/localeLink';
import { env } from 'cloudflare:workers';
import { getInstance } from '~/middleware/i18next';
import { createMetaDescriptor, createLinkHreflang } from '~/components/head';

export async function loader({ context, request, params }: Route.LoaderArgs) {
  try {
    const resp = await env.AUTH_WORKER.fetch(new Request(new URL('/__internal/session', request.url), { headers: request.headers }));
    if (resp.status === 200) return redirect(localeLink(params.locale, '/settings'));
  } catch {}
  const i18n = getInstance(context);
  return {
    pageTitle: `${i18n.t('auth:common.signIn')} - Yuzu Trends`,
    headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' },
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.pageTitle ?? 'Sign in - Yuzu Trends';
  return createMetaDescriptor(title, '');
}

export function links() {
  return createLinkHreflang('/login');
}

type LoginMethod = 'password' | 'magic-link';

export default function LoginPage() {
  const { t } = useTranslation('auth');
  const { locale } = useParams();
  const [method, setMethod] = useState<LoginMethod>('password');

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">{t('common.signIn')}</h1>
        </div>

        <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          <MethodTabs method={method} onChange={setMethod} />

          <div className="p-6 space-y-5">
            {method === 'password' ? <LoginForm /> : <MagicLinkForm />}

            <Divider />

            <GithubButton />
            <PasskeyLoginButton />

            <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center">
              {t('common.noAccount')}{' '}
              <Link to={localeLink(locale, '/signup')} className="text-blue-500 hover:underline font-medium">
                {t('common.signUp')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MethodTabs({ method, onChange }: { method: LoginMethod; onChange: (m: LoginMethod) => void }) {
  const { t } = useTranslation('auth');
  return (
    <div className="flex border-b border-neutral-200 dark:border-neutral-700">
      {(['password', 'magic-link'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            method === m
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 -mb-px'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
          }`}
        >
          {m === 'password' ? t('login.tabs.password') : t('login.tabs.magicLink')}
        </button>
      ))}
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
