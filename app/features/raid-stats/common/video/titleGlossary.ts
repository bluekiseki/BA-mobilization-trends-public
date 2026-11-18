import type { LocaleShortName } from '~/utils/i18n/config';
import bossData from '~/data/bossdata.json';
import { type_translation } from '~/components/raid/raidToString';
import { attack_type_translation, raid_translation, terrain_translation } from '../YouTubeSearchGenerator';

export type TermLocale = LocaleShortName;

/**
 * A language-neutral concept. Any surface form in any locale (label or alias)
 * is rendered as `label[currentLocale]`.
 */
export interface GlossaryConcept {
  /** Display form per locale (the output). */
  label: Record<TermLocale, string>;
  /** Extra surface forms seen in titles, per locale (abbreviations, slang, variants). */
  aliases?: Partial<Record<TermLocale, string[]>>;
}

const difficulty = (name: string, aliases: GlossaryConcept['aliases']): GlossaryConcept => ({ label: { en: name, ko: name, ja: name, zh_Hant: name }, aliases });
const armor = (key: keyof typeof type_translation, en: string): Record<TermLocale, string> => ({ ...type_translation[key], en });

/**
 * Frequent non-student terms in raid video titles and descriptions.
 * Title terms were counted across public/video/raid-jp-*.json (R85-R93, E29-E38, 2026-10),
 * and description terms across the 165 populated descriptions in E38.
 * Boss names come from bossdata.json; only aliases are listed here.
 * Unverified community slang is excluded.
 */
