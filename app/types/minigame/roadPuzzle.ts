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

export type Cell =
  | { type: 'x' } // wall (impassable)
  | { type: 'o' } // empty, placeable (costs 1 tile)
  | { type: 's' } // start
  | { type: 'g' } // goal
  | { type: 'r'; a: number; b: number };

export type Grid = Cell[][];

export type RoadPuzzleResult = {
  cost: Record<string, number>;
  rewards: Record<string, number>;
};
