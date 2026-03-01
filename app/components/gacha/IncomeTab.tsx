// app/components/gacha/IncomeTab.tsx

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Legend } from 'recharts';
import { FaGem, FaToggleOn, FaToggleOff, FaBolt, FaCalendarAlt, FaChartPie, FaPlusCircle, FaTrophy, FaTrash, FaListUl, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { calculatePyroxeneTimeline, getBinStartByCdf, getCdfByBinValue, PVP_REWARDS, type PlannerSchedule, type SimulationStats } from '~/utils/pyroxeneCalc';
import type { PyroxeneConfig } from '../../routes/planner/Gacha';
import type { BannerPeriod, BannerStrategy } from '~/types/gacha';
import type { DistributionData, GlobalAggregatedResult } from '~/utils/gachaEngine';
import { CustomNumberInput } from '../CustomInput';

// --- Types ---
export interface CustomIncome {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  amount: number; // Positive for income, negative for expenses
}

interface Props {
  config: PyroxeneConfig & { customIncomes?: CustomIncome[] }; // Temporary type extension
  setConfig: React.Dispatch<React.SetStateAction<PyroxeneConfig & { customIncomes?: CustomIncome[] }>>;
  banners: BannerPeriod[];
  strategies: Record<string, BannerStrategy>;
  schedules: PlannerSchedule[];
  gachaSimResult: GlobalAggregatedResult | null;
}

// ----------------------------------------------------------------------
// 1. Simplified timeline
// ----------------------------------------------------------------------
const SimpleTimeline = ({ schedules, apOverrides, onApChange }: { schedules: PlannerSchedule[]; apOverrides: Record<string, number>; onApChange: (id: string, val: string) => void }) => {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.income.timeline' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sortedSchedules = useMemo(() => {
    return schedules.filter((s) => new Date(s.end) >= today).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [schedules]);

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'Event':
        return { label: t('types.evt'), color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' };
      case 'Raid':
        return { label: t('types.raid'), color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' };
      case 'Elimination':
        return { label: t('types.elim'), color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' };
      case 'Multifloor':
        return { label: t('types.towr'), color: 'bg-rose-100 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900' };
      case 'Campaign':
        return { label: t('types.camp'), color: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800' };
      default:
        return { label: t('types.etc'), color: 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 border-slate-200 dark:border-neutral-700' };
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 shadow-sm overflow-hidden transition-colors">
      <div className="p-3 border-b border-slate-100 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-800/50 flex justify-between items-center shrink-0">
        <h3 className="font-bold text-slate-700 dark:text-neutral-200 flex items-center gap-2 text-sm">
          <FaCalendarAlt className="text-slate-500 dark:text-neutral-400" /> {t('title')}
        </h3>
        <span className="text-[10px] text-slate-400 dark:text-neutral-500">{t('total_count', { count: sortedSchedules.length })}</span>
      </div>

      <div className="flex items-center px-3 py-2 bg-slate-50 dark:bg-neutral-800/30 border-b border-slate-100 dark:border-neutral-800 text-[10px] font-bold text-slate-500 dark:text-neutral-400 shrink-0">
        <div className="w-16">{t('headers.start')}</div>
        <div className="w-12 text-center">{t('headers.type')}</div>
        <div className="flex-1 px-2">{t('headers.name')}</div>
        <div className="w-14 text-right">{t('headers.ap')}</div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
        <div className="absolute inset-0 w-full">
          {sortedSchedules.map((item) => {
            const style = getTypeStyle(item.type);
            const startDate = item.start.slice(5).replace('-', '/');
            const isApConfigurable = item.type === 'Event' || item.type === 'Campaign';
            const currentOverride = apOverrides[item.id] ?? -1;

            return (
              <div key={item.id} className="flex items-center px-3 py-2 border-b border-slate-50 dark:border-neutral-800/50 hover:bg-slate-50 dark:hover:bg-neutral-800/30 transition-colors group">
                <div className="w-16 text-xs text-slate-500 dark:text-neutral-500 font-mono shrink-0">{startDate}</div>
                <div className={`w-12 shrink-0 flex justify-center`}>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors ${style.color}`}>{style.label}</span>
                </div>
                <div className="flex-1 px-2 min-w-0">
                  <div className="text-xs text-slate-700 dark:text-neutral-300 truncate" title={`${item.name} (~${item.end})`}>
                    {item.name}
                  </div>
                </div>
                <div className="w-14 shrink-0 text-right h-6">
                  {isApConfigurable && (
                    <select
                      className={`w-full text-[10px] border rounded py-0.5 px-1 outline-none cursor-pointer transition-colors ${
                        currentOverride !== -1
                          ? 'bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-400'
                          : 'bg-white dark:bg-neutral-800 text-slate-600 dark:text-neutral-400 border-slate-200 dark:border-neutral-700'
                      }`}
                      value={currentOverride}
                      onChange={(e) => onApChange(item.id, e.target.value)}
                    >
                      <option value={-1}>-</option>
                      <option value={0}>0</option>
                      <option value={3}>3</option>
                      <option value={6}>6</option>
                      <option value={9}>9</option>
                      <option value={12}>12</option>
                    </select>
                  )}
                </div>
              </div>
            );
          })}
          {sortedSchedules.length === 0 && <div className="p-4 text-center text-xs text-slate-400 dark:text-neutral-500">{t('empty')}</div>}
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// 2. Stats Panel
// ----------------------------------------------------------------------
const StatsPanel = ({ config, stats, planSuccessRate }: { config: PyroxeneConfig; stats: SimulationStats; planSuccessRate: number }) => {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.income.stats' });
  const fmt = (n: number) => Math.round(n).toLocaleString();
  const successColor = planSuccessRate >= 90 ? 'text-blue-600' : planSuccessRate >= 50 ? 'text-yellow-500' : 'text-red-600';

  const totalBalance = config.currentPyroxene + stats.totalIncome - stats.expense.ap - stats.expense.gacha;

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 shadow-sm p-5 mt-6 transition-colors">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100 dark:border-neutral-800">
        <h4 className="font-bold text-slate-700 dark:text-neutral-200 flex items-center gap-2">
          <FaChartPie className="text-blue-500 dark:text-blue-400" /> {t('title')}
        </h4>
        <div className="text-sm font-bold bg-slate-100 dark:bg-neutral-800 px-3 py-1 rounded-full dark:text-neutral-300">
          {t('survival_rate')}: <span className={`text-lg ${successColor}`}>{planSuccessRate.toFixed(1)}%</span>
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
              <span>{t('items.pvp')}</span> <b className="font-bold">{fmt(stats.income.pvp)}</b>
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
              <span>{t('items.mainstory', 'mainstory')}</span> <b className="text-slate-900 dark:text-neutral-200">{fmt(stats.income.mainstory)}</b>
            </div>
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>{t('items.event_etc')}</span> <b className="font-bold">{fmt(stats.income.event)}</b>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <h5 className="font-bold text-slate-700 dark:text-neutral-300 border-l-4 border-rose-500 pl-2">⚙️ {t('category.misc_expense')}</h5>
          <div className="bg-slate-50 dark:bg-neutral-800/50 rounded p-2 space-y-1.5 dark:text-neutral-400">
            <div className="flex justify-between">
              <span>{t('items.manual')}</span> <b className="text-slate-900 dark:text-neutral-200">{fmt(stats.income.extra)}</b>
            </div>
            <div className="h-px bg-slate-200 dark:bg-neutral-700 my-1"></div>
            <div className="flex justify-between text-rose-600 dark:text-rose-400">
              <span>{t('items.ap_refresh')}</span> <b className="font-bold">-{fmt(stats.expense.ap)}</b>
            </div>
            <div className="flex justify-between text-rose-600 dark:text-rose-400">
              <span>{t('items.gacha')}</span> <b className="font-bold">-{fmt(stats.expense.gacha)}</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// 3. Main component
// ----------------------------------------------------------------------

export default function IncomeTab({ config, setConfig, banners, strategies, schedules, gachaSimResult }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.income' });
  const [includeGacha, setIncludeGacha] = useState(true);
  const [apOverrides, setApOverrides] = useState<Record<string, number>>({});

  const [showDetails, setShowDetails] = useState(false);
  const [newCustomDate, setNewCustomDate] = useState('');
  const [newCustomTitle, setNewCustomTitle] = useState('');
  const [newCustomAmount, setNewCustomAmount] = useState<number | ''>('');

  // 1. Calculate net income (passing custom schedule to options)
  const { timeline: baseTimeline, stats } = useMemo(() => {
    return calculatePyroxeneTimeline(config, schedules, {
      simulationDays: 180,
      customApOverrides: apOverrides,
      customIncomes: config.customIncomes || [],
    });
  }, [config, schedules, apOverrides]);

  // 2. Apply gacha probability distribution
  const { probTimeline, minMaxCdf } = useMemo(() => {
    let currentCumulativeDist: DistributionData[] | null = null;
    let minMaxCdf = 100;

    const processed = baseTimeline.map((point) => {
      const date = point.date;
      const activeOrPastBanners = banners.filter((b) => b.startTime <= date).sort((a, b) => b.startTime.localeCompare(a.startTime));
      const latestBanners = activeOrPastBanners.filter((v) => v.startTime == activeOrPastBanners[0].startTime);

      const currentResources = point.pyroxene;
      let pyroxeneAvg = currentResources;
      let pyroxeneHigh = currentResources;
      let pyroxeneLow = currentResources;
      let pyroxeneWorst = currentResources;
      let currentSuccessRate = 100;

      for (const latestBanner of latestBanners) {
        if (includeGacha && latestBanner && strategies[latestBanner.id]?.isActive && gachaSimResult) {
          const dist = gachaSimResult.distCostMap[latestBanner.id];
          if (dist) {
            currentCumulativeDist = dist;
          }
        }

        if (currentCumulativeDist) {
          const costLucky = getBinStartByCdf(currentCumulativeDist, 10);
          const costAvg = getBinStartByCdf(currentCumulativeDist, 50);
          const costUnlucky = getBinStartByCdf(currentCumulativeDist, 90);
          const costWorst = getBinStartByCdf(currentCumulativeDist, 99.999);

          pyroxeneHigh = currentResources - costLucky;
          pyroxeneAvg = currentResources - costAvg;
          pyroxeneLow = currentResources - costUnlucky;
          pyroxeneWorst = currentResources - costWorst;

          stats.expense.gacha = costAvg;
          currentSuccessRate = getCdfByBinValue(currentCumulativeDist, currentResources);
        }

        if (currentSuccessRate < minMaxCdf) {
          minMaxCdf = currentSuccessRate;
        }
      }

      return {
        ...point,
        pyroxeneAvg,
        pyroxeneHigh,
        pyroxeneLow,
        pyroxeneWorst,
        maxCdf: currentSuccessRate,
        logs: (point as any).logs || [],
      };
    });

    return { probTimeline: processed, minMaxCdf };
  }, [baseTimeline, includeGacha, banners, strategies, gachaSimResult, stats]);

  const handleApChange = (id: string, val: string) => {
    setApOverrides((prev) => ({ ...prev, [id]: Number(val) }));
  };

  const handleAddCustomIncome = () => {
    if (!newCustomDate || !newCustomTitle || newCustomAmount === '') return;

    const newItem: CustomIncome = {
      id: Math.random().toString(36).substr(2, 9),
      date: newCustomDate,
      title: newCustomTitle,
      amount: Number(newCustomAmount),
    };

    setConfig((prev) => ({
      ...prev,
      customIncomes: [...(prev.customIncomes || []), newItem],
    }));

    setNewCustomTitle('');
    setNewCustomAmount('');
  };

  const handleRemoveCustomIncome = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      customIncomes: (prev.customIncomes || []).filter((item) => item.id !== id),
    }));
  };

  const off = 0.5;

  return (
    <div className="flex flex-col gap-6 transition-colors">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* [Left] Settings and charts (2/3) */}
        <div className="flex-2 min-w-0 space-y-6">
          {/* Control panel */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 border border-slate-200 dark:border-neutral-800 shadow-sm transition-colors">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-neutral-800">
              <h3 className="font-bold text-slate-700 dark:text-neutral-200 flex items-center gap-2">
                <FaGem className="text-blue-500" /> {t('settings.title')}
              </h3>
              <button
                onClick={() => setIncludeGacha(!includeGacha)}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border font-bold transition-colors ${
                  includeGacha
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400'
                    : 'bg-slate-50 dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-slate-500 dark:text-neutral-400'
                }`}
              >
                {includeGacha ? <FaToggleOn className="text-lg" /> : <FaToggleOff className="text-lg" />}
                <span>{t('settings.include_gacha')}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm mb-4">
              {/* Existing settings (Monthly sub, AP, capital, etc.) */}
              <div className="space-y-2">
                <label className="font-bold text-slate-600 dark:text-neutral-400 block text-xs">{t('settings.current_resources')}</label>
                <div className="relative flex-1">
                  <span className="absolute left-2 top-2 text-slate-400 dark:text-neutral-500">
                    <FaGem />
                  </span>
                  <input
                    type="number"
                    className="w-full border dark:border-neutral-700 rounded pl-7 pr-2 py-1.5 bg-slate-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                    value={config.currentPyroxene}
                    onChange={(e) => setConfig({ ...config, currentPyroxene: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="font-bold text-slate-600 dark:text-neutral-400 block text-xs">{t('settings.monthly_income')}</label>
                <div className="flex gap-3 items-center">
                  <label className="flex items-center gap-1 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300">
                    <input type="checkbox" className="accent-blue-500" checked={config.monthlyCard} onChange={(e) => setConfig({ ...config, monthlyCard: e.target.checked })} />{' '}
                    {t('settings.monthly_card')}
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300">
                    <input type="checkbox" className="accent-blue-500" checked={config.halfMonthlyCard} onChange={(e) => setConfig({ ...config, halfMonthlyCard: e.target.checked })} />{' '}
                    {t('settings.half_monthly_card')}
                  </label>
                  <div className="flex items-center gap-1 ml-auto">
                    <FaPlusCircle className="text-slate-300 dark:text-neutral-600" />
                    <CustomNumberInput
                      className="w-20 border dark:border-neutral-700 rounded px-2 py-1 text-xs bg-slate-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 text-right outline-none"
                      placeholder={t('settings.extra_placeholder')}
                      value={config.monthlyExtraGem || 0}
                      onChange={(e) => setConfig({ ...config, monthlyExtraGem: Number(e) })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="font-bold text-slate-600 dark:text-neutral-400 flex items-center gap-1 text-xs">
                  <FaTrophy className="text-yellow-500" /> {t('settings.pvp_ranking')}
                </label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 border dark:border-neutral-700 rounded px-2 py-1.5 text-xs bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none"
                    value={config.pvpRankTier}
                    onChange={(e) => setConfig({ ...config, pvpRankTier: Number(e.target.value) })}
                  >
                    {PVP_REWARDS.map((r) => (
                      <option key={r.rank} value={r.rank}>
                        {t('settings.pvp_rank_format', { rank: r.rank, amount: r.reward })}
                      </option>
                    ))}
                  </select>
                  <select
                    className="flex-1 border dark:border-neutral-700 rounded px-2 py-1.5 text-xs bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none"
                    value={config.raidRank}
                    onChange={(e) => setConfig({ ...config, raidRank: e.target.value as any })}
                  >
                    <option value="platinum">{t('settings.raid_rank.platinum')}</option>
                    <option value="gold">{t('settings.raid_rank.gold')}</option>
                    <option value="silver">{t('settings.raid_rank.silver')}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="font-bold text-slate-600 dark:text-neutral-400 block text-xs">
                  <FaBolt className="text-yellow-400 inline" /> {t('settings.ap_refresh_daily')}
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 dark:text-neutral-500">{t('settings.event_period')}</span>
                    <select
                      className="w-full border rounded px-2 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-neutral-800 dark:text-neutral-100 outline-none"
                      value={config.apRefreshes_event}
                      onChange={(e) => setConfig({ ...config, apRefreshes_event: Number(e.target.value) })}
                    >
                      {[0, 3, 6, 9, 12].map((v) => (
                        <option key={v} value={v}>
                          {t('settings.refresh_count', { count: v })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 dark:text-neutral-500">{t('settings.normal_period')}</span>
                    <select
                      className="w-full border rounded px-2 py-1.5 text-xs bg-slate-50 dark:bg-neutral-800 border-slate-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 outline-none"
                      value={config.apRefreshes_normal}
                      onChange={(e) => setConfig({ ...config, apRefreshes_normal: Number(e.target.value) })}
                    >
                      {[0, 3, 6, 9, 12].map((v) => (
                        <option key={v} value={v}>
                          {t('settings.refresh_count', { count: v })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-neutral-800">
              <label className="font-bold text-slate-600 dark:text-neutral-400 block text-xs mb-2">{t('settings.custom_income_title')}</label>
              <div className="flex flex-wrap gap-2 items-center text-xs">
                <input
                  type="date"
                  className="border dark:border-neutral-700 rounded px-2 py-1.5 bg-slate-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none"
                  value={newCustomDate}
                  onChange={(e) => setNewCustomDate(e.target.value)}
                />
                <input
                  type="text"
                  placeholder={t('settings.custom_income_desc')}
                  className="flex-1 min-w-[120px] border dark:border-neutral-700 rounded px-2 py-1.5 bg-slate-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none"
                  value={newCustomTitle}
                  onChange={(e) => setNewCustomTitle(e.target.value)}
                />
                <CustomNumberInput
                  className="w-24 border dark:border-neutral-700 rounded px-2 py-1.5 bg-slate-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 outline-none text-right"
                  placeholder={t('settings.custom_income_amount')}
                  value={newCustomAmount || null}
                  onChange={(val) => setNewCustomAmount(Number(val))}
                />
                <button onClick={handleAddCustomIncome} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1.5 px-3 rounded transition-colors">
                  {t('common.add', { defaultValue: 'Add' })} {/* For common keys, it's fine to leave them temporarily in case of missing translations */}
                </button>
              </div>

              {/* List of added custom entries */}
              {config.customIncomes && config.customIncomes.length > 0 && (
                <div className="mt-3 space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                  {config.customIncomes.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-slate-50 dark:bg-neutral-800/50 px-3 py-1.5 rounded text-xs border border-slate-100 dark:border-neutral-800">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 font-mono">{item.date}</span>
                        <span className="text-slate-700 dark:text-neutral-300 font-bold">{item.title}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`font-black ${item.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {item.amount > 0 ? '+' : ''}
                          {item.amount}
                        </span>
                        <button onClick={() => handleRemoveCustomIncome(item.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chart and detailed history area */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 shadow-sm overflow-hidden transition-colors">
            <div className="p-4 h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={probTimeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={off} stopColor="#2563eb" stopOpacity={0.1} />
                      <stop offset={off} stopColor="#ef4444" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-neutral-800" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5).replace('-', '/')} minTickGap={30} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', fontSize: '12px', backgroundColor: 'rgba(23, 23, 23, 0.9)', borderColor: '#404040', color: '#fff', backdropFilter: 'blur(4px)' }}
                    itemStyle={{ padding: '2px 0' }}
                    formatter={(value, name) => {
                      if (typeof value !== 'number') return [value, name];
                      const valStr = Math.round(value).toLocaleString();
                      if (name === 'maxCdf') return [`${value.toFixed(1)}%`, t('chart.survival_rate')];
                      if (name === 'pyroxeneHigh') return [valStr, t('chart.lucky')];
                      if (name === 'pyroxeneLow') return [valStr, t('chart.unlucky')];
                      if (name === 'pyroxeneWorst') return [valStr, t('chart.worst')];
                      return [valStr, t('chart.avg_balance')];
                    }}
                  />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: '11px', paddingTop: '10px', color: '#94a3b8' }} />
                  <Area type="monotone" dataKey="pyroxeneHigh" stroke="none" fill="#3b82f6" fillOpacity={0.05} animationDuration={500} />
                  <Area type="monotone" dataKey="pyroxeneLow" stroke="none" fill="transparent" animationDuration={500} />
                  <Line type="monotone" dataKey="pyroxeneHigh" stroke="#60a5fa" strokeWidth={1} dot={false} strokeDasharray="4 4" name={t('chart.upper_10')} />
                  <Line type="monotone" dataKey="pyroxeneAvg" stroke="#2563eb" strokeWidth={2} dot={false} name={t('chart.avg')} />
                  <Line type="monotone" dataKey="pyroxeneLow" stroke="#94a3b8" strokeWidth={1} dot={false} name={t('chart.lower_10')} />
                  <Line type="monotone" dataKey="pyroxeneWorst" stroke="#ef4444" strokeWidth={1} dot={false} strokeDasharray="2 2" name={t('chart.worst')} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="border-t border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-800/30">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full px-4 py-3 flex items-center justify-center gap-2 text-xs font-bold text-slate-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <FaListUl /> {showDetails ? t('chart.hide_details') : t('chart.show_details')}
                {showDetails ? <FaChevronUp /> : <FaChevronDown />}
              </button>

              {showDetails && (
                <div className="max-h-64 overflow-y-auto custom-scrollbar border-t border-slate-100 dark:border-neutral-800">
                  <table className="w-full text-xs text-left text-slate-600 dark:text-neutral-400">
                    <thead className="bg-slate-100 dark:bg-neutral-800 sticky top-0 shadow-sm">
                      <tr>
                        <th className="px-4 py-2 w-24">{t('chart.table_date')}</th>
                        <th className="px-4 py-2">{t('chart.table_reason')}</th>
                        <th className="px-4 py-2 text-right w-24">{t('chart.table_delta')}</th>
                        <th className="px-4 py-2 text-right w-24">{t('chart.table_balance')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {probTimeline.map((pt, i, arr) => {
                        const prevAvg = i > 0 ? arr[i - 1].pyroxeneAvg : pt.pyroxeneAvg;
                        const delta = pt.pyroxeneAvg - prevAvg;

                        const logs: any[] = (pt as any).logs || [];
                        const hasLogs = logs.length > 0;
                        const hasChange = Math.abs(delta) >= 1;

                        if (!hasChange && !hasLogs && i !== 0) return null; // Hide days with no changes

                        return (
                          <tr key={pt.date} className="border-b border-slate-50 dark:border-neutral-800/50 hover:bg-white dark:hover:bg-neutral-800 transition-colors">
                            <td className="px-4 py-2 font-mono whitespace-nowrap">{pt.date}</td>
                            <td className="px-4 py-2">
                              {hasLogs ? (
                                <ul className="space-y-0.5">
                                  {logs.map((log, idx) => (
                                    <li key={idx} className="flex justify-between w-full max-w-[200px]">
                                      <span>{log.i18nKey ? t(log.i18nKey, log.params) : log.title}</span>
                                      <span className={log.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                                        {log.amount > 0 ? '+' : ''}
                                        {log.amount}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-slate-400 italic">{i === 0 ? t('chart.start_balance') : t('chart.daily_calc')}</span>
                              )}
                            </td>
                            <td className={`px-4 py-2 text-right font-bold ${delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-rose-500' : ''}`}>
                              {delta > 0 ? '+' : ''}
                              {Math.round(delta).toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-right font-bold text-slate-800 dark:text-neutral-200">{Math.round(pt.pyroxeneAvg).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* [Right] Timeline list */}
        <div className="min-w-[280px] h-[700px]">
          <SimpleTimeline schedules={schedules} apOverrides={apOverrides} onApChange={handleApChange} />
        </div>
      </div>

      <StatsPanel config={config} stats={stats} planSuccessRate={minMaxCdf} />
    </div>
  );
}
