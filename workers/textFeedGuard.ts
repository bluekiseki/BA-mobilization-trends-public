import { TEXT_FEED_CORS_HEADERS, textResponse } from '../app/utils/textResponse';

// Public plain-text feeds. Static feeds (/llms.txt, /txt/**.txt) are files served by the edge
// without invoking the Worker (headers come from public/_headers); a /txt/* request only reaches
// here when no such file exists. The dynamic /api/text/* feeds are rate limited per IP.

const NOTICE_REGIONS = ['ALL', 'Global', 'KR', 'JP', 'TW'];

export function isTextFeedPath(pathname: string): boolean {
  return pathname.startsWith('/txt/') || pathname.startsWith('/api/text/');
}

function textError(status: number, message: string, extra: Record<string, string> = {}): Response {
  return textResponse(`${message}\n`, { status, headers: { ...TEXT_FEED_CORS_HEADERS, ...extra } });
}

const NOT_FOUND = 'Not Found. See /llms.txt for the list of feeds.';

// Returns the response to send, or null to let the request continue to the app (/api/text/* routes).
export async function handleTextFeed(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);

  // An existing static feed never gets here, so any /txt/* request is a miss.
  if (url.pathname.startsWith('/txt/')) return textError(404, NOT_FOUND);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: TEXT_FEED_CORS_HEADERS });
  if (request.method !== 'GET' && request.method !== 'HEAD') return textError(405, 'Method Not Allowed', { Allow: 'GET, HEAD, OPTIONS' });
  if (url.pathname !== '/api/text/notices') return textError(404, NOT_FOUND);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  // Binding missing (e.g. a local setup without it): fail open rather than break the feed.
  if (env.TEXT_NOTICES_LIMITER && !(await env.TEXT_NOTICES_LIMITER.limit({ key: ip })).success) {
    return textError(429, 'Too Many Requests', { 'Retry-After': '60' });
  }

  const region = url.searchParams.get('region') ?? 'ALL';
  if (!NOTICE_REGIONS.includes(region)) return textError(400, `Bad Request: region must be one of ${NOTICE_REGIONS.join(', ')}`);
  // The edge cache is keyed by the full URL: redirect any other query string to the canonical
  // form so junk parameters cannot bypass the cache and hit D1.
  const canonicalSearch = region === 'ALL' ? '' : `?region=${region}`;
  if (url.search !== canonicalSearch) return Response.redirect(`${url.origin}${url.pathname}${canonicalSearch}`, 301);
  return null;
}
