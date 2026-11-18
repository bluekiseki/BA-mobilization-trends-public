import type { StatusEvent } from '~/types/eventStatus';
import { data, type LoaderFunctionArgs } from 'react-router';
import { getInstance } from '~/middleware/i18next';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import eventListJsonRaw from '~/data/jp/eventList.json';
import { getGlEventStatus } from '~/utils/glEventStatus';
import { formatInTimeZone } from '~/components/common/EventInfo';
import { getlocaleMethond } from '~/utils/locale';
import type { EventEntry, EventListData } from '~/types/eventList';
import { getLiveRaidDuration, getLiveRaidInfo } from '~/data/liveRaid';
import { getKstTime } from '~/data/globalRaidDates';
import { loadRaidFullInfos } from '~/utils/loadRaidInfo';
import { parseCsvString, type ScheduleTrack } from '~/utils/calender.data';
import { loadScheduleDataV2 } from '~/utils/calender.data.v2';
import { MS_PER_HOUR } from '~/utils/time';
import krRaidCsvRaw from '~/data/kr/schedule/raid.csv?raw';
import krEraidCsvRaw from '~/data/kr/schedule/eraid.csv?raw';
import jpRaidCsvRaw from '~/data/jp/schedule/raid.csv?raw';
import jpEraidCsvRaw from '~/data/jp/schedule/eraid.csv?raw';
import { sortChangelog } from '~/utils/changelog';
import changelogJson from '~/data/changelog.json';
import { type StatusRaid, getBossName, extractLocations, extractBossKeyAndArmorType } from '~/features/home/homeStatus';
import { toLocations } from '~/utils/raidLocation';

const eventListJson = eventListJsonRaw as unknown as EventListData;
// ─── Constants ──────────────────────────────────────────────────────────

const DIFF_ID_GL_JP = 3;
// ─── Loader ──────────────────────────────────────────────────────────────────

