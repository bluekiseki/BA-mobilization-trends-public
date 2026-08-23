// app/components/gacha/PyroTimelineChart.tsx
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Legend, ReferenceLine } from 'recharts';
import { FaListUl, FaChevronDown, FaChevronUp, FaTimes, FaPlus } from 'react-icons/fa';
import { CustomNumberInput } from '../CustomInput';

interface LogEntry {
  i18nKey?: string;
  params?: Record<string, string | number>;
  title?: string;
  amount: number;
}

export interface ProbTimelinePoint {
  date: string;
  pyroxene: number;
  pyroxeneAvg: number;
  pyroxeneHigh: number;
  pyroxeneLow: number;
  pyroxeneWorst: number;
  maxCdf: number;
  logs: LogEntry[];
  /**
   * Each of pyroxeneHigh/Avg/Low/Worst, but with still-held ticket value folded in (balance as if any
   * unspent tickets were already refunded to pyroxene) — a same-colored paired line for each percentile.
   * Optional so callers without ticket data (e.g. the legacy planner) don't need to supply them.
   */
  pyroxeneHighWithTickets?: number;
  pyroxeneAvgWithTickets?: number;
  pyroxeneLowWithTickets?: number;
  pyroxeneWorstWithTickets?: number;
}

export interface CustomLineConfig {
  dataKey: string;
  name: string;
  color: string;
  strokeDasharray?: string;
  strokeWidth?: number;
}

export interface BannerStudentMarker {
  date: string;
  students: { id: number; name: string; portrait?: string }[];
}

interface Props {
  probTimeline: ProbTimelinePoint[];
  customLines?: CustomLineConfig[];
  customPercentiles?: number[];
  onAddCustomLine?: (val: number) => void;
  onRemoveCustomLine?: (val: number) => void;
  bannerMarkers?: BannerStudentMarker[];
}

const PORTRAIT_SIZE = 26;
const BADGE_R = 8;

function StudentMarkerLabel({ viewBox, students }: { viewBox?: { x?: number; y?: number }; students: BannerStudentMarker['students'] }) {
  const x = viewBox?.x ?? 0;
  const plotTop = viewBox?.y ?? 0;

  const first = students[0];
  const extra = students.length - 1;

  const cx = x;
  const cy = plotTop - PORTRAIT_SIZE / 2 - 6;
  const px = cx - PORTRAIT_SIZE / 2;
  const py = cy - PORTRAIT_SIZE / 2;
  const clipId = `clip-s-${first.id}`;

  const badgeCx = cx + PORTRAIT_SIZE / 2 - BADGE_R + 2;
  const badgeCy = cy + PORTRAIT_SIZE / 2 - BADGE_R + 2;

  const badgeBg = '#facc15';
  const badgeText = '#171717';

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={PORTRAIT_SIZE / 2} />
        </clipPath>
      </defs>
      {first.portrait ? (
        <image href={first.portrait} x={px} y={py} width={PORTRAIT_SIZE} height={PORTRAIT_SIZE} clipPath={`url(#${clipId})`} />
      ) : (
        <circle cx={cx} cy={cy} r={PORTRAIT_SIZE / 2} fill="#737373" fillOpacity={0.7} />
      )}
      {extra > 0 && (
        <g>
          <circle cx={badgeCx} cy={badgeCy} r={BADGE_R} fill={badgeBg} />
          <text x={badgeCx} y={badgeCy + 3.5} textAnchor="middle" fontSize={8} fill={badgeText} fontWeight="700">
            +{extra}
          </text>
        </g>
      )}
      <title>{students.map((s) => s.name).join(', ')}</title>
    </g>
  );
}

const off = 0.5;

