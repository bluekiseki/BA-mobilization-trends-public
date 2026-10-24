import { describe, it, expect } from 'vitest';
import { compactPoolDeficit, compactPoolNet, compactPoolOwned, computeSubPoolXp, FUNGIBLE_POOLS, type FungibleSubPool } from './groupMaterialNeeds';

// A denomination-1/10/100/1000-style pool, easy to hand-verify.
const testPool: FungibleSubPool = { keys: ['Item_a', 'Item_b', 'Item_c', 'Item_d'], xpPer: [10, 100, 500, 2000] };

describe('compactPoolNet / compactPoolDeficit', () => {
  it('returns null (no deficit) when owned exactly equals needed', () => {
    // 1 top-tier report (2000 XP) needed, 200 bottom-tier reports (2000 XP) owned — exact match.
    const owned = { Item_a: 200 };
    const needed = { Item_d: 1 };
    expect(compactPoolNet(testPool, owned, needed)).toBeNull();
    expect(compactPoolDeficit(testPool, owned, needed)).toEqual([]); // regression guard: no phantom "+200 Item_a" surplus either
  });

  it('reports a partial shortfall re-expressed in the fewest highest-denomination items, with the final remainder rounded up', () => {
    // Needed: 2 top-tier (4000 XP). Owned: 150 bottom-tier (1500 XP). Deficit = 2500 XP.
    const owned = { Item_a: 150 };
    const needed = { Item_d: 2 };
    const net = compactPoolNet(testPool, owned, needed);
    expect(net?.sign).toBe(-1);
    // 2500 XP -> 1x Item_d (2000) leaves 500 -> 1x Item_c (500) exactly, no further rounding needed here.
    expect(net?.breakdown).toEqual([
      { key: 'Item_d', amount: 1 },
      { key: 'Item_c', amount: 1 },
    ]);
    expect(compactPoolDeficit(testPool, owned, needed)).toEqual(net?.breakdown);
  });

  it('rounds the final remainder up at the lowest denomination reached', () => {
    // Deficit = 15 XP, smallest denomination is 10 XP -> must round up to 2, not floor to 1.
    const net = compactPoolNet(testPool, {}, { Item_a: 1.5 }); // 1.5 * 10 = 15 XP needed, 0 owned
    expect(net?.sign).toBe(-1);
    expect(net?.breakdown).toEqual([{ key: 'Item_a', amount: 2 }]);
  });

  it('reports a pure surplus (owned > needed) with sign +1', () => {
    const owned = { Item_d: 1 }; // 2000 XP owned
    const needed = { Item_a: 50 }; // 500 XP needed
    const net = compactPoolNet(testPool, owned, needed);
    expect(net?.sign).toBe(1);
    expect(net?.breakdown.reduce((sum, { key, amount }) => sum + amount * testPool.xpPer[testPool.keys.indexOf(key)], 0)).toBe(1500);
    expect(compactPoolDeficit(testPool, owned, needed)).toEqual([]); // deficit-only view sees no shortfall
  });

  it('handles no inventory at all as a full deficit', () => {
    const net = compactPoolNet(testPool, {}, { Item_d: 1 });
    expect(net?.sign).toBe(-1);
    expect(net?.breakdown).toEqual([{ key: 'Item_d', amount: 1 }]);
  });
});

describe('compactPoolOwned', () => {
  it('carries lower-tier owned counts up into the fewest highest-denomination items', () => {
    // 250 bottom-tier (2500 XP) carries up to higher denominations with no XP lost.
    const owned = { Item_a: 250 };
    const result = compactPoolOwned(testPool, owned);
    const totalXp = testPool.keys.reduce((sum, key, i) => sum + (result[key] ?? 0) * testPool.xpPer[i], 0);
    expect(totalXp).toBe(2500);
    expect(result.Item_a).toBe(0); // fully consolidated away from the bottom tier
  });

  it('returns all-zero for every key when nothing is owned', () => {
    expect(compactPoolOwned(testPool, {})).toEqual({ Item_a: 0, Item_b: 0, Item_c: 0, Item_d: 0 });
  });

  it('leaves an exact top-tier holding unchanged', () => {
    expect(compactPoolOwned(testPool, { Item_d: 3 })).toEqual({ Item_a: 0, Item_b: 0, Item_c: 0, Item_d: 3 });
  });

  it('is a pure display transform: it never changes the total XP represented', () => {
    const owned = { Item_a: 37, Item_b: 12, Item_c: 1, Item_d: 0 };
    const before = computeSubPoolXp(testPool, owned);
    const after = computeSubPoolXp(testPool, compactPoolOwned(testPool, owned));
    expect(after).toBe(before);
  });
});

describe('FUNGIBLE_POOLS wiring (regression: values must stay in sync with growthData constants)', () => {
  it('xpReports matches the known report EXP table', () => {
    expect(FUNGIBLE_POOLS.xpReports[0].xpPer).toEqual([50, 500, 2000, 10000]);
  });

  it('equipEnh matches the known enhancement stone EXP table', () => {
    expect(FUNGIBLE_POOLS.equipEnh[0].xpPer).toEqual([90, 360, 1440, 5760]);
  });

  it('uwGrowth has 4 sub-pools (spring/hammer/barrel at base rate, firing pin at bonus rate)', () => {
    expect(FUNGIBLE_POOLS.uwGrowth).toHaveLength(4);
    expect(FUNGIBLE_POOLS.uwGrowth[0].xpPer).toEqual([10, 50, 200, 1000]); // base rate
    expect(FUNGIBLE_POOLS.uwGrowth[3].xpPer).toEqual([15, 75, 300, 1500]); // firing pin — already bonus rate
  });

  it('computeSubPoolXp sums owned counts against a pool denomination correctly', () => {
    expect(computeSubPoolXp(FUNGIBLE_POOLS.xpReports[0], { Item_10: 3, Item_13: 1 })).toBe(3 * 50 + 10000);
  });
});
