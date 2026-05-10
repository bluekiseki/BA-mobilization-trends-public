// app/components/live/RankScatterChart.tsx
import { Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart, ReferenceArea, ReferenceLine } from 'recharts';
import React, { type FC, useCallback, useEffect, useMemo, useState } from 'react';
import { difficultyInfo, generateScoreBrackets, getDifficultyFromScoreAndBoss } from '~/components/Difficulty';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import { formatTimeToTimestamp } from '~/utils/time';
import type { GameServer, RaidInfo } from '~/types/data';
import type { ReportEntry } from '../dashboard/common';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import type { LastData, LastERaidData, LastRaidData } from '~/types/livetype';
import { type_translation } from '../raidToString';
import { useTranslation } from 'react-i18next';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { FaChartLine } from 'react-icons/fa'; // Icon used as an emoji replacement

import { useDataCache } from '~/utils/cache'; // Updated import path
import { cdn } from '~/utils/cdn'; // Updated import path

import elimination_raid_trajectories from '~/data/jp/trajectory/elimination_raid_trajectories.json';
import total_assault_trajectories from '~/data/jp/trajectory/total_assault_trajectories.json';
import { LIVE_RAID_DURATION } from '~/data/liveRaid';
import { getKstTime } from '~/data/globalRaidDates';

interface RankScatterChartProps {
  readonly isRaid: boolean;
  readonly lastData: LastData;
  readonly raidInfos: RaidInfo[];
  readonly server: GameServer;
}
type ChartTab = 'total' | 'boss1' | 'boss2' | 'boss3';
interface RemappedDataPoint {
  displayValue: number;
  originalScore: number;
  originalTime?: number;
  rank: number;
  difficulty: string;
}

const getBracketFromTotalScore = (score: number, brackets: { name: string; minScore: number }[]) => {
  const item = brackets.find((b) => score >= b.minScore);
  const index = item ? brackets.indexOf(item) - 1 : -1;
  if (index < 0) return 'Unknown';
  return brackets[index]?.name;
};

