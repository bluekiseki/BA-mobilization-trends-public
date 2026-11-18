// Joint farming model: how much of one target resource a given AP budget yields once the planned shop purchases
// compete for the same AP. Pure LP code with no event-data knowledge; resourceApCost.ts adapts extracted sources
// into a JointModel.

import { solveLpSolution } from './jointPlan';

const EPS = 1e-9;
const GOAL_WEIGHT = 1e6;
const GOAL_LP_WEIGHT = 1e4;
// Curve points are placed adaptively: a segment is split only while its midpoint deviates this much from a straight line.
const CURVE_FLATNESS = 0.05;

interface LpResult {
  feasible: boolean;
  value: number;
}

/**
 * Maximises c·x subject to A·x <= b, x >= 0 (b may be negative). Dense two-phase simplex with Bland's rule, which
 * cannot cycle on the heavily degenerate instances produced when many stages share the same yield per AP.
 */
export function solveLp(c: number[], A: number[][], b: number[]): LpResult {
  const n = c.length;
  const m = A.length;
  const artRows: number[] = [];
  for (let i = 0; i < m; i++) if (b[i] < -EPS) artRows.push(i);
  const nArt = artRows.length;
  const width = n + m + nArt + 1;
  const rhs = width - 1;
  const T = Array.from({ length: m }, () => new Float64Array(width));
  const basis: number[] = new Array<number>(m);
  let art = 0;
  for (let i = 0; i < m; i++) {
    const neg = b[i] < -EPS;
    const sign = neg ? -1 : 1;
    for (let j = 0; j < n; j++) T[i][j] = sign * A[i][j];
    T[i][n + i] = sign;
    T[i][rhs] = sign * b[i];
    if (neg) {
      T[i][n + m + art] = 1;
      basis[i] = n + m + art;
      art++;
    } else {
      basis[i] = n + i;
    }
  }

  const pivot = (row: number, col: number): void => {
    const p = T[row][col];
    for (let j = 0; j < width; j++) T[row][j] /= p;
    for (let i = 0; i < m; i++) {
      if (i === row) continue;
      const f = T[i][col];
      if (Math.abs(f) < 1e-15) continue;
      for (let j = 0; j < width; j++) T[i][j] -= f * T[row][j];
    }
    basis[row] = col;
  };

  const run = (cost: Float64Array, ncols: number): 'optimal' | 'unbounded' => {
    for (let iter = 0; iter < 20000; iter++) {
      let enter = -1;
      for (let j = 0; j < ncols; j++) {
        let d = cost[j];
        for (let i = 0; i < m; i++) d -= cost[basis[i]] * T[i][j];
        if (d > 1e-8) {
          enter = j;
          break;
        }
      }
      if (enter < 0) return 'optimal';
      let leave = -1;
      let best = Infinity;
      for (let i = 0; i < m; i++) {
        const a = T[i][enter];
        if (a <= 1e-9) continue;
        const r = T[i][rhs] / a;
        if (r < best - 1e-12 || (Math.abs(r - best) <= 1e-12 && leave >= 0 && basis[i] < basis[leave])) {
          best = r;
          leave = i;
        }
      }
      if (leave < 0) return 'unbounded';
      pivot(leave, enter);
    }
    return 'optimal';
  };

  if (nArt > 0) {
    const phase1 = new Float64Array(n + m + nArt);
    for (let k = 0; k < nArt; k++) phase1[n + m + k] = -1;
    run(phase1, n + m + nArt);
    let infeasibility = 0;
    for (let i = 0; i < m; i++) if (basis[i] >= n + m) infeasibility += T[i][rhs];
    if (infeasibility > 1e-6) return { feasible: false, value: -Infinity };
    // Drive any artificial that stayed basic at zero out of the basis so phase 2 cannot use it.
    for (let i = 0; i < m; i++) {
      if (basis[i] < n + m) continue;
      for (let j = 0; j < n + m; j++) {
        if (Math.abs(T[i][j]) > 1e-9) {
          pivot(i, j);
          break;
        }
      }
    }
  }

  const phase2 = new Float64Array(n + m + nArt);
  for (let j = 0; j < n; j++) phase2[j] = c[j];
  if (run(phase2, n + m) === 'unbounded') return { feasible: true, value: Infinity };
  let value = 0;
  for (let i = 0; i < m; i++) if (basis[i] < n) value += c[basis[i]] * T[i][rhs];
  return { feasible: true, value };
}

