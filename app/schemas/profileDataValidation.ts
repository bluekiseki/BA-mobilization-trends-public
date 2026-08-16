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

// ─── Per-key schemas ───────────────────────────────────────────────────────────

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

// eventPlans:${eventId} pattern — per-event plan entry
const eventPlanEntrySchema = z.looseObject(eventPlanSchema.partial().shape);

// ─── Main validation entry point ───────────────────────────────────────────────

const MAX_KEY_SIZE = 1_000_000; // 1 MB per key

export function validateProfileDataValue(key: string, value: unknown): void {
  const rawSize = JSON.stringify(value).length;
  if (rawSize > MAX_KEY_SIZE) {
    throw new Error(`Payload too large for '${key}' (${rawSize} bytes, max 1 MB)`);
  }

  if (key.startsWith('eventPlans:')) {
    const result = eventPlanEntrySchema.safeParse(value);
    if (!result.success) throw new Error(`Invalid eventPlans entry: must be an object`);
    return;
  }

  const schema = ProfileDataSchemas[key as keyof typeof ProfileDataSchemas];
  if (!schema) return; // unknown key: size limit only

  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length ? ` at ${issue.path.join('.')}` : '';
    throw new Error(`Invalid '${key}'${path}: ${issue.message}`);
  }
}
