import jpEventListJson from '~/data/jp/eventList.json';
import krEventListJson from '~/data/jp/eventList.json';
import type { EventListData } from '~/types/eventList';
import bossData from '~/data/bossdata.json';
import type { GameServer } from '~/types/data';
import type { Locale } from '~/utils/i18n/config';
import { loadRaidInfosById } from './loadRaidInfo';
import { getLiveRaidInfo, LIVE_RAID_DURATION } from '~/data/liveRaid';
import { getKstTime } from '~/data/globalRaidDates';
import { parseCsvString, type PickupStudentInfo, type ScheduleTrack } from './calender.data';

import jpEventCsvRaw from '~/data/jp/schedule/event.csv?raw';
import jpRaidCsvRaw from '~/data/jp/schedule/raid.csv?raw';
import jpEraidCsvRaw from '~/data/jp/schedule/eraid.csv?raw';
import jpMultifloorCsvRaw from '~/data/jp/schedule/multifloorraid.csv?raw';
import jpCampaignCsvRaw from '~/data/jp/schedule/campaign.csv?raw';
import jpPickupCsvRaw from '~/data/jp/schedule/pickup.csv?raw';
import jpMaintenanceCsvRaw from '~/data/jp/schedule/maintenance.csv?raw';
import jpJfdCsvRaw from '~/data/jp/schedule/jointFiringDrill.csv?raw';
import jpMainstoryCsvRaw from '~/data/jp/schedule/mainstory.csv?raw';
import jpMinistoryCsvRaw from '~/data/jp/schedule/miniStory.csv?raw';
import jpPatchCsvRaw from '~/data/jp/schedule/patch.csv?raw';
import krEventCsvRaw from '~/data/kr/schedule/event.csv?raw';
import krRaidCsvRaw from '~/data/kr/schedule/raid.csv?raw';
import krEraidCsvRaw from '~/data/kr/schedule/eraid.csv?raw';
import krMultifloorCsvRaw from '~/data/kr/schedule/multifloorraid.csv?raw';
import krCampaignCsvRaw from '~/data/kr/schedule/campaign.csv?raw';
import krPickupCsvRaw from '~/data/kr/schedule/pickup.csv?raw';
import krMaintenanceCsvRaw from '~/data/kr/schedule/maintenance.csv?raw';
import krJfdCsvRaw from '~/data/kr/schedule/jointFiringDrill.csv?raw';
import krMainstoryCsvRaw from '~/data/kr/schedule/mainstory.csv?raw';
import krMinistoryCsvRaw from '~/data/kr/schedule/miniStory.csv?raw';
import krPatchCsvRaw from '~/data/kr/schedule/patch.csv?raw';

const jpEventList = jpEventListJson as unknown as EventListData;
const krEventList = krEventListJson as unknown as EventListData;

const MS_PER_HOUR = 1000 * 60 * 60;
const JP_RAID_SEASON_EXIST_START = 47;
const KR_RAID_SEASON_EXIST_START = 15;
const KR_RAID_SEASON_EXIST_END = 73;
const KR_ERAID_SEASON_EXIST_END = 20;

type ArmorType = 'LightArmor' | 'HeavyArmor' | 'Unarmed' | 'ElasticArmor' | 'CompositeArmor';

export type MultiLang = { en?: string; ko?: string; ja?: string; zh_Hant?: string };

export interface ScheduleItemDetailsV2 {
  students?: PickupStudentInfo[];
  isPointEvent?: boolean;
  rerun?: boolean;
  studentId?: number;
  prediction?: boolean;
  maxDifficulty?: string;
  terrain?: string;
  armorType?: ArmorType;
  jfdType?: string;
  jfd3rd?: MultiLang;
  jfd4th?: MultiLang;
  campaignType?: string;
  multiplier?: number;
  noticeURL?: string;
  bosses?: Array<{ armorType?: ArmorType; difficulty: string }>;
  storyTitleKey?: string;
  storyVolume?: string;
  storyTitleMulti?: MultiLang;
  ministoryTitle?: MultiLang;
  part?: number;
}

