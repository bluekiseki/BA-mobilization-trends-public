import { createContext, createRequestHandler, RouterContextProvider } from 'react-router';

export const CloudflareContext = createContext<{
  cloudflare: {
    env: Env;
    ctx: ExecutionContext;
  };
}>();

const requestHandler = createRequestHandler(() => import('virtual:react-router/server-build' as any), import.meta.env.MODE);

export default {
  async fetch(request, env, ctx) {
    // 1. Only GET requests are eligible for caching (POST, etc., pass through).
    if (request.method !== 'GET') {
      const context = new RouterContextProvider();
      context.set(CloudflareContext, { cloudflare: { env, ctx } });
      return requestHandler(request, context);
    }

    // Initialize cache for each git version
    const cache = (caches as any).default;
    const cacheUrl = new URL(request.url);
    const appVersion = __COMMIT_SHA__ || import.meta.env.VITE_GIT_COMMIT || import.meta.env.CF_PAGES_COMMIT_SHA || 'dev';
    cacheUrl.pathname = `/v-${appVersion}${cacheUrl.pathname}`;

    // Generate cache key using a modified URL
    const cacheKey = new Request(cacheUrl.toString(), request);

    // 2. Search for the response in Cloudflare Edge cache storage first (HIT).
    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      // Cache HIT! Returning immediately without executing React Router.
      const response = new Response(cachedResponse.body, cachedResponse);
      response.headers.set('X-Custom-Cache', 'HIT'); // Custom header for debugging
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
      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      // Mark that this response was newly generated.
      response = new Response(response.body, response);
      response.headers.set('X-Custom-Cache', 'MISS');
    } else {
      // Cases not eligible for caching (e.g., login pages, dynamic APIs, etc.)
      response = new Response(response.body, response);
      response.headers.set('X-Custom-Cache', 'BYPASS');
    }

    return response;
  },
} satisfies ExportedHandler<Env>;
