// app/root.tsx
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useLocation, data, redirect } from 'react-router';

import type { Route } from './+types/root';
import './app.css';
import { NoScript, Title } from './components/shell/head';
import { Navigation } from './components/shell/Navigation';
import { NavigationProgress } from './components/common/NavigationProgress';
import { ThemeProvider } from './components/shell/ThemeToggleButton';
import { CollectedLinks } from './components/shell/CollectedLinks';
import { REMAINING_TIME_PREHYDRATE_SCRIPT } from './components/common/RemainingTime';
// import { SpeedInsights } from "@vercel/speed-insights/react" // for vercel
// import { Analytics } from "@vercel/analytics/react" // for vercel
import { lazy, Suspense, useEffect, useLayoutEffect } from 'react';
import { DEFAULT_LOCALE, type Locale } from './utils/i18n/config';
import { getLocale, i18nextMiddleware } from '~/middleware/i18next';
import { useTranslation } from 'react-i18next';
import { domain, cdn as cdn_domain } from './data/livedataServer.json';
const DynamicDevtoolsdetector = lazy(() => import('./components/common/devtools-detector.client'));
// posthog-js is a browser-only analytics SDK; keeping it behind a .client.tsx boundary
// excludes it from the SSR Worker bundle entirely (see PostHogInit.client.tsx).
const DynamicPostHogInit = lazy(() => import('./components/shell/analytics/PostHogInit.client').then((m) => ({ default: m.PostHogInit })));
import { env } from 'cloudflare:workers'; // for cloudflare
// import { env } from 'node:process';
import { FaExternalLinkAlt } from 'react-icons/fa';
import { ClientOnly } from './components/common/ClientOnly';
import { useAuthStore, SESSION_HINT_KEY } from './store/authStore';
import { applySession, type SessionPayload } from './store/applySession';
import { useSyncWatcher } from './store/planner/useSyncWatcher';
import { SyncConflictModal } from './features/account/components/SyncConflictModal';
import { useCrossTabSync } from './hooks/useCrossTabSync';

// useLayoutEffect warns when it runs during SSR (it never actually runs server-side); fall back to
// useEffect there so this hook can be used in SSR routes without console noise.
const useIsomorphicLayoutEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect;

export { shouldRevalidateOnPathOrLang as shouldRevalidate } from './utils/revalidate';

export function loader({ context, request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);

  // /zh-Tw/** → /zh-Hant/**
  if (url.pathname === '/zh-TW' || url.pathname.startsWith('/zh-TW/')) {
    const newPath = url.pathname.replace(/^\/zh-TW/, '/zh-Hant');
    throw redirect(`${newPath}${url.search}`, 301);
  }

  const publicEnv = {
    VITE_PUBLIC_POSTHOG_KEY: env.VITE_PUBLIC_POSTHOG_KEY ?? '',
    VITE_PUBLIC_POSTHOG_DIRECT_HOST: env.VITE_PUBLIC_POSTHOG_DIRECT_HOST ?? '',
    VITE_PUBLIC_POSTHOG_UI_HOST: env.VITE_PUBLIC_POSTHOG_UI_HOST ?? '',
    VITE_PUBLIC_POSTHOG_HOST: env.VITE_PUBLIC_POSTHOG_HOST ?? '',
    VITE_WEB3FORMS_ACCESS_KEY: env.VITE_WEB3FORMS_ACCESS_KEY ?? '',
    VITE_TURNSTILE_SITE_KEY: env.VITE_TURNSTILE_SITE_KEY ?? '',
  };

  const locale = getLocale(context) as Locale;

  // Session is injected via <script id="__ba_session__"> in injectSessionData from workers/app.ts
  // Loader does not read the session to keep the cache key user-independent
  return data({ context, locale, params, env: publicEnv });
}

export const middleware = [i18nextMiddleware];