type Flow = Map<string, number>;

/** A repeatable activity: one unit consumes `in`, produces `out`; at most `cap` units (Infinity = unlimited). */
export interface JointColumn {
  in: Flow;
  out: Flow;
  cap: number;
  /** Opaque caller reference (e.g. an index into a label table); carried into plans. */
  ref?: number;
  /** A simulated minigame average rather than a real purchase, so a whole-number plan may still use it fractionally. */
  divisible?: boolean;
}

/** One clear in a sequenced chain: the once-only clear itself plus the repeatable farming that unlocks with it. */
export interface JointClear {
  in: Flow;
  out: Flow;
  repeat: JointColumn | null;
  ref?: number;
}

export interface JointModel {
  apKey: string;
  targetKey: string;
  /** Activities available regardless of any stage progress (shop exchanges, finite purchases, minigames). */
  columns: JointColumn[];
  /** Ordered stage chains; clearing stage k requires clearing 1..k-1 of the same chain. */
  chains: JointClear[][];
  /** Fixed one-off flows plus free supply such as owned items. */
  fixed: { in: Flow; out: Flow }[];
  /**
   * Shop purchases the plan aims for. Each may be bought fractionally; as many as the budget allows are bought first
   * and the remaining AP goes to the target (lexicographic priority).
   */
  goals?: JointColumn[];
  constants: Flow;
}

export interface JointSolution {
  /** Total purchased fraction of the goal columns. */
  goal: number;
  /** Net amount of the target. */
  target: number;
}

// Everything about a model that does not depend on the clear depths or the budget, computed once per model: flows
// as dense vectors over a fixed key list, and the cumulative flows of each chain's first k clears.
interface ColumnVec {
  /** AP consumed per unit. */
  ap: number;
  /** in - out per key (AP excluded). */
  bal: Float64Array;
  /** Target gained per unit (out - in). */
  target: number;
  /** Indices of keys this column consumes (the target and AP excluded). */
  consumes: number[];
}

interface ModelPrep {
  keys: string[];
  targetIdx: number;
  vec: Map<JointColumn, ColumnVec>;
  /** constants plus fixed flows, per key, and the AP the fixed flows consume. */
  base: Float64Array;
  baseAp: number;
  /** prefix[ci][k]: net flow (out - in) and AP of the first k clears of chain ci. */
  prefixNet: Float64Array[][];
  prefixAp: number[][];
  /** Net flow and AP of buying every goal purchase in full. */
  goalNet: Float64Array;
  goalAp: number;
}

const prepCache = new WeakMap<JointModel, ModelPrep>();

