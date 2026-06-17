import { z } from 'zod';

export const treasureStrategySchema = z.enum(['checkerboard', 'hunt_biggest_wiki', 'heuristic', 'custom']);
export type TreasureStrategy = z.infer<typeof treasureStrategySchema>;

export const treasureGoalSchema = z.enum(['clear_all', 'biggest_only']);
export type TreasureGoal = z.infer<typeof treasureGoalSchema>;

export const treasureSimConfigSchema = z.object({
  strategy: treasureStrategySchema,
  goal: treasureGoalSchema,
  simRuns: z.number(),
});
export type TreasureSimConfig = z.infer<typeof treasureSimConfigSchema>;

export const DefaultTreasureSimConfig: TreasureSimConfig = {
  strategy: 'heuristic',
  goal: 'clear_all',
  simRuns: 1000,
};
