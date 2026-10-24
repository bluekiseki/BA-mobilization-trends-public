import { localUrl, productionUrl } from '~/data/livedataServer.json';

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Origins allowed to call cookie-authenticated endpoints. Dev origins are never trusted in production.
export function getAllowedOrigins(env: Pick<Env, 'ENVIRONMENT'>): string[] {
  return env.ENVIRONMENT === 'production' ? [productionUrl] : [localUrl];
}

// Rejects requests a browser could send from another origin with the user's cookies attached.
// SameSite=Lax still sends cookies from same-site subdomains and other localhost ports, so the
// Origin must match exactly. Requiring application/json forces a CORS preflight for cross-origin
// callers, which closes the form/text-plain "simple request" path.
export function checkBrowserOrigin(request: Request, env: Pick<Env, 'ENVIRONMENT'>): Response | null {
  const origin = request.headers.get('Origin');
  if (!origin || !getAllowedOrigins(env).includes(origin)) return jsonError('Forbidden', 403);

  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite && fetchSite !== 'same-origin') return jsonError('Forbidden', 403);

  return null;
}

// Same-origin GETs carry no Origin header, so reads accept a missing Origin; any Origin that is present, and
// Sec-Fetch-Site, must still be same-origin. Cross-origin pages cannot read the response (no CORS headers are sent).
export function checkBrowserRead(request: Request, env: Pick<Env, 'ENVIRONMENT'>): Response | null {
  const origin = request.headers.get('Origin');
  if (origin && !getAllowedOrigins(env).includes(origin)) return jsonError('Forbidden', 403);

  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (fetchSite && fetchSite !== 'same-origin') return jsonError('Forbidden', 403);

  return null;
}

export function checkBrowserMutation(request: Request, env: Pick<Env, 'ENVIRONMENT'>): Response | null {
  const originError = checkBrowserOrigin(request, env);
  if (originError) return originError;

  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') return jsonError('Unsupported Media Type', 415);

  return null;
}
