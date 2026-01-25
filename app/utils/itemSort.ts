// app/utils/itemSort.ts
import type { EventData } from '~/types/plannerData';

/**
 * Returns the priority value for sorting items (the lower the priority, the higher the priority)
 */
export const getItemSortPriority = (key: string, eventData: EventData): number => {
  const [type, id] = key.split('_');

  const numericId = Number(id);

  const eventItemIds = new Set(eventData?.currency?.map((c) => c.ItemUniqueId));
  if (eventItemIds.has(numericId)) {
    return 1;
  }

  if (type == 'Currency' && id == '3') return 10; // Pyroxene
  if (type == 'Item' && id == '23') return 11; //  Eligma
  if (type == 'Item' && numericId >= 10000 && numericId < 30000) return 12; //  Eleph

  if (type == 'Currency') return 20;

  // rarity
  const rarity = (eventData.icons as any)?.[type]?.[id]?.Rarity;
  switch (rarity) {
    case 3:
      return 30;
    case 2:
      return 31;
    case 1:
      return 32;
    case 0:
      return 33;
  }

  // etc
  return 100;
};
