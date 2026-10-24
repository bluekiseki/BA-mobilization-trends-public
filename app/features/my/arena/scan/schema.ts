import { z } from 'zod';

// Validates one chunk of a season's Tactical Challenge records: a local chunk, a JSON export, and (once sync is connected)
// the server row value.
const slotSchema = z.object({
  id: z.number().int().nonnegative(),
  damage: z.number().int().nonnegative().nullable(),
});

const sideSchema = z.object({
  nickname: z.string().max(64),
  avatarId: z.number().int().nonnegative().nullable(),
  m: z.array(slotSchema).max(4),
  s: z.array(slotSchema).max(2),
});

export const arenaRecordSchema = z.object({
  id: z.string().min(1).max(64),
  capturedAt: z.number(),
  savedAt: z.number(),
  role: z.enum(['attack', 'defense']),
  won: z.boolean(),
  me: sideSchema,
  opponent: sideSchema,
});

// Sanity bound only: a chunk is capped by size (ARENA_CHUNK_MAX_CHARS), which keeps it far below this.
export const ARENA_CHUNK_MAX_RECORDS = 5000;

export const arenaBucketSchema = z.object({
  records: z.array(arenaRecordSchema).max(ARENA_CHUNK_MAX_RECORDS),
});

// A whole season (JSON export/import): any number of chunks' worth, so only a loose sanity bound.
export const arenaSeasonImportSchema = z.object({
  records: z.array(arenaRecordSchema).max(50_000),
});

// Pre-season store (`arena-history-v1`, long keys, one list for all seasons); read once for migration.
const legacySlotSchema = z.object({
  id: z.number().int().nonnegative(),
  role: z.enum(['striker', 'special']),
  damage: z.number().int().nonnegative().nullable(),
});

const legacySideSchema = z.object({
  nickname: z.string().max(64),
  avatarId: z.number().int().nonnegative().nullable(),
  team: z.array(legacySlotSchema).max(6),
});

export const legacyArenaRecordSchema = z.object({
  id: z.string().min(1).max(64),
  savedAt: z.number(),
  capturedAt: z.number(),
  myRole: z.enum(['attack', 'defense']),
  won: z.boolean(),
  me: legacySideSchema,
  opponent: legacySideSchema,
});

export type LegacyArenaRecord = z.infer<typeof legacyArenaRecordSchema>;
