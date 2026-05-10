// app/components/live/ScoreTimelineChart.tsx

import { Scatter, XAxis, YAxis, Label, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line, ReferenceLine } from 'recharts';
import { type FC, useMemo, useState, useRef, useEffect } from 'react';
import type { /*ERaidTimelinePoint, RaidTimelinePoint,*/ TimelineData } from '~/types/livetype';
import type { ReportEntry } from '../dashboard/common';
import type { RaidInfo } from '~/types/data';
import { type_translation } from '../raidToString';
import { useTranslation } from 'react-i18next';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { formatDateToDayString } from './formatDateToDayString';
import React from 'react';
import { useIsDarkState } from '~/store/isDarkState';
import { getKSTResetTimestamps } from './getKSTResetTimestamps';

import { DateRangeSlider } from './DateRangeSlider';
import { RankSelector } from './RankSelector';
import { useTierDashboardStore } from '~/store/tierDashboardStore';

interface ScoreTimelineChartProps {
  isRaid: boolean;
  timelineData: TimelineData;
  ranksToPlot: number[];
  raidInfos: RaidInfo[];
}

// ... (Helper functions remain unchanged) ...
const CustomScoreTimelineTooltip = ({ active, payload, label, raidInfos, rankColorMap }: any) => {
  if (active && payload && payload.length && label) {
    const scoreMap = new Map<string, number>();
    payload.forEach((p: any) => {
      if (p.dataKey && p.dataKey.startsWith('Rank ') && !p.dataKey.endsWith('_raw') && p.value !== null) {
        const rawValue = p.payload[`${p.dataKey}_raw`] ?? p.value;
        scoreMap.set(p.dataKey, rawValue as number);
      }
    });
    const sortedEntries = Array.from(scoreMap.entries()).sort(([keyA], [keyB]) => {
      const rankA = parseInt(keyA.replace('Rank ', ''));
      const rankB = parseInt(keyB.replace('Rank ', ''));
      return rankA - rankB;
    });
    if (sortedEntries.length === 0) return null;
    return (
      <div className="p-2 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm rounded-md border border-gray-300 dark:border-neutral-600 shadow-lg text-xs">
        <p className="font-bold mb-1 text-neutral-800 dark:text-neutral-200">{formatDateToDayString(new Date(label), raidInfos[0])}</p>
        {sortedEntries.map(([key, value]) => {
          const rankNum = parseInt(key.replace('Rank ', ''));
          const color = rankColorMap.get(rankNum) || '#8884d8';
          return (
            <div key={key} className="flex justify-between items-center gap-2">
              <span style={{ color: color }}>■ Rank {rankNum}</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-300">{value.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

// const findScoreForRank = (rankEntries: ReportEntry[], targetRank: number): number | null => {
//   if (!rankEntries) return null;
//   const exactMatch = rankEntries.find((p) => p.r === targetRank);
//   return exactMatch ? exactMatch.s : null;
// };

type GrandAssaultTab = 'total' | 'boss1' | 'boss2' | 'boss3';

const generateDistinctColors = (count: number): string[] => {
  const colors: string[] = [];
  const saturation = 75;
  const lightness = 55;
  for (let i = 0; i < count; i++) {
    const hue = (i * (360 / (count + 1))) % 360;
    colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
  }
  return colors;
};

export const ScoreTimelineChart: FC<ScoreTimelineChartProps> = ({ isRaid, timelineData, ranksToPlot, raidInfos }) => {
  // console.log('[ScoreTimelineChart] ', { isRaid, timelineData, ranksToPlot, raidInfos });
  const [activeTab, setActiveTab] = useState<GrandAssaultTab>('total');
  const { t, i18n } = useTranslation('liveDashboard');
  const locale = i18n.language as Locale;
  const { isDark } = useIsDarkState();
  const { dateRangeIndex } = useTierDashboardStore();

  // 1. Rank State & Colors
  const [selectedRanks, setSelectedRanks] = useState<Set<number>>(new Set([20000]));

  const rankColorMap = useMemo(() => {
    const colors = generateDistinctColors(ranksToPlot.length);
    const map = new Map<number, string>();
    ranksToPlot.forEach((rank, i) => {
      map.set(rank, colors[i % colors.length]);
    });
    return map;
  }, [ranksToPlot]);

  const TABS: { id: GrandAssaultTab; name: string }[] = useMemo(
    () =>
      isRaid
        ? [{ id: 'total', name: t('total_score') }]
        : [
            { id: 'total', name: t('total_score') },
            {
              id: 'boss1',
              name: type_translation[raidInfos?.[0]?.Type as keyof typeof type_translation][getLocaleShortName(locale)] || 'Boss 1',
            },
            {
              id: 'boss2',
              name: type_translation[raidInfos?.[1]?.Type as keyof typeof type_translation][getLocaleShortName(locale)] || 'Boss 2',
            },
            {
              id: 'boss3',
              name: type_translation[raidInfos?.[2]?.Type as keyof typeof type_translation][getLocaleShortName(locale)] || 'Boss 3',
            },
          ],
    [raidInfos, isRaid, t, locale],
  );

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isChartVisible, setIsChartVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsChartVisible(entry.isIntersecting);
      },
      { rootMargin: '200px 0px' },
    );

    if (chartContainerRef.current) {
      observer.observe(chartContainerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // const distinctDays = useMemo(() => {
  //   if (!timelineData) return [];
  //   const days = new Set<string>();
  //   timelineData.forEach((p) => {
  //     const dayStr = formatDateToDayString(new Date(p.time.replace(' ', 'T') + 'Z'), raidInfos[0]);
  //     days.add(dayStr);
  //   });
  //   return Array.from(days);
  // }, [timelineData, raidInfos]);

  const prevFilteredDataRef = useRef<any[]>([]);

  // const filteredDataPoints = useMemo(() => {
  //   if (!isChartVisible && prevFilteredDataRef.current.length > 0) {
  //     return prevFilteredDataRef.current;
  //   }

  //   if (!timelineData || distinctDays.length === 0) return [];
  //   const startIndex = Math.max(0, Math.min(dateRangeIndex[0], distinctDays.length - 1));
  //   const endIndex = Math.max(0, Math.min(dateRangeIndex[1], distinctDays.length - 1));

  //   const result = timelineData.filter((p) => {
  //     const dayStr = formatDateToDayString(new Date(p.time.replace(' ', 'T') + 'Z'), raidInfos[0]);
  //     const dayIndex = distinctDays.indexOf(dayStr);
  //     return dayIndex >= startIndex && dayIndex <= endIndex;
  //   });

  //   prevFilteredDataRef.current = result; // Update Cache
  //   return result;
  // }, [timelineData, distinctDays, dateRangeIndex, raidInfos, isChartVisible]);

  const prevChartDataRef = useRef<{
    chartData: any[];
    dataKeys: string[];
    resetTimestamps: number[];
  }>({ chartData: [], dataKeys: [], resetTimestamps: [] });

  // const { chartData, dataKeys, resetTimestamps } = useMemo(() => {
  //   if (!isChartVisible && prevChartDataRef.current.chartData.length > 0) {
  //     return prevChartDataRef.current;
  //   }

  //   if (!filteredDataPoints || filteredDataPoints.length === 0) {
  //     return { chartData: [], dataKeys: [], resetTimestamps: [] };
  //   }

  //   const activeRanks = Array.from(selectedRanks);
  //   const keys = activeRanks.map((r) => `Rank ${r}`);

  //   const data = isRaid
  //     ? (filteredDataPoints as RaidTimelinePoint[]).map((timePoint) => {
  //         const entry: { time: number; [key: string]: number | null } = {
  //           time: new Date(timePoint.time.replace(' ', 'T') + 'Z').getTime(),
  //         };
  //         const rankEntries = timePoint.data.boss.d as ReportEntry[];
  //         activeRanks.forEach((rank) => {
  //           entry[`Rank ${rank}`] = findScoreForRank(rankEntries, rank);
  //         });
  //         return entry;
  //       })
  //     : (filteredDataPoints as ERaidTimelinePoint[]).map((timePoint) => {
  //         const entry: { time: number; [key: string]: number | null } = {
  //           time: new Date(timePoint.time.replace(' ', 'T') + 'Z').getTime(),
  //         };
  //         let rankEntries: ReportEntry[];
  //         if (activeTab === 'total') {
  //           rankEntries = timePoint.data.total as ReportEntry[];
  //         } else {
  //           rankEntries = timePoint.data[activeTab]?.d as ReportEntry[];
  //         }
  //         activeRanks.forEach((rank) => {
  //           entry[`Rank ${rank}`] = findScoreForRank(rankEntries, rank);
  //         });
  //         return entry;
  //       });

  //   const startTime = data[0].time;
  //   const endTime = data[data.length - 1].time;
  //   const resets = getKSTResetTimestamps(startTime, endTime);

  //   const result = {
  //     chartData: data as any[],
  //     dataKeys: keys,
  //     resetTimestamps: resets as number[],
  //   };
  //   prevChartDataRef.current = result;
  //   return result;
  // }, [filteredDataPoints, activeTab, selectedRanks, isRaid, isChartVisible]);

  // 1. Component Top: Parse source data only once and cache date/time values.
  const processedTimelineData = useMemo(() => {
    if (!timelineData) return [];
    return timelineData.map((p) => {
      // Perform string parsing and 'new Date' only once here.
      const timeMs = new Date(p.time.replace(' ', 'T') + 'Z').getTime();
      const dayStr = formatDateToDayString(new Date(timeMs), raidInfos[0]);
      return { ...p, timeMs, dayStr };
    });
  }, [timelineData, raidInfos]);

  // 2. Extract date list (Fast)
  const distinctDays = useMemo(() => {
    const days = new Set<string>();
    processedTimelineData.forEach((p) => days.add(p.dayStr));
    return Array.from(days);
  }, [processedTimelineData]);

  // 3. Filtering optimization (Removed 'new Date' and 'indexOf')
  const filteredDataPoints = useMemo(() => {
    if (!isChartVisible && prevFilteredDataRef.current.length > 0) {
      return prevFilteredDataRef.current;
    }
    if (distinctDays.length === 0) return [];

    const startIndex = Math.max(0, Math.min(dateRangeIndex[0], distinctDays.length - 1));
    const endIndex = Math.max(0, Math.min(dateRangeIndex[1], distinctDays.length - 1));

    // Get start date and end date strings
    const startDayStr = distinctDays[startIndex];
    const endDayStr = distinctDays[endIndex];

    let isRecording = false;
    const result = processedTimelineData.filter((p) => {
      // Using a flag (isRecording) or simple comparison is much faster than indexOf.
      // Logic assuming dates are sorted:
      if (p.dayStr === startDayStr) isRecording = true;
      const shouldInclude = isRecording;
      if (p.dayStr === endDayStr) isRecording = false; // Include only up to this date
      return shouldInclude || p.dayStr === endDayStr;
    });

    prevFilteredDataRef.current = result;
    return result;
  }, [processedTimelineData, distinctDays, dateRangeIndex, isChartVisible]);

  // 4. Final chart data generation (Optimized O(N*M) -> O(N))
  const { chartData, dataKeys, resetTimestamps } = useMemo(() => {
    if (!isChartVisible && prevChartDataRef.current.chartData.length > 0) {
      return prevChartDataRef.current;
    }
    if (!filteredDataPoints || filteredDataPoints.length === 0) {
      return { chartData: [], dataKeys: [], resetTimestamps: [] };
    }

    const activeRanks = Array.from(selectedRanks);
    const keys = activeRanks.map((r) => `Rank ${r}`);

    const data = filteredDataPoints.map((timePoint) => {
      const entry: any = { time: timePoint.timeMs };

      // Extract target data
      let rankEntries: ReportEntry[] = [];
      if (isRaid) {
        rankEntries = timePoint.data.boss.d as ReportEntry[];
      } else {
        rankEntries = activeTab === 'total' ? (timePoint.data.total as ReportEntry[]) : (timePoint.data[activeTab]?.d as ReportEntry[]);
      }

      // [Core Optimization] Eliminated .find() and find all necessary rank scores in a single loop.
      const ranksToFind = new Set(activeRanks);
      const foundScores: Record<number, number> = {};
      let foundCount = 0;

      for (let i = 0; i < rankEntries?.length; i++) {
        const r = rankEntries[i].r;
        if (ranksToFind.has(r)) {
          foundScores[r] = rankEntries[i].s;
          foundCount++;
          // If all desired ranks are found, exit the loop immediately without completing all iterations (Early Exit).
          if (foundCount === activeRanks.length) break;
        }
      }

      // Map found scores to the entry
      activeRanks.forEach((rank) => {
        entry[`Rank ${rank}`] = foundScores[rank] || null;
      });

      return entry;
    });

    // Difficulty segment normalization:
    // Detect large upward jumps (difficulty transitions) and shift later segments
    // to remove the gap, while preserving the exact score scale (no stretch).
    keys.forEach((key) => {
      const rawValues = data.map((d) => d[key] as number | null);

      // Collect positive consecutive increases to find the "normal" range
      const positiveIncreases: number[] = [];
      for (let i = 1; i < rawValues.length; i++) {
        const prev = rawValues[i - 1];
        const curr = rawValues[i];
        if (prev !== null && curr !== null && curr > prev) {
          positiveIncreases.push(curr - prev);
        }
      }

      if (positiveIncreases.length >= 3) {
        const sorted = [...positiveIncreases].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        // IQR is robust to outliers: even if large jumps are included in the array,
        // q1/q3 stay anchored to the normal distribution of increases.
        const iqr = Math.max(q3 - q1, 1);
        const threshold = q3 + iqr * 15;

        let offset = 0;
        for (let i = 0; i < data.length; i++) {
          const rawVal = rawValues[i];
          // Store original score so the tooltip can display it
          data[i][`${key}_raw`] = rawVal;

          if (i > 0) {
            const prevRaw = rawValues[i - 1];
            if (prevRaw !== null && rawVal !== null && rawVal - prevRaw > threshold) {
              offset += rawVal - prevRaw;
            }
          }

          if (rawVal !== null) {
            data[i][key] = rawVal - offset;
          }
        }
      } else {
        // Not enough data to detect transitions — just copy raw as-is
        for (let i = 0; i < data.length; i++) {
          data[i][`${key}_raw`] = data[i][key];
        }
      }
    });

    const startTime = data[0].time;
    const endTime = data[data.length - 1].time;
    const resets = getKSTResetTimestamps(startTime, endTime);

    const result = { chartData: data, dataKeys: keys, resetTimestamps: resets };
    prevChartDataRef.current = result;
    return result;
  }, [filteredDataPoints, activeTab, selectedRanks, isRaid, isChartVisible]);

  const toggleRank = (rank: number) => {
    setSelectedRanks((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });
  };

  return (
    <div ref={chartContainerRef} className="w-full">
      {/* Header & Tabs */}
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex justify-between items-center border-b border-gray-200 dark:border-neutral-700 pb-3">
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
        </div>

        {/* Filters Container */}
        <div className="bg-gray-50 dark:bg-neutral-900/50 rounded-lg border border-gray-200 dark:border-neutral-700 p-3">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
            {/* 1. Date Slider */}
            <div className="flex-1 min-w-0">
              <DateRangeSlider distinctDays={distinctDays} />
            </div>

            {/* Divider */}
            <div className="hidden lg:block w-px bg-gray-300 dark:bg-neutral-700 self-stretch"></div>
            <div className="lg:hidden w-full h-px bg-gray-200 dark:bg-neutral-700"></div>

            {/* 2. Rank Selector */}
            <div className="flex-1 lg:flex-none lg:w-1/3 min-w-0">
              <RankSelector ranksToPlot={ranksToPlot} selectedRanks={selectedRanks} rankColorMap={rankColorMap} onToggleRank={toggleRank} />
            </div>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={600}>
        <ComposedChart margin={{ top: 20, right: 20, bottom: 20, left: 30 }}>
          <XAxis type="number" dataKey="time" fontSize={12} domain={['dataMin', 'dataMax']} tickFormatter={(timestamp: number) => formatDateToDayString(new Date(timestamp), raidInfos[0])} />
          <YAxis type="number" domain={['dataMin - 1000', 'dataMax + 1000']} tickFormatter={(s) => `${(s / 1e6).toFixed(2)}M`} width={30}>
            <Label value="Score" angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: '#888' }} />
          </YAxis>
          <Tooltip content={<CustomScoreTimelineTooltip raidInfos={raidInfos} rankColorMap={rankColorMap} />} cursor={{ fill: 'rgba(200, 200, 200, 0.1)' }} />
          <Legend />

          {/* Vertical Reset Lines */}
          {resetTimestamps.map((ts) => (
            <ReferenceLine key={ts} x={ts} stroke={isDark ? '#555' : '#ccc'} strokeDasharray="3 3" />
          ))}

          {dataKeys.map((key, i) => {
            const rankNum = parseInt(key.replace('Rank ', ''));
            const color = rankColorMap.get(rankNum) || '#888';
            return (
              <React.Fragment key={key}>
                <Line dataKey={key} data={chartData} name={key} dot={false} stroke={color} strokeWidth={2} connectNulls={true} isAnimationActive={false} />
                <Scatter dataKey={key} data={chartData} name={`${key} Points`} fill={color} shape="circle" legendType="none" isAnimationActive={false} />
              </React.Fragment>
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default React.memo(ScoreTimelineChart);
