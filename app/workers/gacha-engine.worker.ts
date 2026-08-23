/// <reference lib="webworker" />

import { cdn } from '~/utils/cdn.js';
import wasmInit, { gacha_run_charge_chunk, gacha_run_chunk } from './gacha_engine_pkg.js';

const CHUNK_SIZE = 10_000_000;
let initialized = false;

export type WorkerInMsg = {
  grade3Ids: number[];
  grade2Ids: number[];
  grade1Ids: number[];
  fesIds: number[];
  fesExcludedIds: number[];
  bannerPickupIds: number[];
  pickupId: number;
  isFes: boolean;
  useChargeSystem: boolean;
  initialCharge: number;
  checkpointTestMode: boolean;
  totalPullCount: number;
};

export type ChunkStats = {
  grade1: number;
  grade2: number;
  grade3: number;
  pickup: number;
  total: number;
  charge: number;
  studentCountsJson: string;
};

export type WorkerOutMsg =
  { type: 'progress'; chunkStats: ChunkStats; completed: number; total: number } | { type: 'done'; chunkStats: ChunkStats; completed: number; total: number } | { type: 'error'; message: string };

self.onmessage = async (e: MessageEvent<WorkerInMsg>) => {
  try {
    if (!initialized) {
      await wasmInit({ module_or_path: cdn('/wasm/gacha_engine_bg.wasm', true) });
      initialized = true;
    }

    const { grade3Ids, grade2Ids, grade1Ids, fesIds, fesExcludedIds, bannerPickupIds, pickupId, isFes, useChargeSystem, initialCharge, checkpointTestMode, totalPullCount } = e.data;

    const g3 = new Uint32Array(grade3Ids);
    const g2 = new Uint32Array(grade2Ids);
    const g1 = new Uint32Array(grade1Ids);
    const fes = new Uint32Array(fesIds);
    const fesExcl = new Uint32Array(fesExcludedIds);
    const pickupIds = new Uint32Array(bannerPickupIds);

    let remaining = totalPullCount;
    let seed = BigInt(Date.now() ^ Math.floor(Math.random() * 0xffffffff));
    let charge = initialCharge;

    while (remaining > 0) {
      const chunkCount = Math.min(remaining, CHUNK_SIZE);
      const wasmStats = useChargeSystem
        ? gacha_run_charge_chunk(g3, g2, g1, fes, fesExcl, pickupIds, pickupId, isFes, chunkCount, charge, checkpointTestMode, seed)
        : gacha_run_chunk(g3, g2, g1, fes, fesExcl, pickupIds, pickupId, isFes, chunkCount, seed);
      charge = wasmStats.charge;

      seed += BigInt(chunkCount);
      remaining -= chunkCount;
      const completed = totalPullCount - remaining;

      const chunkStats: ChunkStats = {
        grade1: wasmStats.grade1,
        grade2: wasmStats.grade2,
        grade3: wasmStats.grade3,
        pickup: wasmStats.pickup,
        total: wasmStats.total,
        charge,
        studentCountsJson: wasmStats.student_counts_json(),
      };
      wasmStats.free();

      const msgType = remaining <= 0 ? 'done' : 'progress';
      self.postMessage({ type: msgType, chunkStats, completed, total: totalPullCount } satisfies WorkerOutMsg);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) } satisfies WorkerOutMsg);
  }
};
