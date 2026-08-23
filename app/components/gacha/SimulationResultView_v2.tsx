// app/components/gacha/SimulationResultView_v2.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { FaGem, FaChartBar, FaSyncAlt, FaCoins, FaSearch, FaTimes, FaChevronDown } from 'react-icons/fa';
import { meanFromDist, ticketCreditedDist, type GlobalAggregatedResult } from '~/utils/gachaEngine';
import type { BannerStrategy } from '~/types/gacha';
import type { BannerPeriod } from '~/utils/gachaData';
import { useSearchMatcher } from '~/utils/useSearchMatcher';
import type { Locale } from '~/utils/i18n/config';

interface CustomBarProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  radius: number | number[];
}

interface Props {
  result: GlobalAggregatedResult | null;
  initialPyroxenes: number;
  portraitMap: Record<number, string>;
  pyroxeneIcon?: string | null;
  elephIconMap?: Record<string, string>;
  bankruptcyRate: number | null;
  strategies: Record<string, BannerStrategy>;
  banners: BannerPeriod[];
  allStudents: { id: number; starGrade?: number }[];
  /** Number of already-owned students the simulation was run with (0 if the "owned students" toggle is off) — shown as a caption under the eligma distribution. */
  ownedStudentCount: number;
}

type ChartTab = 'net' | 'gross' | 'pulls' | 'eligma';

const monoStyle = { fontFamily: 'inherit' };
const fmt = (n: number) => Math.round(n).toLocaleString();

function RingGauge({ value, color, size = 84 }: { value: number; color: string; size?: number }) {
  const sw = 6;
  const r = (size - sw) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <svg width={size} height={size} className="shrink-0" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={sw} className="text-neutral-200 dark:text-neutral-800" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
}

