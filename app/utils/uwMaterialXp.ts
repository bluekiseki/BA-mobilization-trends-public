// Unique weapon material XP accounting. A material gives its base EXP, or base * 1.5 when its series matches the target
// weapon's type; firing pins match every type. Used by the inventory goal-comparison row: totals only (owned vs. required XP),
// not which items to farm. Firing pins and a series' leftover XP form one shared pool, and the totals do not depend on how it is split.
import { calcUwRequiredXp, UW_BONUS_MULTIPLIER, UW_FIRING_PIN_BASE_ID, UW_MATERIAL_SERIES, weaponEnhancementExpBase } from '~/data/growthData';
import type { GrowthPlan } from '~/types/growthPlan';
import type { Student, StudentData } from '~/types/plannerData';

export type UwGroup = keyof typeof UW_MATERIAL_SERIES;

const WEAPON_TYPE_TO_GROUP: Record<Student['WeaponType'], UwGroup> = {
  SG: 'spring',
  SMG: 'spring',
  HG: 'spring',
  FT: 'spring',
  AR: 'hammer',
  GL: 'hammer',
  RL: 'hammer',
  MG: 'barrel',
  SR: 'barrel',
  RG: 'barrel',
  MT: 'barrel',
};

/** Which material series grants the weapon-type bonus for a given WeaponType. */
export function seriesForWeaponType(weaponType: Student['WeaponType']): UwGroup {
  return WEAPON_TYPE_TO_GROUP[weaponType];
}

const TIERS = [1, 2, 3, 4] as const;

/** `Equipment_${id}` key for a material series' tier (1 = Rusty … 4 = Titanium). */
function seriesItemKey(baseId: number, tier: number): string {
  return `Equipment_${baseId + tier - 1}`;
}

/** A series' inventory as base-rate XP (no bonus). */
function seriesBaseXp(inventory: Record<string, number>, baseId: number): number {
  let xp = 0;
  for (const tier of TIERS) xp += (inventory[seriesItemKey(baseId, tier)] ?? 0) * weaponEnhancementExpBase[tier];
  return xp;
}

const UW_GROUPS = Object.keys(UW_MATERIAL_SERIES) as UwGroup[];

export type UwXpResult = {
  /** Total XP demand of the selected group. */
  required: number;
  /** XP covered by each series' own materials plus the shared pool. */
  effectiveOwned: number;
  /** Unmet demand: max(0, required - effectiveOwned). */
  deficit: number;
};

/** How far the inventory covers a group's unique-weapon XP demand, with the 1.5x bonus where a series matches. */
export function calcUwMaterialXp(inventory: Record<string, number>, demandByWeaponType: Partial<Record<Student['WeaponType'], number>>): UwXpResult {
  const demandByGroup: Record<UwGroup, number> = { spring: 0, hammer: 0, barrel: 0 };
  for (const [weaponType, xp] of Object.entries(demandByWeaponType) as [Student['WeaponType'], number | undefined][]) {
    if (!xp) continue;
    demandByGroup[seriesForWeaponType(weaponType)] += xp;
  }
  const required = demandByGroup.spring + demandByGroup.hammer + demandByGroup.barrel;

  let totalOwnDeficit = 0;
  // Firing pins have no demand of their own, so they start in the shared pool.
  let universalPoolXp = seriesBaseXp(inventory, UW_FIRING_PIN_BASE_ID) * UW_BONUS_MULTIPLIER;

  for (const group of UW_GROUPS) {
    const bonusXp = seriesBaseXp(inventory, UW_MATERIAL_SERIES[group].baseId) * UW_BONUS_MULTIPLIER;
    const used = Math.min(bonusXp, demandByGroup[group]);
    totalOwnDeficit += demandByGroup[group] - used;
    universalPoolXp += (bonusXp - used) / UW_BONUS_MULTIPLIER; // leftover goes to the shared pool at base rate
  }

  const deficit = Math.max(0, totalOwnDeficit - universalPoolXp);
  const effectiveOwned = required - deficit;

  return { required, effectiveOwned, deficit };
}

/** Unique-weapon XP demand of the growth plans by weapon type, for calcUwMaterialXp. Plans without a known student are skipped. */
export function buildUwDemandFromPlans(plans: GrowthPlan[], students: StudentData): Partial<Record<Student['WeaponType'], number>> {
  const demand: Partial<Record<Student['WeaponType'], number>> = {};
  for (const plan of plans) {
    if (plan.studentId == null) continue;
    const student = students[plan.studentId];
    if (!student) continue;
    const xp = calcUwRequiredXp(plan.current.uwLevel, plan.target.uwLevel);
    if (xp <= 0) continue;
    demand[student.WeaponType] = (demand[student.WeaponType] ?? 0) + xp;
  }
  return demand;
}
