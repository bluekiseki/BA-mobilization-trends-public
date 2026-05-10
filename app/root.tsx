// app/root.tsx
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, data, redirect } from 'react-router';

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
import { PostHogProvider } from 'posthog-js/react';
import { domain, cdn as cdn_domain, vercelDomain } from './data/livedataServer.json';
const DynamicDevtoolsdetector = lazy(() => import('./components/devtools-detector'));
import { env } from 'cloudflare:workers'; // for cloudflare
// import { env } from 'node:process';
import { FaExternalLinkAlt } from 'react-icons/fa';
import { HelpSidebar } from './components/common/HelpSidebar';
const DynamicBanner = lazy(() => import('~/components/FeatureBanner/FeatureBanner'));

export async function loader({ context, request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);

  if (url.hostname === vercelDomain) {
    throw redirect(`https://${domain}` + url.pathname + url.search, 301);
  }

  // /zh-Tw/** → /zh-Hant/**
  if (url.pathname === '/zh-TW' || url.pathname.startsWith('/zh-TW/')) {
    const newPath = url.pathname.replace(/^\/zh-TW/, '/zh-Hant');
    throw redirect(`${newPath}${url.search}`, 301);
  }

  const publicEnv = {
    VITE_PUBLIC_POSTHOG_KEY: env.VITE_PUBLIC_POSTHOG_KEY,
    VITE_PUBLIC_POSTHOG_HOST: env.VITE_PUBLIC_POSTHOG_HOST,
    VITE_WEB3FORMS_ACCESS_KEY: env.VITE_WEB3FORMS_ACCESS_KEY,
  };

  let locale = getLocale(context) as Locale;
  const reqLocale = getLocaleFromHeaders(request);
  return data({ context, locale, reqLocale, params, env: publicEnv } /*{ headers: { 'Set-Cookie': await localeCookie.serialize(locale) } }*/);
}

export const middleware = [i18nextMiddleware];

export const links: Route.LinksFunction = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useLoaderData<typeof loader>();
  const locale = data?.locale || DEFAULT_LOCALE;

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
        <link rel="preconnect" href={`${(data?.env || import.meta.env).VITE_PUBLIC_POSTHOG_HOST}`} />
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
        <PostHogProvider
          apiKey={(data?.env || import.meta.env).VITE_PUBLIC_POSTHOG_KEY}
          options={{
            api_host: (data?.env || import.meta.env).VITE_PUBLIC_POSTHOG_HOST,
            ui_host: 'https://us.posthog.com',
            defaults: '2025-05-24',
            capture_exceptions: true,
            capture_performance: true,
            // debug: import.meta.env.MODE === "development",
            cookieless_mode: 'always', // Banner required,
            loaded: (ph) => {
              fetch(`${(data?.env || import.meta.env).VITE_PUBLIC_POSTHOG_HOST}/api/geoip`)
                .then((res) => res.json() as any)
                .then(({ data }) => ph.register(data));
            },
          }}
        >
          <ThemeProvider>
            <div className="bg-neutral-50 text-neutral-800 dark:bg-neutral-900 dark:text-white transition-colors duration-300 font-bluearchive">
              <nav className="bg-white dark:bg-neutral-800 shadow-sm sticky top-0 z-50 transition-colors duration-300">
                <Navigation reqLocale={data?.reqLocale || DEFAULT_LOCALE} />
              </nav>
              <Suspense fallback={null}>
                <DynamicBanner />
              </Suspense>

              <main className="max-w-7xl mx-auto" style={{ minHeight: 'calc(100vh - 170px)' }}>
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

            <HelpSidebar />
          </ThemeProvider>
        </PostHogProvider>

        {/* </I18nextProvider> */}
        <NoScript />
        {process.env.NODE_ENV === 'production' && (
          <>
            {/* <SpeedInsights /> */}
            {/* <Analytics /> */}
            <Suspense fallback={null}>
              <DynamicDevtoolsdetector />
            </Suspense>
          </>
        )}
      </body>
      {/* </HelmetProvider> */}
    </html>
  );
}

export default function App({ loaderData: { locale } }: Route.ComponentProps) {
  let { i18n } = useTranslation();
  useEffect(() => {
    if (i18n.language !== locale) i18n.changeLanguage(locale);
  }, [locale, i18n]);
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
