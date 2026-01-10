import Papa from "papaparse";
import { type_translation } from "~/components/raidToString";
import jpEventList from '~/data/jp/eventList.json';
import krEventList from '~/data/jp/eventList.json';
import bossData from '~/data/bossdata.json'
import { getInstance } from "~/middleware/i18next";
import { getLocaleShortName, type Locale } from "~/utils/i18n/config";

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
import type { GameServer } from "~/types/data";
import { loadRaidInfosById } from "./loadRaidInfo";


const armorTypeTranslation = type_translation

const MS_PER_HOUR = 1000 * 60 * 60;
const JP_RAID_SEASON_EXIST_START = 47
const KR_RAID_SEASON_EXIST_START = 15


function convTitleLnag(locale: Locale) {
  if (locale == 'en') return 'titleEn'
  else if (locale == 'ko') return 'titleKo'
  else if (locale == 'zh-Hant') return 'titleTw'
  else return 'titleJa'
}

interface PickupStudentInfo { id: number; limited: boolean; rerun: boolean; fast: boolean; }
export interface ScheduleItem {
  id: string; type: string; startTime: string; endTime: string; title: string; link?: string;
  details?: Record<string, any> & { students?: PickupStudentInfo[]; isPointEvent?: boolean; };
}

export type ScheduleTrack = 'raid' | 'event' | 'multifloor' | 'campaign' | 'pickup' | 'maintenance' | 'story' | 'patch' | 'misc';

