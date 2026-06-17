import { createRequestHandler, RouterContextProvider } from 'react-router';
import { CloudflareContext } from './cloudflare-context';
import { injectSessionData } from './session-inject';

const requestHandler = createRequestHandler(() => import('virtual:react-router/server-build'), import.meta.env.MODE);

export default {
  async fetch(request, env, ctx) {
    // Auth and GraphQL handled by auth worker via service binding
    const url = new URL(request.url);
    if (/\/{2,}/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/{2,}/g, '/');
      return Response.redirect(url.href, 301);
    }
    const { pathname } = url;
    if (pathname === '/api/auth/list-accounts') {
      const resp = await env.AUTH_WORKER.fetch(request);
      if (!resp.ok) return resp;
      type RawAccount = { providerId: string };
      const data: RawAccount[] = await resp.json();
      return Response.json(data.map((a) => ({ providerId: a.providerId })));
    }
    if (pathname === '/api/auth/passkey/list-user-passkeys') {
      const resp = await env.AUTH_WORKER.fetch(request);
      if (!resp.ok) return resp;
      type RawPasskey = { id: string; name?: string | null; createdAt: string };
      const data: RawPasskey[] = await resp.json(); // as ;
      return Response.json(data.map(({ id, name, createdAt }) => ({ id, name: name ?? null, createdAt })));
    }
    if (pathname.startsWith('/api/auth') || pathname === '/api/graphql') {
      return env.AUTH_WORKER.fetch(request);
    }

    // 1. Only GET requests are eligible for caching (POST, etc., pass through).
    if (request.method !== 'GET') {
      const context = new RouterContextProvider();
      context.set(CloudflareContext, { cloudflare: { env, ctx } });
      return requestHandler(request, context);
    }

    // Initialize cache for each git version
    const cache = (globalThis as unknown as { caches: { default: Cache } }).caches.default;
    const cacheUrl = new URL(request.url);
    const appVersion: string = String(__COMMIT_SHA__ || import.meta.env.VITE_GIT_COMMIT || import.meta.env.CF_PAGES_COMMIT_SHA || 'dev');
    cacheUrl.pathname = `/v-${appVersion}${cacheUrl.pathname}`;

    // Generate cache key using a modified URL
    const cacheKey = new Request(cacheUrl.toString(), request);

    const cookieHeader = request.headers.get('Cookie') ?? '';
    const hasSessionCookie = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token\s*=/.test(cookieHeader);

    // 2. Search for the response in Cloudflare Edge cache storage first (HIT).
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      // Cache HIT! Returning immediately without executing React Router.
      const response = new Response(cachedResponse.body, cachedResponse);
      response.headers.set('X-Custom-Cache', 'HIT'); // Custom header for debugging
      // Logged-in users are returned cached HTML with session data injected
      if (hasSessionCookie && response.headers.get('Content-Type')?.includes('text/html')) {
        return injectSessionData(response, request, env);
      }
      return response;
    }

    // 3. If not in cache (MISS), execute React Router normally to create a response.
    const context = new RouterContextProvider();
    context.set(CloudflareContext, { cloudflare: { env, ctx } });
    let response = await requestHandler(request, context);

    // 4. Check whether to save the generated response to the cache.
    const cacheControl = response.headers.get('Cache-Control');
    const hasSetCookie = response.headers.has('Set-Cookie');
    // for debug
    // response.headers.set('X-Custom-Git', `${__COMMIT_SHA__}|${appVersion}_${import.meta.env.VITE_GIT_COMMIT}_${import.meta.env.CF_PAGES_COMMIT_SHA}_${env.CF_PAGES_COMMIT_SHA}`);

    // Conditions: 200 OK response + Cache-Control header present + No Set-Cookie
    if (response.status === 200 && cacheControl && (cacheControl.includes('s-maxage') || cacheControl.includes('public')) && !hasSetCookie) {
      // If conditions are met, save to cache in the background (HIT from the next request).
      // Pure HTML without session is stored in the cache (all users use the same cache)
      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      // Mark that this response was newly generated.
      response = new Response(response.body, response);
      response.headers.set('X-Custom-Cache', 'MISS');
    } else {
      // Cases not eligible for caching (e.g., login pages, dynamic APIs, etc.)
      response = new Response(response.body, response);
      response.headers.set('X-Custom-Cache', 'BYPASS');
    }

    // Inject session for both MISS/BYPASS if the user is logged in
    if (hasSessionCookie && response.headers.get('Content-Type')?.includes('text/html')) {
      return injectSessionData(response, request, env);
    }
    return response;
  },
} satisfies ExportedHandler<Env>;
