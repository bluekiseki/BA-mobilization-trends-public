import { isoAddDays } from '~/utils/dateUtils';
import type { ResourcePlanEvent } from '~/types/resourcePlan';

export type { ResourcePlanEvent };

/**
 * Generic resource timeline system.
 *
 * Items are identified by opaque string keys (e.g. 'Currency_18', 'Item_7').
 * No business logic about specific items lives here.
 *
 * Supports deterministic deltas, exact probability distributions, and legacy
 * probabilistic bands. Exact distributions are used for P10/P50/P90 whenever
 * adapters provide a PMF.
 */

/** A single day's balance for one item — P-band version. */
export interface ResourceBandPoint {
  date: string; // YYYY-MM-DD
  p10: number; // pessimistic balance
  p50: number; // median balance
  p90: number; // optimistic balance
  probabilistic?: boolean;
}

export interface ResourceDistributionEntry {
  amount: number;
  probability: number;
}

/**
 * Standard normal quantile table (percentile → z-score), for computing
 * arbitrary-percentile balances from (mean, sigma) in binomial-approximated events.
 * Linear interpolation is applied between entries.
 */
const NORMAL_QUANTILE_TABLE: [number, number][] = [
  [1, -2.3263],
  [5, -1.6449],
  [10, -1.2816],
  [15, -1.0364],
  [20, -0.8416],
  [25, -0.6745],
  [30, -0.5244],
  [35, -0.3853],
  [40, -0.2533],
  [45, -0.1257],
  [50, 0],
  [55, 0.1257],
  [60, 0.2533],
  [65, 0.3853],
  [70, 0.5244],
  [75, 0.6745],
  [80, 0.8416],
  [85, 1.0364],
  [90, 1.2816],
  [95, 1.6449],
  [99, 2.3263],
];

export function normalQuantile(pct: number): number {
  const t = NORMAL_QUANTILE_TABLE;
  if (pct <= t[0][0]) return t[0][1];
  if (pct >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 0; i < t.length - 1; i++) {
    const [p0, z0] = t[i];
    const [p1, z1] = t[i + 1];
    if (pct <= p1) return z0 + ((z1 - z0) * (pct - p0)) / (p1 - p0);
  }
  return 0;
}

function timelineQuantile(pct: number): number {
  if (pct === 10) return -1.28;
  if (pct === 50) return 0;
  if (pct === 90) return 1.28;
  return normalQuantile(pct);
}

/** Backwards-compat alias (single-value usage) */
export interface ResourceDailyPoint {
  date: string;
  amount: number;
}

/**
 * A generic resource event used by adapters → timeline builder.
 *
 * - `delta`: deterministic (same for all percentiles)
 * - `band`: fallback approximation — p50 is mean, sigma derived from p90-p50
 * - `dist`: exact distribution via a PMF and/or percentile accessor (for gacha / non-normal sources)
 *
 * `dist` takes priority over `band` when computing planning lines at a given percentile.
 * `band` is still used when no exact PMF is available.
 */
export interface ResourceEvent {
  itemKey: string;
  delta?: number; // positive = gain, negative = spend
  band?: { p10: number; p50: number; p90: number };
  /** Exact distribution — use for non-normal distributions (e.g. gacha eligma) and binomial drops. */
  dist?: {
    entries?: ResourceDistributionEntry[];
    getAtPercentile: (pct: number) => number;
    getMean?: () => number;
  };
  /** Specific date (YYYY-MM-DD). Required unless monthlyRecurring. */
  date?: string;
  /** If true, fires on the 1st of each calendar month. */
  monthlyRecurring?: true;
  source?: string;
  /**
   * Resolved at render time:
   *   - Contains ':' → i18n key (e.g. 'resources:eventLabels.shopRefresh')
   *   - Otherwise → item key looked up via LocalizeEtc (e.g. 'Item_8', 'Currency_18')
   */
  labelKey?: string;
  labelParams?: Record<string, string | number>;
}

