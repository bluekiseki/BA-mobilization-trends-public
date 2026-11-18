import { z } from 'zod';
import { growthPlanSchema } from '../types/growthPlan';
import { bannerStrategySchema, studentStrategyConfigSchema } from '../types/gacha';
import { eventPlanSchema } from '../types/eventPlan';
import { RAID_TROPHIES, resourcePlanDataSchema } from '../types/resourcePlan';

const growthPlanValidation = z.looseObject(growthPlanSchema.shape);
const httpUrlSchema = z.url().max(500);

const bannerStrategyValidation = z.looseObject(
  bannerStrategySchema.partial({ maxSparks: true, maxHalfCharges: true, minPulls: true, studentConfigs: true, maxPulls: true, isFes: true, freePulls: true }).extend({
    studentConfigs: z.record(z.string(), z.looseObject(studentStrategyConfigSchema.shape)).optional(),
    excludeFesSpooks: z.array(z.number().int()).max(50).optional(),
  }).shape,
);

const raidHistoryStudentSchema = z.object({
  id: z.number().int().positive(),
  star: z.number().int().min(1).max(5).optional(),
  hasWeapon: z.boolean().optional(),
  weaponStar: z.number().int().min(0).max(4).optional(),
  isAssist: z.boolean().optional(),
  isMulligan: z.boolean().optional(),
  mulliganIndex: z.number().int().min(0).max(9).optional(),
  level: z.number().int().min(1).max(90).optional(),
  equipment: z.tuple([z.number().int().min(0).max(10), z.number().int().min(0).max(10), z.number().int().min(0).max(10)]).optional(),
  skills: z.object({ ex: z.number().int().min(1).max(5), normal: z.number().int().min(0).max(10), passive: z.number().int().min(0).max(10), sub: z.number().int().min(0).max(10) }).optional(),
  notes: z.string().max(200).optional(),
});

export const raidPartyClipboardSchema = z.object({
  type: z.literal('ba-raid-party'),
  m: z.array(raidHistoryStudentSchema.nullable()),
  s: z.array(raidHistoryStudentSchema.nullable()),
});

const raidHistoryTeamSchema = z.object({
  difficulty: z.string().min(1).max(32).optional(),
  armorType: z.string().min(1).max(32).optional(),
  score: z.number().int().nonnegative().optional(),
  m: z.array(raidHistoryStudentSchema.nullable()).min(4).max(6),
  s: z.array(raidHistoryStudentSchema.nullable()).min(2).max(4),
  guideUrl: httpUrlSchema.optional(),
  noGuide: z.boolean().optional(),
  notes: z.string().max(200).optional(),
});

