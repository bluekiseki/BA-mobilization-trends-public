// app/components/gacha/IncomePlannerPanelV3.tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { FaChevronDown } from 'react-icons/fa';
import { CustomNumberInput } from '../../common/CustomInput';

import 'rc-tooltip/assets/bootstrap.css';

import IncomeSettingsPanelV3 from './IncomeSettingsPanelV3';
import APSchedulePanelV3 from './APSchedulePanelV3';
import { simulationKeyV3 } from './plannerStateV3';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';
import {
  runGlobalSimulation,
  buildGlobalResultFromRaw,
  buildWasmPayload,
  mergeSimAccumulator,
  SimMetricAccumulator,
  PYROXENE_PER_10PULL,
  PYROXENE_PER_PULL_UNIT,
  PULL_UNITS_PER_10PULL,
  type GlobalAggregatedResult,
  type SimulationConfig,
  type SimRawAccumulator,
  type SimChunkAcc,
} from '~/utils/gachaEngine';
import type { BannerPeriod } from '~/utils/gachaData';
import type { BannerStrategy, Student } from '~/types/gacha';
import { buildInitialTicketBatches, clampCharge, type CustomIncome, type PlannerSchedule, type PyroxeneConfig, type SimulationStats } from '~/utils/pyroxeneCalc';

import SimulationResultViewV3 from './SimulationResultViewV3';
import GachaSimWorker from '~/workers/gacha-sim.worker?worker';

type SimWorkerOutMsg =
  | { type: 'progress'; chunkAcc: SimChunkAcc; completed: number; total: number }
  | { type: 'done'; chunkAcc: SimChunkAcc; completed: number; total: number; totalMs: number }
  | { type: 'error'; message: string };

const WORKER_COUNT = typeof navigator !== 'undefined' ? Math.min(navigator.hardwareConcurrency ?? 4, 8) : 1;

const formatDuration = (ms: number): string => {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms >= 1) return `${ms.toFixed(1)}ms`;
  return `${(ms * 1000).toFixed(0)}μs`;
};

const monoStyle = { fontFamily: 'inherit' };
const fmt = (n: number) => Math.round(n).toLocaleString();
const KPI_PERCENTILE_PRESETS = [90, 96, 99];
// Feasibility below this percent is flagged red, matching the default KPI percentile.
const FEASIBILITY_WARN_PERCENT = 96;

interface Props {
  timeline: ReactNode;
  plan: (state: 'empty' | 'running' | 'stale' | 'ready') => ReactNode;
  kpiBalance: number | null;
  kpiPercentile: number;
  onKpiPercentileChange: (value: number) => void;
  config: PyroxeneConfig & { customIncomes?: CustomIncome[] };
  setConfig: React.Dispatch<React.SetStateAction<PyroxeneConfig & { customIncomes?: CustomIncome[] }>>;
  schedules: PlannerSchedule[];
  apOverrides: Record<string, number>;
  onApChange: (id: string, val: string) => void;
  banners: BannerPeriod[];
  strategies: Record<string, BannerStrategy>;
  allStudents: Student[];
  /** Server region — determines when Archive Recruitment starts excluding ARCHIVE_STUDENT_IDS from the normal off-rate pool. */
  region: 'KR' | 'JP';
  /** Student IDs the player already owns (from the Student Planner's growth-plan roster) — dupe pulls of these pay eligma from the very first roll of the sim. */
  ownedStudentIds?: number[];
  pyroxeneIcon?: string | null;
  apIcon?: string | null;
  elephIconMap?: Record<string, string>;
  ticket1Icon?: string | null;
  ticket10Icon?: string | null;
  gachaSimResult: GlobalAggregatedResult | null;
  setGachaSimResult: (next: GlobalAggregatedResult | null) => void;
  bankruptcyRate: number | null;
  stats: SimulationStats;
  minMaxCdf: number;
  hasSimulation: boolean;
  simulationDays: number;
}