// CSV parsing helper (internal to file)
export function parseCsvString<T extends object>(csvString: string): T[] {
  try {
    const parsed = Papa.parse<T>(csvString, {
      header: true, skipEmptyLines: true, dynamicTyping: true,
    });
    return parsed.data.filter(row => Object.values(row).some(val => val !== null && val !== ''));
  } catch (error) {
    console.error(`[Schedule Loader] Failed to parse CSV string:`, error);
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
export async function loadScheduleData({ server, locale, i18n, tracksToLoad }: LoadScheduleDataOptions) {

  const dataSources = {
    jp: { eventList: jpEventList, event: jpEventCsvRaw, raid: jpRaidCsvRaw, eraid: jpEraidCsvRaw, multifloor: jpMultifloorCsvRaw, campaign: jpCampaignCsvRaw, pickup: jpPickupCsvRaw, maintenance: jpMaintenanceCsvRaw, jfd: jpJfdCsvRaw, mainstory: jpMainstoryCsvRaw, ministory: jpMinistoryCsvRaw, patch: jpPatchCsvRaw },
    kr: { eventList: krEventList, event: krEventCsvRaw, raid: krRaidCsvRaw, eraid: krEraidCsvRaw, multifloor: krMultifloorCsvRaw, campaign: krCampaignCsvRaw, pickup: krPickupCsvRaw, maintenance: krMaintenanceCsvRaw, jfd: krJfdCsvRaw, mainstory: krMainstoryCsvRaw, ministory: krMinistoryCsvRaw, patch: krPatchCsvRaw }
  };

  const sources = dataSources[server];
  const eventList = sources.eventList;

  const now = new Date(); // Current time (local time of the execution environment)
  const nowMs = now.getTime();

  // If tracksToLoad is 'all', create an array containing all keys
  const tracksToLoadArray = tracksToLoad === 'all'
    ? ['raid', 'event', 'multifloor', 'campaign', 'pickup', 'maintenance', 'story', 'patch', 'misc']
    : tracksToLoad;

  const tracks: Record<string, ScheduleItem[]> = {
    raid: [], event: [], multifloor: [], campaign: [], pickup: [], maintenance: [],
    mainstory: [], ministory: [], patch: [], misc: [],
  };
  const allStartTimes: number[] = [];
  const allEndTimes: number[] = [];

  // Helper function to specify KST/JST (UTC+9) timezone
  // "2025-10-29 04:00:00" -> "2025-10-29T04:00:00+09:00"
  const parseKST = (dateString: string): string => {
    if (!dateString) return "";
    // If already in ISO format or has timezone info, return as is
    if (dateString.includes('T') && (dateString.includes('Z') || dateString.includes('+'))) {
      return dateString;
    }
    // Change format from "YYYY-MM-DD HH:MM:SS" to "YYYY-MM-DDTHH:MM:SS+09:00"
    return dateString.replace(" ", "T") + "+09:00";
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
    parseCsvString<any>(sources.event).forEach(item => {
      const eventInfo = (eventList as any)[(item.id % 10000)?.toString()];
      const title = eventInfo?.[{ en: 'En', ja: 'Jp', ko: 'Kr', 'zh-Hant': 'Tw' }[locale]] || eventInfo?.[{ en: 'En', ja: 'Jp', ko: 'Kr' }['ja']] || item.name || `Event (ID: ${item.id})`;
      addItem('event', { id: `event-${item.id}`, type: 'event', startTime: item.openTime, endTime: item.closeTime, title: title, link: `/planner/event/${item.id}`, details: { rerun: item.rerun, studentId: item.studentId, prediction: !!item.prediction } });
    });
  }

  if (tracksToLoadArray.includes('raid')) {
    // 2. Total Assault (Raid)
    parseCsvString<any>(sources.raid).forEach(item => {
      if (item.boss) {
        const bossInfo = (bossData as any)[item.boss];
        let title = `${item.boss}`;
        let details: any = { maxDifficulty: item.maxDifficulty, prediction: !!item.prediction };
        if (bossInfo) {
          title = `${bossInfo.name[getLocaleShortName(locale)]}`;
          details.terrain = bossInfo.teran;
          details.armorType = bossInfo.armorType;
          details.armorName = (armorTypeTranslation as any)[bossInfo.armorType][getLocaleShortName(locale)] || bossInfo.armorType;
        }

        // Time comparison for link logic is also performed using KST-parsed time (ms)
        const startMs = new Date(parseKST(item.startTime)).getTime();
        const endMs = new Date(parseKST(item.endTime)).getTime();

        let link: string | undefined = undefined;
        if (server=='jp' && item.season < JP_RAID_SEASON_EXIST_START){
          // nothing
        }
        else if (server=='kr' && item.season < KR_RAID_SEASON_EXIST_START){
          // nothing
        }
        else if (nowMs >= startMs && nowMs <= endMs && server == 'jp') {
          link = '/live';
        } else if (nowMs > endMs) {
          link = `/dashboard/${server}/R${item.season}`;
        } else if (server == 'kr') {
          const id = 'R' + (item.season + 3)
          if (loadRaidInfosById('jp', locale, id).length) {
            link = `/dashboard/jp/R${item.season + 3}`;
          }
        }
        addItem('raid', { id: `raid-${item.season}`, type: 'raid', startTime: item.startTime, endTime: item.endTime, title: title, link: link, details: details });
      }
    });
    // 3. Joint Firing Drill (JFD)
    parseCsvString<any>(sources.eraid).forEach(item => {
      if (item.boss1) {
        const bossInfo = (bossData as any)[item.boss1.split('_')[0]];
        const title = `${bossInfo.name[getLocaleShortName(locale)]}`;
        const terrain = item.boss1.split('_')[1];
        const bosses: any[] = [];
        const parseBossDetails = (bossString: string, difficulty: string) => {
          if (!bossString) return null;
          const parts = bossString.split('_');
          if (parts.length < 3) return { armorType: 'Unknown', armorName: 'Unknown', difficulty };
          const armorType = parts[2];
          return {
            armorType: armorType,
            armorName: (armorTypeTranslation as any)[armorType]?.[getLocaleShortName(locale)] || armorType,
            difficulty: difficulty
          };
        };
        [parseBossDetails(item.boss1, item.difficulty1), parseBossDetails(item.boss2, item.difficulty2), parseBossDetails(item.boss3, item.difficulty3)].forEach(b => { if (b) bosses.push(b); });

        // Time comparison for link logic is also performed using KST-parsed time (ms)
        const startMs = new Date(parseKST(item.startTime)).getTime();
        const endMs = new Date(parseKST(item.endTime)).getTime();

        let link: string | undefined = undefined;
        if (nowMs >= startMs && nowMs <= endMs && server == 'jp') {
          link = '/live';
        } else if (nowMs > endMs) {
          link = `/dashboard/${server}/E${item.season}`;
        } else if (server == 'kr') {
          const id = 'E' + (item.season)
          if (loadRaidInfosById('jp', locale, id).length) {
            link = `/dashboard/jp/E${item.season}`;
          }
        }
        addItem('raid', {
          id: `eraid-${item.season}`, type: 'eraid',
          startTime: item.startTime, endTime: item.endTime,
          title: title, link: link,
          details: { terrain: terrain, bosses: bosses, prediction: !!item.prediction }
        });
      }
    });
    // 8. Comprehensive Tactical Exam
    parseCsvString<any>(sources.jfd).forEach(item => {
      if (item.startTime) {
        const armorKo = (armorTypeTranslation as any)[item.armorType]?.[locale] || item.armorType;
        addItem('raid', {
          id: `jfd-${item.season}`, type: 'jointFiringDrill', startTime: item.startTime, endTime: item.endTime,
          title: `#${item.season}`,
          details: { jfdType: item.type, terrain: item.teran, armorType: item.armorType, armorName: armorKo, prediction: !!item.prediction }
        });
      }
    });
  }

  if (tracksToLoadArray.includes('multifloor')) {
    parseCsvString<any>(sources.multifloor).forEach(item => {
      const bossInfo = (bossData as any)[item.boss];
      let title = `${item.boss}`;
      if (bossInfo) {
        title = bossInfo.name?.[getLocaleShortName(locale)]
      }
      const armorKo = (armorTypeTranslation as any)[item.armorType]?.[getLocaleShortName(locale)] || item.armorType;
      addItem('multifloor', { id: `multifloor-${item.season}`, type: 'multifloor', startTime: item.startTime, endTime: item.endTime, title: `${title}`, details: { armorType: item.armorType, armorName: armorKo, prediction: !!item.prediction } });
    });
  }

  if (tracksToLoadArray.includes('campaign')) {
    parseCsvString<any>(sources.campaign).forEach((item, index) => {
      addItem('campaign', { id: `campaign-${item.startTime}-${index}`, type: 'campaign', startTime: item.startTime, endTime: item.endTime, title: `${item.campaignType} x${item.multiplier}`, details: { campaignType: item.campaignType, prediction: !!item.prediction } });
    });
  }

  if (tracksToLoadArray.includes('pickup')) {
    const pickupGroups = new Map<string, ScheduleItem>();
    parseCsvString<any>(sources.pickup).forEach((item, index) => {
      if (!item.startTime || !item.endTime) return;
      const groupKey = `${item.startTime}|${item.endTime}`; // Grouping based on KST string
      const studentInfo: PickupStudentInfo = { id: item.studentId, limited: item.limited, rerun: item.rerun, fast: item.fast };
      const isPrediction = !!item.prediction;
      if (!pickupGroups.has(groupKey)) {
        pickupGroups.set(groupKey, { id: `pickup-group-${groupKey}`, type: 'pickup', startTime: item.startTime, endTime: item.endTime, title: 'Pickup', details: { students: [studentInfo], prediction: isPrediction } });
      } else {
        const group = pickupGroups.get(groupKey)!;
        group.details!.students!.push(studentInfo);
        if (isPrediction) {
          group.details!.prediction = true;
        }
      }
    });
    pickupGroups.forEach(groupedItem => addItem('pickup', groupedItem));
  }

  if (tracksToLoadArray.includes('maintenance')) {
    parseCsvString<any>(sources.maintenance).forEach(item => {
      addItem('maintenance', { id: `maintenance-${item.startTime}`, type: 'maintenance', startTime: item.startTime, endTime: item.endTime, title: i18n.t("calendar:track.maintenance"), details: { noticeURL: item.noticeURL, prediction: !!item.prediction } });
    });
  }

  if (tracksToLoadArray.includes('story')) {
    parseCsvString<any>(sources.mainstory).forEach((item, index) => {
      if (item.startTime) {
        // Calculate endTime for one-time events based on KST
        const startMs = new Date(parseKST(item.startTime)).getTime();
        const endTimeISO = new Date(startMs + MS_PER_HOUR).toISOString();
        addItem('mainstory', {
          id: `mainstory-${item.startTime}-${index}`, type: 'mainstory',
          startTime: item.startTime,
          endTime: endTimeISO, // ISO string for 1 hour later
          title: `Vol.${item.volume} Ch.${item.chapter} ${item.part ? `Pt.${item.part}` : ''}`,
          details: { isPointEvent: true, prediction: !!item.prediction }
        });
      }
    });
    parseCsvString<any>(sources.ministory).forEach((item, index) => {
      if (item.startTime) {
        // Calculate endTime for one-time events based on KST
        const startMs = new Date(parseKST(item.startTime)).getTime();
        const endTimeISO = new Date(startMs + MS_PER_HOUR).toISOString();
        addItem('ministory', {
          id: `ministory-${item.startTime}-${index}`, type: 'ministory',
          startTime: item.startTime,
          endTime: endTimeISO, // ISO string for 1 hour later
          title: 'story.mini',
          details: { isPointEvent: true, title: item[convTitleLnag(locale)], prediction: !!item.prediction }
        });
      }
    });
  }

  if (tracksToLoadArray.includes('patch')) {
    parseCsvString<any>(sources.patch).forEach((item, index) => {
      if (item.startTime) {
        // Calculate endTime for one-time events based on KST
        const startMs = new Date(parseKST(item.startTime)).getTime();
        const endTimeISO = new Date(startMs + MS_PER_HOUR).toISOString();
        addItem('patch', {
          id: `patch-${item.startTime}-${index}`, type: 'patch',
          startTime: item.startTime,
          endTime: endTimeISO, // ISO string for 1 hour later
          title: `${item[convTitleLnag(locale)]}`,
          details: { isPointEvent: true, prediction: !!item.prediction }
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
      minDate = new Date(nowMs - (365 / 2 * 24 * MS_PER_HOUR));
      maxDate = new Date(nowMs + (365 / 2 * 24 * MS_PER_HOUR));
    }

    let currentMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
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
        details: { isPointEvent: true, prediction: false }
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
  const filteredTracks = Object.keys(tracks).reduce((acc, key) => {
    // ...
    if ((key === 'mainstory' || key === 'ministory') && tracksToLoadArray.includes('story')) {
      acc[key] = tracks[key];
    }
    else if (key === 'misc' && tracksToLoadArray.includes('misc')) {
      acc[key] = tracks[key];
    }
    else if (key === 'patch' && tracksToLoadArray.includes('patch')) {
      acc[key] = tracks[key];
    }
    else if (key === 'maintenance' && tracksToLoadArray.includes('maintenance')) {
      acc[key] = tracks[key];
    }
    else if (key === 'pickup' && tracksToLoadArray.includes('pickup')) {
      acc[key] = tracks[key];
    }
    else if (key === 'campaign' && tracksToLoadArray.includes('campaign')) {
      acc[key] = tracks[key];
    }
    else if (key === 'multifloor' && tracksToLoadArray.includes('multifloor')) {
      acc[key] = tracks[key];
    }
    else if (key === 'event' && tracksToLoadArray.includes('event')) {
      acc[key] = tracks[key];
    }
    else if (key === 'raid' && tracksToLoadArray.includes('raid')) {
      acc[key] = tracks[key];
    }
    return acc;
  }, {} as Record<string, ScheduleItem[]>);

  return { tracks: filteredTracks, timeRange };
}