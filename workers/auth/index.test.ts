import { beforeEach, describe, expect, it, vi } from 'vitest';
import { domain, productionUrl } from '~/data/livedataServer.json';

const getSession = vi.fn<(args: { headers: Headers; query?: { disableCookieCache: boolean } }) => Promise<unknown>>();
const yogaFetch = vi.fn(() => Promise.resolve(new Response('{"data":{}}', { headers: { 'Content-Type': 'application/json' } })));

vi.mock('./auth', () => ({
  getOrCreateAuth: () => ({ api: { getSession }, handler: vi.fn() }),
  checkRateLimit: vi.fn(() => Promise.resolve({ allowed: true, remaining: 9 })),
  isSessionFresh: (createdAt: string | number | Date) => Date.now() - new Date(createdAt).getTime() < 600_000,
}));
vi.mock('./graphql', () => ({ getOrCreateYogaServer: () => ({ fetch: yogaFetch }) }));
vi.mock('better-auth/crypto', () => ({ hashPassword: vi.fn(() => Promise.resolve('hashed')) }));
vi.mock('../../app/utils/profileServer', () => ({ getDefaultProfileServer: vi.fn(), getSupportedProfileLocale: vi.fn() }));

import worker from './index';

interface Statement {
  sql: string;
  params: unknown[];
}

function createEnv(rows: { first?: (sql: string) => unknown; all?: unknown[] } = {}) {
  const statements: Statement[] = [];
  const ba_user = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => {
        statements.push({ sql, params });
        return {
          first: () => Promise.resolve(rows.first?.(sql) ?? null),
          all: () => Promise.resolve({ results: rows.all ?? [] }),
          run: () => Promise.resolve({ meta: { changes: 1 } }),
        };
      },
    }),
  };
  return { env: { ENVIRONMENT: 'production', ba_user } as unknown as Env, statements };
}

const origin = productionUrl;
const freshSession = { user: { id: 'u1' }, session: { id: 's1', createdAt: new Date().toISOString() } };
const staleSession = { user: { id: 'u1' }, session: { id: 's1', createdAt: new Date(Date.now() - 3_600_000).toISOString() } };

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  getSession.mockReset();
  yogaFetch.mockClear();
});

describe('POST /api/graphql', () => {
  it('rejects a cross-origin urlencoded request before any session lookup', async () => {
    const { env } = createEnv();
    const res = await worker.fetch(post('/api/graphql', 'query={me{id}}', { 'Content-Type': 'application/x-www-form-urlencoded', Origin: `https://cdn.${domain}` }), env);
    expect(res.status).toBe(403);
    expect(getSession).not.toHaveBeenCalled();
    expect(yogaFetch).not.toHaveBeenCalled();
  });

  it('rejects non-POST methods', async () => {
    const { env } = createEnv();
    const res = await worker.fetch(new Request(`${origin}/api/graphql?query={me{id}}`, { headers: { Origin: origin } }), env);
    expect(res.status).toBe(405);
  });

  it('bypasses the cookie cache for mutations only', async () => {
    getSession.mockResolvedValue(freshSession);
    const { env } = createEnv();
    await worker.fetch(post('/api/graphql', { query: 'mutation { deleteProfile(id: "x") }' }), env);
    expect(getSession.mock.calls[0][0]).toMatchObject({ query: { disableCookieCache: true } });

    getSession.mockClear();
    await worker.fetch(post('/api/graphql', { query: '{ me { id } }' }), env);
    expect(getSession.mock.calls[0][0]).not.toHaveProperty('query');
  });
});

describe('/api/auth-ext link-credential', () => {
  const body = { username: 'Alice_1', password: 'Str0ng-Passw0rd!x' };

  it('rejects text/plain from another origin without touching the session', async () => {
    const { env } = createEnv();
    const res = await worker.fetch(post('/api/auth-ext?op=link-credential', JSON.stringify(body), { 'Content-Type': 'text/plain', Origin: 'https://evil.test' }), env);
    expect(res.status).toBe(403);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('requires a fresh session', async () => {
    getSession.mockResolvedValue(staleSession);
    const { env } = createEnv();
    const res = await worker.fetch(post('/api/auth-ext?op=link-credential', body), env);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'SESSION_NOT_FRESH' });
  });

  it('treats usernames that differ only in case as taken and rejects the github_ prefix', async () => {
    getSession.mockResolvedValue(freshSession);
    const taken = createEnv({ first: (sql) => (sql.includes('lower(username)') ? { id: 'other' } : null) });
    expect((await worker.fetch(post('/api/auth-ext?op=link-credential', body), taken.env)).status).toBe(409);
    expect(taken.statements.find((s) => s.sql.includes('lower(username)'))?.params).toEqual(['alice_1']);

    const reserved = createEnv();
    expect((await worker.fetch(post('/api/auth-ext?op=link-credential', { ...body, username: 'GitHub_123' }), reserved.env)).status).toBe(400);
  });

  it('stores the lowercase username and keeps the typed form as displayUsername', async () => {
    getSession.mockResolvedValue(freshSession);
    const { env, statements } = createEnv();
    const res = await worker.fetch(post('/api/auth-ext?op=link-credential', body), env);
    expect(res.status).toBe(200);
    const update = statements.find((s) => s.sql.startsWith('UPDATE user'));
    expect(update?.params.slice(0, 3)).toEqual(['alice_1', 'Alice_1', 'alice_1@users.internal']);
  });
});

describe('/api/auth-ext list-sessions', () => {
  it('returns no token or IP and marks the current session', async () => {
    getSession.mockResolvedValue(staleSession);
    const { env } = createEnv({
      all: [
        { id: 's1', userAgent: 'UA1', createdAt: 'a', updatedAt: 'b', token: 'secret', ipAddress: '1.1.1.1' },
        { id: 's2', userAgent: 'UA2', createdAt: 'c', updatedAt: 'd' },
      ],
    });
    // Same-origin browser GETs send no Origin header.
    const res = await worker.fetch(new Request(`${origin}/api/auth-ext?op=list-sessions`, { headers: { 'Sec-Fetch-Site': 'same-origin' } }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const text = await res.text();
    expect(text).not.toMatch(/secret|1\.1\.1\.1|token|ipAddress/);
    const parsed = JSON.parse(text) as { sessions: Array<{ current: boolean }> };
    expect(parsed.sessions.map((entry) => entry.current)).toEqual([true, false]);
  });

  it('rejects other origins and anonymous callers', async () => {
    const { env } = createEnv();
    expect((await worker.fetch(new Request(`${origin}/api/auth-ext?op=list-sessions`, { headers: { Origin: 'https://evil.test' } }), env)).status).toBe(403);
    getSession.mockResolvedValue(null);
    expect((await worker.fetch(new Request(`${origin}/api/auth-ext?op=list-sessions`, { headers: { Origin: origin } }), env)).status).toBe(401);
  });
});
