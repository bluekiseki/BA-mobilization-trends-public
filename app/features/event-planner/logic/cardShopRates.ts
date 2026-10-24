import type { CardShopItem } from '~/types/plannerData';

export type CardShopSlotRates = {
  // RefreshGroup ids that share this exact distribution
  groups: number[];
  // Rarity -> percent of the slot (0-100)
  byRarity: Record<number, number>;
  // Cards in this slot with their individual percent, sorted by rarity then percent
  cards: { card: CardShopItem; percent: number }[];
};

// Group cards by RefreshGroup and normalize Prob into percents.
// Groups with an identical rarity distribution and card list are merged into one slot.
export const getCardShopSlotRates = (cards: CardShopItem[]): CardShopSlotRates[] => {
  const groupIds = [...new Set(cards.map((c) => c.RefreshGroup))].sort((a, b) => a - b);
  const slots: CardShopSlotRates[] = [];
  const signatures: string[] = [];

  for (const groupId of groupIds) {
    const pool = cards.filter((c) => c.RefreshGroup === groupId);
    const total = pool.reduce((sum, c) => sum + c.Prob, 0);
    if (total <= 0) continue;

    const byRarity: Record<number, number> = {};
    for (const c of pool) byRarity[c.Rarity] = (byRarity[c.Rarity] ?? 0) + (c.Prob / total) * 100;

    const sorted = pool.map((card) => ({ card, percent: (card.Prob / total) * 100 })).sort((a, b) => a.card.Rarity - b.card.Rarity || b.percent - a.percent);
    const signature = sorted.map(({ card }) => `${card.Rarity}:${card.Prob}:${card.RewardParcelId.join(',')}:${card.RewardParcelAmount.join(',')}`).join('|');

    const existing = signatures.indexOf(signature);
    if (existing >= 0) {
      slots[existing].groups.push(groupId);
      continue;
    }
    signatures.push(signature);
    slots.push({ groups: [groupId], byRarity, cards: sorted });
  }

  return slots;
};

export type CardShopRateRow = {
  key: string;
  card: CardShopItem;
  // Percent per slot (same order as the slots), null when the card is not in that slot
  percents: (number | null)[];
};

// Merge cards that give the same reward across slots into one row, so a card shows its rate in every slot side by side.
export const getCardShopRateRows = (slots: CardShopSlotRates[]): CardShopRateRow[] => {
  const rows = new Map<string, CardShopRateRow>();

  slots.forEach((slot, slotIndex) => {
    for (const { card, percent } of slot.cards) {
      const key = `${card.Rarity}:${card.RewardParcelTypeStr.join(',')}:${card.RewardParcelId.join(',')}:${card.RewardParcelAmount.join(',')}`;
      let row = rows.get(key);
      if (!row) {
        row = { key, card, percents: slots.map(() => null) };
        rows.set(key, row);
      }
      row.percents[slotIndex] = (row.percents[slotIndex] ?? 0) + percent;
    }
  });

  const maxPercent = (row: CardShopRateRow) => Math.max(...row.percents.map((p) => p ?? 0));
  return [...rows.values()].sort((a, b) => a.card.Rarity - b.card.Rarity || maxPercent(b) - maxPercent(a));
};

export const formatPercent = (value: number): string => `${Number(value.toFixed(2))}%`;
