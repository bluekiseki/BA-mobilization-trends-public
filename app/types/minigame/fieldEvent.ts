import { z } from 'zod';

export const fieldEventConfigSchema = z.object({
  masteryStartLevel: z.number(),
  masteryEndLevel: z.number(),
  questCompletions: z.record(z.string(), z.number()),
  stageRunCounts: z.record(z.string(), z.number()),
  stageFirstClears: z.record(z.string(), z.boolean()),
});

export type FieldEventConfig = z.infer<typeof fieldEventConfigSchema>;

export const defaultFieldEventConfig: FieldEventConfig = {
  masteryStartLevel: 1,
  masteryEndLevel: 15,
  questCompletions: {},
  stageRunCounts: {},
  stageFirstClears: {},
};

// Default entry cost per event
export const FIELD_STAGE_COST: Record<number, number> = {
  833: 150,
  10833: 150,
  843: 300,
  10843: 300,
};

// Per-stage cost overrides (stages that differ from the event default)
const FIELD_STAGE_COST_OVERRIDE: Record<string, number> = {
  // 833/10833: stages 8337xxx / 10837xxx cost 20pt instead of 150pt
  '8337301': 20,
  '8337302': 20,
  '8337303': 20,
  '8337304': 20,
  '10837301': 20,
  '10837302': 20,
  '10837303': 20,
  '10837304': 20,
};

export const getStageCost = (eventId: number, stageId: string): number => FIELD_STAGE_COST_OVERRIDE[stageId] ?? FIELD_STAGE_COST[eventId] ?? 300;
