import { z } from 'zod';

export const roadPuzzleConfigSchema = z.object({
  startStage: z.number().default(1),
  endStage: z.number().default(0), // 0 = auto: last non-loop stage
});

export type RoadPuzzleConfig = z.infer<typeof roadPuzzleConfigSchema>;

export const defaultRoadPuzzleConfig: RoadPuzzleConfig = {
  startStage: 1,
  endStage: 0,
};
