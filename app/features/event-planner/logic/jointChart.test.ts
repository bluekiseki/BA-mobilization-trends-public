import { describe, expect, it, vi } from 'vitest';
import { computeJointChart, type JointChartRequest } from './jointChart';
import type { JointGoalPlan, ResourceApIndex } from './resourceApCost';

const request: JointChartRequest = {
  activeKey: 'Item_26016',
  inventory: {},
  cleared: [],
  stopAtGoals: false,
  baseMaxAp: 24_000,
  elephThresholds: [],
};

function compute(plan: JointGoalPlan, overrides: Partial<JointChartRequest> = {}) {
  const index: ResourceApIndex = {
    resourceKeys: [],
    resolveProfile: vi.fn<ResourceApIndex['resolveProfile']>(),
    buildSankey: vi.fn<ResourceApIndex['buildSankey']>(),
    buildFarmingPlan: vi.fn<ResourceApIndex['buildFarmingPlan']>(),
    buildJointGoalCurve: vi.fn<ResourceApIndex['buildJointGoalCurve']>(),
    buildJointGoalPlan: () => plan,
    listJointClearChains: () => [],
  };
  return computeJointChart(index, { ...request, ...overrides });
}

function planAt(start: number, rate: number): JointGoalPlan {
  return {
    steps: [
      { kind: 'repeat', ref: undefined, count: 1, ap: start, apStart: 0, apEnd: start, targetDelta: 0 },
      { kind: 'repeat', ref: undefined, count: Infinity, ap: 0, apStart: start, apEnd: start, targetDelta: 0, forever: true, runAp: 20, targetPerAp: rate },
    ],
    target: 80,
    startTarget: 80,
    apUsed: start,
    labels: [],
  };
}

describe('computeJointChart open-ended range', () => {
  it('shows the infinite start and some farming after the reported 27,535 AP prerequisite', () => {
    const result = compute(planAt(27_535, 0.00585));
    expect(result.maxAp).toBe(29_935);
    expect(result.curve).toContainEqual({ ap: 27_535, amount: 80 });
    expect(result.curve.at(-1)?.amount).toBeGreaterThan(80);
  });

  it('keeps the infinite start visible beyond the threshold extension cap even with zero yield', () => {
    const result = compute(planAt(120_000, 0));
    expect(result.maxAp).toBe(122_400);
    expect(result.curve).toContainEqual({ ap: 120_000, amount: 80 });
  });

  it('does not extend for a finite-only plan', () => {
    const plan = planAt(27_535, 0);
    plan.steps = plan.steps.filter((step) => !step.forever);
    expect(compute(plan).maxAp).toBe(24_000);
  });

  it('preserves the shop-goal stop range', () => {
    const result = compute(planAt(27_535, 0), { stopAtGoals: true });
    expect(result.maxAp).toBe(Math.ceil(27_535 * 1.05));
    expect(result.stopAp).toBe(result.maxAp);
  });
});