export function normalizeResourceDistribution(entries: ResourceDistributionEntry[]): ResourceDistributionEntry[] {
  const merged = new Map<number, number>();
  for (const entry of entries) {
    if (!Number.isFinite(entry.amount) || !Number.isFinite(entry.probability) || entry.probability <= 0) continue;
    const amount = Math.round(entry.amount);
    merged.set(amount, (merged.get(amount) ?? 0) + entry.probability);
  }
  const total = [...merged.values()].reduce((sum, p) => sum + p, 0);
  if (total <= 0) return [{ amount: 0, probability: 1 }];
  return [...merged.entries()].map(([amount, probability]) => ({ amount, probability: probability / total })).sort((a, b) => a.amount - b.amount);
}

export function getResourceDistributionPercentile(entries: ResourceDistributionEntry[], pct: number): number {
  const normalized = normalizeResourceDistribution(entries);
  const target = Math.max(0, Math.min(100, pct)) / 100;
  let cumulative = 0;
  for (const entry of normalized) {
    cumulative += entry.probability;
    if (cumulative >= target) return entry.amount;
  }
  return normalized[normalized.length - 1]?.amount ?? 0;
}

export function getResourceDistributionMean(entries: ResourceDistributionEntry[]): number {
  const normalized = normalizeResourceDistribution(entries);
  return normalized.reduce((sum, entry) => sum + entry.amount * entry.probability, 0);
}

function convolveDistributions(a: Map<number, number>, b: ResourceDistributionEntry[]): Map<number, number> {
  const normalizedB = normalizeResourceDistribution(b);
  const result = new Map<number, number>();
  for (const [amountA, probA] of a) {
    for (const entryB of normalizedB) {
      const nextAmount = amountA + entryB.amount;
      result.set(nextAmount, (result.get(nextAmount) ?? 0) + probA * entryB.probability);
    }
  }
  return result;
}

function mapPercentile(dist: Map<number, number>, pct: number): number {
  return getResourceDistributionPercentile(
    [...dist.entries()].map(([amount, probability]) => ({ amount, probability })),
    pct,
  );
}

/**
 * Historical inventory snapshot — persisted externally to allow "past data" replay.
 */
