import { z } from 'zod';

export const clueSearchConfigSchema = z.object({
  startRound: z.number(),
  endRound: z.number(),
});
export type ClueSearchConfig = z.infer<typeof clueSearchConfigSchema>;

export const defaultClueSearchConfig: ClueSearchConfig = {
  startRound: 1,
  endRound: 7,
};
