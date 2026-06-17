// app/components/gacha/IncomePlannerPanel_v2.tsx
import { useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { CustomNumberInput } from '../CustomInput';
import { FaBolt, FaChartPie } from 'react-icons/fa';
import { runGlobalSimulation, buildGlobalResultFromRaw, buildWasmPayload, mergeSimAccumulator, type GlobalAggregatedResult, type SimulationConfig, type SimRawAccumulator } from '~/utils/gachaEngine';
import type { PyroxeneConfig } from '~/routes/planner/Gacha_v2';
import type { BannerPeriod } from '~/utils/gachaData';
import type { BannerStrategy, Student } from '~/types/gacha';
import type { PlannerSchedule, SimulationStats } from '~/utils/pyroxeneCalc';
import IncomeSettingsPanel_v2, { type CustomIncome } from './IncomeSettingsPanel_v2';
import APSchedulePanel_v2 from './APSchedulePanel_v2';
import SimulationResultView_v2 from './SimulationResultView_v2';
import GachaSimWorker from '~/workers/gacha-sim.worker?worker';

export type { CustomIncome };

type SimWorkerOutMsg =
  | { type: 'progress'; chunkAcc: SimRawAccumulator; completed: number; total: number }
  | { type: 'done'; chunkAcc: SimRawAccumulator; completed: number; total: number; totalMs: number }
  | { type: 'error'; message: string };

const WORKER_COUNT = typeof navigator !== 'undefined' ? Math.min(navigator.hardwareConcurrency ?? 4, 8) : 1;

const formatDuration = (ms: number): string => {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms >= 1) return `${ms.toFixed(1)}ms`;
  return `${(ms * 1000).toFixed(0)}μs`;
};

const monoStyle = { fontFamily: 'ui-monospace, monospace' };
const fmt = (n: number) => Math.round(n).toLocaleString();

