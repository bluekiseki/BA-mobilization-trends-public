import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from './auth';

vi.mock('better-auth', () => ({ betterAuth: vi.fn() }));
vi.mock('better-auth/api', () => ({ APIError: {}, createAuthMiddleware: vi.fn(), getSessionFromCtx: vi.fn() }));
vi.mock('better-auth/plugins', () => ({ magicLink: vi.fn(), username: vi.fn() }));
vi.mock('@better-auth/passkey', () => ({ passkey: vi.fn() }));

// Minimal D1 adapter over node:sqlite so the real SQL (including RETURNING) runs.
function createD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE rate_limit (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL DEFAULT 0, lastRequest INTEGER NOT NULL)');
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: (string | number)[]) => ({
        first: <T>() => Promise.resolve((sqlite.prepare(sql).get(...params) as T | undefined) ?? null),
      }),
    }),
  } as unknown as D1Database;
  return { db, sqlite };
}

describe('checkRateLimit', () => {
  it('allows maxCount attempts, then blocks', async () => {
    const { db } = createD1();
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await checkRateLimit(db, 'ip', '/x', 3)).allowed);
    expect(results).toEqual([true, true, true, false]);
  });

  it('keeps blocking without sliding the window, then resets after it expires', async () => {
    const { db, sqlite } = createD1();
    for (let i = 0; i < 5; i++) await checkRateLimit(db, 'ip', '/x', 3);
    const blockedAt = (sqlite.prepare('SELECT lastRequest FROM rate_limit').get() as { lastRequest: number }).lastRequest;
    await checkRateLimit(db, 'ip', '/x', 3);
    expect((sqlite.prepare('SELECT lastRequest FROM rate_limit').get() as { lastRequest: number }).lastRequest).toBe(blockedAt);

    sqlite.exec('UPDATE rate_limit SET lastRequest = lastRequest - 100000');
    expect((await checkRateLimit(db, 'ip', '/x', 3, 50_000)).allowed).toBe(true);
  });

  it('tracks keys independently', async () => {
    const { db } = createD1();
    for (let i = 0; i < 3; i++) await checkRateLimit(db, 'a', '/x', 2);
    expect((await checkRateLimit(db, 'b', '/x', 2)).allowed).toBe(true);
  });
});
