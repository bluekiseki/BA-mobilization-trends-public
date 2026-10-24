// app/components/emblem/FavorTrendChart.tsx

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, usePlotArea, useYAxisScale, type TooltipContentProps } from 'recharts';
import { useIsDarkState } from '~/store/isDarkState';

export interface FavorTrendPoint {
  /** ISO date of the dataset, e.g. "2026-05-21" */
  date: string;
  /** Raid id of the dataset, e.g. "E33" */
  name: string;
  /** Short axis label, e.g. "2026-05 (E33)" */
  label: string;
  /** Absolute number of emblem settings for the selected key at this point */
  count: number;
  /** Share of all settings at this point, 0-100 */
  percentage: number;
}

export type FavorTrendMode = 'percent' | 'absolute';

export interface FavorTrendContextSeries {
  /** Display name — used as the accessible title / text fallback. */
  label: string;
  /** Portrait data URI shown on the right rail (falls back to a 3-char text tag). */
  iconUri?: string;
  points: FavorTrendPoint[];
}

interface FavorTrendChartProps {
  /** Primary (clicked) student/club/school series — interactive, drives the Y range. */
  series: FavorTrendPoint[];
  /** Nearby-rank series drawn as faint context lines with an icon on the right rail. */
  context?: FavorTrendContextSeries[];
  mode: FavorTrendMode;
}

type ChartRow = { label: string; date: string; name: string; primary: number } & Record<string, string | number>;

const LINE_COLOR = '#3b82f6'; // blue-500
const ICON = 18;
const RAIL_GAP = 4; // px between plot edge and the icon rail

const pickBy =
  (mode: FavorTrendMode) =>
  (p: FavorTrendPoint): number =>
    mode === 'percent' ? p.percentage : p.count;

const FavorTrendTooltip = ({ active, payload, mode }: Partial<TooltipContentProps<number, string>> & { mode: FavorTrendMode }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ChartRow | undefined;
  if (!point || typeof point.primary !== 'number') return null;
  return (
    <div className="p-2 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm rounded-md border border-neutral-300 dark:border-neutral-600 text-xs">
      <p className="font-bold mb-1 text-neutral-800 dark:text-neutral-200">
        {point.date} <span className="font-normal text-neutral-500 dark:text-neutral-400">({point.name})</span>
      </p>
      <div className="flex justify-between gap-3">
        <span className="text-neutral-500 dark:text-neutral-400">{mode === 'percent' ? '%' : '#'}</span>
        <span className="font-medium text-neutral-700 dark:text-neutral-300">{mode === 'percent' ? `${point.primary.toFixed(2)}%` : Math.round(point.primary).toLocaleString()}</span>
      </div>
    </div>
  );
};

