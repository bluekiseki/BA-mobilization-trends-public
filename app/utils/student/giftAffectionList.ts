import type { EventData, Student } from '~/types/plannerData';
import { HighFlowerBouquetItemIds, LowFlowerBouquetItemIds } from './const';

type GiftStudent = Pick<Student, 'FavorItemTags' | 'FavorItemUniqueTags'>;
type GiftEventData = { icons: { Item: Record<string, Pick<EventData['icons']['Item'][string], 'ItemCategory' | 'TagsStr' | 'Rarity'>> } };

export const getGiftAffectionList = (studentInfo: GiftStudent, eventData: GiftEventData) => {
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

// A gift counts as "preferred" when it is not a flower bouquet and is worth more than the
// base affection for its rarity (SR 20, SSR 120).
export const isPreferredGift = (gift: { id: string; rarity: number; affectionPoints: number }) => {
  if ([...HighFlowerBouquetItemIds, ...LowFlowerBouquetItemIds].includes(Number(gift.id))) return false;
  if (gift.rarity === 2) return gift.affectionPoints > 20;
  if (gift.rarity === 3) return gift.affectionPoints > 120;
  return false;
};

// Gifts worth showing on a student profile: no flower bouquets, and only gifts the student
// actually prefers (above the base affection for their rarity).
export const getPreferredGiftList = (studentInfo: GiftStudent, eventData: GiftEventData) => getGiftAffectionList(studentInfo, eventData).filter(isPreferredGift);
