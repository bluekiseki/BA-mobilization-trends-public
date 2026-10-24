import type { EventData, StudentData } from '~/types/plannerData';
import { getGiftAffectionList } from '~/utils/student/giftAffectionList';

export interface GiftStudentEntry {
  id: string;
  name: string;
  preferenceLevel: number;
  affectionPoints: number;
  rarity: number;
}
const giftMapCache = new WeakMap<object, WeakMap<object, Record<string, GiftStudentEntry[]>>>();
export const buildGiftToStudentsMap = (allStudents: StudentData | undefined, eventData: EventData): Record<string, GiftStudentEntry[]> => {
  if (!allStudents || !eventData) return {};

  if (!giftMapCache.has(allStudents)) giftMapCache.set(allStudents, new WeakMap());
  const innerCache = giftMapCache.get(allStudents);
  if (!innerCache) return {};
  const cached = innerCache.get(eventData);
  if (cached) return cached;

  const map: Record<string, GiftStudentEntry[]> = {};

  Object.entries(allStudents).forEach(([studentId, student]) => {
    const gifts = getGiftAffectionList(student, eventData);
    gifts.forEach((gift) => {
      if (gift.affectionPoints <= 20) return;
      if (!map[gift.id]) map[gift.id] = [];
      map[gift.id].push({
        id: studentId,
        name: student.Name,
        preferenceLevel: gift.preferenceLevel,
        affectionPoints: gift.affectionPoints,
        rarity: gift.rarity,
      });
    });
  });

  Object.values(map).forEach((students) => students.sort((a, b) => b.affectionPoints - a.affectionPoints || a.name?.localeCompare(b.name)));

  innerCache.set(eventData, map);
  return map;
};
// --- Shared filter (rarity-3 gifts cap affection at 120, so a student already there gets no
// further benefit and shouldn't be listed) ---

export function filterGiftStudentsForDisplay(students: GiftStudentEntry[], rarity: number): GiftStudentEntry[] {
  return students.filter((s) => !(rarity === 3 && s.affectionPoints === 120));
}
