import { describe, expect, it } from 'vitest';
import type { CardShopItem } from '~/types/plannerData';
import { getCardShopRateRows, getCardShopSlotRates } from './cardShopRates';

let nextId = 1;
const card = (RefreshGroup: number, Rarity: number, Prob: number, rewardId: number): CardShopItem => ({
  Id: nextId++,
  Rarity,
  Prob,
  CostGoodsId: 1,
  RewardParcelType: [4],
  RewardParcelTypeStr: ['Item'],
  RewardParcelId: [rewardId],
  RewardParcelAmount: [1],
  RefreshGroup,
  CostGoods: { ConsumeParcelId: [1], ConsumeExtraAmount: [200, 200, 200, 200] },
});

const normalGroup = (group: number): CardShopItem[] => [card(group, 0, 4050, 1), card(group, 1, 3200, 2), card(group, 2, 1950, 3), card(group, 3, 800, 4)];

describe('getCardShopSlotRates', () => {
  const cards = [...normalGroup(1), ...normalGroup(2), ...normalGroup(3), card(4, 2, 9000, 5), card(4, 3, 1000, 6)];
  const slots = getCardShopSlotRates(cards);

  it('merges identical normal groups and keeps the guaranteed group separate', () => {
    expect(slots).toHaveLength(2);
    expect(slots[0].groups).toEqual([1, 2, 3]);
    expect(slots[1].groups).toEqual([4]);
  });

  it('computes rarity percents per slot', () => {
    expect(slots[0].byRarity).toEqual({ 0: 40.5, 1: 32, 2: 19.5, 3: 8 });
    expect(slots[1].byRarity[0]).toBeUndefined();
    expect(slots[1].byRarity[2]).toBeCloseTo(90);
    expect(slots[1].byRarity[3]).toBeCloseTo(10);
  });

  it('merges cards with the same reward into one row across slots', () => {
    // Same reward ids as the normal SR/UR cards (3 and 4) so they share rows with the guaranteed slot
    const shared = [...normalGroup(1), card(4, 2, 9000, 3), card(4, 3, 1000, 4)];
    const rows = getCardShopRateRows(getCardShopSlotRates(shared));
    expect(rows).toHaveLength(4);
    const sr = rows.find((r) => r.card.Rarity === 2);
    expect(sr?.percents[0]).toBeCloseTo(19.5);
    expect(sr?.percents[1]).toBeCloseTo(90);
    expect(rows.find((r) => r.card.Rarity === 0)?.percents[1]).toBeNull();
  });

  it('sums each slot to 100%', () => {
    for (const slot of slots) expect(slot.cards.reduce((s, c) => s + c.percent, 0)).toBeCloseTo(100);
  });
});
