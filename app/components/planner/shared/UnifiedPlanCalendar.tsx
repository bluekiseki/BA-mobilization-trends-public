import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { isoAddDays } from '~/utils/dateUtils';
import { normalizeStageLabel } from '~/utils/campaignUtils';

// 04:00 KST daily reset — same convention as TacticalPlanner.
// Adding this offset before flooring to UTC midnight maps KST 04:00 → virtual day boundary.
export const GAME_DAY_OFFSET_MS = 5 * 3600 * 1000;
const ONE_DAY_MS = 86_400_000;

export type BarType = 'event' | 'raid' | 'eraid' | 'multifloor' | 'campaign';

export interface ScheduleBarItem {
  name: string;
  type: BarType;
  startMs: number;
  endMs: number;
}

export interface CalendarSource {
  key: string;
  /** Item key for icon rendering and global selection sync (e.g. "Item_23", "Item_10043") */
  itemKey?: string;
  label: string;
  values: Record<string, number>;
  /** Provide to enable range-selection + apply panel. Omit for read-only / click-to-pick mode. */
  onApplyRange?: (start: string, end: string, value: number) => void;
  /** Called on single-cell click when onApplyRange is absent. */
  onDateClick?: (date: string) => void;
  valueLabel: string;
  /** M button sets value to this cap. */
  maxValue?: number;
  /** AP cost per unit — reserved for future AP tracking, not yet enforced. */
  apCostPerUnit?: number;
  /** When true, excluded from apply-panel source selector but still active for onDateClick routing. */
  hidden?: boolean;
  /** When provided, show a Remove button in the apply panel for this source. */
  onRemove?: () => void;
}

