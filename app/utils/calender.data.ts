// app/utils/calender.data.ts
import Papa from 'papaparse';
import { type_translation } from '~/components/raid/raidToString';
import jpEventListJson from '~/data/jp/eventList.json';
import krEventListJson from '~/data/jp/eventList.json';
import type { EventListData } from '~/types/eventList';

import bossData from '~/data/bossdata.json';
import { getInstance } from '~/middleware/i18next';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';

// --- JP ?raw import ---
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
// --- KR ?raw import ---
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
import type { GameServer } from '~/types/data';
import { loadRaidInfosById } from './loadRaidInfo';
import { getLiveRaidInfo, LIVE_RAID_DURATION } from '~/data/liveRaid';
import { getKstTime } from '~/data/globalRaidDates';

const jpEventList = jpEventListJson as unknown as EventListData;
const krEventList = krEventListJson as unknown as EventListData;
const armorTypeTranslation = type_translation;

const MS_PER_HOUR = 1000 * 60 * 60;
const JP_RAID_SEASON_EXIST_START = 47;
const KR_RAID_SEASON_EXIST_START = 15;
const KR_RAID_SEASON_EXIST_END = 73;
const KR_ERAID_SEASON_EXIST_END = 20;

function convTitleLnag(locale: Locale) {
  if (locale == 'en') return 'titleEn';
  else if (locale == 'ko') return 'titleKo';
  else if (locale == 'zh-Hant') return 'titleTw';
  else return 'titleJa';
}

export interface PickupStudentInfo {
  id: number;
  limited: boolean;
  rerun: boolean;
  fest: boolean;
}

export interface ScheduleItemDetails {
  students?: PickupStudentInfo[];
  isPointEvent?: boolean;
  rerun?: boolean;
  studentId?: number;
  prediction?: boolean;
  maxDifficulty?: string;
  terrain?: string;
  armorType?: string;
  armorName?: string;
  jfdType?: string;
  campaignType?: string;
  noticeURL?: string;
  bosses?: Array<{ armorType: string; armorName: string; difficulty: string }>;
  title?: string;
}

export interface ScheduleItem {
  id: string;
  type: string;
  startTime: string;
  endTime: string;
  title: string;
  label?: string;
  textColor?: string;
  link?: string;
  details?: ScheduleItemDetails;
}

export type ScheduleTrack = 'raid' | 'event' | 'multifloor' | 'campaign' | 'pickup' | 'maintenance' | 'story' | 'patch' | 'misc';

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
  armorType?: string;
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
  volume?: number;
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
  armorType?: string;
  startTime: string;
  endTime: string;
  teran?: string;
  prediction?: boolean;
}