const raidHistoryEntrySchema = z.object({
  id: z.string().min(1).max(32),
  raidId: z.string().min(1).max(10),
  raidType: z.enum(['raid', 'eraid', 'jfd', 'multifloor']),
  server: z.enum(['jp', 'kr', 'tw', 'asia', 'global', 'na']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  difficulty: z.string().min(1).max(32).optional(),
  trophy: z.enum(RAID_TROPHIES).optional(),
  score: z.number().int().nonnegative().optional(),
  rank: z.number().int().positive().optional(),
  floor: z.number().int().min(1).max(124).optional(),
  clearTime: z.string().max(20).optional(),
  teams: z.array(raidHistoryTeamSchema).min(1).max(30).optional(),
  m: z.array(raidHistoryStudentSchema.nullable()).optional(),
  s: z.array(raidHistoryStudentSchema.nullable()).optional(),
  guideUrl: httpUrlSchema.optional(),
  noGuide: z.boolean().optional(),
  notes: z.string().max(200).optional(),
});

const gachaHistoryResultSchema = z.object({
  // 36 chars to allow crypto.randomUUID() output
  id: z.string().min(1).max(36),
  studentId: z.number().int().positive(),
  isFirstAcquisition: z.boolean(),
  isPickup: z.boolean(),
  countTowardGoal: z.boolean(),
  source: z.enum(['normal', 'half_pity', 'hard_pity', 'point_exchange']),
});

const gachaHistoryEntrySchema = z.object({
  // 36 chars to allow crypto.randomUUID() output
  id: z.string().min(1).max(36),
  bannerId: z.string().min(1).max(200),
  server: z.enum(['GL', 'JP']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pullCount: z.number().int().min(1).max(100_000),
  goalPullCount: z.number().int().min(1).max(100_000).optional(),
  initialCharge: z.number().int().min(0).max(199).optional(),
  initialChargeLimited: z.number().int().min(0).max(199).optional(),
  results: z.array(gachaHistoryResultSchema).max(10_000),
  notes: z.string().max(500).optional(),
});

// ─── Key registry ──────────────────────────────────────────────────────────────
// The single source of truth for sync keys: static keys (ProfileDataSchemas) and prefixed keys (ProfileDataPrefixes).
// The client key type (ProfileDataKey, used by useSyncStore.push), the server allowlist and value validation are all
// derived from these two, so a new sync key only needs an entry here. The server rejects any other key.

export const ProfileDataSchemas = {
  growthPlans: z.looseObject({
    growthPlans: z.array(growthPlanValidation).max(400),
    ownedGifts: z.record(z.string(), z.number().int().min(0)).optional(),
    materialInventory: z.record(z.string(), z.number().int().min(0)).optional(),
  }),

  equipmentPlan: z.looseObject({
    runCounts: z.record(z.string(), z.number().int().min(0).max(100_000)).optional(),
    farmingDays: z.number().int().min(0).max(3650).optional(),
    normalMultiplier: z.number().min(1).max(10).optional(),
    hardMultiplier: z.number().min(1).max(10).optional(),
    campaignSource: z.enum(['kr', 'jp']).optional(),
  }),

  resourcePlan: z.looseObject({
    server: z.enum(['kr', 'jp']).optional(),
    kr: z.looseObject(resourcePlanDataSchema.partial().shape).optional(),
    jp: z.looseObject(resourcePlanDataSchema.partial().shape).optional(),
  }),

  gacha_prefs: z.looseObject({
    server: z.enum(['KR', 'JP']).optional(),
    customPercentiles: z.array(z.number().min(0).max(100)).max(50).optional(),
    incomeConfig: z.looseObject({}).optional(),
    includeGacha: z.boolean().optional(),
  }),

  gacha_strategies: z.record(z.string(), bannerStrategyValidation).refine((v) => Object.keys(v).length <= 2000, 'Too many banner strategies'),

  theme: z.string().max(64),

  raidHistory: z.object({
    entries: z.array(raidHistoryEntrySchema).max(2000),
  }),

  gachaHistory: z.object({
    entries: z.array(gachaHistoryEntrySchema).max(2000),
    simulationCount: z.number().int().min(100).max(10_000_000).optional(),
  }),

  gameInfo: z.object({
    uuid: z.string().regex(/^\d*$/).max(20).optional(),
    friendCode: z
      .string()
      .regex(/^[a-zA-Z0-9]*$/)
      .max(20)
      .optional(),
    nickname: z.string().max(20).optional(),
  }),
} as const satisfies Record<string, z.ZodType>;

export type StaticProfileDataKey = keyof typeof ProfileDataSchemas;

const eventPlanEntrySchema = z.looseObject(eventPlanSchema.partial().shape);

// `<prefix>:<id>` keys. `schema: null` = size check only (e.g. arena chunks: ~1,500 records each, too costly to
// validate within the Workers free-plan CPU budget).
export const ProfileDataPrefixes = {
  // eventPlans:<eventId>
  eventPlans: { id: /^[A-Za-z0-9_-]{1,32}$/, schema: eventPlanEntrySchema },
  // arenaHistory:<seasonKey>:<chunk>, see ~/scanner-arena/storage
  arenaHistory: { id: /^(jp|gl)-\d{1,3}:\d{1,3}$/, schema: null },
} as const satisfies Record<string, { id: RegExp; schema: z.ZodType | null }>;

export type ProfileDataPrefix = keyof typeof ProfileDataPrefixes;
export type ProfileDataKey = StaticProfileDataKey | `${ProfileDataPrefix}:${string}`;

// Allowlist + schema lookup in one place: null when the key is not a registered sync key.
export function resolveProfileDataKey(key: string): { schema: z.ZodType | null } | null {
  if (Object.hasOwn(ProfileDataSchemas, key)) return { schema: ProfileDataSchemas[key as StaticProfileDataKey] };
  const separator = key.indexOf(':');
  if (separator < 0) return null;
  const prefix = key.slice(0, separator);
  if (!Object.hasOwn(ProfileDataPrefixes, prefix)) return null;
  const entry = ProfileDataPrefixes[prefix as ProfileDataPrefix];
  return entry.id.test(key.slice(separator + 1)) ? { schema: entry.schema } : null;
}

// ─── Main validation entry point ───────────────────────────────────────────────

const MAX_KEY_SIZE = 1_000_000; // 1 MB per key

export function validateProfileDataValue(key: string, value: unknown): void {
  const resolved = resolveProfileDataKey(key);
  if (!resolved) throw new Error(`Unknown key '${key.slice(0, 64)}'`);

  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('Missing value');
  const rawSize = new TextEncoder().encode(serialized).byteLength;
  if (rawSize > MAX_KEY_SIZE) {
    throw new Error(`Payload too large for '${key}' (${rawSize} bytes, max 1 MB)`);
  }

  if (value === null || !resolved.schema) return;
  const result = resolved.schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length ? ` at ${issue.path.join('.')}` : '';
    throw new Error(`Invalid '${key}'${path}: ${issue.message}`);
  }
}
