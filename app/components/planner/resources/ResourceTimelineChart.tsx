import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea } from 'recharts';
import type { ResourceBandPoint, TimelineAnnotation } from '~/utils/resourceTimeline';

// ---------------------------------------------------------------------------
// Source type metadata — i18n keys resolved by parent, colors used in chart
// ---------------------------------------------------------------------------

export interface SourceTypeMeta {
  color: string;
  i18nKey: string;
  /** English fallback shown when i18n key is not yet translated */
  fallback: string;
}

const SOURCE_TYPE_ENTRIES: { test: (s: string) => boolean; meta: SourceTypeMeta }[] = [
  {
    test: (s) => s.startsWith('gacha'),
    meta: { color: '#a78bfa', i18nKey: 'planner.resourceSource.gacha', fallback: 'Gacha' },
  },
  {
    test: (s) => s.startsWith('event'),
    meta: { color: '#4ade80', i18nKey: 'planner.resourceSource.event', fallback: 'Event reward' },
  },
  {
    test: (s) => s === 'growth_spend',
    meta: { color: '#f87171', i18nKey: 'planner.resourceSource.growthSpend', fallback: 'Growth spend' },
  },
  {
    test: (s) => s.includes('shop') || s.includes('exchange'),
    meta: { color: '#60a5fa', i18nKey: 'planner.resourceSource.purchase', fallback: 'Purchase / exchange' },
  },
  {
    test: (s) => s === 'hard_farm',
    meta: { color: '#4ade80', i18nKey: 'planner.resourceSource.hardFarm', fallback: 'Hard stage farm' },
  },
];

const FALLBACK_META: SourceTypeMeta = {
  color: '#f59e0b',
  i18nKey: 'planner.resourceSource.content',
  fallback: 'Content / farming',
};

export function getSourceMeta(source?: string): SourceTypeMeta {
  if (source) {
    for (const entry of SOURCE_TYPE_ENTRIES) {
      if (entry.test(source)) return entry.meta;
    }
  }
  return FALLBACK_META;
}

