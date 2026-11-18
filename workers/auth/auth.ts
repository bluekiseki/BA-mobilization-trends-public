import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { magicLink, username } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { validatePassword } from './password-validate';
import { getMagicLinkEmail, getVerifyEmailTemplate } from './emailTemplates';
import { localUrl, productionUrl, localAuthUrl, authEmail, magicLinkLogin } from '~/data/livedataServer.json';

// Account-level actions (passkey add/remove, password link, unlink, delete) require a login newer than this.
export const SESSION_FRESH_AGE_SECONDS = 600;

export function isSessionFresh(createdAt: Date | string | number, now = Date.now()): boolean {
  return now - new Date(createdAt).getTime() < SESSION_FRESH_AGE_SECONDS * 1000;
}

let authInstance: ReturnType<typeof createAuthInstance> | null = null;
let authDb: D1Database | null = null;

function extractLocaleFromCallbackUrl(url: string): string | undefined {
  try {
    const callbackUrl = new URL(url).searchParams.get('callbackURL');
    if (!callbackUrl) return undefined;
    const first = callbackUrl.split('/').filter(Boolean)[0];
    return first && ['ko', 'ja', 'zh-Hant'].includes(first) ? first : undefined;
  } catch {
    return undefined;
  }
}

export const getOrCreateAuth = (env: Env) => {
  if (!authInstance || authDb !== env.ba_user) {
    authInstance = createAuthInstance(env);
    authDb = env.ba_user;
  }
  return authInstance;
};

export const createAuthInstance = (env: Env) => {
  const isProd = env.ENVIRONMENT === 'production';
  const baseUrl = isProd ? productionUrl : localUrl;

  if (!env.AUTH_SECRET) throw new Error('AUTH_SECRET is required');

  return betterAuth({
    database: env.ba_user,
    appName: 'Yuzu Trends',
    baseURL: baseUrl,
    basePath: '/api/auth',
    secret: env.AUTH_SECRET || 'dev-secret-key-32-chars-minimum-for-dev-only-change-prod',
    trustedOrigins: isProd ? [productionUrl] : [localUrl, localAuthUrl],
    // emailAndPassword must be enabled so /sign-up/email exists for the username plugin hook
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    user: {
      changeEmail: {
        enabled: true,
      },
      deleteUser: {
        enabled: true,
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
        if (!isProd) console.log(`[Email Verification] To: ${user.email}, URL: ${url}`);
        if (env.RESEND_API_KEY) {
          const locale = extractLocaleFromCallbackUrl(url);
          const { subject, html } = getVerifyEmailTemplate(url, locale);
          await sendEmailViaResend({ apiKey: env.RESEND_API_KEY, to: user.email, subject, html });
        }
      },
    },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID || '',
        clientSecret: env.GITHUB_CLIENT_SECRET || '',
        redirectURI: `${baseUrl}/api/auth/callback/github`,
        disableDefaultScope: true,
        scope: [],
        mapProfileToUser: (profile: { id: string; login?: string; email?: string | null }) => ({
          email: profile.email ?? `github_${profile.id}@users.internal`,
          emailVerified: !!profile.email,
        }),
      },
    },
    // GitHub accounts may use a different email from the synthetic username-login address.
    account: {
      accountLinking: {
        enabled: true,
        allowDifferentEmails: true,
        trustedProviders: ['github', 'credential'],
      },
      skipStateCookieCheck: false,
    },
    session: {
      freshAge: SESSION_FRESH_AGE_SECONDS,
      // Serve session/user from a signed short-lived cookie to avoid a D1 read on every request.
      // Session revocation from other devices/admin lags by at most maxAge; same-client sign-out
      // and user updates refresh/clear this cookie immediately.
      cookieCache: {
        enabled: true,
        maxAge: 300, // seconds
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const path = ctx.path ?? '';
        // Passkey delete/rename have no freshness check in the plugin; require a recent login and a live DB session.
        if (path === '/passkey/delete-passkey' || path === '/passkey/update-passkey') {
          const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
          if (!session?.session) throw APIError.from('UNAUTHORIZED', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
          if (!isSessionFresh(session.session.createdAt)) throw APIError.from('FORBIDDEN', { message: 'Session is not fresh', code: 'SESSION_NOT_FRESH' });
        }
        if (path === '/sign-up/email' || path === '/change-password') {
          try {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            const pw = body.newPassword ?? body.password;
            if (typeof pw === 'string') {
              const err = validatePassword(pw);
              if (err) {
                return new Response(JSON.stringify({ message: err }), {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' },
                });
              }
            }
          } catch {
            /* Pass through to let better-auth handle it upon parsing failure */
          }
        }
      }),
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 20,
        usernameValidator: (value: string) => /^[a-zA-Z0-9_-]+$/.test(value),
      }),
      // Email magic link (primary recommended method), gated by magicLinkLogin flag
      ...(magicLinkLogin
        ? [
            magicLink({
              sendMagicLink: async ({ email, url, metadata }) => {
                if (!isProd) console.log(`[Magic Link] To: ${email}, URL: ${url}`);
                if (env.RESEND_API_KEY) {
                  const locale = typeof metadata?.locale === 'string' ? metadata.locale : undefined;
                  const { subject, html } = getMagicLinkEmail(url, locale);
                  await sendEmailViaResend({ apiKey: env.RESEND_API_KEY, to: email, subject, html });
                }
              },
              expiresIn: 600,
            }),
          ]
        : []),
      // Passkey / WebAuthn (registered after account creation)
      passkey({
        rpName: 'Yuzu Trends',
        rpID: isProd ? 'yuzutrends.app' : 'localhost',
        origin: baseUrl,
      }),
    ],
  });
};

// D1-backed rate limiting (5 attempts per 24h per IP)
export async function checkRateLimit(db: D1Database, ip: string, endpoint: string, maxCount = 5, windowMs = 86_400_000): Promise<{ allowed: boolean; remaining: number }> {
  const key = `${ip}:${endpoint}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  // Single atomic statement: reset the window if it expired, otherwise increment, and read back the new count.
  // The count stops at maxCount + 1 (the "blocked" marker) and a blocked call does not slide the window,
  // so a block expires on schedule even while the client keeps retrying.
  const row = await db
    .prepare(
      `INSERT INTO rate_limit (id, key, count, lastRequest) VALUES (?1, ?2, 1, ?3)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limit.lastRequest < ?4 THEN 1 WHEN rate_limit.count > ?5 THEN rate_limit.count ELSE rate_limit.count + 1 END,
         lastRequest = CASE WHEN rate_limit.lastRequest >= ?4 AND rate_limit.count > ?5 THEN rate_limit.lastRequest ELSE excluded.lastRequest END
       RETURNING count`,
    )
    .bind(crypto.randomUUID(), key, now, windowStart, maxCount)
    .first<{ count: number }>();

  const count = row?.count ?? 1;
  return { allowed: count <= maxCount, remaining: Math.max(0, maxCount - count) };
}

async function sendEmailViaResend({ apiKey, to, subject, html }: { apiKey: string; to: string; subject: string; html: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Yuzu Trends <${authEmail}>`,
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    console.error(`[Resend] Failed ${res.status}: ${body}`);
    throw new Error(`Email delivery failed (${res.status})`);
  }
}
