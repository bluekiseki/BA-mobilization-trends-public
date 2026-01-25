// app/components/dashboard/ScoreHistogram.tsx

import React from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

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
  difficulty: string;
  cumulativeCount: number;
}

interface ScoreHistogramProps {
  data: HistogramDataPoint[];
}

const ScoreHistogram: React.FC<ScoreHistogramProps> = ({ data }) => {
  const { t } = useTranslation('dashboard');

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-white/80 dark:bg-neutral-800/80">
          <p className="label font-bold">{t('tooltipTime', { time: label.split('|')[1] })}</p>
          <p className="intro">{t('tooltipPlayers', { count: payload[0].value.toLocaleString() })}</p>
          <p className="desc">{t('tooltipDifficulty', { difficulty: dataPoint.difficulty })}</p>
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
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="uniqueName"
          angle={-45}
          textAnchor="end"
          height={80}
          interval="preserveStartEnd"
          allowDuplicatedCategory={true}
          // tickFormatter={(value, index) => data[index].name}
          tickFormatter={(value, index) => value.split('|')[1]}
        />
        <YAxis allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        {/* payload={legendPayload}  */}
        <Bar dataKey="count" name={t('playerCount')}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={difficultyColors[entry.difficulty] || '#8884d8'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ScoreHistogram;