/** All distinct source type metas present in a set of annotations */
export function getDistinctSourceMetas(perDate: Record<string, TimelineAnnotation[]>): SourceTypeMeta[] {
  const seen = new Set<string>();
  const result: SourceTypeMeta[] = [];
  for (const evts of Object.values(perDate)) {
    for (const ev of evts) {
      const meta = getSourceMeta(ev.source);
      if (!seen.has(meta.i18nKey)) {
        seen.add(meta.i18nKey);
        result.push(meta);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------

interface Props {
  label: string;
  data: ResourceBandPoint[];
  weeklySpendLimit?: number;
  height?: number;
  annotations?: Record<string, TimelineAnnotation[]>;
  planningLine?: ResourceBandPoint[];
  planningLabel?: string;
  resolveItemLabel?: (key: string) => string;
}

function fmtDate(d: string): string {
  const [, m, day] = d.split('-');
  return `${m}/${day}`;
}

const WEEKS_PER_MONTH = 365 / 12 / 7;

export default function ResourceTimelineChart({ label, data, weeklySpendLimit, height = 280, annotations, planningLine, planningLabel, resolveItemLabel }: Props) {
  const { t } = useTranslation();

  if (!data.length) return null;

  const hasBand = data.some((p) => p.probabilistic || p.p10 !== p.p90);

  const drops = data.reduce<number[]>((acc, pt, i) => {
    if (i === 0) return acc;
    const diff = pt.p50 - data[i - 1].p50;
    if (diff < 0) acc.push(-diff);
    return acc;
  }, []);
  const largestDrop = drops.length ? Math.max(...drops) : 0;
  const weeklyRate = largestDrop / WEEKS_PER_MONTH;
  const limitExceeded = weeklySpendLimit !== undefined && weeklyRate > weeklySpendLimit;

  const planValues = planningLine?.map((p) => p.p50) ?? [];
  const minY = Math.min(...data.map((p) => p.p10), ...planValues);
  const maxY = Math.max(...data.map((p) => p.p90), ...planValues);
  const domainMax = Math.max(maxY * 1.05, 1);
  const hasNegative = minY < 0;

  const monthlyTicks: string[] = [];
  const seenTicks = new Set<string>();
  if (data[0]) {
    monthlyTicks.push(data[0].date);
    seenTicks.add(data[0].date);
  }
  for (const pt of data) {
    if (pt.date.slice(8) === '01' && !seenTicks.has(pt.date)) {
      monthlyTicks.push(pt.date);
      seenTicks.add(pt.date);
    }
  }

  const lineColor = limitExceeded ? '#ef4444' : hasNegative ? '#f59e0b' : '#60a5fa';
  const bandFill = limitExceeded ? '#ef4444' : hasNegative ? '#f59e0b' : '#3b82f6';

  // Merge planningLine into chartData as _planLine
  const planMap = planningLine ? new Map(planningLine.map((p) => [p.date, p.p50])) : null;

  // For fill-between-p10-and-p90: stacked areas where invisible base (0→p10) + visible band (p10→p90)
  const chartData = data.map((p) => ({
    ...p,
    ...(hasBand ? { _bandBase: p.p10, _bandSize: p.p90 - p.p10 } : {}),
    ...(planMap ? { _planLine: planMap.get(p.date) ?? p.p50 } : {}),
  }));

  // Auto-detect recurring sources: any source appearing on 2+ consecutive days → ReferenceArea.
  const recurringAreas: { source: string; color: string; start: string; end: string }[] = [];
  const recurringDateSet = new Set<string>(); // "source|date" pairs that belong to a consecutive run

  const chartStart = data[0]?.date ?? '';
  const chartEnd = data[data.length - 1]?.date ?? '';

  const sourceDates = new Map<string, string[]>();
  for (const [date, evts] of Object.entries(annotations ?? {})) {
    if (date < chartStart || date > chartEnd) continue;
    for (const a of evts) {
      const src = a.source ?? '__unknown__';
      const srcList = sourceDates.get(src) ?? [];
      srcList.push(date);
      sourceDates.set(src, srcList);
    }
  }

  for (const [src, dates] of sourceDates) {
    const sorted = [...new Set(dates)].sort();
    let runStart = sorted[0];
    let runEnd = sorted[0];
    let runLen = 1;

    const flushRun = () => {
      if (runLen < 3) return;
      const spansAll = runStart <= chartStart && runEnd >= chartEnd;
      const color = getSourceMeta(src === '__unknown__' ? undefined : src).color;
      let d = runStart;
      while (d <= runEnd) {
        recurringDateSet.add(`${src}|${d}`);
        const nd = new Date(d + 'T00:00:00Z');
        nd.setUTCDate(nd.getUTCDate() + 1);
        d = nd.toISOString().slice(0, 10);
      }
      if (!spansAll) recurringAreas.push({ source: src, color, start: runStart, end: runEnd });
    };

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const nextDay = new Date(prev + 'T00:00:00Z');
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const isConsec = nextDay.toISOString().slice(0, 10) === curr;
      if (!isConsec) {
        flushRun();
        runStart = curr;
        runEnd = curr;
        runLen = 1;
      } else {
        runEnd = curr;
        runLen++;
      }
    }
    flushRun();
  }

  // One-time events (not part of any consecutive run) → reference lines
  const annotationLines: { date: string; color: string; txt: string }[] = [];
  for (const [date, evts] of Object.entries(annotations ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const oneTime = evts.filter((a) => !recurringDateSet.has(`${a.source ?? '__unknown__'}|${date}`));
    if (oneTime.length > 0) {
      const net = oneTime.reduce((s, a) => s + a.delta, 0);
      if (net !== 0) {
        const dominant = oneTime.reduce((a, b) => (Math.abs(a.delta) >= Math.abs(b.delta) ? a : b));
        const color = getSourceMeta(dominant.source).color;
        const abs = Math.abs(net);
        const txt = abs >= 10000 ? `${net > 0 ? '+' : ''}${(net / 1000).toFixed(0)}k` : abs >= 1000 ? `${net > 0 ? '+' : ''}${(net / 1000).toFixed(1)}k` : `${net > 0 ? '+' : ''}${Math.round(net)}`;
        annotationLines.push({ date, color, txt });
      }
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-4">
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">{label}</span>
        {weeklySpendLimit !== undefined && largestDrop > 0 && (
          <span className={`text-[10px] font-mono tabular-nums ${limitExceeded ? 'text-red-500 dark:text-red-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
            ~{Math.round(weeklyRate).toLocaleString()}/wk
            {limitExceeded ? ` (limit ${weeklySpendLimit.toLocaleString()})` : ''}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 20, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
          <XAxis dataKey="date" type="category" ticks={monthlyTicks} tick={{ fontSize: 9, fill: 'currentColor' }} tickFormatter={fmtDate} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fontSize: 9, fill: 'currentColor' }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)))}
            domain={[hasNegative ? Math.floor(minY * 1.1) : 0, Math.ceil(domainMax)]}
          />
          <Tooltip
            content={({ active, label: tooltipLabel, payload }) => {
              if (!active || !payload?.length) return null;
              const annots = annotations?.[String(tooltipLabel)] ?? [];
              const bandNames: Record<string, string> = {
                p90: 'P90',
                p50: 'P50',
                p10: 'P10',
                ...(planningLabel ? { _planLine: planningLabel } : {}),
              };
              const filteredPayload = payload.filter((p) => !String(p.dataKey).startsWith('_band'));
              return (
                <div
                  style={{
                    background: 'rgba(23,23,23,0.95)',
                    border: '1px solid #404040',
                    borderRadius: 6,
                    padding: '6px 8px',
                    fontSize: 11,
                    color: '#fff',
                  }}
                >
                  <div style={{ color: '#a3a3a3', marginBottom: 4 }}>{String(tooltipLabel)}</div>
                  {filteredPayload.map((p) => {
                    const key = String(p.dataKey);
                    const name = bandNames[key] ?? key;
                    const isPlan = key === '_planLine';
                    return (
                      <div key={key} style={{ display: 'flex', gap: 8, justifyContent: 'space-between', fontWeight: isPlan ? 700 : 400 }}>
                        <span style={{ color: isPlan ? '#fff' : '#a3a3a3' }}>{name}</span>
                        <span style={{ fontFamily: 'monospace' }}>{Number(p.value).toLocaleString()}</span>
                      </div>
                    );
                  })}
                  {annots.length > 0 && (
                    <div style={{ borderTop: '1px solid #404040', marginTop: 4, paddingTop: 4 }}>
                      {annots.map((a, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, justifyContent: 'space-between', color: '#d4d4d4' }}>
                          <span style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.labelKey
                              ? a.labelKey.includes(':')
                                ? t(
                                    a.labelKey,
                                    a.labelParams && resolveItemLabel && typeof a.labelParams.itemKey === 'string'
                                      ? { ...a.labelParams, item: resolveItemLabel(a.labelParams.itemKey), itemKey: undefined }
                                      : a.labelParams,
                                  )
                                : (resolveItemLabel?.(a.labelKey) ?? a.labelKey)
                              : a.label}
                          </span>
                          <span style={{ fontFamily: 'monospace', flexShrink: 0 }}>
                            {a.delta >= 0 ? '+' : ''}
                            {Math.round(a.delta).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }}
          />
          {hasNegative && <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 2" strokeWidth={1.5} />}
          {/* Daily recurring income — shaded area per contiguous run */}
          {recurringAreas.map(({ source, color, start, end }) => (
            <ReferenceArea key={`${source}-${start}`} x1={start} x2={end} fill={color} fillOpacity={0.07} stroke={color} strokeOpacity={0.2} strokeWidth={0} />
          ))}
          {/* One-time event markers */}
          {annotationLines.map(({ date, color, txt }) => (
            <ReferenceLine
              key={date}
              x={date}
              stroke={color}
              strokeDasharray="3 2"
              strokeWidth={1.5}
              strokeOpacity={0.85}
              label={{ value: txt, position: 'insideTopRight', fontSize: 8, fill: color, angle: -90, offset: 7 }}
            />
          ))}
          {hasBand && (
            <>
              {/* invisible base: 0 → p10 (not filled) */}
              <Area type="stepAfter" dataKey="_bandBase" stackId="band" fill="none" stroke="none" dot={false} legendType="none" />
              {/* visible fill: p10 → p90 only */}
              <Area type="stepAfter" dataKey="_bandSize" stackId="band" fill={bandFill} fillOpacity={0.08} stroke="none" dot={false} legendType="none" />
              {/* stroke lines at p10 and p90 */}
              <Area type="stepAfter" dataKey="p90" fill="none" stroke={bandFill} strokeWidth={0.5} dot={false} legendType="none" />
              <Area type="stepAfter" dataKey="p10" fill="none" stroke={bandFill} strokeWidth={0.5} dot={false} legendType="none" />
            </>
          )}
          {/* p50 median: thin dashed reference when a planning line is active, otherwise the primary bold line */}
          <Area
            type="stepAfter"
            dataKey="p50"
            stroke={planMap ? bandFill : lineColor}
            strokeWidth={planMap ? 0.75 : 1.5}
            strokeDasharray={planMap ? '4 3' : undefined}
            fill={hasBand || planMap ? 'none' : lineColor}
            fillOpacity={hasBand || planMap ? 0 : 0.06}
            dot={false}
            legendType="none"
          />
          {/* Planning line at selected percentile — bold primary line */}
          {planMap && <Area type="stepAfter" dataKey="_planLine" stroke={lineColor} strokeWidth={1.5} fill="none" dot={false} legendType="none" />}
        </AreaChart>
      </ResponsiveContainer>
      {hasNegative && <p className="text-[10px] text-neutral-400 dark:text-neutral-500">Negative = balance shortfall; current inventory runs out before that date.</p>}
    </div>
  );
}