const prepare = (model: JointModel): ModelPrep => {
  const cached = prepCache.get(model);
  if (cached) return cached;
  const keySet = new Set<string>([model.targetKey]);
  const noteFlow = (flow: Flow): void => {
    for (const key of flow.keys()) if (key !== model.apKey) keySet.add(key);
  };
  noteFlow(model.constants);
  for (const f of model.fixed) {
    noteFlow(f.in);
    noteFlow(f.out);
  }
  const columnsOf = (col: JointColumn): void => {
    noteFlow(col.in);
    noteFlow(col.out);
  };
  model.columns.forEach(columnsOf);
  (model.goals ?? []).forEach(columnsOf);
  for (const chain of model.chains) {
    for (const clear of chain) {
      noteFlow(clear.in);
      noteFlow(clear.out);
      if (clear.repeat) columnsOf(clear.repeat);
    }
  }
  const keys = [...keySet];
  const keyIdx = new Map(keys.map((k, i) => [k, i]));
  const targetIdx = keyIdx.get(model.targetKey) ?? 0;
  const vec = new Map<JointColumn, ColumnVec>();
  const vecOf = (col: JointColumn): void => {
    const bal = new Float64Array(keys.length);
    const consumes: number[] = [];
    for (const [key, amt] of col.in) {
      if (key === model.apKey) continue;
      const i = keyIdx.get(key) ?? 0;
      bal[i] += amt;
      if (i !== targetIdx && !consumes.includes(i)) consumes.push(i);
    }
    for (const [key, amt] of col.out) if (key !== model.apKey) bal[keyIdx.get(key) ?? 0] -= amt;
    vec.set(col, { ap: col.in.get(model.apKey) ?? 0, bal, target: -bal[targetIdx], consumes });
  };
  model.columns.forEach(vecOf);
  (model.goals ?? []).forEach(vecOf);
  for (const chain of model.chains) for (const clear of chain) if (clear.repeat) vecOf(clear.repeat);

  const flowNet = (inFlow: Flow, outFlow: Flow, into: Float64Array): number => {
    let ap = 0;
    for (const [key, amt] of inFlow) {
      if (key === model.apKey) ap += amt;
      else into[keyIdx.get(key) ?? 0] -= amt;
    }
    for (const [key, amt] of outFlow) if (key !== model.apKey) into[keyIdx.get(key) ?? 0] += amt;
    return ap;
  };
  const base = new Float64Array(keys.length);
  for (const [key, amt] of model.constants) if (key !== model.apKey) base[keyIdx.get(key) ?? 0] += amt;
  let baseAp = 0;
  for (const f of model.fixed) baseAp += flowNet(f.in, f.out, base);
  const prefixNet = model.chains.map((chain) => {
    const out: Float64Array[] = [new Float64Array(keys.length)];
    for (const clear of chain) {
      const next = Float64Array.from(out[out.length - 1]);
      flowNet(clear.in, clear.out, next);
      out.push(next);
    }
    return out;
  });
  const prefixAp = model.chains.map((chain) => {
    const out = [0];
    for (const clear of chain) out.push(out[out.length - 1] + (clear.in.get(model.apKey) ?? 0));
    return out;
  });
  const goalNet = new Float64Array(keys.length);
  let goalAp = 0;
  for (const g of model.goals ?? []) goalAp += flowNet(g.in, g.out, goalNet);
  const prep: ModelPrep = { keys, targetIdx, vec, base, baseAp, prefixNet, prefixAp, goalNet, goalAp };
  prepCache.set(model, prep);
  return prep;
};

/**
 * Best plan after spending `ap` AP when chain i is cleared up to `ks[i]` clears: first buy as much of the goal
 * purchases as possible, then maximise the target. Returns null when the clears alone exceed the AP.
 */
export function solveJointDetail(model: JointModel, ks: number[], ap: number): JointSolution | null {
  const prep = prepare(model);
  const goals = model.goals ?? [];
  const baseNet = Float64Array.from(prep.base);
  let forcedAp = prep.baseAp;
  const repeats: JointColumn[] = [];
  model.chains.forEach((chain, ci) => {
    const k = ks[ci];
    forcedAp += prep.prefixAp[ci][k];
    const prefix = prep.prefixNet[ci][k];
    for (let i = 0; i < baseNet.length; i++) baseNet[i] += prefix[i];
    for (let j = 0; j < k; j++) {
      const repeat = chain[j].repeat;
      if (repeat) repeats.push(repeat);
    }
  });
  if (ap - forcedAp < -EPS) return null;

  // Solves for the given activities; `goalCount` goal columns (if any) sit right after the plain columns.
  const solve = (columns: JointColumn[], net: Float64Array, apLeft: number, goalCount: number): JointSolution | null => {
    if (apLeft < -EPS) return null;
    const n = columns.length;
    const goalStart = model.columns.length;
    const vecs = columns.map((col) => prep.vec.get(col) as ColumnVec);
    const consumed = new Set<number>();
    for (const v of vecs) for (const i of v.consumes) consumed.add(i);
    for (let i = 0; i < net.length; i++) if (i !== prep.targetIdx && net[i] < -EPS) consumed.add(i);

    const rows: number[][] = [vecs.map((v) => v.ap)];
    const rhs: number[] = [apLeft];
    for (const i of consumed) {
      rows.push(vecs.map((v) => v.bal[i]));
      rhs.push(net[i]);
    }
    columns.forEach((col, j) => {
      if (!Number.isFinite(col.cap)) return;
      const row = new Array<number>(n).fill(0);
      row[j] = 1;
      rows.push(row);
      rhs.push(col.cap);
    });
    // Goal purchases carry a weight far above any target gain, so they are filled first and the target is
    // maximised with what is left.
    const targetObjective = vecs.map((v) => v.target);
    const isGoal = (j: number): boolean => j >= goalStart && j < goalStart + goalCount;
    const objective = targetObjective.map((v, j) => (isGoal(j) ? v + GOAL_LP_WEIGHT : v));
    const result = solveLpSolution(objective, rows, rhs);
    if (!result.feasible || result.x.length === 0) return null;
    let goalTotal = 0;
    let targetGain = 0;
    result.x.forEach((x, j) => {
      if (isGoal(j)) goalTotal += x;
      targetGain += targetObjective[j] * x;
    });
    return { goal: goalTotal, target: net[prep.targetIdx] + targetGain };
  };

  // Usual case: every goal purchase is affordable. They are then plain spending, which keeps the LP small (no
  // column or capacity row per shop product).
  if (goals.length > 0) {
    const net = Float64Array.from(baseNet);
    for (let i = 0; i < net.length; i++) net[i] += prep.goalNet[i];
    const full = solve([...model.columns, ...repeats], net, ap - forcedAp - prep.goalAp, 0);
    if (full) return { goal: goals.length, target: full.target };
  }
  return solve([...model.columns, ...goals, ...repeats], baseNet, ap - forcedAp, goals.length);
}

