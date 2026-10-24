// Per-season storage of Tactical Challenge records. A season is a list of chunks `{ records }`, each kept under its own key
// and exactly a future sync row value (`arenaHistory:<seasonKey>:<n>`), so only the viewed season is ever loaded.
// A season of ~1,800 records outgrows one 1 MB sync row, so records continue in the next chunk once the last one is full.
// Records stay in the chunk they were first written to: adding a record rewrites only the last chunk, so sync later
// re-uploads only what changed. Chunk numbers are never reused or shifted.
// Sync is not connected yet: loadSeason/saveSeason are the seam where server row reads/pushes go later.
import type { ArenaRecord, ArenaSide } from '~/features/my/arena/types';
import { arenaBucketSchema, legacyArenaRecordSchema, type LegacyArenaRecord } from './schema';
import { parseSeasonKey, seasonKeyFor, type ArenaServer } from './seasons';

const LOCAL_PREFIX = 'arena-history-v2:';
const LEGACY_KEY = 'arena-history-v1';
// Chunk size cap, measured like the server's per-key limit (JSON.stringify length ≤ 1,000,000) with ~10% headroom.
export const ARENA_CHUNK_MAX_CHARS = 900_000;

export const localChunkKey = (seasonKey: string, chunk: number) => `${LOCAL_PREFIX}${seasonKey}:${chunk}`;
export const arenaHistorySyncKey = (seasonKey: string, chunk: number) => `arenaHistory:${seasonKey}:${chunk}`;

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

const browserStorage = (): KeyValueStorage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

// `arena-history-v2:<seasonKey>:<n>` → { seasonKey, chunk }. Keys without a chunk number (pre-chunk development data) are ignored.
function parseLocalKey(key: string): { seasonKey: string; chunk: number } | null {
  if (!key.startsWith(LOCAL_PREFIX)) return null;
  const match = /^(.+):(\d+)$/.exec(key.slice(LOCAL_PREFIX.length));
  return match ? { seasonKey: match[1], chunk: Number(match[2]) } : null;
}

function storageKeys(storage: KeyValueStorage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  return keys;
}

const chunkNumbers = (storage: KeyValueStorage, seasonKey: string): number[] =>
  storageKeys(storage)
    .flatMap((key) => {
      const parsed = parseLocalKey(key);
      return parsed?.seasonKey === seasonKey ? [parsed.chunk] : [];
    })
    .sort((a, b) => a - b);

function readChunk(storage: KeyValueStorage, seasonKey: string, chunk: number): ArenaRecord[] | null {
  try {
    const raw = storage.getItem(localChunkKey(seasonKey, chunk));
    if (raw === null) return null;
    const parsed = arenaBucketSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.records : null;
  } catch {
    return null;
  }
}

export interface SeasonChunks {
  // Readable chunks by number.
  chunks: Map<number, ArenaRecord[]>;
  // Highest chunk number present, readable or not (-1 when the season has none).
  last: number;
}

// A broken chunk is skipped on its own; the rest of the season still loads.
export function readSeasonChunks(storage: KeyValueStorage, seasonKey: string): SeasonChunks {
  const chunks = new Map<number, ArenaRecord[]>();
  let last = -1;
  for (const chunk of chunkNumbers(storage, seasonKey)) {
    last = Math.max(last, chunk);
    const records = readChunk(storage, seasonKey, chunk);
    if (records) chunks.set(chunk, records);
  }
  return { chunks, last };
}

export const readSeason = (storage: KeyValueStorage, seasonKey: string): ArenaRecord[] =>
  [...readSeasonChunks(storage, seasonKey).chunks.entries()].sort(([a], [b]) => a - b).flatMap(([, records]) => records);

const chunkChars = (records: ArenaRecord[]) => JSON.stringify({ records }).length;

// Places `next` (the whole season) into chunks: records already stored keep their chunk (updated in place), new ones
// are appended to the last chunk and roll over to a new chunk once it would pass `maxChars`. A broken last chunk is
// never appended to, so its number is not reused.
export function chunkRecords(current: SeasonChunks, next: ArenaRecord[], maxChars = ARENA_CHUNK_MAX_CHARS): Map<number, ArenaRecord[]> {
  const byId = new Map(next.map((record) => [record.id, record]));
  const placed = new Set<string>();
  const result = new Map<number, ArenaRecord[]>();
  for (const [chunk, records] of [...current.chunks.entries()].sort(([a], [b]) => a - b)) {
    const kept = records.flatMap((record) => {
      const updated = byId.get(record.id);
      if (!updated || placed.has(record.id)) return [];
      placed.add(record.id);
      return [updated];
    });
    result.set(chunk, kept);
  }
  const fresh = next.filter((record) => !placed.has(record.id));
  if (!fresh.length) return result;
  let chunk = current.chunks.has(current.last) ? current.last : current.last + 1;
  let records = result.get(chunk) ?? [];
  let chars = chunkChars(records);
  for (const record of fresh) {
    const size = JSON.stringify(record).length;
    // +1 for the separating comma once the array is non-empty.
    if (records.length && chars + size + 1 > maxChars) {
      result.set(chunk, records);
      chunk += 1;
      records = [];
      chars = chunkChars(records);
    }
    chars += size + (records.length ? 1 : 0);
    records.push(record);
  }
  result.set(chunk, records);
  return result;
}

