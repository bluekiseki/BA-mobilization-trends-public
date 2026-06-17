import { z } from 'zod';
import { growthPlanSchema } from '../types/growthPlan';
import { bannerStrategySchema, studentStrategyConfigSchema } from '../types/gacha';
import { eventPlanSchema } from '../types/eventPlan';

const growthPlanValidation = z.looseObject(growthPlanSchema.shape);

const bannerStrategyValidation = z.looseObject(
  bannerStrategySchema.partial({ maxSparks: true, minPulls: true, studentConfigs: true, maxPulls: true, isFes: true, freePulls: true }).extend({
    studentConfigs: z.record(z.string(), z.looseObject(studentStrategyConfigSchema.shape)).optional(),
    excludeFesSpooks: z.array(z.number().int()).max(50).optional(),
  }).shape,
);

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

  gacha_prefs: z.looseObject({
    server: z.enum(['KR', 'JP']).optional(),
    customPercentiles: z.array(z.number().min(0).max(100)).max(50).optional(),
    incomeConfig: z.looseObject({}).optional(),
    includeGacha: z.boolean().optional(),
  }),

  gacha_strategies: z.record(z.string(), bannerStrategyValidation).refine((v) => Object.keys(v).length <= 2000, 'Too many banner strategies'),

  theme: z.string().max(64),
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
