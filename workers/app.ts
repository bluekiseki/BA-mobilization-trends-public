import { createRequestHandler, matchRoutes, RouterContextProvider, type RouteObject } from 'react-router';
import { CloudflareContext } from './cloudflare-context';
import { injectSessionData } from './session-inject';
import { createInternalSessionRequest } from '../app/utils/internalSessionRequest';
import { getLiveDataVersion } from './liveDataVersion';
import { handleTextFeed, isTextFeedPath } from './textFeedGuard';
import routeConfig from '../app/routes';
import { SUPORTED_LOCALES, type Locale } from '../app/utils/i18n/config';

// Matches /live and /<locale>/live (the .data suffix is stripped by the caller before testing).
const LIVE_PATH_RE = new RegExp(`^/(?:(?:${SUPORTED_LOCALES.join('|')})/)?live/?$`);

const requestHandler = createRequestHandler(() => import('virtual:react-router/server-build'), import.meta.env.MODE);

// Without the catch-all, matchRoutes only succeeds for real pages. Matching reads only path/index/children,
// so the plain route config can be cast to RouteObject[].
const routableRoutes = routeConfig.filter((route) => route.path !== '*') as unknown as RouteObject[];

// Matching alone is not enough: `:locale?` captures any single segment (`/wp-login.php`, `/.env`), so the locale
// is checked here too, instead of running the loaders only for layout.tsx to 404 it.
function isKnownRoute(pathname: string): boolean {
  // Framework-internal requests: the route-discovery manifest, and single-fetch's ".data" suffix (root uses /_.data).
  if (pathname === '/__manifest') return true;
  const matchablePath = pathname === '/_.data' ? '/' : pathname.endsWith('.data') ? pathname.slice(0, -'.data'.length) : pathname;

  const matches = matchRoutes(routableRoutes, matchablePath);
  if (matches === null) return false;
  const locale = matches[matches.length - 1].params.locale;
  return !locale || SUPORTED_LOCALES.includes(locale as Locale);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (/\/{2,}/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/{2,}/g, '/');
      return Response.redirect(url.href, 301);
    }
    const { pathname } = url;

    // Rate limit the public text feeds before any cache lookup, so cache hits count too.
    if (isTextFeedPath(pathname)) {
      const feedResponse = await handleTextFeed(request, env);
      if (feedResponse) return feedResponse;
    }

    const cache = (globalThis as unknown as { caches: { default: Cache } }).caches.default;
    const appVersion: string = String(__COMMIT_SHA__ || import.meta.env.VITE_GIT_COMMIT || import.meta.env.CF_PAGES_COMMIT_SHA || 'dev');

    // Bot probes (.env, wp-login.php, ...) match no route: serve a cached 404 instead of a full SSR render.
    // Dynamic-resource 404s (e.g. notices/:postId) still match a route and go through SSR.
    if (!isKnownRoute(pathname)) {
      const context = new RouterContextProvider();
      context.set(CloudflareContext, { cloudflare: { env, ctx } });

      if (request.method !== 'GET') {
        return requestHandler(request, context); // rare; not cacheable anyway
      }

      // One fixed key: every unmatched path renders the same 404.
      const notFoundCacheKey = new Request(`https://internal.cache/v-${appVersion}/__not_found__`);
      const cachedNotFound = await cache.match(notFoundCacheKey);
      if (cachedNotFound) return cachedNotFound;

      const notFoundResponse = await requestHandler(request, context);
      const cacheableNotFound = new Response(notFoundResponse.body, notFoundResponse);
      cacheableNotFound.headers.set('Cache-Control', 'public, s-maxage=86400');
      ctx.waitUntil(cache.put(notFoundCacheKey, cacheableNotFound.clone()));
      return cacheableNotFound;
    }

    // Pages restored from the browser's HTML cache have no injected session (see workers/session-inject.ts), so the
    // client asks for it here. better-auth's /get-session cannot serve it: no planner profiles, no default one created.
    if (pathname === '/api/auth/session-recover') {
      const resp = await env.AUTH_WORKER.fetch(createInternalSessionRequest(request));
      const recovered = new Response(resp.body, resp);
      recovered.headers.set('Cache-Control', 'private, no-store');
      return recovered;
    }
    if (pathname === '/api/auth/list-accounts') {
      const resp = await env.AUTH_WORKER.fetch(request);
      if (!resp.ok) return resp;
      type RawAccount = { providerId: string };
      const data: RawAccount[] = await resp.json();
      return Response.json(
        data.map((a) => ({ providerId: a.providerId })),
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    if (pathname === '/api/auth/passkey/list-user-passkeys') {
      const resp = await env.AUTH_WORKER.fetch(request);
      if (!resp.ok) return resp;
      type RawPasskey = { id: string; name?: string | null; createdAt: string };
      const data: RawPasskey[] = await resp.json();
      return Response.json(
        data.map(({ id, name, createdAt }) => ({ id, name: name ?? null, createdAt })),
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    if (pathname.startsWith('/api/auth') || pathname === '/api/graphql') {
      return env.AUTH_WORKER.fetch(request);
    }

    // Only GET is cached.
    if (request.method !== 'GET') {
      const context = new RouterContextProvider();
      context.set(CloudflareContext, { cloudflare: { env, ctx } });
      return requestHandler(request, context);
    }

    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = `/v-${appVersion}${cacheUrl.pathname}`;

    // /live data updates irregularly, so its cache key includes the R2 etags: unchanged data keeps hitting the cache,
    // an update busts it. app/routes/live/index.tsx's headers() is the fallback if the lookup fails.
    const liveMatchablePath = pathname.endsWith('.data') ? pathname.slice(0, -'.data'.length) : pathname;
    if (LIVE_PATH_RE.test(liveMatchablePath)) {
      const dataVersion = await getLiveDataVersion(env);
      if (dataVersion) cacheUrl.searchParams.set('_dv', dataVersion);
    }

    const cookieHeader = request.headers.get('Cookie') ?? '';
    const hasSessionCookie = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token\s*=/.test(cookieHeader);
    const isDocumentPath = !pathname.startsWith('/api/') && !pathname.endsWith('.data') && pathname !== '/__manifest';

    // A conditional cache.match() can return a bodyless 304, leaving nothing for the session injector to transform.
    const cacheKey = new Request(cacheUrl.toString(), request);
    if (hasSessionCookie && isDocumentPath) {
      cacheKey.headers.delete('If-Modified-Since');
      cacheKey.headers.delete('If-None-Match');
    }

    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const response = new Response(cachedResponse.body, cachedResponse);
      response.headers.set('X-Custom-Cache', 'HIT');
      if (hasSessionCookie && response.headers.get('Content-Type')?.includes('text/html')) {
        return injectSessionData(response, request, env);
      }
      return response;
    }

    const context = new RouterContextProvider();
    context.set(CloudflareContext, { cloudflare: { env, ctx } });
    let response = await requestHandler(request, context);

    const cacheControl = response.headers.get('Cache-Control');
    const hasSetCookie = response.headers.has('Set-Cookie');

    // Cache only a 200 that opts in via Cache-Control and sets no cookie.
    if (response.status === 200 && cacheControl && (cacheControl.includes('s-maxage') || cacheControl.includes('public')) && !hasSetCookie) {
      // Stored without session data; it is injected per user after lookup.
      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      response = new Response(response.body, response);
      response.headers.set('X-Custom-Cache', 'MISS');
    } else {
      response = new Response(response.body, response);
      response.headers.set('X-Custom-Cache', 'BYPASS');
    }

    // Same for MISS and BYPASS.
    if (hasSessionCookie && response.headers.get('Content-Type')?.includes('text/html')) {
      return injectSessionData(response, request, env);
    }
    return response;
  },
} satisfies ExportedHandler<Env>;
