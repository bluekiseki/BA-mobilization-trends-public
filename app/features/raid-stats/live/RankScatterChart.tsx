// app/components/live/RankScatterChart.tsx
import { Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Line, ComposedChart, ReferenceArea, ReferenceLine } from 'recharts';
import React, { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiRefreshCcw } from 'react-icons/fi';
import 'rc-slider/assets/index.css';
import TooltipSlider from '~/components/common/HandleTooltip';
import { difficultyInfo, generateScoreBrackets, getDifficultyFromScoreAndBoss, type DifficultyName } from '~/components/raid/Difficulty';
import { calculateTimeFromScore, getTimeoutFromBoss } from '~/utils/calculateTimeFromScore';
import { formatTimeToTimestamp } from '~/utils/time';
import type { GameServer, RaidInfo } from '~/types/data';
import type { ReportEntry } from '../../../types/raidReport';
import { DIFFICULTY_COLORS } from '~/data/raidInfo';
import type { LastData, LastERaidData, LastRaidData, TimelineData } from '~/features/raid-stats/live/livetype';
import { quartileRanks, type RankPoint } from '~/features/raid-stats/live/trajectoryQuartiles';
import { curveFromEntries, predictScoreCut, type EliminationScoreModels, type ScoreModel, type SnapshotSource } from '~/features/raid-stats/live/scorePredictor';
import { type_translation, type_translation_tab } from '../../../components/raid/raidToString';
import { useTranslation } from 'react-i18next';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';

import { useDataCache } from '~/hooks/cache'; // Updated import path
import { cdn } from '~/utils/cdn'; // Updated import path

import { getLiveRaidDuration } from '~/data/liveRaid';
import { getKstTime } from '~/data/globalRaidDates';
import { DifficultySelector } from './DifficultySelector';

interface RankScatterChartProps {
  readonly isRaid: boolean;
  readonly lastData: LastData;
  readonly raidInfos: RaidInfo[];
  readonly server: GameServer;
  // Fetched server-side via R2 binding (see live/index.tsx loader) instead of a static
  // import, so this ~940KB historical dataset doesn't bloat the SSR Worker bundle.
  // Start/end dates per season number, shown next to the season id in the comparison list.
  readonly seasonPeriods: Record<string, { start: string; end: string }>;
  readonly totalAssaultTrajectories: PredictionData | null;
  readonly eliminationRaidTrajectories: PredictionData | null;
  // Trained tables for the speed-adjusted cut prediction; null disables it for that raid type.
  readonly totalAssaultModel: ScoreModel | null;
  readonly eliminationRaidModel: EliminationScoreModels | null;
  readonly timelineData: TimelineData;
}
type ChartTab = 'total' | 'boss1' | 'boss2' | 'boss3';
interface RemappedDataPoint {
  displayValue: number;
  originalScore: number;
  originalTime?: number;
  rank: number;
  difficulty: string;
}

interface TrajectoryDataPoint {
  hour_remaining: number;
  avg: number;
  min: number;
  max: number;
  rank: number;
  score: number;
}

export interface PredictionData {
  target_rank: number;
  time_axis?: unknown;
  type?: string;
  statistics?: unknown;
  trajectories?: unknown;
}

interface PivotedDataEntry {
  rank: number;
  originalScores: Record<string, number>;
  originalTimes: Record<string, number>;
  [difficulty: string]: number | null | Record<string, number>;
}

// A vertical band on the (score-mode) Y axis. A displayValue within [offset, offset + width]
// maps linearly to a score within [minScore, maxScore].
interface YPanel {
  group: string;
  offset: number;
  width: number;
  minScore: number;
  maxScore: number;
}

// Score-axis panel geometry: each difficulty/bracket is min-max normalized into a fixed-height
// band (PANEL_WIDTH Y units) with PANEL_GAP blank units between bands. Shared by the chartData
// remap, the Y tick labels (at any zoom) and the party-boundary reference lines.
const PANEL_WIDTH = 10000;
const PANEL_GAP = 2000;

// Truncated (never rounded up), so an axis label never reads higher than the score at that point.
const formatScoreM = (score: number) => `${(Math.floor(score / 1e4) / 100).toFixed(2)}M`;

// Single source of truth for score <-> Y-coordinate conversion under the panel remap.
interface PanelGeometry {
  list: YPanel[];
  scoreToY: (score: number, group: string) => number;
  yToScore: (y: number) => number;
}

const buildPanelGeometry = (list: YPanel[]): PanelGeometry => {
  const byGroup = new Map(list.map((p) => [p.group, p]));
  return {
    list,
    scoreToY: (score, group) => {
      const p = byGroup.get(group);
      if (!p) return 0;
      const range = p.maxScore - p.minScore;
      const norm = range > 0 ? (score - p.minScore) / range : 0;
      return norm * p.width + p.offset;
    },
    yToScore: (y) => {
      let panel = list[0];
      for (const p of list) {
        panel = p;
        if (y <= p.offset + p.width) break;
      }
      if (!panel) return y;
      const frac = panel.width > 0 ? (y - panel.offset) / panel.width : 0;
      return panel.minScore + frac * (panel.maxScore - panel.minScore);
    },
  };
};

interface SplitYTickProps {
  readonly x?: number;
  readonly y?: number;
  readonly payload?: { value: number };
  readonly toScore: (y: number) => number;
}

// Two-line Y tick: the full comma-grouped score split across two lines, no "M" suffix. Used only
// when a zoom window is too narrow for the 2-decimal "M" label to keep adjacent ticks distinct
// (see `twoLineY`). The last 4 digits drop to the second line ("40,03" / "8,896") so each line is
// at most 5 chars — narrower than the single-line "M" label, so the axis width is unchanged.
const SplitYTick: FC<SplitYTickProps> = ({ x = 0, y = 0, payload, toScore }) => {
  const s = Math.round(toScore(payload?.value ?? 0)).toLocaleString('en-US');
  const top = s.slice(0, -5);
  const bottom = s.slice(-5);
  return (
    <text x={x} y={y} textAnchor="end" fill="#666" fontSize={14}>
      <tspan x={x} dy={-2}>
        {top}
      </tspan>
      <tspan x={x} dy={15}>
        {bottom}
      </tspan>
    </text>
  );
};

const getBracketFromTotalScore = (score: number, brackets: { name: string; minScore: number }[]) => {
  const item = brackets.find((b) => score >= b.minScore);
  const index = item ? brackets.indexOf(item) - 1 : -1;
  if (index < 0) return 'Unknown';
  return brackets[index]?.name;
};

interface RankZoomSliderProps {
  readonly min: number;
  readonly max: number;
  readonly value: readonly [number, number];
  readonly onCommit: (window: [number, number] | null) => void;
  readonly onDraggingChange: (dragging: boolean) => void;
}

