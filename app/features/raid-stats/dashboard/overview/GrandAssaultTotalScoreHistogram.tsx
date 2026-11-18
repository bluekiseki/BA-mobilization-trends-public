import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps, BarShapeProps } from 'recharts';
import { CustomNumberInput } from '~/components/common/CustomInput';
import { getBracketColorFromTotalScore, getBracketFromTotalScore, SCORE_BRACKETS } from '~/components/raid/Difficulty';
import type { PlayerAnalysisData } from './types';
import LegendChips from '../LegendChips';
import { plotValues, yAxisConfig } from '../yScale';
import type { YScale } from '../yScale';
import ChartOptions from '../ChartOptions';
import type { AnalysisHistogramQuery, AnalysisHistogramResult, CombinationStats, TierName } from '~/features/raid-stats/dashboard/types/eraidAnalysis';

interface HistogramAnalysisProps {
  actualSelection: CombinationStats | null;
  actualColor?: string;
  actualTier: TierName | null;
  actualBracket: string | null;
  actualHistogram: AnalysisHistogramResult | null;
  onHistogramQuery: (query: AnalysisHistogramQuery | null) => void;
  onClearSelection: () => void;
  allPlayers: PlayerAnalysisData[];
  tierCounter: { [key: string]: number };
}

// Brackets shown/toggled by default - reused both for the initial bracket-visibility settings and
// for which brackets the legend offers, so the legend doesn't list every combo that ever has data
// (there can be 15+ of them) and stays in sync with the Bracket Filter panel below it.
const DEFAULT_VISIBLE_BRACKETS = ['TTT', 'TTI', 'TII'];

