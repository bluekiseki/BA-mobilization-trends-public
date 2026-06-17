import { z } from 'zod';

export const apCalculatorConfigSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  cafeRank: z.number(),
  gemRefills: z.number(),
  pvpRefills: z.number(),
  hardStages: z.number(),
  exchangeRuns: z.number(),
  exchangeCost: z.number(),
  miscDailySpend: z.number(),
  attendanceStartDate: z.string(),
  attendanceStartDay: z.number(),
  bonusAp: z.number(),
  apPackageDates: z.array(z.string()),
});
export type ApCalculatorConfig = z.infer<typeof apCalculatorConfigSchema>;
