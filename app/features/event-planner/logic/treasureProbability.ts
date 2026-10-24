// Treasure Hunt posterior: exact per-cell probabilities via broken-profile forward-backward DP.
//
// Prior: every valid arrangement (non-overlapping rectangles, exact count per type, rotation allowed)
// is equally likely. Each arrangement is counted exactly once because every rectangle has a unique
// anchor (its first cell in scan order) and the DP decides each undecided cell as either
// "empty" or "anchor of exactly one (type, orientation)".
//
// ── Benchmark: DP as a dig strategy in the cost simulator (2026-10-01, event 10847, goal = clear_all) ──
// Method: 10,000 games per round per strategy. Boards come from `placeTreasures` (largest-first random
// placement). DP strategy = always dig the max P(covered) cell from `solveTreasureExact`; on a hit the
// whole treasure is known and dug out (same game model as `runSingleSimulation`). Values are mean digs
// ± standard error; times are per game (7 rounds ran in parallel, so absolute ms are inflated).
//
//   Round  Pieces (w×h ×count)          DP               Heuristic        Checkerboard
//   R1/R4  3×2×2, 3×1×5, 1×2×2          34.90 ±0.02      34.85 ±0.02      36.72 ±0.01
//   R2/R5  4×2×1, 1×4×2, 3×1×5          33.09 ±0.01      33.26 ±0.01      34.93 ±0.01
//   R3/R6  3×3×1, 2×2×4, 1×2×3          35.19 ±0.02      35.33 ±0.02      36.20 ±0.01
//   R7     4×2×2, 3×1×3, 1×2×6          39.23 ±0.01      39.34 ±0.01      40.24 ±0.01
//   Time   —                            9–94 ms/game     0.7–1.9 ms/game  0.05–0.16 ms/game
//
// Conclusion: DP saves at most ~0.17 digs per round (~0.5%) vs. the heuristic and is slightly worse on
// R1/R4 (the uniform prior does not match the largest-first generator). It is 10–100× slower, which would
// turn the default 1,000-run simulation from seconds into minutes. So the DP is used only by the
// interactive probability calculator, not as a simulator strategy. With clear_all every treasure cell
// must be dug anyway (e.g. 31 of ~35 digs in R1), so only the few empty-cell digs can be optimized.
//
// Follow-up research (2026-10-01, 6,000 paired games per cell; diff = mean digs vs. heuristic on the same boards):
// - Optimality gap: exact belief-state search (min expected empty digs) on small boards and on real-round
//   endgames (N <= 200) shows greedy-DP is only 0.02–0.06 empty digs worse than optimal. Total headroom
//   over the heuristic is ~0.1–0.25 digs/round. Full belief-state DP on 9×5 is intractable (N up to 2.7e9).
// - Policies tried: greedy max P; P + 0.15·entropy(outcome) from placement posteriors; prior weights fitted
//   to the largest-first generator (iterative proportional fitting); exact endgame when N <= 40.
//   Best per round: R1 none (+0.04..+0.06, i.e. worse or equal), R2 -0.25 (fitted prior + endgame),
//   R3 -0.13 (greedy), R7 -0.12 (fitted prior). ~0.2% over a full 7-round cycle.
// - Fitted prior helps R2/R7 but hurts R3 (matching single-placement marginals distorts the joint).
//   R1's loss to the heuristic disappears on uniform boards, so it is prior mismatch, not policy quality.
// - Speed:
//   - Reusing the previous call's forward/backward layers: only 1.0–1.14×. A hit changes the remaining
//     counts, which invalidates every layer and forces a full recompute, and ≈70% of moves follow a hit.
//   - Opening book (memoize the chosen move by observation state, shared across simulated games):
//     8–11× faster with identical moves, but 1,000 runs × 7 rounds still takes ~25–35 s vs. ~4 s for
//     the heuristic.
// Decision: keep the heuristic in the cost simulator; the DP stays in the interactive calculator only.

/** Observation per cell: OBS_UNKNOWN, OBS_EMPTY, or a type index (>= 0) meaning "dug, part of type k". */
export const OBS_UNKNOWN = -2;
export const OBS_EMPTY = -1;
/** Cell occupied by a treasure the user already placed; its count must be excluded from `types`. */
export const OBS_FIXED = -3;