export default function HistogramAnalysis({
  allPlayers,
  tierCounter,
  actualSelection,
  actualColor,
  actualTier,
  actualBracket,
  actualHistogram,
  onHistogramQuery,
  onClearSelection,
}: HistogramAnalysisProps) {
  const { t } = useTranslation('dashboard');
  const { t: t_ui } = useTranslation('ui');
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [yScale, setYScale] = useState<YScale>('linear');

  const [histFilter, setHistFilter] = useState({
    rankMin: 1,
    rankMax: 20000,
    scoreMin: 0,
    scoreMax: 999_999_999,
    useScoreFilter: false, // Flag for toggling between rank and score filters
    binSize: 0, // If 0, auto-calculation mode
  });
  const [bracketVisibility, setBracketVisibility] = useState<Record<string, boolean>>({});

  // 1. Set initial rank range and initialize bracket visibility
  useEffect(() => {
    const initialMaxRank = tierCounter?.[4] || 20000;
    setHistFilter((prev) => ({
      ...prev,
      rankMin: 1,
      rankMax: initialMaxRank,
    }));

    const initialVisibility: Record<string, boolean> = {};
    SCORE_BRACKETS.forEach((bracket) => {
      initialVisibility[bracket.name] = DEFAULT_VISIBLE_BRACKETS.includes(bracket.name);
    });
    initialVisibility['Other'] = false;
    setBracketVisibility(initialVisibility);
  }, [tierCounter]);

  // By default a selected combination is shown against the whole distribution; zoom narrows the view to its own score range.
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => setZoomed(false), [actualSelection?.combination]);
  // Score span of the tier chosen in the donut, so an unzoomed selection stays within that tier instead of the whole distribution.
  const tierScoreBounds = useMemo(() => {
    if (!actualTier) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const player of allPlayers) {
      if (player.tier !== actualTier) continue;
      if (player.totalScore < min) min = player.totalScore;
      if (player.totalScore > max) max = player.totalScore;
    }
    return min <= max ? { min, max } : null;
  }, [allPlayers, actualTier]);
  const savedSettings = useRef<{ filter: typeof histFilter; visibility: Record<string, boolean> } | null>(null);
  useEffect(() => {
    if (actualSelection) {
      if (!savedSettings.current) savedSettings.current = { filter: histFilter, visibility: bracketVisibility };
      const padding = Math.max(100_000, (actualSelection.max - actualSelection.min) * 0.1);
      const scoreMin = zoomed ? Math.max(0, Math.floor(actualSelection.min - padding)) : (tierScoreBounds?.min ?? 0);
      const scoreMax = zoomed ? Math.ceil(actualSelection.max + padding) : (tierScoreBounds?.max ?? 999_999_999);
      setHistFilter((previous) => ({ ...previous, useScoreFilter: true, scoreMin, scoreMax, binSize: 0 }));
      setBracketVisibility(Object.fromEntries([...SCORE_BRACKETS.map((bracket) => bracket.name), 'Other'].map((name) => [name, true])));
    } else if (savedSettings.current) {
      setHistFilter(savedSettings.current.filter);
      setBracketVisibility(savedSettings.current.visibility);
      savedSettings.current = null;
    }
  }, [actualSelection?.combination, actualSelection?.min, actualSelection?.max, zoomed, tierScoreBounds]);

  // 2. Apply bracket (composition) filters and inject rank information
  const processedPlayers = useMemo(() => {
    const sorted = [...allPlayers].sort((a, b) => b.totalScore - a.totalScore);
    const withRank = sorted.map((p, index) => ({ ...p, rank: index + 1 }));

    return withRank.filter((p) => {
      const bracketName = getBracketFromTotalScore(p.totalScore);
      return bracketVisibility[bracketName] ?? true;
    });
  }, [allPlayers, bracketVisibility]);

  // 3. Range filtering based on rank or score
  const { rangeFilteredPlayers, calculatedScoreMin, calculatedScoreMax } = useMemo(() => {
    let filtered = processedPlayers;

    if (histFilter.useScoreFilter) {
      filtered = processedPlayers.filter((p) => p.totalScore >= histFilter.scoreMin && p.totalScore <= histFilter.scoreMax);
    } else {
      filtered = processedPlayers.filter((p) => p.rank >= histFilter.rankMin && p.rank <= histFilter.rankMax);
    }

    let sMin = 0;
    let sMax = 0;
    if (filtered.length > 0) {
      sMin = filtered[filtered.length - 1].totalScore; // Ascending (lower rank)
      sMax = filtered[0].totalScore; // Descending (higher rank)
    }

    return { rangeFilteredPlayers: filtered, calculatedScoreMin: sMin, calculatedScoreMax: sMax };
  }, [processedPlayers, histFilter]);

  // 4. Dynamic Bin size calculation
  const currentBinSize = useMemo(() => {
    // Use user-specified size as priority if available
    if (histFilter.binSize > 0) return histFilter.binSize;
    if (rangeFilteredPlayers.length === 0) return 20000;

    const scoreRange = calculatedScoreMax - calculatedScoreMin;
    const pixelsPerBin = window.innerWidth < 640 ? 3 : 10;
    const targetBinCount = Math.max(10, (window.innerWidth - 50) / pixelsPerBin);
    let rawBinSize = scoreRange / targetBinCount;

    if (rawBinSize > 100_000) rawBinSize = Math.ceil(rawBinSize / 100_000) * 100_000;
    else if (rawBinSize > 50_000) rawBinSize = 50_000;
    else if (rawBinSize > 10_000) rawBinSize = Math.ceil(rawBinSize / 10_000) * 10_000;
    else if (rawBinSize > 5_000) rawBinSize = 5_000;
    else if (rawBinSize > 2_000) rawBinSize = 2_000;
    else if (rawBinSize > 1_000) rawBinSize = 1_000;
    else rawBinSize = 500;

    return Math.max(rawBinSize, 1);
  }, [histFilter.binSize, calculatedScoreMin, calculatedScoreMax, rangeFilteredPlayers.length]);

  // 5. Aggregate histogram data (Binning)
  // 5. Aggregate histogram data (Binning)
  const histogramData = useMemo(() => {
    if (rangeFilteredPlayers.length === 0) return [];

    // Change: Added fields to track minRank and maxRank when constructing bins
    const bins = new Map<number, { totalScore: number; count: number; minRank: number; maxRank: number }>();
    const baseScore = Math.floor(calculatedScoreMin / currentBinSize) * currentBinSize;

    for (const player of rangeFilteredPlayers) {
      const binIndex = Math.floor((player.totalScore - baseScore) / currentBinSize);
      const binStart = baseScore + binIndex * currentBinSize;
      const current = bins.get(binStart) || { totalScore: 0, count: 0, minRank: Infinity, maxRank: -Infinity };

      current.totalScore += player.totalScore;
      current.count += 1;

      // Change: Record the highest rank (lowest number) and lowest rank (highest number) of users in this range
      if (player.rank < current.minRank) current.minRank = player.rank;
      if (player.rank > current.maxRank) current.maxRank = player.rank;

      bins.set(binStart, current);
    }

    // Score ascending (lowest score = highest rank number -> moving right leads to 1st place)
    const binEntries = Array.from(bins.entries()).sort((a, b) => b[0] - a[0]);

    return binEntries.map(([binStart, data]) => {
      const binEnd = binStart + currentBinSize;
      const avgScore = data.count > 0 ? data.totalScore / data.count : 0;
      // This is a Grand Assault TOTAL score - the sum of 3 separate team scores, each possibly a
      // different difficulty (e.g. a "III" or "IIT" bracket) - so it must be colored by score
      // bracket (SCORE_BRACKETS), never by a single difficulty tier derived from the raw sum.
      const bracket = getBracketFromTotalScore(avgScore);

      return {
        binStart,
        binEnd,
        count: data.count,
        bracket,
        color: getBracketColorFromTotalScore(avgScore),
        // Change: Output the actual calculated highest rank to lowest rank of users
        cumulativeRankRange: data.count > 0 ? `${data.minRank.toLocaleString()} — ${data.maxRank.toLocaleString()}` : '-',
      };
    });
  }, [rangeFilteredPlayers, calculatedScoreMin, currentBinSize]);

  useEffect(() => {
    onHistogramQuery(
      actualSelection
        ? {
            combination: actualSelection.combination,
            tier: actualTier,
            bracket: actualBracket,
            rankMin: histFilter.rankMin,
            rankMax: histFilter.rankMax,
            scoreMin: histFilter.scoreMin,
            scoreMax: histFilter.scoreMax,
            useScoreFilter: histFilter.useScoreFilter,
            binSize: currentBinSize,
            baseScore: Math.floor(calculatedScoreMin / currentBinSize) * currentBinSize,
            visibleBrackets: Object.entries(bracketVisibility)
              .filter(([, visible]) => visible)
              .map(([name]) => name),
          }
        : null,
    );
  }, [actualSelection?.combination, actualTier, actualBracket, histFilter, currentBinSize, calculatedScoreMin, bracketVisibility, onHistogramQuery]);
  const displayedHistogram = useMemo(() => {
    const actualBins = new Map(actualHistogram?.combination === actualSelection?.combination ? actualHistogram?.bins.map((bin) => [bin.binStart, bin]) : []);
    const actualCounts = histogramData.map((bin) => actualBins.get(bin.binStart)?.count ?? 0);
    const plots = plotValues(
      histogramData.map((bin) => bin.count),
      yScale,
    );
    const actualPlots = plotValues(actualCounts, yScale);
    return histogramData.map((bin, i) => {
      const actual = actualBins.get(bin.binStart);
      return {
        ...bin,
        plot: plots[i],
        actualPlot: actualPlots[i],
        actualCount: actualCounts[i],
        actualScoreRange: actual ? `${actual.scoreMin.toLocaleString()} ~ ${actual.scoreMax.toLocaleString()}` : '-',
        actualRankRange: actual ? `${actual.rankMin.toLocaleString()} — ${actual.rankMax.toLocaleString()}` : '-',
      };
    });
  }, [histogramData, actualHistogram, actualSelection?.combination, yScale]);

  const yAxis = useMemo(
    () =>
      yAxisConfig(
        histogramData.map((bin) => bin.count),
        yScale,
      ),
    [histogramData, yScale],
  );

  // Bins overlapping the selected combination's score range, for the highlight band (bins are in descending score order).
  const highlightRange = useMemo(() => {
    if (!actualSelection) return null;
    const overlapping = displayedHistogram.filter((bin) => bin.binEnd > actualSelection.min && bin.binStart <= actualSelection.max);
    if (overlapping.length === 0) return null;
    return { x1: overlapping[0].binStart, x2: overlapping[overlapping.length - 1].binStart };
  }, [displayedHistogram, actualSelection]);

  // Only the brackets shown by default (and that actually have data) get a legend chip - computed
  // from all players (independent of the current bracket filter) so a toggled-off chip stays
  // visible/clickable instead of disappearing.
  const presentBrackets = useMemo(() => {
    const present = new Set(allPlayers.map((p) => getBracketFromTotalScore(p.totalScore)));
    return SCORE_BRACKETS.filter((b) => DEFAULT_VISIBLE_BRACKETS.includes(b.name) && present.has(b.name));
  }, [allPlayers]);

  // Players per bracket within the current rank/score range.
  const bracketCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const player of rangeFilteredPlayers) {
      const name = getBracketFromTotalScore(player.totalScore);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [rangeFilteredPlayers]);

  // --- UI Handlers ---
  const handleSelectAllBrackets = () => {
    setBracketVisibility(Object.keys(bracketVisibility).reduce((acc, key) => ({ ...acc, [key]: true }), {}));
  };

  const handleDeselectAllBrackets = () => {
    setBracketVisibility(Object.keys(bracketVisibility).reduce((acc, key) => ({ ...acc, [key]: false }), {}));
  };

  const HistogramTooltip = ({ active, payload }: Partial<TooltipContentProps<number, string>>) => {
    if (active && payload && payload.length) {
      const { t } = useTranslation('dashboard');
      const data = payload[0].payload as {
        binStart: number;
        binEnd: number;
        count: number;
        cumulativeRankRange: string;
        bracket: string;
        color: string;
        actualCount: number;
        actualScoreRange: string;
        actualRankRange: string;
      };
      const scoreRange = `${data.binStart.toLocaleString()} ~ ${data.binEnd.toLocaleString()}`;
      return (
        <div className="bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm p-3 border dark:border-neutral-700 rounded-lg text-sm z-50">
          <p className="font-bold mb-1">{t('tooltipScore', { name: scoreRange })}</p>
          <p className="text-neutral-600 dark:text-neutral-300">
            {actualSelection ? `${t('actualStats.all')} · ` : ''}
            {t('tooltipPlayers', { count: data.count.toLocaleString() })}
          </p>
          <p className="text-xs text-neutral-500">
            {t('byRank', 'rank')}: {data.cumulativeRankRange}
          </p>
          {actualSelection && (
            <div className="mt-1 border-t dark:border-neutral-700 pt-1">
              <p className="font-semibold" style={{ color: actualColor }}>
                {actualSelection.combination} · {t('tooltipPlayers', { count: data.actualCount.toLocaleString() })}
              </p>
              {data.actualCount > 0 && (
                <>
                  <p className="text-xs text-neutral-500">{t('tooltipScore', { name: data.actualScoreRange })}</p>
                  <p className="text-xs text-neutral-500">
                    {t('byRank', 'rank')}: {data.actualRankRange}
                  </p>
                </>
              )}
            </div>
          )}
          {data.bracket && (
            <p className="font-semibold mt-1" style={{ color: data.color }}>
              {/* {t('tooltipAvgBracket', { bracket: data.bracket })} */}
              {actualSelection ? `${t('actualStats.bracket')}: ` : ''}
              {data.bracket}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-between items-center mb-2">
        <h3 className="font-bold text-lg">{t('scoreDistribution')}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <ChartOptions yScale={yScale} onYScaleChange={setYScale} />
          <button
            onClick={() => setIsSettingsVisible(!isSettingsVisible)}
            className="text-sm px-3 py-1 rounded-md bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
          >
            {isSettingsVisible ? t('hideSettings') : t('showSettings')}
          </button>
        </div>
      </div>

      <LegendChips
        items={[
          ...(actualSelection
            ? [
                { key: 'all', label: t('actualStats.all'), color: '#d4d4d4' },
                {
                  key: 'actual',
                  label: `${actualSelection.combination} · ${t('tooltipPlayers', { count: actualSelection.count.toLocaleString() })} ×`,
                  color: actualColor ?? '#2563eb',
                  onClick: onClearSelection,
                },
                { key: 'zoom', label: t('actualStats.zoom'), color: '#a3a3a3', active: zoomed, onClick: () => setZoomed((value) => !value) },
              ]
            : []),
          ...presentBrackets.map((b) => ({
            key: b.name,
            label: b.name,
            color: b.fill,
            count: bracketCounts.get(b.name) ?? 0,
            active: bracketVisibility[b.name] ?? true,
            onClick: () => setBracketVisibility((p) => ({ ...p, [b.name]: !(p[b.name] ?? true) })),
          })),
        ]}
      />

      <div className="-mx-4 sm:mx-0">
        <ResponsiveContainer width="100%" height={500}>
          <BarChart data={displayedHistogram} barCategoryGap="8%" margin={{ top: 10, right: 10, left: 4, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="binStart"
              angle={-45}
              textAnchor="end"
              height={60}
              tickMargin={5}
              interval={Math.max(0, Math.ceil(histogramData.length / 10) - 1)}
              tickFormatter={(value: number) => `${(value / 1_000_000).toFixed(2)}M`}
              style={{ fontSize: '11px' }}
            />
            <YAxis allowDecimals={false} width={36} domain={yAxis.domain} ticks={yAxis.ticks} tickFormatter={yAxis.tickFormatter} style={{ fontSize: '11px' }} />
            {highlightRange && (
              <ReferenceArea x1={highlightRange.x1} x2={highlightRange.x2} fill="#a3a3a3" fillOpacity={0.2} stroke="#a3a3a3" strokeOpacity={0.7} strokeDasharray="4 3" ifOverflow="visible" />
            )}
            <Tooltip content={<HistogramTooltip />} cursor={{ fill: 'rgba(150, 150, 150, 0.1)' }} allowEscapeViewBox={{ x: false, y: true }} wrapperStyle={{ zIndex: 50 }} />
            <Bar
              dataKey="plot"
              name={t('playerCount')}
              shape={(props: BarShapeProps) => {
                const entry = props.payload as { color?: string; plot: number; actualPlot: number; actualCount: number };
                const height = props.height || 0;
                const selectedHeight = entry.actualCount > 0 ? Math.min(height, Math.max(2, (height * entry.actualPlot) / entry.plot)) : 0;
                return (
                  <g>
                    <rect x={props.x} y={props.y} width={props.width} height={props.height} fill={entry?.color || '#8884d8'} opacity={actualSelection ? 0.25 : 1} />
                    {selectedHeight > 0 && <rect data-actual-overlay x={props.x} y={props.y + height - selectedHeight} width={props.width} height={selectedHeight} fill={actualColor ?? '#2563eb'} />}
                  </g>
                );
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {isSettingsVisible && (
        <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 border dark:border-neutral-700 rounded-lg space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Filter settings area */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold">{histFilter.useScoreFilter ? t('scoreRangeFilter') : t('rankRangeSettings')}</label>
                <button onClick={() => setHistFilter((p) => ({ ...p, useScoreFilter: !p.useScoreFilter }))} className="text-[10px] text-blue-500 hover:underline">
                  {histFilter.useScoreFilter ? t('switchToRank') : t('switchToScore')}
                </button>
              </div>

              {histFilter.useScoreFilter ? (
                <div className="flex items-center gap-2">
                  <CustomNumberInput
                    // type="number"
                    value={histFilter.scoreMin}
                    onChange={(e) => setHistFilter((p) => ({ ...p, scoreMin: e || 0 }))}
                    className="w-full p-1.5 text-center bg-white dark:bg-neutral-900 border dark:border-neutral-600 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-neutral-500">~</span>
                  <CustomNumberInput
                    // type="number"
                    value={histFilter.scoreMax}
                    onChange={(e) => setHistFilter((p) => ({ ...p, scoreMax: e || 0 }))}
                    className="w-full p-1.5 text-center bg-white dark:bg-neutral-900 border dark:border-neutral-600 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CustomNumberInput
                    // type="number"
                    value={histFilter.rankMin}
                    onChange={(e) => setHistFilter((p) => ({ ...p, rankMin: e || 1 }))}
                    className="w-full p-1.5 text-center bg-white dark:bg-neutral-900 border dark:border-neutral-600 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
                    min={1}
                  />
                  <span className="text-neutral-500">~</span>
                  <CustomNumberInput
                    // type="number"
                    value={histFilter.rankMax}
                    onChange={(e) => setHistFilter((p) => ({ ...p, rankMax: e || 1 }))}
                    className="w-full p-1.5 text-center bg-white dark:bg-neutral-900 border dark:border-neutral-600 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
                    min={1}
                  />
                </div>
              )}
            </div>

            {/* Bin size settings */}
            <div>
              <label className="text-sm font-bold block mb-1">{t('binSize')} </label>
              <div className="flex items-center gap-2 mt-2">
                <CustomNumberInput
                  value={histFilter.binSize === 0 ? currentBinSize : histFilter.binSize}
                  onChange={(e) => setHistFilter((p) => ({ ...p, binSize: Number(e) || 0 }))}
                  step={10000}
                  className="w-full p-1.5 text-center bg-white dark:bg-neutral-900 border dark:border-neutral-600 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={() => setHistFilter((p) => ({ ...p, binSize: 0 }))}
                  className="shrink-0 text-[10px] px-2 py-1.5 bg-neutral-200 dark:bg-neutral-700 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600"
                >
                  {t('auto', 'auto')}
                </button>
              </div>
            </div>
          </div>

          <hr className="border-neutral-200 dark:border-neutral-700" />

          {/* Bracket settings */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-bold">{t('bracketFilter')}</label>
              <div className="flex gap-2">
                <button onClick={handleSelectAllBrackets} className="text-[10px] px-2 py-1 rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 font-medium">
                  {t_ui('selectAll')}
                </button>
                <button onClick={handleDeselectAllBrackets} className="text-[10px] px-2 py-1 rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 font-medium">
                  {t_ui('deselectAll')}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {Object.entries(bracketVisibility).map(([bracketName, isVisible]) => (
                <label key={bracketName} className="flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={(e) =>
                      setBracketVisibility((p) => ({
                        ...p,
                        [bracketName]: e.target.checked,
                      }))
                    }
                    className="mr-2 h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700"
                  />
                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 group-hover:text-black dark:group-hover:text-white transition-colors">{bracketName}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
