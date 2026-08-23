import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps, BarShapeProps } from 'recharts';
import { CustomNumberInput } from '~/components/CustomInput';
import { getBracketFromTotalScore, getDifficultyFromScore, SCORE_BRACKETS } from '~/components/raid/Difficulty';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import type { PlayerAnalysisData } from './DifficultyCombinationChart';

interface HistogramAnalysisProps {
  allPlayers: PlayerAnalysisData[];
  tierCounter: { [key: string]: number };
}

export default function HistogramAnalysis({ allPlayers, tierCounter }: HistogramAnalysisProps) {
  const { t } = useTranslation('dashboard');
  const { t: t_ui } = useTranslation('ui');
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);

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
      initialVisibility[bracket.name] = ['TTT', 'TTI', 'TII'].includes(bracket.name);
    });
    initialVisibility['Other'] = false;
    setBracketVisibility(initialVisibility);
  }, [tierCounter]);

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
      const difficulty = getDifficultyFromScore(avgScore);

      return {
        binStart,
        binEnd,
        count: data.count,
        color: DIFFICULTY_COLORS[difficulty] || '#8884d8',
        bracket: getBracketFromTotalScore(avgScore),
        // Change: Output the actual calculated highest rank to lowest rank of users
        cumulativeRankRange: data.count > 0 ? `${data.minRank.toLocaleString()} — ${data.maxRank.toLocaleString()}` : '-',
      };
    });
  }, [rangeFilteredPlayers, calculatedScoreMin, currentBinSize]);

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
      const data = payload[0].payload as { binStart: number; binEnd: number; count: number; cumulativeRankRange: string; bracket: string; color: string };
      const scoreRange = `${data.binStart.toLocaleString()} ~ ${data.binEnd.toLocaleString()}`;
      return (
        <div className="bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm p-3 border dark:border-neutral-700 rounded-lg text-sm z-50">
          <p className="font-bold mb-1">{t('tooltipScore', { name: scoreRange })}</p>
          <p className="text-neutral-600 dark:text-neutral-300">{t('tooltipPlayers', { count: data.count.toLocaleString() })}</p>
          <p className="text-xs text-neutral-500 mt-1">
            {/* {t('tooltipRank', { rank: String(data.cumulativeRankRange) })} */}
            {t('byRank', 'rank')}: {data.cumulativeRankRange}
          </p>
          {data.bracket && (
            <p className="font-semibold mt-1" style={{ color: data.color }}>
              {/* {t('tooltipAvgBracket', { bracket: data.bracket })} */}
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
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold text-lg">{t('scoreDistribution')}</h3>
        <button
          onClick={() => setIsSettingsVisible(!isSettingsVisible)}
          className="text-sm px-3 py-1 rounded-md bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
        >
          {isSettingsVisible ? t('hideSettings') : t('showSettings')}
        </button>
      </div>

      <div className="-mx-4 sm:mx-0">
        <ResponsiveContainer width="100%" height={500}>
          <BarChart data={histogramData} barCategoryGap={0} margin={{ top: 10, right: 10, left: 4, bottom: 20 }}>
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
            <YAxis allowDecimals={false} width={36} tickFormatter={(v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v))} style={{ fontSize: '11px' }} />
            <Tooltip content={<HistogramTooltip />} cursor={{ fill: 'rgba(150, 150, 150, 0.1)' }} allowEscapeViewBox={{ x: true, y: true }} wrapperStyle={{ zIndex: 50 }} />
            <Bar
              dataKey="count"
              name={t('playerCount')}
              radius={[2, 2, 0, 0]}
              shape={(props: BarShapeProps) => {
                const entry = props.payload as { color?: string };
                const fill = entry?.color || '#8884d8';
                const x1 = Math.floor(props.x ?? 0);
                const x2 = Math.ceil((props.x ?? 0) + (props.width ?? 0));
                return <rect x={x1} y={Math.floor(props.y ?? 0)} width={x2 - x1} height={Math.ceil(props.height ?? 0)} fill={fill} />;
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
