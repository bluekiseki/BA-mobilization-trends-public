// app/components/gacha/SimulationResultView.tsx

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine, Cell } from 'recharts';
import { FaGem, FaCheckCircle, FaChartBar, FaSyncAlt } from 'react-icons/fa';
import type { GlobalAggregatedResult } from '~/utils/gachaEngine';

interface Props {
  result: GlobalAggregatedResult | null;
  initialPyroxenes: number;
  portraitMap: Record<number, string>;
  bankruptcyRate: number | null;
}

type UnitType = 'pyroxenes' | 'pulls';

export default function SimulationResultView({ result, initialPyroxenes, portraitMap: _portraitMap, bankruptcyRate }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.result_view' });

  if (!result) return null;

  const [chartType, setChartType] = useState<'PDF' | 'CDF'>('PDF');
  const [unit, setUnit] = useState<UnitType>('pyroxenes');

  const activeDist = unit === 'pyroxenes' ? result.distCost : result.distPulls;

  const chartData = activeDist.map((d) => ({
    ...d,
    label: unit === 'pyroxenes' ? `${(d.binEnd / 1000).toFixed(1)}k` : t('chart.unit_count', { count: d.binEnd }),
    rangeLabel: unit === 'pyroxenes' ? `${d.binStart.toLocaleString()} ~ ${d.binEnd.toLocaleString()}` : t('chart.range_count', { start: d.binStart, end: d.binEnd }),
  }));

  // Simple budget check computed from distCost — always available even without income plan
  const simpleBudgetOverrate = (() => {
    const bin = result.distCost.find((d) => d.binEnd > initialPyroxenes);
    if (!bin) return 0;
    return parseFloat((100 - bin.cdf).toFixed(1));
  })();

  // Income-plan-adjusted rate takes priority if available
  const effectiveBankruptcyRate = bankruptcyRate ?? simpleBudgetOverrate;
  const isIncomePlanApplied = bankruptcyRate !== null;
  const isSafe = effectiveBankruptcyRate < 10;

  // Derive the budget threshold from effectiveBankruptcyRate so the red bar area
  // always matches the displayed percentage, regardless of income timeline.
  // (initialPyroxenes alone is wrong because income accumulates over time)
  const budgetThreshold = (() => {
    const targetCdf = 100 - effectiveBankruptcyRate;
    const bin = result.distCost.find((d) => d.cdf >= targetCdf);
    return bin ? bin.binEnd : Infinity;
  })();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Unit selection toggle (Tabs) */}
      <div className="bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg flex text-sm font-bold mx-auto max-w-sm transition-colors">
        <button
          onClick={() => setUnit('pyroxenes')}
          className={`flex-1 py-2 rounded-md flex items-center justify-center gap-2 transition-all ${
            unit === 'pyroxenes'
              ? 'bg-white dark:bg-neutral-700 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
          }`}
        >
          <FaGem /> {t('unit_toggle.pyroxenes')}
        </button>
        <button
          onClick={() => setUnit('pulls')}
          className={`flex-1 py-2 rounded-md flex items-center justify-center gap-2 transition-all ${
            unit === 'pulls' ? 'bg-white dark:bg-neutral-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
          }`}
        >
          <FaSyncAlt /> {t('unit_toggle.pulls')}
        </button>
      </div>

      <div className="text-center text-[11px] text-neutral-400 dark:text-neutral-500 -mt-3">{t('disclaimer')}</div>

      {/* 2. Hero card — budget feasibility (always shown) */}
      <div
        className={`p-5 rounded-xl border shadow-sm ${isSafe ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/50' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50'}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${isSafe ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{t('summary.safety.title')}</div>
            <div className={`text-4xl font-extrabold ${isSafe ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {isSafe ? t('summary.safety.safe') : t('summary.safety.unsafe')}
            </div>
            <div className={`text-sm mt-1 font-medium ${isSafe ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              {t('summary.safety.bankruptcy_prob', { rate: effectiveBankruptcyRate.toFixed(1) })}
            </div>
          </div>
          <span
            className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-full ${isIncomePlanApplied ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}`}
          >
            {isIncomePlanApplied ? t('summary.safety.income_applied') : t('summary.safety.income_not_applied')}
          </span>
        </div>
      </div>

      {/* 3. Secondary cards — 2-col */}
      <div className="grid grid-cols-2 gap-4">
        {/* Must students acquisition rate */}
        <div className="bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-neutral-400 dark:text-neutral-500 text-xs font-bold uppercase">
            <FaCheckCircle className="text-neutral-400 dark:text-neutral-500" /> {t('summary.success_rate.title')}
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-extrabold text-neutral-600 dark:text-neutral-300">{result.successRate.toFixed(1)}</span>
            <span className="text-sm font-bold text-neutral-400">%</span>
          </div>
          <div className="text-[11px] text-neutral-400 dark:text-neutral-500">{t('summary.success_rate.desc')}</div>
        </div>

        {/* Average consumption */}
        <div className="bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-neutral-400 dark:text-neutral-500 text-xs font-bold uppercase">
            {unit === 'pyroxenes' ? <FaGem className="text-neutral-400 dark:text-neutral-500" /> : <FaSyncAlt className="text-neutral-400 dark:text-neutral-500" />}
            {unit === 'pyroxenes' ? t('summary.avg_cost.title_pyroxenes') : t('summary.avg_cost.title_pulls')}
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-extrabold text-neutral-600 dark:text-neutral-300">
              {unit === 'pyroxenes' ? Math.round(result.avgTotalCost).toLocaleString() : Math.round(result.avgTotalPulls).toLocaleString()}
            </span>
          </div>
          <div className="text-[11px] text-neutral-400 dark:text-neutral-500">
            {unit === 'pyroxenes' ? t('summary.avg_cost.approx_pulls', { amount: Math.round(result.avgTotalCost / 120).toLocaleString() }) : t('summary.avg_cost.includes_free')}
          </div>
        </div>
      </div>

      {/* 4. Distribution chart */}
      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-neutral-700 dark:text-neutral-200 flex items-center gap-2">
            <FaChartBar />
            {unit === 'pyroxenes' ? t('chart.title_pyroxenes') : t('chart.title_pulls')}
          </h3>
          <div className="flex bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
            <button
              onClick={() => setChartType('PDF')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${chartType === 'PDF' ? 'bg-white dark:bg-neutral-700 shadow text-blue-600 dark:text-blue-400' : 'text-neutral-500'}`}
            >
              {t('chart.mode_pdf')}
            </button>
            <button
              onClick={() => setChartType('CDF')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${chartType === 'CDF' ? 'bg-white dark:bg-neutral-700 shadow text-blue-600 dark:text-blue-400' : 'text-neutral-500'}`}
            >
              {t('chart.mode_cdf')}
            </button>
          </div>
        </div>

        {chartType === 'PDF' && unit === 'pyroxenes' && (
          <div className="flex items-center gap-3 mb-3 text-xs text-neutral-400 dark:text-neutral-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500" />
              {t('chart.legend_within_budget')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500 opacity-80" />
              {t('chart.legend_over_budget')} ({effectiveBankruptcyRate.toFixed(1)}%)
            </span>
          </div>
        )}

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'PDF' ? (
              <BarChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" opacity={0.1} />
                <XAxis dataKey="binEnd" tick={{ fontSize: 11, fill: '#888' }} tickFormatter={(val) => (unit === 'pyroxenes' ? `${(val / 1000).toFixed(0)}k` : `${val}`)} />
                <Tooltip
                  cursor={{ fill: 'currentColor', className: 'text-neutral-100 dark:text-neutral-800' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-neutral-800 dark:bg-neutral-950 text-white text-xs p-2 rounded shadow-lg border border-neutral-700">
                          <p className="font-bold mb-1">{d.rangeLabel}</p>
                          <p className="text-blue-300 font-bold">{t('chart.tooltip_prob', { rate: d.pdf.toFixed(2) })}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="pdf" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.binEnd > budgetThreshold ? '#ef4444' : '#3b82f6'} fillOpacity={entry.binEnd > budgetThreshold ? 0.8 : 1} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" opacity={0.1} />
                <XAxis dataKey="binEnd" tick={{ fontSize: 11, fill: '#888' }} tickFormatter={(val) => (unit === 'pyroxenes' ? `${(val / 1000).toFixed(0)}k` : `${val}`)} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#888' }} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#171717', borderColor: '#404040', color: '#fff', fontSize: '12px' }}
                  itemStyle={{ color: '#60a5fa' }}
                  labelFormatter={(label) => (unit === 'pyroxenes' ? t('chart.cdf_label_pyroxenes', { amount: label }) : t('chart.cdf_label_pulls', { amount: label }))}
                />
                <Area type="monotone" dataKey="cdf" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '50%', fontSize: 10, fill: '#f59e0b', position: 'right' }} />
                <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '90%', fontSize: 10, fill: '#ef4444', position: 'right' }} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
