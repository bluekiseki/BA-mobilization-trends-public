import { useEffect, useRef, useState } from 'react';
import JointChartWorker from '../../workers/jointChart.worker?worker';
import type { Ctx } from './logic/resourceApCost';
import type { JointChartRequest, JointChartResult, JointChartWorkerRequest, JointChartWorkerResponse } from './logic/jointChart';

interface State {
  result: JointChartResult | null;
  pending: boolean;
  failed: boolean;
}

/**
 * Solves the joint chart in a web worker. The previous result stays available while a new one is computed;
 * `failed` tells the caller to fall back to computing on the main thread.
 */
const IDLE: State = { result: null, pending: false, failed: false };

export function useJointChart(enabled: boolean, ctx: Ctx, request: JointChartRequest | null): State {
  const [state, setState] = useState<State>(IDLE);
  const workerRef = useRef<Worker | null>(null);
  const latestId = useRef(0);

  useEffect(() => {
    // A new worker starts clean: drop the stale result, an unanswered `pending` and any earlier failure.
    setState(IDLE);
    if (!enabled) return;
    let worker: Worker;
    try {
      worker = new JointChartWorker();
    } catch {
      setState((previous) => ({ ...previous, failed: true }));
      return;
    }
    workerRef.current = worker;
    worker.onmessage = ({ data }: MessageEvent<JointChartWorkerResponse>) => {
      if (data.requestId !== latestId.current) return;
      if (data.status === 'ready') setState({ result: data.result, pending: false, failed: false });
      else setState((previous) => ({ ...previous, pending: false, failed: true }));
    };
    worker.onerror = () => setState((previous) => ({ ...previous, pending: false, failed: true }));
    return () => {
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [enabled]);

  // The index lives in the worker; rebuild it whenever its inputs change.
  useEffect(() => {
    if (!enabled) return;
    try {
      workerRef.current?.postMessage({ type: 'init', ctx } satisfies JointChartWorkerRequest);
    } catch {
      // The context could not be structured-cloned; the caller falls back to the main thread.
      setState((previous) => ({ ...previous, pending: false, failed: true }));
    }
  }, [enabled, ctx]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!enabled || !worker) return;
    if (!request) {
      // Invalidate any in-flight solve so its late response cannot revive a stale result.
      latestId.current++;
      setState((previous) => (previous.pending || previous.result ? { ...previous, result: null, pending: false } : previous));
      return;
    }
    setState((previous) => (previous.pending ? previous : { ...previous, pending: true }));
    try {
      worker.postMessage({ type: 'solve', requestId: ++latestId.current, request } satisfies JointChartWorkerRequest);
    } catch {
      setState((previous) => ({ ...previous, pending: false, failed: true }));
    }
  }, [enabled, ctx, request]);

  return state;
}