export const links: Route.LinksFunction = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useLoaderData<typeof loader>();
  const locale = data?.locale || DEFAULT_LOCALE;
  const { pathname } = useLocation();
  const isFullWidth = /\/charts\/[^/]+\/network(\/|$)/.test(pathname);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <style>
          {`.dark{
          background-color: #171717;
        }`}
        </style>
        <script
          dangerouslySetInnerHTML={{
            __html: `
            try {
              const theme = localStorage.getItem('theme');
              const isDark = theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
              if (isDark) {
                document.documentElement.classList.add('dark');
              }
            } catch (e) {}


             var global = global || window

          `.replace(/\s{2,}/gi, ''),
          }}
        />

        {/* matomo test */}

        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Yuzu Trends" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon_180.webp" />
        <link rel="apple-touch-icon" sizes="120x120" href="/favicon_120.webp" />

        {/* for fonts */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        {/* Pretendard: Inter(en) + Noto Sans(ko) + M PLUS 1p(ja) by orioncactus. Linked here rather than
            @import-ed from app.css so it downloads in parallel with the app stylesheet. */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp-dynamic-subset.min.css" />
        <link rel="preconnect" href={`https://${cdn_domain}`} />
        <link rel="preconnect" href={(data?.env || import.meta.env).VITE_PUBLIC_POSTHOG_DIRECT_HOST || ''} />
        <link rel="preload" href={`https://${cdn_domain}/assets/fonts/GyeonggiTitle_Medium.woff2`} as="font" type="font/woff2" crossOrigin="anonymous"></link>
        <link rel="preload" href={`https://${cdn_domain}/assets/fonts/GyeonggiTitle_Bold.woff2`} as="font" type="font/woff2" crossOrigin="anonymous"></link>
        <script id="website-ld" type="application/ld+json">
          {`{
          "@context": "https://schema.org",
          "@type": "WebSite",
          "url": "https://${domain}/",
          "name": "Yuzu Trends"
        }`.replace(/\s{2,}/gi, '')}
        </script>
        <link rel="alternate" type="text/plain" href="/llms.txt" title="Plain-text feeds for developers" />

        <Meta />
        <Links />
        <Title />
        <CollectedLinks />
      </head>
      <body>
        {/* <I18nextProvider i18n={i18n} defaultNS={'translation'}> */}
        <ScrollRestoration />
        <Scripts />
        <ThemeProvider>
          <NavigationProgress />
          <div className="bg-neutral-50 text-neutral-800 dark:bg-neutral-900 dark:text-white transition-colors duration-300 font-ba">
            <Navigation />

            <main className={isFullWidth ? '' : 'max-w-7xl mx-auto'} style={{ minHeight: 'calc(100vh - 170px)' }}>
              {children}
            </main>

            <footer className="mt-auto py-4 px-2 text-center text-neutral-500 dark:text-neutral-400 text-sm border-t border-neutral-200 dark:border-neutral-700 transition-colors duration-300 space-y-0.5">
              <p>
                This is just a non-commercial fan site of mobile game{' '}
                <b className="italic hover:underline">
                  <i>Blue Archive</i>
                </b>
                ,
              </p>
              <p>
                And all copyright of{' '}
                <a href="https://bluearchive.jp/" target="_blank" rel="noopener noreferrer">
                  <b className="italic hover:underline">Blue Archive</b>
                </a>{' '}
                belongs to{' '}
                <a href="https://www.nexon.com" target="_blank" rel="noopener noreferrer">
                  <span className="italic hover:underline">NEXON Korea Corp.</span>
                </a>{' '}
                &{' '}
                <a href="https://www.nexongames.co.kr/" target="_blank" rel="noopener noreferrer">
                  <span className="italic hover:underline">NEXON GAMES Co., Ltd.</span>
                </a>{' '}
                &{' '}
                <a href="https://www.yo-star.com" target="_blank" rel="noopener noreferrer">
                  <span className="italic hover:underline">YOSTAR, Inc.</span>
                </a>{' '}
              </p>
              <p>
                <a className="" href="/source">
                  <span className="inline-flex items-center gap-1.5 hover:underline">
                    Data Sources & Bug Reports
                    <FaExternalLinkAlt className="text-xs" />
                  </span>
                </a>
                {' · '}
                <a className="hover:underline" href="/developers">
                  Developers
                </a>
              </p>
            </footer>
          </div>

          <SyncConflictModal />
        </ThemeProvider>

        {/* </I18nextProvider> */}
        <NoScript />
        {process.env.NODE_ENV === 'production' && (
          <>
            {/* <SpeedInsights /> */}
            {/* <Analytics /> */}
            <ClientOnly>
              <Suspense fallback={null}>
                <DynamicDevtoolsdetector />
                <DynamicPostHogInit envData={data?.env} />
              </Suspense>
            </ClientOnly>
          </>
        )}
        {/* Fill remaining-time labels with the client clock before hydration */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: REMAINING_TIME_PREHYDRATE_SCRIPT }} />
      </body>
      {/* </HelmetProvider> */}
    </html>
  );
}

export default function App({ loaderData: { locale } }: Route.ComponentProps) {
  const { i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale, i18n]);

  // Session initialization: reads data injected into <script id="__ba_session__"> by workers/app.ts
  // Execute only when activeProfileId does not exist yet (prevents reset on page navigation)
  // useLayoutEffect (not useEffect) so the store is populated before the browser paints,
  // avoiding a visible flash of empty profile data on first load.
  useIsomorphicLayoutEffect(() => {
    if (useAuthStore.getState().activeProfileId) return; // Already initialized

    const el = document.getElementById('__ba_session__');
    if (el?.textContent) {
      try {
        applySession(JSON.parse(el.textContent) as SessionPayload);
      } catch {
        // Session parsing failure is non-fatal (treated as non-logged-in state)
      }
      return;
    }

    // No injected script: this HTML may be a page the browser cached (see app/utils/cacheControl.ts)
    // before the user logged in, so it never got session-inject.ts's <script> appended. Only probe
    // the server when this browser has applied a session before (SESSION_HINT_KEY) - real anonymous
    // visitors never pay this extra request, and a 204 here clears the hint so it isn't repeated.
    let hasLoggedInBefore = false;
    try {
      hasLoggedInBefore = localStorage.getItem(SESSION_HINT_KEY) !== null;
    } catch {
      // Storage may be unavailable (private browsing); treat as no hint.
    }
    if (!hasLoggedInBefore) return;

    void fetch('/api/auth/session-recover')
      .then(async (resp) => {
        if (resp.status !== 200) {
          try {
            localStorage.removeItem(SESSION_HINT_KEY);
          } catch {
            // Storage may be unavailable; non-fatal.
          }
          return;
        }
        applySession(await resp.json());
      })
      .catch(() => {
        // Network failure: leave the hint in place and try again on the next full load.
      });
  }, []);

  useSyncWatcher();
  useCrossTabSync();

  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : error.status === 503 ? '503' : 'Error';
    details = error.status === 404 ? 'The requested page could not be found.' : error.status === 503 ? 'Service temporary unavailable' : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
