import { describe, expect, it } from 'vitest';
import { calculateEquipmentSurplus } from './blueprintUtils';

describe('calculateEquipmentSurplus', () => {
  it.each([
    { owned: 15000, farmed: 0, used: 0, expected: 15000 },
    { owned: 15000, farmed: 0, used: 15000, expected: 0 },
    { owned: 15000, farmed: 2000, used: 12000, expected: 5000 },
    { owned: 0, farmed: 2000, used: 500, expected: 1500 },
    { owned: 100, farmed: 50, used: 200, expected: 0 },
    { owned: 0, farmed: 0, used: 0, expected: 0 },
  ])('returns $expected surplus for $owned owned + $farmed farmed - $used used', ({ owned, farmed, used, expected }) => {
    const result = calculateEquipmentSurplus({
      materialInventory: owned ? { Equipment_501000: owned } : {},
      farmedByPlan: farmed ? { Equipment_501000: farmed } : {},
      totalEquipmentNeeds: {},
      blueprintsUsed: { Hat: used },
    });

    expect(result).toEqual(expected > 0 ? { Equipment_501000: expected } : {});
  });

  it('deducts blueprint usage by type and normal equipment needs by item without changing inputs', () => {
    const materialInventory = Object.freeze({ Equipment_501000: 15000, Equipment_502000: 600, Equipment_1001: 20, Equipment_2001: 5 });
    const farmedByPlan = Object.freeze({ Equipment_501000: 2000, Equipment_502000: 100, Equipment_1001: 10, Equipment_3001: 4.5 });
    const totalEquipmentNeeds = Object.freeze({ Equipment_1001: 12, Equipment_2001: 10, Equipment_3001: 4 });
    const blueprintsUsed = Object.freeze({ Hat: 12000, Gloves: 700 });

    expect(calculateEquipmentSurplus({ materialInventory, farmedByPlan, totalEquipmentNeeds, blueprintsUsed })).toEqual({
      Equipment_501000: 5000,
      Equipment_1001: 18,
      Equipment_3001: 0.5,
    });
  });
});
