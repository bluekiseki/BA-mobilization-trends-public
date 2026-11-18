import type { Skill, Skills } from '~/types/plannerData';

export const SKILL_TYPES = ['ex', 'normal', 'passive', 'sub'] as const;
export type SkillTypeKey = (typeof SKILL_TYPES)[number];

/** Damage range: area (any Radius shape) or single target. */
export const SKILL_TARGETS = ['aoe', 'single'] as const;
export type SkillTargetKey = (typeof SKILL_TARGETS)[number];

export const EFFECT_CATEGORIES = ['heal', 'buff', 'debuff', 'cc', 'other'] as const;
export type EffectCategory = (typeof EFFECT_CATEGORIES)[number];
/** "<category>:<sub>", e.g. "buff:ATK" or "cc:Stunned". */
export type SkillEffectKey = `${EffectCategory}:${string}`;

/**
 * `categories` is a coarse "has any effect of this kind" pick; `subs` narrows a picked category
 * down to specific effects (a category with no sub picked matches all of its effects).
 */
export interface SkillFilterState {
  types: Set<SkillTypeKey>;
  targets: Set<SkillTargetKey>;
  categories: Set<EffectCategory>;
  subs: Set<SkillEffectKey>;
}

export function createSkillFilter(): SkillFilterState {
  return { types: new Set(), targets: new Set(), categories: new Set(), subs: new Set() };
}

export function isSkillFilterActive(filter: SkillFilterState): boolean {
  return filter.types.size > 0 || filter.targets.size > 0 || filter.categories.size > 0;
}

/** Number of filter groups with a selection, for the "active filters" badge. */
export function countActiveSkillFilterGroups(filter: SkillFilterState): number {
  return Number(filter.types.size > 0) + Number(filter.targets.size > 0) + Number(filter.categories.size > 0);
}

/** Replaces the picked categories and drops sub picks that belong to a category no longer picked. */
export function withSkillCategories(filter: SkillFilterState, categories: Set<EffectCategory>): SkillFilterState {
  const subs = new Set([...filter.subs].filter((key) => categories.has(categoryOf(key))));
  return { ...filter, categories, subs };
}

function categoryOf(key: SkillEffectKey): EffectCategory {
  return key.slice(0, key.indexOf(':')) as EffectCategory;
}

// In-game "normal" is the Public skill and "sub" is ExtraPassive. The weapon / gear variants
// replace the Passive / Public skill once unlocked, so they count as that skill type.
const SKILL_SOURCES: Record<SkillTypeKey, readonly (keyof Skills)[]> = {
  ex: ['Ex'],
  normal: ['Public', 'GearPublic'],
  passive: ['Passive', 'WeaponPassive'],
  sub: ['ExtraPassive'],
};

export interface SkillEffectOption {
  key: SkillEffectKey;
  /** i18next key including its namespace, e.g. "stat:Buff_ATK". */
  labelKey: string;
  /** Buff icon sheet id; "stat:" labels use their own name, other options set it when the sheet has a matching icon. */
  iconId?: string;
}

export function getEffectIconId(option: SkillEffectOption): string | undefined {
  return option.iconId ?? (option.labelKey.startsWith('stat:') ? option.labelKey.slice('stat:'.length) : undefined);
}

// SchaleDB stat prefix (the part before "_Base"/"_Coefficient") -> suffix of the shared
// "Buff_*" / "Debuff_*" names in the stat locale table.
const STAT_NAME: Record<string, string> = {
  AttackPower: 'ATK',
  DefensePower: 'DEF',
  MaxHP: 'MAXHP',
  HealPower: 'HealPower',
  CriticalPoint: 'CriticalChance',
  CriticalDamageRate: 'CriticalDamage',
  AttackSpeed: 'AttackSpeed',
  DodgePoint: 'Dodge',
  AccuracyPoint: 'HIT',
  CriticalDamageResistRate: 'CriticalDamageRateResist',
  CriticalChanceResistPoint: 'CriticalChanceResistPoint',
  HealEffectivenessRate: 'HealEffectiveness',
  ExtendBuffDuration: 'ExtendBuffDuration',
  ExtendDebuffDuration: 'ExtendDebuffDuration',
  EnhanceExplosionRate: 'EnhanceExplosionRate',
  EnhancePierceRate: 'EnhancePierceRate',
  EnhanceMysticRate: 'EnhanceMysticRate',
  EnhanceSonicRate: 'EnhanceSonicRate',
  EnhanceExDamageRate: 'EnhanceExDamageRate',
  RegenCost: 'CostRegen',
  Range: 'Range',
  DefensePenetration: 'Penetration',
  DamagedRatio2: 'DamagedRatio',
  DamageRatio2: 'DamageRatio',
  OppressionPower: 'OppressionPower',
  OppressionResist: 'OppressionResist',
  MoveSpeed: 'MoveSpeed',
  StabilityPoint: 'Stability',
  ReduceWeakDamagedRate: 'ReduceWeakDamagedRate',
  EnhanceBasicsDamageRate: 'EnhanceBasicsDamageRate',
};
// Listed in display order (most commonly searched first).
const STAT_ORDER = [
  'ATK',
  'DEF',
  'MAXHP',
  'CriticalChance',
  'CriticalDamage',
  'AttackSpeed',
  'HealPower',
  'Dodge',
  'HIT',
  'CriticalDamageRateResist',
  'CriticalChanceResistPoint',
  'HealEffectiveness',
  'ExtendBuffDuration',
  'ExtendDebuffDuration',
  'EnhanceExplosionRate',
  'EnhancePierceRate',
  'EnhanceMysticRate',
  'EnhanceSonicRate',
  'EnhanceExDamageRate',
  'EnhanceBasicsDamageRate',
  'CostRegen',
  'Range',
  'Penetration',
  'DamageRatio',
  'DamagedRatio',
  'ReduceWeakDamagedRate',
  'OppressionPower',
  'OppressionResist',
  'MoveSpeed',
  'Stability',
] as const;
const CC_ICONS = ['Stunned', 'Fear', 'Provoke', 'Confusion'] as const;
const DOT_ICONS = ['Burn', 'Poison', 'Chill', 'ElectricShock', 'DamageByHit_Damaged', 'Cheerleading'] as const;
const planner = (name: string) => `planner:skillFilter.effect.${name}`;