// Rank-axis zoom control. The mid-drag thumb position lives in local state (so the slider stays
// smooth), and the committed window is pushed to the parent on a ~120ms throttle during the drag
// plus a final commit on release — the chart follows the drag without re-rendering every pixel.
const RankZoomSlider: FC<RankZoomSliderProps> = React.memo(({ min, max, value, onCommit, onDraggingChange }) => {
  const [pending, setPending] = useState<[number, number] | null>(null);
  const shown = pending ?? value;

  const draggingRef = useRef(false);
  const toWindow = useCallback((lo: number, hi: number): [number, number] | null => (lo <= min && hi >= max ? null : [lo, hi]), [min, max]);

  const throttle = useRef<{ last: number; timer: ReturnType<typeof setTimeout> | null }>({ last: 0, timer: null });
  useEffect(
    () => () => {
      if (throttle.current.timer) clearTimeout(throttle.current.timer);
    },
    [],
  );

  const pushThrottled = useCallback(
    (win: [number, number] | null) => {
      const GAP = 80;
      const now = Date.now();
      const s = throttle.current;
      if (s.timer) {
        clearTimeout(s.timer);
        s.timer = null;
      }
      if (now - s.last >= GAP) {
        s.last = now;
        onCommit(win);
      } else {
        s.timer = setTimeout(
          () => {
            throttle.current.last = Date.now();
            onCommit(win);
          },
          GAP - (now - s.last),
        );
      }
    },
    [onCommit],
  );

  return (
    <div className="mt-1 px-5 sm:px-2">
      <div className="flex justify-end mb-1">
        <span className="font-mono text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
          {/* Reversed (high rank on the left, matching the X axis); en-dash reads across locales. */}
          {Math.round(shown[1]).toLocaleString()} – {Math.round(shown[0]).toLocaleString()}
        </span>
      </div>
      <TooltipSlider
        range
        reverse
        allowCross={false}
        min={min}
        max={max}
        value={[shown[0], shown[1]]}
        tipFormatter={(v) => Math.round(v).toLocaleString()}
        onChange={(v) => {
          if (!Array.isArray(v)) return;
          if (!draggingRef.current) {
            draggingRef.current = true;
            onDraggingChange(true);
          }
          setPending([v[0], v[1]]);
          pushThrottled(toWindow(Math.min(v[0], v[1]), Math.max(v[0], v[1])));
        }}
        onChangeComplete={(v) => {
          if (!Array.isArray(v)) return;
          if (throttle.current.timer) {
            clearTimeout(throttle.current.timer);
            throttle.current.timer = null;
          }
          draggingRef.current = false;
          onDraggingChange(false);
          setPending(null);
          onCommit(toWindow(Math.min(v[0], v[1]), Math.max(v[0], v[1])));
        }}
        styles={{
          track: { backgroundColor: '#3b82f6', height: 4 },
          handle: { borderColor: '#3b82f6', backgroundColor: '#fff', opacity: 1, height: 14, width: 14, marginTop: -5 },
          rail: { backgroundColor: '#e5e7eb', height: 4 },
        }}
      />
    </div>
  );
});
RankZoomSlider.displayName = 'RankZoomSlider';

