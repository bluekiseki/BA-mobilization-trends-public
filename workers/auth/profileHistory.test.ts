import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { historyList, historyValues, writeWithHistory } from './profileHistory';
import { testDatabase } from './test/testDatabase';
import { profileHistoryFingerprint } from '../../app/utils/profileHistoryFingerprint';

let database: ReturnType<typeof testDatabase>;
beforeEach(() => {
  database = testDatabase();
});
afterEach(() => {
  database.sqlite.close();
  vi.restoreAllMocks();
});
const write = (value: string, baseRevision: number) => writeWithHistory(database.db, 'p1', [{ key: 'theme', value, baseRevision, schemaVersion: 1 }]);

describe('server profile history', () => {
  it('isolates history capacity and deletion from other profiles', async () => {
    database.sqlite.function('length', (value) => (value instanceof Uint8Array && new TextDecoder().decode(value) === 'other-profile-large-value' ? 101 * 1024 * 1024 : String(value ?? '').length));
    database.sqlite.prepare("INSERT INTO profile_history VALUES ('p2', 1, '', ?, 1), ('p2', 1, 'theme', 'other-profile-large-value', 1)").run('{"closed":true}');
    await write('dark', 0);
    expect((await historyList(database.db, 'p1'))[0].disabled).not.toBe(true);
    expect(database.sqlite.prepare("SELECT COUNT(*) count FROM profile_history WHERE profile_id='p2'").get()?.count).toBe(2);
  });

  it('prunes oversized existing history without disabling new history', async () => {
    database.sqlite.function('length', (value) => (value instanceof Uint8Array && new TextDecoder().decode(value) === '"old-history"' ? 101 * 1024 * 1024 : String(value ?? '').length));
    database.sqlite.prepare("INSERT INTO profile_history VALUES ('p1', 1, '', ?, 1), ('p1', 1, 'theme', ?, 1)").run('{"closed":true}', '"old-history"');
    await write('dark', 0);
    const points = await historyList(database.db, 'p1');
    expect(points).toHaveLength(1);
    expect(points[0].disabled).not.toBe(true);
    expect((await historyValues(database.db, 'p1', points[0].recordedAt))[0].value).toBe('dark');
  });

  it('does not increment legacy plain-text revisions or break their restoration', async () => {
    database.sqlite.prepare("INSERT INTO profile_data VALUES ('p1', 'theme', 'dark', 1, 7, 1)").run();
    expect((await write('dark', 7)).results[0].revision).toBe(7);
    expect((await write('dark', 7)).results[0].revision).toBe(7);
    await write('light', 7);
    const points = await historyList(database.db, 'p1');
    expect((await historyValues(database.db, 'p1', points[1].recordedAt))[0].value).toBe('dark');
    expect((await historyValues(database.db, 'p1', points[0].recordedAt))[0].value).toBe('light');
  });

  it('ends the merge window 30 minutes after the first edit', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await write('dark', 0);
    now.mockReturnValue(1_000_000 + 29 * 60_000);
    await write('light', 1);
    now.mockReturnValue(1_000_000 + 58 * 60_000);
    await write('system', 2);
    const points = await historyList(database.db, 'p1');
    expect(points).toHaveLength(3);
    expect((await historyValues(database.db, 'p1', points[1].recordedAt))[0].value).toBe('light');
  });

  it('uses two standalone reads for an ordinary write and skips unnecessary pruning', async () => {
    await write('dark', 0);
    // The third SELECT is the atomic batch guard, needed to reject concurrent writes.
    expect(database.reads).toHaveLength(3);
    expect(database.reads.filter((sql) => sql.includes('SUM('))).toHaveLength(1);
    expect(database.reads.filter((sql) => sql.includes('SUM('))[0]).toContain('WHERE profile_id = ?');
  });

  it('includes long restoration metadata when deciding whether to prune', async () => {
    database.sqlite.function('length', (value) => (value instanceof Uint8Array && new TextDecoder().decode(value) === '"dark"' ? 5 * 1024 * 1024 - 1500 : String(value ?? '').length));
    database.sqlite.prepare("INSERT INTO profile_history VALUES ('p1', 1, '', ?, 1), ('p1', 1, 'theme', ?, 1)").run('{"closed":true}', '"dark"');
    database.sqlite.prepare("INSERT INTO profile_data VALUES ('p1', 'theme', ?, 1, 1, 0)").run('"light"');
    const source = await historyValues(database.db, 'p1', 1);
    await writeWithHistory(database.db, 'p1', [{ key: 'theme', value: 'dark', baseRevision: 1, schemaVersion: 1 }], {
      before: 1,
      sourceAt: 1,
      keys: ['theme'],
      requestId: 'r'.repeat(2000),
      fingerprint: await profileHistoryFingerprint(source),
    });
    expect(await historyList(database.db, 'p1')).toHaveLength(1);
  });

  it('restores a saved state once and retains the state before restoration', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const original = await write('dark', 0);
    now.mockReturnValue(1_000_000 + 31 * 60_000);
    const latest = await write('light', 1);
    if (original.recordedAt === null || latest.recordedAt === null) throw new Error('Missing saved history');
    const restore = {
      before: latest.recordedAt,
      keys: ['theme'],
      requestId: 'restore-1',
      sourceAt: original.recordedAt,
      fingerprint: await profileHistoryFingerprint(await historyValues(database.db, 'p1', original.recordedAt)),
    };
    const changes = [{ key: 'theme', value: 'dark', baseRevision: 2, schemaVersion: 1 }];
    const restored = await writeWithHistory(database.db, 'p1', changes, restore);
    const repeated = await writeWithHistory(database.db, 'p1', changes, restore);
    expect(repeated.recordedAt).toBe(restored.recordedAt);
    expect(repeated.results).toEqual([]);
    expect(database.sqlite.prepare("SELECT value, revision FROM profile_data WHERE profile_id='p1' AND key='theme'").get()).toEqual({ value: '"dark"', revision: 3 });
    expect((await historyValues(database.db, 'p1', latest.recordedAt))[0].value).toBe('light');
  });
});