// Stats no student currently applies to enemies are left out so the debuff list has no dead options.
const DEBUFF_STATS: readonly (typeof STAT_ORDER)[number][] = [
  'ATK',
  'DEF',
  'CriticalChance',
  'CriticalDamage',
  'AttackSpeed',
  'Dodge',
  'HIT',
  'CriticalDamageRateResist',
  'CriticalChanceResistPoint',
  'HealEffectiveness',
  'ReduceWeakDamagedRate',
  'OppressionResist',
  'MoveSpeed',
];

// Non-stat effects whose icon is a "Buff_*" sprite are buffs in game, so they sit in the buff category.
const BUFF_EFFECT_OPTIONS: readonly SkillEffectOption[] = [
  { key: 'buff:regen', labelKey: planner('regen'), iconId: 'Buff_DotHeal' },
  { key: 'buff:shield', labelKey: planner('shield'), iconId: 'Buff_Shield' },
  { key: 'buff:costChange', labelKey: planner('costChange'), iconId: 'Buff_CostChange' },
  { key: 'buff:concentratedTarget', labelKey: 'stat:Buff_ConcentratedTarget' },
];

function statOptions(category: 'buff' | 'debuff'): SkillEffectOption[] {
  const prefix = category === 'buff' ? 'Buff' : 'Debuff';
  const names = category === 'buff' ? STAT_ORDER.filter((name) => name !== 'ReduceWeakDamagedRate') : DEBUFF_STATS;
  const extras = category === 'buff' ? BUFF_EFFECT_OPTIONS : [];
  return [...names.map((name) => ({ key: `${category}:${name}` as const, labelKey: `stat:${prefix}_${name}` })), ...extras, { key: `${category}:etc` as const, labelKey: planner('etc') }];
}

export const SKILL_EFFECT_OPTIONS: Record<EffectCategory, readonly SkillEffectOption[]> = {
  heal: [{ key: 'heal:heal', labelKey: planner('heal') }],
  buff: statOptions('buff'),
  debuff: [...statOptions('debuff'), ...DOT_ICONS.map((icon) => ({ key: `debuff:dot_${icon}` as const, labelKey: `stat:Debuff_${icon}` }))],
  cc: [...CC_ICONS.map((icon) => ({ key: `cc:${icon}` as const, labelKey: `stat:CC_${icon}` })), { key: 'cc:knockback', labelKey: planner('knockback') }],
  other: [
    { key: 'other:summon', labelKey: planner('summon') },
    { key: 'other:dispel', labelKey: planner('dispel') },
    { key: 'other:special', labelKey: planner('special') },
  ],
};

function includesValue<T extends string>(list: readonly T[], value: string | undefined): value is T {
  return value !== undefined && (list as readonly string[]).includes(value);
}

function targetsEnemy(target: string | string[] | undefined): boolean {
  return Array.isArray(target) ? target.includes('Enemy') : target === 'Enemy';
}

