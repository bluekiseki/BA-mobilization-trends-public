import { SheetIcon } from '~/components/common/SheetIcon';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiChevronDown, HiChevronRight } from 'react-icons/hi2';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BarShapeProps, TooltipContentProps } from 'recharts';
import type { VideoEntry } from './types';
import type { ReportStudentData } from '../../../../types/raidReport';
import type { GameServer, RaidInfo } from '~/types/data';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import { getBackgroundRatingColor, getStarValue } from '../../../../utils/raid/report';
import { useIsDarkState } from '~/store/isDarkState';
import { StarRating } from '~/components/student/StarRating';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import { formatTimeToTimestamp } from '~/utils/time';

const STUDENT_ROW_STEP = 20;
const UNKNOWN_KEY = '?';

// Parse a video "grade" string ("3★", "ue2", "") into a numeric level + UE flag.
function parseGrade(grade: string | null): { num: number; isUE: boolean } {
  if (!grade) return { num: 0, isUE: false };
  if (grade.startsWith('ue')) return { num: Number(grade.slice(2)), isUE: true };
  const m = grade.match(/^(\d+)/);
  return { num: m ? Number(m[1]) : Number(grade), isUE: false };
}

// Map a video student's grade string to a star bucket key. A plain 5★ is ambiguous
// (could be a mis-read UE), so it is folded into the unknown bucket along with missing data.
function gradeBucket(grade: string | null): string {
  if (!grade) return UNKNOWN_KEY;
  const { num, isUE } = parseGrade(grade);
  const star = getStarValue(isUE ? 0 : num, isUE ? num : 0);
  if (!Number.isFinite(star) || star <= 0 || star === 5) return UNKNOWN_KEY;
  return `${star}★`;
}

function bucketSortValue(key: string): number {
  return key === UNKNOWN_KEY ? 9999 : parseInt(key, 10);
}

function bucketColor(key: string, isDark: 'light' | 'dark' | null): string {
  if (key === UNKNOWN_KEY) return isDark === 'dark' ? '#525252' : '#d4d4d4'; // neutral-600 / neutral-300
  return getBackgroundRatingColor(parseInt(key, 10), isDark) || '#999';
}

interface HistBin {
  x0: number;
  x1: number;
  count: number;
  color: string;
}

interface StudentRow {
  id: number;
  total: number;
  counts: Record<string, number>;
}

const SegmentLabel = ({ x = 0, y = 0, width = 0, height = 0, value = 0 }: { x?: number; y?: number; width?: number; height?: number; value?: number }) => {
  if (!value || width < 20) return null;
  return (
    <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central" fill="white" fontWeight="bold" fontSize="9">
      {value}
    </text>
  );
};

