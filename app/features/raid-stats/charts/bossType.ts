import type { RaidArmorType, RaidInfo } from '~/types/data';
import type { CheckboxSelectOption } from '~/components/common/CheckboxSelect';
import { type_translation, typecolor } from '~/components/raid/raidToString';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';

export type BossType = RaidArmorType;
export type BossTypeSelect = BossType | 'All';

// Armor types a boss can have (CompositeArmor is not used by any raid yet)
export const BOSS_TYPES: BossType[] = ['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor'];

/** Total Assault seasons carry every armor type in ArmorTypes; Grand Assault entries only have a single Type. */
export function getRaidArmorTypes(raid: RaidInfo): BossType[] {
  return raid.ArmorTypes ?? (raid.Type ? [raid.Type] : []);
}

/** Raids without a known armor type only match the 'All' selection. */
export function matchesBossType(raid: RaidInfo, selected: Set<BossTypeSelect>): boolean {
  return selected.has('All') || getRaidArmorTypes(raid).some((type) => selected.has(type));
}

export function getBossTypeOptions(locale: Locale): CheckboxSelectOption<BossTypeSelect>[] {
  return BOSS_TYPES.map((type) => ({ value: type, label: type_translation[type][getLocaleShortName(locale)], color: typecolor[type] }));
}
