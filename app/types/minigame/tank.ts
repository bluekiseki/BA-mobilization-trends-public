import { z } from 'zod';

export const tankConfigSchema = z.object({
  runCounts: z.record(z.string(), z.number()).default({}), // stageId -> repeat count
  clearStatus: z.record(z.string(), z.boolean()).default({}), // stageId -> one-time (FirstClear/ThreeStar) rewards still to claim
  currentGrade: z.record(z.string(), z.number()).default({}), // tank group id -> owned grade
  targetGrade: z.record(z.string(), z.number()).default({}), // tank group id -> goal grade
});

export type TankConfig = z.infer<typeof tankConfigSchema>;

export const defaultTankConfig: TankConfig = {
  runCounts: {},
  clearStatus: {},
  currentGrade: {},
  targetGrade: {},
};

export type MinigameTankResult = {
  cost: Record<string, number>;
  rewards: Record<string, number>;
};
