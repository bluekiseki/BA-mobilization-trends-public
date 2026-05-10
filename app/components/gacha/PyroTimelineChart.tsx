// app/components/gacha/PyroTimelineChart.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Legend, ReferenceLine } from 'recharts';
import { FaListUl, FaChevronDown, FaChevronUp, FaTimes, FaPlus } from 'react-icons/fa';
import { CustomNumberInput } from '../CustomInput';

export interface ProbTimelinePoint {
  date: string;
  pyroxene: number;
  pyroxeneAvg: number;
  pyroxeneHigh: number;
  pyroxeneLow: number;
  pyroxeneWorst: number;
  maxCdf: number;
  logs: { i18nKey?: string; params?: any; title?: string; amount: number }[];
  [key: string]: any;
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
        <circle cx={cx} cy={cy} r={PORTRAIT_SIZE / 2} fill="#6366f1" fillOpacity={0.7} />
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
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 shadow-sm overflow-hidden transition-colors relative">
        {/* Custom probability line minimal UI: Placed at the top right of the chart in a very small, neutral tone without transparency */}
        <div className="absolute top-2 right-4 z-10 flex items-center gap-1.5">
          <div className="flex items-center gap-1 flex-wrap">
            {customPercentiles.map((p) => (
              <span
                key={p}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-neutral-800/80 border border-slate-200 dark:border-neutral-700 text-[10px] font-medium text-slate-400 dark:text-neutral-500 shadow-sm"
              >
                {t('chart.upper_x', { x: p })}
                <button onClick={() => onRemoveCustomLine?.(p)} className="hover:text-rose-400 transition-colors ml-0.5" title={t('chart.remove_line')}>
                  <FaTimes size={8} />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-slate-50 dark:bg-neutral-800/80 border border-slate-200 dark:border-neutral-700 rounded px-1.5 py-0.5 shadow-sm focus-within:border-blue-300 dark:focus-within:border-blue-700 transition-colors">
            <CustomNumberInput
              // type="number"
              min={0.1}
              max={99.9}
              step={0.1}
              value={newPercentile}
              onChange={(e) => setNewPercentile(e)}
              placeholder={t('chart.percentile_placeholder')}
              className="w-8 bg-transparent text-[10px] text-slate-500 dark:text-neutral-400 placeholder:text-slate-300 dark:placeholder:text-neutral-600 focus:outline-none text-center"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddPercentile();
              }}
            />
            <button onClick={handleAddPercentile} className="text-slate-400 hover:text-blue-500 transition-colors" title={t('chart.add_btn_title')}>
              <FaPlus size={8} />
            </button>
          </div>
        </div>

        <div className="p-4 h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={probTimeline} margin={{ top: 42, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={off} stopColor="#2563eb" stopOpacity={0.1} />
                  <stop offset={off} stopColor="#ef4444" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-neutral-800" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5).replace('-', '/')} minTickGap={30} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} axisLine={false} />

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
              <Legend iconType="plainline" wrapperStyle={{ fontSize: '11px', paddingTop: '10px', color: '#94a3b8' }} />

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

        <div className="border-t border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-800/30">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full px-4 py-3 flex items-center justify-center gap-2 text-xs font-bold text-slate-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <FaListUl /> {showDetails ? t('chart.hide_details') : t('chart.show_details')}
            {showDetails ? <FaChevronUp /> : <FaChevronDown />}
          </button>

          {showDetails && (
            <div className="max-h-64 overflow-y-auto custom-scrollbar border-t border-slate-100 dark:border-neutral-800">
              <table className="w-full text-xs text-left text-slate-600 dark:text-neutral-400">
                <thead className="bg-slate-100 dark:bg-neutral-800 sticky top-0 shadow-sm">
                  <tr>
                    <th className="px-4 py-2 w-24">{t('chart.table_date')}</th>
                    <th className="px-4 py-2">{t('chart.table_reason')}</th>
                    <th className="px-4 py-2 text-right w-24">{t('chart.table_delta')}</th>
                    <th className="px-4 py-2 text-right w-24">{t('chart.table_balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {probTimeline.map((pt, i, arr) => {
                    const prevAvg = i > 0 ? arr[i - 1].pyroxeneAvg : pt.pyroxeneAvg;
                    const delta = pt.pyroxeneAvg - prevAvg;
                    const logs = pt.logs || [];
                    const hasLogs = logs.length > 0;
                    const hasChange = Math.abs(delta) >= 1;
                    if (!hasChange && !hasLogs && i !== 0) return null;

                    return (
                      <tr key={pt.date} className="border-b border-slate-50 dark:border-neutral-800/50 hover:bg-white dark:hover:bg-neutral-800 transition-colors">
                        <td className="px-4 py-2 font-mono whitespace-nowrap">{pt.date}</td>
                        <td className="px-4 py-2">
                          {hasLogs ? (
                            <ul className="space-y-0.5">
                              {logs.map((log, idx) => (
                                <li key={idx} className="flex justify-between w-full max-w-[200px]">
                                  <span>{log.i18nKey ? t(log.i18nKey as any, log.params) : log.title}</span>
                                  <span className={log.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                                    {log.amount > 0 ? '+' : ''}
                                    {log.amount}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-slate-400 italic">{i === 0 ? t('chart.start_balance') : t('chart.daily_calc')}</span>
                          )}
                        </td>
                        <td className={`px-4 py-2 text-right font-bold ${delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-rose-500' : ''}`}>
                          {delta > 0 ? '+' : ''}
                          {Math.round(delta).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-slate-800 dark:text-neutral-200">{Math.round(pt.pyroxeneAvg).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
