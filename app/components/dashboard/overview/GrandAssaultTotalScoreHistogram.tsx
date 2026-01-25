import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CustomNumberInput } from '~/components/CustomInput';
import { getBracketFromTotalScore, getDifficultyFromScore, SCORE_BRACKETS } from '~/components/Difficulty';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import type { PlayerAnalysisData } from './DifficultyCombinationChart';

interface HistogramAnalysisProps {
  allPlayers: PlayerAnalysisData[];
}

/**
 * A self-contained component for rendering the histogram.
 * It will not mount or perform calculations until it is rendered by its parent.
 */
function HistogramAnalysis({ allPlayers }: HistogramAnalysisProps) {
  const { t } = useTranslation('dashboard');
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);

  const [histFilter, setHistFilter] = useState({
    scoreMin: 0,
    scoreMax: 900_000_000,
    binSize: 20_000,
  });
  const [bracketVisibility, setBracketVisibility] = useState<Record<string, boolean>>({});

  // This effect now runs ONLY when this component is mounted
  useEffect(() => {
    const initialVisibility: Record<string, boolean> = {};
    SCORE_BRACKETS.forEach((bracket) => {
      if (['TTT', 'TTI', 'TII'].includes(bracket.name)) initialVisibility[bracket.name] = true;
      else initialVisibility[bracket.name] = false;
    });
    initialVisibility['Other'] = false;
    setBracketVisibility(initialVisibility);
  }, []); // Empty dependency array is fine here

  // --- All histogram calculations are now local to this component ---

  // 1. Bracket filtering
  const bracketFilteredPlayers = useMemo(() => {
    return allPlayers.filter((p) => {
      const bracketName = getBracketFromTotalScore(p.totalScore);
      return bracketVisibility[bracketName] ?? true;
    });
  }, [allPlayers, bracketVisibility]);

  // 2. Binning based on filtered data
  const histogramData = useMemo(() => {
    const rangeFiltered = bracketFilteredPlayers.filter((p) => p.totalScore >= histFilter.scoreMin && p.totalScore <= histFilter.scoreMax);

    const bins = new Map<number, { totalScore: number; count: number }>();
    const binSize = histFilter.binSize > 0 ? histFilter.binSize : 1;
    for (const player of rangeFiltered) {
      const binIndex = Math.floor(player.totalScore / binSize);
      const binStart = binIndex * binSize;
      const current = bins.get(binStart) || { totalScore: 0, count: 0 };
      current.totalScore += player.totalScore;
      current.count += 1;
      bins.set(binStart, current);
    }

    const binEntries = Array.from(bins.entries());
    // const totalBinnedPlayers = binEntries.reduce((sum, [, data]) => sum + data.count, 0);
    binEntries.sort((a, b) => a[0] - b[0]);
    let cumulativeRank = 1; //totalBinnedPlayers;

    return Array.from(bins.entries()).map(([binStart, data]) => {
      const binEnd = binStart + binSize;
      const avgScore = data.count > 0 ? data.totalScore / data.count : 0;
      const difficulty = getDifficultyFromScore(avgScore);

      const rankEnd = cumulativeRank;
      cumulativeRank += data.count;
      const rankStart = cumulativeRank + 1;

      // return {
      //     name: `${(binStart / 1_000_000).toFixed(1)}M-${(binEnd / 1_000_000).toFixed(1)}M`,
      //     count: data.count,
      //     color: DIFFICULTY_COLORS[difficulty],
      //     bracket: getBracketFromTotalScore(avgScore),
      // };

      return {
        binStart,
        binEnd,
        count: data.count,
        color: DIFFICULTY_COLORS[difficulty],
        bracket: getBracketFromTotalScore(avgScore),
        cumulativeRankRange: `${rankEnd.toLocaleString()}-${rankStart.toLocaleString()}`,
      };
    }); //.sort((a, b) => parseFloat(a.name) - parseFloat(b.name));
  }, [bracketFilteredPlayers, histFilter]);

  const handleSelectAllBrackets = () => {
    const newVisibility = { ...bracketVisibility };
    Object.keys(newVisibility).forEach((key) => {
      newVisibility[key] = true;
    });
    setBracketVisibility(newVisibility);
  };

  const handleDeselectAllBrackets = () => {
    const newVisibility = { ...bracketVisibility };
    Object.keys(newVisibility).forEach((key) => {
      newVisibility[key] = false;
    });
    setBracketVisibility(newVisibility);
  };

  // Tooltip component is also moved here
  // const HistogramTooltip = ({ active, payload }: any) => {
  //     const { t } = useTranslation("dashboard");
  //     if (active && payload && payload.length) {
  //         const data = payload[0].payload;
  //         return (
  //             <div className="bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm p-3 border rounded-lg shadow-lg text-sm">
  //                 <p className="font-bold">{t('tooltipScore', { name: data.name })}</p>
  //                 <p>{t('tooltipPlayers', { count: data.count.toLocaleString() })}</p>
  //                 {data.bracket && <p className="font-semibold" style={{ color: data.color }}>{t('tooltipAvgBracket', { bracket: data.bracket })}</p>}
  //             </div>
  //         );
  //     }
  //     return null;
  // };
  const HistogramTooltip = ({ active, payload }: any) => {
    const { t } = useTranslation('dashboard');
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      // const scoreRange = `${(data.binStart / 1_000_000).toFixed(1)}M-${(data.binEnd / 1_000_000).toFixed(1)}M`;
      const scoreRange = `${data.binStart.toLocaleString()}-${data.binEnd.toLocaleString()}`;
      return (
        <div className="bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm p-3 border rounded-lg shadow-lg text-sm">
          <p className="font-bold">{t('tooltipScore', { name: scoreRange })}</p>
          <p>{t('tooltipPlayers', { count: data.count.toLocaleString() })}</p>
          <p>
            {t('tooltipRank', 'rank')}: {data.cumulativeRankRange}
          </p>
          {data.bracket && (
            <p className="font-semibold" style={{ color: data.color }}>
              {t('tooltipAvgBracket', { bracket: data.bracket })}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Return the JSX for the histogram section
  return (
    <>
      <div className="flex justify-between items-center mb-2">
        <div className="font-bold"></div>
        <button onClick={() => setIsSettingsVisible(!isSettingsVisible)} className="text-sm px-3 py-1 rounded-md bg-gray-200 dark:bg-neutral-700 hover:bg-gray-300 dark:hover:bg-neutral-600">
          {t('clearTime')} {isSettingsVisible ? t('hideSettings') : t('showSettings')}
        </button>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={histogramData}>
          <CartesianGrid strokeDasharray="3 3" />
          {/* <XAxis dataKey="name" angle={-45} textAnchor="end" height={50} tickFormatter={(value) => value.split('-')[0]}
                    /> */}
          <XAxis dataKey="binStart" angle={-45} textAnchor="end" height={50} tickFormatter={(value) => `${(value / 1_000_000).toFixed(1)}M`} />
          <YAxis />
          <Tooltip content={<HistogramTooltip />} />
          <Bar dataKey="count" name={t('playerCount')}>
            {/* {histogramData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))} */}
            {histogramData.map((entry, index) => (
              <Cell key={`cell-${entry.binStart}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {isSettingsVisible && (
        <div className="p-3 bg-gray-50 dark:bg-neutral-800/50 border dark:border-neutral-700 rounded-lg space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-bold">{t('scoreRangeFilter')}</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  value={histFilter.scoreMin}
                  onChange={(e) => setHistFilter((p) => ({ ...p, scoreMin: +e.target.value }))}
                  className="w-full p-1 text-center bg-transparent border rounded"
                />
                <span>~</span>
                <input
                  type="number"
                  value={histFilter.scoreMax}
                  onChange={(e) => setHistFilter((p) => ({ ...p, scoreMax: +e.target.value }))}
                  className="w-full p-1 text-center bg-transparent border rounded"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-bold">{t('binSize')}</label>
              <CustomNumberInput
                value={histFilter.binSize}
                onChange={(e) => e && setHistFilter((p) => ({ ...p, binSize: +e }))}
                step="100000"
                className="w-full p-1 mt-1 text-center bg-transparent border rounded"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold">{t('bracketFilter')}</label>
              <div className="flex gap-2">
                <button onClick={handleSelectAllBrackets} className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-neutral-700 hover:bg-gray-300 dark:hover:bg-neutral-600">
                  {t('selectAll')}
                </button>
                <button onClick={handleDeselectAllBrackets} className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-neutral-700 hover:bg-gray-300 dark:hover:bg-neutral-600">
                  {t('deselectAll')}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
              {Object.entries(bracketVisibility).map(([bracketName, isVisible]) => (
                <label key={bracketName} className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={(e) =>
                      setBracketVisibility((p) => ({
                        ...p,
                        [bracketName]: e.target.checked,
                      }))
                    }
                    className="mr-1.5 h-4 w-4"
                  />
                  <span className="text-sm">{bracketName}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default HistogramAnalysis;