type SimLevelId = '10k' | '100k' | '1m' | 'manual';
// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function IncomePlannerPanelV3({
  timeline,
  plan,
  kpiBalance,
  kpiPercentile,
  onKpiPercentileChange,
  config,
  setConfig,
  schedules,
  apOverrides,
  onApChange,
  banners,
  strategies,
  allStudents,
  region,
  ownedStudentIds,
  pyroxeneIcon,
  ticket1Icon,
  ticket10Icon,
  elephIconMap = {},
  gachaSimResult,
  setGachaSimResult,
  bankruptcyRate,
  stats,
}: Props) {
  const { t: tg, i18n } = useTranslation('planner', { keyPrefix: 'gacha' });
  const { t: tr } = useTranslation('planner', { keyPrefix: 'gacha.result' });
  const { t: tBase } = useTranslation('planner');
  const { t: tUi } = useTranslation('ui');
  const { t: tGame } = useTranslation('game');
  const { t: tJukebox } = useTranslation('jukebox');
  const locale = i18n.language as Locale;
  const ownedStudentCount = ownedStudentIds?.length ?? 0;
  const [applyOwnedStudents, setApplyOwnedStudents] = useState(false);
  const [kpiCustomMode, setKpiCustomMode] = useState(() => !KPI_PERCENTILE_PRESETS.includes(kpiPercentile));
  const [kpiInputText, setKpiInputText] = useState(() => String(kpiPercentile));
  const [kpiMenuOpen, setKpiMenuOpen] = useState(false);
  const kpiMenuRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!kpiMenuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !kpiMenuRef.current?.contains(event.target)) setKpiMenuOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [kpiMenuOpen]);
  const effectiveOwnedStudentIds = applyOwnedStudents ? (ownedStudentIds ?? []) : [];

  const SIM_LEVELS: { id: SimLevelId; label: string; n: number | null }[] = [
    { id: '10k', label: tg('sim_levels.10k'), n: 10_000 },
    { id: '100k', label: tg('sim_levels.100k'), n: 100_000 },
    { id: '1m', label: tg('sim_levels.1m'), n: 1_000_000 },
    { id: 'manual', label: tg('sim_levels.manual'), n: null },
  ];

  const [levelId, setLevelId] = useState<SimLevelId>('100k');
  const [customN, setCustomN] = useState(50_000);
  const [isSimulating, setIsSimulating] = useState(false);
  const [useWasm, setUseWasm] = useState(true);
  const [simProgress, setSimProgress] = useState<{ completed: number; total: number } | null>(null);
  const [simTiming, setSimTiming] = useState<{ totalMs: number; count: number } | null>(null);

  const workerRefs = useRef<Worker[]>([]);
  const runIdRef = useRef(0);
  const workerCompletedRef = useRef<number[]>([]);
  const workerDoneCountRef = useRef(0);
  const mergedAccRef = useRef<SimRawAccumulator | null>(null);
  const chartRafRef = useRef<number | null>(null);
  const simStartTimeRef = useRef(0);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarPassed, setToolbarPassed] = useState(false);
  const pageEndRef = useRef<HTMLDivElement>(null);
  const [pageEndVisible, setPageEndVisible] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [resultsVisible, setResultsVisible] = useState(true);
  const [runConditions, setRunConditions] = useState<string | null>(null);
  const [simError, setSimError] = useState('');
  const conditions = simulationKeyV3(strategies, config, schedules, banners, allStudents, region, effectiveOwnedStudentIds);
  const [runSnapshot, setRunSnapshot] = useState<{ strategies: Props['strategies']; banners: BannerPeriod[]; ownedCount: number } | null>(null);
  const runningRef = useRef(false);
  const conditionsChanged = runConditions !== null && runConditions !== conditions;
  const stale = gachaSimResult !== null && conditionsChanged;
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setToolbarPassed(!entry.isIntersecting && entry.boundingClientRect.bottom < 0));
    if (toolbarRef.current) observer.observe(toolbarRef.current);
    const resultObserver = new IntersectionObserver(([entry]) => setResultsVisible(entry.isIntersecting));
    if (resultsRef.current) resultObserver.observe(resultsRef.current);
    const pageEndObserver = new IntersectionObserver(([entry]) => setPageEndVisible(entry.isIntersecting), { rootMargin: '0px 0px 96px 0px' });
    if (pageEndRef.current) pageEndObserver.observe(pageEndRef.current);
    return () => {
      observer.disconnect();
      resultObserver.disconnect();
      pageEndObserver.disconnect();
    };
  }, []);
  useEffect(
    () => () => {
      runIdRef.current++;
      workerRefs.current.forEach((worker) => worker.terminate());
      if (chartRafRef.current !== null) cancelAnimationFrame(chartRafRef.current);
    },
    [],
  );
  const simCount = levelId === 'manual' ? Math.max(1000, Math.min(10000000, customN)) : (SIM_LEVELS.find((l) => l.id === levelId)?.n ?? 100_000);
  const simProgressPercent = simProgress && simProgress.total > 0 ? Math.min(100, (simProgress.completed / simProgress.total) * 100) : 0;

  const bannersMap = banners.reduce<Record<string, BannerPeriod>>((acc, b) => {
    acc[b.id] = b;
    return acc;
  }, {});

  const handleRun = () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setGachaSimResult(null);
    setRunSnapshot({ strategies: structuredClone(strategies), banners, ownedCount: effectiveOwnedStudentIds.length });
    setRunConditions(conditions);
    setSimError('');
    try {
      const initialTicketBatches = buildInitialTicketBatches(config, schedules);
      const consumeExpiringTickets = config.consumeExpiringTickets ?? true;
      const initialCharge = { normal: clampCharge(config.chargeNormal), limited: clampCharge(config.chargeLimited) };
      if (useWasm) {
        if (workerRefs.current.length === 0) {
          for (let i = 0; i < WORKER_COUNT; i++) workerRefs.current.push(new GachaSimWorker());
        }
        const payload = buildWasmPayload(
          Object.values(strategies),
          bannersMap as unknown as Parameters<typeof buildWasmPayload>[1],
          allStudents,
          effectiveOwnedStudentIds,
          initialTicketBatches,
          consumeExpiringTickets,
          region,
          initialCharge,
        );
        const { strategiesJson, bannerPoolsJson, activeBannerIds, initialOwnedIds, ticketBatchesJson, initialChargeNormal, initialChargeLimited } = payload;
        const runId = ++runIdRef.current;
        const N = workerRefs.current.length;
        const perWorker = Math.ceil(simCount / N);
        workerCompletedRef.current = Array(N).fill(0) as number[];
        workerDoneCountRef.current = 0;
        mergedAccRef.current = {
          cost: new SimMetricAccumulator(PYROXENE_PER_10PULL),
          costIncremental: new SimMetricAccumulator(PYROXENE_PER_10PULL),
          costWithTickets: new SimMetricAccumulator(PYROXENE_PER_PULL_UNIT),
          costWithGachaTickets: new SimMetricAccumulator(PYROXENE_PER_PULL_UNIT),
          costWithGachaTicketsIncremental: new SimMetricAccumulator(PYROXENE_PER_PULL_UNIT),
          pulls: new SimMetricAccumulator(PULL_UNITS_PER_10PULL),
          pullsIncremental: new SimMetricAccumulator(PULL_UNITS_PER_10PULL),
          eligmaCumulative: new SimMetricAccumulator(1),
          eligmaIncremental: new SimMetricAccumulator(1),
          bannerStatsSum: Object.fromEntries(activeBannerIds.map((id) => [id, { pulls: 0, cost: 0 }])),
          studentAcquired: {},
          studentElephTotal: {},
          studentElephDist: {},
          bannerStudentElephDist: Object.fromEntries(activeBannerIds.map((id) => [id, {}])),
          successCount: 0,
        };
        if (chartRafRef.current !== null) {
          cancelAnimationFrame(chartRafRef.current);
          chartRafRef.current = null;
        }
        simStartTimeRef.current = performance.now();
        setIsSimulating(true);
        setSimProgress({ completed: 0, total: simCount });

        const abortRun = (message: string) => {
          if (runIdRef.current !== runId) return;
          runIdRef.current++;
          console.error('Sim worker error:', message);
          setSimError(tBase('gacha.v3.run.err_finish'));
          workerRefs.current.forEach((worker) => worker.terminate());
          workerRefs.current = [];
          if (chartRafRef.current !== null) {
            cancelAnimationFrame(chartRafRef.current);
            chartRafRef.current = null;
          }
          runningRef.current = false;
          setIsSimulating(false);
          setSimProgress(null);
          setGachaSimResult(null);
        };

        workerRefs.current.forEach((worker, i) => {
          const workerSimCount = i === N - 1 ? simCount - perWorker * (N - 1) : perWorker;
          worker.onmessage = (e: MessageEvent<SimWorkerOutMsg>) => {
            if (runIdRef.current !== runId) return;
            const msg = e.data;
            if (msg.type === 'error') {
              abortRun(msg.message);
              return;
            }
            if (mergedAccRef.current) mergeSimAccumulator(mergedAccRef.current, msg.chunkAcc);
            workerCompletedRef.current[i] = msg.completed;
            const totalCompleted = workerCompletedRef.current.reduce((a, b) => a + b, 0);
            setSimProgress({ completed: totalCompleted, total: simCount });
            if (chartRafRef.current === null) {
              chartRafRef.current = requestAnimationFrame(() => {
                chartRafRef.current = null;
                if (runIdRef.current !== runId || !mergedAccRef.current) return;
                const tc = workerCompletedRef.current.reduce((a, b) => a + b, 0);
                setGachaSimResult(buildGlobalResultFromRaw(mergedAccRef.current, tc, [], bannersMap as unknown as Parameters<typeof buildGlobalResultFromRaw>[3]));
              });
            }
            if (msg.type === 'done') {
              workerDoneCountRef.current++;
              if (workerDoneCountRef.current === N) {
                if (chartRafRef.current !== null) {
                  cancelAnimationFrame(chartRafRef.current);
                  chartRafRef.current = null;
                }
                const totalMs = performance.now() - simStartTimeRef.current;
                const finalResult = buildGlobalResultFromRaw(mergedAccRef.current as SimRawAccumulator, simCount, allStudents, bannersMap as unknown as Parameters<typeof buildGlobalResultFromRaw>[3]);
                setGachaSimResult(finalResult);
                setSimTiming({ totalMs, count: simCount });
                setSimProgress(null);
                runningRef.current = false;
                setIsSimulating(false);
              }
            }
          };
          worker.onerror = (event) => {
            abortRun(event.message || 'The simulation worker stopped unexpectedly.');
          };
          worker.onmessageerror = () => {
            abortRun('The simulation worker returned an unreadable result.');
          };
          worker.postMessage({
            strategiesJson,
            bannerPoolsJson,
            simCount: workerSimCount,
            seed: Date.now() + i * 0x10000 + Math.floor(Math.random() * 0xffff),
            initialOwnedIds,
            ticketBatchesJson,
            consumeExpiringTickets,
            initialChargeNormal,
            initialChargeLimited,
          });
        });
      } else {
        const jsRunId = ++runIdRef.current;
        setIsSimulating(true);
        setTimeout(() => {
          if (runIdRef.current !== jsRunId) return;
          try {
            const simConfig: SimulationConfig = { initialPyroxenes: config.currentPyroxene, simCount };
            const start = performance.now();
            const res = runGlobalSimulation(
              Object.values(strategies),
              bannersMap as unknown as Parameters<typeof runGlobalSimulation>[1],
              allStudents,
              simConfig,
              effectiveOwnedStudentIds,
              initialTicketBatches,
              consumeExpiringTickets,
              region,
              initialCharge,
            );
            setSimTiming({ totalMs: performance.now() - start, count: simCount });
            setGachaSimResult(res);
          } catch (e) {
            console.error(e);
            setSimError(tr('alert_error'));
          } finally {
            runningRef.current = false;
            setIsSimulating(false);
          }
        }, 100);
      }
    } catch (error) {
      console.error(error);
      runIdRef.current++;
      workerRefs.current.forEach((worker) => worker.terminate());
      workerRefs.current = [];
      runningRef.current = false;
      setIsSimulating(false);
      setSimProgress(null);
      setGachaSimResult(null);
      setSimError(tBase('gacha.v3.run.err_start'));
    }
  };

  const progressBar = simProgress ? (
    <div className="mt-3 space-y-1">
      <div className="h-1 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${simProgressPercent}%`, background: '#77e0ff' }} />
      </div>
      <p className="text-xs text-neutral-400" style={monoStyle}>
        {simProgress.completed.toLocaleString()} / {simProgress.total.toLocaleString()}
        &nbsp;({simProgressPercent.toFixed(1)}%)
      </p>
    </div>
  ) : null;

  const resultProps = {
    result: gachaSimResult,
    initialPyroxenes: config.currentPyroxene,
    pyroxeneIcon,
    elephIconMap,
    bankruptcyRate,
    strategies: runSnapshot?.strategies ?? strategies,
    banners: runSnapshot?.banners ?? banners,
    allStudents,
    ownedStudentCount: runSnapshot?.ownedCount ?? 0,
  };
  const runButton = (
    <button type="button" className="v3-primary" onClick={handleRun} disabled={isSimulating}>
      {isSimulating ? tBase('button.simRunning') : stale ? tBase('gacha.v3.run.recalc') : tg('tabs.result')}
    </button>
  );
  const resultState = isSimulating ? 'running' : stale ? 'stale' : gachaSimResult ? 'ready' : 'empty';
  const incomeLabels: Record<string, string> = {
    dailyMission: tBase('gacha.v3.summary.daily_mission'),
    weeklyMission: tBase('gacha.v3.summary.weekly_mission'),
    arona: tBase('apSource.attendance'),
    pvp: tGame('tacticalChallenge'),
    monthlyCard: tBase('gacha.v3.summary.monthly_card'),
    raid: tGame('raid'),
    elimination: tGame('eraid'),
    multifloor: tGame('multifloor'),
    jfd: tGame('jfd'),
    event: tGame('event'),
    mainstory: tBase('gacha.v3.summary.mainstory'),
    miniStory: tJukebox('category.mini_story'),
    maintenance: tBase('gacha.income.stats.items.maintenance'),
    extra: tBase('gacha.v3.summary.extra'),
  };
  const totalIncome = Object.values(stats.income).reduce((sum, value) => sum + value, 0);
  const finalBalance = config.currentPyroxene + totalIncome - stats.expense.gacha - stats.expense.ap;
  return (
    <div className="space-y-8 lg:space-y-10">
      {gachaSimResult && (
        <section className="v3-kpi-strip" aria-label={tBase('gacha.v3.kpi.aria')}>
          <div>
            <p>{tBase('gacha.v3.kpi.feasibility')}</p>
            <strong className={bankruptcyRate !== null && 100 - bankruptcyRate < FEASIBILITY_WARN_PERCENT ? 'text-red-600 dark:text-red-400' : ''}>
              {bankruptcyRate === null ? '—' : `${(100 - bankruptcyRate).toFixed(1)}%`}
            </strong>
          </div>
          <div>
            <p>
              {tBase('gacha.v3.kpi.lower_prefix')}{' '}
              <span className="v3-kpi-percentile-anchor" ref={kpiMenuRef}>
                <button type="button" className="v3-kpi-percentile-trigger" aria-haspopup="listbox" aria-expanded={kpiMenuOpen} onClick={() => setKpiMenuOpen((visible) => !visible)}>
                  {kpiPercentile}%
                  <FaChevronDown className={`v3-disclosure-chevron ${kpiMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {kpiMenuOpen && (
                  <div className="v3-kpi-percentile-dropdown" role="listbox" aria-label={tBase('gacha.v3.kpi.percentile_aria')}>
                    {KPI_PERCENTILE_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        aria-pressed={!kpiCustomMode && kpiPercentile === preset}
                        onClick={() => {
                          setKpiCustomMode(false);
                          onKpiPercentileChange(preset);
                          setKpiMenuOpen(false);
                        }}
                      >
                        {preset}%
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-pressed={kpiCustomMode}
                      onClick={() => {
                        setKpiInputText(String(kpiPercentile));
                        setKpiCustomMode(true);
                      }}
                    >
                      {tg('result.panel.manual_input_label')}
                    </button>
                    {kpiCustomMode && (
                      <span className="v3-percent-field">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="v3-kpi-percentile-input"
                          aria-label={tBase('gacha.v3.kpi.custom_aria')}
                          value={kpiInputText}
                          onChange={(event) => {
                            const next = event.target.value.replace(',', '.');
                            if (!/^\d*(?:\.\d?)?$/.test(next)) return;
                            setKpiInputText(next);
                            const parsed = parseFloat(next);
                            if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 100) onKpiPercentileChange(parsed);
                          }}
                        />
                        <span className="v3-percent-suffix" aria-hidden="true">
                          %
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </span>{' '}
              {tBase('gacha.v3.kpi.surplus_suffix')}
            </p>
            <strong className={kpiBalance !== null && kpiBalance < 0 ? 'text-red-600 dark:text-red-400' : ''}>{kpiBalance === null ? '—' : Math.round(kpiBalance).toLocaleString()}</strong>
          </div>
        </section>
      )}
      <div id="gacha-v3-results" ref={resultsRef} className="v3-workspace-grid scroll-mt-4">
        <section className="min-w-0" aria-label={tBase('gacha.v3.timeline.title')}>
          {timeline}
        </section>
        <section aria-label={tBase('gacha.v3.analysis.title')} className="min-w-0 scroll-mt-6">
          <h2 className="v3-section-title mb-2">{tBase('gacha.v3.analysis.title')}</h2>
          {gachaSimResult ? <SimulationResultViewV3 {...resultProps} section="analysis" /> : <p className="text-neutral-500 dark:text-neutral-400">{tBase('gacha.v3.analysis.empty')}</p>}
        </section>
      </div>
      <div className="v3-planning-grid v3-major-boundary">
        <section className="v3-run-section min-w-0" aria-label={tg('tabs.result')}>
          <div className="space-y-3">
            <h2 className="v3-section-title">{tUi('simulation')}</h2>
            <div ref={toolbarRef} className="v3-run-toolbar">
              <p role="status" className={`v3-run-status ${stale ? 'text-amber-700 dark:text-amber-400' : 'text-neutral-600 dark:text-neutral-400'}`}>
                {isSimulating
                  ? conditionsChanged
                    ? tBase('gacha.v3.run.running_prev')
                    : tBase('button.simRunning')
                  : stale
                    ? tBase('gacha.v3.run.stale')
                    : gachaSimResult
                      ? tBase('gacha.v3.run.done')
                      : tBase('gacha.v3.run.empty')}
              </p>
              {runButton}
              <details className="v3-options">
                <summary className="v3-disclosure-summary">
                  <span className="v3-disclosure-title">{tg('income.settings.title')}</span>
                  <span className="v3-disclosure-end">
                    <span className="v3-disclosure-meta">
                      {levelId === 'manual' ? `${customN.toLocaleString()}${tg('income.timeline.unit_times')}` : SIM_LEVELS.find((level) => level.id === levelId)?.label} · {useWasm ? 'WASM' : 'JS'}
                    </span>
                    <FaChevronDown className="v3-disclosure-chevron" aria-hidden="true" />
                  </span>
                </summary>
                <div className="v3-run-options">
                  <div className="v3-run-option-group">
                    <fieldset className="v3-run-setting">
                      <legend>{tg('result.panel.iteration_count')}</legend>
                      <div className="v3-sim-count-control">
                        <div role="group" aria-label={tBase('gacha.v3.sim.count_preset_aria')} className="v3-segment grid grid-cols-3">
                          {SIM_LEVELS.filter((level) => level.id !== 'manual').map((level) => (
                            <button key={level.id} type="button" aria-pressed={levelId === level.id} onClick={() => setLevelId(level.id)}>
                              {level.label}
                            </button>
                          ))}
                        </div>
                        <label className={`v3-direct-count ${levelId === 'manual' ? 'v3-direct-count-active' : ''}`}>
                          <span className="sr-only">{tBase('gacha.v3.sim.count_manual')}</span>
                          <CustomNumberInput
                            aria-label={tBase('gacha.v3.sim.count_manual')}
                            min={1000}
                            max={10000000}
                            value={customN}
                            onFocus={(event) => {
                              setLevelId('manual');
                              event.currentTarget.select();
                            }}
                            onChange={(value) => {
                              setLevelId('manual');
                              setCustomN(value ?? 1000);
                            }}
                          />
                          <span>{tg('income.timeline.unit_times')}</span>
                        </label>
                      </div>
                    </fieldset>
                  </div>
                  <div className="v3-run-option-group">
                    <fieldset className="v3-run-setting">
                      <legend>{tBase('gacha.v3.sim.engine')}</legend>
                      <div role="group" aria-label={tBase('gacha.v3.sim.engine')} className="v3-segment grid grid-cols-2">
                        <button type="button" aria-pressed={useWasm} onClick={() => setUseWasm(true)}>
                          WASM
                        </button>
                        <button type="button" aria-pressed={!useWasm} onClick={() => setUseWasm(false)}>
                          JS
                        </button>
                      </div>
                    </fieldset>
                  </div>
                  <div className="v3-run-option-group v3-owned-setting">
                    <h3>{tBase('gacha.v3.sim.owned_title')}</h3>
                    <label className="flex min-h-9 items-center gap-2">
                      <input type="checkbox" checked={applyOwnedStudents} onChange={(event) => setApplyOwnedStudents(event.target.checked)} />
                      <span>{tr('panel.owned_students_toggle_label')}</span>
                    </label>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {effectiveOwnedStudentIds.length}/{ownedStudentCount}
                      {tBase('affectionTab.units.students')} ·{' '}
                      <Link to={localeLink(locale, '/students?view=table')} className="underline">
                        {tBase('button.goToPlanner')}
                      </Link>
                    </p>
                  </div>
                </div>
                {simTiming && (
                  <p className="v3-run-timing text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                    {simTiming.count.toLocaleString()}
                    {tg('income.timeline.unit_times')} · {formatDuration(simTiming.totalMs)} · {Math.round(simTiming.count / (simTiming.totalMs / 1000)).toLocaleString()}/s
                  </p>
                )}
              </details>
            </div>
            {simError && (
              <p role="alert" className="text-red-600 dark:text-red-400">
                {simError}
              </p>
            )}
            {progressBar}
          </div>
        </section>
        <div id="gacha-v3-plan" className="v3-plan-section min-w-0 scroll-mt-4">
          {plan(resultState)}
        </div>
        <section id="gacha-v3-income" className="v3-income-section min-w-0 scroll-mt-4">
          <h2 className="v3-section-title mb-3">{tBase('gacha.v3.summary.title')}</h2>
          <IncomeSettingsPanelV3 config={config} setConfig={setConfig} schedules={schedules} pyroxeneIcon={pyroxeneIcon} ticket1Icon={ticket1Icon} ticket10Icon={ticket10Icon}>
            <section aria-label={tg('income.timeline.title')}>
              <APSchedulePanelV3
                schedules={schedules}
                apOverrides={apOverrides}
                onApChange={onApChange}
                apRefreshes_event={config.apRefreshes_event}
                apRefreshes_normal={config.apRefreshes_normal}
                apRefreshes_campaigns={config.apRefreshes_campaigns}
                onCampaignBulkChange={(key, value) =>
                  setConfig((previous) => {
                    const campaigns = { ...previous.apRefreshes_campaigns };
                    if (value === -1) delete campaigns[key];
                    else campaigns[key] = value;
                    return { ...previous, apRefreshes_campaigns: campaigns };
                  })
                }
                onApRefreshChange={(key, value) => setConfig((previous) => ({ ...previous, [key]: value }))}
              />
            </section>
          </IncomeSettingsPanelV3>
        </section>
      </div>
      <div className="v3-detail-grid v3-major-boundary">
        {gachaSimResult && (
          <details className="v3-student-detail">
            <summary className="v3-disclosure-summary v3-disclosure-section">
              <span>{tBase('gacha.v3.summary.students_result')}</span>
              <FaChevronDown className="v3-disclosure-chevron" aria-hidden="true" />
            </summary>
            <div className="v3-detail-body">
              <SimulationResultViewV3 {...resultProps} section="students" />
            </div>
          </details>
        )}
        <details className="v3-ledger-detail">
          <summary className="v3-disclosure-summary v3-disclosure-section">
            <span>{tBase('gacha.v3.summary.ledger')}</span>
            <FaChevronDown className="v3-disclosure-chevron" aria-hidden="true" />
          </summary>
          <dl className="v3-detail-body space-y-3 tabular-nums">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{tBase('gacha.v3.summary.income')}</div>
            {Object.entries(stats.income)
              .filter(([, value]) => value !== 0)
              .map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4">
                  <dt>{incomeLabels[key] ?? key}</dt>
                  <dd>{fmt(value)}</dd>
                </div>
              ))}
            <div className="border-t border-neutral-200 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              {tBase('gacha.v3.summary.expense')}
            </div>
            {[
              [tBase('gacha.v3.summary.gacha_expense'), -stats.expense.gacha],
              [tBase('gacha.income.stats.items.ap_refresh'), -stats.expense.ap],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt>{label}</dt>
                <dd>{Number(value).toLocaleString()}</dd>
              </div>
            ))}
            <div className="border-t border-neutral-300 pt-3 dark:border-neutral-700" />
            {[
              [tBase('gacha.v3.summary.total_income'), totalIncome],
              [tg('net_income'), totalIncome - stats.expense.gacha - stats.expense.ap],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 font-semibold">
                <dt>{label}</dt>
                <dd>{Number(value).toLocaleString()}</dd>
              </div>
            ))}
            <div className="flex items-end justify-between gap-4 border-t-2 border-neutral-400 pt-4 dark:border-neutral-500">
              <dt className="font-semibold">{tBase('gacha.v3.summary.final_balance')}</dt>
              <dd className="text-xl font-semibold">{Math.round(finalBalance).toLocaleString()}</dd>
            </div>
          </dl>
        </details>
      </div>
      <div ref={pageEndRef} aria-hidden="true" className="!mt-0 h-px" />
      {toolbarPassed && !pageEndVisible && !isSimulating && (
        <div className="v3-floating-actions fixed z-30 flex items-center gap-2">
          {gachaSimResult && !resultsVisible && (
            <button className="v3-button" onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' })}>
              {tBase('gacha.v3.summary.view_results')}
            </button>
          )}
          {gachaSimResult && resultsVisible && (
            <button className="v3-button" onClick={() => document.getElementById('gacha-v3-plan')?.scrollIntoView({ behavior: 'smooth' })}>
              {tBase('gacha.v3.summary.edit_plan')}
            </button>
          )}
          {runButton}
        </div>
      )}
    </div>
  );
}
