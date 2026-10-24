import type { GameServer } from '~/types/data';

export type MarkerTz = 'utc' | 'local';

export interface MarkerWeekly {
  left: number;
  label: string;
  date: string;
}

export interface MarkerMonthly {
  left: number;
  label: string;
  isYearMarker: boolean;
  date: string;
}

export interface GanttMarkers {
  daily: number[];
  weekly: MarkerWeekly[];
  monthly: MarkerMonthly[];
}

interface DateOps {
  setHour4: (d: Date) => void;
  getDay: (d: Date) => number;
  getDate: (d: Date) => number;
  setDate: (d: Date, n: number) => void;
  getMonth: (d: Date) => number;
  setMonth: (d: Date, n: number) => void;
  monthStart: (d: Date) => Date;
}

const UTC_OPS: DateOps = {
  setHour4: (d) => d.setUTCHours(4, 0, 0, 0),
  getDay: (d) => d.getUTCDay(),
  getDate: (d) => d.getUTCDate(),
  setDate: (d, n) => d.setUTCDate(n),
  getMonth: (d) => d.getUTCMonth(),
  setMonth: (d, n) => d.setUTCMonth(n),
  monthStart: (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
};

const LOCAL_OPS: DateOps = {
  setHour4: (d) => d.setHours(4, 0, 0, 0),
  getDay: (d) => d.getDay(),
  getDate: (d) => d.getDate(),
  setDate: (d, n) => d.setDate(n),
  getMonth: (d) => d.getMonth(),
  setMonth: (d, n) => d.setMonth(n),
  monthStart: (d) => new Date(d.getFullYear(), d.getMonth(), 1),
};

interface BuildMarkersParams {
  min: number;
  max: number;
  tz: MarkerTz;
  locale: string;
  server?: GameServer;
  calculateLeftPx: (time: string) => number;
}

// Gridlines follow the viewer's local calendar, but the server can only know UTC. The first
// (SSR/hydration) render uses 'utc' so both sides produce identical markup; 'local' replaces it after hydration.
export function buildMarkers({ min, max, tz, locale, server, calculateLeftPx }: BuildMarkersParams): GanttMarkers {
  const daily: number[] = [];
  const weekly: MarkerWeekly[] = [];
  const monthly: MarkerMonthly[] = [];
  if (!min) return { daily, weekly, monthly };

  const ops = tz === 'utc' ? UTC_OPS : LOCAL_OPS;
  const labelZone = tz === 'utc' ? { timeZone: 'UTC' } : {};
  const start = new Date(min);
  const end = new Date(max);

  const curr = new Date(start);
  ops.setHour4(curr);
  if (curr.getTime() < min) ops.setDate(curr, ops.getDate(curr) + 1);
  while (curr <= end) {
    daily.push(calculateLeftPx(curr.toISOString()));
    ops.setDate(curr, ops.getDate(curr) + 1);
  }

  const targetDay = server === 'kr' ? 2 : 3;
  const weekCurr = new Date(start);
  ops.setHour4(weekCurr);
  const dayDiff = (ops.getDay(weekCurr) - targetDay + 7) % 7;
  ops.setDate(weekCurr, ops.getDate(weekCurr) - dayDiff);
  if (weekCurr.getTime() > min) ops.setDate(weekCurr, ops.getDate(weekCurr) - 7);
  while (weekCurr <= end) {
    if (weekCurr.getTime() >= min) {
      weekly.push({
        left: calculateLeftPx(weekCurr.toISOString()),
        label: weekCurr.toLocaleDateString(locale, { month: '2-digit', day: '2-digit', ...labelZone }),
        date: weekCurr.toISOString(),
      });
    }
    ops.setDate(weekCurr, ops.getDate(weekCurr) + 7);
  }

  const monthCurr = ops.monthStart(start);
  while (monthCurr <= end) {
    monthly.push({
      left: calculateLeftPx(monthCurr.toISOString()),
      label: monthCurr.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', ...labelZone }),
      isYearMarker: ops.getMonth(monthCurr) === 0,
      date: monthCurr.toISOString(),
    });
    ops.setMonth(monthCurr, ops.getMonth(monthCurr) + 1);
  }

  return { daily, weekly, monthly };
}
