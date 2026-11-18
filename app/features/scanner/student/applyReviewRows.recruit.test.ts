import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudentReviewRow } from './reviewTypes';
import type { StudentCurrent } from './types';

// The persist middleware needs a Storage; the node test environment has none
const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
});

const { useGlobalStore } = await import('~/store/planner/useGlobalStore');
const { applyReviewRows } = await import('./applyReviewRows');

const scanned = (): StudentCurrent => ({
  level: 55,
  star: 4,
  uw: 0,
  uwLevel: 1,
  ex: 3,
  normal: 5,
  passive: 5,
  sub: 5,
  affection: 12,
  equipment: [4, 4, 4],
  gear: 0,
  potential: { hp: 0, atk: 0, heal: 0 },
  affectionExp: 0,
  eleph: 0,
});

const row = (studentId: number, apply: boolean): StudentReviewRow => ({
  studentId,
  name: 'A',
  equipmentTypes: null,
  starGrade: 3,
  confidence: 1,
  previewUrl: '',
  sourceSize: { width: 1, height: 1 },
  reviewOverlay: [],
  apply,
  detected: scanned(),
  recognized: scanned(),
  edited: false,
});

describe('applyReviewRows with unrecruited plans', () => {
  beforeEach(() => useGlobalStore.setState({ growthPlans: [] }));

  it('marks an applied student as recruited and keeps the scanned current values', () => {
    useGlobalStore.getState().addPlanForStudent(10000, 3, 5, false);
    applyReviewRows([row(10000, true)]);
    const plan = useGlobalStore.getState().growthPlans[0];
    expect(plan.recruited).toBeUndefined();
    expect(plan.current).toMatchObject({ level: 55, star: 4, affection: 12 });
    expect(plan.acquiredDate).toBeTruthy();
    expect(plan.target.star).toBe(5);
  });

  it('leaves the plan unrecruited when the row is not applied', () => {
    useGlobalStore.getState().addPlanForStudent(10000, 3, 5, false);
    applyReviewRows([row(10000, false)]);
    const plan = useGlobalStore.getState().growthPlans[0];
    expect(plan.recruited).toBe(false);
    expect(plan.current.level).toBe(1);
  });
});
