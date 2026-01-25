import { Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart } from 'recharts';
import { type FC, useCallback, useEffect, useMemo, useState } from 'react';
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
import React from 'react';

interface RankScatterChartProps {
  isRaid: boolean;
  lastData: LastData;
  raidInfos: RaidInfo[];
  server: GameServer;
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
  const [activeTab, setActiveTab] = useState<ChartTab>('total');
  const [axisType, setAxisType] = useState<'score' | 'time'>('score');
  const [visibleDifficulties, setVisibleDifficulties] = useState<Set<string>>(new Set());
  const { t, i18n } = useTranslation('liveDashboard');
  const locale = i18n.language as Locale;

  const TABS: { id: ChartTab; name: string }[] = useMemo(
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
    [raidInfos],
  );

  const SCORE_BRACKETS = useMemo(() => generateScoreBrackets(difficultyInfo), []);
  const isTotalChart = !isRaid && activeTab === 'total';

  const { chartData, customTicks, xDomain, legendPayload } = useMemo(() => {
    let rankData: ReportEntry[];
    let currentRaidInfo = raidInfos?.[0];
    if (isRaid) {
      const scoreMap = new Map<number, number>();
      const boss = (lastData.data as LastRaidData).boss;
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
            // originalTime:
            rank: point.r,
            difficulty: groupName,
          });
        }
        ticks.push({
          value: currentOffset,
          label: `${(minScore / 1e6).toFixed(1)}M`,
        });
        ticks.push({
          value: currentOffset + PANEL_WIDTH,
          label: `${(maxScore / 1e6).toFixed(1)}M`,
        });
        currentOffset += PANEL_WIDTH + PANEL_GAP;
      });

      const payload = (
        isTotalChart
          ? SCORE_BRACKETS.map((b) => ({
              value: b.name,
              color: b.fill,
              type: 'circle',
            }))
          : Object.entries(DIFFICULTY_COLORS).map(([value, color]) => ({
              value,
              color,
              type: 'circle',
            }))
      ).filter((p) => groupedData[p.value]);
      return {
        chartData: remappedData,
        customTicks: ticks,
        xDomain: ['dataMin', 'dataMax'] as [any, any],
        legendPayload: payload,
      };
    } else {
      // axisType === 'time'
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
      return {
        chartData: timeData,
        customTicks: undefined,
        xDomain: ['dataMin', 'dataMax'] as [any, any],
        legendPayload: payload,
      };
    }
  }, [lastData, activeTab, axisType, server, raidInfos, SCORE_BRACKETS]);

  useEffect(() => {
    setVisibleDifficulties(new Set(legendPayload.map((p) => p.value)));
  }, [legendPayload]);

  useEffect(() => {
    if (!isRaid && activeTab === 'total') setAxisType('score');
  }, [activeTab]);

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
        const initialEntry: any = {
          rank: point.rank,
          originalScores: {},
          originalTimes: {},
        };
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
            <div
              style={{
                width: 8,
                height: 8,
                backgroundColor: p.color,
                borderRadius: '50%',
              }}
            />
            {p.value}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={500}>
        <ComposedChart data={pivotedData} margin={{ top: 5, right: 20, bottom: 20, left: 20 }}>
          <XAxis type="number" dataKey="rank" reversed={true} tickFormatter={(r) => r.toLocaleString()}></XAxis>
          <YAxis
            domain={xDomain}
            width={35}
            ticks={customTicks?.map((t) => t.value)}
            tickFormatter={(value, index) => {
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
                const hoveredSeries = payload[0];
                const dataKey = hoveredSeries.dataKey as string; // ex: "Torment"
                const fullDataPoint = hoveredSeries.payload; // All information of rank

                const originalScore = fullDataPoint.originalScores[dataKey] || '';
                const rank = fullDataPoint.rank;
                const id = raidInfos.find((r) => r.Id.toString())?.Id || '';
                const time = formatTimeToTimestamp(calculateTimeFromScore(originalScore, raidInfos[0].Boss || '', server, id) || 0);

                return (
                  <div className="p-2 bg-white/80 dark:bg-black/80 backdrop-blur-sm rounded-md border dark:border-neutral-700 text-sm">
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

          {legendPayload.map((p) => {
            if (!visibleDifficulties.has(p.value)) return null;
            return (
              <React.Fragment key={p.value}>
                <Line
                  dataKey={p.value}
                  stroke={p.color}
                  strokeWidth={2}
                  dot={false} // Dots are disabled because Scatter draws them
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Scatter dataKey={p.value} fill={p.color} shape="circle" isAnimationActive={false} />
              </React.Fragment>
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
};
