// Plain-text feed formatters (see app/data/textFeeds.meta.ts and /developers).
// Pure functions: scripts/generate-text-feeds.mjs loads the data and writes the results to public/.

import { feedServerName, findTextFeed, TEXT_FEED_FORMAT_VERSION, TEXT_FEED_LANGS, TEXT_FEED_RATE_LIMIT, TEXT_FEEDS, type TextFeedMeta } from '~/data/textFeeds.meta';
import { getPreferredGiftList } from '~/utils/student/giftAffectionList';
import { formatMissionDescription, getMissionStages } from '~/utils/missionDescription';
import { getItemName, getLocalizeEtcName } from '~/utils/locale';
import type { EventData, FavorStory, IconInfos, Skill, Student } from '~/types/plannerData';
import type { RaidFullInfo, RaidInfo } from '~/types/data';
import { getRaidTeamDataSource } from '~/data/raidTeamDataSources';
import type { EventListData } from '~/types/eventList';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import { getBossName, getItemTitle, getMLText, type I18nLike } from '~/utils/scheduleDisplay';
import { fillSkillParamsAllLevels, joinLevelValues, replaceSkillDescTags } from '~/utils/skillDescTags';
import { decodeHtmlEntities } from '~/utils/decodeHtmlEntities';
import type { Locale } from '~/utils/i18n/config';
import { getPlannerEventName, isPublicPlannerEvent, isRerunEvent } from '~/utils/eventList';

export { feedServerName, isPublicPlannerEvent };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export interface FeedContext {
  baseUrl: string;
  // Only set for dynamic feeds: a timestamp in static files would change every file on every deploy.
  generatedAt?: Date;
}

// Tabs and newlines would break the line/column structure.
const cell = (value: string | number | boolean | null | undefined): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value)
    .replace(/[\t\r\n]+/g, ' ')
    .trim();
};

