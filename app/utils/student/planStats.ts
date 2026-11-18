import { z } from 'zod';
import equipmentStats from '~/data/equipmentStats.json';
import type { GrowthPlan } from '~/types/growthPlan';
import { getCombatStylePlanGroupId } from '~/utils/combatStyle';
import { getFavorStatAt } from '~/utils/student/favorStats';
import { isUnrecruited } from '~/utils/student/recruitState';

// Follows SchaleDB's stat preview. Like the in-game student screen, it leaves out buffs from other students, support slots and the striker bonus,
// and skill buffs unless `includePassive` is set.
export const PLAN_STAT_KEYS = ['MaxHP', 'AttackPower', 'DefensePower', 'HealPower'] as const;
export type PlanStatKey = (typeof PLAN_STAT_KEYS)[number];
export type PlanStats = Record<PlanStatKey, number>;

// Star bonus per star, in 1/10000 (attack, hp, heal); defense does not grow with stars
const STAR_BONUS = { AttackPower: [0, 1000, 1200, 1400, 1700], MaxHP: [0, 500, 700, 900, 1400], HealPower: [0, 750, 1000, 1200, 1500] } as const;
// Character level at which each equipment slot unlocks
const SLOT_MIN_LEVEL = [0, 15, 35];
const POTENTIAL_MIN_LEVEL = 90;

// Per equipment category, the stats of tiers 1-10 as [stat, value at the tier's maximum level]
const effectSchema = z.object({ Stat: z.string().optional(), Value: z.array(z.array(z.number())).optional() });
const skillSchema = z.object({ Effects: z.array(effectSchema).default([]) });

const equipmentTable = z.record(z.string(), z.array(z.array(z.tuple([z.string(), z.number()])))).parse(equipmentStats);

const statStudentSchema = z.object({
  AttackPower1: z.number(),
  AttackPower100: z.number(),
  MaxHP1: z.number(),
  MaxHP100: z.number(),
  DefensePower1: z.number(),
  DefensePower100: z.number(),
  HealPower1: z.number(),
  HealPower100: z.number(),
  Equipment: z.array(z.string()),
  FavorStatType: z.array(z.string()),
  FavorStatValue: z.array(z.array(z.number())),
  // Other outfits of the same character; each one's bond rank adds its own bonus
  FavorAlts: z.array(z.number()).default([]),
  Weapon: z
    .object({
      AttackPower1: z.number(),
      AttackPower100: z.number(),
      MaxHP1: z.number(),
      MaxHP100: z.number(),
      HealPower1: z.number(),
      HealPower100: z.number(),
      StatLevelUpType: z.string().optional(),
    })
    .nullish(),
  Skills: z.object({ Passive: skillSchema.optional(), WeaponPassive: skillSchema.optional() }).optional(),
  Gear: z.object({ StatType: z.array(z.string()).optional(), StatValue: z.array(z.array(z.number())).optional() }).nullish(),
});
export type StatStudent = z.infer<typeof statStudentSchema>;

