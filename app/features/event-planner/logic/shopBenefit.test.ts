import { describe, expect, it } from 'vitest';
import { commissionApValue, creditsPerAp, enhancementStoneApValue, reportApValue, shopBenefitRatio } from './shopBenefit';

const slumpia = { id: 'slumpia-N', area: 'slumpia', level: 'N' } as const;
const factory = { id: 'factory-N', area: 'factory', level: 'N' } as const;

describe('shopBenefit', () => {
  it('keeps the published 2x values', () => {
    expect(reportApValue(2)).toBeCloseTo(13.0293, 3);
    expect(enhancementStoneApValue(2, 'K')).toBeCloseTo(9.754, 3);
    expect(creditsPerAp(2)).toBe(16550);
  });

  it('scales with the multiplier', () => {
    expect(reportApValue(3)).toBeCloseTo((reportApValue(2) * 2) / 3, 6);
    expect(creditsPerAp(3)).toBe(24825);
  });

  it('values credits from the Slumpia area only', () => {
    const credits = { itemType: undefined, rewardType: 'Currency', rewardId: 1, amount: 50_000 };
    expect(commissionApValue(slumpia, 2, credits)).toBeCloseTo(50_000 / 16550, 6);
    expect(commissionApValue(factory, 2, credits)).toBeNull();
  });

  it('values reports from the factory area and stones from Slumpia', () => {
    expect(commissionApValue(factory, 3, { itemType: 'ExpGrowth', rewardType: 'Item', rewardId: 13, amount: 2 })).toBeCloseTo(reportApValue(3) * 2, 6);
    expect(commissionApValue(factory, 3, { itemType: 'ExpGrowth', rewardType: 'Item', rewardId: 11, amount: 1 })).toBeCloseTo(reportApValue(3) * 0.05, 6);
    expect(commissionApValue(slumpia, 3, { itemType: 'Equipment', rewardType: 'Equipment', rewardId: 4, amount: 1 })).toBeCloseTo(enhancementStoneApValue(3), 6);
    expect(commissionApValue(slumpia, 3, { itemType: 'Equipment', rewardType: 'Equipment', rewardId: 2, amount: 2 })).toBeCloseTo((enhancementStoneApValue(3) * 2) / 16, 6);
    expect(commissionApValue(slumpia, 3, { itemType: 'Equipment', rewardType: 'Equipment', rewardId: 9, amount: 1 })).toBeNull();
  });

  it('computes the ratio and rejects unknown prices', () => {
    expect(shopBenefitRatio(6, 5, 0.6)).toBeCloseTo(2, 6);
    expect(shopBenefitRatio(6, 5, 0)).toBeNull();
  });
});
