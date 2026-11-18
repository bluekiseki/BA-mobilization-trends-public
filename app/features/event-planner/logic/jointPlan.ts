// Turns the joint model's optimum at one AP budget into an ordered list of steps laid out along the AP axis.
// Kept apart from jointGoalCurve.ts: it needs the LP solution vector, which the curve search never does.

import type { JointColumn, JointModel } from './jointGoalCurve';

// Cap on the relaxations solved when searching for whole-run farming; the best plan found so far is used beyond it.
const MAX_BRANCH_NODES = 400;
// Slices the farming is cut into when pacing the purchases against the currency it produces.
const STREAM_SLICES = 240;
const EPS = 1e-9;

interface LpSolution {
  feasible: boolean;
  value: number;
  x: number[];
}

/** Maximises c·x subject to A·x <= b, x >= 0 and returns the solution vector too (two-phase simplex, Bland's rule). */
export function solveLpSolution(c: number[], A: number[][], b: number[]): LpSolution {
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

  // `d` (when given) holds the reduced costs and is pivoted along with the tableau, so pricing never rescans the
  // whole tableau.
  const pivot = (row: number, col: number, d?: Float64Array): void => {
    const p = T[row][col];
    const prow = T[row];
    for (let j = 0; j < width; j++) prow[j] /= p;
    for (let i = 0; i < m; i++) {
      if (i === row) continue;
      const f = T[i][col];
      if (Math.abs(f) < 1e-15) continue;
      const ti = T[i];
      for (let j = 0; j < width; j++) ti[j] -= f * prow[j];
    }
    if (d) {
      const f = d[col];
      if (f !== 0) for (let j = 0; j < d.length; j++) d[j] -= f * prow[j];
    }
    basis[row] = col;
  };

  const run = (cost: Float64Array, ncols: number): 'optimal' | 'unbounded' => {
    const d = new Float64Array(ncols);
    for (let j = 0; j < ncols; j++) {
      let v = cost[j];
      for (let i = 0; i < m; i++) v -= cost[basis[i]] * T[i][j];
      d[j] = v;
    }
    for (let iter = 0; iter < 20000; iter++) {
      let enter = -1;
      for (let j = 0; j < ncols; j++) {
        if (d[j] > 1e-8) {
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
      pivot(leave, enter, d);
    }
    return 'optimal';
  };

  const none: LpSolution = { feasible: false, value: -Infinity, x: [] };
  if (nArt > 0) {
    const phase1 = new Float64Array(n + m + nArt);
    for (let k = 0; k < nArt; k++) phase1[n + m + k] = -1;
    run(phase1, n + m + nArt);
    let infeasibility = 0;
    for (let i = 0; i < m; i++) if (basis[i] >= n + m) infeasibility += T[i][rhs];
    if (infeasibility > 1e-6) return none;
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
  if (run(phase2, n + m) === 'unbounded') return { feasible: true, value: Infinity, x: [] };
  const x = new Array<number>(n).fill(0);
  let value = 0;
  for (let i = 0; i < m; i++) {
    if (basis[i] < n) {
      x[basis[i]] = T[i][rhs];
      value += c[basis[i]] * T[i][rhs];
    }
  }
  return { feasible: true, value, x };
}

export type JointStepKind = 'clear' | 'repeat' | 'goal' | 'column';

export interface JointStep {
  kind: JointStepKind;
  /** Caller-defined reference carried over from the model (stage / shop product label lookup). */
  ref: number | undefined;
  /** Chain index and 0-based position within it, for clears and repeats. */
  chain?: number;
  index?: number;
  /** Runs (repeat), purchased fraction (goal / column) or 1 (clear). */
  count: number;
  ap: number;
  /** Position on the AP axis where the step starts and ends. */
  apStart: number;
  apEnd: number;
  /** Open-ended step: repeated for as long as AP is available (count is Infinity). */
  forever?: boolean;
  /** AP one run of an open-ended step costs (0 for AP-free activities such as a minigame). */
  runAp?: number;
  /** Net change of the target resource over the whole step (0 for an open-ended step, see targetPerAp). */
  targetDelta: number;
  /** Target gained per AP by an open-ended step. */
  targetPerAp?: number;
  /** For a purchase or exchange that runs alongside the farming: the cumulative share done at each AP, as [ap, share]. */
  progress?: [ap: number, share: number][];
}

export interface JointPlan {
  steps: JointStep[];
  target: number;
  /** Target held before any step: the owned amount and the free supply. */
  startTarget: number;
  /** AP actually spent. */
  apUsed: number;
}

interface PlanColumn {
  col: JointColumn;
  kind: JointStepKind;
  chain?: number;
  index?: number;
}

/**
 * The best plan at `ap` for clear depths `ks` (goal purchases first, then the target, as in solveJointDetail),
 * ordered along the AP axis: stage clears, then farming, then the purchases and exchanges that the farmed
 * currency pays for.
 */
export function planJointAtAp(model: JointModel, ks: number[], ap: number, options: { integerRuns?: boolean } = {}): JointPlan | null {
  const net = new Map(model.constants);
  let forcedAp = 0;
  const apply = (inFlow: Map<string, number>, outFlow: Map<string, number>): void => {
    for (const [key, amt] of inFlow) {
      if (key === model.apKey) forcedAp += amt;
      else net.set(key, (net.get(key) ?? 0) - amt);
    }
    for (const [key, amt] of outFlow) net.set(key, (net.get(key) ?? 0) + amt);
  };
  for (const f of model.fixed) apply(f.in, f.out);
  const startTarget = net.get(model.targetKey) ?? 0;

  const goals = model.goals ?? [];
  const planCols: PlanColumn[] = [...model.columns.map((col): PlanColumn => ({ col, kind: 'column' })), ...goals.map((col): PlanColumn => ({ col, kind: 'goal' }))];
  const clearSteps: JointStep[] = [];
  model.chains.forEach((chain, ci) => {
    for (let j = 0; j < ks[ci]; j++) {
      apply(chain[j].in, chain[j].out);
      const clearAp = chain[j].in.get(model.apKey) ?? 0;
      const targetDelta = (chain[j].out.get(model.targetKey) ?? 0) - (chain[j].in.get(model.targetKey) ?? 0);
      clearSteps.push({ kind: 'clear', ref: chain[j].ref, chain: ci, index: j, count: 1, ap: clearAp, apStart: 0, apEnd: 0, targetDelta });
      const repeat = chain[j].repeat;
      if (repeat) planCols.push({ col: repeat, kind: 'repeat', chain: ci, index: j });
    }
  });
  const apLeft = ap - forcedAp;
  if (apLeft < -EPS) return null;

  const columns = planCols.map((p) => p.col);
  const n = columns.length;
  const consumed = new Set<string>();
  for (const col of columns) for (const key of col.in.keys()) if (key !== model.apKey && key !== model.targetKey) consumed.add(key);
  for (const [key, amount] of net) if (amount < -EPS && key !== model.apKey && key !== model.targetKey) consumed.add(key);

  const rows: number[][] = [columns.map((col) => col.in.get(model.apKey) ?? 0)];
  const rhs: number[] = [apLeft];
  for (const key of consumed) {
    rows.push(columns.map((col) => (col.in.get(key) ?? 0) - (col.out.get(key) ?? 0)));
    rhs.push(net.get(key) ?? 0);
  }
  columns.forEach((col, j) => {
    if (!Number.isFinite(col.cap)) return;
    const row = new Array<number>(n).fill(0);
    row[j] = 1;
    rows.push(row);
    rhs.push(col.cap);
  });

  const goalObjective = planCols.map((p) => (p.kind === 'goal' ? 1 : 0));
  const objective = columns.map((col) => (col.out.get(model.targetKey) ?? 0) - (col.in.get(model.targetKey) ?? 0));
  // Goal purchases first (all of them when reachable, else as many as possible), then the target.
  const solveStaged = (baseRows: number[][], baseRhs: number[]) => {
    const staged = [...baseRows];
    const stagedRhs = [...baseRhs];
    if (goals.length > 0) {
      const capped = staged.length;
      staged.push(goalObjective.map((v) => -v));
      stagedRhs.push(-(goals.length - 1e-7));
      if (!solveLpSolution(goalObjective, staged, stagedRhs).feasible) {
        staged.length = capped;
        stagedRhs.length = capped;
        const first = solveLpSolution(goalObjective, staged, stagedRhs);
        if (!first.feasible || !Number.isFinite(first.value)) return null;
        if (first.value > EPS) {
          staged.push(goalObjective.map((v) => -v));
          stagedRhs.push(-(first.value - 1e-7));
        }
      }
    }
    const solved = solveLpSolution(objective, staged, stagedRhs);
    return solved.feasible && Number.isFinite(solved.value) ? solved : null;
  };
  const fractional = solveStaged(rows, rhs);
  if (!fractional) return null;
  let result = fractional;
  if (options.integerRuns) {
    // The LP uses fractional runs, purchases and exchanges. Whole numbers are found by branch and bound on the farming
    // runs first; any purchase or exchange that is still fractional (only a handful ever are) is then added to the
    // branching columns and the search is repeated. Branching on every count at once does not finish in reasonable time.
    const apOf = (j: number): number => planCols[j].col.in.get(model.apKey) ?? 0;
    const apColumns = planCols.flatMap((_, j) => (apOf(j) > 0 ? [j] : []));
    const unit = (j: number, sign: number): number[] => {
      const row = new Array<number>(n).fill(0);
      row[j] = sign;
      return row;
    };
    const minAp = columns.map((col) => -(col.in.get(model.apKey) ?? 0));
    const isWhole = (v: number): boolean => Math.abs(v - Math.round(v)) <= 1e-4;
    // Whole runs make the total AP a multiple of the stages' common AP step, so a node can only improve on the best
    // plan by at least one step; this prunes the many near-ties between stages of equal efficiency.
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    // Stage costs carry a tiny tie-break offset, so they are compared after rounding.
    const apStep = apColumns.every((j) => Math.abs(apOf(j) - Math.round(apOf(j))) < 1e-4) ? apColumns.reduce((g, j) => gcd(g, Math.round(apOf(j))), 0) : 0;
    // Least-AP plan with whole counts on the given columns; null when none is found.
    const wholePlan = (branchColumns: number[]): number[] | null => {
      // The AP budget is dropped (it becomes the objective) and every goal purchase is required.
      const freeRows = goals.length > 0 ? [...rows, goalObjective.map((v) => -v)] : [...rows];
      const freeRhs = goals.length > 0 ? [...rhs, -(goals.length - 1e-7)] : [...rhs];
      freeRhs[0] = 1e12;
      let bestAp = Infinity;
      let best: number[] | null = null;
      let nodes = 0;
      // No whole-run plan can beat the relaxation's AP rounded up to the AP step; reaching it proves the plan optimal.
      let lowerBound = 0;
      const visit = (branchRows: number[][], branchRhs: number[]): void => {
        if (nodes++ >= MAX_BRANCH_NODES || bestAp - lowerBound <= 1e-6) return;
        const node = solveLpSolution(minAp, [...freeRows, ...branchRows], [...freeRhs, ...branchRhs]);
        if (!node.feasible || !Number.isFinite(node.value)) return;
        const apCost = -node.value;
        if (nodes === 1) lowerBound = apStep > 0 ? Math.ceil((apCost - 1e-6) / apStep) * apStep : apCost;
        if (apCost >= bestAp - Math.max(apStep, 1e-6) + 1e-6) return;
        let pick = -1;
        let farthest = 1e-4;
        for (const j of branchColumns) {
          const frac = node.x[j] - Math.floor(node.x[j]);
          if (Math.min(frac, 1 - frac) > farthest) {
            farthest = Math.min(frac, 1 - frac);
            pick = j;
          }
        }
        if (pick < 0) {
          bestAp = apCost;
          best = node.x;
          return;
        }
        const down = [unit(pick, 1), Math.floor(node.x[pick])] as const;
        const up = [unit(pick, -1), -Math.ceil(node.x[pick])] as const;
        const nearUp = node.x[pick] - Math.floor(node.x[pick]) >= 0.5;
        for (const [row, bound] of nearUp ? [up, down] : [down, up]) visit([...branchRows, row], [...branchRhs, bound]);
      };
      visit([], []);
      return best;
    };
    let whole: number[] | null = null;
    if (goals.length > 0) {
      const branchColumns = [...apColumns];
      for (let round = 0; round < 4; round++) {
        whole = wholePlan(branchColumns);
        if (!whole) break;
        const loose = planCols.flatMap((_, j) => (!branchColumns.includes(j) && !planCols[j].col.divisible && !isWhole(whole?.[j] ?? 0) ? [j] : []));
        if (loose.length === 0) break;
        branchColumns.push(...loose);
      }
    }
    const fixedRows = [...rows];
    const fixedRhs = [...rhs];
    let used = 0;
    const fix = (j: number, count: number): void => {
      used += apOf(j) * count;
      fixedRows.push(unit(j, 1), unit(j, -1));
      fixedRhs.push(count, -count);
    };
    const exact = whole;
    // Without goals, or when no whole-number optimum is found, each farmed stage is simply rounded up.
    if (exact) {
      planCols.forEach((p, j) => {
        if (!p.col.divisible) fix(j, Math.round(exact[j]));
        // Divisible columns stay free in the rounded solve, but the AP they were branched to still has to fit the budget.
        else used += apOf(j) * Math.round(exact[j]);
      });
    } else apColumns.forEach((j) => fix(j, Math.max(0, Math.ceil(fractional.x[j] - 1e-6))));
    fixedRhs[0] = Math.max(apLeft, used);
    const rounded = solveStaged(fixedRows, fixedRhs);
    // Falls back to the fractional plan when the whole counts break a cap.
    if (rounded) result = rounded;
  }

  const farmed: JointStep[] = [];
  const spent: JointStep[] = [];
  const colOfStep = new Map<JointStep, JointColumn>();
  planCols.forEach((p, j) => {
    const count = result.x[j];
    if (count < 1e-7) return;
    const colAp = p.col.in.get(model.apKey) ?? 0;
    // An unconditional column that costs AP is stage farming (e.g. the repeat of an already cleared stage).
    const kind: JointStepKind = p.kind === 'column' && colAp > 0 ? 'repeat' : p.kind;
    const step: JointStep = { kind, ref: p.col.ref, chain: p.chain, index: p.index, count, ap: colAp * count, apStart: 0, apEnd: 0, targetDelta: count * objective[j] };
    colOfStep.set(step, p.col);
    (colAp > 0 ? farmed : spent).push(step);
  });

  // AP-consuming steps are laid out back to back: forced clears, then the farming.
  const apClears = clearSteps.filter((s) => s.ap > 0);
  const freeClears = clearSteps.filter((s) => s.ap <= 0);
  let cursor = 0;
  for (const s of [...apClears, ...farmed]) {
    s.apStart = cursor;
    cursor += s.ap;
    s.apEnd = cursor;
  }
  const farmStart = apClears.reduce((a, s) => a + s.ap, 0);
  const farmEnd = cursor;

  // Steps that spend only currency run alongside the farming: whatever the farming has produced is spent as soon as it is
  // there, in the order of the tasks (free clears first, then exchanges, then the shop purchases).
  const stock = new Map<string, number>(model.constants);
  for (const f of model.fixed) for (const [k, v] of f.out) stock.set(k, (stock.get(k) ?? 0) + v);
  model.chains.forEach((chain, ci) => {
    for (let j = 0; j < ks[ci]; j++) for (const [k, v] of chain[j].out) stock.set(k, (stock.get(k) ?? 0) + v);
  });
  interface StreamTask {
    step: JointStep;
    inFlow: Map<string, number>;
    outFlow: Map<string, number>;
    units: number;
    left: number;
    begin?: number;
    end?: number;
    progress: [number, number][];
  }
  const tasks: StreamTask[] = [
    ...freeClears.map((step): StreamTask => {
      const clear = model.chains[step.chain ?? 0][step.index ?? 0];
      return { step, inFlow: clear.in, outFlow: clear.out, units: 1, left: 1, progress: [] };
    }),
    ...spent.map((step): StreamTask => ({
      step,
      inFlow: colOfStep.get(step)?.in ?? new Map<string, number>(),
      outFlow: colOfStep.get(step)?.out ?? new Map<string, number>(),
      units: step.count,
      left: step.count,
      progress: [],
    })),
  ];
  const run = (from: number, to: number): void => {
    for (const task of tasks) {
      if (task.left <= EPS) continue;
      let units = task.left;
      for (const [key, amount] of task.inFlow) if (key !== model.apKey && amount > 0) units = Math.min(units, Math.max(0, stock.get(key) ?? 0) / amount);
      if (units <= EPS) continue;
      for (const [key, amount] of task.inFlow) if (key !== model.apKey) stock.set(key, (stock.get(key) ?? 0) - amount * units);
      for (const [key, amount] of task.outFlow) stock.set(key, (stock.get(key) ?? 0) + amount * units);
      if (task.begin === undefined) {
        task.begin = from;
        task.progress.push([from, 0]);
      }
      task.left -= units;
      task.progress.push([to, 1 - Math.max(0, task.left) / task.units]);
      if (task.left <= EPS) task.end = to;
    }
  };
  // What is affordable from the start, then one pass per slice of farming.
  run(farmStart, farmStart);
  const farmSpan = Math.max(farmEnd - farmStart, EPS);
  for (const step of farmed) {
    const col = colOfStep.get(step);
    if (!col) continue;
    const slices = Math.max(1, Math.round((step.ap / farmSpan) * STREAM_SLICES));
    const delta = new Map<string, number>();
    for (const [key, amount] of col.out) delta.set(key, (delta.get(key) ?? 0) + (amount * step.count) / slices);
    for (const [key, amount] of col.in) if (key !== model.apKey) delta.set(key, (delta.get(key) ?? 0) - (amount * step.count) / slices);
    for (let i = 0; i < slices; i++) {
      for (const [key, amount] of delta) stock.set(key, (stock.get(key) ?? 0) + amount);
      run(step.apStart + (step.ap * i) / slices, step.apStart + (step.ap * (i + 1)) / slices);
    }
  }
  // Anything the pacing left unfinished is settled at the end of the farming.
  for (const task of tasks) {
    if (task.left > EPS) {
      task.begin ??= farmEnd;
      if (task.progress.length === 0) task.progress.push([farmEnd, 0]);
      task.progress.push([farmEnd, 1]);
      task.end = farmEnd;
    }
    task.step.apStart = task.begin ?? farmEnd;
    task.step.apEnd = task.end ?? farmEnd;
    task.step.progress = task.progress;
  }

  const steps = [...apClears, ...farmed, ...freeClears, ...spent].sort((a, b) => a.apStart - b.apStart || a.apEnd - b.apEnd);
  return { steps, target: (net.get(model.targetKey) ?? 0) + result.value, startTarget, apUsed: cursor };
}