const StudentStarBar: React.FC<{ row: StudentRow; xMax: number }> = ({ row, xMax }) => {
  const { isDark } = useIsDarkState();
  const { t: t_ui } = useTranslation('ui');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Recharts can miss its own mouse-leave, leaving tooltips stuck open; the row wrapper's pointer events are the source of truth.
  const [hovering, setHovering] = useState(false);
  const keys = Object.keys(row.counts).sort((a, b) => bucketSortValue(a) - bucketSortValue(b));
  const data = [{ ...row.counts, name: 'row' }];

  return (
    <>
      <span className="shrink-0 w-9 h-9 rounded-sm overflow-hidden bg-neutral-200 dark:bg-neutral-700">
        <SheetIcon sheet="student" id={row.id} alt="" />
      </span>
      <div
        className="grow h-9"
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={(e) => {
          // Touch fires pointerleave on finger lift, which would dismiss a tapped tooltip immediately.
          if (e.pointerType === 'touch') return;
          setHovering(false);
          setActiveKey(null);
        }}
        onPointerCancel={() => {
          setHovering(false);
          setActiveKey(null);
        }}
      >
        <ResponsiveContainer width="100%" height={36}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
            <XAxis type="number" hide domain={[0, xMax]} />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              isAnimationActive={false}
              cursor={{ fill: 'rgba(150, 150, 150, 0.1)' }}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ zIndex: 60 }}
              content={({ active }) => {
                if (!active || !hovering) return null;
                // List every segment of the row; the hovered one is emphasized and the rest are dimmed.
                return (
                  <div className="bg-white/95 dark:bg-neutral-800/95 backdrop-blur-sm p-1.5 border border-neutral-200 dark:border-neutral-600 text-sm flex flex-col gap-0.5">
                    {keys.map((key) => {
                      const val = row.counts[key] ?? 0;
                      const isActive = key === activeKey;
                      const dimmed = activeKey !== null && !isActive;
                      return (
                        <div key={key} className={`flex items-center gap-1.5 px-1.5 py-0.5 ${isActive ? 'bg-neutral-200 dark:bg-neutral-600 font-bold' : ''} ${dimmed ? 'opacity-50' : ''}`}>
                          <span className="block w-2.5 h-2.5" style={{ backgroundColor: bucketColor(key, isDark) }} />
                          {key === UNKNOWN_KEY ? <span className="text-neutral-500 dark:text-neutral-400">{t_ui('etc')}</span> : <StarRating n={parseInt(key, 10)} />}
                          <span className="ml-auto pl-3 font-bold">{val.toLocaleString()}</span>
                          <span className="w-9 text-right text-neutral-500 dark:text-neutral-400">{((val / row.total) * 100).toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            {keys.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="a"
                isAnimationActive={false}
                fill={bucketColor(key, isDark)}
                fillOpacity={activeKey !== null && activeKey !== key ? 0.45 : 1}
                onMouseEnter={() => setActiveKey(key)}
                onMouseLeave={() => setActiveKey(null)}
              >
                <LabelList dataKey={key} content={<SegmentLabel />} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export const VideoStatsPanel: React.FC<{
  /** Fully filtered video list (score range included). */
  videos: VideoEntry[];
  studentData: ReportStudentData;
  raidInfo: RaidInfo;
  server: GameServer;
}> = ({ videos, studentData, raidInfo, server }) => {
  const { t } = useTranslation(['dashboard', 'mypage']);
  const { t: t_ui } = useTranslation('ui');
  const [open, setOpen] = useState(false);
  const [studentRows, setStudentRows] = useState(STUDENT_ROW_STEP);

  const scoredCount = useMemo(() => videos.filter((v) => typeof v.score === 'number').length, [videos]);
  const noScoreCount = videos.length - scoredCount;

  // Score bins. Bin width scales with the viewport (wider screen -> more, thinner bars).
  // Empty runs longer than a few bins (the gaps between difficulty clusters) are removed;
  // short interior gaps are kept so each cluster still reads as a distribution.
  const bins = useMemo<HistBin[]>(() => {
    const scores = videos.filter((v): v is VideoEntry & { score: number } => typeof v.score === 'number');
    if (scores.length < 2) return [];

    let min = Infinity;
    let max = -Infinity;
    for (const v of scores) {
      if (v.score < min) min = v.score;
      if (v.score > max) max = v.score;
    }
    const range = max - min;
    if (range <= 0) return [];

    const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const keepGap = Math.max(2, Math.round(viewportW / 400));
    let binSize = Math.max(Math.round(range / (viewportW * 4) / 500) * 500, 500);

    for (let guard = 0; guard < 12; guard++) {
      const base = Math.floor(min / binSize) * binSize;
      const filled = new Map<number, { count: number; diff: Map<string, number> }>();
      for (const v of scores) {
        const idx = Math.floor((v.score - base) / binSize);
        const cur = filled.get(idx) ?? { count: 0, diff: new Map<string, number>() };
        cur.count += 1;
        cur.diff.set(v.difficulty, (cur.diff.get(v.difficulty) ?? 0) + 1);
        filled.set(idx, cur);
      }
      const filledIdx = Array.from(filled.keys()).sort((a, b) => a - b);
      // Build the index list to render: every filled index plus short interior gaps.
      const renderIdx: number[] = [];
      for (let i = 0; i < filledIdx.length; i++) {
        renderIdx.push(filledIdx[i]);
        const next = filledIdx[i + 1];
        if (next !== undefined && next - filledIdx[i] > 1 && next - filledIdx[i] - 1 <= keepGap) {
          for (let g = filledIdx[i] + 1; g < next; g++) renderIdx.push(g);
        }
      }
      if (renderIdx.length <= 800 || guard === 11) {
        renderIdx.sort((a, b) => a - b);
        return renderIdx.map((idx) => {
          const cur = filled.get(idx);
          const x0 = base + idx * binSize;
          let color = DIFFICULTY_COLORS.Normal;
          if (cur) {
            let best = -1;
            for (const [d, n] of cur.diff) {
              if (n > best) {
                best = n;
                color = DIFFICULTY_COLORS[d] ?? color;
              }
            }
          }
          return { x0, x1: x0 + binSize, count: cur?.count ?? 0, color };
        });
      }
      binSize *= 2;
    }
    return [];
  }, [videos]);

  // Student appearance counts broken down by investment level.
  const { studentBreakdown, maxTotal } = useMemo(() => {
    const map = new Map<number, Record<string, number>>();
    for (const v of videos) {
      const seen = new Set<number>();
      for (const party of v.parties) {
        for (const s of party) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          const counts = map.get(s.id) ?? {};
          const key = gradeBucket(s.grade);
          counts[key] = (counts[key] ?? 0) + 1;
          map.set(s.id, counts);
        }
      }
    }
    const rows: StudentRow[] = Array.from(map.entries()).map(([id, counts]) => ({
      id,
      counts,
      total: Object.values(counts).reduce((s, n) => s + n, 0),
    }));
    rows.sort((a, b) => b.total - a.total);
    return { studentBreakdown: rows, maxTotal: rows[0]?.total ?? 1 };
  }, [videos]);

  const HistTooltip = ({ active, payload }: Partial<TooltipContentProps<number, string>>) => {
    if (!active || !payload || !payload.length) return null;
    const b = payload[0].payload as HistBin;
    if (!b.count) return null;
    const seconds = calculateTimeFromScore(b.x0, raidInfo.Boss, server, raidInfo.Id);
    const time = seconds !== undefined && seconds >= 0 ? formatTimeToTimestamp(seconds) : null;
    return (
      <div className="bg-white/95 dark:bg-neutral-800/95 backdrop-blur-sm p-2 border border-neutral-200 dark:border-neutral-700 text-xs space-y-0.5">
        <p className="font-bold">
          {(b.x0 / 1_000_000).toFixed(2)}M ~ {(b.x1 / 1_000_000).toFixed(2)}M
        </p>
        <p className="text-neutral-600 dark:text-neutral-300">{`${t_ui('clearVideos')} ${b.count.toLocaleString()}`}</p>
        {time && <p className="text-neutral-500 dark:text-neutral-400 font-mono">@{time}</p>}
      </div>
    );
  };

  const shownRows = studentBreakdown.slice(0, studentRows);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-sm px-3 py-1 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
        >
          {open ? <HiChevronDown className="shrink-0" /> : <HiChevronRight className="shrink-0" />}
          {t('mypage:raids.tabs.stats')}
        </button>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {`${t('byScore')} ${scoredCount.toLocaleString()}`}
          {noScoreCount > 0 && ` · ${t_ui('none')} ${noScoreCount.toLocaleString()}`}
        </span>
      </div>

      {open && (
        <div className="space-y-5">
          {/* Score distribution */}
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-neutral-700 dark:text-neutral-200">{t('scoreDistribution')}</h4>
            {bins.length > 0 ? (
              <div className="-mx-4 sm:mx-0">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={bins} barCategoryGap={0} margin={{ top: 8, right: 10, left: 4, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="x0"
                      angle={-45}
                      textAnchor="end"
                      height={52}
                      tickMargin={4}
                      interval={Math.max(0, Math.ceil(bins.length / 12) - 1)}
                      tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`}
                      style={{ fontSize: '11px' }}
                    />
                    <YAxis allowDecimals={false} width={32} tickFormatter={(v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v))} style={{ fontSize: '11px' }} />
                    <Tooltip content={<HistTooltip />} cursor={{ fill: 'rgba(150, 150, 150, 0.1)' }} allowEscapeViewBox={{ x: false, y: true }} wrapperStyle={{ zIndex: 50 }} />
                    <Bar
                      dataKey="count"
                      isAnimationActive={false}
                      shape={(props: BarShapeProps) => {
                        const entry = props.payload as HistBin;
                        const x1 = Math.floor(props.x ?? 0);
                        const x2 = Math.ceil((props.x ?? 0) + (props.width ?? 0));
                        return <rect x={x1} y={Math.floor(props.y ?? 0)} width={Math.max(1, x2 - x1)} height={Math.ceil(props.height ?? 0)} fill={entry.color} />;
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-neutral-400 dark:text-neutral-500 py-4">{t('mypage:raids.stats.noData')}</p>
            )}
          </div>

          {/* Frequently used students, by investment level. Bar length is proportional to appearance count. */}
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-neutral-700 dark:text-neutral-200">{t('mypage:raids.stats.usageChart.title')}</h4>
            {shownRows.length > 0 ? (
              <>
                <div className="space-y-3">
                  {shownRows.map((row) => (
                    <div key={row.id} className="flex items-center gap-2" title={studentData[row.id]?.Name}>
                      <StudentStarBar row={row} xMax={maxTotal} />
                      <span className="shrink-0 w-9 text-right text-xs font-mono text-neutral-500 dark:text-neutral-400">{row.total}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  {studentRows < studentBreakdown.length && (
                    <button
                      type="button"
                      onClick={() => setStudentRows((n) => n + STUDENT_ROW_STEP)}
                      className="text-xs px-3 py-1 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                    >
                      {`${t_ui('loadMore')} (${studentBreakdown.length - studentRows})`}
                    </button>
                  )}
                  {studentRows > STUDENT_ROW_STEP && (
                    <button
                      type="button"
                      onClick={() => setStudentRows(STUDENT_ROW_STEP)}
                      className="text-xs px-3 py-1 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                    >
                      {t('composition.click_to_collapse')}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-neutral-400 dark:text-neutral-500 py-4">{t('mypage:raids.stats.noData')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
