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
  LightArmor: {
    ko: '경장갑',
    en: 'LightArmor',
    ja: '軽装備',
    zh_Hant: '輕型護甲',
  },
  HeavyArmor: {
    ko: '중장갑',
    en: 'HeavyArmor',
    ja: '重装甲',
    zh_Hant: '重型裝甲',
  },
  Unarmed: {
    ko: '특수장갑',
    en: 'Unarmed',
    ja: '特殊装甲',
    zh_Hant: '特殊裝甲',
  },
  ElasticArmor: {
    ko: '탄력장갑',
    en: 'ElasticArmor',
    ja: '弾力装甲',
    zh_Hant: '彈性裝甲',
  },
  CompositeArmor: {
    ko: '복합장갑',
    en: 'Composite',
    ja: '複合装甲',
    zh_Hant: 'Composite',
  },
  Explosion: { ko: '폭발', en: 'Explosive', ja: '爆発', zh_Hant: '爆炸' },
  Pierce: { ko: '관통', en: 'Piercing', ja: '貫通', zh_Hant: '貫通' },
  Mystic: { ko: '신비', en: 'Mystic', ja: '神秘', zh_Hant: '神祕' },
  Sonic: { ko: '진동', en: 'Sonic', ja: '振動', zh_Hant: '振動' },
  Chemical: { ko: '분해', en: 'Chemical', ja: '分解', zh_Hant: '分解' },
};
export const type_translation_sorted = {
  LightArmor: { ko: '경장', en: 'Light', ja: '爆発', zh_Hant: '輕型' },
  HeavyArmor: { ko: '중장', en: 'Heavy', ja: '貫通', zh_Hant: '重型' },
  Unarmed: { ko: '특장', en: 'Unarmed', ja: '神秘', zh_Hant: '特殊' },
  ElasticArmor: { ko: '탄력', en: 'Elastic', ja: '振動', zh_Hant: '彈性' },
  CompositeArmor: { ko: '복합', en: 'Composite', ja: '複合', zh_Hant: 'Composite' },
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
      <span className="text-gray-200 p-0.5" style={{ backgroundColor: typecolor[Type] }}>
        {txt}
      </span>
    );
  else return txt;
}