const oneLine = (text: string | undefined): string =>
  (text ?? '')
    .replace(/\\n|\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function header(feed: TextFeedMeta, ctx: FeedContext, extra: string[] = []): string[] {
  const lines = [
    `# Yuzu Trends - ${feed.title}`,
    `# format: ${TEXT_FEED_FORMAT_VERSION}`,
    ...(ctx.generatedAt ? [`# generated: ${ctx.generatedAt.toISOString()}`] : []),
    `# docs: ${ctx.baseUrl}/developers`,
    ...(feed.source ? [`# source: ${feed.source}`] : []),
    ...extra.map((e) => `# ${e}`),
  ];
  if (feed.format === 'tsv') {
    lines.push('# Lines starting with "#" are comments; the first other line is the TSV column header.', '# Columns:');
    for (const c of feed.columns ?? []) lines.push(`#   ${c.name}: ${c.desc}`);
  }
  return lines;
}

function tsv(feed: TextFeedMeta, ctx: FeedContext, rows: (string | number | boolean | null | undefined)[][], extra: string[] = []): string {
  const columns = (feed.columns ?? []).map((c) => c.name);
  return [...header(feed, ctx, extra), columns.join('\t'), ...rows.map((r) => r.map(cell).join('\t'))].join('\n') + '\n';
}

function sections(feed: TextFeedMeta, ctx: FeedContext, title: string, body: [string, string[]][]): string {
  const parts = [...header(feed, ctx), '', `# ${title}`];
  for (const [name, lines] of body) {
    if (lines.length === 0) continue;
    parts.push('', `## ${name}`, ...lines);
  }
  return parts.join('\n') + '\n';
}

const kv = (key: string, value: string | number | boolean | null | undefined): string | null => {
  const v = cell(value);
  return v === '' ? null : `${key}: ${v}`;
};

// SchaleDB codes -> readable labels, so feed values explain themselves.
const RECRUIT_LABELS = ['Permanent', 'Limited', 'Event', 'Fes', 'Archive'];
const recruitLabel = (s: Student) => RECRUIT_LABELS[s.IsLimited?.[0] ?? 0] ?? String(s.IsLimited?.[0]);
const TERRAIN_GRADES = ['D', 'C', 'B', 'A', 'S', 'SS'];
const TIER_NAMES: Record<string, string> = { '4': 'Platinum', '3': 'Gold', '2': 'Silver', '1': 'Bronze' };

const compact = (lines: (string | null)[]): string[] => lines.filter((l): l is string => l !== null);

// "2023-01-11 11:00:00" in JST -> ISO UTC
export function jstToIso(value: string | undefined): string {
  if (!value) return '';
  const d = new Date(`${value.replace(' ', 'T')}+09:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace('.000Z', 'Z');
}

const isoNoMs = (value: string): string => value.replace('.000Z', 'Z');

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

// Fields present in SchaleDB's students.min.json that the shared Student type leaves out.
export interface FeedStudent extends Student {
  PersonalName?: string;
  SchoolYear?: string;
  CharacterAge?: string;
  Birthday?: string;
  CharHeightMetric?: string;
  Hobby?: string;
  FavorStatType?: string[];
  FavorStatValue?: number[][];
  FavorAlts?: number[];
  Weapon?: (NonNullable<Student['Weapon']> & { Name?: string }) | null;
}

export type FeedStudentData = Record<string, FeedStudent>;

// One raid season of a student's usage among the season's sampled top-ranked players.
export interface StudentRaidSeasonUsage {
  server: 'jp' | 'kr';
  raidId: string;
  label: string; // e.g. "R93 Drumbarka (Street)"
  date: string;
  sample: number;
  own: number;
  borrowed: number;
  source: string;
}

export function formatStudentList(students: FeedStudentData, lang: Locale, ctx: FeedContext): string {
  const feed = findTextFeed('students');
  const rows = Object.values(students)
    .sort((a, b) => a.Id - b.Id)
    .map((s) => [s.Id, s.Name, s.School, s.StarGrade, s.SquadType, s.TacticRole, s.BulletType, s.ArmorType, recruitLabel(s), `/txt/${lang}/students/${s.Id}.txt`]);
  return tsv(feed, ctx, rows, [`lang: ${lang}`, `count: ${rows.length}`]);
}

const SKILL_LABELS: [keyof Student['Skills'], string][] = [
  ['Ex', 'EX'],
  ['Public', 'Normal'],
  ['GearPublic', 'Normal (Gear T2)'],
  ['Passive', 'Passive'],
  ['WeaponPassive', 'Passive (Unique Weapon 2*)'],
  ['ExtraPassive', 'Sub'],
];

// Description with every level's values ("297%/312%/.../564%") and buff tags resolved to their
// localized names (same keys as the UI).
export function formatSkillText(skill: Skill, t: I18nLike['t']): string {
  const filled = fillSkillParamsAllLevels(skill.Desc ?? '', skill.Parameters);
  return oneLine(replaceSkillDescTags(filled, (statKey, param) => t(statKey, { defaultValue: param })));
}

// Cumulative relationship-rank stat bonus, following SchaleDB's bracket rule:
// FavorStatValue[i] is the per-rank gain while moving through ranks 2-5, 6-10, 11-15, 16-20, 21-30, 31-40, 41-50.
const FAVOR_BRACKET_END = [5, 10, 15, 20, 30, 40, 50];

export function getFavorStatAt(values: number[][], rank: number): number[] {
  const total = values[0]?.map(() => 0) ?? [];
  for (let r = 2; r <= Math.min(rank, 50); r++) {
    const bracket = FAVOR_BRACKET_END.findIndex((end) => r <= end);
    values[bracket]?.forEach((v, i) => (total[i] += v));
  }
  return total;
}

// play_rate_rank keys are "<raid index>|<student id>|<star grade, negative = borrowed>|<difficulty index>",
// where the raid index points into the server's raid_info list (same order as app/data/<server>/*.raid_info.json).
// Returns, per student, the most recent `seasonCount` seasons (every boss entry of a Grand Assault season).
export function buildRaidUsage(playRate: Record<string, number>, raids: RaidInfo[], server: 'jp' | 'kr', seasonCount: number): Map<number, StudentRaidSeasonUsage[]> {
  const recentIds = [...new Set(raids.map((r) => r.Id))].slice(-seasonCount);
  const recentIndexes = raids.map((r, i) => (recentIds.includes(r.Id) ? i : -1)).filter((i) => i >= 0);

  const counts = new Map<number, Map<number, { own: number; borrowed: number }>>(); // student -> raid index -> counts
  for (const [key, value] of Object.entries(playRate)) {
    const [raidStr, studentStr, gradeStr] = key.split('|');
    const raidIndex = Number(raidStr);
    if (!recentIndexes.includes(raidIndex)) continue;
    const perStudent = counts.get(Number(studentStr)) ?? new Map<number, { own: number; borrowed: number }>();
    const c = perStudent.get(raidIndex) ?? { own: 0, borrowed: 0 };
    if (Number(gradeStr) < 0) c.borrowed += value;
    else c.own += value;
    perStudent.set(raidIndex, c);
    counts.set(Number(studentStr), perStudent);
  }

  const result = new Map<number, StudentRaidSeasonUsage[]>();
  for (const [studentId, perStudent] of counts) {
    result.set(
      studentId,
      [...recentIndexes].reverse().map((i) => {
        const r = raids[i];
        const c = perStudent.get(i) ?? { own: 0, borrowed: 0 };
        return {
          server,
          raidId: r.Id,
          label: `${r.Id} ${r.Boss}${r.Type ? ` ${r.Type}` : ''} (${r.Location})`,
          date: r.Date,
          sample: r.Cnt.All,
          own: c.own,
          borrowed: c.borrowed,
          source: getRaidTeamDataSource(server, r.Id),
        };
      }),
    );
  }
  return result;
}

export function formatStudentDetail(
  student: FeedStudent,
  data: { icons: IconInfos; favorStories: Record<string, FavorStory[]>; students: FeedStudentData; raidUsage?: StudentRaidSeasonUsage[] },
  lang: Locale,
  t: I18nLike['t'],
  ctx: FeedContext,
): string {
  const feed = findTextFeed('student');
  const weapon = student.Weapon;
  const gear = student.Gear && 'Name' in student.Gear ? student.Gear : null;

  const profile = compact([
    kv('Id', student.Id),
    kv('Name', student.Name),
    kv('FamilyName', student.FamilyName),
    kv('PersonalName', student.PersonalName),
    kv('School', student.School),
    kv('Club', student.Club),
    kv('SchoolYear', student.SchoolYear),
    kv('Age', student.CharacterAge),
    kv('Birthday', student.Birthday),
    kv('Height', student.CharHeightMetric),
    kv('Hobby', student.Hobby),
    kv('Recruit', recruitLabel(student)),
    kv('SchaleDB', `https://schaledb.com/student/${student.PathName}`),
  ]);

  const combat = compact([
    kv('StarGrade', student.StarGrade),
    kv('SquadType', student.SquadType),
    kv('TacticRole', student.TacticRole),
    kv('Position', student.Position),
    kv('BulletType', student.BulletType),
    kv('ArmorType', student.ArmorType),
    kv('WeaponType', student.WeaponType),
    kv('Terrain (Street/Outdoor/Indoor)', [student.StreetBattleAdaptation, student.OutdoorBattleAdaptation, student.IndoorBattleAdaptation].map((g) => TERRAIN_GRADES[g]).join('/')),
    kv('Equipment', student.Equipment.join(', ')),
    kv('UniqueWeapon', weapon?.Name),
    kv('UniqueGear', gear?.Name),
  ]);

  const skills: string[] = ['Values in braces {a/b/c} are per skill level (Lv1/Lv2/...); values without braces are the same at every level.'];
  for (const [key, label] of SKILL_LABELS) {
    const skill = student.Skills[key];
    if (!skill?.Name) continue;
    skills.push(`${label}: ${skill.Name}`);
    if (key === 'Ex' && skill.Cost) skills.push(`  Cost: ${joinLevelValues(skill.Cost)}`);
    skills.push(`  Desc: ${formatSkillText(skill, t)}`);
    if (key === 'Ex') {
      for (const extra of student.Skills.Ex.ExtraSkills ?? []) {
        skills.push(`${label} (extra): ${extra.Name}`, `  Desc: ${formatSkillText(extra, t)}`);
      }
    }
  }

  // Same gift list as StudentProfileCard, grouped by preference level (higher = more preferred).
  const gifts = getPreferredGiftList(student, { icons: data.icons } as EventData);
  const giftsByLevel = new Map<number, string[]>();
  for (const g of gifts) {
    const name = oneLine(getLocalizeEtcName(data.icons.Item[g.id]?.LocalizeEtc, lang) ?? g.id);
    const list = giftsByLevel.get(g.preferenceLevel) ?? [];
    list.push(`${name} (+${g.affectionPoints})`);
    giftsByLevel.set(g.preferenceLevel, list);
  }
  const giftLines = [...giftsByLevel.entries()].sort((a, b) => b[0] - a[0]).map(([level, names]) => `Preference ${level}: ${names.join('; ')}`);

  const rankLines: string[] = [];
  if (student.FavorStatType?.length && student.FavorStatValue?.length) {
    rankLines.push(`Stats: ${student.FavorStatType.join(', ')} (cumulative bonus at rank)`);
    for (const rank of FAVOR_BRACKET_END) {
      rankLines.push(`Rank ${rank}: ${getFavorStatAt(student.FavorStatValue, rank).join(', ')}`);
    }
    const alts = (student.FavorAlts ?? []).map((id) => `${data.students[id]?.Name ?? id} (${id})`);
    if (alts.length) rankLines.push(`Shared with: ${alts.join('; ')}`);
  }

  const storyText = (m: Record<string, string>) => m[lang] || m.ja || m.ko || '';
  // Titles may contain any punctuation, so the summary goes on its own indented line.
  const storyLines = (data.favorStories[String(student.Id)] ?? []).flatMap((s) => [
    `Rank ${s.favor_rank}${s.memorial ? ' [memorial]' : ''}: ${oneLine(storyText(s.title))}`,
    `  Summary: ${oneLine(storyText(s.summary))}`,
  ]);

  const usageLines: string[] = [];
  if (data.raidUsage?.length) {
    // Own and borrowed are reported separately: one player can field the student as their own in one
    // team and as a borrowed helper in another, so their sum is not a share of players.
    usageLines.push('JP server. Share of the sampled top-ranked players using the student as their own / as a borrowed helper, most recent seasons first.');
    const pct = (n: number, total: number) => `${total ? ((n / total) * 100).toFixed(2) : '0.00'}%`;
    for (const u of data.raidUsage) {
      usageLines.push(
        `${feedServerName(u.server).toUpperCase()} ${u.label} ${u.date}: own ${pct(u.own, u.sample)}, borrowed ${pct(u.borrowed, u.sample)} (sample ${u.sample})`,
        `  Source: ${u.source}`,
      );
    }
  }

  return sections(feed, ctx, `${student.Name} (${student.Id})`, [
    ['Profile', profile],
    ['Combat', combat],
    ['Skills', skills],
    ['Gifts', giftLines],
    ['Relationship Rank', rankLines],
    ['Relationship Stories', storyLines],
    ['Raid Usage', usageLines],
  ]);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface FeedEventSeason {
  EventContentOpenTime?: string;
  EventContentCloseTime?: string;
  ExtensionTime?: string;
  EventContentTypeStr?: string[];
}

export interface KrEventDates {
  start: string;
  end: string;
  prediction: boolean;
}

export function formatEventList(events: { id: number; season: FeedEventSeason }[], eventList: EventListData, krDates: Map<number, KrEventDates>, lang: Locale, ctx: FeedContext): string {
  const feed = findTextFeed('events');
  const rows = [...events]
    .sort((a, b) => (b.season.EventContentOpenTime ?? '').localeCompare(a.season.EventContentOpenTime ?? '') || b.id - a.id)
    .map(({ id, season }) => {
      const kr = krDates.get(id);
      return [
        id,
        getPlannerEventName(eventList, id, lang),
        isRerunEvent(id),
        jstToIso(season.EventContentOpenTime),
        jstToIso(season.EventContentCloseTime),
        kr ? isoNoMs(kr.start) : '',
        kr ? isoNoMs(kr.end) : '',
        kr ? kr.prediction : '',
        `/txt/${lang}/events/${id}.txt`,
      ];
    });
  return tsv(feed, ctx, rows, [`lang: ${lang}`, `count: ${rows.length}`]);
}

const STAGE_GROUPS = [
  ['stage', 'Stage'],
  ['story', 'Story'],
  ['challenge', 'Challenge'],
] as const;

export function formatEventDetail(
  eventId: number,
  season: FeedEventSeason,
  eventData: EventData | null,
  data: { eventList: EventListData; globalIcons: IconInfos; students: FeedStudentData; krDates?: KrEventDates },
  lang: Locale,
  ctx: FeedContext,
): string {
  const feed = findTextFeed('event');
  const name = getPlannerEventName(data.eventList, eventId, lang);

  // Event-specific icons first, then the global table (currencies such as AP live only there).
  const icons: IconInfos = {
    ...data.globalIcons,
    Item: { ...data.globalIcons.Item, ...eventData?.icons.Item },
    Furniture: { ...data.globalIcons.Furniture, ...eventData?.icons.Furniture },
    Emblem: { ...data.globalIcons.Emblem, ...eventData?.icons.Emblem },
    GachaGroup: { ...data.globalIcons.GachaGroup, ...eventData?.icons.GachaGroup },
  };
  // Unnamed parcels (e.g. random reward boxes) fall back to "<Type> <id>".
  const parcel = (type: string, id: number) => {
    const key = `${type}_${id}`;
    const name = getItemName(key, icons, lang);
    return name === key ? `${type} ${id}` : oneLine(name);
  };

  const overview = compact([
    kv('EventId', eventId),
    kv('Name', name),
    kv('Rerun', isRerunEvent(eventId)),
    kv('JP Start', jstToIso(season.EventContentOpenTime)),
    kv('JP End', jstToIso(season.EventContentCloseTime)),
    kv('JP Extension End', jstToIso(season.ExtensionTime)),
    kv('GL Start', data.krDates ? isoNoMs(data.krDates.start) : undefined),
    kv('GL End', data.krDates ? isoNoMs(data.krDates.end) : undefined),
    kv('GL Prediction', data.krDates?.prediction),
    kv('Contents', (season.EventContentTypeStr ?? []).join(', ')),
    kv('Planner', `${ctx.baseUrl}/planner/event/${eventId}`),
  ]);

  const currencyType = new Map<number, number>(); // EventContentItemType -> item id
  const currencies = (eventData?.currency ?? []).map((c) => {
    if (!currencyType.has(c.EventContentItemType)) currencyType.set(c.EventContentItemType, c.ItemUniqueId);
    return `${parcel('Item', c.ItemUniqueId)} (Item ${c.ItemUniqueId}${c.UseShortCutContentType ? `, used in ${c.UseShortCutContentType}` : ''})`;
  });

  const bonus = Object.entries(eventData?.bonus ?? {})
    .map(([studentId, b]) => {
      const total = (b.BonusPercentage ?? []).reduce((sum, v) => sum + v, 0);
      const parts = (b.EventContentItemType ?? []).map((type, i) => {
        const itemId = currencyType.get(type);
        return `${itemId ? parcel('Item', itemId) : `type ${type}`} +${b.BonusPercentage[i] / 100}%`;
      });
      return { total, line: `${data.students[studentId]?.Name ?? studentId} (${studentId}): ${parts.join('; ')}` };
    })
    .sort((a, b) => b.total - a.total)
    .map((b) => b.line);

  const stages: string[] = [];
  for (const [key, label] of STAGE_GROUPS) {
    for (const [i, stage] of (eventData?.stage?.[key] ?? []).entries()) {
      const stageNumber = (stage as { StageNumber?: string }).StageNumber ?? String(i + 1);
      const rewards = (stage.EventContentStageReward ?? []).map((r) => {
        const prob = r.RewardProb < 10000 ? ` (${r.RewardProb / 100}%)` : '';
        return `${r.RewardTagStr}:${parcel(r.RewardParcelTypeStr, r.RewardId)} x${r.RewardAmount}${prob}`;
      });
      stages.push(`${label} ${stageNumber}: AP ${stage.StageEnterCostAmount}, Lv ${stage.RecommandLevel}`, `  Rewards: ${rewards.join('; ')}`);
      // Hints exist only in KR/JP; same choice as the planner's stage tabs (ko -> KR, else JP).
      const hint = stage.StageHintStr && (lang === 'ko' ? stage.StageHintStr.DescriptionKr : stage.StageHintStr.DescriptionJp);
      if (hint) stages.push(`  Hint: ${oneLine(hint)}`);
    }
  }

  const shop: string[] = [];
  for (const [category, items] of Object.entries(eventData?.shop ?? {})) {
    const costIds = eventData?.shop_info?.find((s) => String(s.CategoryType) === category)?.CostParcelId ?? [];
    shop.push(`[${costIds.map((id) => parcel('Item', id)).join('; ') || `Shop ${category}`}]`);
    for (const item of items) {
      const goods = item.Goods?.[0];
      if (!goods) continue;
      const reward = (goods.ParcelId ?? []).map((id, i) => `${parcel(goods.ParcelTypeStr[i], id)} x${goods.ParcelAmount[i]}`).join(' + ');
      const cost = (goods.ConsumeParcelId ?? []).map((id, i) => `${goods.ConsumeParcelAmount[i]} ${parcel(goods.ConsumeParcelTypeStr[i], id)}`).join(' + ');
      shop.push(reward, `  Cost: ${cost}`, `  Limit: ${item.PurchaseCountLimit || 'unlimited'}`);
    }
  }

  // Same placeholder filling as the event planner's mission list.
  const missionStages = eventData ? getMissionStages(eventData) : [];
  const itemName = (id: number) => parcel('Item', id);
  const missions = (eventData?.mission ?? []).flatMap((m) => {
    const desc = m.Description ? formatMissionDescription(m, missionStages, lang, itemName) : '';
    const rewards = (m.MissionRewardParcelId ?? []).map((id, i) => `${parcel(m.MissionRewardParcelTypeStr[i], id)} x${m.MissionRewardAmount[i]}`).join('; ');
    return [oneLine(desc), `  Rewards: ${rewards}`];
  });

  return sections(feed, ctx, `${name} (${eventId})`, [
    ['Overview', overview],
    ['Currencies', currencies],
    ['Bonus Students', bonus],
    ['Stages', stages],
    ['Shop', shop],
    ['Missions', missions],
    ...(eventData ? formatMinigameSections(eventData, parcel, lang) : []),
  ]);
}

// ---------------------------------------------------------------------------
// Event minigames: static reward data only (items, amounts, probabilities, costs) - no expected
// values or strategies. Probabilities given in 1/10000 are printed as percentages.
// ---------------------------------------------------------------------------

type ParcelName = (type: string, id: number) => string;

const pct = (value: number, total = 10000) => `${total ? Number(((value / total) * 100).toFixed(2)) : 0}%`;

function parcelList(name: ParcelName, types: readonly string[] | undefined, ids: readonly number[] | undefined, amounts: readonly number[] | undefined): string {
  return (ids ?? []).map((id, i) => `${name(types?.[i] ?? 'Item', id)} x${amounts?.[i] ?? 1}`).join('; ');
}

const costOf = (name: ParcelName, goods: { ConsumeParcelId?: number[]; ConsumeParcelAmount?: number[]; ConsumeParcelTypeStr?: string[] } | undefined) =>
  parcelList(name, goods?.ConsumeParcelTypeStr, goods?.ConsumeParcelId, goods?.ConsumeParcelAmount);

export function formatMinigameSections(eventData: EventData, name: ParcelName, lang: Locale): [string, string[]][] {
  const out: [string, string[]][] = [];

  if (eventData.total_reward?.length) {
    out.push(['Point Rewards', eventData.total_reward.map((r) => `${r.RequiredEventItemAmount} pts: ${parcelList(name, r.RewardParcelTypeStr, r.RewardParcelId, r.RewardParcelAmount)}`)]);
  }

  if (eventData.box_gacha?.shop.length) {
    const lines: string[] = [];
    for (const m of eventData.box_gacha.manage) {
      lines.push(`Round ${m.Round}${m.IsLoop ? ' (repeats)' : ''}: cost per draw ${costOf(name, m.Goods)}`);
      for (const item of eventData.box_gacha.shop.filter((s) => s.Round === m.Round)) {
        const g = item.Goods[0];
        if (g) lines.push(`  ${item.IsPrize ? '[prize] ' : ''}${item.GroupElementAmount} in box: ${parcelList(name, g.ParcelTypeStr, g.ParcelId, g.ParcelAmount)}`);
      }
    }
    out.push(['Minigame: Box Gacha', lines]);
  }

  if (eventData.card_shop?.length) {
    const lines: string[] = [];
    for (const group of [...new Set(eventData.card_shop.map((c) => c.RefreshGroup))].sort((a, b) => a - b)) {
      const cards = eventData.card_shop.filter((c) => c.RefreshGroup === group);
      lines.push(`Draw ${group}: cost ${cards[0]?.CostGoods.ConsumeExtraAmount?.[0] ?? '?'} ${name('Item', cards[0]?.CostGoods.ConsumeParcelId[0] ?? 0)}`);
      for (const c of cards) lines.push(`  rarity ${c.Rarity}, ${pct(c.Prob)}: ${parcelList(name, c.RewardParcelTypeStr, c.RewardParcelId, c.RewardParcelAmount)}`);
    }
    out.push(['Minigame: Card Draw', lines]);
  }

  if (eventData.treasure?.round.length) {
    const t = eventData.treasure;
    const lines: string[] = [];
    if (t.info[0]) lines.push(`Rounds after ${t.info[0].LoopRound} repeat the last round`);
    for (const r of t.round) {
      const [w, h] = r.TreasureRoundSize;
      const cell = t.cell_reward[String(r.CellRewardId)];
      lines.push(
        `Round ${r.TreasureRound}: ${w}x${h} board, ${costOf(name, r.CellCheckGoods)} per cell, every cell gives ${parcelList(name, cell?.RewardParcelTypeStr, cell?.RewardParcelId, cell?.RewardParcelAmount)}`,
      );
      r.RewardId.forEach((id, i) => {
        const tr = t.reward[String(id)];
        if (tr) lines.push(`  treasure x${r.RewardAmount[i]}: ${parcelList(name, tr.RewardParcelTypeStr, tr.RewardParcelId, tr.RewardParcelAmount)}`);
      });
    }
    out.push(['Minigame: Treasure Hunt', lines]);
  }

  if (eventData.fortune_gacha?.shop.length) {
    const shop = eventData.fortune_gacha.shop;
    const lines = [`Cost per draw: ${costOf(name, shop[0]?.CostGoods)}`];
    for (const s of [...shop].sort((a, b) => b.Grade - a.Grade)) lines.push(`grade ${s.Grade}, ${pct(s.Prob)}: ${parcelList(name, s.RewardParcelTypeStr, s.RewardParcelId, s.RewardParcelAmount)}`);
    out.push(['Minigame: Fortune Draw', lines]);
  }

  if (eventData.dice_race) {
    const d = eventData.dice_race;
    // Rows with a cost item are fixed-dice tickets (pick the result), not part of the random roll.
    const random = d.porb.filter((p) => !p.CostItemId);
    const fixed = d.porb.filter((p) => p.CostItemId);
    const probTotal = random.reduce((sum, p) => sum + p.Prob, 0);
    const lines = [
      `Cost per roll: ${costOf(name, d.info[0]?.DiceCostGoods)}`,
      `Roll: ${random.map((p) => `${p.DiceResult} ${pct(p.Prob, probTotal)}`).join('; ')}`,
      ...(fixed.length ? [`Fixed dice: ${fixed.map((p) => `${p.DiceResult} = ${name('Item', p.CostItemId)} x${p.CostItemAmount}`).join('; ')}`] : []),
      ...d.race_node.filter((n) => n.RewardParcelId?.length).map((n) => `Tile ${n.NodeId}: ${parcelList(name, n.RewardParcelTypeStr, n.RewardParcelId, n.RewardAmount)}`),
      ...d.total_reward.map((r) => `Lap ${r.RequiredLapFinishCount}: ${parcelList(name, r.RewardParcelTypeStr, r.RewardParcelId, r.RewardParcelAmount)}`),
    ];
    out.push(['Minigame: Dice Race', lines]);
  }

  if (eventData.location?.reward.length) {
    const loc = eventData.location;
    const lines = [
      `Cost per visit: ${loc.info[0]?.ScheduleEventPointCostParcelAmount ?? '?'} ${name(loc.info[0]?.ScheduleEventPointCostParcelTypeStr ?? 'Item', loc.info[0]?.ScheduleEventPointCostParcelId ?? 0)}`,
    ];
    for (const r of [...loc.reward].sort((a, b) => a.LocationRank - b.LocationRank || a.ScheduleGroupId - b.ScheduleGroupId || a.OrderInGroup - b.OrderInGroup)) {
      const extras = r.ExtraRewardParcelId.map((id, i) => `${name(r.ExtraRewardParcelTypeStr[i], id)} x${r.ExtraRewardAmount[i]} (${pct(r.ExtraRewardProb[i])})`);
      lines.push(`Rank ${r.LocationRank}, schedule ${r.ScheduleGroupId} #${r.OrderInGroup}: favor +${r.FavorExp}${extras.length ? `; ${extras.join('; ')}` : ''}`);
    }
    out.push(['Minigame: Location', lines]);
  }

  if (eventData.minigame_mission?.length) {
    out.push([
      'Minigame Missions',
      eventData.minigame_mission.flatMap((m) => {
        const desc = m.DescriptionStr ? formatMissionDescription({ ...m, Description: m.DescriptionStr }, getMissionStages(eventData), lang, (id) => name('Item', id)) : '';
        return [oneLine(desc), `  Rewards: ${parcelList(name, m.MissionRewardParcelTypeStr, m.MissionRewardParcelId, m.MissionRewardAmount)}`];
      }),
    ]);
  }

  // Random boxes referenced above (e.g. "GachaGroup 500000"): contents with draw probabilities.
  const groups = Object.entries(eventData.icons.GachaGroup ?? {});
  if (groups.length) {
    const lines: string[] = [];
    for (const [id, g] of groups) {
      const elements = g.GachaElement ?? g.GachaElementRecursive ?? [];
      const total = elements.reduce((sum, e) => sum + e.Prob, 0);
      const items = elements.map((e) => {
        const amount = e.ParcelAmountMin === e.ParcelAmountMax ? `${e.ParcelAmountMin}` : `${e.ParcelAmountMin}-${e.ParcelAmountMax}`;
        return `${name(e.ParcelTypeStr, e.ParcelId)} x${amount} (${pct(e.Prob, total)})`;
      });
      if (items.length) lines.push(`GachaGroup ${id}: ${items.join('; ')}`);
    }
    out.push(['Random Boxes', lines]);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export function formatSchedule(tracks: Record<string, ScheduleItemV2[]>, server: 'jp' | 'kr', students: FeedStudentData, lang: Locale, i18n: I18nLike, ctx: FeedContext): string {
  const feed = findTextFeed('schedule');
  const items = Object.values(tracks)
    .flat()
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.type.localeCompare(b.type));

  const rows = items.map((item) => {
    const d = item.details;
    const details = compact([
      d?.armorType ? `armor=${d.armorType}` : null,
      d?.terrain ? `terrain=${d.terrain}` : null,
      d?.maxDifficulty ? `maxDifficulty=${d.maxDifficulty}` : null,
      d?.bosses?.length ? `bosses=${d.bosses.map((b) => `${b.armorType ?? '?'}:${b.difficulty}`).join(',')}` : null,
      d?.rerun ? 'rerun=1' : null,
      item.eventId ? `eventId=${item.eventId}` : null,
      item.season != null ? `season=${item.season}` : null,
      d?.jfd3rd ? `3rd=${getMLText(d.jfd3rd, lang) ?? ''}` : null,
      d?.jfd4th ? `4th=${getMLText(d.jfd4th, lang) ?? ''}` : null,
      d?.students?.length
        ? `students=${d.students.map((s) => `${students[s.id]?.Name ?? s.id}(${s.id}${s.limited ? ',limited' : ''}${s.fest ? ',fes' : ''}${s.rerun ? ',rerun' : ''})`).join(',')}`
        : null,
    ]).join('; ');
    // Pickups have no title of their own (the calendar shows portraits); name them after the students.
    const title = item.type === 'pickup' && d?.students?.length ? `${i18n.t('game:pickup')}: ${d.students.map((s) => students[s.id]?.Name ?? s.id).join(', ')}` : getItemTitle(item, lang, i18n);
    return [item.type, title, isoNoMs(item.startTime), isoNoMs(item.endTime), d?.prediction ?? false, details];
  });

  return tsv(feed, ctx, rows, [`server: ${feedServerName(server)}`, `lang: ${lang}`, `count: ${rows.length}`]);
}

// ---------------------------------------------------------------------------
// Raids
// ---------------------------------------------------------------------------

export function formatRaids(raids: RaidFullInfo[], server: 'jp' | 'kr', ctx: FeedContext): string {
  const feed = findTextFeed('raids');
  const rows = [...raids]
    .sort((a, b) => b.Date.localeCompare(a.Date) || b.Id.localeCompare(a.Id))
    .map((r) => [
      r.Id,
      getBossName(r.Boss, 'en'),
      r.Type ?? '',
      r.Location,
      r.Date,
      r.MaxLv,
      r.TotalParticipants ?? r.Cnt.All,
      Object.entries(r.Cnt)
        .filter(([k, v]) => k !== 'All' && v)
        .map(([k, v]) => `${k}=${v}`)
        .join(', '),
      Object.entries(r.Tier)
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([k, v]) => `${TIER_NAMES[k] ?? k}=${v}`)
        .join(', '),
      r.Platinum,
      `${ctx.baseUrl}/dashboard/${server}/${r.Id}`,
    ]);
  return tsv(feed, ctx, rows, [`server: ${feedServerName(server)}`, `count: ${rows.length}`]);
}

// ---------------------------------------------------------------------------
// Notices (served dynamically by routes/api/text/notices.ts)
// ---------------------------------------------------------------------------

export interface FeedNotice {
  api_create_date: number;
  region: string;
  type: string;
  title: string;
  url: string;
}

export function formatNotices(notices: FeedNotice[], region: string, ctx: FeedContext): string {
  const feed = findTextFeed('notices');
  const rows = notices.map((n) => {
    const ms = n.api_create_date < 10000000000 ? n.api_create_date * 1000 : n.api_create_date;
    return [new Date(ms).toISOString().replace('.000Z', 'Z'), n.region, n.type, decodeHtmlEntities(n.title), n.url];
  });
  return tsv(feed, ctx, rows, [`region: ${region}`]);
}

// ---------------------------------------------------------------------------
// llms.txt
// ---------------------------------------------------------------------------

const PAGES: [string, string][] = [
  ['/calendar', 'JP/Global schedule calendar (raids, events, pickups, campaigns)'],
  ['/dashboard/jp', 'Total Assault / Grand Assault statistics per season'],
  ['/charts/jp/ranking', 'Student usage ranking charts'],
  ['/planner/event', 'Event planner (shop / stage farming optimizer)'],
  ['/planner/students', 'Student growth planner'],
  ['/planner/gacha', 'Gacha (pyroxene) planner'],
  ['/planner/inventory', 'Item management'],
  ['/notices', 'Official notices from all regions'],
  ['/developers', 'Plain-text feed documentation'],
];

export function buildLlmsTxt(ctx: FeedContext): string {
  const feedLines = TEXT_FEEDS.map((f) => {
    return `- [${f.title}](${ctx.baseUrl}${f.example}): \`${f.path}\` - ${f.desc} Updated ${f.update}.${f.source ? ` Source: ${f.source}.` : ''}`;
  });
  return (
    [
      '# Yuzu Trends',
      '',
      '> Fan-made tools and statistics for the mobile game Blue Archive: raid (Total Assault / Grand Assault) rankings, JP/Global schedules, event and gacha planners. Not affiliated with NEXON / Yostar.',
      '',
      'This site exposes plain-text feeds for developers and their tools. Prefer these over scraping HTML.',
      '',
      '## Conventions',
      '',
      `- Format version: ${TEXT_FEED_FORMAT_VERSION}. Columns are only appended; a breaking change bumps the version.`,
      '- Lines starting with `#` are comments. TSV feeds: the first non-comment line is the column header, split by tab.',
      '- Detail feeds: `## Section` headings followed by `key: value` lines; indented `  key: value` lines belong to the entry above. Multiple values in one line (e.g. rewards) are separated by `; `.',
      '- Times are ISO 8601 in UTC. Static feeds are regenerated on every deploy.',
      `- {lang} = ${TEXT_FEED_LANGS.join(' | ')}. {server} = jp | gl (Global).`,
      `- /txt/** are static files. The notices feed is rate limited to ${TEXT_FEED_RATE_LIMIT.notices} requests / ${TEXT_FEED_RATE_LIMIT.periodSeconds}s per IP (HTTP 429 with Retry-After). Cache responses on your side.`,
      '- CORS: `Access-Control-Allow-Origin: *` (GET only).',
      `- Data sources and licenses: ${ctx.baseUrl}/source (student data from SchaleDB; game assets belong to NEXON Games / Yostar).`,
      '',
      '## Feeds',
      '',
      ...feedLines,
      '',
      '## Pages',
      '',
      ...PAGES.map(([path, desc]) => `- [${path}](${ctx.baseUrl}${path}): ${desc}`),
      '',
    ].join('\n') + '\n'
  );
}