// CSV parsing helper (internal to file)
export function parseCsvString<T extends object>(csvString: string): T[] {
  try {
    const parsed = Papa.parse<T>(csvString, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });
    return parsed.data.filter((row) => Object.values(row).some((val) => val !== null && val !== ''));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Schedule Loader] Failed to parse CSV string:`, errorMsg);
    return [];
  }
}

// Options interface
interface LoadScheduleDataOptions {
  server: GameServer;
  locale: Locale;
  i18n: ReturnType<typeof getInstance>; // i18n instance
  tracksToLoad: 'all' | ScheduleTrack[];
}

/**
 * Reusable schedule data loader
 * @param options.server - 'jp' | 'kr'
 * @param options.locale - 'en', 'ko', 'ja'
 * @param options.tracksToLoad - Array of tracks to load
 */
export function loadScheduleData({ server, locale, i18n, tracksToLoad }: LoadScheduleDataOptions) {
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

  const now = new Date(); // Current time (local time of the execution environment)
  const nowMs = now.getTime();

  const t_cal = (key: string) => i18n.t(`calendar:${key}`);
  const t_com = (key: string) => i18n.t(`common:${key}`);

  // If tracksToLoad is 'all', create an array containing all keys
  const tracksToLoadArray = tracksToLoad === 'all' ? ['raid', 'event', 'multifloor', 'campaign', 'pickup', 'maintenance', 'story', 'patch', 'misc'] : tracksToLoad;

  const tracks: Record<string, ScheduleItem[]> = {
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

  // Helper function to specify KST/JST (UTC+9) timezone
  // "2025-10-29 04:00:00" -> "2025-10-29T04:00:00+09:00"
  const parseKST = (dateString: string): string => {
    if (!dateString) return '';
    // If already in ISO format or has timezone info, return as is
    if (dateString.includes('T') && (dateString.includes('Z') || dateString.includes('+'))) {
      return dateString;
    }
    // Change format from "YYYY-MM-DD HH:MM:SS" to "YYYY-MM-DDTHH:MM:SS+09:00"
    return dateString.replace(' ', 'T') + '+09:00';
  };

  // Modify addItem helper to use KST parser
  const addItem = (trackName: string, item: ScheduleItem) => {
    // Create Date object by parsing the original string based on KST
    const startTimeKST = parseKST(item.startTime);
    const endTimeKST = parseKST(item.endTime);

    // Check if it&#39;s a valid time
    if (!startTimeKST || !endTimeKST) return;

    const startMs = new Date(startTimeKST).getTime();
    const endMs = new Date(endTimeKST).getTime();

    // Check if it&#39;s a valid Date object
    if (isNaN(startMs) || isNaN(endMs)) return;

    // Store Unix timestamp (ms) in the timeline array
    allStartTimes.push(startMs);
    allEndTimes.push(endMs);

    // Store UTC ISO string in track items (re-stringify Date object)
    tracks[trackName].push({
      ...item,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
    });
  };

  // --- Conditional parsing start ---
  // (Since all addItem calls use the modified helper,
  //  the CSV parsing logic itself doesn&#39;t need modification.)

  if (tracksToLoadArray.includes('event')) {
    parseCsvString<EventItem>(sources.event).forEach((item) => {
      const itemId = Number(item.id);
      const eventInfo = item.id != null ? eventList[item.id] : undefined;

      const planable = eventInfo ? eventInfo.Planable !== false : true;
      const localeKey = ({ en: 'En', ja: 'Jp', ko: 'Kr', 'zh-Hant': 'Tw' } as const)[locale];
      const title = (eventInfo?.[localeKey] as string | undefined) || eventInfo?.Jp || item.name || 'Event';

      const rerunText = item.rerun ? `/${t_com('rerun') as string}` : '';
      const label = `${t_cal('track.event') as string}${rerunText}`;

      addItem('event', {
        id: `event-${item.id}`,
        type: 'event',
        startTime: item.openTime,
        endTime: item.closeTime,
        title: title,
        label: label,
        link: !planable ? undefined : `/planner/event/${itemId % 100000}`,
        details: {
          rerun: item.rerun,
          studentId: item.studentId,
          prediction: !!item.prediction,
        },
      });
    });
  }

  if (tracksToLoadArray.includes('raid')) {
    // 2. Total Assault (Raid)
    parseCsvString<RaidItem>(sources.raid).forEach((item) => {
      if (item.boss) {
        const bossInfo = (bossData as unknown as Record<string, { name: Record<string, string>; teran?: string; armorType?: string }>)[item.boss];
        let title = item.boss;
        const details: ScheduleItemDetails = {
          maxDifficulty: item.maxDifficulty,
          prediction: !!item.prediction,
        };
        if (bossInfo) {
          title = bossInfo.name[getLocaleShortName(locale)];
          details.terrain = bossInfo.teran;
          details.armorType = bossInfo.armorType;
          details.armorName = (armorTypeTranslation as Record<string, Record<string, string>>)[bossInfo.armorType ?? '']?.[getLocaleShortName(locale)] || bossInfo.armorType;
        }

        // Time comparison for link logic is also performed using KST-parsed time (ms)
        const startMs = new Date(parseKST(item.startTime)).getTime();
        const endMs = new Date(parseKST(item.endTime)).getTime();

        const isLiveRunning = (() => {
          const liveRaids = getLiveRaidInfo(locale);
          const startDate = getKstTime(liveRaids[0].Date);
          const endDate = new Date(startDate + LIVE_RAID_DURATION * 24 * 60 * 60 * 1000 - (11 - 4) * 60 * 60 * 1000);
          return endDate.getTime() > nowMs;
        })();

        let link: string | undefined = undefined;
        if (server == 'jp' && item.season < JP_RAID_SEASON_EXIST_START) {
          // nothing
        } else if (server == 'kr' && item.season < KR_RAID_SEASON_EXIST_START) {
          // nothing
        } else if (nowMs >= startMs && nowMs <= endMs && server == 'jp' && isLiveRunning) {
          link = '/live';
        } else if (server == 'kr' && item.season > KR_RAID_SEASON_EXIST_END) {
          const id = `R${item.season + 3}`;
          if (loadRaidInfosById('jp', locale, id).length) {
            link = `/dashboard/jp/R${item.season + 3}`;
          }
        } else if (nowMs > endMs) {
          link = `/dashboard/${server}/R${item.season}`;
        }
        const label = t_com('raid') as string;

        addItem('raid', {
          id: `raid-${item.season}`,
          type: 'raid',
          startTime: item.startTime,
          endTime: item.endTime,
          title: title,
          label: label,
          link: link,
          details: details,
        });
      }
    });

    // 3. E. Raid
    parseCsvString<ERaidItem>(sources.eraid).forEach((item) => {
      if (item.boss1) {
        const bossKey = item.boss1.split('_')[0];
        const bossInfo = (bossData as unknown as Record<string, { name: Record<string, string> }>)[bossKey];
        const title = bossInfo?.name[getLocaleShortName(locale)] || '???';
        const terrain = item.boss1.split('_')[1];
        const bosses: Array<{ armorType: string; armorName: string; difficulty: string }> = [];
        const parseBossDetails = (bossString: string | undefined, difficulty: string | undefined) => {
          if (!bossString || !difficulty) return null;
          const parts = bossString.split('_');
          if (parts.length < 3) return { armorType: 'Unknown', armorName: 'Unknown', difficulty };
          const armorType = parts[2];
          return {
            armorType: armorType,
            armorName: (armorTypeTranslation as Record<string, Record<string, string>>)[armorType]?.[getLocaleShortName(locale)] || armorType,
            difficulty: difficulty,
          };
        };
        const boss1Details = parseBossDetails(item.boss1, item.difficulty1);
        const boss2Details = parseBossDetails(item.boss2, item.difficulty2);
        const boss3Details = parseBossDetails(item.boss3, item.difficulty3);
        if (boss1Details) bosses.push(boss1Details);
        if (boss2Details) bosses.push(boss2Details);
        if (boss3Details) bosses.push(boss3Details);

        // Time comparison for link logic is also performed using KST-parsed time (ms)
        const startMs = new Date(parseKST(item.startTime)).getTime();
        const endMs = new Date(parseKST(item.endTime)).getTime();

        let link: string | undefined = undefined;
        if (nowMs >= startMs && nowMs <= endMs && server == 'jp') {
          link = '/live';
        } else if (server == 'kr' && item.season > KR_ERAID_SEASON_EXIST_END) {
          const id = `E${item.season}`;
          if (loadRaidInfosById('jp', locale, id).length) {
            link = `/dashboard/jp/E${item.season}`;
          }
        } else if (nowMs > endMs) {
          link = `/dashboard/${server}/E${item.season}`;
        }
        const label = t_com('eraid') as string;

        addItem('raid', {
          id: `eraid-${item.season}`,
          type: 'eraid',
          startTime: item.startTime,
          endTime: item.endTime,
          title: title,
          label: label,
          link: link,
          details: {
            terrain: terrain,
            bosses: bosses,
            prediction: !!item.prediction,
          },
        });
      }
    });

    // 8. Comprehensive Tactical Exam
    parseCsvString<JfdItem>(sources.jfd).forEach((item) => {
      if (item.startTime) {
        const armorName = (armorTypeTranslation as Record<string, Record<string, string>>)[item.armorType ?? '']?.[locale] || item.armorType;
        const label = (t_com('jfd') as string) || 'JFD';
        const jfdTitle = t_cal(`jfd:${item.type}`) as string;

        addItem('raid', {
          id: `jfd-${item.season}`,
          type: 'jointFiringDrill',
          startTime: item.startTime,
          endTime: item.endTime,
          title: `#${item.season} ${jfdTitle}`,
          label: label,
          details: {
            jfdType: item.type,
            terrain: item.teran,
            armorType: item.armorType,
            armorName: armorName,
            prediction: !!item.prediction,
          },
        });
      }
    });
  }

  if (tracksToLoadArray.includes('multifloor')) {
    parseCsvString<MultifloorItem>(sources.multifloor).forEach((item) => {
      const bossInfo = (bossData as unknown as Record<string, { name?: Record<string, string> }>)[item.boss ?? ''];
      let title = item.boss || '';
      if (bossInfo?.name) {
        title = bossInfo.name[getLocaleShortName(locale)];
      }
      const armorName = (armorTypeTranslation as Record<string, Record<string, string>>)[item.armorType ?? '']?.[getLocaleShortName(locale)] || item.armorType;
      addItem('multifloor', {
        id: `multifloor-${item.season}`,
        type: 'multifloor',
        startTime: item.startTime,
        endTime: item.endTime,
        title: title,
        details: {
          armorType: item.armorType,
          armorName: armorName,
          prediction: !!item.prediction,
        },
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
        title: `${item.campaignType} x${item.multiplier}`,
        details: {
          campaignType: item.campaignType,
          prediction: !!item.prediction,
        },
      });
    });
  }

  if (tracksToLoadArray.includes('pickup')) {
    const pickupGroups = new Map<string, ScheduleItem>();
    parseCsvString<PickupItem>(sources.pickup).forEach((item) => {
      if (!item.startTime || !item.endTime) return;
      const groupKey = `${item.startTime}|${item.endTime}`;
      const studentInfo: PickupStudentInfo = {
        id: item.studentId,
        limited: item.limited,
        rerun: item.rerun,
        fest: item.fest,
      };
      const isPrediction = !!item.prediction;
      if (!pickupGroups.has(groupKey)) {
        pickupGroups.set(groupKey, {
          id: `pickup-group-${groupKey}`,
          type: 'pickup',
          startTime: item.startTime,
          endTime: item.endTime,
          title: 'Pickup',
          details: { students: [studentInfo], prediction: isPrediction },
        });
      } else {
        const group = pickupGroups.get(groupKey);
        if (group?.details?.students) {
          group.details.students.push(studentInfo);
          if (isPrediction) {
            group.details.prediction = true;
          }
        }
      }
    });
    pickupGroups.forEach((groupedItem) => addItem('pickup', groupedItem));
  }

  if (tracksToLoadArray.includes('maintenance')) {
    parseCsvString<MaintenanceItem>(sources.maintenance).forEach((item) => {
      addItem('maintenance', {
        id: `maintenance-${item.startTime}`,
        type: 'maintenance',
        startTime: item.startTime,
        endTime: item.endTime,
        title: i18n.t('calendar:track.maintenance'),
        details: { noticeURL: item.noticeURL, prediction: !!item.prediction },
      });
    });
  }

  if (tracksToLoadArray.includes('story')) {
    parseCsvString<StoryItemBase>(sources.mainstory).forEach((item, index) => {
      if (item.startTime) {
        // Calculate endTime for one-time events based on KST
        const startMs = new Date(parseKST(item.startTime)).getTime();
        const endTimeISO = new Date(startMs + MS_PER_HOUR).toISOString();
        const titleKey = convTitleLnag(locale);
        const title = item.volume != null ? `Vol.${item.volume} Ch.${item.chapter} ${item.part ? `Pt.${item.part}` : ''}` : item[titleKey as keyof typeof item] || item[convTitleLnag('ja')];
        addItem('mainstory', {
          id: `mainstory-${item.startTime}-${index}`,
          type: 'mainstory',
          startTime: item.startTime,
          endTime: endTimeISO,
          title: String(title),
          details: { isPointEvent: true, prediction: !!item.prediction },
        });
      }
    });
    parseCsvString<StoryItemBase>(sources.ministory).forEach((item, index) => {
      if (item.startTime) {
        // Calculate endTime for one-time events based on KST
        const startMs = new Date(parseKST(item.startTime)).getTime();
        const endTimeISO = new Date(startMs + MS_PER_HOUR).toISOString();
        const titleKey = convTitleLnag(locale);
        const storyTitle = item[titleKey as keyof typeof item] || item[convTitleLnag('en')];
        const miniText = (t_cal('story.mini') as string).replace('{{title}}', String(storyTitle));
        addItem('ministory', {
          id: `ministory-${item.startTime}-${index}`,
          type: 'ministory',
          startTime: item.startTime,
          endTime: endTimeISO,
          title: miniText,
          details: {
            isPointEvent: true,
            title: String(storyTitle),
            prediction: !!item.prediction,
          },
        });
      }
    });
  }

  if (tracksToLoadArray.includes('patch')) {
    parseCsvString<PatchItem>(sources.patch).forEach((item, index) => {
      if (item.startTime) {
        // Calculate endTime for one-time events based on KST
        const startMs = new Date(parseKST(item.startTime)).getTime();
        const endTimeISO = new Date(startMs + MS_PER_HOUR).toISOString();
        const titleKey = convTitleLnag(locale);
        const title = item[titleKey as keyof typeof item] || item[convTitleLnag('en')];
        addItem('patch', {
          id: `patch-${item.startTime}-${index}`,
          type: 'patch',
          startTime: item.startTime,
          endTime: endTimeISO,
          title: String(title),
          details: { isPointEvent: true, prediction: !!item.prediction },
        });
      }
    });
  }

  if (tracksToLoadArray.includes('misc')) {
    let minDate, maxDate;
    if (allStartTimes.length > 0) {
      minDate = new Date(Math.min(...allStartTimes));
      maxDate = new Date(Math.max(...allEndTimes));
    } else {
      minDate = new Date(nowMs - (365 / 2) * 24 * MS_PER_HOUR);
      maxDate = new Date(nowMs + (365 / 2) * 24 * MS_PER_HOUR);
    }

    const currentMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (currentMonth <= maxDate) {
      // Create shop reset time (Every 1st of the month, 4:00) based on KST (UTC+9)
      // Date(year, month, day, hour) is created in local timezone (KST)
      const resetTime = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1, 4, 0, 0);
      const resetTimeISO = resetTime.toISOString(); // Convert KST 4:00 to UTC (e.g., previous day 19:00Z)
      const endTimeISO = new Date(resetTime.getTime() + MS_PER_HOUR).toISOString();

      // Modify addItem to accept ISO string instead of KST string
      // (Since addItem already converts to Date object internally, pass ISO string directly here)
      tracks['misc'].push({
        id: `shop-reset-${resetTime.getFullYear()}-${resetTime.getMonth() + 1}`,
        type: 'shop-reset',
        startTime: resetTimeISO,
        endTime: endTimeISO,
        title: 'misc.shop-reset',
        details: { isPointEvent: true, prediction: false },
      });
      // UTC timestamp to allStartTimes as well
      allStartTimes.push(resetTime.getTime());
      allEndTimes.push(resetTime.getTime() + MS_PER_HOUR);

      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }
  }

  // Cannot calculate timeRange if no items are loaded
  if (allStartTimes.length === 0) {
    return { tracks, timeRange: { min: nowMs, max: nowMs + MS_PER_HOUR } };
  }

  const minTime = Math.min(...allStartTimes);
  const maxTime = Math.max(...allEndTimes);
  const timeRange = { min: minTime, max: maxTime };

  // (filteredTracks return logic is the same)
  const filteredTracks = Object.keys(tracks).reduce<Record<string, ScheduleItem[]>>((acc, key) => {
    // ...
    if ((key === 'mainstory' || key === 'ministory') && tracksToLoadArray.includes('story')) {
      acc[key] = tracks[key];
    } else if (key === 'misc' && tracksToLoadArray.includes('misc')) {
      acc[key] = tracks[key];
    } else if (key === 'patch' && tracksToLoadArray.includes('patch')) {
      acc[key] = tracks[key];
    } else if (key === 'maintenance' && tracksToLoadArray.includes('maintenance')) {
      acc[key] = tracks[key];
    } else if (key === 'pickup' && tracksToLoadArray.includes('pickup')) {
      acc[key] = tracks[key];
    } else if (key === 'campaign' && tracksToLoadArray.includes('campaign')) {
      acc[key] = tracks[key];
    } else if (key === 'multifloor' && tracksToLoadArray.includes('multifloor')) {
      acc[key] = tracks[key];
    } else if (key === 'event' && tracksToLoadArray.includes('event')) {
      acc[key] = tracks[key];
    } else if (key === 'raid' && tracksToLoadArray.includes('raid')) {
      acc[key] = tracks[key];
    }
    return acc;
  }, {});

  return { tracks: filteredTracks, timeRange };
}
