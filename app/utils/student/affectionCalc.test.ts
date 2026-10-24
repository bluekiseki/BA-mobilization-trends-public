import { describe, expect, it } from 'vitest';
import { calculateAffection, getMaxPointsById, type AffectionCalcInput, type CalcGift } from './affectionCalc';

// Student-specific gift values: one best normal gift (80), a mid one (40) and a base one (20).
const gifts: CalcGift[] = [
  { id: '1', rarity: 2, affectionPoints: 80 },
  { id: '2', rarity: 2, affectionPoints: 40 },
  { id: '3', rarity: 2, affectionPoints: 20 },
];

const base: AffectionCalcInput = {
  currentLevel: 1,
  currentExp: 0,
  targetLevel: 10,
  gifts,
  inventory: {},
  giftRule: 'all',
  maxPointsById: {},
  convertMode: 'off',
  stoneLimit: null,
};

describe('calculateAffection', () => {
  it('sums every owned gift with the "all" rule', () => {
    const r = calculateAffection({ ...base, inventory: { '1': 2, '2': 1, '3': 3 } });
    // 160 + 40 + 60 = 260 exp, far below the target
    expect(r.craftingRequiredCount).toBe(0);
    expect(r.status).toBe('deficit');
  });

  it('drops non-preferred gifts under the "preferred" rule and uses them as conversion material', () => {
    const input = { ...base, inventory: { '3': 4 }, giftRule: 'preferred' as const, convertMode: 'all' as const };
    const off = calculateAffection({ ...input, convertMode: 'off' });
    const all = calculateAffection(input);
    expect(off.achievableLevel).toBe(1);
    // 4 base gifts -> 2 crafts -> 2 best gifts (160 exp)
    expect(all.craftingRequiredCount).toBe(2);
    expect(all.achievableLevel).toBeGreaterThan(off.achievableLevel);
  });

  it('stops converting at the target in "toTarget" mode but not in "all" mode', () => {
    const inventory = { '3': 200 };
    const toTarget = calculateAffection({ ...base, targetLevel: 2, inventory, convertMode: 'toTarget' });
    const all = calculateAffection({ ...base, targetLevel: 2, inventory, convertMode: 'all' });
    expect(toTarget.status).toBe('success');
    expect(all.craftingRequiredCount).toBe(100);
    expect(toTarget.craftingRequiredCount).toBeLessThan(all.craftingRequiredCount);
  });

  it('caps crafts at the owned stone count', () => {
    const r = calculateAffection({ ...base, inventory: { '3': 200 }, convertMode: 'all', stoneLimit: 7 });
    expect(r.craftingRequiredCount).toBe(7);
  });

  it('only gives gifts the student gets the maximum from under "maxOnly"', () => {
    const maxPointsById = getMaxPointsById({ '1': [{ affectionPoints: 80 }], '2': [{ affectionPoints: 80 }], '3': [{ affectionPoints: 20 }] });
    const maxOnly = calculateAffection({ ...base, inventory: { '1': 100, '2': 100 }, giftRule: 'maxOnly', maxPointsById });
    const all = calculateAffection({ ...base, inventory: { '1': 100, '2': 100 }, maxPointsById });
    // gift 2 is worth 40 here but 80 for another student, so it is withheld
    expect(maxOnly.achievableLevel).toBeLessThan(all.achievableLevel);
  });
});
