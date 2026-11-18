// Exercise GraphQL sync against SQLite, including history writes and key limits.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDatabase } from './test/testDatabase';
import { productionUrl } from '~/data/livedataServer.json';
import { getOrCreateYogaServer } from './graphql';
import { MAX_KEYS_PER_PROFILE } from './profileDataLimits';

let database: ReturnType<typeof testDatabase>;
beforeEach(() => {
  database = testDatabase();
});
afterEach(() => {
  database.sqlite.close();
});

async function sync(db: Cloudflare.Env['ba_user'], changes: { key: string; value: unknown; baseRevision: number }[]) {
  const res = await getOrCreateYogaServer([productionUrl]).fetch(
    new Request(`${productionUrl}/api/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'u1' },
      body: JSON.stringify({
        query: 'mutation($changes:[SyncProfileDataChangeInput!]!){ syncProfileData(profileId:"p1", changes:$changes){ key status message } }',
        variables: { changes: changes.map((c) => ({ ...c, schemaVersion: 1 })) },
      }),
    }),
    { userDb: db },
  );
  const body = await res.json<{ data: { syncProfileData: { key: string; status: string; message: string | null }[] } }>();
  return body.data.syncProfileData;
}

describe('syncProfileData key limits', () => {
  it.each(['dark', '"dark"'])('reads legacy and JSON strings consistently: %s', async (stored) => {
    database.sqlite.prepare("INSERT INTO profile_data VALUES ('p1', 'theme', ?, 1, 1, 0)").run(stored);
    const response = await getOrCreateYogaServer([productionUrl]).fetch(
      new Request(`${productionUrl}/api/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'u1' },
        body: JSON.stringify({ query: '{ profileAllData(id:"p1") { key value } profile(id:"p1") { data { theme } } }' }),
      }),
      { userDb: database.db },
    );
    const body = await response.json<{ errors?: unknown[]; data: { profileAllData: { key: string; value: unknown }[]; profile: { data: Record<string, unknown> } } }>();
    expect(body.errors).toBeUndefined();
    expect(body.data.profileAllData).toEqual([{ key: 'theme', value: 'dark' }]);
    expect(body.data.profile.data.theme).toBe('dark');
  });

  it('rejects unregistered keys and applies registered ones', async () => {
    const { db, sqlite } = database;
    const results = await sync(db, [
      { key: 'aaa1', value: {}, baseRevision: 0 },
      { key: 'eventPlans:801', value: {}, baseRevision: 0 },
    ]);
    expect(results.map((r) => [r.key, r.status])).toEqual([
      ['aaa1', 'REJECTED'],
      ['eventPlans:801', 'APPLIED'],
    ]);
    expect(results[0].message).toMatch(/Unknown key/);
    expect(sqlite.prepare('SELECT key FROM profile_data').all()).toEqual([{ key: 'eventPlans:801' }]);
  });

  it('rejects a new key at the per-profile cap but still lets existing keys update', async () => {
    const { db, sqlite } = database;
    const seed = sqlite.prepare("INSERT INTO profile_data VALUES ('p1', ?, '{}', 1, 1, 0)");
    seed.run('growthPlans');
    for (let index = 1; index < MAX_KEYS_PER_PROFILE; index++) seed.run(`eventPlans:${1000 + index}`);
    const results = await sync(db, [
      { key: 'eventPlans:802', value: {}, baseRevision: 0 },
      { key: 'growthPlans', value: { growthPlans: [] }, baseRevision: 1 },
    ]);
    expect(results.map((r) => [r.key, r.status])).toEqual([
      ['eventPlans:802', 'REJECTED'],
      ['growthPlans', 'APPLIED'],
    ]);
    expect(sqlite.prepare('SELECT COUNT(*) count FROM profile_data').get()?.count).toBe(MAX_KEYS_PER_PROFILE);
    expect(sqlite.prepare("SELECT revision FROM profile_data WHERE key='growthPlans'").get()?.revision).toBe(2);
    expect(sqlite.prepare("SELECT key FROM profile_data WHERE key='eventPlans:802'").get()).toBeUndefined();
  });
});
