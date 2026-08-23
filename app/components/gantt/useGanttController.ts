import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type Locale } from '~/utils/i18n/config';
import { MS_PER_HOUR, BASE_PIXELS_PER_HOUR } from './constants';
import type { GameServer } from '~/types/data';

// useLayoutEffect warns when it runs during SSR (it never actually runs server-side); fall back to
// useEffect there so this hook can be used in SSR routes without console noise.
const useIsomorphicLayoutEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect;

interface MarkerWeekly {
  left: number;
  label: string;
  date: string;
}

interface MarkerMonthly {
  left: number;
  label: string;
  isYearMarker: boolean;
  date: string;
}

interface UseGanttControllerProps {
  timeRange: { min: number; max: number };
  server?: GameServer; // | string;
  initialTime?: number | null;
}

export interface GanttControllerReturn {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  viewportWidth: number;
  scrollLeft: number;
  nowMarkerLeft: number | null;
  zoom: number;
  pixelsPerHour: number;

  // Helpers
  calculateLeftPx: (t: string) => number;
  calculateWidthPx: (s: string, e: string) => number;

  // Actions
  zoomIn: () => void;
  zoomOut: () => void;
  jumpToNow: () => void;
  scrollToTime: (time: number, smooth?: boolean) => void;
  getCurrentTime: () => number;

  // Markers
  markers: { daily: number[]; weekly: MarkerWeekly[]; monthly: MarkerMonthly[] };
}

