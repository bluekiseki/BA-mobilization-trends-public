// app/components/gacha/SimulationResultViewV3.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { FaSearch, FaTimes, FaChevronDown } from 'react-icons/fa';
import { meanFromDist, ticketCreditedDist, type GlobalAggregatedResult } from '~/utils/gachaEngine';
import type { BannerStrategy } from '~/types/gacha';
import type { BannerPeriod } from '~/utils/gachaData';
import { useSearchMatcher } from '~/hooks/useSearchMatcher';
import type { Locale } from '~/utils/i18n/config';

import 'rc-tooltip/assets/bootstrap.css';

interface CustomBarProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  radius: number | number[];
}

interface Props {
  section: 'analysis' | 'students';
  /** Simple-mode display: hides the "all required students obtained" risk card — simple mode has no "required vs
      conditional" distinction, so the underlying metric wouldn't mean anything to a newcomer. */
  simple?: boolean;
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

export default function SimulationResultViewV3({
  section,

  result,
  initialPyroxenes,
  portraitMap,

  bankruptcyRate,
  strategies,
  banners,
  allStudents,
  ownedStudentCount,
}: Props) {
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'gacha.result_view' });

  const { t: t_ui } = useTranslation('ui');
  const { t: t_g } = useTranslation('game');
  const { t: tp } = useTranslation('planner');
  const matcher = useSearchMatcher(i18n.language as Locale);
  type StudentFilterKey = 'pickup' | 'fes' | 'star3' | 'star2' | 'star1';
  const [tab, setTab] = useState<ChartTab>('net');
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  const isPyroxeneTab = tab === 'net' || tab === 'gross';

  const selectableBanners = banners.filter((b) => strategies[b.id]?.isActive && result.cost.count(b.id) > 0).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const bannerLabel = (b: BannerPeriod) => `${b.startTime.slice(5, 10)} ${b.pickupStudents.map((s) => s.name).join('/')}`;
  const effectiveBannerId = selectedBannerId && selectableBanners.some((b) => b.id === selectedBannerId) ? selectedBannerId : 'inf';
  const effectiveDistMode = effectiveBannerId === 'inf' ? 'cumulative' : distMode;
  const advancedCustomized = tab === 'gross' || tab === 'eligma' || effectiveBannerId !== 'inf' || effectiveDistMode !== 'cumulative';

  const activeDist = (() => {
    if (tab === 'gross') {
      return effectiveDistMode === 'incremental'
        ? ticketCreditedDist(result.costWithGachaTicketsIncremental, result.costIncremental, effectiveBannerId)
        : ticketCreditedDist(result.costWithGachaTickets, result.cost, effectiveBannerId);
    }
    if (effectiveDistMode === 'incremental') {
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
    const fill = isOverBudget ? '#ef4444' : 'var(--v3-ticket)';
    const fillOpacity = isOverBudget ? 0.7 : 0.6;
    const rArray = Array.isArray(props.radius) ? props.radius : [props.radius];
    return <rect x={props.x} y={props.y} width={props.width} height={props.height} fill={fill} fillOpacity={fillOpacity} rx={rArray[0] || 0} ry={rArray[0] || 0} />;
  };

  // Collect pickup student IDs (across all active strategies, mode !== skip)
  // and count "must" targets — the success-rate metric is always 100% (meaningless) when there are none.
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

  return (
    <div className="space-y-3">
      {section === 'analysis' && (
        <>
          <div className="min-w-0">
            <div className="pb-2">
              <div className="mb-1">
                <div className="space-y-2 @container">
                  {/* @min-[820px] = container query (not viewport) for sidebar + card layouts */}
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`v3-segment grid flex-1 gap-x-2 ${showAdvanced ? 'grid-cols-2 @min-[480px]:grid-cols-4' : 'grid-cols-2'}`}
                      role="group"
                      aria-label={tp('gacha.v3.result.display_aria')}
                    >
                      {(
                        [
                          ['net', tp('gacha.v3.result.tab_net')],
                          ['gross', tp('gacha.v3.result.tab_gross')],
                          ['pulls', tp('gacha.v3.result.tab_pulls')],
                          ['eligma', t('unit_toggle.eligma')],
                        ] as const
                      )
                        .filter(([value]) => showAdvanced || value === 'net' || value === 'pulls')
                        .map(([value, label]) => (
                          <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>
                            {label}
                          </button>
                        ))}
                    </div>
                    <button type="button" className="v3-percentile-toggle" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((visible) => !visible)}>
                      {tp('gacha.v3.result.advanced')}
                      {!showAdvanced && advancedCustomized ? ' *' : ''}
                      <FaChevronDown className={`v3-disclosure-chevron ${showAdvanced ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                  </div>
                  {showAdvanced && (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                      <label className="v3-field">
                        {tp('gacha.v3.result.target')}
                        <select
                          aria-label={tp('gacha.v3.result.target')}
                          value={effectiveBannerId ?? 'inf'}
                          onChange={(event) => {
                            setSelectedBannerId(event.target.value);
                            if (event.target.value === 'inf') setDistMode('cumulative');
                          }}
                        >
                          <option value="inf">{t('banner_select_all_period')}</option>
                          {selectableBanners.map((banner) => (
                            <option key={banner.id} value={banner.id}>
                              {bannerLabel(banner)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="v3-field">
                        <span>{tp('gacha.v3.result.scope')}</span>
                        <div className="v3-segment flex">
                          <button aria-pressed={effectiveDistMode === 'cumulative'} onClick={() => setDistMode('cumulative')}>
                            {t('dist_mode.cumulative')}
                          </button>
                          <button aria-pressed={effectiveDistMode === 'incremental'} disabled={effectiveBannerId === 'inf'} onClick={() => setDistMode('incremental')}>
                            {t('dist_mode.incremental')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-xs text-neutral-600 dark:text-neutral-400" style={monoStyle}>
                  {effectiveBannerId === 'inf' ? tp('gacha.v3.result.scope_all') : effectiveDistMode === 'cumulative' ? tp('gacha.v3.result.scope_cumulative') : tp('gacha.v3.result.scope_single')}
                  {tab === 'gross' && ` · ${tp('gacha.v3.result.gross_note')}`}
                </div>
                {tab === 'eligma' && <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">{t('eligma_owned_caption', { count: ownedStudentCount })}</div>}
              </div>

              {isPyroxeneTab && (
                <div className="flex items-center gap-3 mb-1 text-xs text-neutral-600 dark:text-neutral-400">
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

              <div className="h-44 w-full">
                {trimmedChartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-neutral-600 dark:text-neutral-400">{t('chart.no_data')}</div>
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
                      <Line yAxisId="cdf" type="monotone" dataKey="cdf" stroke="var(--v3-ticket)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      {p50bin && (
                        <ReferenceLine
                          x={p50bin.binStart}
                          stroke="var(--v3-ticket)"
                          strokeWidth={1}
                          strokeDasharray="4 3"
                          label={{ value: 'P50', fontSize: 9, fill: 'var(--v3-ticket)', position: 'insideTopLeft', dy: -14 }}
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
            <div className="@container border-t border-neutral-200 pt-2 dark:border-neutral-800">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 @min-[440px]:grid-cols-4 @min-[440px]:gap-x-3">
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
                ).map(({ label, val }) => (
                  <div key={label} className="min-w-0">
                    <div className="text-xs leading-tight text-neutral-600 dark:text-neutral-400 whitespace-nowrap" style={monoStyle}>
                      {label}
                    </div>
                    <div className="mt-0.5 font-bold tabular-nums leading-none whitespace-nowrap" style={{ ...monoStyle, fontSize: 20 }}>
                      {val != null ? fmt(val) : '—'}
                    </div>
                    {val != null && isPyroxeneTab && (
                      <div className="mt-0.5 text-xs leading-tight text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                        {Math.round(val / 120).toLocaleString()}
                        {t('pulls_short')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      {section === 'students' &&
        (() => {
          const query = searchQuery.trim();
          const filtered = allStats
            .filter((stat) => {
              if (query) return matcher(stat.name, query);
              return (
                activeFilters.size === 0 ||
                (activeFilters.has('pickup') && stat.isPickup) ||
                (activeFilters.has('fes') && stat.isFes) ||
                (activeFilters.has('star3') && stat.rarity === 3) ||
                (activeFilters.has('star2') && stat.rarity === 2) ||
                (activeFilters.has('star1') && stat.rarity === 1)
              );
            })
            .sort((a, b) => b.obtainRate - a.obtainRate);
          const filters: { key: StudentFilterKey; label: string }[] = [
            { key: 'pickup', label: t('filter.pickup') },
            { key: 'fes', label: t_g('fest') },
            { key: 'star3', label: t('filter.star3') },
            { key: 'star2', label: t('filter.star2') },
            { key: 'star1', label: t('filter.star1') },
          ];
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-neutral-300 dark:border-neutral-600">
                <FaSearch aria-hidden="true" />
                <input
                  aria-label={t('search_placeholder')}
                  placeholder={t('search_placeholder')}
                  className="min-w-0 flex-1 bg-transparent"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button aria-label={tp('gacha.v3.result.clear_search')} onClick={() => setSearchQuery('')}>
                    <FaTimes />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {filters.map((filter) => (
                  <button
                    key={filter.key}
                    aria-pressed={activeFilters.has(filter.key)}
                    className={activeFilters.has(filter.key) ? 'v3-selected' : 'v3-button'}
                    onClick={() => toggleFilter(filter.key)}
                  >
                    {filter.label}
                  </button>
                ))}
                <button className="v3-button" onClick={() => setActiveFilters(new Set())}>
                  {tp('equipment.resetFilter')}
                </button>
              </div>
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {filtered.map((stat) => (
                  <div key={stat.studentId} className="py-3">
                    <button
                      className="grid w-full grid-cols-[40px_minmax(0,1fr)_44px] items-center gap-3 text-left sm:grid-cols-[40px_minmax(0,1fr)_100px_120px_44px]"
                      aria-expanded={selectedId === stat.studentId}
                      onClick={() => setSelectedId(selectedId === stat.studentId ? null : stat.studentId)}
                    >
                      {portraitMap[stat.studentId] ? (
                        <img className="h-10 w-10 rounded-full object-cover" src={`data:image/webp;base64,${portraitMap[stat.studentId]}`} alt="" />
                      ) : (
                        <span className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-800" />
                      )}
                      <span className="min-w-0">
                        <span className="block font-semibold">{stat.name}</span>
                        <span className="mt-1 block text-xs text-neutral-600 dark:text-neutral-400 sm:hidden">
                          {t('student_stats.rate_obtain')} {stat.obtainRate.toFixed(1)}% · {t_g('eleph')} +{Math.round(stat.avgEleph)}
                        </span>
                      </span>
                      <span className="hidden text-right sm:block">{stat.obtainRate.toFixed(1)}%</span>
                      <span className="hidden text-right sm:block">
                        {t_g('eleph')} +{Math.round(stat.avgEleph)}
                      </span>
                      <FaChevronDown className={selectedId === stat.studentId ? 'rotate-180 justify-self-end' : 'justify-self-end'} />
                    </button>
                    {selectedId === stat.studentId && (
                      <div className="mt-4">
                        <p className="mb-2 text-xs">{t('eleph_distribution_label')}</p>
                        <div className="h-40">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stat.elephDistribution}>
                              <CartesianGrid vertical={false} stroke="#737373" opacity={0.2} />
                              <XAxis dataKey="amount" tick={{ fontSize: 12 }} />
                              <YAxis tickFormatter={(value) => `${value}%`} tick={{ fontSize: 12 }} width={45} />
                              <Tooltip
                                contentStyle={{ background: '#171717', color: '#fafafa', border: '1px solid #525252' }}
                                formatter={(value) => [typeof value === 'number' ? `${value.toFixed(1)}%` : String(value), t('probability_unit')]}
                              />
                              <Bar dataKey="probability" fill="#5bc4e0" isAnimationActive={false} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {filtered.length === 0 && <p className="py-6 text-neutral-500">{tp('gacha.v3.result.no_students')}</p>}
            </div>
          );
        })()}
    </div>
  );
}
