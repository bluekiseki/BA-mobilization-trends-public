import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventData, Student, StudentData, StudentPortraitData } from '~/types/plannerData';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import { calculatedGrowthNeeds, getStudentsUsingMaterial } from '~/utils/calculatedGrowthNeeds';
import { splitItemKey } from '~/utils/itemType';
import { buildGiftToStudentsMap, filterGiftStudentsForDisplay, type GiftStudentEntry } from '~/utils/student/giftStudents';
import { isStudentElephKey, type buildResourceEntries } from '~/features/inventory/logic/inventoryDashboard';

export interface GiftToStudentsInput {
  editingKey: string | null;
  students: StudentData;
  eventData: EventData | null;
}

/** Gift-affection lookup for the item being edited; empty unless it is a gift. */
export function buildEditingGiftMap({ editingKey, students, eventData }: GiftToStudentsInput) {
  if (!editingKey || !eventData) return {};
  const parts = splitItemKey(editingKey);
  if (parts?.[0] !== 'Item' || eventData.icons.Item?.[parts[1]]?.ItemCategory !== 6) return {};
  return buildGiftToStudentsMap(students, eventData);
}

export interface EditingGiftStudentsInput {
  editingKey: string | null;
  eventData: EventData | null;
  giftToStudentsMap: Record<string, GiftStudentEntry[]>;
}

/** Students who like the gift being edited; undefined when the item is not a gift. */
export function listEditingGiftStudents({ editingKey, eventData, giftToStudentsMap }: EditingGiftStudentsInput) {
  if (!editingKey || !eventData) return undefined;
  const parts = splitItemKey(editingKey);
  if (!parts) return undefined;
  const [category, id] = parts;
  const info = eventData.icons.Item?.[id];
  if (category !== 'Item' || info?.ItemCategory !== 6) return undefined;
  return filterGiftStudentsForDisplay(giftToStudentsMap[id] ?? [], info.Rarity ?? 0);
}

export interface PerStudentNeedsInput {
  editingKey: string | null;
  editingGiftStudents: GiftStudentEntry[] | undefined;
  growthPlans: GrowthPlan[];
  students: StudentData;
}

/** How much of the edited item each planned student still needs, largest first. */
export function calcEditingPerStudentNeeds({ editingKey, editingGiftStudents, growthPlans, students }: PerStudentNeedsInput) {
  if (!editingKey || editingGiftStudents !== undefined) return [];
  return growthPlans
    .filter((p) => p.studentId != null)
    .map((p) => ({ studentId: p.studentId as number, amount: calculatedGrowthNeeds([p], students)[editingKey] ?? 0 }))
    .filter((x) => x.amount > 0)
    .map((x) => ({ ...x, name: students[x.studentId]?.Name ?? `#${x.studentId}` }))
    .sort((a, b) => b.amount - a.amount);
}

export interface AllUsersInput {
  editingKey: string | null;
  editingGiftStudents: GiftStudentEntry[] | undefined;
  entries: ReturnType<typeof buildResourceEntries>;
  students: StudentData;
}

/** Every student who uses the edited material (Opart and Eleph only); undefined when not applicable. */
export function listEditingAllUsers({ editingKey, editingGiftStudents, entries, students }: AllUsersInput) {
  if (!editingKey || editingGiftStudents !== undefined) return undefined;
  const parts = splitItemKey(editingKey);
  if (!parts || parts[0] !== 'Item') return undefined;
  const itemId = Number(parts[1]);

  if (isStudentElephKey(editingKey)) {
    return [{ studentId: itemId, name: students[itemId]?.Name ?? `#${itemId}` }];
  }

  const entryType = entries.find((e) => e.key === editingKey)?.itemType;
  if (entryType !== 'Opart') return undefined;

  return getStudentsUsingMaterial(itemId, students)
    .map((id) => ({ studentId: id, name: students[id]?.Name ?? `#${id}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface StudentsWithPortraitInput {
  detailOpen: boolean;
  students: StudentData;
  studentPortraits: StudentPortraitData;
}

/** Students keyed by numeric id with the portrait merged in, only while the detail panel is open. */
export function mergeStudentPortraits({ detailOpen, students, studentPortraits }: StudentsWithPortraitInput): Record<number, Student> {
  if (!detailOpen) return {};
  const rec: Record<number, Student> = {};
  for (const [idStr, s] of Object.entries(students)) {
    rec[Number(idStr)] = { ...s, Portrait: studentPortraits[Number(idStr)] ?? s.Portrait };
  }
  return rec;
}

/** Raid / eraid schedule entries that have not ended yet, in start order. */
export function selectRaidConfigItems(raidSchedule: ScheduleItemV2[], startDate: string): ScheduleItemV2[] {
  return raidSchedule.filter((item) => (item.endTime ?? item.startTime).slice(0, 10) >= startDate).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** Joint-firing-drill schedule entries that have not ended yet, in start order. */
export function selectJfdConfigItems(raidSchedule: ScheduleItemV2[], startDate: string): ScheduleItemV2[] {
  return raidSchedule.filter((item) => item.id.startsWith('jfd-') && (item.endTime ?? item.startTime).slice(0, 10) >= startDate).sort((a, b) => a.startTime.localeCompare(b.startTime));
}