interface Props {
  startDate: string;
  visibleStartDate?: string;
  months: number;
  sources: CalendarSource[];
  activeSourceKey: string;
  onActiveSourceChange: (key: string) => void;
  scheduleItems: ScheduleBarItem[];
  /** Render an icon for a given itemKey using icon_info.json data */
  renderItemIcon?: (itemKey: string, size: number, amount: number) => React.ReactNode;
  /** Called when the selected range changes. Fires with (null, null) when deselected. */
  // onRangeChange?: (min: string | null, max: string | null) => void;
  /** Externally controlled range — syncs the internal visual selection. */
  // selectedMin?: string | null;
  // selectedMax?: string | null;
  selStart: string | null;
  committedEnd: string | null;
  setSelStart: (key: string | null) => void;
  setCommittedEnd: (key: string | null) => void;
  /** Rendered inline below the week row containing the last selected cell. */
  inlinePanel?: React.ReactNode;
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const BAR_ROW_H = 14;

const SOURCE_COLORS = ['#60a5fa', '#4ade80', '#f59e0b', '#f87171', '#c084fc'];

const BAR_CLASSES: Record<BarType, string> = {
  event: 'bg-green-500/20 border-l-2 border-green-500 text-green-700 dark:text-green-300',
  raid: 'bg-amber-500/20 border-l-2 border-amber-500 text-amber-700 dark:text-amber-300',
  eraid: 'bg-red-500/20 border-l-2 border-red-500 text-red-700 dark:text-red-300',
  multifloor: 'bg-blue-500/20 border-l-2 border-blue-500 text-blue-700 dark:text-blue-300',
  campaign: 'bg-neutral-500/15 border-l-2 border-neutral-400 text-neutral-600 dark:text-neutral-400',
};

// ---------------------------------------------------------------------------
// Bar geometry
// ---------------------------------------------------------------------------

interface WeekBar {
  item: ScheduleBarItem;
  leftPct: number;
  widthPct: number;
  row: number;
}

interface WeekRow {
  weekStartMs: number; // UTC midnight of Monday
  dates: (string | null)[];
}

/**
 * Greedy slot assignment — returns a slot index per item (same order as input).
 */
function assignSlots(items: ScheduleBarItem[]): number[] {
  const indexed = items.map((it, idx) => ({ it, idx })).sort((a, b) => a.it.startMs - b.it.startMs);
  const slotByIdx = new Array<number>(items.length).fill(0);
  const slotEndMs: number[] = [];
  for (const { it, idx } of indexed) {
    let slot = 0;
    while (slot < slotEndMs.length && (slotEndMs[slot] ?? 0) > it.startMs) slot++;
    slotByIdx[idx] = slot;
    slotEndMs[slot] = it.endMs;
  }
  return slotByIdx;
}

const TYPE_PRIORITY: BarType[] = ['eraid', 'raid', 'multifloor', 'event', 'campaign'];

/** Merge bars whose start and end timestamps are exactly identical into a single "A & B" bar. */
function mergeCoincident(items: ScheduleBarItem[]): ScheduleBarItem[] {
  const groups = new Map<string, ScheduleBarItem[]>();
  for (const it of items) {
    const key = `${it.startMs}:${it.endMs}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(it);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    const type = TYPE_PRIORITY.find((t) => group.some((it) => it.type === t)) ?? group[0].type;
    return {
      name: group.map((it) => it.name).join(' & '),
      type,
      startMs: Math.min(...group.map((it) => it.startMs)),
      endMs: Math.max(...group.map((it) => it.endMs)),
    };
  });
}

/**
 * Bar segments for one calendar week, positioned with 04:00 KST precision.
 *
 * Row layout:
 *   row 0: raid + eraid (Total Assault, Grand Assault)
 *   row 1: multifloor (Final Restriction Release) — only when raid/eraid is also present in this week
 *   row 1+: event + campaign bars with slot assignment
 */
function getWeekBars(weekStartMs: number, items: ScheduleBarItem[]): WeekBar[] {
  const gameWeekStart = weekStartMs - GAME_DAY_OFFSET_MS;
  const gameWeekEnd = gameWeekStart + 7 * ONE_DAY_MS;
  const span = 7 * ONE_DAY_MS;

  const overlapping = mergeCoincident(items.filter((it) => it.startMs < gameWeekEnd && it.endMs > gameWeekStart));
  // raid/eraid: row 0. multifloor: row 1 when raid/eraid also present, else row 0.
  // (multifloor runs all month; raid/eraid are shorter — separating avoids mid-month label overlap)
  const raids = overlapping.filter((it) => it.type === 'raid' || it.type === 'eraid');
  const multifloors = overlapping.filter((it) => it.type === 'multifloor');
  const events = overlapping.filter((it) => it.type === 'event' || it.type === 'campaign');

  const makeBar = (it: ScheduleBarItem, row: number): WeekBar => {
    const leftMs = Math.max(it.startMs, gameWeekStart);
    const rightMs = Math.min(it.endMs, gameWeekEnd);
    return {
      item: it,
      leftPct: ((leftMs - gameWeekStart) / span) * 100,
      widthPct: Math.max(0, ((rightMs - leftMs) / span) * 100),
      row,
    };
  };

  const hasRaids = raids.length > 0;
  const hasMultifloor = multifloors.length > 0;
  const result: WeekBar[] = [];
  for (const it of raids) result.push(makeBar(it, 0));
  for (const it of multifloors) result.push(makeBar(it, hasRaids ? 1 : 0));
  const contentRows = hasRaids && hasMultifloor ? 2 : hasRaids || hasMultifloor ? 1 : 0;

  if (events.length > 0) {
    const slots = assignSlots(events);
    events.forEach((it, i) => result.push(makeBar(it, contentRows + slots[i])));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Stage label normalization
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Date / time utilities
// ---------------------------------------------------------------------------

function buildMonthWeeks(year: number, month: number): WeekRow[] {
  const ym = `${year}-${String(month + 1).padStart(2, '0')}`;
  const days = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Mon=0

  const rows: WeekRow[] = [];
  let weekStartMs = Date.UTC(year, month, 1) - firstDow * ONE_DAY_MS;
  let row: (string | null)[] = Array<string | null>(firstDow).fill(null);

  for (let d = 1; d <= days; d++) {
    row.push(`${ym}-${String(d).padStart(2, '0')}`);
    if (row.length === 7) {
      rows.push({ weekStartMs, dates: row });
      weekStartMs += 7 * ONE_DAY_MS;
      row = [];
    }
  }
  if (row.length > 0) {
    while (row.length < 7) row.push(null);
    rows.push({ weekStartMs, dates: row });
  }
  return rows;
}

/** UTC ms → KST date string "M/D HH:00" */
function fmtKST(utcMs: number): string {
  const kst = new Date(utcMs + 9 * 3600 * 1000);
  const h = String(kst.getUTCHours()).padStart(2, '00');
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${h}:00`;
}

/** UTC ms → YYYY-MM-DD calendar date, treating 04:00 KST as day boundary */
function msToGameDate(utcMs: number): string {
  const d = new Date(utcMs + GAME_DAY_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function formatSourceLabel(label: string, t: (key: string) => string): string {
  const normalized = normalizeStageLabel(label);
  if (normalized) return normalized;
  const lower = label.toLowerCase();
  const campaignTypes = ['normal', 'hard', 'commission', 'bounty', 'schedule', 'scrimmage'];
  if (campaignTypes.includes(lower)) {
    const translated = t(`campaign.${lower}`);
    // Return the original label if i18n fails
    if (translated && !translated.includes('campaign.')) return translated;
  }
  return label;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UnifiedPlanCalendar({
  startDate,
  visibleStartDate,
  months,
  sources,
  activeSourceKey,
  onActiveSourceChange,
  scheduleItems,
  renderItemIcon,
  // onRangeChange,
  selStart,
  setSelStart,
  committedEnd,
  setCommittedEnd,
  // selectedMax,
  inlinePanel,
}: Props) {
  const { t: tCal } = useTranslation('calendar');
  // const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);
  // const [committedEnd, setCommittedEnd] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  // const [pendingValue, setPendingValue] = useState(0);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  // Internal source key for the range-apply panel (falls back to first onApplyRange source)
  // const [applySrcKey, setApplySrcKey] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  // Refs used inside non-passive event handlers (stale closure safe)
  const isDraggingRef = useRef(false);
  const startDateRef = useRef(startDate);
  const activeSourceRef = useRef<CalendarSource | undefined>(undefined);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchStartCellRef = useRef<string | null>(null);
  const isScrollGestureRef = useRef(false);
  const lastTouchEndRef = useRef(0);
  // True when the last touch gesture started on a calendar cell (not a bar strip).
  // Used to distinguish ghost clicks (follow a cell tap) from intentional bar taps.
  const lastTouchWasCellRef = useRef(false);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);
  useEffect(() => {
    startDateRef.current = startDate;
  }, [startDate]);

  const activeSource = sources.find((s) => s.key === activeSourceKey) ?? sources[0];
  useEffect(() => {
    activeSourceRef.current = activeSource;
  });

  // Source used for range-apply (hard stage farming). Falls back to first onApplyRange source.
  // const rangeApplySources = sources.filter((s) => s.onApplyRange);
  // const effectiveApplySrc = rangeApplySources.find((s) => s.key === applySrcKey) ?? rangeApplySources[0];
  const selRangeRef = useRef<[string | null, string | null]>([null, null]);

  // Synchronize whenever selStart or selEnd changes
  useEffect(() => {
    selRangeRef.current = [selStart, selEnd];
  }, [selStart, selEnd]);

  const updateRangeFromInputs = (nextStart: string | null, nextEnd: string | null) => {
    setSelStart(nextStart);
    setSelEnd(nextEnd);
    setCommittedEnd(nextEnd);
  };

  useEffect(() => {
    // Updated pointer-up handler
    const up = (e: Event) => {
      const wasTouch = e.type === 'touchend';
      const wasDragging = isDraggingRef.current;
      const wasScroll = isScrollGestureRef.current;
      const startCell = touchStartCellRef.current;

      if (wasTouch && !wasDragging && !wasScroll && startCell && startCell >= startDateRef.current) {
        const src = activeSourceRef.current;
        src?.onDateClick?.(startCell);
      }

      if (wasTouch && wasScroll) {
        setSelStart(null);
        setSelEnd(null);
      }

      // Commit the range when dragging ends
      if (wasDragging) {
        const [s, e] = selRangeRef.current;
        if (s && e) {
          const min = s <= e ? s : e;
          const max = s <= e ? e : s;
          // onRangeChangeRef.current?.(min, max);
          setSelStart(min);
          // setSelEnd(max)
          setCommittedEnd(max); // Commit when dragging ends
        }
      }

      if (wasTouch) {
        lastTouchWasCellRef.current = touchStartCellRef.current !== null;
        lastTouchEndRef.current = Date.now();
      }
      setIsDragging(false);
      isDraggingRef.current = false;
      isScrollGestureRef.current = false;
      touchStartCellRef.current = null;
    };

    document.addEventListener('mouseup', up);
    document.addEventListener('touchend', up);
    return () => {
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchend', up);
    };
  }, []);

  // Non-passive touchmove: horizontal drags the selection, vertical scrolls. Drag only
  // starts once the finger crosses into a different cell, so minor wobble on a tap doesn't mis-select.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];

      if (isDraggingRef.current) {
        e.preventDefault();
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const date = (target as HTMLElement | null)?.closest('[data-date]')?.getAttribute('data-date');
        if (date && date >= startDateRef.current) setSelEnd(date);
        return;
      }

      if (isScrollGestureRef.current || !touchStartCellRef.current) return;

      const dx = Math.abs(touch.clientX - touchStartXRef.current);
      const dy = Math.abs(touch.clientY - touchStartYRef.current);
      if (Math.max(dx, dy) < 6) return;

      if (dx >= dy) {
        // Horizontal: prevent scroll immediately so iOS doesn't lock into scroll mode
        e.preventDefault();
        if (!touchStartCellRef.current) return;
        const currentTarget = document.elementFromPoint(touch.clientX, touch.clientY);
        const currentDate = (currentTarget as HTMLElement | null)?.closest('[data-date]')?.getAttribute('data-date');
        // Enter drag only when finger has crossed into a different cell
        if (currentDate && currentDate !== touchStartCellRef.current && currentDate >= startDateRef.current) {
          // const src = activeSourceRef.current;
          isDraggingRef.current = true;
          setIsDragging(true);
          setSelStart(touchStartCellRef.current);
          setSelEnd(currentDate);
          // setPendingValue(src?.values[touchStartCellRef.current] ?? 0);
        }
      } else {
        isScrollGestureRef.current = true;
        // Cancel any selection set by touchstart
        setSelStart(null);
        setSelEnd(null);
      }
    };
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', handleTouchMove);
  }, []);

  const monthList = useMemo(() => {
    const list: { year: number; month: number }[] = [];
    if (months <= 0) return list;
    const d = new Date((visibleStartDate ?? startDate) + 'T00:00:00Z');
    let y = d.getUTCFullYear(),
      m = d.getUTCMonth();
    for (let i = 0; i < months; i++) {
      list.push({ year: y, month: m });
      if (++m >= 12) {
        m = 0;
        y++;
      }
    }
    return list;
  }, [startDate, visibleStartDate, months]);

  const lastVisibleDate = useMemo(() => {
    if (monthList.length === 0) return null;
    const { year, month } = monthList[monthList.length - 1];
    const lastDay = new Date(year, month + 1, 0).getDate();
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }, [monthList]);

  // Pre-compute week rows + bars per month (no drag-state deps → stable)
  const monthData = useMemo(
    () =>
      monthList.map(({ year, month }) => ({
        year,
        month,
        weeks: buildMonthWeeks(year, month).map((week) => ({
          ...week,
          bars: getWeekBars(week.weekStartMs, scheduleItems),
        })),
      })),
    [monthList, scheduleItems],
  );

  const [rangeMin, rangeMax] = useMemo((): [string | null, string | null] => {
    if (!selStart || !selEnd) return [null, null];
    return selStart <= selEnd ? [selStart, selEnd] : [selEnd, selStart];
  }, [selStart, selEnd]);

  const selectedDates = useMemo(() => {
    if (!rangeMin || !rangeMax) return new Set<string>();
    const s = new Set<string>();
    let cur = rangeMin;
    while (cur <= rangeMax) {
      s.add(cur);
      cur = isoAddDays(cur, 1);
    }
    return s;
  }, [rangeMin, rangeMax]);

  const handleCellMouseDown = (date: string, srcKey?: string) => {
    if (date < startDate) return;
    if (Date.now() - lastTouchEndRef.current < 500) return;
    // Direct click on a specific source indicator → route to that source's onDateClick
    if (srcKey) {
      const src = sources.find((s) => s.key === srcKey);
      src?.onDateClick?.(date);
      setSelStart(date);
      setSelEnd(date);
      // setCommittedEnd(date); // Commit immediately on click

      return;
    }
    setIsDragging(true);
    setSelStart(date);
    setSelEnd(date);
    if (!activeSource?.onApplyRange) {
      activeSource?.onDateClick?.(date);
    } else {
      // setPendingValue(activeSource.values[date] ?? 0);
      // Also fire onDateClick when present alongside onApplyRange (e.g. pvp coins open shop panel)
      activeSource?.onDateClick?.(date);
    }
  };

  const handleCellMouseEnter = (date: string) => {
    if (!isDragging || date < startDate) return;
    setSelEnd(date);
  };

  const handleBarClick = (item: ScheduleBarItem) => {
    // Only suppress if the previous touch started on a CELL (potential iOS ghost click landing on nearby bar).
    // If the user directly tapped the bar (lastTouchWasCellRef = false), allow the click through.
    if (lastTouchWasCellRef.current && Date.now() - lastTouchEndRef.current < 500) return;
    const start = msToGameDate(item.startMs);
    const end = msToGameDate(item.endMs - 1);
    const clampedStart = start < startDate ? startDate : start;
    setSelStart(clampedStart);
    setSelEnd(end);
    setCommittedEnd(end);
    if (!activeSource?.onApplyRange) {
      const editable = sources.find((s) => s.onApplyRange);
      if (editable) {
        onActiveSourceChange(editable.key);
      } else {
        activeSource?.onDateClick?.(clampedStart);
      }
    }
  };

  // const apply = (value: number) => {
  //   if (!rangeMin || !rangeMax || !effectiveApplySrc?.onApplyRange) return;
  //   effectiveApplySrc.onApplyRange(rangeMin, rangeMax, value);
  //   setSelStart(null);
  //   setSelEnd(null);
  // };

  const gridCls = months <= 1 ? 'grid-cols-1' : months <= 3 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3';

  return (
    <div ref={containerRef} className="space-y-3 select-none" onDragStart={(e) => e.preventDefault()}>
      {/* Month grids */}
      <div className={`grid gap-6 ${gridCls}`}>
        {monthData.map(({ year, month, weeks }) => (
          <div key={`${year}-${month}`}>
            <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
              {MONTH_NAMES[month]} {year}
            </p>

            <div className="grid grid-cols-7">
              {/* Day-of-week headers */}
              {DOW.map((d) => (
                <div key={d} className="text-center text-[10px] text-neutral-400 dark:text-neutral-500 pb-0.5 font-medium">
                  {d}
                </div>
              ))}

              {/* Week rows */}
              {weeks.map((week, wi) => {
                const totalBarRows = week.bars.length > 0 ? Math.max(...week.bars.map((b) => b.row)) + 1 : 0;
                const isTargetWeek = inlinePanel != null && committedEnd !== null && week.dates.some((d) => d === committedEnd);

                return (
                  <Fragment key={`${year}-${month}-${wi}`}>
                    <div className="col-span-7 border-b border-neutral-100 dark:border-neutral-800 last:border-b-0">
                      {/* Day cell row */}
                      <div className="grid grid-cols-7">
                        {week.dates.map((date, ci) => {
                          if (!date) return <div key={`e${wi}-${ci}`} />;
                          const past = date < startDate;
                          const sel = selectedDates.has(date);
                          const sourcesToShow = sources.map((src, idx) => ({ src, idx, v: src.values[date] ?? 0 })).filter(({ v }) => v > 0);

                          return (
                            <div
                              key={date}
                              data-date={date}
                              onMouseDown={
                                past
                                  ? undefined
                                  : (e) => {
                                      const srcKey = (e.target as HTMLElement).closest('[data-src-key]')?.getAttribute('data-src-key') ?? undefined;
                                      handleCellMouseDown(date, srcKey);
                                    }
                              }
                              onTouchStart={
                                past
                                  ? undefined
                                  : (e) => {
                                      touchStartXRef.current = e.touches[0].clientX;
                                      touchStartYRef.current = e.touches[0].clientY;
                                      touchStartCellRef.current = date;
                                      isScrollGestureRef.current = false;
                                      setSelStart(date);
                                      setSelEnd(date);
                                    }
                              }
                              onMouseEnter={
                                past
                                  ? undefined
                                  : () => {
                                      handleCellMouseEnter(date);
                                      setHoveredDate(date);
                                    }
                              }
                              onMouseLeave={past ? undefined : () => setHoveredDate(null)}
                              className={[
                                'border-r border-neutral-100 dark:border-neutral-800 last:border-r-0',
                                'px-0.5 py-1 min-h-[36px]',
                                past ? 'text-neutral-300 dark:text-neutral-700' : 'cursor-pointer',
                                sel ? 'bg-blue-500/25 dark:bg-blue-400/20' : !past && hoveredDate === date ? 'bg-neutral-100 dark:bg-neutral-800' : 'bg-white dark:bg-neutral-900',
                              ].join(' ')}
                            >
                              <div className="font-mono text-[10px] leading-none text-neutral-500 dark:text-neutral-400 mb-0.5">{parseInt(date.slice(8))}</div>
                              {!past && sourcesToShow.length > 0 && (
                                <div className="flex flex-wrap gap-x-0.5 gap-y-0.5">
                                  {sourcesToShow.map(({ src, idx, v }) => (
                                    <span
                                      key={src.key}
                                      data-src-key={src.onDateClick ? src.key : undefined}
                                      className={`flex items-center gap-px leading-none ${src.onDateClick ? 'cursor-pointer' : ''} ${
                                        v > 0 ? (src.key === activeSource?.key ? 'opacity-100' : 'opacity-50') : 'opacity-20'
                                      }`}
                                    >
                                      {src.itemKey && renderItemIcon
                                        ? renderItemIcon(src.itemKey, 8, v)
                                        : (() => {
                                            const short = formatSourceLabel(src.label, tCal as (key: string) => string);
                                            if (!short) return null;
                                            return (
                                              <span className="text-[7px] font-mono leading-none" style={{ color: SOURCE_COLORS[idx % SOURCE_COLORS.length] }} title={`${short} ×${v}`}>
                                                {short} ×{v}
                                              </span>
                                            );
                                          })()}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Bar strip */}
                      {totalBarRows > 0 && (
                        <div className="relative overflow-hidden bg-white dark:bg-neutral-900" style={{ height: totalBarRows * BAR_ROW_H }}>
                          {/* Match column dividers to gap-px in both color and position */}
                          {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div
                              key={`cdiv-${i}`}
                              className="absolute top-0 bottom-0 border-r border-neutral-100 dark:border-neutral-800 pointer-events-none"
                              style={{ left: `${(i / 7) * 100}%`, zIndex: 2 }}
                            />
                          ))}

                          {/* Hover/selection background column */}
                          {week.dates.map((date, ci) => {
                            if (!date) return null;
                            const hov = date === hoveredDate;
                            const sel = selectedDates.has(date);
                            if (!hov && !sel) return null;
                            return (
                              // Match the bar strip hover color to the day cell
                              <div
                                key={`col-${date}`}
                                className={`absolute top-0 bottom-0 ${
                                  sel ? 'bg-blue-500/25 dark:bg-blue-400/20' : 'bg-neutral-100 dark:bg-neutral-800' // Match alignment
                                }`}
                                style={{ left: `${(ci / 7) * 100}%`, width: `${(1 / 7) * 100}%` }}
                              />
                            );
                          })}

                          {/* Hit area — below the bars (z-index 0) */}
                          {week.dates.map((date, ci) => {
                            if (!date || date < startDate) return null;
                            return (
                              <div
                                key={`hit-${date}`}
                                data-date={date}
                                className="absolute top-0 bottom-0 cursor-pointer"
                                style={{ left: `${(ci / 7) * 100}%`, width: `${(1 / 7) * 100}%`, zIndex: 0 }}
                                onMouseEnter={() => {
                                  handleCellMouseEnter(date);
                                  setHoveredDate(date);
                                }}
                                onMouseLeave={() => setHoveredDate(null)}
                                onMouseDown={() => handleCellMouseDown(date)}
                                onTouchStart={(e) => {
                                  touchStartXRef.current = e.touches[0].clientX;
                                  touchStartYRef.current = e.touches[0].clientY;
                                  touchStartCellRef.current = date;
                                  isScrollGestureRef.current = false;
                                  setSelStart(date);
                                  setSelEnd(date);
                                }}
                              />
                            );
                          })}

                          {/* Bars — above the hit area (z-index 1) */}
                          {week.bars.map((seg, i) => (
                            <div
                              key={i}
                              title={`${formatSourceLabel(seg.item.name, tCal as (key: string) => string)}\n${fmtKST(seg.item.startMs)} → ${fmtKST(seg.item.endMs)} KST`}
                              onClick={() => handleBarClick(seg.item)}
                              className={`absolute flex items-center overflow-hidden rounded-sm text-[9px] font-medium px-1 cursor-pointer hover:brightness-110 ${BAR_CLASSES[seg.item.type]}`}
                              style={{
                                left: `${seg.leftPct}%`,
                                width: `${seg.widthPct}%`,
                                top: `${seg.row * BAR_ROW_H}px`,
                                height: `${BAR_ROW_H - 2}px`,
                                zIndex: 1,
                              }}
                            >
                              {seg.widthPct > 10 && (
                                <span className="truncate leading-none" title={formatSourceLabel(seg.item.name, tCal as (key: string) => string)}>
                                  {formatSourceLabel(seg.item.name, tCal as (key: string) => string)}
                                </span>
                              )}
                            </div>
                          ))}

                          {/* Column dividers */}
                          {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={`cdiv-${i}`} className="absolute top-0 bottom-0 w-px bg-neutral-100 dark:bg-neutral-800 pointer-events-none" style={{ left: `${(i / 7) * 100}%`, zIndex: 2 }} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* inline panel */}
                    <div className={`col-span-7 border-b border-neutral-100 dark:border-neutral-800 ${isTargetWeek ? '' : 'hidden'}`}>{inlinePanel}</div>
                  </Fragment>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {inlinePanel != null && committedEnd !== null && lastVisibleDate !== null && committedEnd > lastVisibleDate && (
        <div className="border-t border-neutral-100 dark:border-neutral-800">{inlinePanel}</div>
      )}

      {(selStart || committedEnd) && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 px-4 py-2 flex items-center gap-2">
          <input
            type="date"
            value={selStart ?? ''}
            onChange={(e) => updateRangeFromInputs(e.target.value || null, committedEnd)}
            className="px-1.5 py-1 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400"
          />
          <span className="text-neutral-400 dark:text-neutral-500 text-xs">–</span>
          <input
            type="date"
            value={committedEnd ?? ''}
            onChange={(e) => updateRangeFromInputs(selStart, e.target.value || null)}
            className="px-1.5 py-1 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={() => {
              setSelStart(null);
              setSelEnd(null);
              setCommittedEnd(null);
            }}
            className="ml-auto text-xs text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
