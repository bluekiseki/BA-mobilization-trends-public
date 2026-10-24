import { describe, expect, it } from 'vitest';
import { getKstTime } from '~/data/globalRaidDates';
import type { ArenaRecord } from '~/features/my/arena/types';
import { ARENA_CHUNK_MAX_CHARS, arenaHistorySyncKey, chunkRecords, groupBySeason, localChunkKey, localSeasonKeys, migrateLegacyStore, readSeason, writeSeason, type KeyValueStorage } from './storage';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

const record = (id: string, capturedAt: number, extra: Partial<ArenaRecord> = {}): ArenaRecord => ({
  id,
  capturedAt,
  savedAt: capturedAt,
  role: 'attack',
  won: true,
  me: { nickname: 'me', avatarId: null, m: [{ id: 1, damage: 10 }], s: [{ id: 2, damage: null }] },
  opponent: { nickname: 'NaCl', avatarId: 13003, m: [{ id: 3, damage: 20 }], s: [] },
  ...extra,
});

const GL_10 = getKstTime('2026-04-01 00:00:00');
const GL_11 = getKstTime('2026-10-01 00:00:00');
const ids = (records: ArenaRecord[]) => records.map((r) => r.id);
// Records per chunk number, read straight from storage.
const stored = (storage: ReturnType<typeof memoryStorage>, seasonKey: string) =>
  [...storage.data.entries()]
    .filter(([key]) => key.startsWith(`arena-history-v2:${seasonKey}:`))
    .map(([key, value]) => [Number(key.split(':').pop()), ids((JSON.parse(value) as { records: ArenaRecord[] }).records)] as const)
    .sort(([a], [b]) => a - b);
const charsOf = (records: ArenaRecord[]) => JSON.stringify({ records }).length;

describe('season storage', () => {
  it('uses one local key and one sync key per chunk', () => {
    expect(localChunkKey('gl-11', 2)).toBe('arena-history-v2:gl-11:2');
    expect(arenaHistorySyncKey('gl-11', 2)).toBe('arenaHistory:gl-11:2');
  });

  it('groups records by the season of their capture time', () => {
    const groups = groupBySeason([record('a', GL_10), record('b', GL_11), record('c', GL_11)], 'gl');
    expect([...groups.entries()].map(([key, rs]) => [key, ids(rs)])).toEqual([
      ['gl-10', ['a']],
      ['gl-11', ['b', 'c']],
    ]);
  });

  it('round-trips a season, drops an emptied one, and lists seasons per server newest first', () => {
    const storage = memoryStorage({ 'arena-history-v2:gl-9': '{"records":[]}' });
    writeSeason(storage, 'gl-10', [record('a', GL_10)]);
    writeSeason(storage, 'gl-11', [record('b', GL_11)]);
    writeSeason(storage, 'jp-11', [record('c', GL_11)]);
    expect(ids(readSeason(storage, 'gl-10'))).toEqual(['a']);
    // The bare pre-chunk key is not a season.
    expect(localSeasonKeys(storage, 'gl')).toEqual(['gl-11', 'gl-10']);
    writeSeason(storage, 'gl-10', []);
    expect(stored(storage, 'gl-10')).toEqual([]);
  });
});

