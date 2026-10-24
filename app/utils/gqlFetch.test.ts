import { afterEach, describe, expect, it, vi } from 'vitest';
import { gqlFetch } from './gqlFetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(body: string, status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(body, { status, headers: { 'Content-Type': 'application/json' } }))),
  );
}

describe('gqlFetch', () => {
  it('returns data on success', async () => {
    stubFetch(JSON.stringify({ data: { ok: 1 } }), 200);
    await expect(gqlFetch('query { ok }')).resolves.toEqual({ ok: 1 });
  });

  it('throws the GraphQL error message', async () => {
    stubFetch(JSON.stringify({ errors: [{ message: 'boom' }] }), 200);
    await expect(gqlFetch('query { ok }')).rejects.toThrow('boom');
  });

  it('throws on a non-2xx response without GraphQL errors instead of returning undefined data', async () => {
    stubFetch(JSON.stringify({ error: 'Authentication is temporarily unavailable for maintenance.' }), 503);
    await expect(gqlFetch('query { ok }')).rejects.toThrow('temporarily unavailable');
  });

  it('throws with the HTTP status for a non-JSON error body', async () => {
    stubFetch('<html>bad gateway</html>', 502);
    await expect(gqlFetch('query { ok }')).rejects.toThrow('HTTP 502');
  });
});
