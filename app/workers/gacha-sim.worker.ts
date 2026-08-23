/// <reference lib="webworker" />

import { cdn } from '~/utils/cdn.js';
import wasmInit, { simulate_strategies_chunk } from './gacha_engine_pkg.js';
import type { SimChunkAcc, SimMetricBucket } from '~/utils/gachaEngine';

export type SimWorkerInMsg = {
  strategiesJson: string;
  bannerPoolsJson: string;
  simCount: number;
  seed: number;
  initialOwnedIds: number[];
  ticketBatchesJson: string;
  consumeExpiringTickets: boolean;
};

export type SimWorkerOutMsg =
  | { type: 'progress'; chunkAcc: SimChunkAcc; completed: number; total: number }
  | { type: 'done'; chunkAcc: SimChunkAcc; completed: number; total: number; totalMs: number }
  | { type: 'error'; message: string };

const CHUNK_SIZE = 20000;
let initialized = false;

self.onmessage = async (e: MessageEvent<SimWorkerInMsg>) => {
  try {
    if (!initialized) {
      await wasmInit({ module_or_path: cdn('/wasm/gacha_engine_bg.wasm', true) });
      initialized = true;
    }

    const { strategiesJson, bannerPoolsJson, simCount, seed: seedNum, initialOwnedIds, ticketBatchesJson, consumeExpiringTickets } = e.data;
    const ownedIdsArray = new Uint32Array(initialOwnedIds ?? []);

    let completed = 0;
    let seed = BigInt(seedNum);
    const startTime = performance.now();

    while (completed < simCount) {
      const chunkCount = Math.min(CHUNK_SIZE, simCount - completed);
      const raw = simulate_strategies_chunk(strategiesJson, bannerPoolsJson, chunkCount, seed, ownedIdsArray, ticketBatchesJson ?? '[]', consumeExpiringTickets ?? true);

      if (raw.startsWith('{"error"')) {
        const parsed = JSON.parse(raw) as { error: string };
        self.postMessage({ type: 'error', message: parsed.error } satisfies SimWorkerOutMsg);
        return;
      }

      const chunk = JSON.parse(raw) as {
        cost: Record<string, SimMetricBucket>;
        costIncremental: Record<string, SimMetricBucket>;
        costWithTickets: Record<string, SimMetricBucket>;
        costWithGachaTickets: Record<string, SimMetricBucket>;
        costWithGachaTicketsIncremental: Record<string, SimMetricBucket>;
        pulls: Record<string, SimMetricBucket>;
        pullsIncremental: Record<string, SimMetricBucket>;
        eligmaCumulative: Record<string, SimMetricBucket>;
        eligmaIncremental: Record<string, SimMetricBucket>;
        successCount: number;
        bannerStatsSum: Record<string, { pulls: number; cost: number }>;
        studentAcquired: Record<string, number>;
        studentElephTotal: Record<string, number>;
        studentElephDist: Record<string, Record<string, number>>;
        bannerStudentElephDist: Record<string, Record<string, Record<string, number>>>;
      };

      const chunkAcc: SimChunkAcc = {
        cost: new Map(Object.entries(chunk.cost)),
        costIncremental: new Map(Object.entries(chunk.costIncremental)),
        costWithTickets: new Map(Object.entries(chunk.costWithTickets)),
        costWithGachaTickets: new Map(Object.entries(chunk.costWithGachaTickets)),
        costWithGachaTicketsIncremental: new Map(Object.entries(chunk.costWithGachaTicketsIncremental)),
        pulls: new Map(Object.entries(chunk.pulls)),
        pullsIncremental: new Map(Object.entries(chunk.pullsIncremental)),
        eligmaCumulative: new Map(Object.entries(chunk.eligmaCumulative)),
        eligmaIncremental: new Map(Object.entries(chunk.eligmaIncremental)),
        successCount: chunk.successCount,
        bannerStatsSum: chunk.bannerStatsSum,
        studentAcquired: Object.fromEntries(Object.entries(chunk.studentAcquired).map(([k, v]) => [Number(k), v])),
        studentElephTotal: Object.fromEntries(Object.entries(chunk.studentElephTotal).map(([k, v]) => [Number(k), v])),
        studentElephDist: Object.fromEntries(Object.entries(chunk.studentElephDist).map(([k, dist]) => [Number(k), Object.fromEntries(Object.entries(dist).map(([a, c]) => [Number(a), c]))])),
        bannerStudentElephDist: Object.fromEntries(
          Object.entries(chunk.bannerStudentElephDist ?? {}).map(([bid, studentDists]) => [
            bid,
            Object.fromEntries(Object.entries(studentDists).map(([sid, dist]) => [Number(sid), Object.fromEntries(Object.entries(dist).map(([a, c]) => [Number(a), c]))])),
          ]),
        ),
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