/** Best net amount of the target for the given clear depths (see solveJointDetail). */
export function solveJointAtAp(model: JointModel, ks: number[], ap: number): number | null {
  return solveJointDetail(model, ks, ap)?.target ?? null;
}

export interface JointCurvePoint {
  ap: number;
  amount: number | null;
  /** Clear depth per chain of the best plan found at this budget. */
  ks?: number[];
}

const sameKs = (a: number[], b: number[]): boolean => a.length === b.length && a.every((k, i) => k === b[i]);

/**
 * Target amount per AP budget. Stage progress is searched per chain (coordinate descent over "how many clears of
 * this chain are done"), since each clear's first-clear bonus and AP are all-or-nothing. A larger budget never calls
 * for fewer clears than a smaller one (the value of AP falls as the budget grows), so a budget is only searched
 * from the plan of the next smaller solved budget upward. The curve is piecewise linear with few kinks, so budgets are solved adaptively (a
 * coarse grid, then midpoints only where the curve bends) and the rest is interpolated.
 */
export function buildJointCurve(model: JointModel, maxAp: number, points = 40): JointCurvePoint[] {
  const zeros = model.chains.map(() => 0);
  const deepest = model.chains.map((chain) => chain.length);

  // Best plan at one budget with every chain's depth confined to [lo, hi].
  const solveAt = (ap: number, starts: number[][], lo: number[], hi: number[], fixed = false): JointCurvePoint => {
    const cache = new Map<string, { score: number; target: number }>();
    // Goal purchases dominate the score (shop first); the target only breaks ties between equally funded plans.
    const detail = (ks: number[]): { score: number; target: number } => {
      const id = ks.join(',');
      let v = cache.get(id);
      if (v === undefined) {
        const sol = solveJointDetail(model, ks, ap);
        v = sol ? { score: sol.goal * GOAL_WEIGHT + sol.target, target: sol.target } : { score: -Infinity, target: -Infinity };
        cache.set(id, v);
      }
      return v;
    };
    const evaluate = (ks: number[]): number => detail(ks).score;
    const clamp = (ks: number[]): number[] => ks.map((k, ci) => Math.min(hi[ci], Math.max(lo[ci], k)));
    // Between budgets that share one clear plan the plan is kept as is: a single LP, no search.
    if (fixed) {
      const only = detail(clamp(starts[0]));
      return { ap, amount: only.score > -Infinity ? only.target : null, ks: only.score > -Infinity ? clamp(starts[0]) : undefined };
    }
    const descend = (start: number[], withPairs: boolean): { ks: number[]; value: number } => {
      const ks = clamp(start);
      let value = evaluate(ks);
      for (let round = 0; round < 6; round++) {
        let improved = false;
        for (let ci = 0; ci < model.chains.length; ci++) {
          for (let k = lo[ci]; k <= hi[ci]; k++) {
            if (k === ks[ci]) continue;
            const trial = [...ks];
            trial[ci] = k;
            const v = evaluate(trial);
            // Deeper progress that costs nothing at this budget is kept: clearing a chain that only pays off once
            // another chain also progresses (e.g. a minigame fuelled by stage currency) shows no gain by itself.
            const plateauStep = k > ks[ci] && v > -Infinity && v >= value - 1e-9;
            if (v > value + 1e-9 || plateauStep) {
              ks[ci] = k;
              value = Math.max(value, v);
              improved = true;
            }
          }
        }
        if (improved) continue;
        if (!withPairs) break;
        // Single-chain moves are stuck: try trading one step of progress between two chains. A shared budget
        // (e.g. minigame currency) can make "one fewer clear here, one more there" the only improving move.
        for (let a = 0; a < model.chains.length && !improved; a++) {
          for (let b = a + 1; b < model.chains.length && !improved; b++) {
            for (const da of [-1, 1]) {
              for (const db of [-1, 1]) {
                const ka = ks[a] + da;
                const kb = ks[b] + db;
                if (ka < lo[a] || kb < lo[b] || ka > hi[a] || kb > hi[b]) continue;
                const trial = [...ks];
                trial[a] = ka;
                trial[b] = kb;
                const v = evaluate(trial);
                if (v > value + 1e-9) {
                  ks[a] = ka;
                  ks[b] = kb;
                  value = v;
                  improved = true;
                  break;
                }
              }
              if (improved) break;
            }
          }
        }
        if (!improved) break;
      }
      return { ks, value };
    };
    // Cheap single-chain searches from every start first; the costly pair-trade search runs once, from the winner.
    const first = starts.map((start) => descend(start, false)).reduce((a, b) => (b.value > a.value ? b : a));
    const best = descend(first.ks, true);
    return { ap, amount: best.value > -Infinity ? detail(best.ks).target : null, ks: best.value > -Infinity ? best.ks : undefined };
  };

  if (points < 2) return [solveAt(0, [zeros], zeros, deepest)];
  const apAt = (i: number): number => (maxAp * i) / (points - 1);
  const nodes = new Map<number, JointCurvePoint>();

  // Coarse grid, searched left to right: each budget's plan is at least as deep as the previous one.
  const coarse = Math.min(points - 1, 6);
  let prevKs = zeros;
  for (let j = 0; j <= coarse; j++) {
    const i = Math.round((j * (points - 1)) / coarse);
    // Once everything is cleared at a smaller budget, a larger one keeps it that way.
    const settled = j > 0 && sameKs(prevKs, deepest);
    const node = settled ? solveAt(apAt(i), [deepest], zeros, deepest, true) : solveAt(apAt(i), j === 0 ? [zeros, deepest] : [prevKs, deepest], prevKs, deepest);
    if (node.ks) prevKs = node.ks;
    nodes.set(i, node);
  }

  const refine = (l: number, r: number): void => {
    if (r - l <= 1) return;
    const left = nodes.get(l);
    const right = nodes.get(r);
    if (!left || !right) return;
    const m = Math.floor((l + r) / 2);
    // Only the lower bound is assumed (a larger budget never calls for fewer clears than the plan of a smaller one);
    // the upper end stays open because a plan can tie with a shallower one at the budget in between.
    const lo = left.ks ?? zeros;
    const starts = [left.ks, right.ks].filter((ks): ks is number[] => ks !== undefined);
    const same = left.ks && right.ks && sameKs(left.ks, right.ks);
    const mid = same ? solveAt(apAt(m), [left.ks as number[]], lo, deepest, true) : solveAt(apAt(m), starts.length > 0 ? starts : [zeros], lo, deepest);
    nodes.set(m, mid);
    if (left.amount === null && right.amount === null && mid.amount === null) return;
    const expected = left.amount !== null && right.amount !== null ? (left.amount + right.amount) / 2 : null;
    if (expected !== null && mid.amount !== null && Math.abs(mid.amount - expected) <= CURVE_FLATNESS) return;
    refine(l, m);
    refine(m, r);
  };
  const coarseIdx = [...nodes.keys()].sort((a, b) => a - b);
  for (let j = 0; j + 1 < coarseIdx.length; j++) refine(coarseIdx[j], coarseIdx[j + 1]);

  // Fill the points that were never solved by interpolating between the solved neighbours.
  const solved = [...nodes.keys()].sort((a, b) => a - b);
  const curve: JointCurvePoint[] = [];
  let s = 0;
  for (let i = 0; i < points; i++) {
    const node = nodes.get(i);
    if (node) {
      curve.push(node);
      continue;
    }
    while (solved[s + 1] < i) s++;
    const lo = nodes.get(solved[s]);
    const hi = nodes.get(solved[s + 1]);
    const t = (i - solved[s]) / (solved[s + 1] - solved[s]);
    const amount = lo?.amount != null && hi?.amount != null ? lo.amount + (hi.amount - lo.amount) * t : null;
    curve.push({ ap: apAt(i), amount });
  }
  return curve;
}
