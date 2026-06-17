import { z } from 'zod';

export const worldRaidBossConfigSchema = z.object({
  bossGroupId: z.number(),
  storyCleared: z.boolean(),
  diffRunCounts: z.record(z.string(), z.number()).default({}), // '1'->'4' → Clear count
  diffExtraParties: z.record(z.string(), z.number()).default({}), // '1'->'4' → Number of additional parties (0 = 1 party)
});
export type WorldRaidBossConfig = z.infer<typeof worldRaidBossConfigSchema>;

export const interactiveWorldRaidConfigSchema = z.object({
  bossConfigs: z.array(worldRaidBossConfigSchema),
  eventStoryCleared: z.tuple([z.boolean(), z.boolean()]).default([false, false]),
  // Days per period (differs by server — user input required)
  ticketPeriodDays: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  // Daily purchase amount per period (0-60, resets daily)
  ticketDailyPurchase: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
});
export type InteractiveWorldRaidConfig = z.infer<typeof interactiveWorldRaidConfigSchema>;

export const defaultInteractiveWorldRaidConfig: InteractiveWorldRaidConfig = {
  bossConfigs: [],
  eventStoryCleared: [false, false],
  ticketPeriodDays: [0, 0, 0],
  ticketDailyPurchase: [0, 0, 0],
};
