// app/root.tsx
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useLocation, data, redirect } from 'react-router';

import type { Route } from './+types/root';
import './app.css';
import { NoScript, Title } from './components/head';
import { Navigation } from './components/Navigation';
import { ThemeProvider } from './components/ThemeToggleButton';
import { CollectedLinks } from './components/CollectedLinks';
// import { SpeedInsights } from "@vercel/speed-insights/react" // for vercel
// import { Analytics } from "@vercel/analytics/react" // for vercel
import { lazy, Suspense, useEffect } from 'react';
import { DEFAULT_LOCALE, type Locale } from './utils/i18n/config';
import { getLocale, i18nextMiddleware } from './middleware/i18next';
import { useTranslation } from 'react-i18next';
import { getLocaleFromHeaders } from './utils/i18n/service';
import { domain, cdn as cdn_domain } from './data/livedataServer.json';
const DynamicDevtoolsdetector = lazy(() => import('./components/common/devtools-detector.client'));
const DynamicHelpSidebar = lazy(() => import('./components/common/HelpSidebar').then((m) => ({ default: m.HelpSidebar })));
// posthog-js is a browser-only analytics SDK; keeping it behind a .client.tsx boundary
// excludes it from the SSR Worker bundle entirely (see PostHogInit.client.tsx).
const DynamicPostHogInit = lazy(() => import('./components/analytics/PostHogInit.client').then((m) => ({ default: m.PostHogInit })));
import { env } from 'cloudflare:workers'; // for cloudflare
// import { env } from 'node:process';
import { FaExternalLinkAlt } from 'react-icons/fa';
import { ClientOnly } from './components/common/ClientOnly';
import { useHelpStore } from './store/helpStore';
// const DynamicBanner = lazy(() => import('~/components/FeatureBanner/FeatureBanner'));
import { getActiveProfileStorageKey, useAuthStore, type UserProfile } from './store/authStore';
import { useSyncStore } from './store/syncStore';
import { useSyncWatcher } from './store/planner/useSyncWatcher';

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
  const reqLocale = getLocaleFromHeaders(request);

  // Session is injected via <script id="__ba_session__"> in injectSessionData from workers/app.ts
  // Loader does not read the session to keep the cache key user-independent
  return data({ context, locale, reqLocale, params, env: publicEnv });
}

export const middleware = [i18nextMiddleware];

export const links: Route.LinksFunction = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useLoaderData<typeof loader>();
  const locale = data?.locale || DEFAULT_LOCALE;
  const { pathname } = useLocation();
  const isFullWidth = /\/charts\/[^/]+\/network(\/|$)/.test(pathname);
  // Only mount HelpSidebar (and its 'help' namespace useTranslation call) once the user
  // actually opens it, so help.json isn't fetched on every page load by default.
  const isHelpOpen = useHelpStore((s) => s.isOpen);

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
        <link rel="preconnect" href={`https://${cdn_domain}`} />
        <link rel="preconnect" href={(data?.env || import.meta.env).VITE_PUBLIC_POSTHOG_DIRECT_HOST || ''} />
        <link rel="preload" href={`https://${cdn_domain}/assets/fonts/GyeonggiTitle_Medium.woff2`} as="font" type="font/woff2" crossOrigin="anonymous"></link>
        <link rel="preload" href={`https://${cdn_domain}/assets/fonts/GyeonggiTitle_Bold.woff2`} as="font" type="font/woff2" crossOrigin="anonymous"></link>
        <script id="website-ld" type="application/ld+json">
          {`{
          "@context": "https://schema.org",
          "@type": "WebSite",
          "url": https://${domain}/",
          "name": "Yuzu Trends"
        }`.replace(/\s{2,}/gi, '')}
        </script>

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
          <div className="bg-neutral-50 text-neutral-800 dark:bg-neutral-900 dark:text-white transition-colors duration-300 font-ba">
            <nav className="bg-white dark:bg-neutral-800 shadow-sm sticky top-0 z-50 transition-colors duration-300">
              <Navigation reqLocale={data?.reqLocale || DEFAULT_LOCALE} />
            </nav>
            {/* <Suspense fallback={null}>
                <DynamicBanner />
              </Suspense> */}

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
              </p>
            </footer>
          </div>

          {isHelpOpen && (
            <Suspense fallback={null}>
              <DynamicHelpSidebar />
            </Suspense>
          )}
        </ThemeProvider>

        {/* </I18nextProvider> */}
        <NoScript />
        <ClientOnly>
          <Suspense fallback={null}>
            <DynamicDevtoolsdetector />
          </Suspense>
        </ClientOnly>
        {process.env.NODE_ENV === 'production' && (
          <>
            {/* <SpeedInsights /> */}
            {/* <Analytics /> */}
            <ClientOnly>
              <Suspense fallback={null}>
                <DynamicPostHogInit envData={data?.env} />
              </Suspense>
            </ClientOnly>
          </>
        )}
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
  useEffect(() => {
    if (useAuthStore.getState().activeProfileId) return; // Already initialized

    const el = document.getElementById('__ba_session__');
    if (!el?.textContent) return;

    try {
      interface RawProfile {
        id: string;
        name: string;
        server: string;
        is_default: number;
        sort_order: number;
        created_at: number;
        updated_at: number;
      }

      const { user, profiles: rawProfiles } = JSON.parse(el.textContent) as {
        user: { id: string; username: string; email?: string };
        profiles: RawProfile[];
      };
      if (!user) return;

      const profiles = rawProfiles.map((p) => ({
        id: p.id,
        name: p.name,
        server: p.server as UserProfile['server'],
        isDefault: p.is_default === 1,
        sortOrder: p.sort_order,
        createdAt: String(p.created_at),
        updatedAt: String(p.updated_at),
      }));
      useAuthStore.getState().setUser({ ...user, profiles });

      const storageKey = getActiveProfileStorageKey(user.id);
      const savedProfileId = localStorage.getItem(storageKey) ?? localStorage.getItem('yuzu_activeProfileId');
      const savedProfile = savedProfileId ? profiles.find((p) => p.id === savedProfileId) : null;
      const defaultProfile = savedProfile ?? profiles.find((p) => p.isDefault) ?? profiles[0];
      if (!defaultProfile) return;
      useAuthStore.getState().setActiveProfile(defaultProfile.id);
      localStorage.removeItem('yuzu_activeProfileId');
      useSyncStore.getState().setCurrentProfileId(defaultProfile.id);
      void useSyncStore.getState().pullAll(defaultProfile.id);
    } catch {
      // Session parsing failure is non-fatal (treated as non-logged-in state)
    }
  }, []);

  useSyncWatcher();

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
