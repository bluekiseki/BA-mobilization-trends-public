// syncProfileData end to end through the GraphQL server, with a fake D1 that answers by SQL text.
import { describe, expect, it } from 'vitest';
import { productionUrl } from '~/data/livedataServer.json';
import { getOrCreateYogaServer } from './graphql';
import { MAX_KEYS_PER_PROFILE } from './profileDataLimits';

function fakeDb(existingKeys: string[], keyCount: number) {
  const inserted: string[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        first: () => {
          if (sql.includes('FROM user_profiles')) return Promise.resolve({ user_id: 'u1' });
          if (sql.includes('COUNT(*)')) return Promise.resolve({ c: keyCount + inserted.length });
          if (sql.includes('FROM profile_data')) return Promise.resolve(existingKeys.includes(params[1] as string) ? { value: '{}', schema_version: 1, revision: 1, updated_at: 0 } : null);
          return Promise.resolve(null);
        },
        run: () => {
          if (sql.startsWith('INSERT')) inserted.push(params[1] as string);
          return Promise.resolve({ meta: { changes: 1 } });
        },
        all: () => Promise.resolve({ results: [] }),
      }),
    }),
  };
  return { db, inserted };
}

async function sync(db: ReturnType<typeof fakeDb>['db'], changes: { key: string; value: unknown; baseRevision: number }[]) {
  const res = await getOrCreateYogaServer([productionUrl]).fetch(
    new Request(`${productionUrl}/api/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'u1' },
      body: JSON.stringify({
        query: 'mutation($changes:[SyncProfileDataChangeInput!]!){ syncProfileData(profileId:"p1", changes:$changes){ key status message } }',
        variables: { changes: changes.map((c) => ({ ...c, schemaVersion: 1 })) },
      }),
    }),
    { userDb: db as unknown as Cloudflare.Env['ba_user'] },
  );
  const body = await res.json<{ data: { syncProfileData: { key: string; status: string; message: string | null }[] } }>();
  return body.data.syncProfileData;
}

describe('syncProfileData key limits', () => {
  it('rejects unregistered keys and applies registered ones', async () => {
    const { db, inserted } = fakeDb([], 0);
    const results = await sync(db, [
      { key: 'aaa1', value: {}, baseRevision: 0 },
      { key: 'eventPlans:801', value: {}, baseRevision: 0 },
    ]);
    expect(results.map((r) => [r.key, r.status])).toEqual([
      ['aaa1', 'REJECTED'],
      ['eventPlans:801', 'APPLIED'],
    ]);
    expect(results[0].message).toMatch(/Unknown key/);
    expect(inserted).toEqual(['eventPlans:801']);
  });

  it('rejects a new key at the per-profile cap but still lets existing keys update', async () => {
    const { db, inserted } = fakeDb(['growthPlans'], MAX_KEYS_PER_PROFILE);
    const results = await sync(db, [
      { key: 'eventPlans:802', value: {}, baseRevision: 0 },
      { key: 'growthPlans', value: { growthPlans: [] }, baseRevision: 1 },
    ]);
    expect(results.map((r) => [r.key, r.status])).toEqual([
      ['eventPlans:802', 'REJECTED'],
      ['growthPlans', 'APPLIED'],
    ]);
    expect(inserted).toEqual([]);
  });
});
