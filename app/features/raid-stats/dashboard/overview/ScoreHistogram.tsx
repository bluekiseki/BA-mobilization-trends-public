// app/components/dashboard/ScoreHistogram.tsx

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import type { TooltipContentProps, BarShapeProps } from 'recharts';
import type { DifficultyName } from '~/components/raid/Difficulty';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import { plotValues, yAxisConfig } from '../yScale';
import type { YScale } from '../yScale';
import ChartOptions from '../ChartOptions';
import StackedTick from '../StackedTick';
import { formatScoreInMillions, useXTickCount, X_AXIS_HEIGHT, xLabelLines } from '../xLabel';
import type { XLabelKind } from '../xLabel';
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
  const [yScale, setYScale] = useState<YScale>('linear');
  const [xLabels, setXLabels] = useState<ReadonlySet<XLabelKind>>(() => new Set<XLabelKind>(['score', 'time']));
  const tickCount = useXTickCount();
  const pointByName = useMemo(() => new Map(data.map((d) => [d.uniqueName, d])), [data]);

  const counts = useMemo(() => data.map((d) => d.count), [data]);
  const plotData = useMemo(() => {
    const plots = plotValues(counts, yScale);
    return data.map((d, i) => ({ ...d, plot: plots[i] }));
  }, [data, counts, yScale]);
  const yAxis = useMemo(() => yAxisConfig(counts, yScale), [counts, yScale]);

  // Each difficulty tier occupies a contiguous run of bars. Precompute group starts (for axis
  // labels) and boundaries (for divider lines) so that adjacent tiers plotted on the same axis
  // stay visually distinguishable, without crowding narrow tiers with too many labels.
  const { groupStartNames, dividerNames, tickNames } = useMemo(
    () =>
      computeDifficultyGroupTicks(
        data,
        (d) => d.difficulty,
        (d) => d.uniqueName,
        tickCount,
      ),
    [data, tickCount],
  );

  const getTickLines = (raw: string): string[] => {
    const point = pointByName.get(raw);
    const score = point ? formatScoreInMillions(calculateScoreFromTime((point.minTime || 0) / 100, point.difficulty)) : '';
    const difficulty = raw.split('|')[0] ?? '';
    return xLabelLines(xLabels, score, formatTimeTick(raw), groupStartNames.has(raw) ? t_raidInfo(difficulty, difficulty) : undefined);
  };

  const CustomTooltip = ({ active, payload, label }: Partial<TooltipContentProps<number, string>>) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload as HistogramDataPoint;
      const labelStr = String(label ?? '');
      return (
        <div className="bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm p-3 border dark:border-neutral-700 rounded-lg text-sm">
          <p className="font-bold mb-1">{t('tooltipTime', { time: labelStr.split('|')[1] })}</p>
          <p className="text-neutral-600 dark:text-neutral-300">{t('tooltipPlayers', { count: dataPoint.count.toLocaleString() })}</p>
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
    <div>
      <div className="flex flex-wrap items-center justify-end gap-1 px-4 sm:px-0 mb-1">
        <ChartOptions yScale={yScale} onYScaleChange={setYScale} xLabels={xLabels} onXLabelsChange={setXLabels} />
      </div>
      <ResponsiveContainer width="100%" height={500}>
        <BarChart data={plotData} barCategoryGap="8%" margin={{ top: 10, right: 10, left: 4, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="uniqueName" height={X_AXIS_HEIGHT} ticks={tickNames} interval={0} allowDuplicatedCategory={true} tick={(props) => <StackedTick {...props} getLines={getTickLines} />} />
          <YAxis allowDecimals={false} width={36} domain={yAxis.domain} ticks={yAxis.ticks} tickFormatter={yAxis.tickFormatter} />
          <Tooltip content={<CustomTooltip />} allowEscapeViewBox={{ x: false, y: true }} wrapperStyle={{ zIndex: 50 }} />
          <Bar
            dataKey="plot"
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
    </div>
  );
};

export default ScoreHistogram;
