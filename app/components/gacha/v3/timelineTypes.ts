import type { PyroLogKey } from '~/utils/pyroxeneCalc';
export interface LogEntry {
  i18nKey?: PyroLogKey;
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
  /** Balance at the user-selected KPI percentile (see the KPI percentile stat) — independent of the fixed P10/50/90/99.5 lines above. */
  pyroxeneKpi: number;
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
  students: { id: number; name: string }[];
}
