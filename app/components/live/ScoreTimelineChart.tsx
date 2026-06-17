// app/components/live/ScoreTimelineChart.tsx

import { Scatter, XAxis, YAxis, Label, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line, ReferenceLine, type TooltipContentProps } from 'recharts';
import { type FC, useMemo, useState, useRef, useEffect } from 'react';
import type { /*ERaidTimelinePoint, RaidTimelinePoint,*/ TimelineData } from '~/types/livetype';
import type { ReportEntry } from '../dashboard/common';
import type { RaidInfo } from '~/types/data';
import { type_translation } from '../raid/raidToString';
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

interface ScorePayloadEntry {
  dataKey?: string;
  value?: number | null;
  payload?: Record<string, number>;
}

const CustomScoreTimelineTooltip = ({
  active,
  payload,
  label,
  raidInfos,
  rankColorMap,
}: Partial<TooltipContentProps<number, string>> & {
  raidInfos?: RaidInfo[];
  rankColorMap?: Map<number, string>;
}) => {
  if (active && payload && Array.isArray(payload) && label && raidInfos && rankColorMap) {
    const scoreMap = new Map<string, number>();
    payload.forEach((p) => {
      const entry = p as ScorePayloadEntry;
      if (entry.dataKey && entry.dataKey.startsWith('Rank ') && !entry.dataKey.endsWith('_raw') && entry.value !== null) {
        const rawValue = (entry.payload?.[`${entry.dataKey}_raw`] as number) ?? entry.value ?? 0;
        scoreMap.set(entry.dataKey, rawValue);
      }
    });
    const sortedEntries = Array.from(scoreMap.entries()).sort(([keyA], [keyB]) => {
      const rankA = parseInt(keyA.replace('Rank ', ''));
      const rankB = parseInt(keyB.replace('Rank ', ''));
      return rankA - rankB;
    });
    if (sortedEntries.length === 0) return null;
    return (
      <div className="p-2 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm rounded-md border border-neutral-300 dark:border-neutral-600 shadow-lg text-xs">
        <p className="font-bold mb-1 text-neutral-800 dark:text-neutral-200">{formatDateToDayString(new Date(label), raidInfos[0])}</p>
        {sortedEntries.map(([key, value]) => {
          const rankNum = parseInt(key.replace('Rank ', ''));
          const color = rankColorMap.get(rankNum) || '#8884d8';
          return (
            <div key={key} className="flex justify-between items-center gap-2">
              <span style={{ color }}>■ Rank {rankNum}</span>
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
      ([entry]: IntersectionObserverEntry[]) => {
        setIsChartVisible(entry.isIntersecting);
      },
      { rootMargin: '200px 0px' },
    );

    if (chartContainerRef.current) {
      observer.observe(chartContainerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  interface ProcessedPoint {
    timeMs: number;
    dayStr: string;
    time: string;
    data: Record<string, unknown>;
  }

  const prevFilteredDataRef = useRef<ProcessedPoint[]>([]);

  const prevChartDataRef = useRef<{
    chartData: Record<string, unknown>[];
    dataKeys: string[];
    resetTimestamps: number[];
    yDomain: [number, number] | ['auto', 'auto'];
    skipBoundaries: Array<{ threshold: number; cumOffset: number }>;
  }>({ chartData: [], dataKeys: [], resetTimestamps: [], yDomain: ['auto', 'auto'], skipBoundaries: [] });

  // 1. Component Top: Parse source data only once and cache date/time values.
  const processedTimelineData = useMemo((): ProcessedPoint[] => {
    if (!timelineData) return [];
    return timelineData.map((p) => {
      const timeMs = new Date(p.time.replace(' ', 'T') + 'Z').getTime();
      const dayStr = formatDateToDayString(new Date(timeMs), raidInfos[0]);
      return { ...p, timeMs, dayStr };
    });
  }, [timelineData, raidInfos]);

  // 2. Extract date list (Fest)
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
      // Using a flag (isRecording) or simple comparison is much fester than indexOf.
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
  const { chartData, dataKeys, resetTimestamps, yDomain, skipBoundaries } = useMemo(() => {
    if (!isChartVisible && prevChartDataRef.current.chartData.length > 0) {
      return prevChartDataRef.current;
    }
    if (!filteredDataPoints || filteredDataPoints.length === 0) {
      return { chartData: [], dataKeys: [], resetTimestamps: [], yDomain: ['auto', 'auto'] as ['auto', 'auto'], skipBoundaries: [] };
    }

    const activeRanks = Array.from(selectedRanks);
    const keys = activeRanks.map((r) => `Rank ${r}`);

    const data = filteredDataPoints.map((timePoint) => {
      const entry: Record<string, number | string | null> = { time: timePoint.timeMs };

      // Extract target data
      let rankEntries: ReportEntry[] = [];
      const pointData = timePoint.data as Record<string, { d?: ReportEntry[] } | ReportEntry[]>;
      if (isRaid) {
        rankEntries = (pointData.boss as { d?: ReportEntry[] })?.d ?? [];
      } else {
        rankEntries = activeTab === 'total' ? ((pointData.total as ReportEntry[]) ?? []) : ((pointData[activeTab] as { d?: ReportEntry[] })?.d ?? []);
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

    // Difficulty-tier normalization:
    // For each rank, collect all non-null values → sort into 1D array →
    // find tier boundaries (consecutive sorted values with >20% gap) →
    // apply value-based offset so the same score always maps to the same Y position.
    // keys.forEach((key) => {

    const sorted: number[] = [];
    for (const key of keys) {
      // console.log('keys',keys)20
      data.forEach((point) => {
        const v = point[key] as number | null;
        if (typeof v === 'number') sorted.push(v);
      });
    }
    // Build sorted 1D array of all non-null values for this rank

    sorted.sort((a, b) => a - b);

    // Detect skip (tier) boundaries from sorted distribution
    const skipBoundaries: Array<{ threshold: number; cumOffset: number }> = [];
    let cumOffset = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i - 1] > 0 && sorted[i] / sorted[i - 1] > 1.2) {
        cumOffset += sorted[i] - sorted[i - 1];
        skipBoundaries.push({ threshold: sorted[i], cumOffset });
      }
    }

    // console.log('skipBoundaries',skipBoundaries, sorted.length, data.length)

    // Apply value-based offset: same raw value → same offset → same Y height
    for (const key of keys) {
      data.forEach((point) => {
        const rawVal = point[key] as number | null;
        point[`${key}_raw`] = rawVal;
        if (typeof rawVal === 'number') {
          let offset = 0;
          for (const { threshold, cumOffset: co } of skipBoundaries) {
            if (rawVal >= threshold) offset = co;
            else break;
          }
          point[key] = rawVal - offset;
        }
      });
    }

    // Compute Y-axis domain from all normalized values across all selected ranks, skipping nulls.
    const allNormValues: number[] = [];
    data.forEach((point) => {
      keys.forEach((key) => {
        const v = point[key];
        if (typeof v === 'number') allNormValues.push(v);
      });
    });
    allNormValues.sort((a, b) => a - b);

    let computedYDomain: [number, number] | ['auto', 'auto'];
    if (allNormValues.length > 0) {
      const yMin = allNormValues[0];
      const yMax = allNormValues[allNormValues.length - 1];
      const yPad = (yMax - yMin) * 0.05 || 1000;
      computedYDomain = [yMin - yPad, yMax + yPad];
    } else {
      computedYDomain = ['auto', 'auto'];
    }

    const startTime = data[0].time as number;
    const endTime = data[data.length - 1].time as number;
    const resets = getKSTResetTimestamps(startTime, endTime);

    const result = { chartData: data, dataKeys: keys, resetTimestamps: resets, yDomain: computedYDomain, skipBoundaries };
    prevChartDataRef.current = result;
    return result;
  }, [filteredDataPoints, activeTab, selectedRanks, isRaid, isChartVisible]);

  const normToRaw = (n: number): number => {
    for (let k = skipBoundaries.length - 1; k >= 0; k--) {
      const { threshold, cumOffset } = skipBoundaries[k];
      if (n >= threshold - cumOffset) return n + cumOffset;
    }
    return n;
  };

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
        <div className="flex justify-between items-center border-b border-neutral-200 dark:border-neutral-700 pb-3">
          <nav className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600'}`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Filters Container */}
        <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-8">
            {/* 1. Date Slider */}
            <div className="flex-1 min-w-0">
              <DateRangeSlider distinctDays={distinctDays} />
            </div>

            {/* Divider */}
            <div className="hidden lg:block w-px bg-neutral-300 dark:bg-neutral-700 self-stretch"></div>
            <div className="lg:hidden w-full h-px bg-neutral-200 dark:bg-neutral-700"></div>

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
          <YAxis type="number" domain={yDomain} tickFormatter={(s: number) => `${(normToRaw(s) / 1e6).toFixed(2)}M`} width={30}>
            <Label value="Score" angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: '#888' }} />
          </YAxis>
          <Tooltip content={<CustomScoreTimelineTooltip raidInfos={raidInfos} rankColorMap={rankColorMap} />} cursor={{ fill: 'rgba(200, 200, 200, 0.1)' }} />
          <Legend
            content={() => (
              <div className="flex flex-wrap justify-center gap-4 mt-1 text-xs">
                {dataKeys.map((key) => {
                  const rankNum = parseInt(key.replace('Rank ', ''));
                  const color = rankColorMap.get(rankNum) ?? '#888';
                  return (
                    <div key={key} className="flex items-center gap-1">
                      <svg width="16" height="4">
                        <line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth="2" />
                      </svg>
                      <span className="text-neutral-700 dark:text-neutral-300">{key}</span>
                    </div>
                  );
                })}
              </div>
            )}
          />

          {/* Vertical Reset Lines */}
          {resetTimestamps.map((ts) => (
            <ReferenceLine key={ts} x={ts} stroke={isDark ? '#555' : '#ccc'} strokeDasharray="3 3" />
          ))}

          {dataKeys.map((key) => {
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
