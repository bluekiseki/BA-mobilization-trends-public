import { describe, it, expect } from 'vitest';
import { calcUwMaterialXp, seriesForWeaponType } from './uwMaterialXp';
import type { Student } from '~/types/plannerData';

const ALL_WEAPON_TYPES: Student['WeaponType'][] = ['AR', 'FT', 'GL', 'HG', 'MG', 'MT', 'RG', 'RL', 'SG', 'SMG', 'SR'];

describe('seriesForWeaponType', () => {
  it('covers every WeaponType with exactly one series', () => {
    for (const wt of ALL_WEAPON_TYPES) {
      expect(['spring', 'hammer', 'barrel']).toContain(seriesForWeaponType(wt));
    }
  });

  it('maps spring types (including FT)', () => {
    expect(seriesForWeaponType('SG')).toBe('spring');
    expect(seriesForWeaponType('SMG')).toBe('spring');
    expect(seriesForWeaponType('HG')).toBe('spring');
    expect(seriesForWeaponType('FT')).toBe('spring');
  });

  it('maps hammer types', () => {
    expect(seriesForWeaponType('AR')).toBe('hammer');
    expect(seriesForWeaponType('GL')).toBe('hammer');
    expect(seriesForWeaponType('RL')).toBe('hammer');
  });

  it('maps barrel types', () => {
    expect(seriesForWeaponType('MG')).toBe('barrel');
    expect(seriesForWeaponType('SR')).toBe('barrel');
    expect(seriesForWeaponType('RG')).toBe('barrel');
    expect(seriesForWeaponType('MT')).toBe('barrel');
  });
});

describe('calcUwMaterialXp', () => {
  it('applies the 1.5x bonus per rarity tier exactly (10/50/200/1000 -> 15/75/300/1500)', () => {
    // One Rusty spring (base 10) against 15 XP of SG demand: fully covered, no leftover.
    const r1 = calcUwMaterialXp({ Equipment_10: 1 }, { SG: 15 });
    expect(r1.effectiveOwned).toBe(15);
    expect(r1.deficit).toBe(0);

    const r2 = calcUwMaterialXp({ Equipment_11: 1 }, { SG: 75 }); // Intact spring, base 50
    expect(r2.effectiveOwned).toBe(75);

    const r3 = calcUwMaterialXp({ Equipment_12: 1 }, { SG: 300 }); // Chromium spring, base 200
    expect(r3.effectiveOwned).toBe(300);

    const r4 = calcUwMaterialXp({ Equipment_13: 1 }, { SG: 1500 }); // Titanium spring, base 1000
    expect(r4.effectiveOwned).toBe(1500);

    // Regression guard: the bonus must never be applied twice (22.5/112.5/450/2250 would be wrong).
    expect(r1.effectiveOwned).not.toBeCloseTo(22.5);
  });

  it('matches spring series to FT demand (not a firing-pin fallback)', () => {
    const withSpring = calcUwMaterialXp({ Equipment_10: 10 }, { FT: 100 }); // 10 * 15 = 150 XP available
    expect(withSpring.effectiveOwned).toBe(100);
    expect(withSpring.deficit).toBe(0);
  });

  it('does not give a mismatched series the bonus (hammer stock vs spring demand)', () => {
    // 1 Rusty hammer = base 10 XP, but SG demand only gets the bonus from spring/firing-pin.
    const result = calcUwMaterialXp({ Equipment_20: 1 }, { SG: 15 });
    expect(result.effectiveOwned).toBe(10); // base rate only
    expect(result.deficit).toBe(5); // aggregate, after the hammer's leftover joins the universal pool at base rate
  });

  it('firing pins cover any weapon type at the bonus rate', () => {
    const result = calcUwMaterialXp({ Equipment_40: 1 }, { AR: 15 }); // Rusty firing pin, hammer-type demand
    expect(result.effectiveOwned).toBe(15);
    expect(result.deficit).toBe(0);
  });

  it('allocates mixed inventory across multiple weapon-type students', () => {
    const inventory = { Equipment_10: 2, Equipment_20: 1, Equipment_40: 1 }; // 2 spring + 1 hammer + 1 firing pin (all Rusty)
    const demand = { SG: 15, AR: 10 }; // one SG student needs 15, one AR student needs 10
    const result = calcUwMaterialXp(inventory, demand);
    expect(result.required).toBe(25);
    // 2 springs (30 bonus XP) cover the 15 SG demand fully with 15 XP to spare (converted to base pool);
    // 1 hammer (15 bonus XP) covers the 10 AR demand fully with 5 XP to spare.
    expect(result.effectiveOwned).toBe(25);
    expect(result.deficit).toBe(0);
  });

  it('reports zero deficit when inventory exceeds demand', () => {
    const result = calcUwMaterialXp({ Equipment_40: 100 }, { SG: 15 });
    expect(result.deficit).toBe(0);
    expect(result.effectiveOwned).toBe(15);
  });

  it('handles no demand, no inventory, and no overlap cleanly', () => {
    expect(calcUwMaterialXp({}, {})).toMatchObject({ required: 0, effectiveOwned: 0, deficit: 0 });
    expect(calcUwMaterialXp({ Equipment_10: 5 }, {})).toMatchObject({ required: 0, effectiveOwned: 0, deficit: 0 });
    const noInventory = calcUwMaterialXp({}, { SG: 100 });
    expect(noInventory.required).toBe(100);
    expect(noInventory.effectiveOwned).toBe(0);
    expect(noInventory.deficit).toBe(100);
  });

  it('is deterministic: repeated calls with the same input always produce the same output', () => {
    const inventory = { Equipment_10: 1, Equipment_20: 3, Equipment_40: 2 };
    const demand = { SG: 500, AR: 400, MG: 100 };
    const first = calcUwMaterialXp(inventory, demand);
    const second = calcUwMaterialXp(inventory, demand);
    expect(second).toEqual(first);
  });

  it('computes independent series deficits with no cross-series ordering when there is no shared pool', () => {
    // With no firing pins and no leftover crossing between series, the combined deficit for two
    // independently-short series must equal the sum of each computed alone — no ordering effect.
    const springOnly = calcUwMaterialXp({ Equipment_10: 1 }, { SG: 100 });
    const hammerOnly = calcUwMaterialXp({ Equipment_20: 1 }, { AR: 100 });
    const combined = calcUwMaterialXp({ Equipment_10: 1, Equipment_20: 1 }, { SG: 100, AR: 100 });
    expect(combined.deficit).toBe(springOnly.deficit + hammerOnly.deficit);
  });

  it('aggregate deficit accounts for firing pins even when both series fall short on their own materials', () => {
    // Spring short by 85 XP, hammer short by 85 XP (own materials only) = 170 XP combined shortfall.
    // 12 Rusty firing pins = 12 * 15 = 180 bonus XP, more than enough to cover the combined gap.
    const result = calcUwMaterialXp({ Equipment_10: 1, Equipment_20: 1, Equipment_40: 12 }, { SG: 100, AR: 100 });
    expect(result.deficit).toBe(0);
    expect(result.effectiveOwned).toBe(result.required);
  });
});
