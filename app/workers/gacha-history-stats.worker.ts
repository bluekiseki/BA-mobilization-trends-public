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

/** Runs above this count get a quick low-count 'preview' first, so the charts draw while the full run is still going. */
const PREVIEW_COUNT = 500;

export type GachaHistoryStatsWorkerResponse =
  | { type: 'preview'; jobId: number; stats: GachaHistoryStats; perBannerStats: BannerGachaHistoryStats[] }
  | { type: 'progress'; jobId: number; completed: number; total: number; stats: GachaHistoryStats }
  | { type: 'done'; jobId: number; stats: GachaHistoryStats; perBannerStats: BannerGachaHistoryStats[] }
  | { type: 'error'; jobId: number; message: string };

self.onmessage = (event: MessageEvent<GachaHistoryStatsWorkerRequest>) => {
  const { jobId, entries, banners: bannerEntries, simulationCount, includePerBanner } = event.data;
  try {
    const banners = new Map<string, BannerPeriod>(bannerEntries);
    if (simulationCount >= PREVIEW_COUNT * 2) {
      const previewStats = calculateGachaHistoryStats(entries, banners, PREVIEW_COUNT);
      const previewPerBanner = includePerBanner ? calculateGachaHistoryStatsByBanner(entries, banners, PREVIEW_COUNT) : [];
      self.postMessage({ type: 'preview', jobId, stats: previewStats, perBannerStats: previewPerBanner } satisfies GachaHistoryStatsWorkerResponse);
    }
    const stats = calculateGachaHistoryStats(entries, banners, simulationCount, (completed, partial) => {
      self.postMessage({ type: 'progress', jobId, completed, total: simulationCount, stats: partial } satisfies GachaHistoryStatsWorkerResponse);
    });
    const perBannerStats = includePerBanner ? calculateGachaHistoryStatsByBanner(entries, banners, simulationCount) : [];
    self.postMessage({ type: 'done', jobId, stats, perBannerStats } satisfies GachaHistoryStatsWorkerResponse);
  } catch (error) {
    self.postMessage({ type: 'error', jobId, message: String(error) } satisfies GachaHistoryStatsWorkerResponse);
  }
};
