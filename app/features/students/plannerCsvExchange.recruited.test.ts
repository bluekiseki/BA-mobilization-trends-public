import { describe, expect, it } from 'vitest';
import type { GrowthPlan } from '~/types/growthPlan';
import { csvToPlans, plansToCsv } from './plannerCsvExchange';

const block = (): GrowthPlan['target'] => ({
  level: 1,
  star: 3,
  uw: 0,
  uwLevel: 1,
  ex: 1,
  normal: 1,
  passive: 1,
  sub: 1,
  affection: 1,
  equipment: [0, 0, 0],
  gear: 0,
  potential: { hp: 0, atk: 0, heal: 0 },
});
const plan = (studentId: number, recruited?: boolean): GrowthPlan => ({
  uuid: `u${studentId}`,
  studentId,
  current: { ...block(), eleph: 0, affectionExp: 0 },
  target: { ...block(), level: 80 },
  includedInEvents: [],
  useEligmaForStar: false,
  eligmaInfo: { price: 1, stock: 0 },
  isSelected: true,
  recruited,
});
const students = { '1': { Name: 'A' }, '2': { Name: 'B' } };

describe('planner CSV recruited column', () => {
  it('round-trips the recruited flag', () => {
    const csv = plansToCsv([plan(1), plan(2, false)], students);
    const result = csvToPlans(csv, [plan(1, false), plan(2)], students);
    const byStudent = new Map(result.plans.map((p) => [p.studentId, p]));
    expect(byStudent.get(1)?.recruited).toBeUndefined();
    expect(byStudent.get(2)?.recruited).toBe(false);
  });

  it('treats a CSV without the column as recruited-agnostic (existing flag is kept)', () => {
    const csv = plansToCsv([plan(2)], students)
      .split('\n')
      .map((line) => line.replace(/,"(recruited|yes|no)"$/, ''))
      .join('\n');
    const result = csvToPlans(csv, [plan(2, false)], students);
    expect(result.plans[0].recruited).toBe(false);
  });
});
