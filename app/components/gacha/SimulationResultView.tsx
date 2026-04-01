// app/components/gacha/SimulationResultView.tsx

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine, Cell } from 'recharts';
import { FaGem, FaCheckCircle, FaExclamationTriangle, FaChartBar, FaCoins, FaSyncAlt } from 'react-icons/fa';
import type { GlobalAggregatedResult } from '~/utils/gachaEngine';

interface Props {
  result: GlobalAggregatedResult | null;
  initialPyroxenes: number;
  portraitMap: Record<number, string>;
  bankruptcyRate: number | null;
}

type UnitType = 'pyroxenes' | 'pulls';

export default function SimulationResultView({ result, initialPyroxenes, portraitMap, bankruptcyRate }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.result_view' });

  if (!result) return null;

  const [chartType, setChartType] = useState<'PDF' | 'CDF'>('PDF');
  const [unit, setUnit] = useState<UnitType>('pyroxenes');
  const [expandedStudentId, setExpandedStudentId] = useState<number | null>(null);

  const activeDist = unit === 'pyroxenes' ? result.distCost : result.distPulls;

  const chartData = activeDist.map((d) => ({
    ...d,
    label: unit === 'pyroxenes' ? `${(d.binEnd / 1000).toFixed(1)}k` : t('chart.unit_count', { count: d.binEnd }),
    rangeLabel: unit === 'pyroxenes' ? `${d.binStart.toLocaleString()} ~ ${d.binEnd.toLocaleString()}` : t('chart.range_count', { start: d.binStart, end: d.binEnd }),
  }));

  // const safeZone = result.distCost.find((d) => d.binEnd > initialPyroxenes);
  // const bankruptcyRate = safeZone ? 100 - safeZone.cdf : 0;
  const isSafe = bankruptcyRate != null && bankruptcyRate < 10;

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

      {/* 2. Core summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Success rate */}
        <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400 text-sm font-bold uppercase">
            <FaCheckCircle className="text-green-500 dark:text-green-400" /> {t('summary.success_rate.title')}
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className={`text-4xl font-extrabold ${result.successRate > 90 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-500'}`}>{result.successRate.toFixed(1)}</span>
            <span className="text-lg font-bold text-neutral-400">%</span>
          </div>
          <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">{t('summary.success_rate.desc')}</div>
        </div>

        {/* Average consumption */}
        <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400 text-sm font-bold uppercase">
            {unit === 'pyroxenes' ? <FaGem className="text-blue-400" /> : <FaSyncAlt className="text-blue-400" />}
            {unit === 'pyroxenes' ? t('summary.avg_cost.title_pyroxenes') : t('summary.avg_cost.title_pulls')}
          </div>
          <div className="mt-2">
            <div className="text-3xl font-extrabold text-neutral-800 dark:text-neutral-100">
              {unit === 'pyroxenes' ? Math.round(result.avgTotalCost).toLocaleString() : Math.round(result.avgTotalPulls).toLocaleString()}
            </div>
            <div className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              {unit === 'pyroxenes' ? t('summary.avg_cost.approx_pulls', { amount: Math.round(result.avgTotalCost / 120).toLocaleString() }) : t('summary.avg_cost.includes_free')}
            </div>
          </div>
        </div>

        {/* Stability evaluation */}
        {bankruptcyRate != null && (
          <div
            className={`p-5 rounded-xl border shadow-sm flex flex-col justify-between ${isSafe ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/50' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50'}`}
          >
            <div className={`flex items-center gap-2 text-sm font-bold uppercase ${isSafe ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              <FaExclamationTriangle /> {t('summary.safety.title')}
            </div>
            <div className="mt-2">
              <div className={`text-xl font-bold ${isSafe ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                {isSafe ? t('summary.safety.safe') : t('summary.safety.unsafe')}
              </div>
              <div className="text-xs mt-1 opacity-80 font-medium dark:text-neutral-300">{t('summary.safety.bankruptcy_prob', { rate: bankruptcyRate.toFixed(1) })}</div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Distribution chart */}
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
                    <Cell key={`cell-${index}`} fill={unit === 'pyroxenes' && entry.binEnd > initialPyroxenes ? '#ef4444' : '#3b82f6'} />
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

      {/* 4. Detailed results per student */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden transition-colors">
        <div className="bg-neutral-50 dark:bg-neutral-800/50 px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <h3 className="font-bold text-neutral-700 dark:text-neutral-200 flex items-center gap-2">
            <FaCoins className="text-amber-500" /> {t('student_stats.title')}
          </h3>
        </div>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800 max-h-[50vh] overflow-y-auto">
          {Object.values(result.studentStats)
            .sort((a, b) => b.obtainRate - a.obtainRate)
            .filter((s) => s.obtainRate > 1)
            .map((stat) => {
              const imgSrc = portraitMap[stat.studentId] ? `data:image/webp;base64,${portraitMap[stat.studentId]}` : null;
              // Calculate status color based on probability
              const rateColor = stat.obtainRate > 80 ? 'bg-green-500' : stat.obtainRate > 50 ? 'bg-blue-500' : stat.obtainRate > 20 ? 'bg-amber-500' : 'bg-red-500';

              return (
                <div key={stat.studentId} className="group">
                  <div
                    className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors"
                    onClick={() => setExpandedStudentId(expandedStudentId === stat.studentId ? null : stat.studentId)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        {imgSrc ? (
                          <img src={imgSrc} alt={stat.name} className="w-11 h-11 rounded-full object-cover border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800" />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-500">{stat.name.charAt(0)}</div>
                        )}
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-neutral-900 ${rateColor}`}
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
                      {expandedStudentId === stat.studentId ? t('student_stats.collapse') : t('student_stats.expand')}
                    </div>
                  </div>

                  {expandedStudentId === stat.studentId && (
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
    </div>
  );
}