// Renders the context student icons in the right margin, vertically aligned to where each
// line ends, de-overlapped, with a thin leader back to the plot edge. Sits outside the plot
// so it never covers the chart. Uses recharts hooks, so it must be a child of the chart.
function ContextIconRail({ context, mode, color }: { context: FavorTrendContextSeries[]; mode: FavorTrendMode; color: string }) {
  const scale = useYAxisScale();
  const plot = usePlotArea();
  if (!scale || !plot || context.length === 0) return null;

  const pick = pickBy(mode);
  const railX = plot.x + plot.width + RAIL_GAP;
  const top = plot.y + ICON / 2;
  const bottom = plot.y + plot.height - ICON / 2;

  const items = context
    .map((s) => {
      const last = [...s.points].reverse().find((p) => Number.isFinite(pick(p)));
      if (!last) return null;
      const yLine = Math.min(Math.max(Number(scale(pick(last))), top), bottom);
      return { s, yLine, y: yLine };
    })
    .filter((v): v is { s: FavorTrendContextSeries; yLine: number; y: number } => v != null)
    .sort((a, b) => a.yLine - b.yLine);

  // Resolve overlaps by pushing icons down, then shift the whole stack up if it overflows.
  for (let i = 1; i < items.length; i++) {
    const minY = items[i - 1].y + ICON + 2;
    if (items[i].y < minY) items[i].y = minY;
  }
  const overflow = items.length ? items[items.length - 1].y - bottom : 0;
  if (overflow > 0) items.forEach((it) => (it.y = Math.max(top, it.y - overflow)));

  return (
    <g>
      {items.map(({ s, yLine, y }, i) => {
        const cx = railX + ICON / 2;
        const clipId = `favorRail-${i}`;
        return (
          <g key={i}>
            <title>{s.label}</title>
            {Math.abs(y - yLine) > 1 && <path d={`M ${plot.x + plot.width} ${yLine} L ${railX} ${y}`} fill="none" stroke={color} strokeWidth={1} strokeDasharray="2 3" strokeOpacity={0.3} />}
            {s.iconUri ? (
              <>
                <clipPath id={clipId}>
                  <circle cx={cx} cy={y} r={ICON / 2} />
                </clipPath>
                <image href={s.iconUri} x={railX} y={y - ICON / 2} width={ICON} height={ICON} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
                <circle cx={cx} cy={y} r={ICON / 2} fill="none" stroke={color} strokeWidth={1} />
              </>
            ) : (
              <text x={railX} y={y} fontSize={9} fill={color} dominantBaseline="central">
                {s.label.slice(0, 3)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function FavorTrendChartImpl({ series, context = [], mode }: FavorTrendChartProps) {
  const { t: t_d } = useTranslation('dashboard');
  const { isDark } = useIsDarkState();

  if (series.length <= 1) {
    return <div className="py-8 text-center text-sm text-neutral-500">{t_d('noData')}</div>;
  }

  const axisColor = isDark ? '#a3a3a3' : '#525252'; // neutral-400 / neutral-600
  const gridColor = isDark ? '#404040' : '#e5e5e5'; // neutral-700 / neutral-200
  const contextColor = isDark ? '#6b7280' : '#9ca3af'; // neutral-500 / neutral-400

  const pick = pickBy(mode);
  const formatY = (v: number): string => (mode === 'percent' ? `${v.toFixed(1)}%` : Math.round(v).toLocaleString());

  // Y-axis is driven entirely by the primary series so its trend stays readable. Context
  // lines never affect the range; anything outside it is clipped (allowDataOverflow) and
  // its icon is pinned to the frame edge.
  const primaryValues = series.map(pick);
  const pMin = Math.min(...primaryValues);
  const pMax = Math.max(...primaryValues);
  const pRange = pMax - pMin || (mode === 'percent' ? 1 : 10);
  const pad = pRange * 0.12;
  const yDomain: [number, number] = [Math.max(0, pMin - pad), pMax + pad];

  const chartData: ChartRow[] = series.map((p, i) => {
    const row: ChartRow = { label: p.label, date: p.date, name: p.name, primary: pick(p) };
    context.forEach((s, ci) => {
      const cp = s.points[i];
      if (cp) row[`ctx${ci}`] = pick(cp);
    });
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: ICON + RAIL_GAP + 6, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} tickMargin={6} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: axisColor }} tickFormatter={formatY} domain={yDomain} width={48} allowDataOverflow allowDecimals={mode === 'percent'} />
        <Tooltip content={<FavorTrendTooltip mode={mode} />} cursor={{ stroke: gridColor }} wrapperStyle={{ zIndex: 50 }} />
        {context.map((_, ci) => (
          <Line
            key={`ctx${ci}`}
            dataKey={`ctx${ci}`}
            stroke={contextColor}
            strokeWidth={1}
            strokeOpacity={0.5}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls
            legendType="none"
          />
        ))}
        <Line dataKey="primary" stroke={LINE_COLOR} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
        <ContextIconRail context={context} mode={mode} color={contextColor} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export const FavorTrendChart = memo(FavorTrendChartImpl);
