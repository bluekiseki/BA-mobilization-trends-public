// app/components/dashboard/ScoreHistogram.tsx

import React from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { TooltipContentProps, BarShapeProps } from 'recharts';
import type { DifficultyName } from '~/components/raid/Difficulty';

const difficultyColors: { [key: string]: string } = {
  Lunatic: '#FF4500', // Orangered
  Torment: '#DC143C', // Crimson
  Insane: '#FFD700', // Gold
  Extreme: '#ADFF2F', // GreenYellow
  Hardcore: '#1E90FF', // DodgerBlue
  Veryhard: '#9370DB', // MediumPurple
  Hard: '#00CED1', // DarkTurquoise
  Normal: '#A9A9A9', // DarkGray
};

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

const ScoreHistogram: React.FC<ScoreHistogramProps> = ({ data, calculateScoreFromTime }) => {
  const { t } = useTranslation('dashboard');

  const CustomTooltip = ({ active, payload, label }: Partial<TooltipContentProps<number, string>>) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload as HistogramDataPoint;
      const labelStr = String(label ?? '');
      return (
        <div className="bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm p-3 border dark:border-neutral-700 rounded-lg text-sm">
          <p className="font-bold mb-1">{t('tooltipTime', { time: labelStr.split('|')[1] })}</p>
          <p className="text-neutral-600 dark:text-neutral-300">{t('tooltipPlayers', { count: Number(payload[0].value ?? 0).toLocaleString() })}</p>
          <p className="text-neutral-600 dark:text-neutral-300">{t('tooltipDifficulty', { difficulty: dataPoint.difficulty })}</p>
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

  const tickInterval = Math.max(0, Math.ceil(data.length / 10) - 1);

  return (
    <ResponsiveContainer width="100%" height={500}>
      <BarChart data={data} barCategoryGap={0} margin={{ top: 10, right: 10, left: 4, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="uniqueName"
          angle={-45}
          textAnchor="end"
          height={60}
          tickMargin={5}
          interval={tickInterval}
          allowDuplicatedCategory={true}
          tickFormatter={(value) => {
            const name = String(value).split('|')[1] ?? '';
            const start = name.startsWith('>') ? name : (name.split('-')[0] ?? name);
            return start.replace(/\.\d+$/, '');
          }}
          style={{ fontSize: '11px' }}
        />
        <YAxis allowDecimals={false} width={36} tickFormatter={(v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v))} />
        <Tooltip content={<CustomTooltip />} allowEscapeViewBox={{ x: true, y: true }} wrapperStyle={{ zIndex: 50 }} />
        <Bar
          dataKey="count"
          name={t('playerCount')}
          shape={(props: BarShapeProps) => {
            const entry = props.payload as { difficulty?: DifficultyName };
            const fill = entry?.difficulty ? difficultyColors[entry.difficulty] || '#8884d8' : '#8884d8';
            const x1 = Math.floor(props.x ?? 0);
            const x2 = Math.ceil((props.x ?? 0) + (props.width ?? 0));
            return <rect x={x1} y={Math.floor(props.y ?? 0)} width={x2 - x1} height={Math.ceil(props.height ?? 0)} fill={fill} />;
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ScoreHistogram;
