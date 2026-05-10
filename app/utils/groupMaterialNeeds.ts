export type MaterialCategory = {
  categoryKey: string;
  items: { key: string; amount: number }[];
};

export type FungibleSubPool = { keys: readonly string[]; xpPer: readonly number[] };

// Each category may contain multiple independent sub-pools (different resources, same display group).
// Items within a sub-pool are interchangeable denominations of the same resource.
export const FUNGIBLE_POOLS: Record<string, FungibleSubPool[]> = {
  xpReports: [{ keys: ['Item_10', 'Item_11', 'Item_12', 'Item_13'], xpPer: [50, 500, 2000, 10000] }],
  equipEnh: [{ keys: ['Equipment_1', 'Equipment_2', 'Equipment_3', 'Equipment_4'], xpPer: [90, 360, 1440, 5760] }],
  uwGrowth: [{ keys: ['Equipment_40', 'Equipment_41', 'Equipment_42', 'Equipment_43'], xpPer: [15, 75, 300, 1500] }],
};

export function computeSubPoolXp(subPool: FungibleSubPool, record: Record<string, number>): number {
  return subPool.keys.reduce((sum, key, i) => sum + (record[key] ?? 0) * subPool.xpPer[i], 0);
}

// Greedy re-allocation (highest denomination first) so accumulated totals are "carried up".
// e.g. 4 SR reports (2000×4=8000 XP) → 0 SSR + 4 SR  →  but if 5 SR → 1 SSR.
export function compactSubPool(subPool: FungibleSubPool, needsItems: { key: string; amount: number }[]): { key: string; amount: number }[] {
  const keys = subPool.keys as readonly string[];
  const totalXp = needsItems.reduce((sum, { key, amount }) => {
    const idx = keys.indexOf(key);
    return idx >= 0 ? sum + amount * subPool.xpPer[idx] : sum;
  }, 0);
  if (totalXp === 0) return [];

  const result: { key: string; amount: number }[] = [];
  let remaining = totalXp;
  for (let i = keys.length - 1; i >= 0; i--) {
    const count = i === 0 ? Math.ceil(remaining / subPool.xpPer[i]) : Math.floor(remaining / subPool.xpPer[i]);
    if (count > 0) {
      result.push({ key: keys[i], amount: count });
      remaining -= count * subPool.xpPer[i];
      if (remaining <= 0) break;
    }
  }
  return result;
}

const CREDITS = new Set(['Currency_1']);
const ELIGMA = new Set(['Item_23']);
const XP_REPORTS = new Set(['Item_10', 'Item_11', 'Item_12', 'Item_13']);
const EQUIP_ENH = new Set(['Equipment_1', 'Equipment_2', 'Equipment_3', 'Equipment_4']); // Equipment enhancement stone
const UW_ENH = new Set(['Item_40', 'Item_41', 'Item_42', 'Item_43']); // Unique weapon enhancement material
const UW_GROWTH = new Set(['Equipment_40', 'Equipment_41', 'Equipment_42', 'Equipment_43']); // Unique weapon growth material
const POTENTIAL = new Set(['Item_2000', 'Item_2001', 'Item_2002']);

const itemId = (key: string) => parseInt(key.split('_')[1] ?? '0', 10);

/** Returns true for items that should always appear in inventory input mode */
export function isInventoryMaterial(key: string): boolean {
  if (CREDITS.has(key) || ELIGMA.has(key) || XP_REPORTS.has(key) || EQUIP_ENH.has(key) || UW_ENH.has(key) || POTENTIAL.has(key)) return true;
  if (key === 'Item_9999') return true;
  if (key.startsWith('Item_')) {
    const id = itemId(key);
    return (id >= 100 && id <= 299) || (id >= 3000 && id <= 4999); // || (id >= 10000 && id <= 29999);
  }
  if (UW_GROWTH.has(key)) return true;
  if (key.startsWith('Equipment_') && !EQUIP_ENH.has(key)) return true; // Equipment blueprint
  return false;
}

const ORDER = ['credits', 'eligma', 'eleph', 'xpReports', 'equipEnh', 'uwGrowth', 'potential', 'opart', 'tacticalBD', 'techNote', 'equipment', 'skill', 'other'] as const;
type CategoryKey = (typeof ORDER)[number];

export function groupMaterialNeeds(needs: Record<string, number>): MaterialCategory[] {
  const groups: Record<CategoryKey, { key: string; amount: number }[]> = {
    credits: [],
    eligma: [],
    xpReports: [],
    equipEnh: [],
    uwGrowth: [],
    potential: [],
    opart: [],
    tacticalBD: [],
    techNote: [],
    equipment: [],
    skill: [],
    eleph: [],
    other: [],
  };

  for (const [key, amount] of Object.entries(needs)) {
    if (CREDITS.has(key)) groups.credits.push({ key, amount });
    else if (ELIGMA.has(key)) groups.eligma.push({ key, amount });
    else if (XP_REPORTS.has(key)) groups.xpReports.push({ key, amount });
    else if (EQUIP_ENH.has(key)) groups.equipEnh.push({ key, amount });
    else if (UW_ENH.has(key))
      groups.equipEnh.push({ key, amount }); // UW materials: same display group as enhancement stones
    else if (UW_GROWTH.has(key)) groups.uwGrowth.push({ key, amount });
    else if (POTENTIAL.has(key)) groups.potential.push({ key, amount });
    else if (key.startsWith('Equipment_')) groups.equipment.push({ key, amount });
    else if (key.startsWith('Item_')) {
      const id = itemId(key);
      if (id >= 100 && id <= 299) groups.opart.push({ key, amount });
      else if (id >= 3000 && id <= 3999) groups.tacticalBD.push({ key, amount });
      else if (id >= 4000 && id <= 4999) groups.techNote.push({ key, amount });
      else if (id >= 10000 && id <= 29999) groups.eleph.push({ key, amount });
      else groups.skill.push({ key, amount });
    } else groups.other.push({ key, amount });
  }

  return ORDER.filter((k) => groups[k].length > 0).map((k) => ({ categoryKey: k, items: groups[k] }));
}
