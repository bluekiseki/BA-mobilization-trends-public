import { useCallback, useEffect, useRef, useState } from 'react';
import type { GachaHistoryEntry } from '~/types/gachaHistory';
import type { BannerPeriod } from '~/utils/gachaData';
import type { GachaHistoryStatsWorkerRequest, GachaHistoryStatsWorkerResponse } from '~/workers/gacha-history-stats.worker';
import { DEFAULT_SIMULATION_COUNT, isValidGachaHistorySimulationCount, shouldAutoRunGachaHistorySimulation, type BannerGachaHistoryStats, type GachaHistoryStats } from './logic/gachaHistoryStats';

export interface CompletedStatsSimulation {
  contextKey: string;
  simulationCount: number;
  stats: GachaHistoryStats;
  perBannerStats: BannerGachaHistoryStats[];
  /** A preview or an unfinished run's samples so far — shown until the run completes, never kept over a finished result. */
  isPartial?: boolean;
}

export interface UseGachaStatsSimulationInput {
  tab: 'records' | 'stats' | 'studentStats';
  statsContextKey: string;
  selectedEntries: GachaHistoryEntry[];
  bannersById: Map<string, BannerPeriod>;
  statsScope: 'all' | 'banner';
  simulationCountInput: string;
  /** Largest count the device may run; defaults to the desktop limit. */
  /** Count of the run started when the input holds no count to auto-run; defaults to the device limit. */
  baselineSimulationCount?: number;
  setSimulationCount: (count: number) => void;
  /** Creates the stats worker; must be a stable function (it is a dependency of the start callback). */
  createWorker: () => Worker;
}

