import { z } from 'zod';

export const ccgRunInputSchema = z.object({
  id: z.string(),
  stage: z.number(),
  count: z.number(),
});
export type CcgRunInput = z.infer<typeof ccgRunInputSchema>;

// Result Type Definition
export type MinigameCCGResult = {
  cost: Record<string, number>;
  rewards: Record<string, number>;
};
