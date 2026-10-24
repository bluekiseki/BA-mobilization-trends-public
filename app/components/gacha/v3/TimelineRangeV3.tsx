import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, CartesianGrid, ComposedChart, Label, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BannerStudentMarker, CustomLineConfig, ProbTimelinePoint } from './timelineTypes';

const criteria = [
  { label: 'P10', key: 'pyroxeneHigh', tickets: 'pyroxeneHighWithTickets' },
  { label: 'P50', median: true, key: 'pyroxeneAvg', tickets: 'pyroxeneAvgWithTickets' },
  { label: 'P90', key: 'pyroxeneLow', tickets: 'pyroxeneLowWithTickets' },
  { label: 'P99.5', key: 'pyroxeneWorst', tickets: 'pyroxeneWorstWithTickets' },
] as const;

interface MarkerLabelProps {
  marker: BannerStudentMarker;
  lane: number;
  viewBox?: { x?: number };
}

function MarkerLabel({ marker, lane, viewBox }: MarkerLabelProps) {
  const x = viewBox?.x ?? 0;
  const visibleStudents = marker.students.slice(0, 3);
  const label = `${marker.date} · ${marker.students.map((student) => student.name).join(' · ')}`;
  return (
    <g transform={`translate(${x}, ${lane === 0 ? 6 : 36})`} className="v3-banner-marker">
      <title>{label}</title>
      {visibleStudents.map((student, index) => {
        const offset = index * 17 - ((visibleStudents.length - 1) * 17) / 2;
        const clipId = `v3-marker-${marker.date}-${student.id}`;
        return student.portrait ? (
          <g key={student.id}>
            <defs>
              <clipPath id={clipId}>
                <circle cx={offset} cy={12} r={12} />
              </clipPath>
            </defs>
            <image href={student.portrait} x={offset - 12} y={0} width={24} height={24} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
            <circle cx={offset} cy={12} r={12} fill="none" stroke="var(--v3-ticket)" />
          </g>
        ) : (
          <g key={student.id} transform={`translate(${offset}, 12)`}>
            <circle r={12} fill="var(--color-neutral-200)" stroke="var(--v3-ticket)" />
            <text textAnchor="middle" dominantBaseline="central" fontSize={8} fontWeight={700} fill="var(--color-neutral-800)">
              {student.name.slice(0, 2)}
            </text>
          </g>
        );
      })}
      {marker.students.length > 3 && (
        <text x={27} y={20} fontSize={9} fontWeight={700} fill="var(--v3-ticket)">
          +{marker.students.length - 3}
        </text>
      )}
    </g>
  );
}

interface EndLabelProps {
  label: string;
  dy: number;
  color?: string;
  viewBox?: { x?: number; y?: number; cx?: number; cy?: number };
}

function EndLabel({ label, dy, color = 'var(--v3-cash)', viewBox }: EndLabelProps) {
  const x = viewBox?.cx ?? viewBox?.x ?? 0;
  const y = viewBox?.cy ?? viewBox?.y ?? 0;
  return (
    <g aria-hidden="true">
      <path d={`M ${x + 2} ${y} L ${x + 9} ${y + dy}`} fill="none" stroke={color} strokeWidth={0.8} />
      <text x={x + 12} y={y + dy} dominantBaseline="central" fill={color} fontSize={11} fontWeight={700}>
        {label}
      </text>
    </g>
  );
}

export function timelineRangesV3(points: ProbTimelinePoint[]) {
  return points.map((point) => ({ ...point, cashRange: [point.pyroxeneLow, point.pyroxeneHigh] }));
}

