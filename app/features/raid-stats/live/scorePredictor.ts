// Total Assault platinum-cut predictor (fuse over 12/24/48h lags).
// The model tables are trained and exported offline; this module only does inference from the live timeline snapshots.

/** [beta, my, mx, lo, hi] of the per-H regression log(R) = my + beta * (psi - mx). */
export type LagParams = readonly [number, number, number, number, number];

export interface ScoreModel {
  version: number;
  generatedAt: string;
  trainSeasons: number[];
  targetRank: number;
  cap: number;
  lagHours: number[];
  hGrid: { min: number; max: number; step: number };
  baselineR: (number | null)[];
  lags: Record<string, (LagParams | null)[]>;
  /** [hoursRemaining, width in final ranks] pairs sorted by hoursRemaining. */
  p80: [number, number | null][];
}

/** Elimination raid models: summed total score and the per-boss score. */
export interface EliminationScoreModels {
  total: ScoreModel;
  boss: ScoreModel;
}

/** Score curve sorted by rank ascending: [rank, score]. */
export type Curve = ReadonlyArray<readonly [number, number]>;

export interface SnapshotSource {
  hoursRemaining: number;
  getCurve: () => Curve;
}

export interface ScoreCutPrediction {
  rank: number;
  score: number;
  baselineRank: number | null;
  perLag: Record<number, number>;
  /** 80% band half-width, in ranks around the target rank. */
  p80: number | null;
}

const SNAPSHOT_TOLERANCE_HOURS = 1.6;
// Ranks closer to the top than this make psi meaningless (matches the training code).
const MIN_PAST_RANK = 5;

export function curveFromEntries(entries: ReadonlyArray<{ r: number; s: number }>): Curve {
  return entries.map((e): readonly [number, number] => [e.r, e.s]).sort((a, b) => a[0] - b[0]);
}

export function scoreAtRank(curve: Curve, rank: number): number {
  if (rank <= curve[0][0]) return curve[0][1];
  if (rank >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];
  for (let i = 1; i < curve.length; i++) {
    const [r1, s1] = curve[i - 1];
    const [r2, s2] = curve[i];
    if (r1 <= rank && rank <= r2) return r2 === r1 ? s1 : s1 + ((s2 - s1) * (rank - r1)) / (r2 - r1);
  }
  return curve[curve.length - 1][1];
}

export function rankAtScore(curve: Curve, score: number): number {
  if (score >= curve[0][1]) return curve[0][0];
  if (score <= curve[curve.length - 1][1]) return curve[curve.length - 1][0];
  for (let i = 1; i < curve.length; i++) {
    const [r1, s1] = curve[i - 1];
    const [r2, s2] = curve[i];
    if (s2 <= score && score <= s1) return s2 === s1 ? r2 : r1 + ((r2 - r1) * (s1 - score)) / (s1 - s2);
  }
  return curve[curve.length - 1][0];
}

function nearestSnapshot(snapshots: readonly SnapshotSource[], hours: number): SnapshotSource | null {
  let best: SnapshotSource | null = null;
  for (const s of snapshots) {
    if (best === null || Math.abs(s.hoursRemaining - hours) < Math.abs(best.hoursRemaining - hours)) best = s;
  }
  return best !== null && Math.abs(best.hoursRemaining - hours) <= SNAPSHOT_TOLERANCE_HOURS ? best : null;
}

/** log(T / rank the current T-th score had L hours ago); null when the pair is unusable. */
function psi(snapshots: readonly SnapshotSource[], hours: number, lag: number, target: number): number | null {
  const current = nearestSnapshot(snapshots, hours);
  const past = nearestSnapshot(snapshots, hours + lag);
  if (!current || !past) return null;
  const rank = rankAtScore(past.getCurve(), scoreAtRank(current.getCurve(), target));
  if (rank < MIN_PAST_RANK) return null;
  const value = Math.log(target / rank);
  // A fixed score can only get worse in rank over time, so a negative value means broken data.
  return value < -1e-9 ? null : Math.max(value, 0);
}

function interpolateP80(p80: ScoreModel['p80'], hours: number): number | null {
  const points = p80.filter((p): p is [number, number] => p[1] !== null);
  if (points.length === 0) return null;
  if (hours <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (hours >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [h1, w1] = points[i - 1];
    const [h2, w2] = points[i];
    if (h1 <= hours && hours <= h2) return h2 === h1 ? w1 : w1 + ((w2 - w1) * (hours - h1)) / (h2 - h1);
  }
  return last[1];
}

/**
 * Predict the final target-rank score from the live snapshots.
 * `hours` is the remaining time of the newest snapshot; it must be on the model's H grid range.
 */
export function predictScoreCut(model: ScoreModel, snapshots: readonly SnapshotSource[], hours: number): ScoreCutPrediction | null {
  const { min, max, step } = model.hGrid;
  if (hours < min - step / 2 || hours > max + step / 2) return null;
  const index = Math.min(model.baselineR.length - 1, Math.max(0, Math.round((hours - min) / step)));
  const baseline = model.baselineR[index];
  const current = nearestSnapshot(snapshots, hours);
  if (!current) return null;

  const perLag: Record<number, number> = {};
  for (const lag of model.lagHours) {
    const params = model.lags[String(lag)]?.[index] ?? null;
    const feature = psi(snapshots, hours, lag, model.targetRank);
    let value: number | null;
    if (feature === null || params === null) {
      value = baseline;
    } else {
      const [beta, my, mx, lo, hi] = params;
      value = Math.exp(my + beta * (Math.max(lo, Math.min(hi, feature)) - mx));
      if (baseline) value = Math.max(baseline * (1 - model.cap), Math.min(baseline * (1 + model.cap), value));
    }
    if (value !== null && value > 0) perLag[lag] = value;
  }

  const values = Object.values(perLag);
  const rank = values.length > 0 ? Math.exp(values.reduce((sum, v) => sum + Math.log(v), 0) / values.length) : baseline;
  if (rank === null || rank <= 0) return null;

  return {
    rank,
    score: scoreAtRank(current.getCurve(), rank),
    baselineRank: baseline,
    perLag,
    p80: interpolateP80(model.p80, hours),
  };
}