const HOME_CHANGELOG_COUNT = 5;
export function loadHomeStatus({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  const localeShort = getLocaleShortName(locale);
  const now = new Date();
  const nowMs = now.getTime();
  const calendarWidgetTracks: ScheduleTrack[] = ['raid', 'event', 'campaign', 'pickup'];
  // Home widget only needs a window around "now" — the rest loads lazily as the user scrolls (see useLazySchedule).
  // Kept wide enough that jumpToNow's center-viewport scroll doesn't land within the lazy-load edge threshold on first paint.
  const MS_PER_DAY = 24 * MS_PER_HOUR;
  const calendarWidgetDateRangeMs = { start: nowMs - 40 * MS_PER_DAY, end: nowMs + 40 * MS_PER_DAY };

  // ── JP Event ──────────────────────────────────────────────────────────────
  let jpEvent: StatusEvent | null = null;
  {
    const events = Object.entries(eventListJson).map(([id, d]) => ({
      id: Number(id),
      name: (d[getlocaleMethond('', 'Jp', locale) as keyof EventEntry] as string | undefined) || d.Jp || `Event ${id}`,
      openTime: new Date(formatInTimeZone(d.OpenTime ?? '')),
      closeTime: new Date(formatInTimeZone(d.CloseTime ?? '')),
      planable: d.Planable !== false,
    }));

    const current = events.find((e) => now >= e.openTime && now <= e.closeTime);
    if (current) {
      jpEvent = { id: current.id % 100000, name: current.name, status: 'active', dateIso: current.closeTime.toISOString(), planable: current.planable };
    } else {
      const upcoming = events.filter((e) => e.openTime > now).sort((a, b) => a.openTime.getTime() - b.openTime.getTime())[0];
      if (upcoming) {
        jpEvent = { id: upcoming.id % 100000, name: upcoming.name, status: 'upcoming', dateIso: upcoming.openTime.toISOString(), planable: upcoming.planable };
      }
    }
  }

  // ── GL/KR Event ───────────────────────────────────────────────────────────
  const glEvent = getGlEventStatus(locale, now);

  // JP Raid: live/upcoming from liveRaids or CSV data.
  let jpRaid: StatusRaid | null = null;
  {
    // Step 1: Check if liveRaids is in progress
    const liveRaids = getLiveRaidInfo(locale);
    if (liveRaids.length > 0) {
      const startDate = getKstTime(liveRaids[0].Date);
      const endDate = new Date(startDate + getLiveRaidDuration() * 24 * 60 * 60 * 1000 - (11 - 4) * 60 * 60 * 1000);
      if (endDate.getTime() > nowMs) {
        const isGrand = liveRaids.length > 1;
        jpRaid = {
          id: liveRaids[0].Id,
          bossName: liveRaids[0].Boss || liveRaids[0].Id,
          locations: toLocations(liveRaids[0].Location),
          isGrand,
          status: 'live',
          startDateIso: new Date(startDate).toISOString(),
          endDateIso: endDate.toISOString(),
          types: isGrand ? (liveRaids.map((r) => r.Type).filter(Boolean) as string[]) : undefined,
        };
      }
    }

    // Step 2: Search CSV — prefer actively-running (no live data yet, so no link) over upcoming.
    if (!jpRaid) {
      const raids = parseCsvString<{ season: string; startTime: string; endTime: string; boss: string }>(jpRaidCsvRaw);
      const eRaids = parseCsvString<{ season: string; startTime: string; endTime: string; boss1: string; boss2: string; boss3: string }>(jpEraidCsvRaw);

      // 2-a: Currently active but no live data (external provider not yet updated)
      const activeJpRaid = raids.filter((r) => getKstTime(r.startTime) <= nowMs && getKstTime(r.endTime) > nowMs).sort((a, b) => getKstTime(b.startTime) - getKstTime(a.startTime))[0];
      const activeJpERaid = eRaids.filter((r) => getKstTime(r.startTime) <= nowMs && getKstTime(r.endTime) > nowMs).sort((a, b) => getKstTime(b.startTime) - getKstTime(a.startTime))[0];

      const useActiveRaid = activeJpRaid && (!activeJpERaid || getKstTime(activeJpRaid.endTime) <= getKstTime(activeJpERaid.endTime));
      if (useActiveRaid) {
        jpRaid = {
          id: `R${activeJpRaid.season}`,
          bossName: getBossName(activeJpRaid.boss, localeShort),
          locations: extractLocations(activeJpRaid.boss),
          isGrand: false,
          status: 'active',
          noLink: true,
          startDateIso: new Date(getKstTime(activeJpRaid.startTime)).toISOString(),
          endDateIso: new Date(getKstTime(activeJpRaid.endTime)).toISOString(),
        };
      } else if (activeJpERaid) {
        const { bossKey } = extractBossKeyAndArmorType(activeJpERaid.boss1);
        const types = [activeJpERaid.boss1, activeJpERaid.boss2, activeJpERaid.boss3]
          .filter(Boolean)
          .map((b) => extractBossKeyAndArmorType(b).armorType)
          .filter(Boolean) as string[];
        jpRaid = {
          id: `E${activeJpERaid.season}`,
          bossName: getBossName(bossKey, localeShort),
          locations: extractLocations(bossKey),
          isGrand: true,
          status: 'active',
          noLink: true,
          startDateIso: new Date(getKstTime(activeJpERaid.startTime)).toISOString(),
          endDateIso: new Date(getKstTime(activeJpERaid.endTime)).toISOString(),
          types: types.length > 0 ? types : undefined,
        };
      }

      // 2-b: Upcoming raids (startTime > now)
      if (!jpRaid) {
        const nextJpRaid = raids.filter((r) => getKstTime(r.startTime) > nowMs).sort((a, b) => getKstTime(a.startTime) - getKstTime(b.startTime))[0];
        const nextJpERaid = eRaids.filter((r) => getKstTime(r.startTime) > nowMs).sort((a, b) => getKstTime(a.startTime) - getKstTime(b.startTime))[0];

        const useRaid = nextJpRaid && (!nextJpERaid || getKstTime(nextJpRaid.startTime) <= getKstTime(nextJpERaid.startTime));
        if (useRaid) {
          jpRaid = {
            id: `R${nextJpRaid.season}`,
            bossName: getBossName(nextJpRaid.boss, localeShort),
            locations: extractLocations(nextJpRaid.boss),
            isGrand: false,
            status: 'upcoming',
            startDateIso: new Date(getKstTime(nextJpRaid.startTime)).toISOString(),
            endDateIso: new Date(getKstTime(nextJpRaid.endTime)).toISOString(),
          };
        } else if (nextJpERaid) {
          const { bossKey } = extractBossKeyAndArmorType(nextJpERaid.boss1);
          const types = [nextJpERaid.boss1, nextJpERaid.boss2, nextJpERaid.boss3]
            .filter(Boolean)
            .map((b) => extractBossKeyAndArmorType(b).armorType)
            .filter(Boolean) as string[];
          jpRaid = {
            id: `E${nextJpERaid.season}`,
            bossName: getBossName(bossKey, localeShort),
            locations: extractLocations(bossKey),
            isGrand: true,
            status: 'upcoming',
            endDateIso: new Date(getKstTime(nextJpERaid.endTime)).toISOString(),
            types: types.length > 0 ? types : undefined,
          };
        }
        // Step 3: Still null → Display peace message in UI
      }
    }
  }

  // GL users view JP dashboard for current GL raid data via /dashboard/jp/{id}.
  let glRaid: StatusRaid | null = null;
  {
    const raids = parseCsvString<{ season: string; startTime: string; endTime: string; boss: string }>(krRaidCsvRaw);
    const eRaids = parseCsvString<{ season: string; startTime: string; endTime: string; boss1: string }>(krEraidCsvRaw);
    const jpRaids = loadRaidFullInfos('jp');

    // Primary: Total Assault
    const nextKrRaid = raids.filter((r) => getKstTime(r.endTime) > nowMs).sort((a, b) => getKstTime(a.startTime) - getKstTime(b.startTime))[0];
    const nextKrERaid = eRaids.filter((r) => getKstTime(r.endTime) > nowMs).sort((a, b) => getKstTime(a.startTime) - getKstTime(b.startTime))[0];

    // console.log('nextKrRaid',nextKrRaid, nextKrERaid)
    if (!nextKrERaid || (nextKrRaid && getKstTime(nextKrERaid.endTime) > getKstTime(nextKrRaid.endTime))) {
      const jpId = `R${Number(nextKrRaid.season) + DIFF_ID_GL_JP}`;
      const jpInfo = jpRaids.find((r) => r.Id === jpId);
      const isActive = getKstTime(nextKrRaid.startTime) <= nowMs;
      glRaid = {
        id: jpId,
        bossName: jpInfo ? getBossName(jpInfo.Boss, localeShort) : getBossName(nextKrRaid.boss, localeShort),
        locations: toLocations(jpInfo?.Location),
        isGrand: false,
        status: isActive ? 'active' : 'upcoming',
        endDateIso: new Date(getKstTime(nextKrRaid.endTime)).toISOString(),
        startDateIso: new Date(getKstTime(nextKrRaid.startTime)).toISOString(),
      };
    } else {
      // Fallback: Grand Assault
      // const nextKrERaid = eRaids.filter((r) => getKstTime(r.endTime) > nowMs).sort((a, b) => getKstTime(a.startTime) - getKstTime(b.startTime))[0];
      if (nextKrERaid) {
        const jpId = `E${nextKrERaid.season}`;
        const jpInfo = jpRaids.find((r) => r.Id === jpId);
        const isActive = getKstTime(nextKrERaid.startTime) <= nowMs;
        const glETypes = jpRaids
          .filter((r) => r.Id === jpId)
          .map((r) => r.Type)
          .filter(Boolean) as string[];
        glRaid = {
          id: jpId,
          bossName: jpInfo ? getBossName(jpInfo.Boss, localeShort) : nextKrERaid.boss1,
          locations: toLocations(jpInfo?.Location),
          isGrand: true,
          status: isActive ? 'active' : 'upcoming',
          endDateIso: new Date(getKstTime(nextKrERaid.endTime)).toISOString(),
          startDateIso: new Date(getKstTime(nextKrERaid.startTime)).toISOString(),
          types: glETypes.length > 0 ? glETypes : undefined,
        };
      }
    }
  }
  // console.log('jpRaid', jpRaid, 'glRaid', glRaid, 'jpEvent', jpEvent, 'glEvent', glEvent);

  return data({
    locale,
    jpEvent,
    glEvent,
    jpRaid,
    glRaid,
    calendarWidgets: {
      jp: loadScheduleDataV2({ server: 'jp', tracksToLoad: calendarWidgetTracks, dateRangeMs: calendarWidgetDateRangeMs }),
      kr: loadScheduleDataV2({ server: 'kr', tracksToLoad: calendarWidgetTracks, dateRangeMs: calendarWidgetDateRangeMs }),
    },
    // Home shows only the latest entries; the full history lives on /changelog
    recentChangelog: sortChangelog(changelogJson).slice(0, HOME_CHANGELOG_COUNT),
    siteTitle: i18n.t('common:title'),
    description: i18n.t('common:description'),
  });
}