export interface ScheduleItemV2 {
  id: string;
  type: string;
  startTime: string;
  endTime: string;
  link?: string;
  bossKey?: string;
  eventId?: string;
  i18nKey?: string;
  season?: number;
  details?: ScheduleItemDetailsV2;
}

interface EventItem {
  id: string;
  name: string;
  openTime: string;
  closeTime: string;
  planable?: boolean;
  rerun?: boolean;
  studentId?: number;
  prediction?: boolean;
}
interface RaidItem {
  season: number;
  boss?: string;
  startTime: string;
  endTime: string;
  maxDifficulty?: string;
  prediction?: boolean;
}
interface ERaidItem {
  season: number;
  boss1?: string;
  boss2?: string;
  boss3?: string;
  difficulty1?: string;
  difficulty2?: string;
  difficulty3?: string;
  startTime: string;
  endTime: string;
  prediction?: boolean;
}
interface MultifloorItem {
  season: number;
  boss?: string;
  armorType?: ArmorType;
  startTime: string;
  endTime: string;
  prediction?: boolean;
}
interface CampaignItem {
  campaignType: string;
  multiplier: number;
  startTime: string;
  endTime: string;
  prediction?: boolean;
}
interface PickupItem {
  studentId: number;
  startTime: string;
  endTime: string;
  limited: boolean;
  rerun: boolean;
  fest: boolean;
  prediction?: boolean;
}
interface MaintenanceItem {
  startTime: string;
  endTime: string;
  noticeURL?: string;
  prediction?: boolean;
}
interface StoryItemBase {
  startTime: string;
  titleKey?: string;
  volume?: string | number;
  chapter?: number;
  part?: number;
  titleEn?: string;
  titleJa?: string;
  titleKo?: string;
  titleTw?: string;
  prediction?: boolean;
}
interface PatchItem extends StoryItemBase {
  startTime: string;
}
interface JfdItem {
  season: number;
  type: string;
  armorType?: ArmorType;
  startTime: string;
  endTime: string;
  teran?: string;
  prediction?: boolean;
  '3nd_en'?: string;
  '3nd_kr'?: string;
  '3nd_ja'?: string;
  '3nd_tw'?: string;
  '4nd_en'?: string;
  '4nd_kr'?: string;
  '4nd_ja'?: string;
  '4nd_tw'?: string;
}

export interface LoadScheduleDataV2Options {
  server: GameServer;
  tracksToLoad: 'all' | ScheduleTrack[];
  // Optional window filter (epoch ms). When set, only items overlapping [start, end] are kept,
  // and the returned timeRange is clamped to this window instead of the full data extent.
  dateRangeMs?: { start: number; end: number };
}

