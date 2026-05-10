// app/components/gacha/IncomePlannerPanel.tsx
// Tab orchestrator: run button at top (always visible) + 3 tabs below.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { FaGem, FaCalendarAlt, FaChartBar, FaRocket, FaSpinner, FaCoins, FaChartPie } from 'react-icons/fa';
import { runGlobalSimulation, type GlobalAggregatedResult, type SimulationConfig } from '~/utils/gachaEngine';
import type { PyroxeneConfig } from '~/routes/planner/Gacha';
import type { BannerPeriod } from '~/utils/gachaData';
import type { BannerStrategy, Student } from '~/types/gacha';
import type { PlannerSchedule, SimulationStats } from '~/utils/pyroxeneCalc';
import IncomeSettingsPanel, { type CustomIncome } from './IncomeSettingsPanel';
import APSchedulePanel from './APSchedulePanel';
import SimulationResultPanel from './SimulationResultPanel';

export type { CustomIncome };

type TabId = 'income' | 'stats' | 'schedule' | 'result';

interface Props {
  config: PyroxeneConfig & { customIncomes?: CustomIncome[] };
  setConfig: React.Dispatch<React.SetStateAction<PyroxeneConfig & { customIncomes?: CustomIncome[] }>>;
  schedules: PlannerSchedule[];
  apOverrides: Record<string, number>;
  onApChange: (id: string, val: string) => void;
  includeGacha: boolean;
  onToggleIncludeGacha: () => void;
  banners: BannerPeriod[];
  strategies: Record<string, BannerStrategy>;
  allStudents: Student[];
  portraitMap: Record<number, string>;
  gachaSimResult: GlobalAggregatedResult | null;
  setGachaSimResult: (next: GlobalAggregatedResult | null) => void;
  bankruptcyRate: number | null;
  stats: SimulationStats;
  minMaxCdf: number;
  hasSimulation: boolean;
}

