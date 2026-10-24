import { useCallback, useEffect, useRef, useState } from 'react';
import AnalysisWorker from '../../../workers/eraidAnalysis.worker?worker';
import type { AnalysisFilters, AnalysisHistogramQuery, AnalysisHistogramResult, AnalysisResult, AnalysisWorkerRequest, AnalysisWorkerResponse } from './types/eraidAnalysis';
import { cdn } from '../../../utils/cdn';

interface Options {
  server: 'jp' | 'kr';
  season: string;
  scores: Int32Array;
  tierCounter: Record<string, number>;
  enabled: boolean;
  filters: AnalysisFilters;
}
interface State {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: AnalysisResult | null;
  error: string | null;
}
export function useERaidAnalysis({ server, season, scores, tierCounter, enabled, filters }: Options) {
  const [state, setState] = useState<State>({ status: 'idle', data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const [histogram, setHistogram] = useState<AnalysisHistogramResult | null>(null);
  const histogramRequestId = useRef(0);
  const histogramQueryRef = useRef<AnalysisHistogramQuery | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerFailed = useRef(false);
  const requestId = useRef(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle', data: null, error: null });
      return;
    }
    const worker = new AnalysisWorker();
    workerRef.current = worker;
    workerFailed.current = false;
    setHistogram(null);
    setState({ status: 'loading', data: null, error: null });
    worker.onmessage = ({ data }: MessageEvent<AnalysisWorkerResponse>) => {
      if (data.status === 'histogram') {
        if (data.requestId === histogramRequestId.current) setHistogram(data.data);
        return;
      }
      if (data.requestId !== requestId.current) return;
      if (data.status === 'ready') setState({ status: 'ready', data: data.data, error: null });
      else {
        workerFailed.current = true;
        setState({ status: 'error', data: null, error: data.error });
      }
    };
    worker.onerror = () => {
      workerFailed.current = true;
      setState({ status: 'error', data: null, error: 'worker-error' });
    };
    const copy = scores.slice();
    const message: AnalysisWorkerRequest = {
      type: 'init',
      requestId: ++requestId.current,
      url: cdn(`/fulldata/analysis-v1/${server}/${season}.bin`),
      server,
      season,
      scores: copy,
      tierCounter,
      filters: filtersRef.current,
      reload: attempt > 0,
    };
    worker.postMessage(message, [copy.buffer]);
    if (histogramQueryRef.current) worker.postMessage({ type: 'histogram', requestId: ++histogramRequestId.current, query: histogramQueryRef.current } satisfies AnalysisWorkerRequest);
    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [server, season, scores, tierCounter, enabled, attempt]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || workerFailed.current) return;
    setState((previous) => ({ ...previous, status: 'loading', error: null }));
    worker.postMessage({ type: 'filter', requestId: ++requestId.current, filters: { tier: filters.tier, bracket: filters.bracket } } satisfies AnalysisWorkerRequest);
  }, [filters.tier, filters.bracket]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const requestHistogram = useCallback((query: AnalysisHistogramQuery | null) => {
    histogramQueryRef.current = query;
    setHistogram(null);
    workerRef.current?.postMessage({ type: 'histogram', requestId: ++histogramRequestId.current, query } satisfies AnalysisWorkerRequest);
  }, []);
  return { ...state, retry, histogram, requestHistogram };
}
