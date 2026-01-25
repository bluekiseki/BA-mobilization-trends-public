// app/components/live/MaxScoreTimelineChart.tsx
import { LineChart, Line, XAxis, YAxis, Label, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { type FC, useEffect, useMemo, useState, useRef } from 'react';
import type { ERaidTimelinePoint, RaidTimelinePoint, TimelineData } from '~/types/livetype';
import { getDifficultyFromScoreAndBoss } from '~/components/Difficulty';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import { formatTimeToTimestamp } from '~/utils/time';
import type { GameServer, RaidInfo } from '~/types/data';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import type { ReportEntry } from '../dashboard/common';
import { type_translation, typecolor } from '../raidToString';
import { useTranslation } from 'react-i18next';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { formatDateToDayString } from './formatDateToDayString';
import { useIsDarkState } from '~/store/isDarkState';

import { DateRangeSlider } from './DateRangeSlider';
import { DifficultySelector } from './DifficultySelector';
import { useTierDashboardStore } from '~/store/tierDashboardStore';
import { getKSTResetTimestamps } from './getKSTResetTimestamps';

interface MaxScoreTimelineChartProps {
  isRaid: boolean;
  timelineData: TimelineData;
  raidInfos: RaidInfo[];
  server: GameServer;
}

// --- Helper Function: Find the highest score by difficulty level ---
const findMaxScoresByDifficulty = (rankEntries: ReportEntry[], raidInfo: RaidInfo, server: GameServer): Record<string, number> => {
  const maxScores: Record<string, number> = {};
  if (!rankEntries || rankEntries.length === 0) return maxScores;

  const sortedByRank = [...rankEntries].sort((a, b) => a.r - b.r);

  if (sortedByRank[0]?.r === 1) {
    const diff = getDifficultyFromScoreAndBoss(sortedByRank[0].s, server, raidInfo.Id);
    maxScores[diff] = sortedByRank[0].s;
  }

  for (let i = 1; i < sortedByRank.length; i++) {
    const prev = sortedByRank[i - 1];
    const curr = sortedByRank[i];

    const prevDiff = getDifficultyFromScoreAndBoss(prev.s, server, raidInfo.Id);
    const currDiff = getDifficultyFromScoreAndBoss(curr.s, server, raidInfo.Id);

    if (curr.r - prev.r === 1 && currDiff !== prevDiff) {
      if (!maxScores[currDiff]) {
        maxScores[currDiff] = curr.s;
      }
    }
  }
  return maxScores;
};

export const MaxScoreTimelineChart: FC<MaxScoreTimelineChartProps> = ({ isRaid, timelineData, raidInfos, server }) => {
  const { i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { isDark } = useIsDarkState();

  // Local State
  const [selectedBoss, setSelectedBoss] = useState<'boss1' | 'boss2' | 'boss3'>('boss1');
  const [axisType, setAxisType] = useState<'score' | 'time'>('time');

  // Store State
  const { selectedDiffs, setSelectedDiffs, dateRangeIndex } = useTierDashboardStore();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isChartVisible, setIsChartVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsChartVisible(entry.isIntersecting);
      },
      { rootMargin: '200px 0px' }, // Load starts before 200px near Viewport
    );

    if (chartContainerRef.current) {
      observer.observe(chartContainerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const distinctDays = useMemo(() => {
    if (!timelineData) return [];
    const days = new Set<string>();
    timelineData.forEach((p) => {
      const dayStr = formatDateToDayString(new Date(p.time.replace(' ', 'T') + 'Z'), raidInfos[0]);
      days.add(dayStr);
    });
    return Array.from(days);
  }, [timelineData, raidInfos]);

  const prevFilteredDataRef = useRef<any[]>([]);

  const filteredTimelineData = useMemo(() => {
    if (!isChartVisible && prevFilteredDataRef.current.length > 0) {
      return prevFilteredDataRef.current;
    }

    if (!timelineData || distinctDays.length === 0) return [];

    const startIndex = Math.max(0, Math.min(dateRangeIndex[0], distinctDays.length - 1));
    const endIndex = Math.max(0, Math.min(dateRangeIndex[1], distinctDays.length - 1));

    const result = timelineData.filter((p) => {
      const dayStr = formatDateToDayString(new Date(p.time.replace(' ', 'T') + 'Z'), raidInfos[0]);
      const dayIndex = distinctDays.indexOf(dayStr);
      return dayIndex >= startIndex && dayIndex <= endIndex;
    });

    prevFilteredDataRef.current = result;
    return result;
  }, [timelineData, distinctDays, dateRangeIndex, raidInfos, isChartVisible]);

  const prevDiffsRef = useRef<string[]>([]);

  const availableDifficulties = useMemo(() => {
    if (!isChartVisible && prevDiffsRef.current.length > 0) {
      return prevDiffsRef.current;
    }

    const difficulties = new Set<string>();
    const sourceData = filteredTimelineData.length > 0 ? filteredTimelineData : timelineData;

    if (!sourceData) return [];

    for (const timePoint of sourceData) {
      let bossData;
      if (isRaid) bossData = (timePoint as RaidTimelinePoint).data.boss.d as ReportEntry[];
      else bossData = (timePoint as ERaidTimelinePoint).data[selectedBoss]?.d as ReportEntry[];

      if (bossData) {
        for (const entry of bossData) {
          if (entry.r <= 2000) {
            difficulties.add(getDifficultyFromScoreAndBoss(entry.s, server, raidInfos[0].Id));
          }
        }
      }
    }

    const difficultyOrder = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore'];
    const result = difficultyOrder.filter((d) => difficulties.has(d));

    prevDiffsRef.current = result;
    return result;
  }, [filteredTimelineData, timelineData, selectedBoss, isRaid, server, raidInfos, isChartVisible]);

  useEffect(() => {
    if (!isChartVisible) return;
    const validSelection = selectedDiffs.filter((d) => availableDifficulties.includes(d));
    if (validSelection.length === 0 && availableDifficulties.length > 0) {
      setSelectedDiffs([availableDifficulties[0]]);
    }
  }, [availableDifficulties, setSelectedDiffs, selectedDiffs, isChartVisible]);

  const prevChartDataRef = useRef<{
    chartData: any[];
    resetTimestamps: number[];
  }>({ chartData: [], resetTimestamps: [] });

  const { chartData, resetTimestamps } = useMemo(() => {
    if (!isChartVisible && prevChartDataRef.current.chartData.length > 0) {
      return prevChartDataRef.current;
    }

    if (!filteredTimelineData || filteredTimelineData.length === 0) {
      return { chartData: [], resetTimestamps: [] };
    }

    const data = filteredTimelineData.map((timePoint) => {
      const entry: { time: number; [key: string]: number | null } = {
        time: new Date(timePoint.time.replace(' ', 'T') + 'Z').getTime(),
      };

      let bossData: ReportEntry[];
      if (isRaid) bossData = (timePoint as RaidTimelinePoint).data.boss.d as ReportEntry[];
      else bossData = (timePoint as ERaidTimelinePoint).data[selectedBoss]?.d as ReportEntry[];

      const currentRaidInfo = isRaid ? raidInfos[0] : raidInfos[Number(selectedBoss.slice(-1)) - 1];
      const maxScores = findMaxScoresByDifficulty(bossData, currentRaidInfo, server);

      selectedDiffs.forEach((diff) => {
        if (availableDifficulties.includes(diff)) {
          entry[diff] = maxScores[diff] || null;
        }
      });

      return entry;
    });

    const startTime = data[0].time;
    const endTime = data[data.length - 1].time;
    const resets = getKSTResetTimestamps(startTime, endTime);

    const result = {
      chartData: data as any[],
      resetTimestamps: resets as number[],
    };
    prevChartDataRef.current = result; // Caching Results
    return result;
  }, [filteredTimelineData, selectedBoss, selectedDiffs, availableDifficulties, isRaid, raidInfos, server, isChartVisible]);

  return (
    <div ref={chartContainerRef} className="w-full">
      {/* Top Controller Area */}
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex flex-wrap justify-between items-center border-b border-gray-200 dark:border-neutral-700 pb-3 gap-2">
          <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-neutral-700 p-1">
            {raidInfos.length > 1 &&
              raidInfos.map((info, i) => (
                <button
                  key={`boss${i + 1}`}
                  onClick={() => setSelectedBoss(`boss${i + 1}` as any)}
                  className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${selectedBoss === `boss${i + 1}` ? 'bg-white dark:bg-neutral-900 shadow-sm opacity-100' : 'opacity-60'}`}
                  style={{
                    backgroundColor: info.Type ? typecolor[info.Type] : undefined,
                    color: info.Type ? 'white' : undefined,
                  }}
                >
                  {type_translation[info.Type ?? 'LightArmor'][getLocaleShortName(locale)]}
                </button>
              ))}
            {isRaid && <span className="px-3 py-1 text-sm font-semibold text-gray-500">Single Boss</span>}
          </div>

          <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-neutral-700 p-1 ml-auto">
            <button
              onClick={() => setAxisType('score')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${axisType === 'score' ? 'bg-white dark:bg-neutral-900 shadow-sm' : ''}`}
            >
              Score
            </button>
            <button
              onClick={() => setAxisType('time')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${axisType === 'time' ? 'bg-white dark:bg-neutral-900 shadow-sm' : ''}`}
            >
              Time
            </button>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-neutral-900/50 rounded-lg border border-gray-200 dark:border-neutral-700 p-3">
          <div className="flex flex-col gap-4 lg:gap-8">
            <div className="flex-1 min-w-0">
              <DateRangeSlider distinctDays={distinctDays} />
            </div>
            <div className=" w-full h-px bg-gray-200 dark:bg-neutral-700"></div>
            <div className="flex-1 min-w-0">
              <DifficultySelector availableDifficulties={availableDifficulties} />
            </div>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={500}>
        <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <XAxis type="number" dataKey="time" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(ts) => formatDateToDayString(new Date(ts), raidInfos[0])} fontSize={12} />
          <YAxis
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(val) => (axisType === 'score' ? `${(val / 1e6).toFixed(1)}M` : formatTimeToTimestamp(val).split('.')[0])}
            reversed={axisType === 'time'}
            width={40}
            fontSize={12}
          >
            <Label value={axisType === 'score' ? 'Max Score' : 'Min Time'} angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: '#888' }} />
          </YAxis>

          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="p-2 bg-white/80 dark:bg-black/80 backdrop-blur-sm rounded-md border dark:border-neutral-700 text-sm">
                    <p className="font-bold mb-1">{label ? formatDateToDayString(new Date(label), raidInfos[0]) : label}</p>
                    {payload.map((p) => (
                      <p key={p.name} style={{ color: p.color }}>
                        <strong>{p.name}:</strong> {axisType === 'score' ? (p.value as number).toLocaleString() : formatTimeToTimestamp(p.value as number)}
                      </p>
                    ))}
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend />

          {resetTimestamps.map((ts) => (
            <ReferenceLine
              key={ts}
              x={ts}
              stroke={isDark ? '#555' : '#ccc'}
              strokeDasharray="3 3"
              label={{
                value: 'Day Change',
                position: 'insideTop',
                fontSize: 10,
                fill: '#888',
              }}
            />
          ))}

          {Array.from(selectedDiffs)
            .filter((d) => availableDifficulties.includes(d))
            .map((diff) => (
              <Line
                key={diff}
                type="monotone"
                dataKey={
                  axisType === 'score'
                    ? diff
                    : (entry) => {
                        const score = entry[diff];
                        const boss = isRaid ? raidInfos[0].Boss : raidInfos[Number(selectedBoss.slice(-1)) - 1].Boss;
                        const id = raidInfos[0].Id;
                        return score ? calculateTimeFromScore(score, boss, server, id) : null;
                      }
                }
                name={diff}
                stroke={DIFFICULTY_COLORS[diff]}
                strokeWidth={2}
                dot={{
                  r: 3,
                  fill: DIFFICULTY_COLORS[diff],
                  stroke: 'none',
                }}
                connectNulls={false}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
