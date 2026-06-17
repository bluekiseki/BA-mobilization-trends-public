import { z } from 'zod';

export const fortuneGachaAvgRatesSchema = z.object({
  avgCost: z.number(),
  avgRewards: z.record(z.string(), z.number()),
});
export type FortuneGachaAvgRates = z.infer<typeof fortuneGachaAvgRatesSchema>;