// ---------------------------------------------------------------------------
// Main chart component
// ---------------------------------------------------------------------------
export default function PyroTimelineChart({ probTimeline, customLines = [], customPercentiles = [], onAddCustomLine, onRemoveCustomLine, bannerMarkers = [] }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.income' });
  const { t: t_ui } = useTranslation('ui');
  const { t: t_game } = useTranslation('game');
  const t_dynamic = t as (key: string, options?: Record<string, string | number> & { interpolation?: { escapeValue: boolean } }) => string;
  const [showDetails, setShowDetails] = useState(false);
  const [newPercentile, setNewPercentile] = useState<number | null>(null);
  // This stores excluded groups. Fixed daily income is hidden by default.
  const [excludedLogFilters, setExcludedLogFilters] = useState<Set<string>>(() => new Set(['log.fixed_daily']));

  const logDescription = (log: LogEntry) => {
    if (log.i18nKey === 'log.multifloor' && log.params?.name != null) return String(log.params.name);
    if (!log.i18nKey) return log.title ?? '';
    if (!log.params) return t_dynamic(log.i18nKey);
    // Date params (e.g. ticket expiry) shouldn't be HTML-escaped — never inserted via dangerouslySetInnerHTML.
    const hasDate = 'date' in log.params;
    const options: Record<string, string | number> & { interpolation?: { escapeValue: boolean } } = { ...log.params };
    if (hasDate) options.interpolation = { escapeValue: false };
    return t_dynamic(log.i18nKey, options);
  };
  const logGroup = (log: LogEntry) => {
    if (log.i18nKey === 'log.multifloor') return 'game:multifloor';
    if (log.i18nKey === 'log.raid' || log.i18nKey === 'log.elimination') return 'game:raidAndEraid';
    if (log.i18nKey === 'log.jfd') return 'game:jfd';
    if (log.i18nKey === 'log.event') return 'game:event';
    if (log.i18nKey === 'log.fixed_daily' || log.i18nKey === 'log.fixed_daily_sunday') return 'log.fixed_daily';
    if (log.i18nKey === 'log.mainstory' || log.i18nKey === 'log.ministory') return 'game:story';
    if (log.i18nKey === 'log.term_ticket_acquired' || log.i18nKey === 'log.term_ticket_acquired_expiry' || log.i18nKey === 'log.term_ticket_expired') return 'ticket';
    return log.i18nKey ?? `custom:${log.title ?? ''}`;
  };
  const logGroupName = (log: LogEntry) => {
    if (log.i18nKey === 'log.multifloor') return t_game('multifloor');
    if (log.i18nKey === 'log.raid' || log.i18nKey === 'log.elimination') return t_game('raidAndEraid');
    if (log.i18nKey === 'log.jfd') return t_game('jfd');
    if (log.i18nKey === 'log.event') return t_game('event');
    if (log.i18nKey === 'log.fixed_daily' || log.i18nKey === 'log.fixed_daily_sunday') return t('log.fixed_daily');
    if (log.i18nKey === 'log.mainstory' || log.i18nKey === 'log.ministory') return t_game('story');
    if (log.i18nKey === 'log.mainstory') return t('stats.items.mainstory');
    if (log.i18nKey === 'log.monthly_extra') return t('stats.items.monthly');
    if (log.i18nKey === 'log.ap_refresh') return t('stats.items.ap_refresh');
    if (log.i18nKey === 'log.term_ticket_acquired' || log.i18nKey === 'log.term_ticket_acquired_expiry' || log.i18nKey === 'log.term_ticket_expired') return t('settings.ticket_batches_title');
    return logDescription(log);
  };

  const logFilters = useMemo(() => {
    const totals = new Map<string, number>();
    probTimeline.forEach((point) => {
      point.logs.forEach((log) => {
        const group = logGroup(log);
        totals.set(group, (totals.get(group) ?? 0) + log.amount);
      });
    });
    return Array.from(totals, ([id, total]) => {
      const log = probTimeline.flatMap((point) => point.logs).find((entry) => logGroup(entry) === id);
      return { id, name: log ? logGroupName(log) : id, total };
    });
  }, [probTimeline, t_dynamic]);

  // Compact tooltip: each percentile line and its "+tickets" pair collapse into one row
  // ("12,345 + 1,200") instead of two — the old 8-row tooltip was too tall and repetitive.
  interface TooltipPayloadEntry {
    dataKey?: string | number | ((obj: never) => unknown);
    value?: unknown;
  }
  const percentileRows = [
    { key: 'pyroxeneHigh', label: t('chart.lucky'), color: '#60a5fa' },
    { key: 'pyroxeneAvg', label: t_ui('avg'), color: '#2563eb' },
    { key: 'pyroxeneLow', label: t('chart.unlucky'), color: '#94a3b8' },
    { key: 'pyroxeneWorst', label: t('chart.worst'), color: '#ef4444' },
  ] as const;
  const renderTooltip = ({ active, payload, label }: { active?: boolean; payload?: readonly TooltipPayloadEntry[]; label?: string | number }) => {
    if (!active || !payload?.length) return null;
    const valueOf = (key: string): number | undefined => {
      const entry = payload.find((p) => p.dataKey === key);
      return typeof entry?.value === 'number' ? entry.value : undefined;
    };
    const cdf = valueOf('maxCdf');

    return (
      <div
        style={{
          borderRadius: 12,
          fontSize: 12,
          backgroundColor: 'rgba(23, 23, 23, 0.9)',
          border: '1px solid #404040',
          color: '#fff',
          backdropFilter: 'blur(4px)',
          padding: '8px 12px',
        }}
      >
        {label != null && <div className="mb-1 text-[11px] font-bold text-neutral-300">{label}</div>}
        {cdf != null && (
          <div className="mb-1 opacity-80">
            {t('chart.survival_rate')}: {cdf.toFixed(1)}%
          </div>
        )}
        {percentileRows.map(({ key, label, color }) => {
          const base = valueOf(key);
          if (base == null) return null;
          const withTickets = valueOf(`${key}WithTickets`);
          const delta = withTickets != null ? Math.round(withTickets - base) : 0;
          return (
            <div key={key} style={{ color, padding: '1px 0' }}>
              {label}: {Math.round(base).toLocaleString()}
              {delta !== 0 ? ` + ${delta.toLocaleString()}` : ''}
            </div>
          );
        })}
        {customPercentiles.map((p) => {
          const val = valueOf(`custom_${p}`);
          if (val == null) return null;
          return (
            <div key={p} style={{ padding: '1px 0' }}>
              {t('chart.upper_x', { x: p })}: {Math.round(val).toLocaleString()}
            </div>
          );
        })}
        <div className="mt-1.5 pt-1.5 border-t border-white/10 text-[10px] opacity-60">{t('chart.footer_ticket_note')}</div>
      </div>
    );
  };

  const handleAddPercentile = () => {
    const val = newPercentile;
    if (val != null && val > 0 && val < 100) {
      onAddCustomLine?.(val);
      setNewPercentile(null);
    }
  };

  if (!probTimeline.length) return null;

  return (
    <div className="space-y-0">
      <div className="overflow-hidden transition-colors relative">
        {/* Custom probability line minimal UI: Placed at the top right of the chart in a very small, neutral tone without transparency */}
        <div className="absolute top-2 right-4 z-10 flex items-center gap-1.5">
          <div className="flex items-center gap-1 flex-wrap">
            {customPercentiles.map((p) => (
              <span
                key={p}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-[10px] font-medium text-neutral-400 dark:text-neutral-500"
              >
                {t('chart.upper_x', { x: p })}
                <button onClick={() => onRemoveCustomLine?.(p)} className="hover:text-red-400 transition-colors ml-0.5" title={t_ui('delete')}>
                  <FaTimes size={8} />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 rounded px-1.5 py-0.5 focus-within:border-blue-300 dark:focus-within:border-blue-700 transition-colors">
            <CustomNumberInput
              // type="number"
              min={0.1}
              max={99.9}
              step={0.1}
              value={newPercentile}
              onChange={(e) => setNewPercentile(e)}
              placeholder={t('chart.percentile_placeholder')}
              className="w-8 bg-transparent text-[10px] text-neutral-500 dark:text-neutral-400 placeholder:text-neutral-300 dark:placeholder:text-neutral-600 focus:outline-none text-center"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddPercentile();
              }}
            />
            <button onClick={handleAddPercentile} className="text-neutral-400 hover:text-blue-500 transition-colors" title={t('chart.add_btn_title')}>
              <FaPlus size={8} />
            </button>
          </div>
        </div>

        <div className="sm:px-4 px-0 p-4 h-100">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={probTimeline} margin={{ top: 42, right: 0, left: -30, bottom: 0 }} style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={off} stopColor="#2563eb" stopOpacity={0.1} />
                  <stop offset={off} stopColor="#ef4444" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-neutral-300 dark:text-neutral-700" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#a3a3a3' }} tickFormatter={(v: string) => v.slice(5).replace('-', '/')} minTickGap={30} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#a3a3a3' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} axisLine={false} />

              {/* Zero-balance line — rendered early (drawn behind the percentile lines), neutral gray. */}
              <ReferenceLine y={0} stroke="#737373" strokeWidth={1.5} label={{ value: '0', position: 'insideBottomLeft', fill: '#737373', fontSize: 10, fontWeight: 700 }} />

              <Tooltip content={renderTooltip} allowEscapeViewBox={{ x: false, y: true }} wrapperStyle={{ zIndex: 50 }} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: '11px', paddingTop: '10px', color: '#a3a3a3' }} />

              {/* Each percentile has paired "with tickets" line (same color, finer dash) */}
              <Line type="monotone" dataKey="pyroxeneHigh" stroke="#60a5fa" strokeWidth={1} dot={false} name={t('chart.upper_10')} />
              <Line
                type="monotone"
                dataKey="pyroxeneHighWithTickets"
                stroke="#60a5fa"
                strokeWidth={1}
                dot={false}
                strokeDasharray="1 2"
                name={`${t('chart.upper_10')} (+${t('chart.ticket_balance_name')})`}
              />
              <Line type="monotone" dataKey="pyroxeneAvg" stroke="#2563eb" strokeWidth={2} dot={false} name={t_ui('avg')} />
              <Line
                type="monotone"
                dataKey="pyroxeneAvgWithTickets"
                stroke="#2563eb"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="1 2"
                name={`${t_ui('avg')} (+${t('chart.ticket_balance_name')})`}
              />
              <Line type="monotone" dataKey="pyroxeneLow" stroke="#94a3b8" strokeWidth={1} dot={false} name={t('chart.lower_10')} />
              <Line
                type="monotone"
                dataKey="pyroxeneLowWithTickets"
                stroke="#94a3b8"
                strokeWidth={1}
                dot={false}
                strokeDasharray="1 2"
                name={`${t('chart.lower_10')} (+${t('chart.ticket_balance_name')})`}
              />
              <Line type="monotone" dataKey="pyroxeneWorst" stroke="#ef4444" strokeWidth={1} dot={false} name={t('chart.worst')} />
              <Line
                type="monotone"
                dataKey="pyroxeneWorstWithTickets"
                stroke="#ef4444"
                strokeWidth={1}
                dot={false}
                strokeDasharray="1 2"
                name={`${t('chart.worst')} (+${t('chart.ticket_balance_name')})`}
              />

              {/* Custom ratio line rendering */}
              {customLines.map((line) => (
                <Line
                  key={line.dataKey}
                  type="monotone"
                  dataKey={line.dataKey}
                  stroke={line.color}
                  strokeWidth={line.strokeWidth || 1}
                  dot={false}
                  strokeDasharray={line.strokeDasharray}
                  name={line.name}
                />
              ))}

              {/* Banner student markers */}
              {bannerMarkers.map((marker) => (
                <ReferenceLine key={marker.date} x={marker.date} stroke="#77e0ff" strokeWidth={1} strokeDasharray="4 3" label={<StudentMarkerLabel students={marker.students} />} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full px-4 py-3 flex items-center justify-center gap-2 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <FaListUl /> {showDetails ? t('chart.hide_details') : t('chart.show_details')}
            {showDetails ? <FaChevronUp /> : <FaChevronDown />}
          </button>

          {showDetails && (
            <div className="border-t border-neutral-100 dark:border-neutral-800">
              {logFilters.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => setExcludedLogFilters(new Set())}
                    className="shrink-0 rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-[10px] font-semibold text-neutral-500 transition-colors hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
                  >
                    {t_ui('all')}
                  </button>
                  {logFilters.map(({ id, name, total }) => (
                    <button
                      type="button"
                      key={name}
                      onClick={() =>
                        setExcludedLogFilters((current) => {
                          const next = new Set(current);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })
                      }
                      title={name}
                      className={`flex max-w-52 shrink-0 items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold transition-colors ${
                        !excludedLogFilters.has(id)
                          ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}
                    >
                      <span className="truncate">{name}</span>
                      <span
                        className={`hidden tabular-nums whitespace-nowrap md:inline ${total > 0 ? 'text-green-600 dark:text-green-400' : total < 0 ? 'text-red-500 dark:text-red-400' : 'text-neutral-400'}`}
                      >
                        {total > 0 ? '+' : ''}
                        {total.toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="max-h-80 overflow-y-auto custom-scrollbar">
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {probTimeline.map((pt, i, arr) => {
                    const prevAvg = i > 0 ? arr[i - 1].pyroxeneAvg : pt.pyroxeneAvg;
                    const netDelta = Math.round(pt.pyroxeneAvg - prevAvg);
                    const logs = pt.logs || [];
                    const filteredLogs = logs.filter((log) => !excludedLogFilters.has(logGroup(log)));
                    const hasLogs = filteredLogs.length > 0;
                    if (excludedLogFilters.size > 0 && !hasLogs) return null;
                    if (!hasLogs && Math.abs(netDelta) < 1 && i !== 0) return null;

                    const balance = Math.round(pt.pyroxeneAvg);
                    const dateLabel = pt.date.slice(5).replace('-', '/');

                    if (hasLogs) {
                      return (
                        <div key={pt.date} className="px-4 py-3 space-y-2">
                          {/* Date header row */}
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 tracking-wide">{dateLabel}</span>
                            {netDelta !== 0 && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                                  netDelta > 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                }`}
                              >
                                {netDelta > 0 ? '+' : ''}
                                {netDelta.toLocaleString()}
                              </span>
                            )}
                          </div>

                          {/* Log items */}
                          <div className="space-y-1 pl-1">
                            {filteredLogs.map((log, li) => {
                              const desc = logDescription(log);
                              const amtColor = log.amount > 0 ? 'text-green-600 dark:text-green-400' : log.amount < 0 ? 'text-red-500 dark:text-red-400' : 'text-neutral-400';
                              return (
                                <div key={li} className="flex items-baseline justify-between gap-3">
                                  <span className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-snug flex-1 min-w-0 truncate">{desc}</span>
                                  <span className={`text-[11px] font-semibold tabular-nums whitespace-nowrap shrink-0 ${amtColor}`}>
                                    {log.amount > 0 ? '+' : ''}
                                    {log.amount.toLocaleString()}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Balance footer */}
                          <div className="flex items-center justify-between pt-1.5 border-t border-neutral-100 dark:border-neutral-800">
                            <span className="text-[10px] text-neutral-400 dark:text-neutral-600 uppercase tracking-wider">{t('chart.table_balance')}</span>
                            <span className="text-xs font-bold tabular-nums text-neutral-800 dark:text-neutral-100">{balance.toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    }

                    /* No-log row: daily accumulation or start */
                    const isStart = i === 0;
                    return (
                      <div key={pt.date} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[11px] font-bold text-neutral-400 dark:text-neutral-600 shrink-0">{dateLabel}</span>
                          <span className="text-[11px] text-neutral-400 dark:text-neutral-500 italic truncate">{isStart ? t('chart.start_balance') : t('chart.daily_calc')}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {!isStart && netDelta !== 0 && (
                            <span className={`text-[11px] font-semibold tabular-nums ${netDelta > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                              {netDelta > 0 ? '+' : ''}
                              {netDelta.toLocaleString()}
                            </span>
                          )}
                          <span className="text-[11px] font-bold tabular-nums text-neutral-700 dark:text-neutral-300">{balance.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
