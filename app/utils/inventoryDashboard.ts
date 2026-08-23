import { getLocalizeEtcName } from '~/components/planner/common/locale';
import { equipmentBlueprintId, equipmentId } from '~/data/growthData';
import type { GrowthPlan } from '~/types/growthPlan';
import type { IconInfos, Student, StudentData } from '~/types/plannerData';
import { getBdNoteSchoolKey } from '~/utils/bdNoteSchool';
import { calculatedGrowthNeeds } from '~/utils/calculatedGrowthNeeds';
import type { Locale } from '~/utils/i18n/config';
import { getShopItemType, type ItemType } from '~/utils/itemType';

// equipmentBlueprintId ids are a separate crafting-recipe space already normalized into
// equipmentId before inventory tracking (see normalizeBluprintToEquipment), so they'd be
// duplicate-looking rows if not excluded. Tier-1 ids are shared between both, so they stay visible.
const BLUEPRINT_ONLY_IDS = (() => {
  const ids = new Set<number>();
  for (const list of Object.values(equipmentBlueprintId)) for (const id of list) ids.add(id);
  for (const list of Object.values(equipmentId)) for (const id of list) ids.delete(id);
  return ids;
})();

// Per-student eleph items (Item_{studentId}) use this ID range — same range groupMaterialNeeds.ts
// uses to bucket "eleph" needs.
const ELEPH_ID_MIN = 10000;
const ELEPH_ID_MAX = 29999;

export function isStudentElephKey(key: string): boolean {
  if (!key.startsWith('Item_')) return false;
  const id = Number(key.slice(5));
  return id >= ELEPH_ID_MIN && id <= ELEPH_ID_MAX;
}

export interface ResourceEntry {
  key: string; // e.g. 'Item_3000', 'Equipment_501000', 'Currency_1'
  category: string; // 'Item' | 'Equipment' | 'Currency' | 'Furniture'
  id: string;
  itemType: ItemType;
  rarity: number;
  owned: number;
  needed: number;
  name: string; // resolved once here (same source as getItemName) so search doesn't re-derive it per keystroke
  // Extended fields, resolved once here rather than re-derived per filter call. null = not
  // applicable to this entry, so filters on these fields should let null entries pass through.
  school: string | null;
  tacticRole: Student['TacticRole'] | null;
  squadType: Student['SquadType'] | null;
  shopCategories: number[]; // raw ShopCategoryType enum values (see SHOP_CATEGORY_LABEL)
  tags: string[]; // raw TagsStr codes — meaning largely unknown, exposed as-is for now
}

const CATALOG_CATEGORIES = ['Item', 'Equipment', 'Currency', 'Furniture'] as const;

function resolveSchoolAndStudentFields(key: string, itemType: ItemType, id: string, students: StudentData): Pick<ResourceEntry, 'school' | 'tacticRole' | 'squadType'> {
  if (isStudentElephKey(key)) {
    const student = students[Number(id)];
    return { school: student?.School ?? null, tacticRole: student?.TacticRole ?? null, squadType: student?.SquadType ?? null };
  }
  if (itemType === 'TacticalBD') return { school: getBdNoteSchoolKey(Number(id), 3000), tacticRole: null, squadType: null };
  if (itemType === 'TechNote') return { school: getBdNoteSchoolKey(Number(id), 4000), tacticRole: null, squadType: null };
  return { school: null, tacticRole: null, squadType: null };
}

/* Enumerate all catalog resources (owned + unowned for input entry); use type filter to narrow */
export function buildResourceEntries(iconInfos: IconInfos, materialInventory: Record<string, number>, needed: Record<string, number>, students: StudentData, locale: Locale): ResourceEntry[] {
  const entries: ResourceEntry[] = [];

  for (const category of CATALOG_CATEGORIES) {
    const group = iconInfos[category];
    if (!group) continue;
    for (const [id, info] of Object.entries(group)) {
      if (category === 'Equipment' && BLUEPRINT_ONLY_IDS.has(Number(id))) continue;
      const key = `${category}_${id}`;
      const itemType = getShopItemType(category, Number(id), info);
      if (!itemType) continue;
      entries.push({
        key,
        category,
        id,
        itemType,
        rarity: info.Rarity ?? 0,
        owned: materialInventory[key] ?? 0,
        needed: needed[key] ?? 0,
        name: getLocalizeEtcName(info.LocalizeEtc, locale) || key,
        ...resolveSchoolAndStudentFields(key, itemType, id, students),
        shopCategories: info.ShopCategory ?? [],
        tags: info.TagsStr ?? [],
      });
    }
  }

  return entries;
}

export type SortKey = 'type' | 'rarity' | 'id' | 'owned' | 'deficit';

