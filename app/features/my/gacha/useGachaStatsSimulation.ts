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
}

export interface UseGachaStatsSimulationInput {
  tab: 'records' | 'stats' | 'studentStats';
  statsContextKey: string;
  selectedEntries: GachaHistoryEntry[];
  bannersById: Map<string, BannerPeriod>;
  statsScope: 'all' | 'banner';
  simulationCountInput: string;
  setSimulationCount: (count: number) => void;
  /** Creates the stats worker; must be a stable function (it is a dependency of the start callback). */
  createWorker: () => Worker;
}

/** Runs the gacha-history statistics simulation in a worker: auto-runs on the stats tab, cancels stale requests and ignores stale replies. */
export function useGachaStatsSimulation({ tab, statsContextKey, selectedEntries, bannersById, statsScope, simulationCountInput, setSimulationCount, createWorker }: UseGachaStatsSimulationInput) {
  const [completedStatsSimulation, setCompletedStatsSimulation] = useState<CompletedStatsSimulation | null>(null);
  const [isStatsCalculating, setIsStatsCalculating] = useState(false);
  const [statsSimulationErrorKey, setStatsSimulationErrorKey] = useState<string | null>(null);
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

      const finish = () => {
        if (statsWorkerRef.current === worker) statsWorkerRef.current = null;
        if (activeStatsRequestRef.current?.contextKey === statsContextKey && activeStatsRequestRef.current.simulationCount === requestedSimulationCount) activeStatsRequestRef.current = null;
        worker.terminate();
        setIsStatsCalculating(false);
      };

      worker.onmessage = (event: MessageEvent<GachaHistoryStatsWorkerResponse>) => {
        if (event.data.jobId !== statsJobIdRef.current) return;
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
  }, [simulationCountInput, statsContextKey, tab]);

  useEffect(() => {
    const requestedSimulationCount = Number(simulationCountInput);
    if (tab !== 'stats') return;
    const autoRunRequestedCount = shouldAutoRunGachaHistorySimulation(requestedSimulationCount);
    if (completedStatsForContext && (!autoRunRequestedCount || completedStatsForContext.simulationCount === requestedSimulationCount)) return;
    const count = autoRunRequestedCount ? requestedSimulationCount : DEFAULT_SIMULATION_COUNT;
    const purpose = autoRunRequestedCount ? 'requested' : 'baseline';
    const timeout = window.setTimeout(() => startStatsSimulation(count, purpose), 250);
    return () => window.clearTimeout(timeout);
  }, [completedStatsForContext, simulationCountInput, startStatsSimulation, statsContextKey, tab]);

  useEffect(
    () => () => {
      statsJobIdRef.current += 1;
      statsWorkerRef.current?.terminate();
    },
    [],
  );

  return { completedStatsForContext, isStatsCalculating, statsSimulationErrorKey, startStatsSimulation };
}