interface Props {
  config: PyroxeneConfig & { customIncomes?: CustomIncome[] };
  setConfig: React.Dispatch<React.SetStateAction<PyroxeneConfig & { customIncomes?: CustomIncome[] }>>;
  schedules: PlannerSchedule[];
  apOverrides: Record<string, number>;
  onApChange: (id: string, val: string) => void;
  banners: BannerPeriod[];
  strategies: Record<string, BannerStrategy>;
  allStudents: Student[];
  portraitMap: Record<number, string>;
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

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------
function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; icon?: React.ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-neutral-100 dark:bg-neutral-800 p-1 gap-1">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold transition whitespace-nowrap ${on ? 'text-[#06262f]' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}`}
            style={on ? { background: '#77e0ff' } : {}}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section divider
// ---------------------------------------------------------------------------
function SectionDivider({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-5 mb-3">
      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500 whitespace-nowrap" style={monoStyle}>
        {label}
      </span>
      <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatsPanel — receipt design
// ---------------------------------------------------------------------------
const StatsPanel = ({
  config,
  stats,
  planSuccessRate,
  hasSimulation,
  simulationDays,
}: {
  config: PyroxeneConfig;
  stats: SimulationStats;
  planSuccessRate: number;
  hasSimulation: boolean;
  simulationDays: number;
}) => {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.income.stats' });
  const { t: tIncome } = useTranslation('planner', { keyPrefix: 'gacha.income' });
  const netFlow = stats.totalIncome - stats.expense.gacha;
  const finalBalance = config.currentPyroxene + netFlow - stats.expense.ap;

  const successColor = planSuccessRate >= 90 ? '#16a34a' : planSuccessRate >= 50 ? '#d97706' : '#dc2626';

  const Row = ({ label, value, color, dim }: { label: string; value: number; color?: string; dim?: boolean }) => (
    <div className={`flex justify-between items-baseline py-0.5 ${dim ? 'opacity-40' : ''}`}>
      <span className="text-neutral-400 dark:text-neutral-500 truncate pr-2">{label}</span>
      <span className="font-bold tabular-nums shrink-0" style={color ? { color } : {}}>
        {value >= 0 ? '+' : ''}
        {fmt(value)}
      </span>
    </div>
  );

  return (
    <div className="rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100" style={monoStyle}>
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-dashed border-neutral-200 dark:border-neutral-700 text-center">
        <div className="text-[9px] tracking-[0.3em] uppercase text-neutral-400 dark:text-neutral-600 mb-0.5">{t('receipt_label', { days: simulationDays })}</div>
        <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300 flex items-center justify-center gap-2">
          <FaChartPie className="text-neutral-400" size={11} />
          {t('title')}
        </div>
      </div>

      {/* Survival rate chip */}
      {hasSimulation && (
        <div className="px-4 py-1.5 border-b border-dashed border-neutral-200 dark:border-neutral-700 flex justify-between text-[11px]">
          <span className="text-neutral-500">{t('survival_rate')}</span>
          <span className="font-bold" style={{ color: successColor }}>
            {planSuccessRate.toFixed(1)}%
          </span>
        </div>
      )}

      {/* Income items */}
      <div className="px-4 py-2 text-[11px] space-y-0">
        <Row label={t('items.mission')} value={stats.income.dailyMission + stats.income.weeklyMission} />
        <Row label={t('items.arona')} value={stats.income.arona} />
        <Row label={t('items.pvp')} value={stats.income.pvp} />
        <Row label={t('items.monthly')} value={stats.income.monthlyCard} />
        <Row label={t('items.raid_elim')} value={stats.income.raid + stats.income.elimination} />
        <Row label={t('items.multifloor')} value={stats.income.multifloor} dim={stats.income.multifloor === 0} />
        <Row label={t('items.jfd')} value={stats.income.jfd} dim={stats.income.jfd === 0} />
        <Row label={t('items.event')} value={stats.income.event} />
        <Row label={t('items.mainstory')} value={stats.income.mainstory} dim={stats.income.mainstory === 0} />
        {stats.income.miniStory > 0 && <Row label={t('items.ministory')} value={stats.income.miniStory} />}
        {stats.income.maintenance > 0 && <Row label={t('items.maintenance')} value={stats.income.maintenance} />}
        {stats.income.extra > 0 && <Row label={t('items.manual')} value={stats.income.extra} />}
      </div>

      {/* Total income subtotal */}
      <div className="border-t border-neutral-200 dark:border-neutral-700 mx-4" />
      <div className="px-4 py-1.5 flex justify-between items-baseline text-[11px]">
        <span className="text-neutral-500 dark:text-neutral-400">{t('total_income')}</span>
        <span className="font-black" style={{ color: '#77e0ff' }}>
          +{fmt(stats.totalIncome)}
        </span>
      </div>

      {/* Gacha consumption */}
      {stats.expense.gacha > 0 && (
        <>
          <div className="border-t border-dashed border-neutral-200 dark:border-neutral-700 mx-4" />
          <div className="px-4 py-1.5 flex justify-between items-baseline text-[11px]">
            <span className="text-neutral-500">{t('items.gacha')}</span>
            <span className="font-bold tabular-nums text-red-500 dark:text-red-400">-{fmt(stats.expense.gacha)}</span>
          </div>
        </>
      )}

      {/* Net flow (after gacha) */}
      <div className="border-t-2 border-neutral-300 dark:border-neutral-600 mx-4" />
      <div className="border-t border-neutral-200 dark:border-neutral-700 mx-4 mt-px" />
      <div className="px-4 pt-2 pb-2 flex justify-between items-baseline">
        <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">{tIncome('net_income_label')}</span>
        <span className="text-sm font-black tabular-nums" style={{ color: netFlow >= 0 ? '#77e0ff' : '#ef4444' }}>
          {netFlow >= 0 ? '+' : ''}
          {fmt(netFlow)}
        </span>
      </div>

      {/* AP refresh + final balance (dim secondary block) */}
      {(stats.expense.ap > 0 || true) && (
        <>
          <div className="border-t border-dashed border-neutral-200 dark:border-neutral-800 mx-4" />
          <div className="px-4 py-1.5 space-y-0.5 text-[10px]">
            {stats.expense.ap > 0 && (
              <div className="flex justify-between items-baseline opacity-50">
                <span className="text-neutral-500">{t('items.ap_refresh')}</span>
                <span className="tabular-nums text-red-500 dark:text-red-400">-{fmt(stats.expense.ap)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline opacity-50">
              <span className="text-neutral-500">{t('final_balance_avg')}</span>
              <span className="tabular-nums font-bold" style={{ color: finalBalance >= 0 ? '#77e0ff' : '#ef4444' }}>
                {finalBalance >= 0 ? '+' : ''}
                {fmt(finalBalance)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SIM_LEVELS
// ---------------------------------------------------------------------------
type SimLevelId = '10k' | '100k' | '1m' | 'manual';
// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function IncomePlannerPanel_v2({
  config,
  setConfig,
  schedules,
  apOverrides,
  onApChange,
  banners,
  strategies,
  allStudents,
  portraitMap,
  pyroxeneIcon,
  apIcon,
  elephIconMap = {},
  ticket1Icon,
  ticket10Icon,
  gachaSimResult,
  setGachaSimResult,
  bankruptcyRate,
  stats,
  minMaxCdf,
  hasSimulation,
  simulationDays,
}: Props) {
  const { t: tg } = useTranslation('planner', { keyPrefix: 'gacha' });
  const { t: tr } = useTranslation('planner', { keyPrefix: 'gacha.result' });

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

  const simCount = levelId === 'manual' ? customN : (SIM_LEVELS.find((l) => l.id === levelId)?.n ?? 100_000);

  const bannersMap = banners.reduce<Record<string, BannerPeriod>>((acc, b) => {
    acc[b.id] = b;
    return acc;
  }, {});

  const WASM_SPEED_RATIO = 10;
  const handleToggleEngine = (wasm: boolean) => {
    if (wasm === useWasm) return;
    if (wasm && levelId !== 'manual') {
      const curN = SIM_LEVELS.find((l) => l.id === levelId)?.n ?? 100_000;
      const wasmN = Math.round((curN * WASM_SPEED_RATIO) / 1000) * 1000;
      const matched = SIM_LEVELS.find((l) => l.n === wasmN);
      if (matched) setLevelId(matched.id);
      else {
        setLevelId('manual');
        setCustomN(wasmN);
      }
    }
    setUseWasm(wasm);
  };

  const handleRun = () => {
    if (useWasm) {
      if (workerRefs.current.length === 0) {
        for (let i = 0; i < WORKER_COUNT; i++) workerRefs.current.push(new GachaSimWorker());
      }
      const payload = buildWasmPayload(Object.values(strategies), bannersMap as unknown as Parameters<typeof buildWasmPayload>[1], allStudents);
      const { strategiesJson, bannerPoolsJson, activeBannerIds } = payload;
      const runId = ++runIdRef.current;
      const N = workerRefs.current.length;
      const perWorker = Math.ceil(simCount / N);
      workerCompletedRef.current = Array(N).fill(0) as number[];
      workerDoneCountRef.current = 0;
      mergedAccRef.current = {
        resultsPulls: [],
        resultsCost: [],
        bannerCumulativeCosts: Object.fromEntries(activeBannerIds.map((id) => [id, []])),
        bannerStatsSum: Object.fromEntries(activeBannerIds.map((id) => [id, { pulls: 0, cost: 0 }])),
        studentAcquired: {},
        studentElephTotal: {},
        studentElephDist: {},
        totalEligmaSum: 0,
        successCount: 0,
      };
      if (chartRafRef.current !== null) {
        cancelAnimationFrame(chartRafRef.current);
        chartRafRef.current = null;
      }
      simStartTimeRef.current = performance.now();
      setIsSimulating(true);
      setSimProgress({ completed: 0, total: simCount });

      workerRefs.current.forEach((worker, i) => {
        const workerSimCount = i === N - 1 ? simCount - perWorker * (N - 1) : perWorker;
        worker.onmessage = (e: MessageEvent<SimWorkerOutMsg>) => {
          if (runIdRef.current !== runId) return;
          const msg = e.data;
          if (msg.type === 'error') {
            console.error('Sim worker error:', msg.message);
            setIsSimulating(false);
            setSimProgress(null);
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
              setIsSimulating(false);
            }
          }
        };
        worker.postMessage({ strategiesJson, bannerPoolsJson, simCount: workerSimCount, seed: Date.now() + i * 0x10000 + Math.floor(Math.random() * 0xffff) });
      });
    } else {
      setIsSimulating(true);
      setTimeout(() => {
        try {
          const simConfig: SimulationConfig = { initialPyroxenes: config.currentPyroxene, simCount };
          const start = performance.now();
          const res = runGlobalSimulation(Object.values(strategies), bannersMap as unknown as Parameters<typeof runGlobalSimulation>[1], allStudents, simConfig);
          setSimTiming({ totalMs: performance.now() - start, count: simCount });
          setGachaSimResult(res);
        } catch (e) {
          console.error(e);
          alert(tr('alert_error'));
        } finally {
          setIsSimulating(false);
        }
      }, 100);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── SimControls bar ── */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          {/* Icon + label */}
          <div className="flex items-center gap-2 mr-1">
            <span className="grid place-items-center h-9 w-9 rounded-lg" style={{ background: '#77e0ff22', color: '#77e0ff' }}>
              <FaBolt size={18} />
            </span>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400 whitespace-nowrap" style={monoStyle}>
                {tr('panel.title')}
              </div>
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 hidden sm:block">
                <Trans i18nKey="gacha.result.panel.desc" ns="planner" values={{ amount: config.currentPyroxene.toLocaleString() }} components={{ 1: <strong /> }} />
              </div>
            </div>
          </div>

          {/* Sim level segs */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5 whitespace-nowrap" style={monoStyle}>
              {tr('panel.iteration_count')}
            </div>
            <Seg value={levelId} options={SIM_LEVELS.map((l) => ({ id: l.id, label: l.label }))} onChange={(v) => setLevelId(v)} />
          </div>

          {/* Manual input */}
          {levelId === 'manual' && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5 whitespace-nowrap" style={monoStyle}>
                {tr('panel.manual_input_label')}
              </div>
              <CustomNumberInput
                min={1000}
                max={10_000_000}
                value={customN}
                onChange={(val) => setCustomN(Math.max(1000, Math.min(10_000_000, val || 1000)))}
                className="w-28 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-sm font-bold text-neutral-800 dark:text-neutral-100 focus:ring-2 focus:ring-ba-btn-blue"
                style={monoStyle}
              />
            </div>
          )}

          {/* Engine segs */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5 whitespace-nowrap" style={monoStyle}>
              {tr('panel.engine_label')}
            </div>
            <Seg
              value={useWasm ? 'wasm' : 'js'}
              options={[
                { id: 'js', label: 'JS' },
                { id: 'wasm', label: 'WASM', icon: <FaBolt size={9} /> },
              ]}
              onChange={(v) => handleToggleEngine(v === 'wasm')}
            />
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={isSimulating}
            className="flex items-center gap-2 px-5 h-[38px] rounded-lg font-bold text-sm text-[#06262f] disabled:opacity-60 transition whitespace-nowrap"
            style={{ background: '#77e0ff' }}
          >
            {isSimulating && <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />}
            {isSimulating ? tr('panel.btn_running') : tr('panel.btn_start')}
          </button>

          {/* Timing info */}
          <div className="ml-auto flex items-center gap-2 flex-wrap text-[11px] text-neutral-500 dark:text-neutral-400" style={monoStyle}>
            {!isSimulating && simTiming && (
              <>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 whitespace-nowrap">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  {simTiming.count.toLocaleString()}
                  {tr('panel.sim_count_unit')}
                </span>
                <span className="whitespace-nowrap">{formatDuration(simTiming.totalMs)}</span>
                <span className="whitespace-nowrap">{(simTiming.count / (simTiming.totalMs / 1000)).toFixed(0)}/s</span>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {simProgress && (
          <div className="mt-3 space-y-1">
            <div className="h-1 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-150" style={{ width: `${(simProgress.completed / simProgress.total) * 100}%`, background: '#77e0ff' }} />
            </div>
            <p className="text-[10px] text-neutral-400" style={monoStyle}>
              {simProgress.completed.toLocaleString()} / {simProgress.total.toLocaleString()}
              &nbsp;({((simProgress.completed / simProgress.total) * 100).toFixed(1)}%)
            </p>
          </div>
        )}
      </div>

      {/* ── Sim result ── */}
      {gachaSimResult && (
        <>
          <SimulationResultView_v2
            result={gachaSimResult}
            initialPyroxenes={config.currentPyroxene}
            portraitMap={portraitMap}
            pyroxeneIcon={pyroxeneIcon}
            elephIconMap={elephIconMap}
            bankruptcyRate={bankruptcyRate}
            strategies={strategies}
            allStudents={allStudents}
          />
        </>
      )}

      {/* ── Income settings ── */}
      <SectionDivider label={tg('tabs.income')} />
      <IncomeSettingsPanel_v2 config={config} setConfig={setConfig} pyroxeneIcon={pyroxeneIcon} ticket1Icon={ticket1Icon} ticket10Icon={ticket10Icon} />

      {/* ── AP schedule ── */}
      <SectionDivider label={tg('income.timeline.title')} />
      <APSchedulePanel_v2
        schedules={schedules}
        apOverrides={apOverrides}
        onApChange={onApChange}
        apRefreshes_event={config.apRefreshes_event}
        apRefreshes_normal={config.apRefreshes_normal}
        apRefreshes_campaigns={config.apRefreshes_campaigns}
        onCampaignBulkChange={(key, val) => {
          const next = { ...config.apRefreshes_campaigns };
          if (val === -1) delete next[key];
          else next[key] = val;
          setConfig((c) => ({ ...c, apRefreshes_campaigns: next }));
        }}
        onApRefreshChange={(key, val) => setConfig((c) => ({ ...c, [key]: val }))}
        apIcon={apIcon}
      />

      {/* ── Stats ── */}
      <SectionDivider label={tg('income.stats.title')} />
      <StatsPanel config={config} stats={stats} planSuccessRate={minMaxCdf} hasSimulation={hasSimulation} simulationDays={simulationDays} />
    </div>
  );
}
