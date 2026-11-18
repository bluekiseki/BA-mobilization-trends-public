// Chart-side glue around the joint model: picks the AP range and draws the plan as an AP-vs-target curve. Pure and
// DOM-free so the panel and its web worker share one implementation.

import type { JointCurvePoint } from './jointGoalCurve';
import type { Ctx, JointGoalPlan, ResourceApIndex } from './resourceApCost';

// Budgets probed when deciding how far to widen the chart.
const JOINT_PROBE_POINTS = 7;
// How many times the event window the chart may be stretched to reach the next Eleph threshold.
const MAX_RANGE_EXTENSION = 4;

export interface ChartArea {
  from: number;
  to: number;
}

export type ChartBuilder = (ap: number, points?: number) => { curve: JointCurvePoint[]; areas: ChartArea[] };

/**
 * The chart normally spans the event window; when the curve ends short of the next Eleph threshold, widen it
 * (up to a few times the window) so that threshold is actually reached.
 */
export function solveChartRange(build: ChartBuilder, baseMaxAp: number, elephThresholds: number[]): { curve: JointCurvePoint[]; areas: ChartArea[]; maxAp: number } {
  let used = baseMaxAp;
  // The joint solve is the slow part: probe the range with a coarse curve, then solve the final range once in full.
  let result = build(used, JOINT_PROBE_POINTS);
  const reached = [...result.curve].reverse().find((p) => p.amount !== null);
  const prev = reached ? [...result.curve].reverse().find((p) => p.amount !== null && p.ap < reached.ap - 1e-6) : undefined;
  const nextThreshold = reached ? [...elephThresholds].filter((th) => th > (reached.amount ?? 0)).sort((a, b) => a - b)[0] : undefined;
  if (reached && prev && nextThreshold !== undefined && reached.amount !== null && prev.amount !== null && reached.amount > prev.amount) {
    const slope = (reached.amount - prev.amount) / (reached.ap - prev.ap);
    const needed = reached.ap + ((nextThreshold - reached.amount) / slope) * 1.08;
    used = Math.min(baseMaxAp * MAX_RANGE_EXTENSION, Math.max(baseMaxAp, needed));
  }
  result = build(used);
  return { curve: result.curve, areas: result.areas, maxAp: used };
}

export interface JointChartRequest {
  activeKey: string;
  inventory: Record<string, number>;
  /** Ids of the stages the user marked as already cleared. */
  cleared: string[];
  /** Ends the chart where the last shop goal is bought. */
  stopAtGoals: boolean;
  baseMaxAp: number;
  elephThresholds: number[];
}

export interface JointChartResult {
  plan: JointGoalPlan | null;
  curve: JointCurvePoint[];
  maxAp: number;
  /** Right edge of the chart when it ends at the shop goals. */
  stopAp: number | null;
}

/**
 * The target held after each AP spent while following the plan in order. A farming stretch spreads its gain over its AP
 * span; a purchase or exchange lands where the plan places it, so those show as steps. An open-ended farming step keeps
 * gaining at its per-AP rate beyond the plan's finite part.
 */