/** The catalog entry as far as stats are concerned; null when the entry lacks the fields (older or partial data). */
export function parseStatStudent(raw: unknown): StatStudent | null {
  const parsed = statStudentSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

type StatBlock = Pick<GrowthPlan['current'], 'level' | 'star' | 'uw' | 'uwLevel' | 'passive' | 'affection' | 'equipment' | 'gear' | 'potential'>;

const levelScale = (level: number, standard: boolean) => (standard ? Number(((level - 1) / 99).toFixed(4)) : (level - 1) / 99);

function interpolate(stat1: number, stat100: number, level: number, multiplier = 1) {
  const scale = levelScale(level, true);
  return Math.ceil(Number((Math.round(Number((stat1 + (stat100 - stat1) * scale).toFixed(4))) * multiplier).toFixed(4)));
}

const starMultiplier = (bonus: readonly number[], star: number) => 1 + bonus.slice(0, star).reduce((sum, value) => sum + value, 0) / 10000;

/** The bond bonus of another outfit of the character, at the rank the reader has reached with that outfit. */
export interface AltBond {
  student: Pick<StatStudent, 'FavorStatType' | 'FavorStatValue'>;
  rank: number;
}

export interface PlanStatOptions {
  /** Adds the passive skill's stat buff (and the weapon passive from the second unique weapon star), which the in-game screen does not show. */
  includePassive?: boolean;
}

export function computePlanStats(student: StatStudent, block: StatBlock, altBonds: readonly AltBond[] = [], options: PlanStatOptions = {}): PlanStats {
  const level = block.level;
  // [base, flat bonus, coefficient]
  const parts: Record<PlanStatKey, [number, number, number]> = {
    MaxHP: [interpolate(student.MaxHP1, student.MaxHP100, level, starMultiplier(STAR_BONUS.MaxHP, block.star)), 0, 1],
    AttackPower: [interpolate(student.AttackPower1, student.AttackPower100, level, starMultiplier(STAR_BONUS.AttackPower, block.star)), 0, 1],
    DefensePower: [interpolate(student.DefensePower1, student.DefensePower100, level), 0, 1],
    HealPower: [interpolate(student.HealPower1, student.HealPower100, level, starMultiplier(STAR_BONUS.HealPower, block.star)), 0, 1],
  };
  const isKey = (name: string): name is PlanStatKey => PLAN_STAT_KEYS.some((key) => key === name);
  // "X_Base" and a bare "X" add a flat amount, "X_Coefficient" a percentage in 1/10000; other stats are not shown
  const addBuff = (stat: string, amount: number) => {
    const [name = '', kind] = stat.split('_');
    if (!isKey(name)) return;
    if (kind === 'Coefficient') parts[name][2] += amount / 10000;
    else parts[name][1] += amount;
  };

  // Equipment is taken at its tier's maximum level; the plan does not track equipment levels
  for (const [slot, category] of student.Equipment.entries()) {
    const tier = block.equipment[slot] ?? 0;
    if (tier < 1 || level < (SLOT_MIN_LEVEL[slot] ?? 0)) continue;
    for (const [stat, value] of equipmentTable[category]?.[tier - 1] ?? []) addBuff(stat, value);
  }

  if (block.gear >= 1 && student.Gear?.StatType) {
    student.Gear.StatType.forEach((stat, index) => addBuff(stat, student.Gear?.StatValue?.[index]?.[1] ?? 0));
  }

  if (level >= POTENTIAL_MIN_LEVEL) {
    const potential: [PlanStatKey, number][] = [
      ['MaxHP', block.potential.hp],
      ['AttackPower', block.potential.atk],
      ['HealPower', block.potential.heal],
    ];
    for (const [stat, potentialLevel] of potential) {
      addBuff(`${stat}_Base`, Math.round(interpolate(student[`${stat}1`], student[`${stat}100`], level) * (potentialLevel * 0.002)));
    }
  }

  const bond = getFavorStatAt(student.FavorStatValue, block.affection);
  student.FavorStatType.forEach((stat, index) => addBuff(stat, bond[index] ?? 0));
  for (const alt of altBonds) {
    const altBond = getFavorStatAt(alt.student.FavorStatValue, alt.rank);
    alt.student.FavorStatType.forEach((stat, index) => addBuff(stat, altBond[index] ?? 0));
  }

  if (options.includePassive) {
    const addPassive = (skill: z.infer<typeof skillSchema> | undefined) => {
      for (const effect of skill?.Effects ?? []) addBuff(effect.Stat ?? '', effect.Value?.[0]?.[block.passive - 1] ?? 0);
    };
    addPassive(student.Skills?.Passive);
    if (block.uw >= 2) addPassive(student.Skills?.WeaponPassive);
  }

  if (block.star === 5 && block.uw > 0 && student.Weapon) {
    const weapon = student.Weapon;
    const scale = levelScale(block.uwLevel, weapon.StatLevelUpType === undefined || weapon.StatLevelUpType === 'Standard');
    const at = (stat1: number, stat100: number) => Math.round(stat1 + (stat100 - stat1) * scale);
    addBuff('AttackPower_Base', at(weapon.AttackPower1, weapon.AttackPower100));
    addBuff('MaxHP_Base', at(weapon.MaxHP1, weapon.MaxHP100));
    addBuff('HealPower_Base', at(weapon.HealPower1, weapon.HealPower100));
  }

  const total = ([base, flat, coefficient]: [number, number, number]) => Math.max(Math.round(Number(((base + flat) * Math.max(coefficient, 0.2)).toFixed(4))), 0);
  return { MaxHP: total(parts.MaxHP), AttackPower: total(parts.AttackPower), DefensePower: total(parts.DefensePower), HealPower: total(parts.HealPower) };
}

/**
 * The stats of a plan at its current or target values, with the bond bonus of the character's other outfits taken from the plans kept for them.
 * Null when the catalog entry lacks stat data, or for the current side of a plan whose student is not recruited yet.
 */
export function resolvePlanStats(plan: GrowthPlan, side: 'current' | 'target', catalog: Record<string, unknown>, plans: readonly GrowthPlan[], options?: PlanStatOptions): PlanStats | null {
  if (plan.studentId === null || (side === 'current' && isUnrecruited(plan))) return null;
  const student = parseStatStudent(catalog[String(getCombatStylePlanGroupId(plan.studentId))]);
  if (!student) return null;
  const altBonds = student.FavorAlts.flatMap((altId): AltBond[] => {
    const altStudent = parseStatStudent(catalog[String(altId)]);
    const altPlan = plans.find((candidate) => candidate.studentId !== null && getCombatStylePlanGroupId(candidate.studentId) === getCombatStylePlanGroupId(altId));
    // An unrecruited outfit has no bond yet, but its goal still counts toward the target
    return altStudent && altPlan && (side === 'target' || !isUnrecruited(altPlan)) ? [{ student: altStudent, rank: altPlan[side].affection }] : [];
  });
  return computePlanStats(student, plan[side], altBonds, options);
}
