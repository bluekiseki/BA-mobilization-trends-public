import { describe, it, expect } from 'vitest';
import { calcUWLevelNeeds } from './calculatedGrowthNeeds';
import { calcUwRequiredXp, weaponEnhancementExp, weaponEnhancementItemIds } from '~/data/growthData';

describe('calcUwRequiredXp', () => {
  it('sums to 83,980 XP for a full 1->70 unique weapon level range (matches published totals)', () => {
    expect(calcUwRequiredXp(0, 70)).toBe(83_980);
  });

  it('returns 0 for a no-op range', () => {
    expect(calcUwRequiredXp(10, 10)).toBe(0);
  });
});

describe('calcUWLevelNeeds', () => {
  it('emits Equipment_43 (Titanium firing pin) for a large level jump when weapon type is unknown', () => {
    // Regression guard: the loop used to start at tier 3, so Equipment_43 (tier 4) was never produced.
    const needs = calcUWLevelNeeds(0, 70);
    expect(needs['Equipment_43']).toBeGreaterThan(0);
  });

  it('never needs more firing-pin XP than calcUwRequiredXp reports (needs must cover, not exceed by much via rounding only)', () => {
    for (const [from, to] of [
      [0, 70],
      [0, 30],
      [15, 45],
      [50, 70],
    ]) {
      const needs = calcUWLevelNeeds(from, to);
      const requiredXp = calcUwRequiredXp(from, to);
      const suppliedXp = ([1, 2, 3, 4] as const).reduce((sum, tier) => sum + (needs[`Equipment_${weaponEnhancementItemIds[tier]}`] ?? 0) * weaponEnhancementExp[tier], 0);
      // Rounding up to whole items means the material total can only ever meet or exceed demand.
      expect(suppliedXp).toBeGreaterThanOrEqual(requiredXp);
    }
  });

  // Root-cause fix: with a known weapon type, demand is denominated in that weapon's matching
  // series (spring/hammer/barrel) instead of always falling back to firing pins.
  it.each([
    ['SG', 10], // spring
    ['AR', 20], // hammer
    ['SR', 30], // barrel
  ] as const)('denominates in the matching series for weapon type %s (baseId %d), not firing pins', (weaponType, baseId) => {
    const needs = calcUWLevelNeeds(0, 70, weaponType);
    const seriesKeys = [0, 1, 2, 3].map((t) => `Equipment_${baseId + t}`);
    const seriesTotal = seriesKeys.reduce((sum, k) => sum + (needs[k] ?? 0), 0);
    expect(seriesTotal).toBeGreaterThan(0);
    expect(needs['Equipment_40']).toBeUndefined();
    expect(needs['Equipment_41']).toBeUndefined();
    expect(needs['Equipment_42']).toBeUndefined();
    expect(needs['Equipment_43']).toBeUndefined();
  });

  it('covers demand at least as well when denominated via a matching series as via firing pins (same bonus rate)', () => {
    for (const [from, to] of [
      [0, 70],
      [15, 45],
    ]) {
      const requiredXp = calcUwRequiredXp(from, to);
      const springNeeds = calcUWLevelNeeds(from, to, 'SG');
      const suppliedXp = ([0, 1, 2, 3] as const).reduce<number>((sum, i) => sum + (springNeeds[`Equipment_${10 + i}`] ?? 0) * weaponEnhancementExp[(i + 1) as 1 | 2 | 3 | 4], 0);
      expect(suppliedXp).toBeGreaterThanOrEqual(requiredXp);
    }
  });
});
