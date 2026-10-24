// app/components/planner/StudentGrowth/furnitureInteractionList.ts
import type { StudentData } from '~/types/plannerData';

export interface FurnitureStudentEntry {
  id: string;
  name: string;
}

const furnitureMapCache = new WeakMap<object, Record<string, FurnitureStudentEntry[]>>();

/**
 * Inverts every student's `FurnitureInteraction` into a furniture-id -> students map.
 * `FurnitureInteraction` is `[tier1, tier2, tier3]`, each tier an array of
 * `[furnitureId, groupIndex]` pairs; all tiers are flattened and de-duplicated.
 */
export const buildFurnitureToStudentsMap = (allStudents: StudentData | undefined): Record<string, FurnitureStudentEntry[]> => {
  if (!allStudents) return {};

  const cached = furnitureMapCache.get(allStudents);
  if (cached) return cached;

  const map: Record<string, FurnitureStudentEntry[]> = {};

  Object.entries(allStudents).forEach(([studentId, student]) => {
    const interaction = student.FurnitureInteraction;
    if (!interaction) return;

    const furnitureIds = new Set<string>();
    for (const tier of interaction) {
      for (const pair of tier) {
        if (typeof pair[0] === 'number') furnitureIds.add(String(pair[0]));
      }
    }

    furnitureIds.forEach((furnitureId) => {
      if (!map[furnitureId]) map[furnitureId] = [];
      map[furnitureId].push({ id: studentId, name: student.Name });
    });
  });

  Object.values(map).forEach((students) => students.sort((a, b) => a.name?.localeCompare(b.name)));

  furnitureMapCache.set(allStudents, map);
  return map;
};
