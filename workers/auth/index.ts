import { getOrCreateAuth, checkRateLimit, isSessionFresh } from './auth';
import { checkBrowserMutation, checkBrowserRead, getAllowedOrigins } from './requestGuard';
import { parse, type DefinitionNode } from 'graphql';
import { getOrCreateYogaServer } from './graphql';
import { getDefaultProfileServer, getSupportedProfileLocale } from '../../app/utils/profileServer';
import { validatePassword } from './password-validate';
import { hashPassword } from 'better-auth/crypto';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// After a raw D1 write to `user` (bypassing better-auth's own update endpoints), the signed
// session_data cookie cache still holds the pre-update username/email for up to cookieCache.maxAge.
// Expiring it forces the next getSession() call to re-read D1 and refill the cache with current
// values — cheaper than disabling the cache globally, since it only costs one extra read for the
// user who just changed, not one per page load for everyone.
function expireSessionDataCookies(res: Response): Response {
  for (const name of ['better-auth.session_data', '__Secure-better-auth.session_data']) {
    res.headers.append('Set-Cookie', `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
  }
  return res;
}

function isAuthMaintenanceEnabled(env: Env): boolean {
  const maintenanceEnv = env as Env & { AUTH_MAINTENANCE?: string };
  return maintenanceEnv.AUTH_MAINTENANCE === 'true';
}

function getClientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

async function verifyTurnstile(token: string, secret: string, ip: string): Promise<boolean> {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    const data = await res.json<{ success: unknown }>();
    return data.success === true;
  } catch {
    return false;
  }
}

const RATE_LIMITED_PATHS = ['/sign-in/username', '/sign-up/email', '/sign-in/magic-link', '/sign-in/email'];
// Passkey login: generate-authenticate-options is a GET (challenge issuance), verify-authentication
// is a POST. Both are called on every normal passkey login, so they need a much looser budget than
// the password/magic-link paths above — this is about capping abuse/DoS, not brute-forcing WebAuthn.
const PASSKEY_RATE_LIMITED_PATHS = ['/passkey/generate-authenticate-options', '/passkey/verify-authentication'];

async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathSuffix = url.pathname.replace(/^\/api\/auth/, '');
  const isRateLimited = RATE_LIMITED_PATHS.some((p) => pathSuffix.startsWith(p)) && request.method === 'POST';
  const isPasskeyRateLimited = PASSKEY_RATE_LIMITED_PATHS.some((p) => pathSuffix.startsWith(p)) && (request.method === 'GET' || request.method === 'POST');

  if (isRateLimited || isPasskeyRateLimited) {
    const ip = getClientIp(request);
    const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
    if (!isLocalhost) {
      const { allowed, remaining } = isPasskeyRateLimited ? await checkRateLimit(env.ba_user, ip, pathSuffix, 30, 3_600_000) : await checkRateLimit(env.ba_user, ip, pathSuffix);
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Too many attempts. Please try again later.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'X-RateLimit-Remaining': '0', 'Retry-After': isPasskeyRateLimited ? '3600' : '86400' },
        });
      }
      if (remaining < 2) console.warn(`Rate limit warning: ${ip} has ${remaining} attempts left for ${pathSuffix}`);

      if (isRateLimited && env.TURNSTILE_SECRET_KEY) {
        let body: Record<string, unknown>;
        try {
          body = await request.clone().json();
        } catch {
          return json({ error: 'Invalid request body' }, 400);
        }
        const turnstileToken = typeof body['cf-turnstile-response'] === 'string' ? body['cf-turnstile-response'] : null;
        if (!turnstileToken) return json({ error: 'Captcha verification required' }, 400);
        const valid = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, ip);
        if (!valid) return json({ error: 'Captcha verification failed. Please try again.' }, 403);
      }
    }
  }

  try {
    const auth = getOrCreateAuth(env);
    const res = await auth.handler(request);
    // Session/list endpoints can carry tokens; never let a shared cache keep them.
    if (!res.headers.has('Cache-Control')) {
      const guarded = new Response(res.body, res);
      guarded.headers.set('Cache-Control', 'private, no-store');
      return guarded;
    }
    return res;
  } catch (error) {
    console.error('Auth error:', error);
    return json({ error: 'Auth error' }, 500);
  }
}

async function handleListSessions(request: Request, env: Env): Promise<Response> {
  const originError = checkBrowserRead(request, env);
  if (originError) return originError;

  const auth = getOrCreateAuth(env);
  const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
  if (!session?.user) return json({ error: 'Unauthorized' }, 401);

  // Only non-secret columns: the session token and IP address are never returned.
  // Date columns are ISO 8601 text (see cleanupExpiredAuthData), so compare against an ISO string.
  const rows = await env.ba_user
    .prepare('SELECT id, userAgent, createdAt, updatedAt FROM session WHERE userId = ? AND expiresAt > ? ORDER BY updatedAt DESC')
    .bind(session.user.id, new Date().toISOString())
    .all<{ id: string; userAgent: string | null; createdAt: number | string; updatedAt: number | string }>();

  const sessions = (rows.results ?? []).map((row) => ({
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    current: row.id === session.session.id,
  }));
  return new Response(JSON.stringify({ sessions }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
}

async function handleAuthExt(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const op = url.searchParams.get('op');

  if (request.method === 'GET' && op === 'list-sessions') return handleListSessions(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (op !== 'link-credential') return json({ error: 'Unknown operation' }, 400);

  const guardError = checkBrowserMutation(request, env);
  if (guardError) return guardError;

  const auth = getOrCreateAuth(env);
  // Bypass the signed cookie cache so a revoked session cannot keep linking credentials.
  const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
  if (!session?.user) return json({ error: 'Unauthorized' }, 401);
  if (!isSessionFresh(session.session.createdAt)) return json({ error: 'Session is not fresh', code: 'SESSION_NOT_FRESH' }, 403);

  // Keyed by user id (not IP) since the caller is already authenticated — this stops one user
  // from probing username availability unbounded without punishing others on the same IP.
  const { allowed } = await checkRateLimit(env.ba_user, session.user.id, 'auth-ext:link-credential', 10, 3_600_000);
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Too many attempts. Please try again later.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'X-RateLimit-Remaining': '0', 'Retry-After': '3600' },
    });
  }

  let requestData: { username?: unknown; password?: unknown };
  try {
    requestData = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  const { username: rawUsername, password } = requestData;
  if (typeof rawUsername !== 'string' || typeof password !== 'string' || !rawUsername || !password) return json({ error: 'Missing fields' }, 400);
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(rawUsername)) return json({ error: 'Invalid username format' }, 400);

  // Normalize like the better-auth username plugin so case variants cannot create duplicate rows.
  const username = rawUsername.toLowerCase();
  // `github_<id>@users.internal` is the synthetic email for GitHub accounts without a public email.
  if (username.startsWith('github_')) return json({ error: 'Invalid username format' }, 400);

  const pwError = validatePassword(password);
  if (pwError) return json({ error: pwError }, 400);

  const db = env.ba_user;
  const existingUser = await db.prepare('SELECT id FROM user WHERE lower(username) = ?').bind(username).first<{ id: string }>();
  if (existingUser && existingUser.id !== session.user.id) return json({ error: 'Username already taken' }, 409);

  const existingCredential = await db.prepare("SELECT id FROM account WHERE userId = ? AND providerId = 'credential'").bind(session.user.id).first<{ id: string }>();
  if (existingCredential) return json({ error: 'Password login already set up' }, 409);

  const syntheticEmail = `${username}@users.internal`;
  const hashedPw = await hashPassword(password);
  const now = new Date().toISOString();

  try {
    await db
      .prepare('INSERT INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), session.user.id, session.user.id, 'credential', hashedPw, now, now)
      .run();
    await db.prepare('UPDATE user SET username = ?, displayUsername = ?, email = ?, updatedAt = ? WHERE id = ?').bind(username, rawUsername, syntheticEmail, now, session.user.id).run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed')) return json({ error: 'Username already taken' }, 409);
    throw err;
  }

  return expireSessionDataCookies(json({ ok: true }));
}

// A request body may contain several operations; only a mutation needs the uncached DB session check.
function containsMutation(query: unknown): boolean {
  if (typeof query !== 'string') return false;
  try {
    return parse(query).definitions.some((def: DefinitionNode) => def.kind === 'OperationDefinition' && def.operation === 'mutation');
  } catch {
    return false;
  }
}

async function handleGraphQL(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const guardError = checkBrowserMutation(request, env);
  if (guardError) return guardError;

  try {
    const bodyText = await request.clone().text();
    let isMutation = false;
    try {
      const parsed: unknown = JSON.parse(bodyText);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      isMutation = items.some((item) => typeof item === 'object' && item !== null && containsMutation((item as { query?: unknown }).query));
    } catch {
      // Unparseable body: Yoga rejects it; treat as a mutation to stay on the strict path.
      isMutation = true;
    }

    const auth = getOrCreateAuth(env);
    const session = await auth.api.getSession({ headers: request.headers, ...(isMutation ? { query: { disableCookieCache: true } } : {}) }).catch(() => null);
    const userId = session?.user?.id ?? null;

    const newHeaders = new Headers(request.headers);
    newHeaders.delete('x-user-id');
    if (userId) newHeaders.set('x-user-id', userId);
    const modifiedRequest = new Request(request, { headers: newHeaders });

    const yogaResp = await getOrCreateYogaServer(getAllowedOrigins(env)).fetch(modifiedRequest, { userDb: env.ba_user });
    const body = await yogaResp.text();
    return new Response(body, { status: yogaResp.status, headers: yogaResp.headers });
  } catch (error) {
    console.error('GraphQL error:', error);
    return new Response(JSON.stringify({ errors: [{ message: 'GraphQL error' }] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// XSS Prevention: Escape HTML special characters when inserting JSON inside a <script> tag
function safeJsonScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function getRequestedLocale(request: Request): string {
  const urlLocale = getSupportedProfileLocale(new URL(request.url).searchParams.get('locale') ?? undefined);
  if (urlLocale) return urlLocale;

  const localeCookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('lng='))
    ?.slice(4);
  const cookieLocale = getSupportedProfileLocale(localeCookie ? decodeURIComponent(localeCookie) : undefined);
  if (cookieLocale) return cookieLocale;

  const headerLocales =
    request.headers
      .get('accept-language')
      ?.split(',')
      .map((value) => value.split(';')[0]?.trim()) ?? [];
  return headerLocales.map((locale) => getSupportedProfileLocale(locale)).find((locale) => locale !== undefined) ?? 'en';
}

async function handleInternalSession(request: Request, env: Env): Promise<Response> {
  const auth = getOrCreateAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response(null, { status: 204 });

  const res = await env.ba_user.prepare('SELECT * FROM user_profiles WHERE user_id = ? ORDER BY sort_order').bind(session.user.id).all();
  let profiles = res.results ?? [];

  if (profiles.length === 0) {
    const profileId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const defaultServer = getDefaultProfileServer(getRequestedLocale(request));
    const result = await env.ba_user
      .prepare(
        `INSERT INTO user_profiles (id, user_id, name, server, is_default, sort_order, created_at, updated_at)
         SELECT ?, ?, 'Default', ?, 1, 0, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = ?)`,
      )
      .bind(profileId, session.user.id, defaultServer, now, now, session.user.id)
      .run();

    if (result.meta.changes > 0) {
      profiles = [{ id: profileId, user_id: session.user.id, name: 'Default', server: defaultServer, is_default: 1, sort_order: 0, created_at: now, updated_at: now }];
    } else {
      const retry = await env.ba_user.prepare('SELECT * FROM user_profiles WHERE user_id = ? ORDER BY sort_order').bind(session.user.id).all();
      profiles = retry.results ?? [];
    }
  }

  const payload = safeJsonScript({
    user: {
      id: session.user.id,
      username: session.user.username ?? null,
      email: session.user.email ?? undefined,
    },
    profiles,
  });

  return new Response(payload, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// Purge expired better-auth sessions/verifications and stale rate-limit rows.
// better-auth (1.7.x) does not clean these up automatically; run daily via Cron Trigger.
// Date columns are stored as ISO 8601 text (D1 sqlite dialect => supportsDates=false),
// which sorts chronologically, so a direct string comparison works.
// rate_limit.lastRequest is a Unix-ms integer written by checkRateLimit().
async function cleanupExpiredAuthData(env: Env): Promise<void> {
  const nowIso = new Date().toISOString();
  const rateLimitCutoff = Date.now() - 86_400_000; // matches checkRateLimit's 24h window

  try {
    const results = await env.ba_user.batch([
      env.ba_user.prepare('DELETE FROM session WHERE expiresAt IS NOT NULL AND expiresAt < ?').bind(nowIso),
      env.ba_user.prepare('DELETE FROM verification WHERE expiresAt IS NOT NULL AND expiresAt < ?').bind(nowIso),
      env.ba_user.prepare('DELETE FROM rate_limit WHERE lastRequest < ?').bind(rateLimitCutoff),
    ]);
    const [session, verification, rateLimit] = results.map((r) => r.meta.changes ?? 0);
    console.log(`[auth cleanup] session=${session} verification=${verification} rate_limit=${rateLimit}`);
  } catch (err) {
    console.error('[auth cleanup] failed', err);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (isAuthMaintenanceEnabled(env) && (pathname.startsWith('/api/auth') || pathname === '/api/auth-ext')) {
      return new Response(JSON.stringify({ error: 'Authentication is temporarily unavailable for maintenance.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '300' },
      });
    }

    if (isAuthMaintenanceEnabled(env)) {
      // Pause planner sync too: no D1 work for existing sessions while maintenance is on.
      if (pathname === '/api/graphql') {
        return new Response(JSON.stringify({ errors: [{ message: 'Sync is temporarily unavailable for maintenance.' }] }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '300' },
        });
      }
      // No session payload: the page renders as anonymous and the session-injection script is skipped.
      if (pathname === '/__internal/session') return new Response(null, { status: 204 });
    }

    if (pathname === '/api/auth-ext') return handleAuthExt(request, env);
    if (pathname.startsWith('/api/auth')) return handleAuth(request, env);
    if (pathname === '/api/graphql') return handleGraphQL(request, env);
    if (pathname === '/__internal/session') return handleInternalSession(request, env);

    return new Response('Not found', { status: 404 });
  },

  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(cleanupExpiredAuthData(env));
  },
} satisfies ExportedHandler<Env>;