export const RankScatterChart: FC<RankScatterChartProps> = ({ isRaid, lastData, raidInfos, server }) => {
  // console.log('[RankScatterChart]', { isRaid, lastData, raidInfos, server });
  const [activeTab, setActiveTab] = useState<ChartTab>('total');
  const [axisType, setAxisType] = useState<'score' | 'time'>('score');
  const [visibleDifficulties, setVisibleDifficulties] = useState<Set<string>>(new Set());

  const [showPredictionCut, setShowPredictionCut] = useState<boolean>(true);
  const [predictionMode, setPredictionMode] = useState<'stats' | 'compare'>('stats');

  const [compareRaidId, setCompareRaidId] = useState<string>('');

  const [allRaidInfos, setAllRaidInfos] = useState<RaidInfo[]>([]);

  const { t, i18n } = useTranslation('liveDashboard');
  const locale = i18n.language as Locale;
  const currentLocaleShort = getLocaleShortName(locale);

  const fetchRaids = useDataCache<RaidInfo[]>();
  useEffect(() => {
    fetchRaids(cdn(`/w/${server}/${currentLocaleShort}.raid_info.bin`), (res) => res.json() as Promise<RaidInfo[]>)
      .then((data) => {
        if (data) setAllRaidInfos(data);
      })
      .catch(console.error);
  }, [server, currentLocaleShort, fetchRaids]);

  const TABS: { id: ChartTab; name: string }[] = useMemo(
    () =>
      isRaid
        ? [{ id: 'total', name: t('total_score') }]
        : [
            { id: 'total', name: t('total_score') },
            {
              id: 'boss1',
              name: type_translation[raidInfos?.[0]?.Type as keyof typeof type_translation]?.[currentLocaleShort] || 'Boss 1',
            },
            {
              id: 'boss2',
              name: type_translation[raidInfos?.[1]?.Type as keyof typeof type_translation]?.[currentLocaleShort] || 'Boss 2',
            },
            {
              id: 'boss3',
              name: type_translation[raidInfos?.[2]?.Type as keyof typeof type_translation]?.[currentLocaleShort] || 'Boss 3',
            },
          ],
    [raidInfos, isRaid, currentLocaleShort, t],
  );

  const SCORE_BRACKETS = useMemo(() => generateScoreBrackets(difficultyInfo), []);
  const isTotalChart = !isRaid && activeTab === 'total';

  const predictionData = useMemo(() => {
    return isRaid ? total_assault_trajectories : elimination_raid_trajectories;
  }, [isRaid]);

  const getDisplayName = useCallback(
    (id: string, targetTab?: string) => {
      const rawId = id.replace('live_', '');
      const numId = rawId.replace(/^[RE]/, '');

      const matchedRaids = allRaidInfos.filter((r) => r.Id.toString() === rawId || r.Id.toString() === numId);

      if (matchedRaids.length === 0) return id;

      if (isRaid) {
        const raid = matchedRaids[0];
        const typeStr = raid.Type && type_translation[raid.Type as keyof typeof type_translation]?.[currentLocaleShort];
        return typeStr ? `${raid.Boss} (${typeStr})` : raid.Boss;
      } else {
        const currentTarget = targetTab || activeTab;
        if (currentTarget === 'total') {
          const typesStr = matchedRaids
            .map((r) => (r.Type && type_translation[r.Type as keyof typeof type_translation]?.[currentLocaleShort]) || r.Type)
            .filter(Boolean)
            .join(', ');
          return `${matchedRaids[0].Boss} (${t('total_combined', { types: typesStr })})`; // Applied localization (i18n)
        } else {
          const tabIndex = parseInt(currentTarget.replace('boss', '')) - 1;
          const raid = matchedRaids[tabIndex] || matchedRaids[0];
          const typeStr = raid.Type && type_translation[raid.Type as keyof typeof type_translation]?.[currentLocaleShort];
          return typeStr ? `${raid.Boss} (${typeStr})` : raid.Boss;
        }
      }
    },
    [allRaidInfos, currentLocaleShort, isRaid, activeTab, t],
  );

  const compareOptions = useMemo(() => {
    if (!predictionData?.trajectories) return [];
    const ids = Object.keys(predictionData.trajectories);
    const options: { value: string; label: string }[] = [];

    ids.forEach((id) => {
      if (isRaid) {
        options.push({ value: id, label: getDisplayName(id) });
      } else {
        if (activeTab === 'total') {
          options.push({ value: `${id}_total`, label: getDisplayName(id, 'total') });
        } else {
          options.push({ value: `${id}_boss1`, label: getDisplayName(id, 'boss1') });
          options.push({ value: `${id}_boss2`, label: getDisplayName(id, 'boss2') });
          options.push({ value: `${id}_boss3`, label: getDisplayName(id, 'boss3') });
        }
      }
    });
    return options;
  }, [predictionData, isRaid, activeTab, getDisplayName]);

  useEffect(() => {
    if (compareOptions.length > 0) {
      const isValid = compareOptions.some((opt) => opt.value === compareRaidId);
      if (!isValid) {
        setCompareRaidId(compareOptions[0].value);
      }
    }
  }, [compareOptions, compareRaidId]);

  const currentPrediction = useMemo(() => {
    if (!showPredictionCut || !predictionData) return null;

    const d = predictionData as any;
    const targetRank = d.target_rank || 20000;

    const raidInfoAny = raidInfos?.[0];
    const endTimeStr = Number(getKstTime(raidInfoAny.Date)) + 3600_000 * 24 * LIVE_RAID_DURATION - 3600_000 * 7;
    const endDt = endTimeStr ? endTimeStr : Date.now();

    const currentDt = getKstTime(lastData.time, '+00:00') || Number(Date.now());
    // console.log('--', lastData.time, new Date(getKstTime(lastData.time, '+00:00')))
    const hoursRemaining = Math.max(0, (endDt - currentDt) / 3600000) + 0;

    // console.log('Time:',{hoursRemaining,currentDt: new Date(currentDt),endDt: new Date(endDt), endTimeStr, date: raidInfoAny.Date })

    if (hoursRemaining === 0) {
      return { mode: predictionMode, hour: 0, avg: targetRank, min: targetRank, max: targetRank, rank: targetRank };
    }

    let targetDataArray: any[] = [];
    if (predictionMode === 'stats') {
      if (isRaid) {
        targetDataArray = d.statistics || [];
      } else {
        const statsKey = activeTab === 'total' ? 'total' : 'boss';
        targetDataArray = d.statistics?.[statsKey] || [];
      }
    } else {
      if (!compareRaidId) return null;
      if (isRaid) {
        targetDataArray = d.trajectories?.[compareRaidId] || [];
      } else {
        const lastUnderscoreIdx = compareRaidId.lastIndexOf('_');
        const baseId = compareRaidId.substring(0, lastUnderscoreIdx);
        const targetTab = compareRaidId.substring(lastUnderscoreIdx + 1);

        targetDataArray = d.trajectories?.[baseId]?.[targetTab] || [];
      }
    }

    if (!targetDataArray || targetDataArray.length === 0) return null;

    const closestMatch = targetDataArray.reduce((prev, curr) => {
      return Math.abs(curr.hour_remaining - hoursRemaining) < Math.abs(prev.hour_remaining - hoursRemaining) ? curr : prev;
    });

    return {
      mode: predictionMode,
      hour: closestMatch.hour_remaining,
      avg: closestMatch.avg,
      min: closestMatch.min,
      max: closestMatch.max,
      rank: closestMatch.rank,
      score: closestMatch.score,
    };
  }, [showPredictionCut, predictionMode, predictionData, isRaid, activeTab, compareRaidId, raidInfos]);

  // const compareDisplayName = useMemo(() => {
  //   if (!compareRaidId) return '';
  //   if (isRaid) return getDisplayName(compareRaidId);

  //   const lastUnderscoreIdx = compareRaidId.lastIndexOf('_');
  //   const baseId = compareRaidId.substring(0, lastUnderscoreIdx);
  //   const targetTab = compareRaidId.substring(lastUnderscoreIdx + 1);
  //   return getDisplayName(baseId, targetTab);
  // }, [compareRaidId, isRaid, getDisplayName]);

  const { chartData, customTicks, xDomain, legendPayload } = useMemo(() => {
    let rankData: ReportEntry[];
    let currentRaidInfo = raidInfos?.[0];
    if (isRaid) {
      const scoreMap = new Map<number, number>();
      const boss = (lastData.data as LastRaidData).boss;
      // console.log('boss',boss)
      boss.d
        .filter((v) => v.r <= 20000)
        .forEach((p) => {
          scoreMap.set(p.r, (scoreMap.get(p.r) || 0) + p.s);
        });
      rankData = Array.from(scoreMap.entries())
        .map(([rank, score]) => ({ r: rank, s: score }))
        .sort((a, b) => b.s - a.s) as ReportEntry[];
      currentRaidInfo = raidInfos?.[0];
    } else if (activeTab === 'total') {
      const scoreMap = new Map<number, number>();
      const { boss1, boss2, boss3 } = (lastData.data as LastERaidData).total;
      [boss1.d, boss2.d, boss3.d].forEach((bossData) => {
        bossData.forEach((p) => {
          scoreMap.set(p.r, (scoreMap.get(p.r) || 0) + p.s);
        });
      });
      rankData = Array.from(scoreMap.entries())
        .map(([rank, score]) => ({ r: rank, s: score }))
        .sort((a, b) => b.s - a.s) as ReportEntry[];
      currentRaidInfo = raidInfos?.[0];
    } else {
      rankData = (lastData.data as LastERaidData)[activeTab].d.filter((v) => v.r <= 20000);
      currentRaidInfo = raidInfos.find((r) => r.Id.toString().endsWith(activeTab.slice(-1))) || raidInfos?.[0];
    }

    if (axisType === 'score' || isTotalChart) {
      const remappedData: RemappedDataPoint[] = [];
      const ticks: { value: number; label: string }[] = [];
      let currentOffset = 0;
      const PANEL_WIDTH = 10000;
      const PANEL_GAP = 2000;

      const groupedData = rankData.reduce(
        (acc, entry) => {
          const groupName = isTotalChart ? getBracketFromTotalScore(entry.s, SCORE_BRACKETS) : getDifficultyFromScoreAndBoss(entry.s, server, raidInfos[0].Id);
          if (!acc[groupName]) acc[groupName] = [];
          acc[groupName].push(entry);
          return acc;
        },
        {} as Record<string, ReportEntry[]>,
      );

      const groupOrder = (isTotalChart ? SCORE_BRACKETS.map((b) => b.name) : ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal']).reverse();

      groupOrder.forEach((groupName) => {
        const entries = groupedData[groupName];
        if (!entries || entries.length === 0) return;

        const minScore = Math.min(...entries.map((e) => e.s));
        const maxScore = Math.max(...entries.map((e) => e.s));
        const scoreRange = maxScore - minScore;

        for (const point of entries) {
          const normalized = scoreRange > 0 ? (point.s - minScore) / scoreRange : 0;
          remappedData.push({
            displayValue: normalized * PANEL_WIDTH + currentOffset,
            originalScore: point.s,
            rank: point.r,
            difficulty: groupName,
          });
        }
        ticks.push({
          value: currentOffset,
          label: `${(minScore / 1e6).toFixed(2)}M`,
        });
        ticks.push({
          value: currentOffset + PANEL_WIDTH,
          label: `${(maxScore / 1e6).toFixed(2)}M`,
        });
        currentOffset += PANEL_WIDTH + PANEL_GAP;
      });

      const payload = (
        isTotalChart ? SCORE_BRACKETS.map((b) => ({ value: b.name, color: b.fill, type: 'circle' })) : Object.entries(DIFFICULTY_COLORS).map(([value, color]) => ({ value, color, type: 'circle' }))
      ).filter((p) => groupedData[p.value]);
      return { chartData: remappedData, customTicks: ticks, xDomain: ['dataMin', 'dataMax'] as [any, any], legendPayload: payload };
    } else {
      const timeDataTmp = rankData.map((entry) => ({
        displayValue: calculateTimeFromScore(entry.s, currentRaidInfo.Boss, server, currentRaidInfo.Id) || 0,
        originalScore: entry.s,
        rank: entry.r,
        difficulty: getDifficultyFromScoreAndBoss(entry.s, server, raidInfos[0].Id),
      }));

      const timeData = timeDataTmp.filter(
        (p, i) =>
          (p.displayValue > 0 && p.rank % 1000 == 0) ||
          p.rank == 1 ||
          getDifficultyFromScoreAndBoss(p.originalScore, server, raidInfos[0].Id) != getDifficultyFromScoreAndBoss(timeDataTmp[i - 1].originalScore, server, raidInfos[0].Id),
      );

      const existingDifficulties = [...new Set(timeData.map((d) => d.difficulty))];
      const payload = Object.entries(DIFFICULTY_COLORS)
        .filter(([diff]) => existingDifficulties.includes(diff as any))
        .map(([value, color]) => ({ value, color, type: 'circle' }));
      return { chartData: timeData, customTicks: undefined, xDomain: ['dataMin', 'dataMax'] as [any, any], legendPayload: payload };
    }
  }, [lastData, activeTab, axisType, server, raidInfos, SCORE_BRACKETS, isRaid, isTotalChart]);

  // Find the intersection point between the predicted rank (X) and the score distribution curve.
  // Find the exact intersection point (interpolation) between the predicted rank (X) and the score distribution curve.
  // Find the exact intersection point between the predicted rank (X) and the score distribution curve (including missing value protection).
  const predictionIntersection = useMemo(() => {
    if (!currentPrediction || !chartData || chartData.length === 0) return null;

    // 1. Filter valid data only (Remove missing data where scores or coordinates are null/undefined)
    const validData = chartData.filter((d) => d != null && d.rank != null && d.originalScore != null && d.displayValue != null);

    // Stop calculation if no data remains after filtering
    if (validData.length === 0) return null;

    // 2. Sort by rank in ascending order (required condition for interpolation)
    const sortedData = [...validData].sort((a, b) => a.rank - b.rank);

    const getIntersectionData = (targetRank: number) => {
      // Guard 1: If only one valid data point remains (interpolation impossible, return the point)
      if (sortedData.length === 1) {
        return {
          rank: targetRank,
          score: sortedData[0].originalScore,
          yValue: sortedData[0].displayValue,
        };
      }

      // Guard 2: If the target rank is out of data range (clamp to the ends)
      if (targetRank <= sortedData[0].rank) {
        return { rank: targetRank, score: sortedData[0].originalScore, yValue: sortedData[0].displayValue };
      }
      if (targetRank >= sortedData[sortedData.length - 1].rank) {
        const lastPoint = sortedData[sortedData.length - 1];
        return { rank: targetRank, score: lastPoint.originalScore, yValue: lastPoint.displayValue };
      }

      // Find two valid points (p1, p2) surrounding the target rank
      let p1 = sortedData[0];
      let p2 = sortedData[1];
      for (let i = 0; i < sortedData.length - 1; i++) {
        if (sortedData[i].rank <= targetRank && sortedData[i + 1].rank >= targetRank) {
          p1 = sortedData[i];
          p2 = sortedData[i + 1];
          break;
        }
      }

      // Guard 3: Prevent Divide by Zero if duplicate ranks are present
      const range = p2.rank - p1.rank;
      const ratio = range > 0 ? (targetRank - p1.rank) / range : 0;

      const interpolatedScore = p1.originalScore + ratio * (p2.originalScore - p1.originalScore);
      const interpolatedYValue = p1.displayValue + ratio * (p2.displayValue - p1.displayValue);

      return {
        rank: targetRank,
        score: Math.round(interpolatedScore),
        yValue: interpolatedYValue,
      };
    };

    return {
      avg: currentPrediction.avg ? getIntersectionData(currentPrediction.avg) : null,
      min: currentPrediction.min ? getIntersectionData(currentPrediction.min) : null,
      max: currentPrediction.max ? getIntersectionData(currentPrediction.max) : null,
      compare: currentPrediction.score || currentPrediction.rank ? getIntersectionData(currentPrediction.rank || currentPrediction.score) : null,
    };
  }, [currentPrediction, chartData]);

  useEffect(() => {
    setVisibleDifficulties(new Set(legendPayload.map((p) => p.value)));
  }, [legendPayload]);

  useEffect(() => {
    if (!isRaid && activeTab === 'total') setAxisType('score');
  }, [activeTab, isRaid]);

  const handleDifficultyToggle = useCallback((difficulty: string) => {
    setVisibleDifficulties((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(difficulty)) {
        newSet.delete(difficulty);
      } else {
        newSet.add(difficulty);
      }
      return newSet;
    });
  }, []);

  const pivotedData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    const dataMap = new Map<number, any>();
    const allDifficulties = legendPayload.map((p) => p.value);

    chartData.forEach((point) => {
      if (!dataMap.has(point.rank)) {
        const initialEntry: any = { rank: point.rank, originalScores: {}, originalTimes: {} };
        allDifficulties.forEach((diff) => {
          initialEntry[diff] = null;
        });
        dataMap.set(point.rank, initialEntry);
      }
      const entry = dataMap.get(point.rank);
      entry[point.difficulty] = point.displayValue;
      entry.originalScores[point.difficulty] = point.originalScore;
    });

    return Array.from(dataMap.values()).sort((a, b) => a.rank - b.rank);
  }, [chartData, legendPayload]);

  return (
    <>
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4 bg-purple-50 dark:bg-neutral-800 p-3 sm:p-4 rounded-lg border border-purple-200 dark:border-neutral-700">
        {/* 1. Checkbox Area: shrink-0 to prevent compression */}
        <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-purple-700 dark:text-purple-400 shrink-0">
          <input
            type="checkbox"
            checked={showPredictionCut}
            onChange={(e) => setShowPredictionCut(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <FaChartLine className="text-purple-600 dark:text-purple-400 shrink-0" />
          {t('show_prediction_cutoff')}
        </label>

        {showPredictionCut && (
          /* 2. Radio & Select Container: Vertical (flex-col) on mobile, horizontal (sm:flex-row) from tablet. min-w-0 required */
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 text-sm font-medium w-full md:w-auto min-w-0">
            {/* Radio Button Group: Fixed with shrink-0 to prevent resizing */}
            <div className="flex items-center gap-4 shrink-0">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="predMode" checked={predictionMode === 'stats'} onChange={() => setPredictionMode('stats')} />
                <span className="whitespace-nowrap">{t('prediction_mode_stats')}</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="predMode" checked={predictionMode === 'compare'} onChange={() => setPredictionMode('compare')} />
                <span className="whitespace-nowrap">{t('prediction_mode_compare')}</span>
              </label>
            </div>

            {/* 3. Select Area: w-full for full-width on mobile; appropriate max-width with truncation from sm onwards */}
            {predictionMode === 'compare' && (
              <div className="w-full sm:w-auto min-w-0 flex-1">
                <select
                  className="w-full sm:max-w-[200px] lg:max-w-[250px] px-2 py-1.5 border rounded-md bg-white dark:bg-neutral-700 dark:border-neutral-600 outline-none truncate"
                  value={compareRaidId}
                  onChange={(e) => setCompareRaidId(e.target.value)}
                  // Added title attribute to allow viewing full text on hover when truncated
                  title={compareOptions.find((opt) => opt.value === compareRaidId)?.label || ''}
                >
                  {compareOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mb-4 pb-3 border-b border-neutral-200 dark:border-neutral-700">
        <nav className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200 dark:hover:bg-neutral-600'}`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
        {(isRaid || activeTab !== 'total') && (
          <div className="flex gap-1 rounded-lg bg-gray-200 dark:bg-neutral-700 p-1 text-xs font-semibold">
            <button onClick={() => setAxisType('score')} className={`px-3 py-1 rounded-md transition-colors ${axisType === 'score' ? 'bg-white dark:bg-neutral-900 shadow-sm' : ''}`}>
              Score
            </button>
            <button onClick={() => setAxisType('time')} className={`px-3 py-1 rounded-md transition-colors ${axisType === 'time' ? 'bg-white dark:bg-neutral-900 shadow-sm' : ''}`}>
              Time
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-center items-center flex-wrap gap-2 mb-4">
        {legendPayload.map((p) => (
          <button
            key={p.value}
            onClick={() => handleDifficultyToggle(p.value)}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all duration-200 flex items-center gap-2 ${visibleDifficulties.has(p.value) ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
            style={{ backgroundColor: `${p.color}20`, color: p.color }}
          >
            <div style={{ width: 8, height: 8, backgroundColor: p.color, borderRadius: '50%' }} />
            {p.value}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={500}>
        <ComposedChart data={pivotedData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <XAxis type="number" dataKey="rank" fontSize={14} reversed={true} tickFormatter={(r) => r.toLocaleString()} />
          <YAxis
            domain={xDomain}
            width={35}
            fontSize={14}
            ticks={customTicks?.map((t) => t.value)}
            tickFormatter={(value) => {
              if (axisType === 'score' || (!isRaid && activeTab === 'total')) {
                return customTicks ? customTicks.find((t) => t.value == value)?.label || '' : value;
              }
              return formatTimeToTimestamp(value).split('.')[0];
            }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const hoveredSeries = payload.find((p) => p.dataKey !== 'range' && p.dataKey !== 'avg' && p.dataKey !== 'compare');
                if (!hoveredSeries) return null;

                const dataKey = hoveredSeries.dataKey as string;
                const fullDataPoint = hoveredSeries.payload;
                const originalScore = fullDataPoint.originalScores[dataKey] || '';
                const rank = fullDataPoint.rank;
                const id = raidInfos.find((r) => r.Id.toString())?.Id || '';
                const time = formatTimeToTimestamp(calculateTimeFromScore(originalScore, raidInfos[0].Boss || '', server, id) || 0);

                return (
                  <div className="p-2 bg-white/90 dark:bg-black/90 backdrop-blur-sm rounded-md border dark:border-neutral-700 text-sm shadow-md">
                    <p>
                      <strong>Rank:</strong> {rank.toLocaleString()}
                    </p>
                    <p>
                      <strong>Score:</strong> {originalScore?.toLocaleString()}
                    </p>
                    {!isTotalChart && (
                      <p>
                        <strong>Time:</strong> {time}
                      </p>
                    )}
                    <p>
                      <strong>Difficulty:</strong> <span style={{ color: hoveredSeries.color }}>{dataKey}</span>
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />

          {currentPrediction && currentPrediction.mode === 'stats' && (
            <>
              <ReferenceArea x1={currentPrediction.min} x2={currentPrediction.max} fill="#a855f7" fillOpacity={0.15} ifOverflow="extendDomain" />
              <ReferenceLine
                x={currentPrediction.avg}
                stroke="#9333ea"
                strokeWidth={2}
                strokeDasharray="5 5"
                ifOverflow="extendDomain"
                label={{
                  position: 'top',
                  value: t('platinum_prediction_avg', { rank: Math.round(currentPrediction.avg).toLocaleString() }), // Applied localization (i18n)
                  fill: '#9333ea',
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
              />
            </>
          )}

          {currentPrediction && currentPrediction.mode === 'compare' && (
            <ReferenceLine
              x={currentPrediction.rank}
              stroke="#9333ea"
              strokeWidth={2}
              strokeDasharray="5 5"
              ifOverflow="extendDomain"
              label={{
                position: 'top',
                // value: t('compare_cutoff', { name: compareDisplayName, rank: Math.round(currentPrediction.rank).toLocaleString() }), // Applied localization (i18n)
                value: t('platinum_prediction_avg', { rank: Math.round(currentPrediction.rank).toLocaleString() }), // Applied localization (i18n)
                fill: '#9333ea',
                fontSize: 12,
                fontWeight: 'bold',
              }}
            />
          )}

          {/* Display prediction data (Crosshair style) */}
          {currentPrediction && predictionIntersection && (
            <>
              {/* Vertical line: Predicted cutoff rank */}
              {predictionIntersection.avg && <ReferenceLine x={predictionIntersection.avg.rank} stroke="#d8b4fe" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />}

              {currentPrediction.mode === 'stats' && (
                <>
                  {predictionIntersection.min && predictionIntersection.max && (
                    <ReferenceArea y1={predictionIntersection.min.yValue} y2={predictionIntersection.max.yValue} fill="#a855f7" fillOpacity={0.15} ifOverflow="extendDomain" />
                  )}
                  {/* Horizontal line: Intersection point on the curve (Y-axis) */}
                  {predictionIntersection.avg && (
                    <ReferenceLine
                      y={predictionIntersection.avg.yValue}
                      stroke="#9333ea"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      ifOverflow="extendDomain"
                      label={{
                        position: 'insideBottomLeft',
                        // Display the 'actual score' at the intersection
                        value: t('predicted_score', { score: predictionIntersection.avg.score.toLocaleString() }),
                        fill: '#9333ea',
                        fontSize: 12,
                        fontWeight: 'bold',
                      }}
                    />
                  )}
                </>
              )}

              {currentPrediction.mode === 'compare' && predictionIntersection.compare && (
                <ReferenceLine
                  y={predictionIntersection.compare.yValue}
                  stroke="#9333ea"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  ifOverflow="extendDomain"
                  label={{
                    position: 'insideBottomLeft',
                    // Display the 'actual score' at the intersection
                    value: t('predicted_score', { score: predictionIntersection.compare.score.toLocaleString() }),
                    // value: t('compare_cutoff', { name: compareDisplayName, score: predictionIntersection.compare.score.toLocaleString() }),
                    fill: '#9333ea',
                    fontSize: 12,
                    fontWeight: 'bold',
                  }}
                />
              )}
            </>
          )}

          {legendPayload.map((p) => {
            if (!visibleDifficulties.has(p.value)) return null;
            return (
              <React.Fragment key={p.value}>
                <Line dataKey={p.value} stroke={p.color} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                <Scatter dataKey={p.value} fill={p.color} shape="circle" isAnimationActive={false} />
              </React.Fragment>
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
};

export default React.memo(RankScatterChart);