export function loadScheduleDataV2({ server, tracksToLoad, dateRangeMs }: LoadScheduleDataV2Options) {
  const dataSources = {
    jp: {
      eventList: jpEventList,
      event: jpEventCsvRaw,
      raid: jpRaidCsvRaw,
      eraid: jpEraidCsvRaw,
      multifloor: jpMultifloorCsvRaw,
      campaign: jpCampaignCsvRaw,
      pickup: jpPickupCsvRaw,
      maintenance: jpMaintenanceCsvRaw,
      jfd: jpJfdCsvRaw,
      mainstory: jpMainstoryCsvRaw,
      ministory: jpMinistoryCsvRaw,
      patch: jpPatchCsvRaw,
    },
    kr: {
      eventList: krEventList,
      event: krEventCsvRaw,
      raid: krRaidCsvRaw,
      eraid: krEraidCsvRaw,
      multifloor: krMultifloorCsvRaw,
      campaign: krCampaignCsvRaw,
      pickup: krPickupCsvRaw,
      maintenance: krMaintenanceCsvRaw,
      jfd: krJfdCsvRaw,
      mainstory: krMainstoryCsvRaw,
      ministory: krMinistoryCsvRaw,
      patch: krPatchCsvRaw,
    },
  };

  const sources = dataSources[server];
  const eventList = sources.eventList;
  const nowMs = Date.now();
  const defaultLocale: Locale = server === 'kr' ? 'ko' : 'ja';

  const tracksToLoadArray = tracksToLoad === 'all' ? ['raid', 'event', 'multifloor', 'campaign', 'pickup', 'maintenance', 'story', 'patch', 'misc'] : tracksToLoad;

  const tracks: Record<string, ScheduleItemV2[]> = {
    raid: [],
    event: [],
    multifloor: [],
    campaign: [],
    pickup: [],
    maintenance: [],
    mainstory: [],
    ministory: [],
    patch: [],
    misc: [],
  };
  const allStartTimes: number[] = [];
  const allEndTimes: number[] = [];

  const parseKST = (s: string): string => {
    if (!s) return '';
    if (s.includes('T') && (s.includes('Z') || s.includes('+'))) return s;
    return s.replace(' ', 'T') + '+09:00';
  };

  const addItem = (trackName: string, item: ScheduleItemV2) => {
    const startMs = new Date(parseKST(item.startTime)).getTime();
    const endMs = new Date(parseKST(item.endTime)).getTime();
    if (isNaN(startMs) || isNaN(endMs)) return;
    if (dateRangeMs && (endMs < dateRangeMs.start || startMs > dateRangeMs.end)) return;
    allStartTimes.push(startMs);
    allEndTimes.push(endMs);
    tracks[trackName].push({ ...item, startTime: new Date(startMs).toISOString(), endTime: new Date(endMs).toISOString() });
  };

  if (tracksToLoadArray.includes('event')) {
    parseCsvString<EventItem>(sources.event).forEach((item) => {
      const eventInfo = item.id != null ? eventList[item.id] : undefined;
      const planable = eventInfo ? eventInfo.Planable !== false : true;
      addItem('event', {
        id: `event-${item.id}`,
        type: 'event',
        startTime: item.openTime,
        endTime: item.closeTime,
        eventId: item.id,
        link: planable ? `/planner/event/${Number(item.id) % 100000}` : undefined,
        details: { rerun: item.rerun, studentId: item.studentId, prediction: !!item.prediction },
      });
    });
  }

  if (tracksToLoadArray.includes('raid')) {
    parseCsvString<RaidItem>(sources.raid).forEach((item) => {
      if (!item.boss) return;
      const bossInfo = (bossData as unknown as Record<string, { name: Record<string, string>; teran?: string; armorType?: ArmorType }>)[item.boss];
      const details: ScheduleItemDetailsV2 = { maxDifficulty: item.maxDifficulty, prediction: !!item.prediction };
      if (bossInfo) {
        details.terrain = bossInfo.teran;
        details.armorType = bossInfo.armorType;
      }

      const startMs = new Date(parseKST(item.startTime)).getTime();
      const endMs = new Date(parseKST(item.endTime)).getTime();

      const isLiveRunning = (() => {
        const liveRaids = getLiveRaidInfo(defaultLocale);
        const startDate = getKstTime(liveRaids[0].Date);
        return new Date(startDate + LIVE_RAID_DURATION * 24 * 60 * 60 * 1000 - 7 * 60 * 60 * 1000).getTime() > nowMs;
      })();

      let link: string | undefined;
      if (server === 'jp' && item.season < JP_RAID_SEASON_EXIST_START) {
        /* no link */
      } else if (server === 'kr' && item.season < KR_RAID_SEASON_EXIST_START) {
        /* no link */
      } else if (nowMs >= startMs && nowMs <= endMs && server === 'jp' && isLiveRunning) link = '/live';
      else if (server === 'kr' && item.season > KR_RAID_SEASON_EXIST_END) {
        if (loadRaidInfosById('jp', defaultLocale, `R${item.season + 3}`).length) link = `/dashboard/jp/R${item.season + 3}`;
      } else if (nowMs > endMs) link = `/dashboard/${server}/R${item.season}`;

      addItem('raid', { id: `raid-${item.season}`, type: 'raid', startTime: item.startTime, endTime: item.endTime, bossKey: item.boss, link, details });
    });

    parseCsvString<ERaidItem>(sources.eraid).forEach((item) => {
      if (!item.boss1) return;
      const bossKey = item.boss1.split('_')[0];
      const terrain = item.boss1.split('_')[1];
      const bosses: Array<{ armorType?: ArmorType; difficulty: string }> = [];

      (
        [
          [item.boss1, item.difficulty1],
          [item.boss2, item.difficulty2],
          [item.boss3, item.difficulty3],
        ] as [string | undefined, string | undefined][]
      ).forEach(([boss, diff]) => {
        if (!boss || !diff) return;
        const parts = boss.split('_');
        bosses.push(parts.length >= 3 ? { armorType: parts[2] as ArmorType, difficulty: diff } : { difficulty: diff });
      });

      const startMs = new Date(parseKST(item.startTime)).getTime();
      const endMs = new Date(parseKST(item.endTime)).getTime();
      let link: string | undefined;
      if (nowMs >= startMs && nowMs <= endMs && server === 'jp') link = '/live';
      else if (server === 'kr' && item.season > KR_ERAID_SEASON_EXIST_END) {
        if (loadRaidInfosById('jp', defaultLocale, `E${item.season}`).length) link = `/dashboard/jp/E${item.season}`;
      } else if (nowMs > endMs) link = `/dashboard/${server}/E${item.season}`;

      addItem('raid', { id: `eraid-${item.season}`, type: 'eraid', startTime: item.startTime, endTime: item.endTime, bossKey, link, details: { terrain, bosses, prediction: !!item.prediction } });
    });

    parseCsvString<JfdItem>(sources.jfd).forEach((item) => {
      if (!item.startTime) return;
      const buildML = (round: '3nd' | '4nd'): MultiLang | undefined => {
        const ml: MultiLang = {};
        const en = item[`${round}_en` as keyof JfdItem] as string | undefined;
        const ko = item[`${round}_kr` as keyof JfdItem] as string | undefined;
        const ja = item[`${round}_ja` as keyof JfdItem] as string | undefined;
        const zhHant = item[`${round}_tw` as keyof JfdItem] as string | undefined;
        if (en) ml.en = en;
        if (ko) ml.ko = ko;
        if (ja) ml.ja = ja;
        if (zhHant) ml.zh_Hant = zhHant;
        return Object.keys(ml).length > 0 ? ml : undefined;
      };
      addItem('raid', {
        id: `jfd-${item.season}`,
        type: 'jointFiringDrill',
        startTime: item.startTime,
        endTime: item.endTime,
        i18nKey: `calendar:jfd.${item.type}`,
        season: item.season,
        details: { jfdType: item.type, terrain: item.teran, armorType: item.armorType, prediction: !!item.prediction, jfd3rd: buildML('3nd'), jfd4th: buildML('4nd') },
      });
    });
  }

  if (tracksToLoadArray.includes('multifloor')) {
    parseCsvString<MultifloorItem>(sources.multifloor).forEach((item) => {
      addItem('multifloor', {
        id: `multifloor-${item.season}`,
        type: 'multifloor',
        startTime: item.startTime,
        endTime: item.endTime,
        bossKey: item.boss,
        details: { armorType: item.armorType, prediction: !!item.prediction },
      });
    });
  }

  if (tracksToLoadArray.includes('campaign')) {
    parseCsvString<CampaignItem>(sources.campaign).forEach((item, index) => {
      addItem('campaign', {
        id: `campaign-${item.startTime}-${index}`,
        type: 'campaign',
        startTime: item.startTime,
        endTime: item.endTime,
        details: { campaignType: item.campaignType, multiplier: item.multiplier || 1, prediction: !!item.prediction },
      });
    });
  }

  if (tracksToLoadArray.includes('pickup')) {
    const pickupGroups = new Map<string, ScheduleItemV2>();
    parseCsvString<PickupItem>(sources.pickup).forEach((item) => {
      if (!item.startTime || !item.endTime) return;
      const groupKey = `${item.startTime}|${item.endTime}`;
      const studentInfo: PickupStudentInfo = { id: item.studentId, limited: item.limited, rerun: item.rerun, fest: item.fest };
      if (!pickupGroups.has(groupKey)) {
        pickupGroups.set(groupKey, {
          id: `pickup-group-${groupKey}`,
          type: 'pickup',
          startTime: item.startTime,
          endTime: item.endTime,
          details: { students: [studentInfo], prediction: !!item.prediction },
        });
      } else {
        const group = pickupGroups.get(groupKey);
        if (group?.details?.students) {
          group.details.students.push(studentInfo);
          if (item.prediction) group.details.prediction = true;
        }
      }
    });
    pickupGroups.forEach((g) => addItem('pickup', g));
  }

  if (tracksToLoadArray.includes('maintenance')) {
    parseCsvString<MaintenanceItem>(sources.maintenance).forEach((item) => {
      addItem('maintenance', {
        id: `maintenance-${item.startTime}`,
        type: 'maintenance',
        startTime: item.startTime,
        endTime: item.endTime,
        i18nKey: 'calendar:track.maintenance',
        details: { noticeURL: item.noticeURL, prediction: !!item.prediction },
      });
    });
  }

  if (tracksToLoadArray.includes('story')) {
    parseCsvString<StoryItemBase>(sources.mainstory).forEach((item, index) => {
      if (!item.startTime) return;
      const startMs = new Date(parseKST(item.startTime)).getTime();
      const endTimeISO = new Date(startMs + MS_PER_HOUR).toISOString();
      const details: ScheduleItemDetailsV2 = { isPointEvent: true, prediction: !!item.prediction };

      if (item.titleKey) {
        details.storyTitleKey = item.titleKey;
        if (item.part) details.part = item.part;
      } else if (item.volume != null) {
        details.storyVolume = `Vol.${item.volume} Ch.${item.chapter}${item.part ? ` Pt.${item.part}` : ''}`;
      } else {
        const multi: MultiLang = {};
        if (item.titleEn) multi.en = item.titleEn;
        if (item.titleKo) multi.ko = item.titleKo;
        if (item.titleJa) multi.ja = item.titleJa;
        if (item.titleTw) multi.zh_Hant = item.titleTw;
        if (Object.keys(multi).length > 0) details.storyTitleMulti = multi;
        if (item.part) details.part = item.part;
      }
      addItem('mainstory', { id: `mainstory-${item.startTime}-${index}`, type: 'mainstory', startTime: item.startTime, endTime: endTimeISO, details });
    });

    parseCsvString<StoryItemBase>(sources.ministory).forEach((item, index) => {
      if (!item.startTime) return;
      const startMs = new Date(parseKST(item.startTime)).getTime();
      const endTimeISO = new Date(startMs + MS_PER_HOUR).toISOString();
      const ministoryTitle: MultiLang = {};
      if (item.titleEn) ministoryTitle.en = item.titleEn;
      if (item.titleKo) ministoryTitle.ko = item.titleKo;
      if (item.titleJa) ministoryTitle.ja = item.titleJa;
      if (item.titleTw) ministoryTitle.zh_Hant = item.titleTw;
      addItem('ministory', {
        id: `ministory-${item.startTime}-${index}`,
        type: 'ministory',
        startTime: item.startTime,
        endTime: endTimeISO,
        i18nKey: 'calendar:story.mini',
        details: { isPointEvent: true, ministoryTitle: Object.keys(ministoryTitle).length > 0 ? ministoryTitle : undefined, prediction: !!item.prediction },
      });
    });
  }

  if (tracksToLoadArray.includes('patch')) {
    parseCsvString<PatchItem>(sources.patch).forEach((item, index) => {
      if (!item.startTime) return;
      const startMs = new Date(parseKST(item.startTime)).getTime();
      const endTimeISO = new Date(startMs + MS_PER_HOUR).toISOString();
      const multi: MultiLang = {};
      if (item.titleEn) multi.en = item.titleEn;
      if (item.titleKo) multi.ko = item.titleKo;
      if (item.titleJa) multi.ja = item.titleJa;
      if (item.titleTw) multi.zh_Hant = item.titleTw;
      addItem('patch', {
        id: `patch-${item.startTime}-${index}`,
        type: 'patch',
        startTime: item.startTime,
        endTime: endTimeISO,
        details: { isPointEvent: true, storyTitleMulti: Object.keys(multi).length > 0 ? multi : undefined, prediction: !!item.prediction },
      });
    });
  }

  if (tracksToLoadArray.includes('misc')) {
    const minDate = allStartTimes.length > 0 ? new Date(Math.min(...allStartTimes)) : new Date(nowMs - (365 / 2) * 24 * MS_PER_HOUR);
    const maxDate = allEndTimes.length > 0 ? new Date(Math.max(...allEndTimes)) : new Date(nowMs + (365 / 2) * 24 * MS_PER_HOUR);
    const currentMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (currentMonth <= maxDate) {
      const resetTime = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1, 4, 0, 0);
      tracks['misc'].push({
        id: `shop-reset-${resetTime.getFullYear()}-${resetTime.getMonth() + 1}`,
        type: 'shop-reset',
        startTime: resetTime.toISOString(),
        endTime: new Date(resetTime.getTime() + MS_PER_HOUR).toISOString(),
        i18nKey: 'calendar:misc.shop-reset',
        details: { isPointEvent: true, prediction: false },
      });
      allStartTimes.push(resetTime.getTime());
      allEndTimes.push(resetTime.getTime() + MS_PER_HOUR);
      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }
  }

  if (allStartTimes.length === 0) {
    return { tracks, timeRange: dateRangeMs ? { min: dateRangeMs.start, max: dateRangeMs.end } : { min: nowMs, max: nowMs + MS_PER_HOUR } };
  }

  const filteredTracks = Object.keys(tracks).reduce<Record<string, ScheduleItemV2[]>>((acc, key) => {
    if ((key === 'mainstory' || key === 'ministory') && tracksToLoadArray.includes('story')) acc[key] = tracks[key];
    else if (key === 'misc' && tracksToLoadArray.includes('misc')) acc[key] = tracks[key];
    else if (key === 'patch' && tracksToLoadArray.includes('patch')) acc[key] = tracks[key];
    else if (key === 'maintenance' && tracksToLoadArray.includes('maintenance')) acc[key] = tracks[key];
    else if (key === 'pickup' && tracksToLoadArray.includes('pickup')) acc[key] = tracks[key];
    else if (key === 'campaign' && tracksToLoadArray.includes('campaign')) acc[key] = tracks[key];
    else if (key === 'multifloor' && tracksToLoadArray.includes('multifloor')) acc[key] = tracks[key];
    else if (key === 'event' && tracksToLoadArray.includes('event')) acc[key] = tracks[key];
    else if (key === 'raid' && tracksToLoadArray.includes('raid')) acc[key] = tracks[key];
    return acc;
  }, {});

  const timeRange = dateRangeMs ? { min: dateRangeMs.start, max: dateRangeMs.end } : { min: Math.min(...allStartTimes), max: Math.max(...allEndTimes) };

  return { tracks: filteredTracks, timeRange };
}