export interface ResourceSnapshot {
  date: string;
  inventory: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Plan event helpers
// ---------------------------------------------------------------------------

/**
 * Total amount gained (by gainItemKey) via a specific spend→gain exchange
 * in a given calendar month.  Works for any item pair (cert→eligma, cert→eleph, coin→eleph, etc.)
 */
export function monthPurchaseTotal(events: ResourcePlanEvent[], yearMonth: string, gainItemKey: string, spendItemKey: string): number {
  return events.filter((e) => e.date.startsWith(yearMonth) && e.gainItemKey === gainItemKey && e.spendItemKey === spendItemKey).reduce((s, e) => s + (e.gainAmount ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TimelineAnnotation {
  /** Stable grouping key — language-agnostic, not shown to users directly. */
  label: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  delta: number;
  source?: string;
}

/**
 * Group events into per-item, per-date annotation lists for chart tooltips.
 * Band events use p50 as the representative delta.
 */
export function buildAnnotations(events: ResourceEvent[]): Record<string, Record<string, TimelineAnnotation[]>> {
  const result: Record<string, Record<string, TimelineAnnotation[]>> = {};
  for (const ev of events) {
    if (!ev.date) continue;
    if (!result[ev.itemKey]) result[ev.itemKey] = {};
    if (!result[ev.itemKey][ev.date]) result[ev.itemKey][ev.date] = [];
    const groupKey = ev.labelKey ? (ev.labelParams ? `${ev.labelKey}:${JSON.stringify(ev.labelParams)}` : ev.labelKey) : (ev.source ?? 'unknown');
    result[ev.itemKey][ev.date].push({
      label: groupKey,
      labelKey: ev.labelKey,
      labelParams: ev.labelParams,
      delta: ev.band ? ev.band.p50 : (ev.delta ?? 0),
      source: ev.source,
    });
  }
  return result;
}

interface ResourceEventBuckets {
  meanPerItem: Record<string, Record<string, number>>;
  varPerItem: Record<string, Record<string, number>>;
  distPerItem: Record<string, Record<string, ResourceDistributionEntry[][]>>;
  allItemKeys: Set<string>;
}

function buildResourceEventBuckets(startDate: string, days: number, initialInventory: Record<string, number>, events: ResourceEvent[], alwaysIncludeKeys?: Set<string>): ResourceEventBuckets {
  const endDate = isoAddDays(startDate, days - 1);
  const meanPerItem: Record<string, Record<string, number>> = {};
  const varPerItem: Record<string, Record<string, number>> = {};
  const distPerItem: Record<string, Record<string, ResourceDistributionEntry[][]>> = {};

  const addEvent = (itemKey: string, date: string, mean: number, variance: number, dist?: ResourceDistributionEntry[]) => {
    if (date < startDate || date > endDate) return;
    if (!meanPerItem[itemKey]) {
      meanPerItem[itemKey] = {};
      varPerItem[itemKey] = {};
      distPerItem[itemKey] = {};
    }
    meanPerItem[itemKey][date] = (meanPerItem[itemKey][date] ?? 0) + mean;
    varPerItem[itemKey][date] = (varPerItem[itemKey][date] ?? 0) + variance;
    if (dist?.length) {
      if (!distPerItem[itemKey][date]) distPerItem[itemKey][date] = [];
      distPerItem[itemKey][date].push(dist);
    }
  };

  for (const ev of events) {
    const exactEntries = ev.dist?.entries ? normalizeResourceDistribution(ev.dist.entries) : undefined;
    const mean = exactEntries ? getResourceDistributionMean(exactEntries) : ev.band ? ev.band.p50 : (ev.delta ?? 0);
    const sigma = exactEntries ? 0 : ev.band ? (ev.band.p90 - ev.band.p50) / 1.28 : 0;
    const variance = sigma * sigma;

    if (ev.monthlyRecurring) {
      const origin = ev.date ?? startDate;
      const [oy, om] = origin.split('-').map(Number);
      let year = oy;
      let month = om;
      for (let i = 0; i < Math.ceil(days / 28) + 2; i++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-01`;
        if (dateStr > endDate) break;
        addEvent(ev.itemKey, dateStr, mean, variance, exactEntries);
        month++;
        if (month > 12) {
          month = 1;
          year++;
        }
      }
    } else if (ev.date) {
      addEvent(ev.itemKey, ev.date, mean, variance, exactEntries);
    }
  }

  return {
    meanPerItem,
    varPerItem,
    distPerItem,
    allItemKeys: new Set([...Object.keys(meanPerItem), ...Object.keys(initialInventory).filter((k) => (initialInventory[k] ?? 0) > 0), ...(alwaysIncludeKeys ?? [])]),
  };
}

function advanceDistributionOneDay(exactDist: Map<number, number>, means: Record<string, number>, dists: Record<string, ResourceDistributionEntry[][]>, date: string): Map<number, number> {
  const dateDists = dists[date] ?? [];
  let nextDist = exactDist;
  for (const dist of dateDists) nextDist = convolveDistributions(nextDist, dist);
  const deterministicOrLegacyMean = (means[date] ?? 0) - dateDists.reduce((sum, dist) => sum + getResourceDistributionMean(dist), 0);
  if (Math.abs(deterministicOrLegacyMean) > 1e-9) {
    nextDist = convolveDistributions(nextDist, [{ amount: deterministicOrLegacyMean, probability: 1 }]);
  }
  return nextDist;
}

function mapMean(dist: Map<number, number>): number {
  return getResourceDistributionMean([...dist.entries()].map(([amount, probability]) => ({ amount, probability })));
}

/**
 * Build daily P10/P50/P90 running-balance timelines for each item referenced
 * in `events`.
 *
 * Deterministic events (delta) contribute identically to all three percentiles.
 * Exact probabilistic events (dist.entries) are convolved as PMFs.
 * Legacy band events fall back to mean/variance approximation.
 *
 * @param startDate        First day of the prediction window (YYYY-MM-DD)
 * @param days             Length of window in days
 * @param initialInventory Starting amounts keyed by itemKey
 * @param events           All resource events (spend / gain, one-time or recurring)
 * @returns                Map of itemKey → ResourceBandPoint[]
 */
export function buildResourceTimelines(
  startDate: string,
  days: number,
  initialInventory: Record<string, number>,
  events: ResourceEvent[],
  alwaysIncludeKeys?: Set<string>,
): Record<string, ResourceBandPoint[]> {
  const buckets = buildResourceEventBuckets(startDate, days, initialInventory, events, alwaysIncludeKeys);
  const result: Record<string, ResourceBandPoint[]> = {};

  for (const itemKey of buckets.allItemKeys) {
    const means = buckets.meanPerItem[itemKey] ?? {};
    const vars = buckets.varPerItem[itemKey] ?? {};
    const dists = buckets.distPerItem[itemKey] ?? {};
    const points: ResourceBandPoint[] = [];
    let cumVar = 0;
    let exactDist = new Map<number, number>([[initialInventory[itemKey] ?? 0, 1]]);
    for (let i = 0; i < days; i++) {
      const date = isoAddDays(startDate, i);
      cumVar += vars[date] ?? 0;
      exactDist = advanceDistributionOneDay(exactDist, means, dists, date);
      const sigma = Math.sqrt(cumVar);
      const probabilistic = exactDist.size > 1 || cumVar > 0;
      points.push({
        date,
        p10: Math.round(mapPercentile(exactDist, 10) - 1.28 * sigma),
        p50: Math.round(mapPercentile(exactDist, 50)),
        p90: Math.round(mapPercentile(exactDist, 90) + 1.28 * sigma),
        ...(probabilistic ? { probabilistic: true } : {}),
      });
    }
    result[itemKey] = points;
  }

  return result;
}

export function buildResourcePlanningTimelines(
  startDate: string,
  days: number,
  initialInventory: Record<string, number>,
  events: ResourceEvent[],
  mode: { type: 'percentile'; percentile: number } | { type: 'mean' },
  alwaysIncludeKeys?: Set<string>,
): Record<string, ResourceBandPoint[]> {
  const buckets = buildResourceEventBuckets(startDate, days, initialInventory, events, alwaysIncludeKeys);
  const result: Record<string, ResourceBandPoint[]> = {};

  for (const itemKey of buckets.allItemKeys) {
    const means = buckets.meanPerItem[itemKey] ?? {};
    const vars = buckets.varPerItem[itemKey] ?? {};
    const dists = buckets.distPerItem[itemKey] ?? {};
    const points: ResourceBandPoint[] = [];
    let cumVar = 0;
    let exactDist = new Map<number, number>([[initialInventory[itemKey] ?? 0, 1]]);

    for (let i = 0; i < days; i++) {
      const date = isoAddDays(startDate, i);
      cumVar += vars[date] ?? 0;
      exactDist = advanceDistributionOneDay(exactDist, means, dists, date);
      const sigma = Math.sqrt(cumVar);
      const value = mode.type === 'mean' ? mapMean(exactDist) : mapPercentile(exactDist, mode.percentile) + timelineQuantile(mode.percentile) * sigma;
      const rounded = Math.round(value);
      points.push({
        date,
        p10: rounded,
        p50: rounded,
        p90: rounded,
        ...(exactDist.size > 1 || cumVar > 0 ? { probabilistic: true } : {}),
      });
    }
    result[itemKey] = points;
  }

  return result;
}