// Writes the season, rewriting only chunks whose content changed. `rebuild` (JSON import) drops the old chunks and
// starts again from chunk 0. A season left with no records loses all its chunks.
export function writeSeason(storage: KeyValueStorage, seasonKey: string, records: ArenaRecord[], rebuild = false): void {
  try {
    // Pre-chunk development data under the bare season key.
    storage.removeItem(`${LOCAL_PREFIX}${seasonKey}`);
    if (rebuild || records.length === 0) {
      for (const chunk of chunkNumbers(storage, seasonKey)) storage.removeItem(localChunkKey(seasonKey, chunk));
      if (records.length === 0) return;
    }
    const current = rebuild ? { chunks: new Map<number, ArenaRecord[]>(), last: -1 } : readSeasonChunks(storage, seasonKey);
    for (const [chunk, chunkContent] of chunkRecords(current, records)) {
      const key = localChunkKey(seasonKey, chunk);
      const value = JSON.stringify({ records: chunkContent });
      if (storage.getItem(key) !== value) storage.setItem(key, value);
    }
  } catch (error) {
    console.error('Failed to save Tactical Challenge records:', error);
  }
}

// Seasons of one server that have local records, newest first.
export function localSeasonKeys(storage: KeyValueStorage, server: ArenaServer): string[] {
  const keys = new Set<string>();
  for (const key of storageKeys(storage)) {
    const parsed = parseLocalKey(key);
    if (parsed && parseSeasonKey(parsed.seasonKey)?.server === server) keys.add(parsed.seasonKey);
  }
  return [...keys].sort((a, b) => (parseSeasonKey(b)?.season ?? 0) - (parseSeasonKey(a)?.season ?? 0));
}

// Promise-returning so server row reads/pushes can be added here without changing callers.
export function loadSeason(seasonKey: string): Promise<ArenaRecord[]> {
  const storage = browserStorage();
  return Promise.resolve(storage ? readSeason(storage, seasonKey) : []);
}

export function saveSeason(seasonKey: string, records: ArenaRecord[], rebuild = false): Promise<void> {
  const storage = browserStorage();
  if (storage) writeSeason(storage, seasonKey, records, rebuild);
  return Promise.resolve();
}

export const listLocalSeasonKeys = (server: ArenaServer): string[] => {
  const storage = browserStorage();
  return storage ? localSeasonKeys(storage, server) : [];
};

// Split records into season buckets by capture time.
export function groupBySeason(records: ArenaRecord[], server: ArenaServer): Map<string, ArenaRecord[]> {
  const groups = new Map<string, ArenaRecord[]>();
  for (const record of records) {
    const key = seasonKeyFor(server, record.capturedAt);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return groups;
}

const fromLegacySide = (side: LegacyArenaRecord['me']): ArenaSide => ({
  nickname: side.nickname,
  avatarId: side.avatarId,
  m: side.team.filter((s) => s.role === 'striker').map((s) => ({ id: s.id, damage: s.damage })),
  s: side.team.filter((s) => s.role === 'special').map((s) => ({ id: s.id, damage: s.damage })),
});

export function fromLegacyRecord(record: LegacyArenaRecord): ArenaRecord {
  return {
    id: record.id,
    capturedAt: record.capturedAt,
    savedAt: record.savedAt,
    role: record.myRole,
    won: record.won,
    me: fromLegacySide(record.me),
    opponent: fromLegacySide(record.opponent),
  };
}

// One-time move of the pre-season store (zustand persist `{ state: { records } }`) into season buckets of `server`.
export function migrateLegacyStore(storage: KeyValueStorage, server: ArenaServer): number {
  let raw: string | null;
  try {
    raw = storage.getItem(LEGACY_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;
  let legacy: unknown[] = [];
  try {
    const parsed = JSON.parse(raw) as { state?: { records?: unknown } };
    if (Array.isArray(parsed.state?.records)) legacy = parsed.state.records;
  } catch {
    // Unreadable: drop it below rather than retrying on every load.
  }
  const records = legacy.flatMap((item) => {
    const parsed = legacyArenaRecordSchema.safeParse(item);
    return parsed.success ? [fromLegacyRecord(parsed.data)] : [];
  });
  for (const [key, group] of groupBySeason(records, server)) {
    const existing = readSeason(storage, key);
    const ids = new Set(existing.map((r) => r.id));
    writeSeason(storage, key, [...existing, ...group.filter((r) => !ids.has(r.id))]);
  }
  try {
    storage.removeItem(LEGACY_KEY);
  } catch {
    // Ignore: the next load migrates again and skips duplicates by id.
  }
  return records.length;
}

export function migrateLegacyArenaHistory(server: ArenaServer): void {
  const storage = browserStorage();
  if (storage) migrateLegacyStore(storage, server);
}
