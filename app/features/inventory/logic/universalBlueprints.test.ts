import { describe, expect, it } from 'vitest';
import { calcFungiblePoolData } from './inventoryView';

const calc = (displayInventory: Record<string, number>, needed: Record<string, number>) => calcFungiblePoolData({ showTarget: true, displayInventory, needed, growthPlans: [], students: {} });

describe('universal blueprints in the inventory deficit', () => {
  it('covers missing gear with owned universal blueprints, lowest tier first', () => {
    // Tier 2 costs 2 and tier 3 costs 3 blueprints; 4 blueprints close the tier-2 gap and one tier-3 piece stays short.
    const { fungibleDeficitByKey } = calc({ Equipment_501000: 4, Equipment_1001: 1 }, { Equipment_1001: 3, Equipment_1002: 1 });
    expect(fungibleDeficitByKey.Equipment_1001).toBe(0);
    expect(fungibleDeficitByKey.Equipment_1002).toBeUndefined();
  });

  it('leaves gear untouched when no blueprint is owned', () => {
    const { fungibleDeficitByKey } = calc({ Equipment_1001: 1 }, { Equipment_1001: 3 });
    expect(fungibleDeficitByKey.Equipment_1001).toBeUndefined();
  });
});