describe('chunks', () => {
  // A budget of three records per chunk.
  const max = charsOf([record('a', GL_11), record('b', GL_11), record('c', GL_11)]);
  const season = (n: number) => Array.from({ length: n }, (_, i) => record(String.fromCharCode(97 + i), GL_11));

  it('continues in the next chunk once the last one would pass the size budget', () => {
    expect([...chunkRecords({ chunks: new Map(), last: -1 }, season(7), max)].map(([n, rs]) => [n, ids(rs)])).toEqual([
      [0, ['a', 'b', 'c']],
      [1, ['d', 'e', 'f']],
      [2, ['g']],
    ]);
  });

  it('keeps stored records in their chunk and appends new ones to the last chunk', () => {
    const current = {
      chunks: new Map([
        [0, season(3)],
        [1, [record('d', GL_11)]],
      ]),
      last: 1,
    };
    const next = [record('z', GL_11), ...season(4)];
    expect([...chunkRecords(current, next, max)].map(([n, rs]) => [n, ids(rs)])).toEqual([
      [0, ['a', 'b', 'c']],
      [1, ['d', 'z']],
    ]);
  });

  it('removes deleted records only from their own chunk, without shifting numbers', () => {
    const current = {
      chunks: new Map([
        [0, season(3)],
        [1, [record('d', GL_11)]],
      ]),
      last: 1,
    };
    expect([...chunkRecords(current, [record('d', GL_11)], max)].map(([n, rs]) => [n, ids(rs)])).toEqual([
      [0, []],
      [1, ['d']],
    ]);
  });

  it('never appends to a broken last chunk', () => {
    const current = { chunks: new Map([[0, season(1)]]), last: 1 };
    expect([...chunkRecords(current, [...season(1), record('n', GL_11)], max)].map(([n, rs]) => [n, ids(rs)])).toEqual([
      [0, ['a']],
      [2, ['n']],
    ]);
  });

  it('rewrites only the chunk that changed', () => {
    const storage = memoryStorage();
    const writes: string[] = [];
    const setItem = storage.setItem;
    storage.setItem = (key, value) => {
      writes.push(key);
      setItem(key, value);
    };
    // Real budget: fill chunk 0 past 900k characters, then add one record.
    const big = Array.from({ length: Math.ceil(ARENA_CHUNK_MAX_CHARS / JSON.stringify(record('x', GL_11)).length) + 5 }, (_, i) => record(`r${i}`, GL_11));
    writeSeason(storage, 'gl-11', big);
    expect(stored(storage, 'gl-11').map(([n]) => n)).toEqual([0, 1]);
    for (const value of storage.data.values()) expect(value.length).toBeLessThanOrEqual(ARENA_CHUNK_MAX_CHARS);
    writes.length = 0;
    writeSeason(storage, 'gl-11', [...big, record('new', GL_11)]);
    expect(writes).toEqual(['arena-history-v2:gl-11:1']);
    expect(readSeason(storage, 'gl-11')).toHaveLength(big.length + 1);
  });

  it('skips a broken chunk on read and rebuilds from chunk 0 on import', () => {
    const storage = memoryStorage({
      'arena-history-v2:gl-11:0': JSON.stringify({ records: [record('a', GL_11)] }),
      'arena-history-v2:gl-11:1': '{"records":[{"id":1}]}',
      'arena-history-v2:gl-11:2': JSON.stringify({ records: [record('c', GL_11)] }),
    });
    expect(ids(readSeason(storage, 'gl-11'))).toEqual(['a', 'c']);
    writeSeason(storage, 'gl-11', [record('x', GL_11)], true);
    expect(stored(storage, 'gl-11')).toEqual([[0, ['x']]]);
  });
});

describe('migrateLegacyStore', () => {
  const legacy = (id: string, capturedAt: number) => ({
    id,
    savedAt: capturedAt,
    capturedAt,
    myRole: 'defense',
    won: false,
    me: {
      nickname: 'me',
      avatarId: null,
      team: [
        { id: 1, role: 'striker', damage: 10 },
        { id: 2, role: 'special', damage: null },
      ],
    },
    opponent: { nickname: '', avatarId: 13003, team: [{ id: 3, role: 'striker', damage: 20 }] },
    opponentNicknameImage: 'data:image/webp;base64,AA',
  });

  it('converts to the current format, splits by season, and removes the old store', () => {
    const storage = memoryStorage({ 'arena-history-v1': JSON.stringify({ state: { records: [legacy('a', GL_10), legacy('b', GL_11), { broken: true }] }, version: 0 }) });
    expect(migrateLegacyStore(storage, 'gl')).toBe(2);
    expect(storage.data.has('arena-history-v1')).toBe(false);
    expect(readSeason(storage, 'gl-10')).toEqual([
      {
        id: 'a',
        capturedAt: GL_10,
        savedAt: GL_10,
        role: 'defense',
        won: false,
        me: { nickname: 'me', avatarId: null, m: [{ id: 1, damage: 10 }], s: [{ id: 2, damage: null }] },
        opponent: { nickname: '', avatarId: 13003, m: [{ id: 3, damage: 20 }], s: [] },
      },
    ]);
    expect(ids(readSeason(storage, 'gl-11'))).toEqual(['b']);
  });

  it('does not duplicate records already in a season', () => {
    const storage = memoryStorage({ 'arena-history-v1': JSON.stringify({ state: { records: [legacy('a', GL_11)] } }) });
    writeSeason(storage, 'gl-11', [record('a', GL_11)]);
    migrateLegacyStore(storage, 'gl');
    expect(readSeason(storage, 'gl-11')).toHaveLength(1);
  });
});
