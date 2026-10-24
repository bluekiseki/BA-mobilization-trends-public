// app/components/dashboard/ScoreHistogram.tsx

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import type { TooltipContentProps, BarShapeProps } from 'recharts';
import type { DifficultyName } from '~/components/raid/Difficulty';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import { computeDifficultyGroupTicks } from '~/features/raid-stats/dashboard/difficultyHistogramTicks';

export interface HistogramDataPoint {
  uniqueName: string;
  name: string; // X-axis label (e.g. "0:00-0:05")
  count: number;
  minTime: number | null; // Minimum time within the bucket
  difficulty: DifficultyName;
  cumulativeCount: number;
}

interface ScoreHistogramProps {
  data: HistogramDataPoint[];
  calculateScoreFromTime: (s: number, d: DifficultyName) => number;
}

const formatTimeTick = (uniqueName: string): string => {
  const name = uniqueName.split('|')[1] ?? '';
  const start = name.startsWith('>') ? name : (name.split('-')[0] ?? name);
  return start.replace(/\.\d+$/, '');
};

const ScoreHistogram: React.FC<ScoreHistogramProps> = ({ data, calculateScoreFromTime }) => {
  const { t } = useTranslation('dashboard');
  const { t: t_raidInfo } = useTranslation('raidInfo');

  // Each difficulty tier occupies a contiguous run of bars. Precompute group starts (for axis
  // labels) and boundaries (for divider lines) so that adjacent tiers plotted on the same axis
  // stay visually distinguishable, without crowding narrow tiers with too many labels.
  const { groupStartNames, dividerNames, tickNames } = useMemo(
    () =>
      computeDifficultyGroupTicks(
        data,
        (d) => d.difficulty,
        (d) => d.uniqueName,
        10,
      ),
    [data],
  );

  const CustomTooltip = ({ active, payload, label }: Partial<TooltipContentProps<number, string>>) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload as HistogramDataPoint;
      const labelStr = String(label ?? '');
      return (
        <div className="bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm p-3 border dark:border-neutral-700 rounded-lg text-sm">
          <p className="font-bold mb-1">{t('tooltipTime', { time: labelStr.split('|')[1] })}</p>
          <p className="text-neutral-600 dark:text-neutral-300">{t('tooltipPlayers', { count: Number(payload[0].value ?? 0).toLocaleString() })}</p>
          <p className="text-neutral-600 dark:text-neutral-300">{t('tooltipDifficulty', { difficulty: t_raidInfo(dataPoint.difficulty, dataPoint.difficulty) })}</p>
          <p className="text-neutral-600 dark:text-neutral-300">{t('scoreCondition', { score: calculateScoreFromTime((dataPoint.minTime || 0) / 100, dataPoint.difficulty).toLocaleString() })}</p>
          <p className="text-xs text-neutral-500 mt-1">
            {t('tooltipCumulativeRank', {
              rank: dataPoint.cumulativeCount.toLocaleString(),
            })}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={500}>
      <BarChart data={data} barCategoryGap="8%" margin={{ top: 10, right: 10, left: 4, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="uniqueName"
          angle={-45}
          textAnchor="end"
          height={60}
          tickMargin={5}
          ticks={tickNames}
          interval={0}
          allowDuplicatedCategory={true}
          tickFormatter={(value) => {
            const raw = String(value);
            const time = formatTimeTick(raw);
            if (groupStartNames.has(raw)) {
              const difficulty = raw.split('|')[0] ?? '';
              return `${t_raidInfo(difficulty, difficulty)} ${time}`;
            }
            return time;
          }}
          style={{ fontSize: '11px' }}
        />
        <YAxis allowDecimals={false} width={36} tickFormatter={(v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v))} />
        <Tooltip content={<CustomTooltip />} allowEscapeViewBox={{ x: false, y: true }} wrapperStyle={{ zIndex: 50 }} />
        <Bar
          dataKey="count"
          name={t('playerCount')}
          shape={(props: BarShapeProps) => {
            const entry = props.payload as { difficulty?: DifficultyName };
            const fill = entry?.difficulty ? DIFFICULTY_COLORS[entry.difficulty] || '#8884d8' : '#8884d8';
            return <rect x={props.x} y={props.y} width={props.width} height={props.height} fill={fill} />;
          }}
        />
        {/* Drawn after the bars so the tier boundary stays visible on top of them. */}
        {dividerNames.map((name) => (
          <ReferenceLine key={name} x={name} stroke="#9ca3af" strokeOpacity={0.8} strokeDasharray="4 4" />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ScoreHistogram;