function Values({ point, customLines, hasResults }: { point: ProbTimelinePoint; customLines: CustomLineConfig[]; hasResults: boolean }) {
  const { t: tp } = useTranslation('planner');
  const { t: tGame } = useTranslation('game');
  const customValue = (key: string): unknown => Reflect.get(point, key);
  return (
    <table className="w-full text-right text-xs tabular-nums">
      <thead>
        <tr className="text-neutral-600 dark:text-neutral-400">
          <th className="py-1 text-left font-normal">{tp('gacha.v3.range.criteria')}</th>
          <th className="py-1 font-normal">{tGame('pyroxene')}</th>
          <th className="py-1 font-normal">{tp('gacha.v3.range.with_tickets')}</th>
        </tr>
      </thead>
      <tbody>
        {(hasResults ? criteria : criteria.slice(1, 2)).map((row, index) => (
          <tr key={row.key}>
            <th className="py-1 text-left font-medium">
              <span className="inline-flex items-center gap-2">
                <span className="grid w-6 gap-1" aria-hidden="true">
                  <span style={{ borderTop: `${index === 1 ? 3 : index === 3 ? 2 : 1}px solid var(--v3-cash)` }} />
                  <span style={{ borderTop: `${index === 1 ? 3 : index === 3 ? 2 : 1}px dashed var(--v3-ticket)` }} />
                </span>
                {'median' in row ? `${row.label} · ${tp('gacha.v3.range.median')}` : row.label}
              </span>
            </th>
            <td>{Math.round(point[row.key]).toLocaleString()}</td>
            <td>{Math.round(point[row.tickets] ?? point[row.key]).toLocaleString()}</td>
          </tr>
        ))}
        {customLines.map((line) => (
          <tr key={line.dataKey}>
            <th className="py-1 text-left font-medium">{line.name}</th>
            <td>{typeof customValue(line.dataKey) === 'number' ? Math.round(Number(customValue(line.dataKey))).toLocaleString() : '—'}</td>
            <td>—</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function TimelineRangeV3({
  points,
  customLines,
  markers,
  hasResults,
}: {
  points: ProbTimelinePoint[];
  customLines: CustomLineConfig[];
  markers: BannerStudentMarker[];
  hasResults: boolean;
}) {
  const { t: tp } = useTranslation('planner');
  const { t: tGame } = useTranslation('game');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !chartRef.current?.contains(event.target)) {
        setActiveIndex(null);
        setLocked(false);
      }
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  const data = useMemo(() => timelineRangesV3(points), [points]);
  const minimumBalance = useMemo(() => Math.min(0, ...points.map((point) => Math.min(point.pyroxeneWorst, point.pyroxeneWorstWithTickets ?? point.pyroxeneWorst))), [points]);
  const positionedMarkers = useMemo(() => {
    const pointIndex = new Map(points.map((point, index) => [point.date, index]));
    return [...markers]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((marker, index, sorted) => {
        const previous = sorted[index - 1];
        const distance = previous ? Math.abs((pointIndex.get(marker.date) ?? 0) - (pointIndex.get(previous.date) ?? 0)) : Number.POSITIVE_INFINITY;
        return { marker, lane: distance <= 8 ? index % 2 : 0 };
      });
  }, [markers, points]);
  // End-of-chart callout labels for the fixed P10/50/90/99.5 lines plus any custom percentile lines — sorted
  // by their actual end value so stacked labels never land on the same slot regardless of how many there are.
  const endLabels = useMemo(() => {
    const lastPoint = points.at(-1);
    if (!lastPoint || !hasResults) return [];
    const items = [
      ...criteria.map((row) => ({ key: row.key, label: row.label, color: 'var(--v3-cash)', value: lastPoint[row.key] })),
      ...customLines.map((line) => {
        const value: unknown = Reflect.get(lastPoint, line.dataKey);
        return { key: line.dataKey, label: line.dataKey.replace('custom_', 'P'), color: line.color, value };
      }),
    ].filter((item): item is typeof item & { value: number } => typeof item.value === 'number');
    items.sort((a, b) => b.value - a.value);
    const spacing = 13;
    const mid = (items.length - 1) / 2;
    return items.map((item, index) => ({ ...item, dy: Math.round((index - mid) * spacing) }));
  }, [points, hasResults, customLines]);
  if (!points.length) return null;
  const selected = activeIndex === null ? null : points[Math.min(activeIndex, points.length - 1)];
  return (
    <div className="space-y-3">
      <div
        ref={chartRef}
        className="v3-timeline-graph relative"
        role="group"
        tabIndex={0}
        aria-label={tp('gacha.v3.range.chart_aria')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setActiveIndex(null);
            setLocked(false);
            return;
          }
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          setLocked(true);
          setActiveIndex((index) =>
            event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (index ?? 0) + (event.key === 'ArrowLeft' ? -1 : 1))),
          );
        }}
      >
        {selected && (
          <div className="v3-chart-tooltip" role="status">
            <p className="mb-1 text-xs">{tp('gacha.v3.range.tooltip_head', { date: selected.date, rate: selected.maxCdf.toFixed(1) })}</p>
            <Values point={selected} customLines={customLines} hasResults={hasResults} />
            {positionedMarkers
              .filter(({ marker }) => marker.date === selected.date)
              .map(({ marker }) => (
                <p key={marker.date} className="mt-2 text-xs">
                  {marker.date} · {marker.students.map((student) => student.name).join(' · ')}
                </p>
              ))}
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 66, right: hasResults ? 48 : 8, left: 0, bottom: 0 }}
            accessibilityLayer={false}
            onMouseMove={(state) => {
              if (!locked && typeof state.activeLabel === 'string') {
                const index = points.findIndex((point) => point.date === state.activeLabel);
                if (index >= 0) setActiveIndex(index);
              }
            }}
            onMouseLeave={() => {
              if (!locked) setActiveIndex(null);
            }}
            onClick={(state) => {
              if (typeof state.activeLabel === 'string') {
                const index = points.findIndex((point) => point.date === state.activeLabel);
                if (index >= 0) {
                  setActiveIndex(index);
                  setLocked(true);
                }
              }
            }}
          >
            <Tooltip content={() => null} />
            <CartesianGrid vertical={false} stroke="currentColor" className="text-neutral-200 dark:text-neutral-700" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5).replace('-', '/')} minTickGap={36} tick={{ fontSize: 12, fill: 'var(--v3-muted)' }} axisLine={false} />
            <YAxis
              width={46}
              domain={[(value: number) => Math.min(0, value), 'auto']}
              tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
              tick={{ fontSize: 12, fill: 'var(--v3-muted)' }}
              axisLine={false}
            />
            {minimumBalance < 0 && <ReferenceArea y1={minimumBalance} y2={0} fill="#ef4444" fillOpacity={0.06} stroke="none" />}
            {hasResults && <Area type="linear" dataKey="cashRange" stroke="none" fill="var(--v3-cash)" fillOpacity={0.1} isAnimationActive={false} tooltipType="none" />}
            {hasResults && <Line type="linear" dataKey="pyroxeneHigh" stroke="var(--v3-cash)" strokeWidth={1} strokeOpacity={0.45} dot={false} isAnimationActive={false} />}
            <Line type="linear" dataKey="pyroxeneAvg" stroke="var(--v3-cash)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            {hasResults && <Line type="linear" dataKey="pyroxeneLow" stroke="var(--v3-cash)" strokeWidth={1} strokeOpacity={0.45} dot={false} isAnimationActive={false} />}
            {hasResults && <Line type="linear" dataKey="pyroxeneWorst" stroke="var(--v3-cash)" strokeWidth={1} strokeOpacity={0.7} strokeDasharray="2 3" dot={false} isAnimationActive={false} />}
            <Line type="linear" dataKey="pyroxeneAvgWithTickets" stroke="var(--v3-ticket)" strokeWidth={2.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            {hasResults &&
              customLines.map((line) => (
                <Line
                  key={line.dataKey}
                  type="linear"
                  dataKey={line.dataKey}
                  stroke={line.color}
                  strokeWidth={line.strokeWidth ?? 1.5}
                  strokeOpacity={0.85}
                  strokeDasharray={line.strokeDasharray ?? '4 3'}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            <ReferenceLine y={0} stroke="var(--v3-cash)" strokeWidth={1.5} />
            {positionedMarkers.map(({ marker, lane }) => (
              <ReferenceLine key={marker.date} x={marker.date} stroke="var(--v3-ticket)" strokeOpacity={0.5} strokeDasharray="2 4">
                <Label content={<MarkerLabel marker={marker} lane={lane} />} position="top" />
              </ReferenceLine>
            ))}
            {hasResults &&
              endLabels.map((item) => {
                const lastPoint = points.at(-1);
                if (!lastPoint) return null;
                return (
                  <ReferenceDot key={`end-${item.key}`} x={lastPoint.date} y={item.value} r={2.5} fill={item.color} stroke="none">
                    <Label content={<EndLabel label={item.label} dy={item.dy} color={item.color} />} position="right" />
                  </ReferenceDot>
                );
              })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
          <span className="w-7 border-t-2" style={{ borderColor: 'var(--v3-cash)' }} />
          {tp('gacha.v3.range.legend_solid', { label: tGame('pyroxene') })}
        </span>
        <span className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
          <span className="w-7 border-t-2 border-dashed" style={{ borderColor: 'var(--v3-ticket)' }} />
          {tp('gacha.v3.range.legend_dashed', { label: tp('gacha.v3.range.with_tickets') })}
        </span>
        {hasResults && (
          <span className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
            <span className="h-3 w-7" style={{ background: 'var(--v3-cash)', opacity: 0.12 }} />
            {tp('gacha.v3.range.legend_shade')}
          </span>
        )}
        {hasResults &&
          customLines.map((line) => (
            <span key={line.dataKey} className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
              <span className="w-7 border-t-2 border-dashed" style={{ borderColor: line.color }} />
              {line.name}
            </span>
          ))}
      </div>
    </div>
  );
}
