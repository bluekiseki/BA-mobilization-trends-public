export const TEXT_FEED_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
};

// Plain-text response for the public text feeds (CORS open: these are meant for other programs).
export function textResponse(body: string, init: { status?: number; cacheControl?: string; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  headers.set('Access-Control-Allow-Origin', TEXT_FEED_CORS_HEADERS['Access-Control-Allow-Origin']);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', init.cacheControl ?? 'no-store');
  return new Response(body, {
    status: init.status ?? 200,
    headers,
  });
}
