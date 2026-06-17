import { z } from 'zod';

export const diceRaceSimConfigSchema = z.object({
  simRuns: z.number(),
  startLap: z.number(),
  startPos: z.number(),
  ownedFixedDice: z.record(z.string(), z.number()),
  endConditionType: z.enum(['lap_pos', 'item']),
  targetLap: z.number(),
  targetPos: z.number(),
  targetItemId: z.number(),
  targetItemAmount: z.number(),
  fixedDicePriority: z.array(z.number()),
});
export type DiceRaceSimConfig = z.infer<typeof diceRaceSimConfigSchema>;

export const DefaultDiceRaceSimConfig: DiceRaceSimConfig = {
  simRuns: 50000,
  startLap: 1,
  startPos: 0,
  ownedFixedDice: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 },
  endConditionType: 'lap_pos',
  targetLap: 20,
  targetPos: 0,
  targetItemId: 0,
  targetItemAmount: 0,
  fixedDicePriority: [],
};