export default function SimulationResultView_v2({
  result,
  initialPyroxenes,
  portraitMap,
  pyroxeneIcon,
  elephIconMap = {},
  bankruptcyRate,
  strategies,
  banners,
  allStudents,
  ownedStudentCount,
}: Props) {
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'gacha.result_view' });
  const { t: tGacha } = useTranslation('planner', { keyPrefix: 'gacha' });
  const { t: t_ui } = useTranslation('ui');
  const { t: t_g } = useTranslation('game');
  const matcher = useSearchMatcher(i18n.language as Locale);
  type StudentFilterKey = 'pickup' | 'fes' | 'star3' | 'star2' | 'star1';
  const [tab, setTab] = useState<ChartTab>('net');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<StudentFilterKey>>(new Set(['pickup']));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /** null = the overall (all-banners) distribution; otherwise a specific active banner's cumulative-so-far distribution. */
  const [selectedBannerId, setSelectedBannerId] = useState<string | null>(null);
  /** 'cumulative' = spend/pulls/eligma up to and including the selected banner; 'incremental' = just that one banner's own distribution. */
  const [distMode, setDistMode] = useState<'cumulative' | 'incremental'>('cumulative');

  const toggleFilter = (f: StudentFilterKey) =>
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  if (!result) return null;

  // elephIconMap holds the full Item icon map keyed by numeric id (despite its name), not just per-student
  // eleph icons — Item_23 is eligma (see app/utils/itemType.ts's isEligma check), Item_6999 is the 10-pull ticket.
  const eligmaIcon = elephIconMap['23'];
  const ticket10Icon = elephIconMap['6999'];

  const isPyroxeneTab = tab === 'net' || tab === 'gross';
  const chartTitle = isPyroxeneTab ? t('chart.title_pyroxenes') : tab === 'pulls' ? t('chart.title_pulls') : t('chart.title_eligma');

  const selectableBanners = banners.filter((b) => strategies[b.id]?.isActive && result.cost.count(b.id) > 0).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const bannerLabel = (b: BannerPeriod) => `${b.startTime.slice(5, 10)} ${b.pickupStudents.map((s) => s.name).join('/')}`;
  const effectiveBannerId = selectedBannerId ?? selectableBanners[selectableBanners.length - 1]?.id ?? 'inf';

  const activeDist = (() => {
    if (tab === 'gross') {
      return distMode === 'incremental'
        ? ticketCreditedDist(result.costWithGachaTicketsIncremental, result.costIncremental, effectiveBannerId)
        : ticketCreditedDist(result.costWithGachaTickets, result.cost, effectiveBannerId);
    }
    if (distMode === 'incremental') {
      const incMetric = tab === 'net' ? result.costIncremental : tab === 'pulls' ? result.pullsIncremental : result.eligmaIncremental;
      return incMetric.dist(effectiveBannerId);
    }
    const cumMetric = tab === 'net' ? result.cost : tab === 'pulls' ? result.pulls : result.eligmaCumulative;
    return cumMetric.dist(effectiveBannerId).length ? cumMetric.dist(effectiveBannerId) : cumMetric.dist('inf');
  })();
  const labelFor = (binStart: number) => (isPyroxeneTab ? `${(binStart / 1000).toFixed(1)}k` : tab === 'pulls' ? t('chart.unit_count', { count: binStart }) : binStart.toLocaleString());

  const chartData = activeDist.map((d) => ({
    ...d,
    label: labelFor(d.binStart),
    rangeLabel: isPyroxeneTab ? d.binStart.toLocaleString() : labelFor(d.binStart),
  }));

  // Re-group fine bins into display bins (10x scale) for readability; stats use fine data.
  const displayChartData =
    tab === 'eligma' || tab === 'gross'
      ? (() => {
          const groupSize = 10;
          const groups: typeof chartData = [];
          for (let i = 0; i < chartData.length; i += groupSize) {
            const chunk = chartData.slice(i, i + groupSize);
            const last = chunk[chunk.length - 1];
            const binStart = chunk[0].binStart;
            groups.push({
              ...chunk[0],
              binStart,
              binEnd: last.binEnd,
              count: chunk.reduce((sum, d) => sum + d.count, 0),
              pdf: chunk.reduce((sum, d) => sum + d.pdf, 0),
              cdf: last.cdf,
              label: labelFor(binStart),
              rangeLabel: isPyroxeneTab ? binStart.toLocaleString() : labelFor(binStart),
            });
          }
          return groups;
        })()
      : chartData;

  const simpleBudgetOverrate = (() => {
    const bin = result.cost.dist('inf').find((d) => d.binStart > initialPyroxenes);
    if (!bin) return 0;
    return parseFloat((100 - bin.cdf).toFixed(1));
  })();

  const effectiveBankruptcyRate = bankruptcyRate ?? simpleBudgetOverrate;
  const isSafe = effectiveBankruptcyRate < 10;

  // Match percentile across active distribution to keep "over budget" bars consistent.
  const activeBudgetThreshold = (() => {
    const targetCdf = 100 - effectiveBankruptcyRate;
    const bin = activeDist.find((d) => d.cdf >= targetCdf);
    return bin ? bin.binStart : Infinity;
  })();

  // Percentile markers and the trimmed tail below both drive what's drawn (reference lines, bar range), so
  // they read off displayChartData — same grouping as the bars, not the fine per-1 data.
  const p50bin = displayChartData.find((d) => d.cdf >= 50);
  const p90bin = displayChartData.find((d) => d.cdf >= 90);
  const p995bin = displayChartData.find((d) => d.cdf >= 99.5);

  // Trim right tail past P99.5 to remove truly-zero bins
  const trimmedChartData = (() => {
    const tailIdx = displayChartData.findIndex((d) => d.cdf >= 99.5);
    return tailIdx >= 0 ? displayChartData.slice(0, Math.min(tailIdx + 2, displayChartData.length)) : displayChartData;
  })();

  const renderCustomBar = (props: CustomBarProps) => {
    const entry = trimmedChartData[props.index];
    const isOverBudget = isPyroxeneTab && entry?.binStart > activeBudgetThreshold;
    const fill = isOverBudget ? '#ef4444' : '#77e0ff';
    const fillOpacity = isOverBudget ? 0.7 : 0.35;
    const rArray = Array.isArray(props.radius) ? props.radius : [props.radius];
    return <rect x={props.x} y={props.y} width={props.width} height={props.height} fill={fill} fillOpacity={fillOpacity} rx={rArray[0] || 0} ry={rArray[0] || 0} />;
  };

  // Collect pickup student IDs (across all active strategies, mode !== skip)
  const pickupStudentIds = new Set<number>();
  for (const banner of Object.values(strategies)) {
    if (!banner.isActive) continue;
    for (const [sidStr, cfg] of Object.entries(banner.studentConfigs ?? {})) {
      if (cfg.mode !== 'skip') pickupStudentIds.add(Number(sidStr));
    }
  }

  const allStats = allStudents
    .map((s) => {
      const stat = result.studentStats[s.id];
      if (!stat || stat.obtainRate <= 1) return null;
      return { ...stat, rarity: s.starGrade, isPickup: pickupStudentIds.has(s.id) };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const rateColor = (rate: number) => (rate > 80 ? '#16a34a' : rate > 50 ? '#77e0ff' : rate > 20 ? '#d97706' : '#dc2626');

  return (
    <div className="space-y-4">
      {/* Hero: Pyroxene sufficiency probability */}
      {(() => {
        const rate = 100 - effectiveBankruptcyRate;
        const ringColor = isSafe ? '#16a34a' : effectiveBankruptcyRate < 30 ? '#d97706' : '#dc2626';
        const bgCls = isSafe ? 'bg-green-50/60 border-green-200 dark:bg-green-950/20 dark:border-green-900/40' : 'bg-red-50/60 border-red-200 dark:bg-red-950/20 dark:border-red-900/40';
        return (
          <div className={`rounded-xl border px-4 py-4 flex items-center gap-4 ${bgCls}`}>
            {/* Ring gauge with number inside */}
            <div className="relative shrink-0">
              <RingGauge value={rate} color={ringColor} size={84} />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-black tabular-nums leading-none" style={{ ...monoStyle, color: ringColor }}>
                  {rate.toFixed(1)}
                </span>
                <span className="text-[9px] font-bold opacity-40">%</span>
              </div>
            </div>

            {/* Label + status */}
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5" style={monoStyle}>
                {t('summary.safety.title')}
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${isSafe ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className={`text-xs font-bold ${isSafe ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {isSafe ? t('summary.safety.safe') : t('summary.safety.unsafe')}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-neutral-500 dark:text-neutral-400">{tGacha('failure_out_of_100', { count: Math.round(effectiveBankruptcyRate) })}</p>
            </div>

            {/* Secondary stats */}
            <div className="flex flex-col items-end gap-3 shrink-0 text-right" style={monoStyle}>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-0.5">{t('summary.success_rate.title')}</div>
                <div className="text-base font-bold text-neutral-600 dark:text-neutral-300">{result.successRate.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-0.5">{t('summary.avg_cost.title_pyroxenes')}</div>
                <div className="text-base font-bold text-neutral-600 dark:text-neutral-300">{fmt(result.cost.avg('inf'))}</div>
                <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                  ≈{Math.round(result.cost.avg('inf') / 120).toLocaleString()}
                  {t('pulls_short')}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="text-[10px] text-neutral-400 dark:text-neutral-500 -mt-1">{t('disclaimer')}</div>

      {/* Distribution chart */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <div className="mb-3">
            <h3 className="font-bold text-neutral-700 dark:text-neutral-200 flex items-center gap-2 text-sm mb-2">
              <FaChartBar className="shrink-0" />
              {chartTitle}
            </h3>
            <div className="mb-2 space-y-1.5 @container">
              {/* @min-[820px] = container query (not viewport) for sidebar + card layouts */}
              <div className="bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg grid grid-cols-2 @min-[820px]:grid-cols-4 gap-0.5">
                <button
                  onClick={() => setTab('net')}
                  className={`px-2 py-1 rounded-md flex items-center justify-center gap-1 whitespace-nowrap text-[10px] font-bold transition-all ${tab === 'net' ? 'text-[#06262f]' : 'text-neutral-500 dark:text-neutral-400'}`}
                  style={tab === 'net' ? { background: '#77e0ff' } : {}}
                >
                  {pyroxeneIcon ? (
                    <span className="shrink-0 inline-flex items-center justify-center" style={{ width: 14, height: 14 }}>
                      <img src={`data:image/webp;base64,${pyroxeneIcon}`} className="max-w-full max-h-full object-cover" />
                    </span>
                  ) : (
                    <FaGem size={9} />
                  )}{' '}
                  {t('chart.cost_view_net')}
                </button>
                <button
                  onClick={() => setTab('gross')}
                  className={`px-2 py-1 rounded-md flex items-center justify-center gap-1 whitespace-nowrap text-[10px] font-bold transition-all ${tab === 'gross' ? 'text-[#06262f]' : 'text-neutral-500 dark:text-neutral-400'}`}
                  style={tab === 'gross' ? { background: '#77e0ff' } : {}}
                >
                  {pyroxeneIcon ? (
                    <span className="shrink-0 inline-flex items-center justify-center" style={{ width: 14, height: 14 }}>
                      <img src={`data:image/webp;base64,${pyroxeneIcon}`} className="max-w-full max-h-full object-cover" />
                    </span>
                  ) : (
                    <FaGem size={9} />
                  )}{' '}
                  {t('chart.cost_view_gross')}
                </button>
                <button
                  onClick={() => setTab('pulls')}
                  className={`px-2 py-1 rounded-md flex items-center justify-center gap-1 whitespace-nowrap text-[10px] font-bold transition-all ${tab === 'pulls' ? 'text-[#06262f]' : 'text-neutral-500 dark:text-neutral-400'}`}
                  style={tab === 'pulls' ? { background: '#77e0ff' } : {}}
                >
                  {ticket10Icon ? (
                    <span className="shrink-0 inline-flex items-center justify-center" style={{ width: 14, height: 14 }}>
                      <img src={`data:image/webp;base64,${ticket10Icon}`} className="max-w-full max-h-full object-cover" />
                    </span>
                  ) : (
                    <FaSyncAlt size={9} />
                  )}{' '}
                  {t('unit_toggle.pulls')}
                </button>
                <button
                  onClick={() => setTab('eligma')}
                  className={`px-2 py-1 rounded-md flex items-center justify-center gap-1 whitespace-nowrap text-[10px] font-bold transition-all ${tab === 'eligma' ? 'text-[#06262f]' : 'text-neutral-500 dark:text-neutral-400'}`}
                  style={tab === 'eligma' ? { background: '#77e0ff' } : {}}
                >
                  {eligmaIcon ? (
                    <span className="shrink-0 inline-flex items-center justify-center" style={{ width: 14, height: 14 }}>
                      <img src={`data:image/webp;base64,${eligmaIcon}`} className="max-w-full max-h-full object-cover" />
                    </span>
                  ) : (
                    <FaCoins size={9} />
                  )}{' '}
                  {t('unit_toggle.eligma')}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectableBanners.length > 0 && (
                  <select
                    className="text-[10px] ios-compact-10 border border-neutral-200 dark:border-neutral-700 rounded-md py-1 px-1.5 bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 outline-none focus:ring-2 focus:ring-ba-btn-blue cursor-pointer"
                    style={monoStyle}
                    value={effectiveBannerId ?? ''}
                    onChange={(e) => setSelectedBannerId(e.target.value || null)}
                  >
                    {selectableBanners.map((b) => (
                      <option key={b.id} value={b.id}>
                        {bannerLabel(b)}
                      </option>
                    ))}
                    <option value="inf">{t('banner_select_all_period')}</option>
                  </select>
                )}
                <div className="bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg inline-flex gap-0.5">
                  <button
                    onClick={() => setDistMode('cumulative')}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${distMode === 'cumulative' ? 'text-[#06262f]' : 'text-neutral-500 dark:text-neutral-400'}`}
                    style={distMode === 'cumulative' ? { background: '#77e0ff' } : {}}
                  >
                    {t('dist_mode.cumulative')}
                  </button>
                  <button
                    onClick={() => setDistMode('incremental')}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${distMode === 'incremental' ? 'text-[#06262f]' : 'text-neutral-500 dark:text-neutral-400'}`}
                    style={distMode === 'incremental' ? { background: '#77e0ff' } : {}}
                  >
                    {t('dist_mode.incremental')}
                  </button>
                </div>
              </div>
            </div>
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500" style={monoStyle}>
              {t('chart_pdf_cdf')}
            </div>
            {tab === 'eligma' && <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-1">{t('eligma_owned_caption', { count: ownedStudentCount })}</div>}
          </div>

          {isPyroxeneTab && (
            <div className="flex items-center gap-3 mb-3 text-xs text-neutral-400 dark:text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm opacity-60" style={{ background: '#77e0ff' }} />
                {t('chart.legend_within_budget')} ({(100 - effectiveBankruptcyRate).toFixed(1)}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500 opacity-70" />
                {t('chart.legend_over_budget')} ({effectiveBankruptcyRate.toFixed(1)}%)
              </span>
            </div>
          )}

          <div className="h-52 w-full">
            {trimmedChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-neutral-400 dark:text-neutral-500">{t('chart.no_data')}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trimmedChartData} margin={{ top: 18, right: 4, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" opacity={0.1} />
                  <XAxis dataKey="binStart" tick={{ fontSize: 10, fill: '#a3a3a3' }} tickFormatter={(val) => (isPyroxeneTab ? `${(val / 1000).toFixed(0)}k` : `${val}`)} axisLine={false} />
                  <YAxis yAxisId="pdf" hide width={0} />
                  <YAxis yAxisId="cdf" orientation="right" width={38} domain={[0, 100]} tickCount={3} tick={{ fontSize: 10, fill: '#a3a3a3' }} tickFormatter={(v) => `${v}%`} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: 'currentColor', className: 'text-neutral-100 dark:text-neutral-800' }}
                    content={({ active, payload }: Record<string, unknown>) => {
                      if (active && payload && Array.isArray(payload) && payload.length) {
                        const item = payload[0] as { payload: Record<string, unknown> };
                        const d = item.payload as { rangeLabel: string; pdf: number; cdf: number };
                        return (
                          <div className="bg-neutral-800 dark:bg-neutral-950 text-white text-xs p-2 rounded border border-neutral-700">
                            <p className="font-bold mb-1">{d.rangeLabel}</p>
                            <p style={{ color: '#77e0ff' }}>{t('chart.tooltip_prob', { rate: d.pdf.toFixed(2) })}</p>
                            <p className="text-neutral-300">CDF {d.cdf.toFixed(1)}%</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar yAxisId="pdf" dataKey="pdf" radius={[3, 3, 0, 0]} shape={renderCustomBar as never} isAnimationActive={false} />
                  <Line yAxisId="cdf" type="monotone" dataKey="cdf" stroke="#77e0ff" strokeWidth={2} dot={false} isAnimationActive={false} />
                  {p50bin && (
                    <ReferenceLine
                      x={p50bin.binStart}
                      stroke="#77e0ff"
                      strokeWidth={1}
                      strokeDasharray="4 3"
                      label={{ value: 'P50', fontSize: 9, fill: '#77e0ff', position: 'insideTopLeft', dy: -14 }}
                    />
                  )}
                  {p90bin && (
                    <ReferenceLine
                      x={p90bin.binStart}
                      stroke="#d97706"
                      strokeWidth={1}
                      strokeDasharray="4 3"
                      label={{ value: 'P90', fontSize: 9, fill: '#d97706', position: 'insideTopLeft', dy: -14 }}
                    />
                  )}
                  {p995bin && (
                    <ReferenceLine
                      x={p995bin.binStart}
                      stroke="#dc2626"
                      strokeWidth={1}
                      strokeDasharray="4 3"
                      label={{ value: 'P99.5', fontSize: 9, fill: '#dc2626', position: 'insideTopLeft', dy: -14 }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 divide-x divide-neutral-100 dark:divide-neutral-800 border-t border-neutral-100 dark:border-neutral-800">
          {(
            [
              {
                label: t_ui('avg'),
                val: meanFromDist(activeDist),
                c: '#a3a3a3',
              },
              { label: t('median_label'), val: p50bin?.binStart ?? null, c: '#77e0ff' },
              { label: t('pessimistic_label'), val: p90bin?.binStart ?? null, c: '#d97706' },
              { label: t('worst_label'), val: p995bin?.binStart ?? null, c: '#dc2626' },
            ] as { label: string; val: number | null; c: string }[]
          ).map(({ label, val, c }) => (
            <div key={label} className="px-3 py-2.5">
              <div className="text-[9px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 whitespace-nowrap" style={monoStyle}>
                {label}
              </div>
              <div className="mt-0.5 font-bold tabular-nums leading-none whitespace-nowrap" style={{ ...monoStyle, fontSize: 16, color: c }}>
                {val != null ? fmt(val) : '—'}
              </div>
              {val != null && isPyroxeneTab && (
                <div className="text-[9px] text-neutral-400 dark:text-neutral-500 mt-0.5 whitespace-nowrap">
                  {Math.round(val / 120).toLocaleString()}
                  {t('pulls_short')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Merged student browser: Acquisition per student and Elephs */}
      {allStats.length > 0 &&
        (() => {
          const q = searchQuery.trim();

          const passesFilter = (stat: (typeof allStats)[number]) => {
            if (q) return matcher(stat.name, q);
            if (activeFilters.size === 0) return true;
            if (activeFilters.has('pickup') && stat.isPickup) return true;
            if (activeFilters.has('fes') && stat.isFes) return true;
            if (activeFilters.has('star3') && stat.rarity === 3) return true;
            if (activeFilters.has('star2') && stat.rarity === 2) return true;
            if (activeFilters.has('star1') && stat.rarity === 1) return true;
            return false;
          };

          const filtered = allStats.filter(passesFilter).sort((a, b) => b.obtainRate - a.obtainRate);

          const selected = selectedId != null ? (allStats.find((s) => s.studentId === selectedId) ?? null) : null;

          const filterDefs: { key: StudentFilterKey; label: string }[] = [
            { key: 'pickup', label: t('filter.pickup') },
            { key: 'fes', label: t_g('fest') },
            { key: 'star3', label: t('filter.star3') },
            { key: 'star2', label: t('filter.star2') },
            { key: 'star1', label: t('filter.star1') },
          ];

          return (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500 whitespace-nowrap" style={monoStyle}>
                  {t('student_stats.title')}
                </span>
                <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                <span className="text-[10px] text-neutral-400 dark:text-neutral-600 whitespace-nowrap flex items-center gap-1" style={monoStyle}>
                  <FaChevronDown size={8} />
                  {t('student_stats.expand')}
                </span>
              </div>

              {/* Search + multi-select filter pills */}
              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5">
                  <FaSearch size={10} className="text-neutral-400 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('search_placeholder')}
                    className="flex-1 bg-transparent text-xs text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-400 focus:outline-none"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors">
                      <FaTimes size={9} />
                    </button>
                  )}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {filterDefs.map(({ key, label }) => {
                    const active = activeFilters.has(key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleFilter(key)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                          active ? 'border-ba-btn-blue' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-500'
                        }`}
                        style={active ? { background: '#77e0ff', color: '#06262f' } : undefined}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {activeFilters.size > 0 && (
                    <button
                      onClick={() => setActiveFilters(new Set())}
                      className="px-2 py-0.5 rounded text-[10px] border border-neutral-200 dark:border-neutral-700 text-neutral-400 hover:text-red-500 hover:border-red-300 transition-colors"
                    >
                      {t_ui('reset')}
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                {/* 2-col scrollable grid */}
                <div className="max-h-52 overflow-y-auto custom-scrollbar">
                  {filtered.length === 0 ? (
                    <div className="py-6 text-center text-xs text-neutral-400">{t_ui('noSearchResults')}</div>
                  ) : (
                    <div className="grid grid-cols-2 divide-x divide-neutral-100 dark:divide-neutral-800">
                      {filtered.map((stat) => {
                        const isSelected = selectedId === stat.studentId;
                        return (
                          <button
                            key={stat.studentId}
                            onClick={() => setSelectedId(isSelected ? null : stat.studentId)}
                            className={`flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 border-b border-neutral-100 dark:border-neutral-800 ${
                              isSelected ? 'bg-neutral-100 dark:bg-neutral-800' : ''
                            }`}
                          >
                            <div className="relative shrink-0">
                              {portraitMap[stat.studentId] ? (
                                <img
                                  src={`data:image/webp;base64,${portraitMap[stat.studentId]}`}
                                  alt={stat.name}
                                  className="w-7 h-7 rounded-full object-cover border border-neutral-200 dark:border-neutral-700"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-[10px] font-bold">{stat.name.charAt(0)}</div>
                              )}
                              {/* {elephIconMap[String(stat.studentId)] && (
                                <img
                                  src={`data:image/webp;base64,${elephIconMap[String(stat.studentId)]}`}
                                  width={12}
                                  height={12}
                                  className="absolute -bottom-0.5 -right-0.5 rounded-full border border-white dark:border-neutral-900 object-cover"
                                />
                              )} */}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-0.5">
                                <span className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200 truncate">{stat.name}</span>
                                {!stat.isPickup && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 shrink-0">{t('non_pickup_badge')}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold tabular-nums" style={{ ...monoStyle, color: rateColor(stat.obtainRate) }}>
                                  {stat.obtainRate.toFixed(1)}%
                                </span>
                                <span className="text-[9px] font-bold tabular-nums text-neutral-400 dark:text-neutral-500" style={monoStyle}>
                                  · +{Math.round(stat.avgEleph)}
                                </span>
                                <FaChevronDown size={8} className={`text-neutral-300 dark:text-neutral-600 transition-transform ml-auto ${isSelected ? 'rotate-180' : ''}`} />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Selected student detail panel */}
                {selected && (
                  <div className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-800/30 p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="relative shrink-0">
                        {portraitMap[selected.studentId] ? (
                          <img
                            src={`data:image/webp;base64,${portraitMap[selected.studentId]}`}
                            alt={selected.name}
                            className="w-10 h-10 rounded-full object-cover border border-neutral-200 dark:border-neutral-700"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold">{selected.name.charAt(0)}</div>
                        )}
                        {/* {elephIconMap[String(selected.studentId)] && (
                          <img
                            src={`data:image/webp;base64,${elephIconMap[String(selected.studentId)]}`}
                            width={14}
                            height={14}
                            className="absolute -bottom-0.5 -right-0.5 rounded-full border border-white dark:border-neutral-900 object-cover"
                          />
                        )} */}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100">{selected.name}</span>
                          {selected.isLimited && (
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: '#f6e94b', color: '#3a3304' }}>
                              {t_g('limitedShort')}
                            </span>
                          )}
                          {selected.isFes && (
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: '#77e0ff', color: '#06262f' }}>
                              {t_g('fest')}
                            </span>
                          )}
                          {selected.rarity === 3 && <span className="text-[9px] font-bold text-amber-500">★3</span>}
                          {selected.rarity === 2 && <span className="text-[9px] text-neutral-400">★2</span>}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2">
                        <div className="text-[9px] uppercase tracking-wider text-neutral-400 mb-0.5" style={monoStyle}>
                          {t('rate_obtain_label')}
                        </div>
                        <div className="text-lg font-black tabular-nums" style={{ ...monoStyle, color: rateColor(selected.obtainRate) }}>
                          {selected.obtainRate.toFixed(1)}%
                        </div>
                      </div>
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2">
                        <div className="text-[9px] uppercase tracking-wider text-neutral-400 mb-0.5" style={monoStyle}>
                          {t('student_stats.avg_eleph')}
                        </div>
                        <div className="text-lg font-black tabular-nums" style={{ ...monoStyle, color: '#77e0ff' }}>
                          +{Math.round(selected.avgEleph)}
                        </div>
                      </div>
                    </div>

                    {selected.elephDistribution.length > 0 && (
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-neutral-400 mb-1.5" style={monoStyle}>
                          {t('eleph_distribution_label')}
                        </div>
                        <div className="h-20">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={selected.elephDistribution} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#888" opacity={0.1} />
                              <XAxis dataKey="amount" tick={{ fontSize: 9, fill: '#a3a3a3' }} axisLine={false} />
                              <YAxis hide />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#171717', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '10px' }}
                                formatter={(value) => [typeof value === 'number' ? `${value.toFixed(1)}%` : value, t('probability_unit')]}
                              />
                              <Bar dataKey="probability" fill="#77e0ff" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
