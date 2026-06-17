/// <reference lib="webworker" />

import { cdn } from '~/utils/cdn.js';
import wasmInit, { simulate_strategies_chunk } from './gacha_engine_pkg.js';
import type { SimRawAccumulator } from '~/utils/gachaEngine';

export type SimWorkerInMsg = {
  strategiesJson: string;
  bannerPoolsJson: string;
  simCount: number;
  seed: number;
};

export type SimWorkerOutMsg =
  | { type: 'progress'; chunkAcc: SimRawAccumulator; completed: number; total: number }
  | { type: 'done'; chunkAcc: SimRawAccumulator; completed: number; total: number; totalMs: number }
  | { type: 'error'; message: string };

const CHUNK_SIZE = 20000;
let initialized = false;

self.onmessage = async (e: MessageEvent<SimWorkerInMsg>) => {
  try {
    if (!initialized) {
      await wasmInit({ module_or_path: cdn('/wasm/gacha_engine_bg.wasm') });
      initialized = true;
    }

    const { strategiesJson, bannerPoolsJson, simCount, seed: seedNum } = e.data;

    let completed = 0;
    let seed = BigInt(seedNum);
    const startTime = performance.now();

    while (completed < simCount) {
      const chunkCount = Math.min(CHUNK_SIZE, simCount - completed);
      const raw = simulate_strategies_chunk(strategiesJson, bannerPoolsJson, chunkCount, seed);

      if (raw.startsWith('{"error"')) {
        const parsed = JSON.parse(raw) as { error: string };
        self.postMessage({ type: 'error', message: parsed.error } satisfies SimWorkerOutMsg);
        return;
      }

      const chunk = JSON.parse(raw) as {
        costs: number[];
        pulls: number[];
        successCount: number;
        totalEligmaSum: number;
        bannerCosts: Record<string, number[]>;
        studentAcquired: Record<string, number>;
        studentElephTotal: Record<string, number>;
        studentElephDist: Record<string, Record<string, number>>;
      };

      const chunkAcc: SimRawAccumulator = {
        resultsCost: chunk.costs,
        resultsPulls: chunk.pulls,
        successCount: chunk.successCount,
        totalEligmaSum: chunk.totalEligmaSum,
        bannerCumulativeCosts: chunk.bannerCosts,
        bannerStatsSum: Object.fromEntries(Object.entries(chunk.bannerCosts).map(([bid, costs]) => [bid, { pulls: 0, cost: costs.reduce((s, c) => s + c, 0) }])),
        studentAcquired: Object.fromEntries(Object.entries(chunk.studentAcquired).map(([k, v]) => [Number(k), v])),
        studentElephTotal: Object.fromEntries(Object.entries(chunk.studentElephTotal).map(([k, v]) => [Number(k), v])),
        studentElephDist: Object.fromEntries(Object.entries(chunk.studentElephDist).map(([k, dist]) => [Number(k), Object.fromEntries(Object.entries(dist).map(([a, c]) => [Number(a), c]))])),
      };

      seed += BigInt(chunkCount);
      completed += chunkCount;

      if (completed >= simCount) {
        const totalMs = performance.now() - startTime;
        self.postMessage({ type: 'done', chunkAcc, completed, total: simCount, totalMs } satisfies SimWorkerOutMsg);
      } else {
        self.postMessage({ type: 'progress', chunkAcc, completed, total: simCount } satisfies SimWorkerOutMsg);
      }
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) } satisfies SimWorkerOutMsg);
  }
};
