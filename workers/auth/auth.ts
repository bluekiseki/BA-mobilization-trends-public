import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { magicLink, username } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { validatePassword } from './password-validate';
import { getMagicLinkEmail, getVerifyEmailTemplate } from './emailTemplates';
import { localUrl, productionUrl, localAuthUrl, authEmail } from '~/data/livedataServer.json';

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
    trustedOrigins: [localUrl, localAuthUrl, productionUrl],
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
    // Account linking: allow linking GitHub (which has different email from username's synthetic email)
    // Previously set skipStateCookieCheck: true as a workaround for suspected SameSite=Lax cookie loss on OAuth callback,
    // but confirmed unnecessary.
    account: {
      accountLinking: {
        enabled: true,
        allowDifferentEmails: true,
        trustedProviders: ['github', 'credential'],
      },
      skipStateCookieCheck: false,
    },
    hooks: {
      // eslint-disable-next-line @typescript-eslint/require-await
      before: createAuthMiddleware(async (ctx) => {
        const path = ctx.path ?? '';
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
      // Email magic link (primary recommended method)
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

  const row = await db.prepare('SELECT count, lastRequest FROM rate_limit WHERE key = ?').bind(key).first<{ count: number; lastRequest: number }>();

  if (!row || row.lastRequest < windowStart) {
    await db
      .prepare('INSERT INTO rate_limit (id, key, count, lastRequest) VALUES (?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET count=1, lastRequest=excluded.lastRequest')
      .bind(crypto.randomUUID(), key, now)
      .run();
    return { allowed: true, remaining: maxCount - 1 };
  }

  if (row.count >= maxCount) {
    return { allowed: false, remaining: 0 };
  }

  await db.prepare('UPDATE rate_limit SET count = count + 1, lastRequest = ? WHERE key = ?').bind(now, key).run();

  return { allowed: true, remaining: maxCount - row.count - 1 };
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