/** Runs the gacha-history statistics simulation in a worker: auto-runs on the stats tab, cancels stale requests and ignores stale replies. */
export function useGachaStatsSimulation({
  tab,
  statsContextKey,
  selectedEntries,
  bannersById,
  statsScope,
  simulationCountInput,
  baselineSimulationCount = DEFAULT_SIMULATION_COUNT,
  setSimulationCount,
  createWorker,
}: UseGachaStatsSimulationInput) {
  const [completedStatsSimulation, setCompletedStatsSimulation] = useState<CompletedStatsSimulation | null>(null);
  const [isStatsCalculating, setIsStatsCalculating] = useState(false);
  const [statsSimulationErrorKey, setStatsSimulationErrorKey] = useState<string | null>(null);
  const [statsSimulationProgress, setStatsSimulationProgress] = useState<{ completed: number; total: number } | null>(null);
  const statsWorkerRef = useRef<Worker | null>(null);
  const statsJobIdRef = useRef(0);
  const activeStatsRequestRef = useRef<{ contextKey: string; simulationCount: number; purpose: 'baseline' | 'requested' } | null>(null);
  const completedStatsForContext = completedStatsSimulation?.contextKey === statsContextKey ? completedStatsSimulation : null;

  const startStatsSimulation = useCallback(
    (requestedSimulationCount: number, purpose: 'baseline' | 'requested' = 'requested') => {
      if (!isValidGachaHistorySimulationCount(requestedSimulationCount)) return;
      statsWorkerRef.current?.terminate();
      const worker = createWorker();
      const jobId = statsJobIdRef.current + 1;
      statsJobIdRef.current = jobId;
      statsWorkerRef.current = worker;
      activeStatsRequestRef.current = { contextKey: statsContextKey, simulationCount: requestedSimulationCount, purpose };
      setIsStatsCalculating(true);
      setStatsSimulationErrorKey(null);
      setStatsSimulationProgress(null);

      const finish = () => {
        if (statsWorkerRef.current === worker) statsWorkerRef.current = null;
        if (activeStatsRequestRef.current?.contextKey === statsContextKey && activeStatsRequestRef.current.simulationCount === requestedSimulationCount) activeStatsRequestRef.current = null;
        worker.terminate();
        setIsStatsCalculating(false);
        setStatsSimulationProgress(null);
      };

      worker.onmessage = (event: MessageEvent<GachaHistoryStatsWorkerResponse>) => {
        if (event.data.jobId !== statsJobIdRef.current) return;
        const showPartial = (stats: GachaHistoryStats, perBannerStats: BannerGachaHistoryStats[], keepFinished: boolean) =>
          setCompletedStatsSimulation((current) =>
            keepFinished && current?.contextKey === statsContextKey && !current.isPartial
              ? current
              : {
                  contextKey: statsContextKey,
                  simulationCount: requestedSimulationCount,
                  stats,
                  perBannerStats: perBannerStats.length > 0 ? perBannerStats : current?.contextKey === statsContextKey ? current.perBannerStats : [],
                  isPartial: true,
                },
          );
        if (event.data.type === 'progress') {
          setStatsSimulationProgress({ completed: event.data.completed, total: event.data.total });
          // Samples so far follow the run on screen, even over an earlier finished result.
          showPartial(event.data.stats, [], false);
          return;
        }
        if (event.data.type === 'preview') {
          // The 500-sample preview only fills an empty chart; a finished result is better than it.
          showPartial(event.data.stats, event.data.perBannerStats, true);
          return;
        }
        if (event.data.type === 'error') {
          setStatsSimulationErrorKey(`${statsContextKey}:${requestedSimulationCount}`);
          finish();
          return;
        }
        setCompletedStatsSimulation({
          contextKey: statsContextKey,
          simulationCount: requestedSimulationCount,
          stats: event.data.stats,
          perBannerStats: event.data.perBannerStats,
        });
        if (purpose === 'requested') setSimulationCount(requestedSimulationCount);
        finish();
      };
      worker.onerror = () => {
        if (jobId !== statsJobIdRef.current) return;
        setStatsSimulationErrorKey(`${statsContextKey}:${requestedSimulationCount}`);
        finish();
      };

      const request: GachaHistoryStatsWorkerRequest = {
        jobId,
        entries: selectedEntries,
        banners: [...bannersById.entries()],
        simulationCount: requestedSimulationCount,
        includePerBanner: statsScope === 'all',
      };
      worker.postMessage(request);
    },
    [bannersById, createWorker, selectedEntries, setSimulationCount, statsContextKey, statsScope],
  );

  useEffect(() => {
    const activeRequest = activeStatsRequestRef.current;
    const requestedSimulationCount = Number(simulationCountInput);
    const requestStillMatches =
      tab === 'stats' && activeRequest?.contextKey === statsContextKey && (activeRequest.purpose === 'baseline' || activeRequest.simulationCount === requestedSimulationCount);
    if (!activeRequest || requestStillMatches) return;
    statsJobIdRef.current += 1;
    statsWorkerRef.current?.terminate();
    statsWorkerRef.current = null;
    activeStatsRequestRef.current = null;
    setIsStatsCalculating(false);
    setStatsSimulationProgress(null);
  }, [simulationCountInput, statsContextKey, tab]);

  useEffect(() => {
    const requestedSimulationCount = Number(simulationCountInput);
    if (tab !== 'stats') return;
    const autoRunRequestedCount = shouldAutoRunGachaHistorySimulation(requestedSimulationCount);
    if (completedStatsForContext && !completedStatsForContext.isPartial && (!autoRunRequestedCount || completedStatsForContext.simulationCount === requestedSimulationCount)) return;
    const count = autoRunRequestedCount ? requestedSimulationCount : baselineSimulationCount;
    const purpose = autoRunRequestedCount ? 'requested' : 'baseline';
    const timeout = window.setTimeout(() => {
      // Partial results arrive while the run is still going; only start a run when none is active for this context.
      if (activeStatsRequestRef.current?.contextKey === statsContextKey) return;
      startStatsSimulation(count, purpose);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [baselineSimulationCount, completedStatsForContext, simulationCountInput, startStatsSimulation, statsContextKey, tab]);

  useEffect(
    () => () => {
      statsJobIdRef.current += 1;
      statsWorkerRef.current?.terminate();
    },
    [],
  );

  return { completedStatsForContext, isStatsCalculating, statsSimulationErrorKey, statsSimulationProgress, startStatsSimulation };
}