export const TITLE_GLOSSARY: Record<string, GlossaryConcept> = {
  // Game title
  blueArchive: {
    label: { en: 'Blue Archive', ko: '블루 아카이브', ja: 'ブルーアーカイブ', zh_Hant: '蔚藍檔案' },
    aliases: { en: ['BlueArchive'], ko: ['블루아카이브', '블루아카'], ja: ['ブルアカ'] },
  },

  // Content modes
  totalAssault: { label: raid_translation.raid, aliases: { en: ['T. Assault'] } },
  grandAssault: { label: raid_translation.eraid },
  mockTotalAssault: { label: { en: 'Mock Total Assault', ko: '모의 총력전', ja: '模擬総力戦', zh_Hant: '模擬總力戰' } },
  jointFiringDrill: { label: { en: 'Joint Firing Drill', ko: '종합전술시험', ja: '合同火力演習', zh_Hant: '綜合戰術考試' } },
  finalRestrictionRelease: { label: { en: 'Final Restriction Release', ko: '제약해제결전', ja: '制約解除決戦', zh_Hant: '制約解除決戰' } },

  // Terrain
  street: { label: terrain_translation.Street, aliases: { en: ['Urban'], ko: ['시가지전'], ja: ['市街地戦'], zh_Hant: ['城鎮', '城市'] } },
  outdoor: { label: terrain_translation.Outdoor, aliases: { en: ['Outdoors'], ko: ['야외전', '야전'], ja: ['屋外戦'] } },
  indoor: { label: terrain_translation.Indoor, aliases: { en: ['Indoors'], ko: ['실내전'], ja: ['屋内戦'] } },

  // Armor types
  lightArmor: { label: armor('LightArmor', 'Light Armor'), aliases: { ja: ['軽装'], zh_Hant: ['輕甲'] } },
  heavyArmor: { label: armor('HeavyArmor', 'Heavy Armor'), aliases: { ja: ['重装'], zh_Hant: ['重甲'] } },
  specialArmor: { label: armor('Unarmed', 'Special Armor') },
  elasticArmor: { label: armor('ElasticArmor', 'Elastic Armor') },
  compositeArmor: { label: armor('CompositeArmor', 'Composite Armor') },

  // Attack types
  explosive: { label: attack_type_translation.LightArmor },
  piercing: { label: attack_type_translation.HeavyArmor },
  mystic: { label: attack_type_translation.Unarmed },
  sonic: { label: attack_type_translation.ElasticArmor },
  chemical: { label: attack_type_translation.CompositeArmor },

  // Difficulties: titles write these in English in every language, so the label stays English.
  normal: difficulty('Normal', { ko: ['노멀'], ja: ['ノーマル'] }),
  hard: difficulty('Hard', { ko: ['하드'], ja: ['ハード'] }),
  veryhard: difficulty('Veryhard', { en: ['Very Hard'], ko: ['베리하드'], ja: ['ベリーハード'] }),
  hardcore: difficulty('Hardcore', { en: ['HC'], ko: ['하드코어'], ja: ['ハードコア'] }),
  extreme: difficulty('Extreme', { ko: ['익스트림'], ja: ['エクストリーム'] }),
  insane: difficulty('Insane', { en: ['INS'], ko: ['인세인'], ja: ['インセイン'] }),
  torment: difficulty('Torment', { en: ['TMT'], ko: ['토먼트'], ja: ['トーメント'] }),
  lunatic: difficulty('Lunatic', { ko: ['루나틱'], ja: ['ルナティック'] }),

  // Boss aliases (labels come from bossdata.json)
  drumbarka: { label: bossData.EN0022.name, aliases: { ko: ['드럼바르카'], ja: ['缶ガニ', '缶カニ', 'ドラム缶'], zh_Hant: ['油桶蟹', '鐵桶蟹'] } },
  shiroKuro: { label: bossData.ShiroKuro.name, aliases: { en: ['Shirokuro'], ja: ['シロクロ'], zh_Hant: ['黑白'] } },
  kaitenger: { label: bossData.Kaitenger.name, aliases: { en: ['Kaitenger'], ja: ['カイテンジャー'] } },
  hieronymus: { label: bossData.Hieronymus.name, aliases: { ja: ['ヒエロ'] } },
  perorozilla: { label: bossData.Perorozilla.name, aliases: { en: ['Perorodzilla'] } },

  // Play / guide terms
  attempt: { label: { en: 'Team', ko: '파티', ja: '凸', zh_Hant: '刀' } },
  composition: { label: { en: 'Comp', ko: '편성', ja: '編成', zh_Hant: '編成' } },
  uniqueWeapon: { label: { en: 'UE', ko: '고유', ja: '固有', zh_Hant: '專武' } },
  // Rental terms in titles refer to borrowing an assist student.
  assist: { label: { en: 'Assist', ko: '조력자', ja: '助っ人', zh_Hant: '助戰' }, aliases: { en: ['Borrow'], ja: ['レンタル'] } },
  subtitledGuide: { label: { en: 'Subtitled guide', ko: '자막 해설', ja: '字幕解説', zh_Hant: '字幕解說' } },
  quickGuide: { label: { en: 'Quick guide', ko: '간단 해설', ja: '簡易解説', zh_Hant: '簡易解說' } },
  guide: { label: { en: 'Guide', ko: '해설', ja: '解説', zh_Hant: '解說' } },
  strategy: { label: { en: 'Strategy', ko: '공략', ja: '攻略', zh_Hant: '攻略' } },
  forRecords: { label: { en: 'For records', ko: '기록용', ja: '記録用', zh_Hant: '紀錄用' } },
  fullAuto: { label: { en: 'Full Auto', ko: '풀오토', ja: 'フルオート', zh_Hant: '全自動' } },
  auto: { label: { en: 'Auto', ko: '오토', ja: 'オート', zh_Hant: '自動' } },
  unedited: { label: { en: 'Unedited', ko: '무편집', ja: '無編集', zh_Hant: '無剪輯' } },
  forBeginners: { label: { en: 'For beginners', ko: '초보자용', ja: '初心者向け', zh_Hant: '新手向' }, aliases: { ja: ['初心者向'] } },
  description: { label: { en: 'Description', ko: '설명란', ja: '概要欄', zh_Hant: '說明欄' } },
  firstHalf: { label: { en: 'First half', ko: '전반', ja: '前半', zh_Hant: '前半' } },
  secondHalf: { label: { en: 'Second half', ko: '후반', ja: '後半', zh_Hant: '後半' } },
  firstDay: { label: { en: 'Day 1', ko: '첫날', ja: '初日', zh_Hant: '首日' } },
  lastDay: { label: { en: 'Last day', ko: '마지막 날', ja: '最終日', zh_Hant: '最終日' } },
  score: { label: { en: 'Score', ko: '점수', ja: 'スコア', zh_Hant: '分數' } },
  // EX skill cost labels follow the site's buff names.
  exCost: { label: { en: 'Cost', ko: '코스트', ja: 'コスト', zh_Hant: 'COST' } },
  clear: { label: { en: 'Clear', ko: '클리어', ja: 'クリア', zh_Hant: '通關' }, aliases: { ja: ['クリアー'] } },
  withTimeline: { label: { en: 'with TL', ko: 'TL 있음', ja: 'TL有り', zh_Hant: '附軸' }, aliases: { ja: ['TL有', 'TLあり', 'TL付き', 'TL付'] } },
  without: { label: { en: 'none', ko: '없음', ja: 'なし', zh_Hant: '沒有' }, aliases: { ja: ['無し'] } },
  // Low investment (fewer premium students / lower UE and star levels), not "stable".
  cheap: { label: { en: 'budget', ko: '저투자', ja: '安め', zh_Hant: '便宜' } },
  veryCheap: { label: { en: 'ultra-budget', ko: '초저투자', ja: '激安', zh_Hant: '超便宜' } },
  stable: { label: { en: 'stable', ko: '안정', ja: '安定', zh_Hant: '穩定' } },
  easy: { label: { en: 'easy', ko: '간단', ja: '簡単', zh_Hant: '簡單' }, aliases: { ja: ['カンタン'] } },

  // Raid descriptions often list student stats and battle mechanics alongside their timelines.
  studentDetails: { label: { en: 'Student details', ko: '사용 학생 상세', ja: '使用生徒詳細', zh_Hant: '使用學生詳情' } },
  exSkill: { label: { en: 'EX Skill', ko: 'EX 스킬', ja: 'EXスキル', zh_Hant: 'EX技能' } },
  attackPower: { label: { en: 'ATK', ko: '공격력', ja: '攻撃力', zh_Hant: '攻擊力' } },
  defensePower: { label: { en: 'DEF', ko: '방어력', ja: '防御力', zh_Hant: '防禦力' } },
  healingPower: { label: { en: 'Healing', ko: '치유력', ja: '治癒力', zh_Hant: '治癒力' } },
  criticalHit: { label: { en: 'Crit', ko: '치명', ja: '会心', zh_Hant: '暴擊' } },
  groggy: { label: { en: 'Groggy', ko: '그로기', ja: 'グロッキー', zh_Hant: '虛弱' } },
  battleMechanic: { label: { en: 'Mechanic', ko: '기믹', ja: 'ギミック', zh_Hant: '機制' } },

  // Short, recurring phrases in raid descriptions take precedence over their component terms.
  criticalRng: { label: { en: 'Crit RNG', ko: '치명타 운빨', ja: '会心ガチャ', zh_Hant: '暴擊看運氣' } },
  criticalRequirement: { label: { en: 'Crit requirement', ko: '치명타 요구', ja: '会心要求', zh_Hant: '暴擊要求' } },
  strictCriticalRequirement: { label: { en: 'Strict crit requirements', ko: '치명타 조건이 상당히 빡빡함', ja: '会心要求はかなりきつめ', zh_Hant: '暴擊要求相當嚴格' } },
  criticalClear: { label: { en: 'It clears if it crits.', ko: '치명타가 뜨면 클리어됩니다.', ja: '会心出れば通ります。', zh_Hant: '只要暴擊就能通關。' } },
  startingSkills: { label: { en: 'Opening skills', ko: '시작 스킬', ja: '開始スキル', zh_Hant: '起手技能' } },
  maxSkillsAndEquipment: {
    label: { en: 'All skills and equipment are maxed', ko: '스킬·장비 모두 최대입니다', ja: 'スキル・装備は全て最大です', zh_Hant: '技能與裝備均為滿級' },
    aliases: { ja: ['スキル・装備は全て最大'] },
  },
  noEarlyGroggyTimeline: { label: { en: 'TL without early Groggy', ko: '빠른 그로기 없는 TL', ja: '早グロッキーなしTL', zh_Hant: '無提前虛弱的 TL' } },
  earlyGroggy: { label: { en: 'Early Groggy', ko: '빠른 그로기', ja: '早グロッキー', zh_Hant: '提前虛弱' } },
  firstTeamComposition: { label: { en: 'Team 1 comp', ko: '1파티 편성', ja: '1凸目編成', zh_Hant: '第1刀編成' } },
  secondTeamComposition: { label: { en: 'Team 2 comp', ko: '2파티 편성', ja: '2凸目編成', zh_Hant: '第2刀編成' } },
  timelineInComments: { label: { en: 'The TL I used is in the comments.', ko: '댓글에 사용한 TL을 올려뒀습니다.', ja: 'コメントに使ってたTL載せてます。', zh_Hant: '使用的 TL 已放在留言區。' } },

  // Community slang
  // Platinum trophy (top 20,000). Labels follow the site's existing "Platinum" wording.
  platinumTrophy: { label: { en: 'Platinum', ko: '플래티넘', ja: 'チナトロ', zh_Hant: '白金' }, aliases: { ja: ['プラチナトロフィー'] } },
  platinumBorder: { label: { en: 'Platinum cutoff', ko: '플래티넘 컷', ja: 'チナトロボーダー', zh_Hant: '白金檔線' }, aliases: { ja: ['プラチナボーダー'] } },
  // Anniversary terms describe when a player started playing.
  anniversaryStarters: { label: { en: 'anniversary starters', ko: '주년 입문자', ja: '周年勢', zh_Hant: '周年入坑' } },
};
