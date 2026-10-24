/// <reference lib="webworker" />

import type { GachaHistoryEntry } from '~/types/gachaHistory';
import type { BannerPeriod } from '~/utils/gachaData';
import { calculateGachaHistoryStats, calculateGachaHistoryStatsByBanner, type BannerGachaHistoryStats, type GachaHistoryStats } from '~/features/my/gacha/logic/gachaHistoryStats';

export interface GachaHistoryStatsWorkerRequest {
  jobId: number;
  entries: GachaHistoryEntry[];
  banners: Array<[string, BannerPeriod]>;
  simulationCount: number;
  includePerBanner: boolean;
}

export type GachaHistoryStatsWorkerResponse = { type: 'done'; jobId: number; stats: GachaHistoryStats; perBannerStats: BannerGachaHistoryStats[] } | { type: 'error'; jobId: number; message: string };

self.onmessage = (event: MessageEvent<GachaHistoryStatsWorkerRequest>) => {
  const { jobId, entries, banners: bannerEntries, simulationCount, includePerBanner } = event.data;
  try {
    const banners = new Map<string, BannerPeriod>(bannerEntries);
    const stats = calculateGachaHistoryStats(entries, banners, simulationCount);
    const perBannerStats = includePerBanner ? calculateGachaHistoryStatsByBanner(entries, banners, simulationCount) : [];
    self.postMessage({ type: 'done', jobId, stats, perBannerStats } satisfies GachaHistoryStatsWorkerResponse);
  } catch (error) {
    self.postMessage({ type: 'error', jobId, message: String(error) } satisfies GachaHistoryStatsWorkerResponse);
  }
};
