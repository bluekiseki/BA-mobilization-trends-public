import type { RaidInfo } from '~/types/data';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { difficultyInfo } from './Difficulty';

export const typecolor = {
  LightArmor: '#b62915',
  HeavyArmor: '#bc8800',
  Unarmed: '#206d9b',
  ElasticArmor: '#9a46a8',
  CompositeArmor: '#137973',
};

export const type_translation = {
  LightArmor: { en: 'Light Armor', ko: '경장갑', ja: '軽装備', zh_Hant: '輕型護甲' },
  HeavyArmor: { en: 'Heavy Armor', ko: '중장갑', ja: '重装甲', zh_Hant: '重型裝甲' },
  Unarmed: { en: 'Special Armor', ko: '특수장갑', ja: '特殊装甲', zh_Hant: '特殊裝甲' },
  ElasticArmor: { en: 'Elastic Armor', ko: '탄력장갑', ja: '弾力装甲', zh_Hant: '彈性裝甲' },
  CompositeArmor: { en: 'Composite Armor', ko: '복합장갑', ja: '複合装甲', zh_Hant: 'Composite' },
  Explosion: { en: 'Explosive', ko: '폭발', ja: '爆発', zh_Hant: '爆炸' },
  Pierce: { en: 'Piercing', ko: '관통', ja: '貫通', zh_Hant: '貫通' },
  Mystic: { en: 'Mystic', ko: '신비', ja: '神秘', zh_Hant: '神祕' },
  Sonic: { en: 'Sonic', ko: '진동', ja: '振動', zh_Hant: '振動' },
  Chemical: { en: 'Chemical', ko: '분해', ja: '分解', zh_Hant: '分解' },
};
export const type_translation_sorted = {
  LightArmor: { en: 'Light', ko: '경장', ja: '軽装', zh_Hant: '輕型' },
  HeavyArmor: { en: 'Heavy', ko: '중장', ja: '重装', zh_Hant: '重型' },
  Unarmed: { en: 'Special', ko: '특장', ja: '特殊', zh_Hant: '特殊' },
  ElasticArmor: { en: 'Elastic', ko: '탄력', ja: '弾力', zh_Hant: '彈性' },
  CompositeArmor: { en: 'Composite', ko: '복합', ja: '複合', zh_Hant: 'Composite' },
};

// Tab labels: full names, except English drops "Armor" to keep tabs short
export const type_translation_tab = {
  LightArmor: { ...type_translation.LightArmor, en: 'Light' },
  HeavyArmor: { ...type_translation.HeavyArmor, en: 'Heavy' },
  Unarmed: { ...type_translation.Unarmed, en: 'Special' },
  ElasticArmor: { ...type_translation.ElasticArmor, en: 'Elastic' },
  CompositeArmor: { ...type_translation.CompositeArmor, en: 'Composite' },
};

export function getMostDifficultLevel(raid: RaidInfo) {
  for (const { name } of difficultyInfo) {
    if (raid.Cnt[name]) return name;
  }
}

export function raidToString(raid: RaidInfo, locale: Locale, showDate: boolean = false, showId: boolean = false, color: boolean = false, onlyId: boolean = false): string {
  if (!raid) return 'unknown';
  const { Id, Boss, Type, Date: date, Alias } = raid;
  if (onlyId) {
    if (Type) return Id + ' ' + type_translation_sorted[Type][getLocaleShortName(locale)];
    else return Id;
  }
  const arr = [];
  if (showId) arr.push(Id);
  if (Alias) arr.push(Alias);
  else {
    arr.push(Boss);
  }
  if (!color && Type) arr.push(type_translation_sorted[Type][getLocaleShortName(locale)]);
  let txt = arr.join('-');
  if (showDate && date) txt += ` (${new Date(date).toLocaleDateString()})`;

  if (!color || !Type) return txt;

  return `<span style="fill: ${typecolor[Type]}; background-color: ${typecolor[Type]}; color: ${typecolor[Type]};">${txt}</span>`;
}

export function raidToStringTsx(raid: RaidInfo, locale: Locale, showDate: boolean = false, showId: boolean = false) {
  if (!raid) return 'unknown';
  const { Id, Boss, Type, Date: date, Alias } = raid;
  const arr = [];
  if (showId) arr.push(Id);
  if (Alias) arr.push(Alias);
  else {
    arr.push(Boss);
  }
  if (Type) arr.push(type_translation_sorted[Type][getLocaleShortName(locale)]);
  let txt = arr.join('-');
  if (showDate && date) txt += ` (${new Date(date).toLocaleDateString()})`;

  if (Type)
    return (
      <span className="text-neutral-200 p-0.5" style={{ backgroundColor: typecolor[Type] }}>
        {txt}
      </span>
    );
  else return txt;
}