// ---------------------------------------------------------------------------
// StatsPanel — income summary (shown in income tab)
// ---------------------------------------------------------------------------
const StatsPanel = ({ config, stats, planSuccessRate, hasSimulation }: { config: PyroxeneConfig; stats: SimulationStats; planSuccessRate: number; hasSimulation: boolean }) => {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.income.stats' });
  const fmt = (n: number) => Math.round(n).toLocaleString();
  const successColor = planSuccessRate >= 90 ? 'text-blue-600' : planSuccessRate >= 50 ? 'text-yellow-500' : 'text-red-600';
  const totalBalance = config.currentPyroxene + stats.totalIncome - stats.expense.ap - stats.expense.gacha;

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 shadow-sm p-5 mt-4 transition-colors">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100 dark:border-neutral-800">
        <h4 className="font-bold text-slate-700 dark:text-neutral-200 flex items-center gap-2">
          <FaChartPie className="text-blue-500 dark:text-blue-400" /> {t('title')}
        </h4>
        <div className="text-sm font-bold bg-slate-100 dark:bg-neutral-800 px-3 py-1 rounded-full dark:text-neutral-300">
          {t('survival_rate')}:{' '}
          {hasSimulation ? <span className={`text-lg ${successColor}`}>{planSuccessRate.toFixed(1)}%</span> : <span className="text-lg text-slate-400 dark:text-neutral-500">--</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/50">
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold block mb-1">{t('total_income')}</span>
          <span className="text-lg font-black text-emerald-700 dark:text-emerald-300">+{fmt(stats.totalIncome)}</span>
        </div>
        <div className="bg-rose-50 dark:bg-rose-950/30 p-3 rounded-lg border border-rose-100 dark:border-rose-900/50">
          <span className="text-xs text-rose-600 dark:text-rose-400 font-bold block mb-1">{t('total_ap_expense')}</span>
          <span className="text-lg font-black text-rose-700 dark:text-rose-300">-{fmt(stats.expense.ap)}</span>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50">
          <span className="text-xs text-blue-600 dark:text-blue-400 font-bold block mb-1">{t('gacha_expense_avg')}</span>
          <span className="text-lg font-black text-blue-700 dark:text-blue-300">-{fmt(stats.expense.gacha)}</span>
        </div>
        <div className="bg-slate-800 dark:bg-neutral-950 p-3 rounded-lg text-white border dark:border-neutral-800">
          <span className="text-xs text-slate-300 dark:text-neutral-500 font-bold block mb-1">{t('final_balance_avg')}</span>
          <span className={`text-lg font-black ${totalBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(totalBalance)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
        <div className="space-y-2">
          <h5 className="font-bold text-slate-700 dark:text-neutral-300 border-l-4 border-blue-500 pl-2">📅 {t('category.regular')}</h5>
          <div className="bg-slate-50 dark:bg-neutral-800/50 rounded p-2 space-y-1.5 dark:text-neutral-400">
            <div className="flex justify-between">
              <span>{t('items.mission')}</span> <b className="text-slate-900 dark:text-neutral-200">{fmt(stats.income.dailyMission + stats.income.weeklyMission)}</b>
            </div>
            <div className="flex justify-between">
              <span>{t('items.arona')}</span> <b className="text-slate-900 dark:text-neutral-200">{fmt(stats.income.arona)}</b>
            </div>
            <div className="flex justify-between text-blue-600 dark:text-blue-400">
              <span>{t('items.pvp')}</span> <b>{fmt(stats.income.pvp)}</b>
            </div>
            <div className="flex justify-between">
              <span>{t('items.monthly')}</span> <b className="text-slate-900 dark:text-neutral-200">{fmt(stats.income.monthlyCard)}</b>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <h5 className="font-bold text-slate-700 dark:text-neutral-300 border-l-4 border-yellow-500 pl-2">🏆 {t('category.content')}</h5>
          <div className="bg-slate-50 dark:bg-neutral-800/50 rounded p-2 space-y-1.5 dark:text-neutral-400">
            <div className="flex justify-between">
              <span>{t('items.raid_elim')}</span> <b className="text-slate-900 dark:text-neutral-200">{fmt(stats.income.raid + stats.income.elimination)}</b>
            </div>
            <div className="flex justify-between">
              <span>{t('items.multifloor')}</span> <b className="text-slate-900 dark:text-neutral-200">{fmt(stats.income.multifloor)}</b>
            </div>
            <div className="flex justify-between">
              <span>{t('items.jfd')}</span> <b className="text-slate-900 dark:text-neutral-200">{fmt(stats.income.jfd)}</b>
            </div>
            <div className="flex justify-between">
              <span>{t('items.mainstory')}</span> <b className="text-slate-900 dark:text-neutral-200">{fmt(stats.income.mainstory)}</b>
            </div>
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>{t('items.event')}</span> <b>{fmt(stats.income.event)}</b>
            </div>
            <div className="flex justify-between">
              <span>{t('items.ministory')}</span> <b className="text-slate-900 dark:text-neutral-200">{fmt(stats.income.miniStory)}</b>
            </div>
            <div className="flex justify-between">
              <span>{t('items.maintenance')}</span> <b className="text-slate-900 dark:text-neutral-200">{fmt(stats.income.maintenance)}</b>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <h5 className="font-bold text-slate-700 dark:text-neutral-300 border-l-4 border-rose-500 pl-2">⚙️ {t('category.misc_expense')}</h5>
          <div className="bg-slate-50 dark:bg-neutral-800/50 rounded p-2 space-y-1.5 dark:text-neutral-400">
            <div className="flex justify-between">
              <span>{t('items.manual')}</span> <b className="text-slate-900 dark:text-neutral-200">{fmt(stats.income.extra)}</b>
            </div>
            <div className="h-px bg-slate-200 dark:bg-neutral-700 my-1" />
            <div className="flex justify-between text-rose-600 dark:text-rose-400">
              <span>{t('items.ap_refresh')}</span> <b>-{fmt(stats.expense.ap)}</b>
            </div>
            <div className="flex justify-between text-rose-600 dark:text-rose-400">
              <span>{t('items.gacha')}</span> <b>-{fmt(stats.expense.gacha)}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab button helper
// ---------------------------------------------------------------------------
const TabButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
      active
        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
        : 'border-transparent text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200 hover:border-slate-300 dark:hover:border-neutral-600'
    }`}
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// Student detail section
// ---------------------------------------------------------------------------
const StudentDetailSection = ({
  result,
  portraitMap,
  strategies,
}: {
  result: GlobalAggregatedResult;
  portraitMap: Record<number, string>;
  strategies: Record<string, import('~/types/gacha').BannerStrategy>;
}) => {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.result_view' });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Build a map: studentId → minimum priority across all active strategies (skip-mode excluded)
  const strategyPriorityMap = new Map<number, number>();
  for (const banner of Object.values(strategies)) {
    if (!banner.isActive) continue;
    for (const [sidStr, cfg] of Object.entries(banner.studentConfigs ?? {})) {
      if (cfg.mode === 'skip') continue;
      const sid = Number(sidStr);
      const existing = strategyPriorityMap.get(sid);
      if (existing === undefined || cfg.priority < existing) {
        strategyPriorityMap.set(sid, cfg.priority);
      }
    }
  }

  const sorted = Object.values(result.studentStats)
    .filter((s) => s.obtainRate > 1)
    .sort((a, b) => {
      const pa = strategyPriorityMap.get(a.studentId);
      const pb = strategyPriorityMap.get(b.studentId);
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return b.obtainRate - a.obtainRate;
    });

  const rateColor = (rate: number) => (rate > 80 ? 'bg-green-500' : rate > 50 ? 'bg-blue-500' : rate > 20 ? 'bg-amber-500' : 'bg-red-500');

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden transition-colors">
      <div className="bg-neutral-50 dark:bg-neutral-800/50 px-5 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <h3 className="font-bold text-neutral-700 dark:text-neutral-200 flex items-center gap-2">
          <FaCoins className="text-amber-500" /> {t('student_stats.title')}
        </h3>
      </div>
      <div className="divide-y divide-neutral-100 dark:divide-neutral-800 max-h-[50vh] overflow-y-auto">
        {sorted.map((stat) => {
          const imgSrc = portraitMap[stat.studentId] ? `data:image/webp;base64,${portraitMap[stat.studentId]}` : null;
          const isExpanded = expandedId === stat.studentId;
          return (
            <div key={stat.studentId} className="group">
              <div
                className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : stat.studentId)}
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    {imgSrc ? (
                      <img src={imgSrc} alt={stat.name} className="w-11 h-11 rounded-full object-cover border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-500">{stat.name.charAt(0)}</div>
                    )}
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-neutral-900 ${rateColor(stat.obtainRate)}`}
                      title={`Obtain Rate: ${stat.obtainRate.toFixed(1)}%`}
                    />
                  </div>
                  <div>
                    <div className="font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
                      {stat.name}
                      {stat.isLimited && (
                        <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 rounded border border-amber-200 dark:border-amber-800">
                          {t('student_stats.tag_limited')}
                        </span>
                      )}
                      {stat.isFes && (
                        <span className="text-[10px] bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 px-1.5 rounded border border-purple-200 dark:border-purple-800">
                          {t('student_stats.tag_fes')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 flex gap-2">
                      <span>
                        {t('student_stats.rate_obtain')} <strong className="text-neutral-700 dark:text-neutral-200">{stat.obtainRate.toFixed(3)}%</strong>
                      </span>
                      <span className="text-neutral-300 dark:text-neutral-700">|</span>
                      <span>
                        {t('student_stats.avg_eleph')} <strong className="text-purple-600 dark:text-purple-400">+{Math.round(stat.avgEleph)}</strong>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-neutral-400 dark:text-neutral-500 group-hover:text-blue-500 dark:group-hover:text-blue-400">
                  {isExpanded ? t('student_stats.collapse') : t('student_stats.expand')}
                </div>
              </div>

              {isExpanded && (
                <div className="bg-neutral-50/50 dark:bg-neutral-950/50 p-4 border-t border-neutral-100 dark:border-neutral-800 animate-fade-in">
                  <div className="h-32 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stat.elephDistribution}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#888" opacity={0.1} />
                        <XAxis
                          dataKey="amount"
                          tick={{ fontSize: 10, fill: '#888' }}
                          label={{ value: t('student_stats.chart_x_eleph'), position: 'insideBottom', fontSize: 10, offset: -5, fill: '#888' }}
                        />
                        <YAxis hide />
                        <Tooltip contentStyle={{ backgroundColor: '#171717', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '10px' }} itemStyle={{ color: '#a78bfa' }} />
                        <Bar dataKey="probability" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function IncomePlannerPanel({
  config,
  setConfig,
  schedules,
  apOverrides,
  onApChange,
  includeGacha,
  onToggleIncludeGacha,
  banners,
  strategies,
  allStudents,
  portraitMap,
  gachaSimResult,
  setGachaSimResult,
  bankruptcyRate,
  stats,
  minMaxCdf,
  hasSimulation,
}: Props) {
  const { t: tg } = useTranslation('planner', { keyPrefix: 'gacha' });
  const { t: ti } = useTranslation('planner', { keyPrefix: 'gacha.income' });
  const { t: tr } = useTranslation('planner', { keyPrefix: 'gacha.result' });

  const [activeTab, setActiveTab] = useState<TabId>('income');
  const [simCount, setSimCount] = useState(10000);
  const [isSimulating, setIsSimulating] = useState(false);

  const handleRun = () => {
    setIsSimulating(true);
    setTimeout(() => {
      try {
        const activeStrategies = Object.values(strategies);
        const bannersMap = banners.reduce((acc: any, b) => {
          acc[b.id] = b;
          return acc;
        }, {});
        const simConfig: SimulationConfig = { initialPyroxenes: config.currentPyroxene, simCount };
        const res = runGlobalSimulation(activeStrategies, bannersMap, allStudents, simConfig);
        setGachaSimResult(res);
        setActiveTab('result');
      } catch (e) {
        console.error(e);
        alert(tr('alert_error'));
      } finally {
        setIsSimulating(false);
      }
    }, 100);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Run simulation — always visible at top ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-blue-100 dark:border-neutral-800 shadow-sm p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-bold text-neutral-800 dark:text-neutral-100">{tr('panel.title')}</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{tr('panel.desc', { amount: config.currentPyroxene.toLocaleString() })}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700">
            <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">{tr('panel.iteration_count')}</span>
            <input
              type="number"
              value={simCount}
              onChange={(e) => setSimCount(Number(e.target.value))}
              className="w-20 bg-transparent font-bold text-right outline-none text-neutral-800 dark:text-neutral-100"
              step={1000}
              min={1000}
            />
          </div>
          <button
            onClick={handleRun}
            disabled={isSimulating}
            className={`px-5 py-2.5 rounded-xl font-bold text-white shadow-lg flex items-center gap-2 transition-all active:scale-95 ${
              isSimulating ? 'bg-neutral-400 dark:bg-neutral-600 cursor-not-allowed' : 'bg-linear-to-r from-blue-600 to-indigo-600 hover:opacity-90 dark:from-blue-500 dark:to-indigo-500'
            }`}
          >
            {isSimulating ? <FaSpinner className="animate-spin" /> : <FaRocket />}
            {isSimulating ? tr('panel.btn_running') : tr('panel.btn_start')}
          </button>
        </div>
      </div>

      {/* ── Tab panel ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 shadow-sm overflow-hidden transition-colors">
        {/* Tab bar */}
        <div className="flex border-b border-slate-200 dark:border-neutral-800 overflow-x-auto">
          <TabButton active={activeTab === 'income'} onClick={() => setActiveTab('income')}>
            <FaGem className="text-blue-400" /> {ti('settings.title')}
          </TabButton>
          <TabButton active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')}>
            <FaCalendarAlt className="text-slate-400 dark:text-neutral-500" /> {ti('timeline.title')}
          </TabButton>
          <TabButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')}>
            <FaChartPie className="text-blue-400 dark:text-blue-500" /> {ti('stats.title')}
          </TabButton>
          <TabButton active={activeTab === 'result'} onClick={() => setActiveTab('result')}>
            <FaChartBar className={gachaSimResult ? 'text-emerald-500' : 'text-slate-400 dark:text-neutral-500'} />
            {tg('tabs.result')}
            {gachaSimResult && <span className="ml-1 w-2 h-2 rounded-full bg-emerald-400 inline-block" />}
          </TabButton>
        </div>

        {/* Tab content */}
        <div className="p-4">
          {activeTab === 'income' && <IncomeSettingsPanel config={config} setConfig={setConfig} includeGacha={includeGacha} onToggleIncludeGacha={onToggleIncludeGacha} />}
          {activeTab === 'stats' && <StatsPanel config={config} stats={stats} planSuccessRate={minMaxCdf} hasSimulation={hasSimulation} />}
          {activeTab === 'schedule' && <APSchedulePanel schedules={schedules} apOverrides={apOverrides} onApChange={onApChange} />}
          {activeTab === 'result' && (
            <div className="flex flex-col gap-4">
              <SimulationResultPanel result={gachaSimResult} initialPyroxenes={config.currentPyroxene} portraitMap={portraitMap} bankruptcyRate={bankruptcyRate} />
              {gachaSimResult && <StudentDetailSection result={gachaSimResult} portraitMap={portraitMap} strategies={strategies} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
