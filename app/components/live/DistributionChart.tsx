import type { ReportEntry } from '../dashboard/common';

const calculateDistribution = (rankData: ReportEntry[]): { score: number; density: number }[] => {
  if (!rankData || rankData.length < 2) return [];
  const sortedData = [...rankData].sort((a, b) => a.s - b.s);
  const n = sortedData.length;

  const results: { score: number; density: number }[] = [{ score: sortedData[0].s, density: 0 }];

  for (let i = 0; i < n - 1; i++) {
    const p_i = sortedData[i];
    const p_i_plus_1 = sortedData[i + 1];

    const d_i = results[i].density;

    const rankDiff = p_i.r - p_i_plus_1.r;
    const scoreDiff = p_i_plus_1.s - p_i.s;

    let nextDensity: number;

    if (scoreDiff > 0) {
      const requiredAverageDensity = rankDiff / scoreDiff;

      nextDensity = 2 * requiredAverageDensity - d_i;
    } else {
      nextDensity = d_i;
    }

    results.push({
      score: p_i_plus_1.s,
      density: Math.max(0, nextDensity), //Math.max(0, nextDensity)
    });
  }

  if (results.length > 0) {
    results[results.length - 1].density = 0;
  }

  return results;
};

import { AreaChart, Area, XAxis, YAxis, Label, Tooltip, ResponsiveContainer } from 'recharts';
import { type FC, useMemo, useState } from 'react';
import { getDifficultyFromScoreAndBoss } from '~/components/raid/Difficulty';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import { formatTimeToTimestamp } from '~/utils/time';
import type { GameServer, RaidInfo } from '~/types/data';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';

interface DistributionPoint {
  score: number;
  density: number;
  time?: number;
}
interface DistributionChartProps {
  title: string;
  rankData: ReportEntry[];
  raidInfo: RaidInfo;
  server: GameServer;
}
interface RemappedDataPoint {
  displayValue: number;
  originalScore: number;
  originalTime?: number;
  density: number | null;
  difficulty: string;
}

export const DistributionChart: FC<DistributionChartProps> = ({ title, rankData, raidInfo, server }) => {
  const [axisType, setAxisType] = useState<'score' | 'time'>('score');

  const { chartData, customTicks } = useMemo(() => {
    const PANEL_WIDTH = 10000;
    const PANEL_GAP = 2000;

    // 1. Grouping data by difficulty and calculating time/distribution
    const distributionsByDifficulty: {
      difficulty: string;
      data: DistributionPoint[];
    }[] = [];
    const difficultyOrder = ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal'];
    difficultyOrder.forEach((diff) => {
      const entries = rankData.filter((e) => getDifficultyFromScoreAndBoss(e.s, server, raidInfo.Id) === diff);
      if (entries.length > 1) {
        const distData = calculateDistribution(entries);
        const dataWithTime = distData.map((point) => ({
          ...point,
          time: calculateTimeFromScore(point.score, raidInfo.Boss, server, raidInfo.Id),
        }));
        distributionsByDifficulty.push({
          difficulty: diff,
          data: dataWithTime,
        });
      }
    });

    // 2. Remapping Data to Virtual X-axis
    const remappedData: RemappedDataPoint[] = [];
    const ticks: { value: number; label: string }[] = [];
    let currentOffset = 0;

    // For time axes, display in order of low difficulty (longer time)
    const displayOrder = axisType === 'time' ? distributionsByDifficulty.slice().reverse() : distributionsByDifficulty;

    for (const { difficulty, data } of displayOrder) {
      const validData = axisType === 'time' ? data.filter((p) => p.time !== undefined) : data;
      if (validData.length < 2) continue;

      const values = validData.map((p) => (axisType === 'score' ? p.score : (p.time ?? 0)));
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      const range = maxVal - minVal;

      for (const point of validData) {
        const value = axisType === 'score' ? point.score : (point.time ?? 0);
        const normalized = range > 0 ? (value - minVal) / range : 0;
        const displayValue = normalized * PANEL_WIDTH + currentOffset;

        remappedData.push({
          displayValue,
          originalScore: point.score,
          originalTime: point.time,
          density: point.density,
          difficulty: difficulty,
        });
      }

      if (axisType === 'score') {
        ticks.push({
          value: currentOffset,
          label: `${(minVal / 1e6).toFixed(2)}M`,
        });
        ticks.push({
          value: currentOffset + PANEL_WIDTH,
          label: `${(maxVal / 1e6).toFixed(2)}M`,
        });
      } else {
        ticks.push({
          value: currentOffset,
          label: formatTimeToTimestamp(minVal),
        });
        ticks.push({
          value: currentOffset + PANEL_WIDTH,
          label: formatTimeToTimestamp(maxVal),
        });
      }

      currentOffset += PANEL_WIDTH + PANEL_GAP;
    }

    return {
      chartData: remappedData.sort((a, b) => a.displayValue - b.displayValue),
      customTicks: ticks,
    };
  }, [rankData, axisType, raidInfo, server]);

  return (
    <div className="p-4 bg-white dark:bg-neutral-800 rounded-xl shadow-lg">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg">{title}</h3>
        <div className="flex gap-1 rounded-lg bg-neutral-200 dark:bg-neutral-700 p-1 text-xs font-semibold">
          <button onClick={() => setAxisType('score')} className={`px-3 py-1 rounded-md transition-colors ${axisType === 'score' ? 'bg-white dark:bg-neutral-900 shadow-sm' : ''}`}>
            Score
          </button>
          <button onClick={() => setAxisType('time')} className={`px-3 py-1 rounded-md transition-colors ${axisType === 'time' ? 'bg-white dark:bg-neutral-900 shadow-sm' : ''}`}>
            Time
          </button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            {Object.entries(DIFFICULTY_COLORS).map(([diff, color]) => (
              <linearGradient key={diff} id={`grad-${diff}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.7} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <XAxis
            type="number"
            dataKey="displayValue"
            domain={['dataMin', 'dataMax']}
            ticks={customTicks.map((t) => t.value)}
            tickFormatter={(_value: number, index: number) => customTicks[index]?.label || ''}
            fontSize={10}
          />
          <YAxis width={80} tickFormatter={(d: number) => d.toExponential(1)}>
            <Label value="Density" angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: '#888' }} />
          </YAxis>
          <Tooltip
            labelFormatter={(_label: unknown, payload) => {
              const point = payload?.[0]?.payload as RemappedDataPoint | undefined;
              if (!point) return '';
              return axisType === 'score' ? `Score: ${point.originalScore.toLocaleString()}` : `Time: ${formatTimeToTimestamp(point.originalTime ?? 0)}`;
            }}
            formatter={(value: unknown) => {
              const numValue = Number(value ?? 0);
              return numValue ? numValue.toExponential(4) : '';
            }}
          />

          {Object.keys(DIFFICULTY_COLORS).map((diff) => (
            <Area
              key={diff}
              type="linear"
              dataKey={(entry: RemappedDataPoint) => (entry.difficulty === diff ? entry.density : null)}
              stroke={DIFFICULTY_COLORS[diff]}
              fill={`url(#grad-${diff})`}
              connectNulls={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
