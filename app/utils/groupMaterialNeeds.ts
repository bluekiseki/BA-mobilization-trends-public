import { equipmentReinforcementExp, reportExp, reportItemIds, UW_FIRING_PIN_BASE_ID, UW_MATERIAL_SERIES, weaponEnhancementExp, weaponEnhancementExpBase } from '~/data/growthData';

export type MaterialCategory = {
  categoryKey: string;
  items: { key: string; amount: number }[];
};

export type FungibleSubPool = { keys: readonly string[]; xpPer: readonly number[] };

const TIERS = [1, 2, 3, 4] as const;
const toXpArr = (m: Record<number, number>) => TIERS.map((t) => m[t]);
// `Equipment_${baseId}`..`Equipment_${baseId + 3}` — Rusty through Titanium for one material series.
const seriesKeys = (baseId: number) => TIERS.map((t) => `Equipment_${baseId + t - 1}`);

// Each category may contain multiple independent sub-pools (different resources, same display group).
// Items within a sub-pool are interchangeable denominations of the same resource.
// uwGrowth has one sub-pool per unique-weapon material series (spring/hammer/barrel/firing pin) so each
// gets its own carry-up; this is XP at BASE rate (no weapon-type bonus) — see ~/utils/uwMaterialXp for
// bonus-aware coverage against a specific group's weapon-type demand.
export const FUNGIBLE_POOLS: Record<string, FungibleSubPool[]> = {
  xpReports: [{ keys: TIERS.map((t) => `Item_${reportItemIds[t]}`), xpPer: toXpArr(reportExp) }],
  equipEnh: [{ keys: TIERS.map((t) => `Equipment_${t}`), xpPer: [0, 1, 2, 3].map((i) => equipmentReinforcementExp[i as keyof typeof equipmentReinforcementExp]) }],
  uwGrowth: [
    { keys: seriesKeys(UW_MATERIAL_SERIES.spring.baseId), xpPer: toXpArr(weaponEnhancementExpBase) },
    { keys: seriesKeys(UW_MATERIAL_SERIES.hammer.baseId), xpPer: toXpArr(weaponEnhancementExpBase) },
    { keys: seriesKeys(UW_MATERIAL_SERIES.barrel.baseId), xpPer: toXpArr(weaponEnhancementExpBase) },
    // Firing pins always get the bonus, so their own denomination already includes it.
    { keys: seriesKeys(UW_FIRING_PIN_BASE_ID), xpPer: toXpArr(weaponEnhancementExp) },
  ],
};

export function computeSubPoolXp(subPool: FungibleSubPool, record: Record<string, number>): number {
  return subPool.keys.reduce((sum, key, i) => sum + (record[key] ?? 0) * subPool.xpPer[i], 0);
}

export type PoolNet = { breakdown: { key: string; amount: number }[]; sign: 1 | -1 };

// Nets a pool's owned XP against its required XP, then re-expresses the |difference| as the
// fewest highest-denomination items (via compactSubPool) — sign tells the caller whether that's
// a shortfall (-1) or a surplus (1). Returns null when owned exactly equals required.
export function compactPoolNet(subPool: FungibleSubPool, owned: Record<string, number>, needed: Record<string, number>): PoolNet | null {
  const netXp = computeSubPoolXp(subPool, owned) - computeSubPoolXp(subPool, needed);
  if (netXp === 0) return null;
  const sign: 1 | -1 = netXp > 0 ? 1 : -1;
  const breakdown = compactSubPool(subPool, [{ key: subPool.keys[0], amount: Math.abs(netXp) / subPool.xpPer[0] }]);
  return { breakdown, sign };
}

// The shortfall half of compactPoolNet, re-expressed as the fewest highest-denomination items
// still needed. Empty when the pool is fully covered (including exactly, or in surplus).
export function compactPoolDeficit(subPool: FungibleSubPool, owned: Record<string, number>, needed: Record<string, number>): { key: string; amount: number }[] {
  const net = compactPoolNet(subPool, owned, needed);
  return net && net.sign < 0 ? net.breakdown : [];
}

// Re-expresses a pool's raw owned inventory as the fewest highest-denomination items ("carry
// up" — same greedy allocation as compactSubPool/FinalResultsDisplay's carry-up toggle). Purely
// a display transform: the underlying raw per-tier inventory is untouched, so editing a specific
// item still edits its literal owned count.
export function compactPoolOwned(subPool: FungibleSubPool, owned: Record<string, number>): Record<string, number> {
  const compacted = compactSubPool(
    subPool,
    subPool.keys.map((key) => ({ key, amount: owned[key] ?? 0 })),
  );
  const result: Record<string, number> = {};
  for (const key of subPool.keys) result[key] = 0;
  for (const { key, amount } of compacted) result[key] = amount;
  return result;
}

// Greedy re-allocation (highest denomination first) so accumulated totals are "carried up".
// e.g. 4 SR reports (2000×4=8000 XP) → 0 SSR + 4 SR  →  but if 5 SR → 1 SSR.
export function compactSubPool(subPool: FungibleSubPool, needsItems: { key: string; amount: number }[]): { key: string; amount: number }[] {
  const keys = subPool.keys; // as readonly string[];
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
// Unique weapon growth material: spring/hammer/barrel/firing pin series, all four rarity tiers each.
export const UW_GROWTH_KEYS = new Set([
  ...seriesKeys(UW_MATERIAL_SERIES.spring.baseId),
  ...seriesKeys(UW_MATERIAL_SERIES.hammer.baseId),
  ...seriesKeys(UW_MATERIAL_SERIES.barrel.baseId),
  ...seriesKeys(UW_FIRING_PIN_BASE_ID),
]);
const POTENTIAL = new Set(['Item_2000', 'Item_2001', 'Item_2002']);

// Equipment_* keys that are growth materials, not gear blueprints — used by the blueprint farming
// planner (Equipment.tsx) to keep these out of its "what blueprint should I farm" list.
export const NON_BLUEPRINT_EQUIPMENT_KEYS = new Set([...EQUIP_ENH, ...UW_GROWTH_KEYS]);

const itemId = (key: string) => parseInt(key.split('_')[1] ?? '0', 10);

/** Returns true for items that should always appear in inventory input mode */
export function isInventoryMaterial(key: string): boolean {
  if (CREDITS.has(key) || ELIGMA.has(key) || XP_REPORTS.has(key) || EQUIP_ENH.has(key) || POTENTIAL.has(key)) return true;
  if (key === 'Item_9999') return true;
  if (key.startsWith('Item_')) {
    const id = itemId(key);
    return (id >= 100 && id <= 299) || (id >= 3000 && id <= 4999); // || (id >= 10000 && id <= 29999);
  }
  if (UW_GROWTH_KEYS.has(key)) return true;
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
    else if (UW_GROWTH_KEYS.has(key)) groups.uwGrowth.push({ key, amount });
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
