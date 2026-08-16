import { z } from 'zod';

export const raidDifficultySchema = z.enum(['Normal', 'Hard', 'Veryhard', 'Hardcore', 'Extreme', 'Insane', 'Torment', 'Lunatic']);
export const raidTrophySchema = z.enum(['platinum', 'gold', 'silver', 'bronze']);
export const RAID_DIFFICULTIES = raidDifficultySchema.options;
export const RAID_TROPHIES = raidTrophySchema.options;

export const raidDetailConfigSchema = z.object({
  killDifficulty: raidDifficultySchema,
  trophy: raidTrophySchema,
  m360: z.boolean(),
  m400: z.boolean(),
});

export type RaidTrophy = z.infer<typeof raidTrophySchema>;
export type RaidDetailConfig = z.infer<typeof raidDetailConfigSchema>;

export const contentRefSchema = z.object({
  id: z.string(),
  timing: z.enum(['start', 'end']).optional(),
});

export type ContentRef = z.infer<typeof contentRefSchema>;

export const studentTargetGoalSchema = z.object({
  id: z.string(),
  targetStar: z.number(),
  targetUw: z.number(),
  date: z.string().optional(),
  contentRef: contentRefSchema.optional(),
});

export type StudentTargetGoal = z.infer<typeof studentTargetGoalSchema>;

export const stageFarmingPlanSchema = z.object({
  dailyRuns: z.record(z.string(), z.number()),
});

export type StageFarmingPlan = z.infer<typeof stageFarmingPlanSchema>;

export const resourcePlanEventSchema = z.object({
  id: z.string(),
  date: z.string(),
  spendItemKey: z.string().optional(),
  spendAmount: z.number().optional(),
  gainItemKey: z.string().optional(),
  gainAmount: z.number().optional(),
  sourceType: z.string(),
  label: z.string().optional(),
  purchaseUnits: z.number().optional(),
  refreshCost: z.number().optional(),
});

export type ResourcePlanEvent = z.infer<typeof resourcePlanEventSchema>;

export const resourcePlanDataSchema = z.object({
  gachaEligmaPercentile: z.number(),
  gachaEligmaUseMean: z.boolean(),
  purchaseEvents: z.array(resourcePlanEventSchema),
  dailySourceAmounts: z.record(z.string(), z.record(z.string(), z.number())),
  contentEventYields: z.record(z.string(), z.number()),
  targetGoals: z.record(z.string(), z.array(studentTargetGoalSchema)),
  stageFarmingPlans: z.record(z.string(), stageFarmingPlanSchema),
  pvpAverageRank: z.number(),
  pvpDailyDefenseWins: z.number(),
  pvpExtraWeeklyIncome: z.number(),
  raidGlobalConfig: raidDetailConfigSchema.nullable(),
  eraidGlobalConfig: raidDetailConfigSchema.nullable(),
  raidDetailConfigs: z.record(z.string(), raidDetailConfigSchema),
  jfdDefaultDailyCoins: z.number(),
  jfdPerPeriodCoins: z.record(z.string(), z.number()),
  multifloorDefaultMaxFloor: z.number(),
  multifloorMaxFloors: z.record(z.string(), z.number()),
  expertPermitMode: z.enum(['weekly_max', 'daily']),
  expertPermitWeeklyMax: z.number(),
  expertPermitDailyAmounts: z.record(z.string(), z.number()),
});

export type ResourcePlanData = z.infer<typeof resourcePlanDataSchema>;