export function trajectoryFromPlan(plan: JointGoalPlan, maxAp: number): JointCurvePoint[] {
  const finite = plan.steps.filter((step) => !step.forever);
  const finiteEnd = finite.reduce((end, step) => Math.max(end, step.apEnd), 0);
  const openRate = plan.steps.find((step) => step.forever && (step.targetPerAp ?? 0) > 0)?.targetPerAp ?? 0;
  // Share of a paced purchase or exchange done at `ap`; at a jump the value is the one before it unless `inclusive`.
  const shareAt = (progress: [number, number][], ap: number, inclusive: boolean): number => {
    for (let i = 1; i < progress.length; i++) {
      const [fromAp, fromShare] = progress[i - 1];
      const [toAp, toShare] = progress[i];
      if (ap > toAp || (inclusive && ap === toAp)) continue;
      if (ap <= fromAp || toAp === fromAp) return fromShare;
      return fromShare + ((toShare - fromShare) * (ap - fromAp)) / (toAp - fromAp);
    }
    return progress[progress.length - 1]?.[1] ?? 0;
  };
  const amountAt = (ap: number, inclusive: boolean): number => {
    let amount = plan.startTarget;
    for (const step of finite) {
      if (step.progress) amount += step.targetDelta * shareAt(step.progress, ap, inclusive);
      else if (step.kind !== 'clear' && step.apEnd > step.apStart) amount += step.targetDelta * (Math.min(Math.max(ap - step.apStart, 0), step.apEnd - step.apStart) / (step.apEnd - step.apStart));
      else {
        // A clear pays out when it is completed; a purchase at the AP where the plan places it.
        const at = step.kind === 'clear' ? step.apEnd : step.apStart;
        if (inclusive ? at <= ap : at < ap) amount += step.targetDelta;
      }
    }
    return ap > finiteEnd ? amount + openRate * (ap - finiteEnd) : amount;
  };
  const marks = new Set<number>([0, maxAp, Math.min(finiteEnd, maxAp)]);
  for (const step of finite) {
    for (const ap of [step.apStart, step.apEnd]) if (ap > 0 && ap < maxAp) marks.add(ap);
    for (const [ap] of step.progress ?? []) if (ap > 0 && ap < maxAp) marks.add(ap);
  }
  const curve: JointCurvePoint[] = [];
  for (const ap of [...marks].sort((a, b) => a - b)) {
    const before = amountAt(ap, false);
    const after = amountAt(ap, true);
    curve.push({ ap, amount: before });
    if (Math.abs(after - before) > 1e-9) curve.push({ ap, amount: after });
  }
  return curve;
}

export function computeJointChart(index: ResourceApIndex, request: JointChartRequest): JointChartResult {
  const { activeKey, inventory, stopAtGoals, baseMaxAp, elephThresholds } = request;
  // Ordered farming / purchase plan, assuming unlimited AP (or only as much as the shop goals need).
  const plan = index.buildJointGoalPlan(activeKey, inventory, new Set(request.cleared), stopAtGoals);
  if (!plan) return { plan: null, curve: [], maxAp: baseMaxAp, stopAp: null };
  // Ending at the shop goals: the chart stops just past the AP where the last purchase lands.
  const stopAp = stopAtGoals ? Math.ceil(plan.apUsed * 1.05) : null;
  if (stopAp !== null) return { plan, curve: trajectoryFromPlan(plan, stopAp), maxAp: stopAp, stopAp };
  // Keep the start of every open-ended activity visible, even when it lies beyond the normal range or has no yield.
  // Preview padding uses the event AP window rather than scaling the cost of the finite purchases.
  const openSteps = plan.steps.filter((step) => step.forever);
  const openStart = openSteps.length > 0 ? Math.max(...openSteps.map((step) => step.apStart)) : null;
  const minimumRange = openStart === null ? baseMaxAp : Math.max(baseMaxAp, openStart + Math.max(1, baseMaxAp * 0.1));
  const openRate = plan.steps.find((step) => step.forever && (step.targetPerAp ?? 0) > 0)?.targetPerAp ?? 0;
  const limit = Math.max(baseMaxAp * MAX_RANGE_EXTENSION, minimumRange);
  let used = minimumRange;
  const reached = trajectoryFromPlan(plan, used).at(-1)?.amount ?? 0;
  const nextThreshold = [...elephThresholds].filter((th) => th > reached).sort((a, b) => a - b)[0];
  if (nextThreshold !== undefined && openRate > 0) used = Math.min(limit, Math.max(used, used + ((nextThreshold - reached) / openRate) * 1.08));
  return { plan, curve: trajectoryFromPlan(plan, used), maxAp: used, stopAp };
}

export type JointChartWorkerRequest = { type: 'init'; ctx: Ctx } | { type: 'solve'; requestId: number; request: JointChartRequest };

export type JointChartWorkerResponse = { status: 'ready'; requestId: number; result: JointChartResult } | { status: 'error'; requestId: number; error: string };
