// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GachaHistoryEntry } from '~/types/gachaHistory';
import type { BannerPeriod } from '~/utils/gachaData';
import type { GachaHistoryStatsWorkerRequest, GachaHistoryStatsWorkerResponse } from '~/workers/gacha-history-stats.worker';
import type { BannerGachaHistoryStats, GachaHistoryStats } from './logic/gachaHistoryStats';
import { useGachaStatsSimulation, type CompletedStatsSimulation, type UseGachaStatsSimulationInput } from './useGachaStatsSimulation';

// Drives the hook through a full scenario with a fake worker and checks, after every step, the worker lifecycle
// log (create / post:jobId:count:includePerBanner:entries / terminate), the stored simulation count, the
// calculating flag, the error key and the completed result.

class FakeWorker {
  onmessage: ((event: MessageEvent<GachaHistoryStatsWorkerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(private readonly log: string[]) {
    log.push('create');
  }
  postMessage(request: GachaHistoryStatsWorkerRequest) {
    this.log.push(`post:${request.jobId}:${request.simulationCount}:${request.includePerBanner}:${request.entries.length}`);
  }
  terminate() {
    this.log.push('terminate');
  }
}

interface Probe {
  workers: FakeWorker[];
  log: string[];
  setCalls: number[];
  result: { completedStatsForContext: CompletedStatsSimulation | null; isStatsCalculating: boolean; statsSimulationErrorKey: string | null } | null;
}

type Props = Omit<UseGachaStatsSimulationInput, 'setSimulationCount' | 'createWorker'>;

function mount(probe: Probe) {
  const root = createRoot(document.createElement('div'));
  const createWorker = () => {
    const w = new FakeWorker(probe.log);
    probe.workers.push(w);
    return w as unknown as Worker;
  };
  const setSimulationCount = (n: number) => probe.setCalls.push(n);
  const Harness = (props: Props) => {
    probe.result = useGachaStatsSimulation({ ...props, setSimulationCount, createWorker });
    return null;
  };
  return {
    render: (props: Props) => act(() => root.render(createElement(Harness, props))),
    unmount: () => act(() => root.unmount()),
  };
}

const entries = [{ id: 'e1' }, { id: 'e2' }] as unknown as GachaHistoryEntry[];
const banners = new Map<string, BannerPeriod>();
const stats = (n: number) => ({ marker: n }) as unknown as GachaHistoryStats;
const perBanner = [] as BannerGachaHistoryStats[];
const base = { selectedEntries: entries, bannersById: banners, statsScope: 'all' as const };

const snapshot = (p: Probe) => {
  const completed = p.result?.completedStatsForContext;
  return {
    log: [...p.log],
    setCalls: [...p.setCalls],
    calculating: p.result?.isStatsCalculating,
    error: p.result?.statsSimulationErrorKey,
    completed: completed ? { key: completed.contextKey, count: completed.simulationCount, marker: (completed.stats as unknown as { marker: number }).marker } : null,
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useGachaStatsSimulation', () => {
  it('runs the worker lifecycle correctly over a full scenario (auto-run, replies, stale replies, cancel, error, unmount)', async () => {
    const probe: Probe = { workers: [], log: [], setCalls: [], result: null };
    const hook = mount(probe);
    const reply = (p: Probe, index: number, response: GachaHistoryStatsWorkerResponse) => p.workers[index].onmessage?.({ data: response } as MessageEvent<GachaHistoryStatsWorkerResponse>);
    const lastJob = (p: Probe) =>
      Number(
        p.log
          .filter((l) => l.startsWith('post:'))
          .at(-1)
          ?.split(':')[1],
      );
    const step = async (name: string, action: (m: typeof hook, p: Probe) => void, expected: ReturnType<typeof snapshot>) => {
      await act(async () => {
        action(hook, probe);
        await Promise.resolve();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(snapshot(probe), name).toEqual(expected);
    };

    await step('records tab: nothing runs', (m) => m.render({ ...base, tab: 'records', statsContextKey: 'A', simulationCountInput: '1000' }), {
      log: [],
      setCalls: [],
      calculating: false,
      error: null,
      completed: null,
    });
    await step('stats tab: auto-runs the requested count', (m) => m.render({ ...base, tab: 'stats', statsContextKey: 'A', simulationCountInput: '1000' }), {
      log: ['create', 'post:1:1000:true:2'],
      setCalls: [],
      calculating: true,
      error: null,
      completed: null,
    });
    await step('stale reply is ignored', (_m, p) => reply(p, 0, { type: 'done', jobId: lastJob(p) + 99, stats: stats(0), perBannerStats: perBanner }), {
      log: ['create', 'post:1:1000:true:2'],
      setCalls: [],
      calculating: true,
      error: null,
      completed: null,
    });
    await step('matching reply completes and stores the requested count', (_m, p) => reply(p, 0, { type: 'done', jobId: lastJob(p), stats: stats(1), perBannerStats: perBanner }), {
      log: ['create', 'post:1:1000:true:2', 'terminate'],
      setCalls: [1000],
      calculating: false,
      error: null,
      completed: { key: 'A', count: 1000, marker: 1 },
    });
    await step('count above default runs a baseline instead', (m) => m.render({ ...base, tab: 'stats', statsContextKey: 'A', simulationCountInput: '50000' }), {
      log: ['create', 'post:1:1000:true:2', 'terminate'],
      setCalls: [1000],
      calculating: false,
      error: null,
      completed: { key: 'A', count: 1000, marker: 1 },
    });
    await step('baseline reply does not store the count', (_m, p) => reply(p, p.workers.length - 1, { type: 'done', jobId: lastJob(p), stats: stats(2), perBannerStats: perBanner }), {
      log: ['create', 'post:1:1000:true:2', 'terminate', 'terminate'],
      setCalls: [1000, 1000],
      calculating: false,
      error: null,
      completed: { key: 'A', count: 1000, marker: 2 },
    });
    await step('new context while idle restarts', (m) => m.render({ ...base, tab: 'stats', statsContextKey: 'B', simulationCountInput: '1000' }), {
      log: ['create', 'post:1:1000:true:2', 'terminate', 'terminate', 'create', 'post:2:1000:true:2'],
      setCalls: [1000, 1000],
      calculating: true,
      error: null,
      completed: null,
    });
    await step('changing the input mid-run cancels the active request', (m) => m.render({ ...base, tab: 'stats', statsContextKey: 'B', simulationCountInput: '2000' }), {
      log: ['create', 'post:1:1000:true:2', 'terminate', 'terminate', 'create', 'post:2:1000:true:2', 'terminate', 'create', 'post:4:2000:true:2'],
      setCalls: [1000, 1000],
      calculating: true,
      error: null,
      completed: null,
    });
    await step('worker error sets the error key', (_m, p) => reply(p, p.workers.length - 1, { type: 'error', jobId: lastJob(p), message: 'boom' }), {
      log: ['create', 'post:1:1000:true:2', 'terminate', 'terminate', 'create', 'post:2:1000:true:2', 'terminate', 'create', 'post:4:2000:true:2', 'terminate'],
      setCalls: [1000, 1000],
      calculating: false,
      error: 'B:2000',
      completed: null,
    });
    await step('banner scope drops the per-banner request', (m) => m.render({ ...base, tab: 'stats', statsContextKey: 'C', statsScope: 'banner', simulationCountInput: '1000' }), {
      log: ['create', 'post:1:1000:true:2', 'terminate', 'terminate', 'create', 'post:2:1000:true:2', 'terminate', 'create', 'post:4:2000:true:2', 'terminate', 'create', 'post:5:1000:false:2'],
      setCalls: [1000, 1000],
      calculating: true,
      error: null,
      completed: null,
    });
    await step('onerror also reports the error', (_m, p) => p.workers[p.workers.length - 1].onerror?.(), {
      log: [
        'create',
        'post:1:1000:true:2',
        'terminate',
        'terminate',
        'create',
        'post:2:1000:true:2',
        'terminate',
        'create',
        'post:4:2000:true:2',
        'terminate',
        'create',
        'post:5:1000:false:2',
        'terminate',
      ],
      setCalls: [1000, 1000],
      calculating: false,
      error: 'C:1000',
      completed: null,
    });
    await step('leaving the stats tab', (m) => m.render({ ...base, tab: 'records', statsContextKey: 'C', statsScope: 'banner', simulationCountInput: '1000' }), {
      log: [
        'create',
        'post:1:1000:true:2',
        'terminate',
        'terminate',
        'create',
        'post:2:1000:true:2',
        'terminate',
        'create',
        'post:4:2000:true:2',
        'terminate',
        'create',
        'post:5:1000:false:2',
        'terminate',
      ],
      setCalls: [1000, 1000],
      calculating: false,
      error: 'C:1000',
      completed: null,
    });
    await step('invalid input falls back to the default baseline', (m) => m.render({ ...base, tab: 'stats', statsContextKey: 'D', simulationCountInput: 'abc' }), {
      log: [
        'create',
        'post:1:1000:true:2',
        'terminate',
        'terminate',
        'create',
        'post:2:1000:true:2',
        'terminate',
        'create',
        'post:4:2000:true:2',
        'terminate',
        'create',
        'post:5:1000:false:2',
        'terminate',
        'create',
        'post:6:10000:true:2',
      ],
      setCalls: [1000, 1000],
      calculating: true,
      error: null,
      completed: null,
    });

    hook.unmount();
    expect(probe.log).toEqual([
      'create',
      'post:1:1000:true:2',
      'terminate',
      'terminate',
      'create',
      'post:2:1000:true:2',
      'terminate',
      'create',
      'post:4:2000:true:2',
      'terminate',
      'create',
      'post:5:1000:false:2',
      'terminate',
      'create',
      'post:6:10000:true:2',
      'terminate',
    ]);
  });
});
