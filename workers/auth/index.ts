import { getOrCreateAuth, checkRateLimit } from './auth';
import { getOrCreateYogaServer } from './graphql';
import { validatePassword } from './password-validate';
import { hashPassword } from 'better-auth/crypto';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathSuffix = url.pathname.replace(/^\/api\/auth/, '');
  const isRateLimited = RATE_LIMITED_PATHS.some((p) => pathSuffix.startsWith(p));

  if (isRateLimited && request.method === 'POST') {
    const ip = getClientIp(request);
    const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
    if (!isLocalhost) {
      const { allowed, remaining } = await checkRateLimit(env.ba_user, ip, pathSuffix);
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Too many attempts. Please try again tomorrow.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'X-RateLimit-Remaining': '0', 'Retry-After': '86400' },
        });
      }
      if (remaining < 2) console.warn(`Rate limit warning: ${ip} has ${remaining} attempts left for ${pathSuffix}`);

      if (env.TURNSTILE_SECRET_KEY) {
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
    return await auth.handler(request);
  } catch (error) {
    console.error('Auth error:', error);
    return json({ error: 'Auth error' }, 500);
  }
}

async function handleAuthExt(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(request.url);
  const op = url.searchParams.get('op');
  if (op !== 'link-credential') return json({ error: 'Unknown operation' }, 400);

  const auth = getOrCreateAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return json({ error: 'Unauthorized' }, 401);

  const requestData: { username: string; password: string } = await request.json();
  const { username, password } = requestData;
  if (!username || !password) return json({ error: 'Missing fields' }, 400);
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) return json({ error: 'Invalid username format' }, 400);

  const pwError = validatePassword(password);
  if (pwError) return json({ error: pwError }, 400);

  const db = env.ba_user;
  const existingUser = await db.prepare('SELECT id FROM user WHERE username = ?').bind(username).first<{ id: string }>();
  if (existingUser && existingUser.id !== session.user.id) return json({ error: 'Username already taken' }, 409);

  const existingCredential = await db.prepare("SELECT id FROM account WHERE userId = ? AND providerId = 'credential'").bind(session.user.id).first<{ id: string }>();
  if (existingCredential) return json({ error: 'Password login already set up' }, 409);

  const syntheticEmail = `${username}@users.internal`;
  const hashedPw = await hashPassword(password);
  const now = new Date().toISOString();

  try {
    await db
      .prepare('INSERT INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), session.user.id, syntheticEmail, 'credential', hashedPw, now, now)
      .run();
    await db.prepare('UPDATE user SET username = ?, email = ?, updatedAt = ? WHERE id = ?').bind(username, syntheticEmail, now, session.user.id).run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed')) return json({ error: 'Username already taken' }, 409);
    throw err;
  }

  return json({ ok: true });
}

async function handleGraphQL(request: Request, env: Env): Promise<Response> {
  try {
    const auth = getOrCreateAuth(env);
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    const userId = session?.user?.id ?? null;

    const newHeaders = new Headers(request.headers);
    newHeaders.delete('x-user-id');
    if (userId) newHeaders.set('x-user-id', userId);
    const modifiedRequest = new Request(request, { headers: newHeaders });

    const yogaResp = await getOrCreateYogaServer().fetch(modifiedRequest, { userDb: env.ba_user });
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

async function handleInternalSession(request: Request, env: Env): Promise<Response> {
  const auth = getOrCreateAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response(null, { status: 204 });

  const res = await env.ba_user.prepare('SELECT * FROM user_profiles WHERE user_id = ? ORDER BY sort_order').bind(session.user.id).all();
  let profiles = res.results ?? [];

  if (profiles.length === 0) {
    const profileId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const result = await env.ba_user
      .prepare(
        `INSERT INTO user_profiles (id, user_id, name, server, is_default, sort_order, created_at, updated_at)
         SELECT ?, ?, 'Default', 'jp', 1, 0, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = ?)`,
      )
      .bind(profileId, session.user.id, now, now, session.user.id)
      .run();

    if (result.meta.changes > 0) {
      profiles = [{ id: profileId, user_id: session.user.id, name: 'Default', server: 'jp', is_default: 1, sort_order: 0, created_at: now, updated_at: now }];
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/auth-ext') return handleAuthExt(request, env);
    if (pathname.startsWith('/api/auth')) return handleAuth(request, env);
    if (pathname === '/api/graphql') return handleGraphQL(request, env);
    if (pathname === '/__internal/session') return handleInternalSession(request, env);

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