export interface TreasureTypeSpec {
  w: number;
  h: number;
  count: number;
}

export interface TreasureProbInput {
  width: number;
  height: number;
  types: TreasureTypeSpec[];
  /** Row-major observations, index = y * width + x */
  obs: ArrayLike<number>;
}

export interface TreasureProbOptions {
  maxLayerStates?: number;
  timeBudgetMs?: number;
}

export type TreasureProbStatus = 'ok' | 'contradiction' | 'aborted';

export interface TreasureProbResult {
  status: TreasureProbStatus;
  exact: boolean;
  /** Number of consistent arrangements (float; exact only below 2^53) */
  total: number;
  /** Row-major P(cell covered by any treasure) */
  cover: number[];
  /** coverByType[k][cell] = P(cell covered by type k) */
  coverByType: number[][];
  maxLayerStates: number;
}

const MAX_MASK_BITS = 30;

interface Placement {
  type: number;
  rel: number;
  /** Original row-major cell indices covered by this placement */
  cells: number[];
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const popcount = (v: number) => {
  let x = v - ((v >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

const emptyResult = (status: TreasureProbStatus, n: number, k: number, exact: boolean): TreasureProbResult => ({
  status,
  exact,
  total: 0,
  cover: Array<number>(n).fill(0),
  coverByType: Array.from({ length: k }, () => Array<number>(n).fill(0)),
  maxLayerStates: 0,
});

export function solveTreasureExact(input: TreasureProbInput, options: TreasureProbOptions = {}): TreasureProbResult {
  const { width, height, types, obs } = input;
  const maxLayerStates = options.maxLayerStates ?? 1_500_000;
  const timeBudgetMs = options.timeBudgetMs ?? 700;
  const started = now();

  const n = width * height;
  const K = types.length;

  // Scan along the long axis so the profile window spans the short axis.
  const transposed = width < height;
  const H = transposed ? width : height; // cross-axis length
  const Wl = transposed ? height : width; // long-axis length
  const toOrig = (scan: number) => {
    const l = Math.floor(scan / H);
    const c = scan % H;
    return transposed ? l * width + c : c * width + l;
  };
  const scanObs = new Int32Array(n);
  for (let i = 0; i < n; i++) scanObs[i] = obs[toOrig(i)];

  const totalArea = types.reduce((acc, t) => acc + t.w * t.h * t.count, 0);
  // Cells held by user-placed treasures are neither empty nor available
  const fixedPrefix = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) fixedPrefix[i + 1] = fixedPrefix[i] + (scanObs[i] === OBS_FIXED ? 1 : 0);
  const emptyBudget = n - fixedPrefix[n] - totalArea;
  if (emptyBudget < 0) return emptyResult('contradiction', n, K, true);

  // Observed empty cells at scan index >= i
  const obsEmptySuffix = new Int32Array(n + 1);
  for (let i = n - 1; i >= 0; i--) obsEmptySuffix[i] = obsEmptySuffix[i + 1] + (scanObs[i] === OBS_EMPTY ? 1 : 0);

  // Precompute valid placements per anchor, already filtered by bounds and observations.
  let maxLong = 1;
  const placementsAt: Placement[][] = Array.from({ length: n }, () => []);
  const lastAnchor = new Int32Array(K).fill(-1);
  for (let k = 0; k < K; k++) {
    const { w, h, count } = types[k];
    if (count <= 0) continue;
    const orients =
      w === h
        ? [[w, h]]
        : [
            [w, h],
            [h, w],
          ];
    for (const [dl, dc] of orients) {
      maxLong = Math.max(maxLong, dl);
      for (let l = 0; l + dl <= Wl; l++) {
        for (let c = 0; c + dc <= H; c++) {
          let ok = true;
          let rel = 0;
          const cells: number[] = [];
          for (let a = 0; a < dl && ok; a++) {
            for (let b = 0; b < dc; b++) {
              const s = (l + a) * H + (c + b);
              const o = scanObs[s];
              if (o !== OBS_UNKNOWN && o !== k) {
                ok = false;
                break;
              }
              rel |= 1 << (a * H + b);
              cells.push(toOrig(s));
            }
          }
          if (!ok) continue;
          const anchor = l * H + c;
          placementsAt[anchor].push({ type: k, rel, cells });
          if (anchor > lastAnchor[k]) lastAnchor[k] = anchor;
        }
      }
    }
  }
  if (maxLong * H > MAX_MASK_BITS) return emptyResult('aborted', n, K, false);

  // Mixed-radix encoding of remaining counts
  const radix = new Array<number>(K);
  let R = 1;
  for (let k = 0; k < K; k++) {
    radix[k] = R;
    R *= types[k].count + 1;
  }
  const initCidx = types.reduce((acc, t, k) => acc + t.count * radix[k], 0);
  const countOf = (cidx: number, k: number) => Math.floor(cidx / radix[k]) % (types[k].count + 1);
  const placedAreaOf = (cidx: number) => {
    let area = 0;
    for (let k = 0; k < K; k++) area += (types[k].count - countOf(cidx, k)) * types[k].w * types[k].h;
    return area;
  };

  // ── Forward pass ──
  const layerKeys: number[][] = [];
  const layerVals: number[][] = [];
  layerKeys.push([initCidx]);
  layerVals.push([1]);
  let peak = 1;

  for (let i = 0; i < n; i++) {
    const keys = layerKeys[i];
    const vals = layerVals[i];
    const next = new Map<number, number>();
    const add = (key: number, v: number) => next.set(key, (next.get(key) ?? 0) + v);
    const isHit = scanObs[i] >= 0;
    const isFixed = scanObs[i] === OBS_FIXED;
    const places = placementsAt[i];

    for (let s = 0; s < keys.length; s++) {
      const key = keys[s];
      const f = vals[s];
      const mask = Math.floor(key / R);
      const cidx = key - mask * R;
      if (mask & 1 || isFixed) {
        add((mask >>> 1) * R + cidx, f);
        continue;
      }
      if (!isHit) {
        const empties = i - fixedPrefix[i] - (placedAreaOf(cidx) - popcount(mask));
        if (empties + 1 + obsEmptySuffix[i + 1] <= emptyBudget) add((mask >>> 1) * R + cidx, f);
      }
      for (const p of places) {
        if ((mask & p.rel) !== 0 || countOf(cidx, p.type) === 0) continue;
        add(((mask | p.rel) >>> 1) * R + (cidx - radix[p.type]), f);
      }
    }

    // Drop states that still need a type whose last possible anchor has passed.
    const nk: number[] = [];
    const nv: number[] = [];
    for (const [key, v] of next) {
      const cidx = key - Math.floor(key / R) * R;
      let dead = false;
      for (let k = 0; k < K; k++) {
        if (lastAnchor[k] < i + 1 && countOf(cidx, k) > 0) {
          dead = true;
          break;
        }
      }
      if (!dead) {
        nk.push(key);
        nv.push(v);
      }
    }
    layerKeys.push(nk);
    layerVals.push(nv);
    if (nk.length > peak) peak = nk.length;
    if (nk.length > maxLayerStates || now() - started > timeBudgetMs) return emptyResult('aborted', n, K, false);
  }

  const terminal = layerKeys[n].indexOf(0);
  const total = terminal >= 0 ? layerVals[n][terminal] : 0;
  if (total === 0) return { ...emptyResult('contradiction', n, K, true), maxLayerStates: peak };

  // ── Backward pass over forward-reachable states, accumulating placement weights ──
  const placeW: Float64Array[] = placementsAt.map((ps) => new Float64Array(ps.length));
  let nextB = new Map<number, number>([[0, 1]]);
  for (let i = n - 1; i >= 0; i--) {
    const keys = layerKeys[i];
    const vals = layerVals[i];
    const curB = new Map<number, number>();
    const isHit = scanObs[i] >= 0;
    const isFixed = scanObs[i] === OBS_FIXED;
    const places = placementsAt[i];
    const weights = placeW[i];

    for (let s = 0; s < keys.length; s++) {
      const key = keys[s];
      const f = vals[s];
      const mask = Math.floor(key / R);
      const cidx = key - mask * R;
      let b = 0;
      if (mask & 1 || isFixed) {
        b = nextB.get((mask >>> 1) * R + cidx) ?? 0;
      } else {
        if (!isHit) {
          const empties = i - fixedPrefix[i] - (placedAreaOf(cidx) - popcount(mask));
          if (empties + 1 + obsEmptySuffix[i + 1] <= emptyBudget) b += nextB.get((mask >>> 1) * R + cidx) ?? 0;
        }
        for (let pi = 0; pi < places.length; pi++) {
          const p = places[pi];
          if ((mask & p.rel) !== 0 || countOf(cidx, p.type) === 0) continue;
          const bt = nextB.get(((mask | p.rel) >>> 1) * R + (cidx - radix[p.type])) ?? 0;
          if (bt === 0) continue;
          b += bt;
          weights[pi] += f * bt;
        }
      }
      if (b !== 0) curB.set(key, b);
    }
    nextB = curB;
    if (now() - started > timeBudgetMs * 2) return emptyResult('aborted', n, K, false);
  }

  // ── Expand placement weights onto covered cells ──
  const coverByType = Array.from({ length: K }, () => Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    const places = placementsAt[i];
    for (let pi = 0; pi < places.length; pi++) {
      const w = placeW[i][pi];
      if (w === 0) continue;
      const p = places[pi];
      const row = coverByType[p.type];
      for (const c of p.cells) row[c] += w / total;
    }
  }
  const cover = Array<number>(n).fill(0);
  for (let k = 0; k < K; k++) for (let c = 0; c < n; c++) cover[c] += coverByType[k][c];

  return { status: 'ok', exact: true, total, cover, coverByType, maxLayerStates: peak };
}

/**
 * Fast approximation: for each type, the fraction of its valid single placements (ignoring other pieces)
 * covering a cell, scaled by the type's count and capped at 1. Used as a fallback when the exact DP aborts.
 */
export function solveTreasureApprox(input: TreasureProbInput): TreasureProbResult {
  const { width, height, types, obs } = input;
  const n = width * height;
  const K = types.length;
  const coverByType = Array.from({ length: K }, () => Array<number>(n).fill(0));

  for (let k = 0; k < K; k++) {
    const { w, h, count } = types[k];
    if (count <= 0) continue;
    const orients =
      w === h
        ? [[w, h]]
        : [
            [w, h],
            [h, w],
          ];
    const counts = Array<number>(n).fill(0);
    let valid = 0;
    for (const [pw, ph] of orients) {
      for (let y = 0; y + ph <= height; y++) {
        for (let x = 0; x + pw <= width; x++) {
          const cells: number[] = [];
          let ok = true;
          for (let dy = 0; dy < ph && ok; dy++) {
            for (let dx = 0; dx < pw; dx++) {
              const c = (y + dy) * width + (x + dx);
              if (obs[c] !== OBS_UNKNOWN && obs[c] !== k) {
                ok = false;
                break;
              }
              cells.push(c);
            }
          }
          if (!ok) continue;
          valid++;
          for (const c of cells) counts[c]++;
        }
      }
    }
    if (valid === 0) continue;
    for (let c = 0; c < n; c++) coverByType[k][c] = Math.min(1, (counts[c] / valid) * count);
  }

  const cover = Array<number>(n).fill(0);
  for (let c = 0; c < n; c++) {
    if (obs[c] === OBS_EMPTY || obs[c] === OBS_FIXED) continue;
    if (obs[c] >= 0) {
      cover[c] = 1;
      continue;
    }
    let miss = 1;
    for (let k = 0; k < K; k++) miss *= 1 - coverByType[k][c];
    cover[c] = 1 - miss;
  }
  return { status: 'ok', exact: false, total: 0, cover, coverByType, maxLayerStates: 0 };
}

/** Exact DP with automatic fallback to the approximation when the state budget is exceeded. */
export function solveTreasure(input: TreasureProbInput, mode: 'exact' | 'approx', options?: TreasureProbOptions): TreasureProbResult {
  if (mode === 'approx') return solveTreasureApprox(input);
  const exact = solveTreasureExact(input, options);
  if (exact.status === 'aborted') return { ...solveTreasureApprox(input), status: 'aborted' };
  return exact;
}
