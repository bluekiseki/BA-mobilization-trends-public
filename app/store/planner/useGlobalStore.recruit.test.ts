import { beforeEach, describe, expect, it, vi } from 'vitest';

// The persist middleware needs a Storage; the node test environment has none
const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
});

const { useGlobalStore } = await import('./useGlobalStore');

const reset = () => useGlobalStore.setState({ growthPlans: [] });
const plans = () => useGlobalStore.getState().growthPlans;

describe('useGlobalStore unrecruited plans', () => {
  beforeEach(reset);

  it('creates an unrecruited plan at the baseline with the given acquired star', () => {
    const uuid = useGlobalStore.getState().addPlanForStudent(10000, 3, 5, false);
    const plan = plans().find((p) => p.uuid === uuid);
    expect(plan?.recruited).toBe(false);
    expect(plan?.current).toMatchObject({ level: 1, star: 3, ex: 1, affection: 1 });
    expect(plan?.target.star).toBe(5);
  });

  it('keeps current at the baseline when current fields are updated', () => {
    const { addPlanForStudent, updatePlan, updateGrowthRange } = useGlobalStore.getState();
    const uuid = addPlanForStudent(10000, 3, 5, false);
    updatePlan(uuid, 'current.level', 80);
    updateGrowthRange(uuid, { kind: 'scalar', field: 'affection' }, 40, 50);
    updatePlan(uuid, 'current.star', 4);
    const plan = plans().find((p) => p.uuid === uuid);
    expect(plan?.current.level).toBe(1);
    expect(plan?.current.affection).toBe(1);
    expect(plan?.current.star).toBe(4);
  });

  it('normalizes unrecruited plans coming through setGrowthPlans', () => {
    const { addPlanForStudent, setGrowthPlans } = useGlobalStore.getState();
    const uuid = addPlanForStudent(10000, 3, 5, false);
    const tampered = structuredClone(plans());
    tampered[0].current.level = 90;
    tampered[0].current.equipment = [5, 5, 5];
    setGrowthPlans(tampered);
    const plan = plans().find((p) => p.uuid === uuid);
    expect(plan?.current.level).toBe(1);
    expect(plan?.current.equipment).toEqual([0, 0, 0]);
  });

  it('resets current when switching to unrecruited and unlocks it when recruited again', () => {
    const { addPlanForStudent, updatePlan, setPlanRecruited } = useGlobalStore.getState();
    const uuid = addPlanForStudent(10000, 3, 5);
    updatePlan(uuid, 'current.level', 60);
    setPlanRecruited(uuid, false);
    expect(plans()[0].current.level).toBe(1);
    expect(plans()[0].recruited).toBe(false);

    setPlanRecruited(uuid, true);
    updatePlan(uuid, 'current.level', 60);
    expect(plans()[0].current.level).toBe(60);
    expect(plans()[0].recruited).toBeUndefined();
  });
});