export const RankScatterChart: FC<RankScatterChartProps> = ({
  isRaid,
  lastData,
  raidInfos,
  seasonPeriods,
  server,
  totalAssaultTrajectories,
  eliminationRaidTrajectories,
  totalAssaultModel,
  eliminationRaidModel,
  timelineData,
}) => {
  // console.log('[RankScatterChart]', { isRaid, lastData, raidInfos, server });
  const [activeTab, setActiveTab] = useState<ChartTab>('total');
  const [axisType, setAxisType] = useState<'score' | 'time'>('score');
  // Difficulty-name tabs have their own filter, independent of the other live charts; null = nothing
  // picked yet, so every available difficulty is shown. The grand-assault "total" tab groups by
  // score bracket instead, so it keeps its own local visibility set + pill legend.
  const [pickedDiffs, setSelectedDiffs] = useState<string[] | null>(null);
  const [bracketVisible, setBracketVisible] = useState<Set<string>>(new Set());
  // Manual rank-axis zoom window [minRank, maxRank]. null = full (follow the visible-difficulty
  // range). Mid-drag thumb state lives in <RankZoomSlider>; only the committed window lands here.
  const [rankWindow, setRankWindow] = useState<[number, number] | null>(null);
  // True while the zoom slider is being dragged — series animation is suppressed so the
  // per-commit re-render doesn't fight the drag for the main thread.
  const [isZooming, setIsZooming] = useState(false);

  // At most one mode is active; null means the prediction cutoff is hidden
  const [predictionMode, setPredictionMode] = useState<'model' | 'stats' | 'compare' | null>('model');

  const [compareRaidId, setCompareRaidId] = useState<string>('');

  const [allRaidInfos, setAllRaidInfos] = useState<RaidInfo[]>([]);

  const { t, i18n } = useTranslation('liveDashboard');
  const { t: t_ui } = useTranslation('ui');
  const { t: t_dash } = useTranslation('dashboard');
  const { t: t_game } = useTranslation('game');
  const locale = i18n.language as Locale;
  const currentLocaleShort = getLocaleShortName(locale);

  const fetchRaids = useDataCache<RaidInfo[]>();
  useEffect(() => {
    fetchRaids(cdn(`/w/v2/${server}/${currentLocaleShort}.raid_info.bin`), (res) => res.json())
      .then((data) => {
        if (data) setAllRaidInfos(data);
      })
      .catch(console.error);
  }, [server, currentLocaleShort, fetchRaids]);

  const TABS: { id: ChartTab; name: string }[] = useMemo(
    () =>
      isRaid
        ? [{ id: 'total', name: t_ui('totalScore') }]
        : [
            { id: 'total', name: t_ui('totalScore') },
            {
              id: 'boss1',
              name: type_translation_tab[raidInfos?.[0]?.Type as keyof typeof type_translation_tab]?.[currentLocaleShort] || 'Boss 1',
            },
            {
              id: 'boss2',
              name: type_translation_tab[raidInfos?.[1]?.Type as keyof typeof type_translation_tab]?.[currentLocaleShort] || 'Boss 2',
            },
            {
              id: 'boss3',
              name: type_translation_tab[raidInfos?.[2]?.Type as keyof typeof type_translation_tab]?.[currentLocaleShort] || 'Boss 3',
            },
          ],
    [raidInfos, isRaid, currentLocaleShort, t],
  );

  const SCORE_BRACKETS = useMemo(() => generateScoreBrackets(difficultyInfo), []);
  const isTotalChart = !isRaid && activeTab === 'total';

  // Raid info backing the active tab: the matching boss on an Elimination boss tab, otherwise the
  // first entry. Clear-time / party-count math must use this boss (battle cap differs per boss).
  const activeRaidInfo = useMemo(
    () => (isRaid || activeTab === 'total' ? raidInfos?.[0] : (raidInfos.find((r) => r.Id.endsWith(activeTab.slice(-1))) ?? raidInfos?.[0])),
    [isRaid, activeTab, raidInfos],
  );

  const predictionData = useMemo((): PredictionData | null => {
    return isRaid ? totalAssaultTrajectories : eliminationRaidTrajectories;
  }, [isRaid, totalAssaultTrajectories, eliminationRaidTrajectories]);

  const getDisplayName = useCallback(
    (id: string, targetTab?: string) => {
      const rawId = id.replace('live_', '');
      const numId = rawId.replace(/^[RE]/, '');

      const matchedRaids = allRaidInfos.filter((r) => r.Id === rawId || r.Id === numId);

      if (matchedRaids.length === 0) return id;

      const period = seasonPeriods[numId];
      const seasonLabel = `S${numId}${period ? ` · ${period.start}` : ''}`;

      if (isRaid) {
        const raid = matchedRaids[0];
        const typeStr = raid.Type && type_translation[raid.Type as keyof typeof type_translation]?.[currentLocaleShort];
        const bossStr = typeStr ? `${raid.Boss} (${typeStr})` : raid.Boss;
        return `${seasonLabel} · ${bossStr}`;
      } else {
        const currentTarget = targetTab || activeTab;
        if (currentTarget === 'total') {
          const typesStr = matchedRaids
            .map((r) => (r.Type && type_translation[r.Type as keyof typeof type_translation]?.[currentLocaleShort]) || r.Type)
            .filter(Boolean)
            .join(', ');
          return `${seasonLabel} · ${matchedRaids[0].Boss} (${t('total_combined', { types: typesStr })})`; // Applied localization (i18n)
        } else {
          const tabIndex = parseInt(currentTarget.replace('boss', '')) - 1;
          const raid = matchedRaids[tabIndex] || matchedRaids[0];
          const typeStr = raid.Type && type_translation[raid.Type as keyof typeof type_translation]?.[currentLocaleShort];
          return `${seasonLabel} · ${typeStr ? `${raid.Boss} (${typeStr})` : raid.Boss}`;
        }
      }
    },
    [allRaidInfos, seasonPeriods, currentLocaleShort, isRaid, activeTab, t],
  );

  const compareOptions = useMemo(() => {
    if (!predictionData?.trajectories) return [];
    const ids = Object.keys(predictionData.trajectories);
    const options: { value: string; label: string }[] = [];

    ids.forEach((id) => {
      if (isRaid) {
        options.push({ value: id, label: getDisplayName(id) });
      } else {
        if (activeTab === 'total') {
          options.push({ value: `${id}_total`, label: getDisplayName(id, 'total') });
        } else {
          options.push({ value: `${id}_boss1`, label: getDisplayName(id, 'boss1') });
          options.push({ value: `${id}_boss2`, label: getDisplayName(id, 'boss2') });
          options.push({ value: `${id}_boss3`, label: getDisplayName(id, 'boss3') });
        }
      }
    });
    return options;
  }, [predictionData, isRaid, activeTab, getDisplayName]);

  useEffect(() => {
    if (compareOptions.length > 0) {
      const isValid = compareOptions.some((opt) => opt.value === compareRaidId);
      if (!isValid) {
        setCompareRaidId(compareOptions[0].value);
      }
    }
  }, [compareOptions, compareRaidId]);

  // Speed-adjusted model for the active tab; null when none was published for this raid type.
  const activeScoreModel = isRaid ? totalAssaultModel : activeTab === 'total' ? eliminationRaidModel?.total : eliminationRaidModel?.boss;
  // Speed-adjusted cut: needs the newest snapshot plus the 12/24/48h-old ones from the timeline.
  const fusedPrediction = useMemo(() => {
    const scoreModel = activeScoreModel;
    if (predictionMode !== 'model' || !scoreModel) return null;
    const endMs = getKstTime(raidInfos[0].Date) + 3600_000 * 24 * getLiveRaidDuration() - 3600_000 * 7;
    const hoursAt = (time: string) => (endMs - getKstTime(time, '+00:00')) / 3600_000;
    const hours = hoursAt(lastData.time);
    if (!(hours > 0)) return null;

    // Latest snapshot: the elimination total tab sums the three boss scores of each rank, like the chart does.
    let latest: ReadonlyArray<{ r: number; s: number }> | undefined;
    if (isRaid) latest = (lastData.data as LastRaidData).boss?.d;
    else if (activeTab === 'total') {
      const scores = new Map<number, number>();
      const total = (lastData.data as LastERaidData).total;
      for (const boss of [total?.boss1, total?.boss2, total?.boss3]) for (const entry of boss?.d ?? []) scores.set(entry.r, (scores.get(entry.r) ?? 0) + entry.s);
      latest = Array.from(scores, ([r, s]) => ({ r, s }));
    } else latest = (lastData.data as LastERaidData)[activeTab]?.d;
    if (!latest || latest.length === 0) return null;
    const latestEntries = latest;

    const sources: SnapshotSource[] = [{ hoursRemaining: hours, getCurve: () => curveFromEntries(latestEntries) }];
    for (const point of timelineData) {
      const data = point.data;
      let entries: ReadonlyArray<{ r: number; s: number }> | undefined;
      if ('boss' in data) entries = data.boss.d;
      else entries = activeTab === 'total' ? data.total : data[activeTab]?.d;
      if (!entries || entries.length === 0) continue;
      const pointEntries = entries;
      sources.push({ hoursRemaining: hoursAt(point.time), getCurve: () => curveFromEntries(pointEntries) });
    }
    const prediction = predictScoreCut(scoreModel, sources, hours);
    if (!prediction) return null;
    // The 80% band is measured in final ranks around the target rank; the predicted rank maps to that
    // target, so scale the band by the same ratio to draw it on the current curve.
    const spread = prediction.p80 === null ? null : prediction.p80 / scoreModel.targetRank;
    return { ...prediction, bandLow: spread === null ? null : prediction.rank * (1 - spread), bandHigh: spread === null ? null : prediction.rank * (1 + spread) };
  }, [predictionMode, activeScoreModel, isRaid, activeTab, raidInfos, lastData, timelineData]);

  // Falls back to the stats mode while the speed-adjusted model cannot produce a cut yet (e.g. early in a raid).
  const effectiveMode = predictionMode === 'model' && !fusedPrediction ? 'stats' : predictionMode;
  const showPredictionCut = effectiveMode !== null;

  const currentPrediction = useMemo(() => {
    if (!showPredictionCut || !predictionData || effectiveMode === 'model') return null;

    const targetRank = predictionData.target_rank || 20000;

    const raidInfoAny = raidInfos?.[0];
    const endTimeStr = getKstTime(raidInfoAny.Date) + 3600_000 * 24 * getLiveRaidDuration() - 3600_000 * 7;
    const endDt = endTimeStr ? endTimeStr : Date.now();

    const currentDt = getKstTime(lastData.time, '+00:00') || Date.now();
    const hoursRemaining = Math.max(0, (endDt - currentDt) / 3600000) + 0;

    if (hoursRemaining === 0) {
      return { mode: effectiveMode, hour: 0, avg: targetRank, min: targetRank, max: targetRank, rank: targetRank };
    }

    let targetDataArray: TrajectoryDataPoint[] = [];
    if (effectiveMode === 'stats') {
      if (isRaid) {
        const stats = predictionData.statistics;
        targetDataArray = Array.isArray(stats) ? (stats as TrajectoryDataPoint[]) : [];
      } else {
        const statsKey = activeTab === 'total' ? 'total' : 'boss';
        const statsValue = (predictionData.statistics as Record<string, unknown>)?.[statsKey];
        targetDataArray = Array.isArray(statsValue) ? (statsValue as TrajectoryDataPoint[]) : [];
      }
    } else {
      if (!compareRaidId) return null;
      if (isRaid) {
        const trajValue = (predictionData.trajectories as Record<string, unknown>)?.[compareRaidId];
        targetDataArray = Array.isArray(trajValue) ? (trajValue as TrajectoryDataPoint[]) : [];
      } else {
        const lastUnderscoreIdx = compareRaidId.lastIndexOf('_');
        const baseId = compareRaidId.substring(0, lastUnderscoreIdx);
        const targetTab = compareRaidId.substring(lastUnderscoreIdx + 1);

        const trajValue = (predictionData.trajectories as Record<string, unknown>)?.[baseId];
        const nestedValue = trajValue && typeof trajValue === 'object' && !Array.isArray(trajValue) ? (trajValue as Record<string, unknown>)[targetTab] : undefined;
        targetDataArray = Array.isArray(nestedValue) ? (nestedValue as TrajectoryDataPoint[]) : [];
      }
    }

    if (!targetDataArray || targetDataArray.length === 0) return null;

    const closestMatch = targetDataArray.reduce((prev, curr) => {
      return Math.abs(curr.hour_remaining - hoursRemaining) < Math.abs(prev.hour_remaining - hoursRemaining) ? curr : prev;
    });

    // Middle 50% of the past seasons at this time, from their own trajectories.
    let quartiles: { q1: number; q3: number } | null = null;
    if (effectiveMode === 'stats') {
      const seasons = Object.values((predictionData.trajectories as Record<string, unknown> | undefined) ?? {});
      const series: RankPoint[][] = [];
      for (const season of seasons) {
        if (Array.isArray(season)) series.push(season as RankPoint[]);
        else if (season && typeof season === 'object') {
          const bySeries = season as Record<string, unknown>;
          for (const key of activeTab === 'total' ? ['total'] : ['boss1', 'boss2', 'boss3']) {
            if (Array.isArray(bySeries[key])) series.push(bySeries[key] as RankPoint[]);
          }
        }
      }
      quartiles = quartileRanks(series, hoursRemaining);
    }

    return {
      mode: effectiveMode,
      hour: closestMatch.hour_remaining,
      avg: closestMatch.avg,
      min: closestMatch.min,
      max: closestMatch.max,
      q1: quartiles?.q1,
      q3: quartiles?.q3,
      rank: closestMatch.rank,
      score: closestMatch.score,
    };
  }, [showPredictionCut, effectiveMode, predictionData, isRaid, activeTab, compareRaidId, raidInfos]);

  // const compareDisplayName = useMemo(() => {
  //   if (!compareRaidId) return '';
  //   if (isRaid) return getDisplayName(compareRaidId);

  //   const lastUnderscoreIdx = compareRaidId.lastIndexOf('_');
  //   const baseId = compareRaidId.substring(0, lastUnderscoreIdx);
  //   const targetTab = compareRaidId.substring(lastUnderscoreIdx + 1);
  //   return getDisplayName(baseId, targetTab);
  // }, [compareRaidId, isRaid, getDisplayName]);

  const { chartData, customTicks, xDomain, legendPayload, panels } = useMemo(() => {
    let rankData: ReportEntry[];
    const currentRaidInfo = activeRaidInfo;
    if (isRaid) {
      const scoreMap = new Map<number, number>();
      const boss = (lastData.data as LastRaidData).boss;
      // console.log('boss',boss)
      boss.d
        .filter((v) => v.r <= 20000)
        .forEach((p) => {
          scoreMap.set(p.r, (scoreMap.get(p.r) || 0) + p.s);
        });
      rankData = Array.from(scoreMap.entries())
        .map(([rank, score]) => ({ r: rank, s: score }))
        .sort((a, b) => b.s - a.s) as ReportEntry[];
    } else if (activeTab === 'total') {
      const scoreMap = new Map<number, number>();
      const { boss1, boss2, boss3 } = (lastData.data as LastERaidData).total;
      [boss1.d, boss2.d, boss3.d].forEach((bossData) => {
        bossData.forEach((p) => {
          scoreMap.set(p.r, (scoreMap.get(p.r) || 0) + p.s);
        });
      });
      rankData = Array.from(scoreMap.entries())
        .map(([rank, score]) => ({ r: rank, s: score }))
        .sort((a, b) => b.s - a.s) as ReportEntry[];
    } else {
      rankData = (lastData.data as LastERaidData)[activeTab].d.filter((v) => v.r <= 20000);
    }

    if (axisType === 'score' || isTotalChart) {
      const groupedData = rankData.reduce<Record<string, ReportEntry[]>>((acc, entry) => {
        const groupName = isTotalChart ? getBracketFromTotalScore(entry.s, SCORE_BRACKETS) : getDifficultyFromScoreAndBoss(entry.s, server, raidInfos[0].Id);
        if (!acc[groupName]) acc[groupName] = [];
        acc[groupName].push(entry);
        return acc;
      }, {});

      const groupOrder = (isTotalChart ? SCORE_BRACKETS.map((b) => b.name) : ['Lunatic', 'Torment', 'Insane', 'Extreme', 'Hardcore', 'Veryhard', 'Hard', 'Normal']).reverse();

      // Pass 1: fix each visible group's panel geometry.
      const panelList: YPanel[] = [];
      let currentOffset = 0;
      for (const groupName of groupOrder) {
        const entries = groupedData[groupName];
        if (!entries || entries.length === 0) continue;
        panelList.push({
          group: groupName,
          offset: currentOffset,
          width: PANEL_WIDTH,
          minScore: Math.min(...entries.map((e) => e.s)),
          maxScore: Math.max(...entries.map((e) => e.s)),
        });
        currentOffset += PANEL_WIDTH + PANEL_GAP;
      }
      const geometry = buildPanelGeometry(panelList);

      // Pass 2: remap points and build the fixed panel-boundary ticks off that geometry.
      const remappedData: RemappedDataPoint[] = [];
      for (const groupName of groupOrder) {
        const entries = groupedData[groupName];
        if (!entries || entries.length === 0) continue;
        for (const point of entries) {
          remappedData.push({ displayValue: geometry.scoreToY(point.s, groupName), originalScore: point.s, rank: point.r, difficulty: groupName });
        }
      }
      const ticks = panelList.flatMap((p) => [
        { value: p.offset, label: formatScoreM(p.minScore) },
        { value: p.offset + p.width, label: formatScoreM(p.maxScore) },
      ]);

      const payload = (
        isTotalChart ? SCORE_BRACKETS.map((b) => ({ value: b.name, color: b.fill, type: 'circle' })) : Object.entries(DIFFICULTY_COLORS).map(([value, color]) => ({ value, color, type: 'circle' }))
      ).filter((p) => groupedData[p.value]);
      return { chartData: remappedData, customTicks: ticks, xDomain: ['dataMin', 'dataMax'] as const, legendPayload: payload, panels: geometry };
    } else {
      const timeDataTmp = rankData.map((entry) => ({
        displayValue: calculateTimeFromScore(entry.s, currentRaidInfo.Boss, server, currentRaidInfo.Id) || 0,
        originalScore: entry.s,
        rank: entry.r,
        difficulty: getDifficultyFromScoreAndBoss(entry.s, server, raidInfos[0].Id),
      }));

      // Keep every point with a valid clear time so the time axis matches the
      // score axis density (was decimated to rank % 1000, half of score mode).
      const timeData = timeDataTmp.filter(
        (p, i) =>
          p.displayValue > 0 ||
          p.rank == 1 ||
          (i > 0 && getDifficultyFromScoreAndBoss(p.originalScore, server, raidInfos[0].Id) != getDifficultyFromScoreAndBoss(timeDataTmp[i - 1].originalScore, server, raidInfos[0].Id)),
      );

      const existingDifficulties = [...new Set(timeData.map((d) => d.difficulty))];
      const difficultyNames = Object.keys(DIFFICULTY_COLORS) as DifficultyName[];
      const payload = difficultyNames.filter((diff) => existingDifficulties.includes(diff)).map((diff) => ({ value: diff, color: DIFFICULTY_COLORS[diff], type: 'circle' as const }));
      return { chartData: timeData, customTicks: undefined, xDomain: ['dataMin', 'dataMax'] as const, legendPayload: payload, panels: null as PanelGeometry | null };
    }
  }, [lastData, activeTab, axisType, server, raidInfos, SCORE_BRACKETS, isRaid, isTotalChart, activeRaidInfo]);

  // Find the intersection point between the predicted rank (X) and the score distribution curve.
  const predictionIntersection = useMemo(() => {
    if ((!currentPrediction && !fusedPrediction) || !chartData || chartData.length === 0) return null;

    // 1. Filter valid data only (Remove missing data where scores or coordinates are null/undefined)
    const validData = chartData.filter((d) => d != null && d.rank != null && d.originalScore != null && d.displayValue != null);

    // Stop calculation if no data remains after filtering
    if (validData.length === 0) return null;

    // 2. Sort by rank in ascending order (required condition for interpolation)
    const sortedData = [...validData].sort((a, b) => a.rank - b.rank);

    const getIntersectionData = (targetRank: number) => {
      // Guard 1: If only one valid data point remains (interpolation impossible, return the point)
      if (sortedData.length === 1) {
        return {
          rank: targetRank,
          score: sortedData[0].originalScore,
          yValue: sortedData[0].displayValue,
        };
      }

      // Guard 2: If the target rank is out of data range (clamp to the ends)
      if (targetRank <= sortedData[0].rank) {
        return { rank: targetRank, score: sortedData[0].originalScore, yValue: sortedData[0].displayValue };
      }
      if (targetRank >= sortedData[sortedData.length - 1].rank) {
        const lastPoint = sortedData[sortedData.length - 1];
        return { rank: targetRank, score: lastPoint.originalScore, yValue: lastPoint.displayValue };
      }

      // Find two valid points (p1, p2) surrounding the target rank
      let p1 = sortedData[0];
      let p2 = sortedData[1];
      for (let i = 0; i < sortedData.length - 1; i++) {
        if (sortedData[i].rank <= targetRank && sortedData[i + 1].rank >= targetRank) {
          p1 = sortedData[i];
          p2 = sortedData[i + 1];
          break;
        }
      }

      // Guard 3: Prevent Divide by Zero if duplicate ranks are present
      const range = p2.rank - p1.rank;
      const ratio = range > 0 ? (targetRank - p1.rank) / range : 0;

      const interpolatedScore = p1.originalScore + ratio * (p2.originalScore - p1.originalScore);
      const interpolatedYValue = p1.displayValue + ratio * (p2.displayValue - p1.displayValue);

      return {
        rank: targetRank,
        score: Math.round(interpolatedScore),
        yValue: interpolatedYValue,
      };
    };

    return {
      avg: currentPrediction?.avg ? getIntersectionData(currentPrediction.avg) : null,
      min: currentPrediction?.min ? getIntersectionData(currentPrediction.min) : null,
      max: currentPrediction?.max ? getIntersectionData(currentPrediction.max) : null,
      q1: currentPrediction?.q1 ? getIntersectionData(currentPrediction.q1) : null,
      q3: currentPrediction?.q3 ? getIntersectionData(currentPrediction.q3) : null,
      compare: currentPrediction && (currentPrediction.score || currentPrediction.rank) ? getIntersectionData(currentPrediction.rank ?? currentPrediction.score) : null,
      fused: fusedPrediction ? getIntersectionData(fusedPrediction.rank) : null,
      fusedLow: fusedPrediction?.bandLow ? getIntersectionData(fusedPrediction.bandLow) : null,
      fusedHigh: fusedPrediction?.bandHigh ? getIntersectionData(fusedPrediction.bandHigh) : null,
    };
  }, [currentPrediction, fusedPrediction, chartData]);

  useEffect(() => {
    if (!isRaid && activeTab === 'total') setAxisType('score');
  }, [activeTab, isRaid]);

  // Difficulty / bracket names present in the current chart.
  const availableGroups = useMemo(() => legendPayload.map((p) => p.value), [legendPayload]);

  // Keep the bracket set (grand-assault total tab) in sync with what's available.
  useEffect(() => {
    if (isTotalChart) setBracketVisible(new Set(legendPayload.map((p) => p.value)));
  }, [legendPayload, isTotalChart]);

  // An explicit pick is kept (including "none"), unless it matches nothing on this tab; then show everything.
  const selectedDiffs = useMemo(
    () => (pickedDiffs && (pickedDiffs.length === 0 || pickedDiffs.some((d) => availableGroups.includes(d))) ? pickedDiffs : availableGroups),
    [pickedDiffs, availableGroups],
  );

  // Unified "which groups are drawn" set, sourced per-tab.
  const visibleDifficulties = useMemo(
    () => (isTotalChart ? bracketVisible : new Set(selectedDiffs.filter((d) => availableGroups.includes(d)))),
    [isTotalChart, bracketVisible, selectedDiffs, availableGroups],
  );

  const handleBracketToggle = useCallback((bracket: string) => {
    setBracketVisible((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(bracket)) newSet.delete(bracket);
      else newSet.add(bracket);
      return newSet;
    });
  }, []);

  const pivotedData = useMemo((): PivotedDataEntry[] => {
    if (!chartData || chartData.length === 0) return [];
    const dataMap = new Map<number, PivotedDataEntry>();
    const allDifficulties = legendPayload.map((p) => p.value);

    chartData.forEach((point) => {
      if (!dataMap.has(point.rank)) {
        const initialEntry: PivotedDataEntry = { rank: point.rank, originalScores: {}, originalTimes: {} };
        allDifficulties.forEach((diff) => {
          initialEntry[diff] = null;
        });
        dataMap.set(point.rank, initialEntry);
      }
      const entry = dataMap.get(point.rank);
      if (entry) {
        entry[point.difficulty] = point.displayValue;
        entry.originalScores[point.difficulty] = point.originalScore;
      }
    });

    return Array.from(dataMap.values()).sort((a, b) => a.rank - b.rank);
  }, [chartData, legendPayload]);

  // Alternating background bands, one per party count — Time axis only. Party count is purely a
  // function of total clear time: parties = ceil(totalTime / battleCap), where battleCap is the
  // fixed per-boss single-battle limit (3 / 4 / 4.5 min) — a run over k battle caps needed at
  // least k+1 parties, no matter how many teams were actually fielded. Even party counts get a
  // faint shade so the zones read as a staircase. Skipped on the Score axis (the panel remap
  // already compresses each difficulty into a synthetic band, so equal party steps there aren't
  // equal pixels — misleading) and on the Elimination "total" tab (no single party progression
  // for a summed 3-boss score).
  const partyBands = useMemo<{ key: string; y1: number; y2: number; n: number }[]>(() => {
    if (isTotalChart || panels) return [];
    if (!activeRaidInfo) return [];

    const capSec = getTimeoutFromBoss(activeRaidInfo.Boss) * 60;
    let maxT = 0;
    for (const d of chartData) {
      if (visibleDifficulties.has(d.difficulty) && d.displayValue > maxT) maxT = d.displayValue;
    }

    const bands: { key: string; y1: number; y2: number; n: number }[] = [];
    for (let k = 1; (k - 1) * capSec < maxT; k++) {
      bands.push({ key: `party-t-${k}`, y1: (k - 1) * capSec, y2: k * capSec, n: k });
    }
    return bands;
  }, [panels, chartData, isTotalChart, activeRaidInfo, visibleDifficulties]);

  // Rank extent of the currently visible difficulties — the range the zoom slider spans, so a
  // one-difficulty view isn't stretched across the whole field.
  const visibleRankRange = useMemo<[number, number]>(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of chartData) {
      if (!visibleDifficulties.has(p.difficulty)) continue;
      if (p.rank < lo) lo = p.rank;
      if (p.rank > hi) hi = p.rank;
    }
    if (lo > hi) return [0, 1];
    return lo === hi ? [lo, lo + 1] : [lo, hi];
  }, [chartData, visibleDifficulties]);

  // Reset the manual zoom whenever its basis changes (difficulty filter, tab, score/time unit,
  // or a fresh data snapshot).
  useEffect(() => {
    setRankWindow(null);
  }, [visibleRankRange]);

  const rankDomain = useMemo<[number, number]>(() => {
    const [lo, hi] = rankWindow ?? visibleRankRange;
    return [Math.min(lo, hi), Math.max(lo, hi)];
  }, [rankWindow, visibleRankRange]);

  const isZoomed = rankWindow !== null;
  const resetZoom = useCallback(() => setRankWindow(null), []);

  // Full rank extent of the whole dataset (every difficulty, ignoring the visibility filter).
  // pivotedData is already rank-ascending.
  const fullRankExtent = useMemo<[number, number]>(() => (pivotedData.length ? [pivotedData[0].rank, pivotedData[pivotedData.length - 1].rank] : [0, 1]), [pivotedData]);

  // The rank axis is "constrained" whenever it shows less than the full field — either a manual
  // slider zoom or a difficulty/bracket subset that narrows `visibleRankRange`. Recharts only
  // honours a clipping `domain` when `allowDataOverflow` is on, so this must gate that flag (not
  // just `isZoomed`), otherwise a difficulty-only selection snaps back to the full 1–20,000 axis.
  const isRankConstrained = isZoomed || rankDomain[0] > fullRankExtent[0] || rankDomain[1] < fullRankExtent[1];

  // Axis-only domain: pad the ends slightly when constrained so the clip doesn't slice the
  // rank-1 (or max-rank) marker in half at the edge. Slider bounds keep the unpadded range.
  const xAxisDomain = useMemo<[number, number]>(() => {
    if (!isRankConstrained) return rankDomain;
    const [lo, hi] = rankDomain;
    const pad = Math.max(0.5, (hi - lo) * 0.02);
    return [Math.max(0, lo - pad), hi + pad];
  }, [isRankConstrained, rankDomain]);

  // Animate only at the full (unzoomed) view. While a zoom window is active — including the
  // release commit and any further slider nudges — the chart snaps without animation, so it
  // never flashes back to the drag-start position before settling. Reset returns to the
  // animated full view.
  const animateSeries = rankWindow === null && !isZooming;

  // Y (score/time) domain fitted to the visible rank window, so zooming the X axis actually
  // spreads the data vertically instead of leaving it squashed. Only applied while zoomed.
  const visibleYDomain = useMemo<[number, number] | undefined>(() => {
    if (rankWindow === null) return undefined;
    const vis = legendPayload.filter((p) => visibleDifficulties.has(p.value)).map((p) => p.value);
    const [lo, hi] = rankDomain;
    let ylo = Infinity;
    let yhi = -Infinity;
    for (const row of pivotedData) {
      if (row.rank < lo || row.rank > hi) continue;
      for (const d of vis) {
        const v = row[d];
        if (typeof v === 'number') {
          if (v < ylo) ylo = v;
          if (v > yhi) yhi = v;
        }
      }
    }
    if (ylo > yhi) return undefined;
    const pad = (yhi - ylo) * 0.04 || 1;
    return [ylo - pad, yhi + pad];
  }, [rankWindow, pivotedData, rankDomain, legendPayload, visibleDifficulties]);

  // Once a zoom window covers only a narrow score span, the 2-decimal "M" tick label can't
  // separate adjacent ticks (0.01M = 10k-point resolution) and every label collapses to the
  // same value. Below this threshold the Y axis switches to the full-precision two-line tick.
  const twoLineY = useMemo(() => {
    if (!visibleYDomain || !panels) return false;
    const span = Math.abs(panels.yToScore(visibleYDomain[1]) - panels.yToScore(visibleYDomain[0]));
    return span < 80_000;
  }, [visibleYDomain, panels]);

  // Stable element list + tooltip renderer so hover / mount re-renders don't rebuild the
  // per-difficulty <Line>/<Scatter> subtree (hundreds of nodes) every time.
  const seriesElements = useMemo(
    () =>
      legendPayload
        .filter((p) => visibleDifficulties.has(p.value))
        .map((p) => (
          <React.Fragment key={p.value}>
            <Line dataKey={p.value} stroke={p.color} strokeWidth={2} dot={false} connectNulls={true} isAnimationActive={animateSeries} animationDuration={400} animationEasing="ease-out" />
            <Scatter dataKey={p.value} fill={p.color} shape="circle" isAnimationActive={animateSeries} animationDuration={400} animationEasing="ease-out" />
          </React.Fragment>
        )),
    [legendPayload, visibleDifficulties, animateSeries],
  );

  const renderTooltip = useCallback(
    ({ active, payload }: { active?: boolean; payload?: readonly { dataKey?: string | number; payload?: unknown; color?: string }[] }) => {
      if (!active || !payload || !payload.length) return null;
      // Pick the series that actually has a score on this rank row. Payload order is not reliable:
      // each Scatter also contributes a non-null X-axis entry (dataKey "rank"), and prediction
      // series (range/avg/compare) are present too — none of those are keys of originalScores.
      const hoveredSeries = payload.find((p) => {
        const row = p.payload as PivotedDataEntry | undefined;
        return row?.originalScores?.[String(p.dataKey)] != null;
      });
      if (!hoveredSeries) return null;

      const dataKey = String(hoveredSeries.dataKey ?? '');
      const fullDataPoint = hoveredSeries.payload as PivotedDataEntry | undefined;
      if (!fullDataPoint) return null;

      const originalScore = fullDataPoint.originalScores[dataKey] ?? 0;
      const rank = fullDataPoint.rank;
      const id = activeRaidInfo?.Id ?? '';
      const boss = activeRaidInfo?.Boss ?? '';
      const clearSec = calculateTimeFromScore(originalScore, boss, server, id) || 0;
      const time = formatTimeToTimestamp(clearSec);
      // Party count = ceil(total clear time / per-boss battle cap), time-only (see partyBands).
      const parties = clearSec > 0 ? Math.max(1, Math.ceil(clearSec / (getTimeoutFromBoss(boss) * 60))) : 0;

      return (
        <div className="p-2 bg-white/90 dark:bg-black/90 backdrop-blur-sm rounded-md border dark:border-neutral-700 text-sm shadow-md">
          <p>
            <strong>{t_dash('byRank')}:</strong> {rank.toLocaleString()}
          </p>
          <p>
            <strong>{t_dash('byScore')}:</strong> {originalScore.toLocaleString()}
          </p>
          {!isTotalChart && (
            <p>
              <strong>{t_ui('time')}:</strong> {time}
              {parties > 1 && <span className="text-neutral-500 dark:text-neutral-400"> ({t_dash('nPartyCount', { n: parties })})</span>}
            </p>
          )}
          <p>
            <strong>{t_game('difficulty')}:</strong> <span style={{ color: hoveredSeries.color }}>{dataKey}</span>
          </p>
        </div>
      );
    },
    [activeRaidInfo, server, isTotalChart, t_dash, t_ui, t_game],
  );

  return (
    <>
      {/* Component-scoped keyframes for the prediction cutoff markers (kept out of the global stylesheet). */}
      <style>{`
        @keyframes rsc-prediction-in { from { opacity: 0; } to { opacity: 1; } }
        .rsc-prediction-marker { animation: rsc-prediction-in 0.4s ease-out both; }
      `}</style>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4 bg-purple-50 dark:bg-neutral-800 p-3 sm:p-4 rounded-lg border border-purple-200 dark:border-neutral-700">
        <span className="font-bold text-sm text-purple-700 dark:text-purple-400 shrink-0">{t('show_prediction_cutoff')}</span>

        {/* Mode checkboxes behave like a radio group that can also be cleared */}
        {/* Checkbox & Select Container: Vertical (flex-col) on mobile, horizontal (sm:flex-row) from tablet. min-w-0 required */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 text-sm font-medium w-full md:w-auto min-w-0">
          {/* Mode checkbox group: wraps onto a second line on narrow screens instead of overflowing */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
            {activeScoreModel && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={effectiveMode === 'model'} onChange={(e) => setPredictionMode(e.target.checked ? 'model' : null)} />
                <span className="whitespace-nowrap">{t('prediction_mode_model')}</span>
              </label>
            )}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={effectiveMode === 'stats'} onChange={(e) => setPredictionMode(e.target.checked ? 'stats' : null)} />
              <span className="whitespace-nowrap">{t('prediction_mode_stats')}</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={effectiveMode === 'compare'} onChange={(e) => setPredictionMode(e.target.checked ? 'compare' : null)} />
              <span className="whitespace-nowrap">{t('prediction_mode_compare')}</span>
            </label>
          </div>

          {/* 3. Select Area: w-full for full-width on mobile; appropriate max-width with truncation from sm onwards */}
          {effectiveMode === 'compare' && (
            <div className="w-full sm:w-auto min-w-0 flex-1">
              <select
                className="w-full sm:max-w-50 lg:max-w-62.5 px-2 py-1.5 border rounded-md bg-white dark:bg-neutral-700 dark:border-neutral-600 outline-none truncate"
                value={compareRaidId}
                onChange={(e) => setCompareRaidId(e.target.value)}
                // Added title attribute to allow viewing full text on hover when truncated
                title={compareOptions.find((opt) => opt.value === compareRaidId)?.label || ''}
              >
                {compareOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mb-4 pb-3 border-b border-neutral-200 dark:border-neutral-700">
        <nav className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600'}`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {isZoomed && (
            <button
              onClick={resetZoom}
              className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-md transition-colors"
            >
              <FiRefreshCcw size={12} />
              {t_ui('reset')}
            </button>
          )}
          {(isRaid || activeTab !== 'total') && (
            <div className="flex gap-1 rounded-lg bg-neutral-200 dark:bg-neutral-700 p-1 text-xs font-semibold">
              <button onClick={() => setAxisType('score')} className={`px-3 py-1 rounded-md transition-colors ${axisType === 'score' ? 'bg-white dark:bg-neutral-900 shadow-sm' : ''}`}>
                {t_dash('byScore')}
              </button>
              <button onClick={() => setAxisType('time')} className={`px-3 py-1 rounded-md transition-colors ${axisType === 'time' ? 'bg-white dark:bg-neutral-900 shadow-sm' : ''}`}>
                {t_ui('time')}
              </button>
            </div>
          )}
        </div>
      </div>

      {isTotalChart ? (
        <div className="flex justify-center items-center flex-wrap gap-2 mb-4">
          {legendPayload.map((p) => (
            <button
              key={p.value}
              onClick={() => handleBracketToggle(p.value)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition-all duration-200 flex items-center gap-2 ${visibleDifficulties.has(p.value) ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
              style={{ backgroundColor: `${p.color}20`, color: p.color }}
            >
              <div style={{ width: 8, height: 8, backgroundColor: p.color, borderRadius: '50%' }} />
              {p.value}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <DifficultySelector availableDifficulties={availableGroups} selectedDiffs={selectedDiffs} setSelectedDiffs={setSelectedDiffs} />
        </div>
      )}

      <ResponsiveContainer width="100%" height={500}>
        {/* right margin: only the last X tick label needs the gap — a wide number ("3,000") when
            zoomed, just "1" at full view — so trim it when not zoomed. */}
        <ComposedChart data={pivotedData} margin={{ top: 20, right: isZoomed ? 20 : 8, bottom: 20, left: 20 }}>
          {/* allowDataOverflow whenever the rank axis is constrained (slider zoom OR difficulty
              subset): it's what turns on the series clip and makes Recharts honour a clipping
              domain. At the true full view every point is already inside the domain, so the clip
              is off and can't slice the rank-1 marker on the right edge. */}
          <XAxis type="number" dataKey="rank" fontSize={14} reversed={true} domain={xAxisDomain} allowDataOverflow={isRankConstrained} tickFormatter={(r: number) => r.toLocaleString()} />
          <YAxis
            domain={visibleYDomain ?? xDomain}
            allowDataOverflow={!!visibleYDomain}
            width={35}
            fontSize={14}
            ticks={visibleYDomain ? undefined : customTicks?.map((t) => t.value)}
            tick={twoLineY && panels ? <SplitYTick toScore={panels.yToScore} /> : undefined}
            tickFormatter={(value: number) => {
              if (axisType === 'score' || (!isRaid && activeTab === 'total')) {
                // Full view: exact panel-boundary labels. Zoomed (auto ticks): convert Y -> score.
                return customTicks?.find((t) => t.value === value)?.label ?? (panels ? formatScoreM(panels.yToScore(value)) : '');
              }
              return formatTimeToTimestamp(value).split('.')[0];
            }}
          />
          {/* Fixed, small marker size (default area is 64px^2 ~ r4.5; 14px^2 ~ r2.1) */}
          <ZAxis range={[14, 14]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={renderTooltip as React.ComponentProps<typeof Tooltip>['content']} />

          {/* Party-count zones (behind everything, unlabelled). Even counts get a faint shade so
              the zones read as a staircase; the exact count is in the tooltip on hover. */}
          {partyBands.map((band) => (
            <ReferenceArea key={band.key} y1={band.y1} y2={band.y2} fill="#808080" fillOpacity={band.n % 2 === 0 ? 0.1 : 0} stroke="none" ifOverflow="hidden" />
          ))}

          {currentPrediction && currentPrediction.mode === 'stats' && (
            <>
              <ReferenceArea
                key={`pred-band-${currentPrediction.min}-${currentPrediction.max}`}
                className="rsc-prediction-marker"
                x1={currentPrediction.min}
                x2={currentPrediction.max}
                fill="#a855f7"
                fillOpacity={0.15}
                ifOverflow="hidden"
              />
              {currentPrediction.q1 !== undefined && currentPrediction.q3 !== undefined && (
                <ReferenceArea
                  key={`pred-iqr-${currentPrediction.q1}-${currentPrediction.q3}`}
                  className="rsc-prediction-marker"
                  x1={currentPrediction.q1}
                  x2={currentPrediction.q3}
                  fill="#a855f7"
                  fillOpacity={0.12}
                  ifOverflow="hidden"
                />
              )}
              <ReferenceLine
                key={`pred-avg-${currentPrediction.avg}`}
                className="rsc-prediction-marker"
                x={currentPrediction.avg}
                stroke="#9333ea"
                strokeWidth={2}
                strokeDasharray="5 5"
                ifOverflow="hidden"
                label={{
                  position: 'top',
                  value: t('platinum_prediction_avg', { rank: Math.round(currentPrediction.avg).toLocaleString() }), // Applied localization (i18n)
                  fill: '#9333ea',
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
              />
            </>
          )}

          {currentPrediction && currentPrediction.mode === 'compare' && (
            <ReferenceLine
              key={`pred-compare-${currentPrediction.rank}`}
              className="rsc-prediction-marker"
              x={currentPrediction.rank}
              stroke="#9333ea"
              strokeWidth={2}
              strokeDasharray="5 5"
              ifOverflow="hidden"
              label={{
                position: 'top',
                // value: t('compare_cutoff', { name: compareDisplayName, rank: Math.round(currentPrediction.rank).toLocaleString() }), // Applied localization (i18n)
                value: t('platinum_prediction_avg', { rank: Math.round(currentPrediction.rank).toLocaleString() }), // Applied localization (i18n)
                fill: '#9333ea',
                fontSize: 12,
                fontWeight: 'bold',
              }}
            />
          )}

          {fusedPrediction && fusedPrediction.bandLow !== null && fusedPrediction.bandHigh !== null && (
            <ReferenceArea
              key={`pred-fused-band-x-${fusedPrediction.bandLow}-${fusedPrediction.bandHigh}`}
              className="rsc-prediction-marker"
              x1={fusedPrediction.bandLow}
              x2={fusedPrediction.bandHigh}
              fill="#a855f7"
              fillOpacity={0.15}
              ifOverflow="hidden"
            />
          )}
          {predictionIntersection?.fusedLow && predictionIntersection.fusedHigh && (
            <ReferenceArea
              key={`pred-fused-band-y-${predictionIntersection.fusedLow.yValue}-${predictionIntersection.fusedHigh.yValue}`}
              className="rsc-prediction-marker"
              y1={predictionIntersection.fusedLow.yValue}
              y2={predictionIntersection.fusedHigh.yValue}
              fill="#a855f7"
              fillOpacity={0.15}
              ifOverflow="hidden"
            />
          )}
          {fusedPrediction && (
            <ReferenceLine
              key={`pred-fused-${fusedPrediction.rank}`}
              className="rsc-prediction-marker"
              x={fusedPrediction.rank}
              stroke="#9333ea"
              strokeWidth={2}
              strokeDasharray="5 5"
              ifOverflow="hidden"
              label={{
                position: 'top',
                value: t('platinum_prediction_avg', { rank: Math.round(fusedPrediction.rank).toLocaleString() }),
                fill: '#9333ea',
                fontSize: 12,
                fontWeight: 'bold',
              }}
            />
          )}
          {fusedPrediction && predictionIntersection?.fused && (
            <ReferenceLine
              key={`pred-fused-y-${predictionIntersection.fused.yValue}`}
              className="rsc-prediction-marker"
              y={predictionIntersection.fused.yValue}
              stroke="#9333ea"
              strokeWidth={2}
              strokeDasharray="5 5"
              ifOverflow="hidden"
              label={{
                position: 'insideBottomLeft',
                value: predictionIntersection.fusedLow
                  ? t('prediction_fused_score', {
                      score: Math.round(fusedPrediction.score).toLocaleString(),
                      low: formatScoreM(Math.min(predictionIntersection.fusedLow.score, predictionIntersection.fusedHigh?.score ?? Infinity)),
                      high: formatScoreM(Math.max(predictionIntersection.fusedLow.score, predictionIntersection.fusedHigh?.score ?? -Infinity)),
                    })
                  : t('predicted_score', { score: Math.round(fusedPrediction.score).toLocaleString() }),
                fill: '#9333ea',
                fontSize: 12,
                fontWeight: 'bold',
              }}
            />
          )}

          {/* Display prediction data (Crosshair style) */}
          {currentPrediction && predictionIntersection && (
            <>
              {/* Vertical line: Predicted cutoff rank */}
              {predictionIntersection.avg && (
                <ReferenceLine
                  key={`pred-cross-x-${predictionIntersection.avg.rank}`}
                  className="rsc-prediction-marker"
                  x={predictionIntersection.avg.rank}
                  stroke="#d8b4fe"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.6}
                  ifOverflow="hidden"
                />
              )}

              {currentPrediction.mode === 'stats' && (
                <>
                  {predictionIntersection.min && predictionIntersection.max && (
                    <ReferenceArea
                      key={`pred-cross-band-${predictionIntersection.min.yValue}-${predictionIntersection.max.yValue}`}
                      className="rsc-prediction-marker"
                      y1={predictionIntersection.min.yValue}
                      y2={predictionIntersection.max.yValue}
                      fill="#a855f7"
                      fillOpacity={0.15}
                      ifOverflow="hidden"
                    />
                  )}
                  {predictionIntersection.q1 && predictionIntersection.q3 && (
                    <ReferenceArea
                      key={`pred-cross-iqr-${predictionIntersection.q1.yValue}-${predictionIntersection.q3.yValue}`}
                      className="rsc-prediction-marker"
                      y1={predictionIntersection.q1.yValue}
                      y2={predictionIntersection.q3.yValue}
                      fill="#a855f7"
                      fillOpacity={0.12}
                      ifOverflow="hidden"
                    />
                  )}
                  {/* Horizontal line: Intersection point on the curve (Y-axis) */}
                  {predictionIntersection.avg && (
                    <ReferenceLine
                      key={`pred-cross-y-${predictionIntersection.avg.yValue}`}
                      className="rsc-prediction-marker"
                      y={predictionIntersection.avg.yValue}
                      stroke="#9333ea"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      ifOverflow="hidden"
                      label={{
                        position: 'insideBottomLeft',
                        // Display the 'actual score' at the intersection
                        value: t('predicted_score', { score: predictionIntersection.avg.score.toLocaleString() }),
                        fill: '#9333ea',
                        fontSize: 12,
                        fontWeight: 'bold',
                      }}
                    />
                  )}
                </>
              )}

              {currentPrediction.mode === 'compare' && predictionIntersection.compare && (
                <ReferenceLine
                  key={`pred-cross-y-cmp-${predictionIntersection.compare.yValue}`}
                  className="rsc-prediction-marker"
                  y={predictionIntersection.compare.yValue}
                  stroke="#9333ea"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  ifOverflow="hidden"
                  label={{
                    position: 'insideBottomLeft',
                    // Display the 'actual score' at the intersection
                    value: t('predicted_score', { score: predictionIntersection.compare.score.toLocaleString() }),
                    // value: t('compare_cutoff', { name: compareDisplayName, score: predictionIntersection.compare.score.toLocaleString() }),
                    fill: '#9333ea',
                    fontSize: 12,
                    fontWeight: 'bold',
                  }}
                />
              )}
            </>
          )}

          {seriesElements}
        </ComposedChart>
      </ResponsiveContainer>

      {pivotedData.length > 2 && <RankZoomSlider min={visibleRankRange[0]} max={visibleRankRange[1]} value={rankDomain} onCommit={setRankWindow} onDraggingChange={setIsZooming} />}
    </>
  );
};

export default React.memo(RankScatterChart);
