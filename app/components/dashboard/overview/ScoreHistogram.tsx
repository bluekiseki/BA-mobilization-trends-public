// app/components/dashboard/ScoreHistogram.tsx

import React from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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
        <div className="bg-white/80 dark:bg-neutral-800/80">
          <p className="label font-bold">{t('tooltipTime', { time: labelStr.split('|')[1] })}</p>
          <p className="intro">{t('tooltipPlayers', { count: Number(payload[0].value ?? 0).toLocaleString() })}</p>
          <p className="desc">{t('tooltipDifficulty', { difficulty: dataPoint.difficulty })}</p>
          {/* <p>Score: to {calculateScoreFromTime((dataPoint.minTime || 0) / 100, dataPoint.difficulty).toLocaleString()}</p> */}
          <p>{t('scoreCondition', { score: calculateScoreFromTime((dataPoint.minTime || 0) / 100, dataPoint.difficulty).toLocaleString() })}</p>
          <p className="desc">
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
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="uniqueName"
          angle={-45}
          textAnchor="end"
          height={80}
          tickMargin={15}
          dy={15}
          interval="preserveStartEnd"
          allowDuplicatedCategory={true}
          // tickFormatter={(value, index) => data[index].name}
          tickFormatter={(value) => String(value).split('|')[1]}
          style={{
            fontSize: '10px',
          }}
        />
        <YAxis allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        {/* payload={legendPayload}  */}
        <Bar
          dataKey="count"
          name={t('playerCount')}
          shape={(props: BarShapeProps) => {
            const entry = props.payload as { difficulty?: DifficultyName };
            const fill = entry?.difficulty ? difficultyColors[entry.difficulty] || '#8884d8' : '#8884d8';
            return <rect x={props.x ?? 0} y={props.y ?? 0} width={props.width ?? 0} height={props.height ?? 0} fill={fill} />;
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ScoreHistogram;
