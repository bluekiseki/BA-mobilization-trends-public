import { lazy, Suspense, useState } from 'react';
import { redirect, Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Route } from './+types/login';
import { LoginForm } from '~/features/account/components/LoginForm';
import { MagicLinkForm } from '~/features/account/components/MagicLinkForm';
import { GithubButton } from '~/features/account/components/GithubButton';
import { MethodTabs } from '~/features/account/components/MethodTabs';
import { PasskeyButtonShell } from '~/features/account/components/PasskeyButtonShell';
import { localeLink } from '~/utils/localeLink';
import { magicLinkLogin } from '~/data/livedataServer.json';
import { env } from 'cloudflare:workers';
import { getInstance } from '~/middleware/i18next';
import { createMetaDescriptor, createLinkHreflang } from '~/components/shell/head';
import { createInternalSessionRequest } from '~/utils/internalSessionRequest';
import { ClientOnly } from '~/components/common/ClientOnly';

// WebAuthn only works client-side, so this is excluded from the SSR bundle entirely.
const PasskeyLoginButton = lazy(() => import('~/features/account/components/PasskeyLoginButton.client').then((m) => ({ default: m.PasskeyLoginButton })));

export async function loader({ context, request, params }: Route.LoaderArgs) {
  try {
    const resp = await env.AUTH_WORKER.fetch(createInternalSessionRequest(request, params.locale));
    if (resp.status === 200) return redirect(localeLink(params.locale, '/settings'));
  } catch {}
  const i18n = getInstance(context);
  return {
    pageTitle: `${i18n.t('auth:common.signIn')} - Yuzu Trends`,
  };
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.pageTitle ?? 'Log in - Yuzu Trends';
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
  const loginTabs = [
    { key: 'password', label: t('login.tabs.password') },
    { key: 'magic-link', label: t('login.tabs.magicLink') },
  ] as const;

  return (
    <div className="min-h-screen flex justify-center px-4 pt-8 sm:pt-16 pb-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">{t('common.signIn')}</h1>
        </div>

        <div className="sm:bg-white sm:dark:bg-neutral-800 sm:rounded-lg sm:border sm:border-neutral-200 sm:dark:border-neutral-700 overflow-hidden">
          {magicLinkLogin && <MethodTabs tabs={loginTabs} value={method} onChange={setMethod} />}

          <div className="sm:p-6 space-y-5">
            {magicLinkLogin && method === 'magic-link' ? <MagicLinkForm /> : <LoginForm />}

            <Divider />

            <div className="space-y-3">
              <GithubButton label={t('buttons.logInWithGithub')} />
              {/* ClientOnly keeps the lazy boundary from being evaluated during SSR,
                  where the .client module's export resolves to undefined. */}
              <ClientOnly fallback={<PasskeyButtonShell />}>
                <Suspense fallback={<PasskeyButtonShell />}>
                  <PasskeyLoginButton enableAutofill={!magicLinkLogin || method === 'password'} />
                </Suspense>
              </ClientOnly>
            </div>

            <p className="border-t border-neutral-200 dark:border-neutral-700 pt-4 text-sm text-neutral-500 dark:text-neutral-400 text-center">
              {t('common.noAccount')}{' '}
              <Link to={localeLink(locale, '/signup')} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                {t('common.signUp')}
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