export function useGanttController({ timeRange, server, initialTime }: UseGanttControllerProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language as Locale;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [nowMarkerLeft, setNowMarkerLeft] = useState<number | null>(null);

  const lastViewedTimeRef = useRef<number | null>(null);
  const isInitialized = useRef<boolean>(false);
  const isScrolling = useRef<boolean>(false);

  // --- Zoom Logic ---
  const [zoom, setZoom] = useState(1.0);
  const zoomIn = useCallback(() => setZoom((prev) => Math.min(prev / 0.9, 10.0)), []);
  const zoomOut = useCallback(() => setZoom((prev) => Math.max(prev * 0.9, 0.1)), []);
  const pixelsPerHour = BASE_PIXELS_PER_HOUR * zoom;

  // --- Calculations ---
  const calculateLeftPx = useCallback(
    (startTime: string) => {
      if (!timeRange.min) return 0;
      const startMs = new Date(startTime).getTime();
      return ((startMs - timeRange.min) / MS_PER_HOUR) * pixelsPerHour;
    },
    [timeRange.min, timeRange.max, locale, pixelsPerHour],
  );

  const calculateWidthPx = useCallback(
    (startTime: string, endTime: string) => {
      const startMs = new Date(startTime).getTime();
      const endMs = new Date(endTime).getTime();
      return ((endMs - startMs) / MS_PER_HOUR) * pixelsPerHour;
    },
    [pixelsPerHour],
  );

  // --- Helper: Calculate the time of the current scroll position ---
  const getCurrentTime = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !timeRange.min) return Date.now();
    const centerPx = el.scrollLeft + el.clientWidth / 2;
    const offsetMs = (centerPx / pixelsPerHour) * MS_PER_HOUR;
    return timeRange.min + offsetMs;
  }, [timeRange.min, timeRange.max, locale, pixelsPerHour]);

  // --- Actions ---
  const scrollToTime = useCallback(
    (timestamp: number, smooth = true) => {
      const el = scrollContainerRef.current;
      if (!el || !timeRange.min) return;

      const offsetMs = timestamp - timeRange.min;
      const targetPx = (offsetMs / MS_PER_HOUR) * pixelsPerHour;
      const centerPos = Math.max(0, targetPx - el.clientWidth / 2);

      if (smooth) {
        el.scrollTo({ left: centerPos, behavior: 'smooth' });
      } else {
        el.scrollLeft = centerPos;
        setScrollLeft(centerPos);
      }

      // Keep current time updated even when forced to move
      lastViewedTimeRef.current = timestamp;
    },
    [timeRange.min, timeRange.max, locale, pixelsPerHour],
  );

  const jumpToNow = useCallback(() => {
    scrollToTime(Date.now(), true);
  }, [scrollToTime]);

  // --- Markers ---
  // Gridlines align to viewer's local calendar (not UTC). SSR/client may show different values initially;
  // suppressHydrationWarning prevents regenerating DOM, letting React swap in client's correct local time.
  const markers = useMemo(() => {
    if (!timeRange.min) return { daily: [], weekly: [], monthly: [] };
    const daily: number[] = [];
    const weekly: MarkerWeekly[] = [];
    const monthly: MarkerMonthly[] = [];
    const start = new Date(timeRange.min);
    const end = new Date(timeRange.max);
    const curr = new Date(start);
    curr.setHours(4, 0, 0, 0);
    if (curr.getTime() < timeRange.min) curr.setDate(curr.getDate() + 1);

    while (curr <= end) {
      daily.push(calculateLeftPx(curr.toISOString()));
      curr.setDate(curr.getDate() + 1);
    }

    const targetDay = server === 'kr' ? 2 : 3;
    const weekCurr = new Date(start);
    weekCurr.setHours(4, 0, 0, 0);
    const dayDiff = (weekCurr.getDay() - targetDay + 7) % 7;
    weekCurr.setDate(weekCurr.getDate() - dayDiff);
    if (weekCurr.getTime() > timeRange.min) weekCurr.setDate(weekCurr.getDate() - 7);

    while (weekCurr <= end) {
      if (weekCurr.getTime() >= timeRange.min) {
        weekly.push({
          left: calculateLeftPx(weekCurr.toISOString()),
          label: weekCurr.toLocaleDateString(locale, { month: '2-digit', day: '2-digit' }),
          date: weekCurr.toISOString(),
        });
      }
      weekCurr.setDate(weekCurr.getDate() + 7);
    }

    const monthCurr = new Date(start.getFullYear(), start.getMonth(), 1);
    while (monthCurr <= end) {
      monthly.push({
        left: calculateLeftPx(monthCurr.toISOString()),
        label: monthCurr.toLocaleDateString(locale, { year: 'numeric', month: '2-digit' }),
        isYearMarker: monthCurr.getMonth() === 0,
        date: monthCurr.toISOString(),
      });
      monthCurr.setMonth(monthCurr.getMonth() + 1);
    }

    return { daily, weekly, monthly };
  }, [timeRange.min, timeRange.max, locale, server, calculateLeftPx]);

  // --- Effects ---

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      if (!isScrolling.current) {
        isScrolling.current = true;
        requestAnimationFrame(() => {
          if (el) {
            setScrollLeft(el.scrollLeft);
            const centerPx = el.scrollLeft + el.clientWidth / 2;
            const offsetMs = (centerPx / pixelsPerHour) * MS_PER_HOUR;
            if (timeRange.min) {
              lastViewedTimeRef.current = timeRange.min + offsetMs;
            }
          }
          isScrolling.current = false;
        });
      }
    };

    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [timeRange.min, timeRange.max, locale, pixelsPerHour]); // Dependency required because offset calculation changes as pixelsPerHour changes

  // 2a. One-time initial positioning (layout effect, before paint, avoids a flash of
  // scrollLeft=0 / unmeasured chart). Guarded to run once per real mount; see effect 2c
  // for how positioning stays correct when timeRange changes afterward.
  useIsomorphicLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !timeRange.min || isInitialized.current) return;

    setViewportWidth(el.clientWidth);
    const now = Date.now();
    setNowMarkerLeft(calculateLeftPx(new Date(now).toISOString()));
    scrollToTime(initialTime ?? now, false);
    isInitialized.current = true;
  }, [timeRange.min]);

  // 2b. Ongoing viewport width tracking (doesn't need to block paint).
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) setViewportWidth(entry.contentRect.width);
    });
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  // 2c. Re-center after timeRange changes post-init (server switch, or useLazySchedule extending
  // the range while scrolling); keeps the absolute time under the viewport stable.
  useEffect(() => {
    if (!isInitialized.current || !timeRange.min) return;
    setNowMarkerLeft(calculateLeftPx(new Date(Date.now()).toISOString()));
    if (lastViewedTimeRef.current) {
      scrollToTime(lastViewedTimeRef.current, false);
    }
  }, [timeRange.min, timeRange.max, locale, calculateLeftPx, scrollToTime]);

  return {
    scrollContainerRef,
    viewportWidth,
    scrollLeft,
    nowMarkerLeft,
    calculateLeftPx,
    calculateWidthPx,
    markers,
    jumpToNow,
    scrollToTime,
    getCurrentTime,
    zoom,
    zoomIn,
    zoomOut,
    pixelsPerHour,
  };
}
