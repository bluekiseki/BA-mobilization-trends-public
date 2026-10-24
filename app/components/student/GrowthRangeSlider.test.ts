// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { moveGrowthRange } from './GrowthRangeSlider';

describe('growth range updates', () => {
  beforeEach(() => useGlobalStore.setState({ growthPlans: [] }));

  it('pushes the target forward without pulling it back', () => {
    const raised = moveGrowthRange({ current: 1, target: 1 }, 'current', 80);
    expect(raised).toEqual({ current: 80, target: 80 });
    expect(moveGrowthRange(raised, 'current', 60)).toEqual({ current: 60, target: 80 });
    expect(moveGrowthRange({ current: 1, target: 1 }, 'target', 80)).toEqual({ current: 1, target: 80 });
    expect(moveGrowthRange({ current: 60, target: 80 }, 'target', 40)).toEqual({ current: 40, target: 40 });
  });

  it('updates both values atomically and leaves other slots alone', () => {
    const uuid = useGlobalStore.getState().addPlan();
    expect(uuid).toBeDefined();
    if (!uuid) return;
    const store = useGlobalStore.getState();
    store.updateGrowthRange(uuid, { kind: 'scalar', field: 'level' }, 80, 80);
    store.updateGrowthRange(uuid, { kind: 'equipment', index: 1 }, 4, 7);
    store.updateGrowthRange(uuid, { kind: 'potential', stat: 'atk' }, 3, 9);
    const plan = useGlobalStore.getState().growthPlans[0];
    expect([plan.current.level, plan.target.level]).toEqual([80, 80]);
    expect(plan.current.equipment).toEqual([0, 4, 0]);
    expect(plan.target.equipment).toEqual([0, 7, 0]);
    expect(plan.current.potential).toEqual({ hp: 0, atk: 3, heal: 0 });
    expect(plan.target.potential).toEqual({ hp: 0, atk: 9, heal: 0 });
  });

  it('converts rank indices and resets weapon level on return to stars', () => {
    const uuid = useGlobalStore.getState().addPlan();
    expect(uuid).toBeDefined();
    if (!uuid) return;
    const store = useGlobalStore.getState();
    store.updateGrowthRange(uuid, { kind: 'rank' }, 6, 8);
    const weaponPlan = useGlobalStore.getState().growthPlans[0];
    expect([weaponPlan.current.star, weaponPlan.current.uw, weaponPlan.target.uw]).toEqual([5, 2, 4]);
    store.updateGrowthRange(uuid, { kind: 'rank' }, 2, 4);
    const starPlan = useGlobalStore.getState().growthPlans[0];
    expect([starPlan.current.star, starPlan.current.uw, starPlan.current.uwLevel]).toEqual([3, 0, 1]);
    expect([starPlan.target.star, starPlan.target.uw, starPlan.target.uwLevel]).toEqual([5, 0, 1]);
  });
});
