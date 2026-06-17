import { z } from 'zod';

export const dreamMakerStrategySchema = z.enum(['mission_priority', 'pt_optimal']);
export type DreamMakerStrategy = z.infer<typeof dreamMakerStrategySchema>;

export const dreamMakerSimConfigSchema = z.object({
  simRuns: z.number(),
  targetLoops: z.number(),
  isFirstRun: z.boolean(),
  clearedFirstRewards: z.boolean(),
  initialStats: z.record(z.string(), z.number()).optional(),
  strategy: dreamMakerStrategySchema,
});
export type DreamMakerSimConfig = z.infer<typeof dreamMakerSimConfigSchema>;

export const dreamMakerSimResultSchema = z.object({
  avgCost: z.record(z.string(), z.number()),
  avgRewards: z.record(z.string(), z.number()),
  avgEventPoints: z.number(),
  avgFinalStats: z.record(z.string(), z.number()),
  avgSpecialEndings: z.number(),
  avgNormalEndings: z.number(),
  avgActions: z.number(),
  loopsDetail: z.record(
    z.string(),
    z.object({
      startStats: z.record(z.string(), z.number()),
      endStats: z.record(z.string(), z.number()),
      eventPoints: z.number(),
      specialEndingRate: z.number(),
    }),
  ),
});
export type DreamMakerSimResult = z.infer<typeof dreamMakerSimResultSchema>;

export const defaultDreamMakerConfig: DreamMakerSimConfig = {
  simRuns: 1000,
  targetLoops: 5,
  isFirstRun: true,
  clearedFirstRewards: false,
  strategy: 'pt_optimal',
};