function classifyEffect(effect: Skill['Effects'][number]): SkillEffectKey | null {
  switch (effect.Type) {
    case 'Heal':
      return 'heal:heal';
    case 'Regen':
      return 'buff:regen';
    case 'Shield':
      return 'buff:shield';
    case 'Buff': {
      const category = targetsEnemy(effect.Target) ? 'debuff' : 'buff';
      const name = STAT_NAME[effect.Stat?.split('_')[0] ?? ''];
      return `${category}:${includesValue(STAT_ORDER, name) ? name : 'etc'}`;
    }
    case 'DamageDebuff':
      return `debuff:${includesValue(DOT_ICONS, effect.Icon) ? `dot_${effect.Icon}` : 'etc'}`;
    case 'CrowdControl':
      return `cc:${includesValue(CC_ICONS, effect.Icon) ? effect.Icon : 'etc'}`;
    case 'Knockback':
      return 'cc:knockback';
    case 'Summon':
      return 'other:summon';
    case 'Dispel':
      return 'other:dispel';
    case 'CostChange':
      return 'buff:costChange';
    case 'ConcentratedTarget':
      return 'buff:concentratedTarget';
    case 'Special':
    case 'Accumulation':
      return 'other:special';
    default:
      return null;
  }
}

export interface SkillTraits {
  /** Null when the skill deals no direct damage, so it has no damage range. */
  target: SkillTargetKey | null;
  effects: ReadonlySet<SkillEffectKey>;
}

const traitsCache = new WeakMap<Skill, SkillTraits>();

/** Damaging skills are "aoe" with any Radius shape, otherwise "single"; skills without direct damage have no range. */
export function getSkillTraits(skill: Skill): SkillTraits {
  const cached = traitsCache.get(skill);
  if (cached) return cached;
  const effects = new Set<SkillEffectKey>();
  let deals = false;
  for (const effect of skill.Effects ?? []) {
    const key = classifyEffect(effect);
    if (key) effects.add(key);
    if (effect.Type === 'Damage') deals = true;
  }
  const target: SkillTargetKey | null = !deals ? null : (skill.Radius?.length ?? 0) > 0 ? 'aoe' : 'single';
  const traits = { target, effects };
  traitsCache.set(skill, traits);
  return traits;
}

export interface SkillOptionCounts {
  types: Record<string, number>;
  targets: Record<string, number>;
  categories: Record<string, number>;
  subs: Record<string, number>;
}

export function createSkillOptionCounts(): SkillOptionCounts {
  return { types: {}, targets: {}, categories: {}, subs: {} };
}

/**
 * Adds one student to the per-option counts: an option counts the student when they would match
 * with that group's own picks replaced by just that option (the other groups stay as selected).
 * `skillSets` holds one entry per combat style, since a student counts if any of their styles matches.
 */
export function addSkillOptionCounts(counts: SkillOptionCounts, skillSets: readonly (Skills | undefined)[], filter: SkillFilterState): void {
  const bump = (bucket: Record<string, number>, key: string, candidate: SkillFilterState) => {
    if (skillSets.some((skills) => matchesSkillFilter(skills, candidate))) bucket[key] = (bucket[key] ?? 0) + 1;
  };
  for (const type of SKILL_TYPES) bump(counts.types, type, { ...filter, types: new Set([type]) });
  for (const target of SKILL_TARGETS) bump(counts.targets, target, { ...filter, targets: new Set([target]) });
  for (const category of EFFECT_CATEGORIES) {
    bump(counts.categories, category, { ...filter, categories: new Set([category]), subs: new Set() });
    if (!filter.categories.has(category)) continue;
    for (const { key } of SKILL_EFFECT_OPTIONS[category]) bump(counts.subs, key, { ...filter, categories: new Set([category]), subs: new Set([key]) });
  }
}

function matchesEffects(effects: ReadonlySet<SkillEffectKey>, filter: SkillFilterState): boolean {
  if (filter.categories.size === 0) return true;
  const present = [...effects];
  for (const category of filter.categories) {
    const picked = [...filter.subs].filter((key) => categoryOf(key) === category);
    const hit = picked.length === 0 ? present.some((key) => categoryOf(key) === category) : picked.some((key) => effects.has(key));
    if (hit) return true;
  }
  return false;
}

/**
 * True when a single skill satisfies every non-empty group (types, targets and effects are ANDed;
 * the picks inside each group are ORed), so "EX + area + debuff" means one EX skill that is both.
 * With no skill type picked, a damage-range pick is judged on the EX skill only, since that is the
 * skill a student's range is known by (e.g. a single-target basic skill must not make an area EX "single").
 */
export function matchesSkillFilter(skills: Skills | undefined, filter: SkillFilterState): boolean {
  if (!isSkillFilterActive(filter)) return true;
  if (!skills) return false;
  for (const type of SKILL_TYPES) {
    if (filter.types.size > 0 && !filter.types.has(type)) continue;
    if (filter.types.size === 0 && filter.targets.size > 0 && type !== 'ex') continue;
    for (const source of SKILL_SOURCES[type]) {
      const skill = skills[source];
      if (!skill) continue;
      const traits = getSkillTraits(skill);
      if (filter.targets.size > 0 && (!traits.target || !filter.targets.has(traits.target))) continue;
      if (matchesEffects(traits.effects, filter)) return true;
    }
  }
  return false;
}
