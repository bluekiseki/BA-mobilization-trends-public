import type { EventData, Student } from '~/types/plannerData';
import { HighFlowerBouquetItemIds, LowFlowerBouquetItemIds } from './const';

export const getGiftAffectionList = (studentInfo: Student, eventData: EventData) => {
  const studentTags = [...(studentInfo.FavorItemTags || []), ...(studentInfo.FavorItemUniqueTags || [])];
  const allGifts = Object.entries(eventData.icons.Item)
    .filter(([, itemData]) => itemData.ItemCategory === 6)
    .map(([itemId, itemData]) => {
      const matchCount = itemData.TagsStr?.filter((tag) => studentTags.includes(tag)).length || 0;
      let preferenceLevel = matchCount + 1 + Number(itemData.Rarity === 3);
      let affectionPoints = 0;
      const idNum = Number(itemId);

      if (HighFlowerBouquetItemIds.includes(idNum)) {
        affectionPoints = 240;
        preferenceLevel = 4;
      } else if (LowFlowerBouquetItemIds.includes(idNum)) {
        affectionPoints = 60;
        preferenceLevel = 3;
      } else if (itemData.Rarity === 3) {
        affectionPoints = preferenceLevel >= 4 ? 240 : preferenceLevel === 3 ? 180 : 120;
      } else {
        affectionPoints = preferenceLevel >= 4 ? 80 : preferenceLevel === 3 ? 60 : preferenceLevel === 2 ? 40 : 20;
      }

      return { id: itemId, type: 'Item', rarity: itemData.Rarity, affectionPoints, preferenceLevel };
    });
  return allGifts.sort((a, b) => b.rarity - a.rarity || b.affectionPoints - a.affectionPoints);
};