// Display order + Korean labels (i18n deferred — hardcoded for now, see plan notes). Used by the
// type-tag filter (semantic classification) — NOT used for sorting, see CATEGORY_ORDER_INDEX below.
export const TYPE_DISPLAY_ORDER: ItemType[] = ['Gem', 'Credit', 'SecretStone', 'Favor', 'Opart', 'ExpGrowth', 'Equipment', 'TechNote', 'TacticalBD', 'Material', 'Coin', 'Furniture', 'AP'];

// Sorts by raw catalog category (Item/Equipment/Currency/Furniture), not semantic ItemType, so
// ids stay in one ascending run per category (e.g. eleph stays with "Item" instead of jumping
// to the front via its SecretStone semantic type).
const CATEGORY_ORDER_INDEX: Record<string, number> = { Item: 0, Equipment: 1, Currency: 2, Furniture: 3 };

export function sortResourceEntries(entries: ResourceEntry[], sortBy: SortKey): ResourceEntry[] {
  const sorted = [...entries];
  switch (sortBy) {
    case 'type':
      sorted.sort((a, b) => (CATEGORY_ORDER_INDEX[a.category] ?? 99) - (CATEGORY_ORDER_INDEX[b.category] ?? 99) || Number(a.id) - Number(b.id));
      break;
    case 'rarity':
      sorted.sort((a, b) => b.rarity - a.rarity || Number(a.id) - Number(b.id));
      break;
    case 'id':
      sorted.sort((a, b) => Number(a.id) - Number(b.id));
      break;
    case 'owned':
      sorted.sort((a, b) => b.owned - a.owned);
      break;
    case 'deficit':
      sorted.sort((a, b) => b.needed - b.owned - (a.needed - a.owned));
      break;
  }
  return sorted;
}

// What number the icon badge shows — a pure display concern, independent of what the edit sheet
// actually edits (always `owned`).
export type DisplayMode = 'owned' | 'needed' | 'diff' | 'deficit';

export function getDisplayAmount(owned: number, needed: number, mode: DisplayMode): number {
  switch (mode) {
    case 'owned':
      return owned;
    case 'needed':
      return needed;
    case 'diff':
      return owned - needed;
    case 'deficit':
      return Math.max(needed - owned, 0);
  }
}

export interface StudentResourceGroup {
  studentId: number;
  name: string;
  entries: ResourceEntry[];
}

/* Group filtered resources by student growth plan; `needed` per-student, `owned` shared */
export function buildStudentResourceGroups(plans: GrowthPlan[], students: StudentData, filteredEntries: ResourceEntry[]): StudentResourceGroup[] {
  const plansByStudent = new Map<number, GrowthPlan[]>();
  for (const plan of plans) {
    if (plan.studentId == null) continue;
    const list = plansByStudent.get(plan.studentId) ?? [];
    list.push(plan);
    plansByStudent.set(plan.studentId, list);
  }

  const groups: StudentResourceGroup[] = [];
  for (const [studentId, studentPlans] of plansByStudent) {
    const studentNeeds = calculatedGrowthNeeds(studentPlans, students);
    const entries = filteredEntries.map((e) => ({ ...e, needed: studentNeeds[e.key] ?? 0 })).filter((e) => e.needed > 0);
    if (entries.length === 0) continue;
    groups.push({ studentId, name: students[studentId]?.Name ?? `#${studentId}`, entries });
  }

  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

// Types with a well-defined 2-axis structure that can also be viewed as a matrix.
export const MATRIX_CAPABLE_TYPES = new Set<ItemType>(['Equipment', 'TacticalBD', 'TechNote']);

// ShopCategoryType enum (game master data). Raw names, untranslated — only values present in the catalog are ever shown.
export const SHOP_CATEGORY_LABEL: Record<number, string> = {
  0: 'General',
  1: 'SecretStone',
  2: 'Raid',
  3: 'Gold',
  4: 'Ap',
  5: 'PickupGacha',
  6: 'NormalGacha',
  7: 'PointGacha',
  8: 'EventGacha',
  9: 'ArenaTicket',
  10: 'Arena',
  11: 'TutoGacha',
  12: 'RecruitSellection',
  13: 'EventContent_0',
  14: 'EventContent_1',
  15: 'EventContent_2',
  16: 'EventContent_3',
  17: 'EventContent_4',
  18: '_Obsolete',
  19: 'LimitedGacha',
  20: 'MasterCoin',
  21: 'SecretStoneGrowth',
  22: 'TicketGacha',
  23: 'DirectPayGacha_DontUseGlobal',
  24: 'FesGacha',
  25: 'TimeAttack',
  26: 'Chaser',
  27: 'ChaserTicket',
  28: 'SchoolDungeonTicket',
  29: 'AcademyTicket',
  30: 'Special',
  31: 'Care',
  32: 'BeforehandGacha',
  33: 'EliminateRaid',
  34: 'GlobalSpecialGacha',
  35: 'SelectPickupGacha',
  36: 'GemDaily',
  37: 'GemWeekly',
  38: 'CafeSummonTicket',
  39: 'SelectPickupFesGacha',
  40: 'SelectPickupLimitedGacha',
};
