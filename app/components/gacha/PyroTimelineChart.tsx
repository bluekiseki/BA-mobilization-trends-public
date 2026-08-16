// app/components/gacha/PyroTimelineChart.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Legend, ReferenceLine } from 'recharts';
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
  const t_dynamic = t as (key: string, options?: Record<string, string | number>) => string;
  const [showDetails, setShowDetails] = useState(false);
  const [newPercentile, setNewPercentile] = useState<number | null>(null);

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
                <button onClick={() => onRemoveCustomLine?.(p)} className="hover:text-red-400 transition-colors ml-0.5" title={t('chart.remove_line')}>
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

        <div className="sm:px-4 px-0 p-4 h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={probTimeline} margin={{ top: 42, right: 0, left: -30, bottom: 0 }} style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={off} stopColor="#2563eb" stopOpacity={0.1} />
                  <stop offset={off} stopColor="#ef4444" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-neutral-100 dark:text-neutral-800" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#a3a3a3' }} tickFormatter={(v: string) => v.slice(5).replace('-', '/')} minTickGap={30} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#a3a3a3' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} axisLine={false} />

              <Tooltip
                contentStyle={{ borderRadius: '12px', fontSize: '12px', backgroundColor: 'rgba(23, 23, 23, 0.9)', borderColor: '#404040', color: '#fff', backdropFilter: 'blur(4px)' }}
                itemStyle={{ padding: '2px 0' }}
                formatter={(value, name) => {
                  if (typeof value !== 'number') return [value, name];
                  const valStr = Math.round(value).toLocaleString();

                  if (name === 'maxCdf') return [`${value.toFixed(1)}%`, t('chart.survival_rate')];

                  if (name === 'pyroxeneHigh') return [valStr, t('chart.lucky')];
                  if (name === 'pyroxeneLow') return [valStr, t('chart.unlucky')];
                  if (name === 'pyroxeneWorst') return [valStr, t('chart.worst')];
                  if (name === 'pyroxeneAvg') return [valStr, t('chart.avg_balance')];

                  if (name?.toString().startsWith('custom_')) return [valStr, t('chart.upper_x', { x: name?.toString().replace(/custom_/, '') })];

                  return [valStr, name];
                }}
              />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: '11px', paddingTop: '10px', color: '#a3a3a3' }} />

              <Area type="monotone" dataKey="pyroxeneHigh" stroke="none" fill="#3b82f6" fillOpacity={0.05} animationDuration={500} legendType="none" />
              <Area type="monotone" dataKey="pyroxeneLow" stroke="none" fill="transparent" animationDuration={500} legendType="none" />

              <Line type="monotone" dataKey="pyroxeneHigh" stroke="#60a5fa" strokeWidth={1} dot={false} strokeDasharray="4 4" name={t('chart.upper_10')} />
              <Line type="monotone" dataKey="pyroxeneAvg" stroke="#2563eb" strokeWidth={2} dot={false} name={t('chart.avg')} />
              <Line type="monotone" dataKey="pyroxeneLow" stroke="#94a3b8" strokeWidth={1} dot={false} name={t('chart.lower_10')} />
              <Line type="monotone" dataKey="pyroxeneWorst" stroke="#ef4444" strokeWidth={1} dot={false} strokeDasharray="2 2" name={t('chart.worst')} />

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
            <div className="max-h-80 overflow-y-auto custom-scrollbar border-t border-neutral-100 dark:border-neutral-800">
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {probTimeline.map((pt, i, arr) => {
                  const prevAvg = i > 0 ? arr[i - 1].pyroxeneAvg : pt.pyroxeneAvg;
                  const netDelta = Math.round(pt.pyroxeneAvg - prevAvg);
                  const logs = pt.logs || [];
                  const hasLogs = logs.length > 0;
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
                          {logs.map((log, li) => {
                            const desc = log.i18nKey ? (log.params ? t_dynamic(log.i18nKey, log.params) : t_dynamic(log.i18nKey)) : (log.title ?? '');
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
          )}
        </div>
      </div>
    </div>
  );
}
