/// <reference lib="webworker" />

import { solveTreasure, type TreasureProbInput, type TreasureProbResult } from '~/features/event-planner/logic/treasureProbability';

export type TreasureProbWorkerIn = { id: number; input: TreasureProbInput; mode: 'exact' | 'approx' };
export type TreasureProbWorkerOut = { id: number; result: TreasureProbResult };

self.onmessage = (e: MessageEvent<TreasureProbWorkerIn>) => {
  const { id, input, mode } = e.data;
  const result = solveTreasure(input, mode);
  const msg: TreasureProbWorkerOut = { id, result };
  self.postMessage(msg);
};
