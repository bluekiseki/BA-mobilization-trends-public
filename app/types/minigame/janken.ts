import { z } from 'zod';

export const jankenConfigSchema = z.object({
  normalRunCounts: z.record(z.string(), z.number()).default({}), // stageId -> repeat count
  clearStatus: z.record(z.string(), z.boolean()).default({}), // stageId -> one-time (FirstClear/ThreeStar) reward claimed, for both Story and Normal stages
  equipmentTargetTier: z.number().default(1),
  challengeCurrentScore: z.number().default(0),
  challengeTargetScore: z.number().default(0),
});

export type JankenConfig = z.infer<typeof jankenConfigSchema>;

export const defaultJankenConfig: JankenConfig = {
  normalRunCounts: {},
  clearStatus: {},
  equipmentTargetTier: 1,
  challengeCurrentScore: 0,
  challengeTargetScore: 0,
};
