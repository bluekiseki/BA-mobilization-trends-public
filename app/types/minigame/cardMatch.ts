import { z } from 'zod';

export const cardMatchSimConfigSchema = z.object({
  startRound: z.number(),
  targetClears: z.number(),
  simIterations: z.number(),
});
export type CardMatchSimConifg = z.infer<typeof cardMatchSimConfigSchema>;

export const defaultCardMatchSimConfig: CardMatchSimConifg = {
  startRound: 1,
  targetClears: 10,
  simIterations: 2000,
};
