// app/routes/home.tsx
import { useEffect, useState } from 'react';
import { RemainingTime } from '~/components/RemainingTime';
import { Trans, useTranslation } from 'react-i18next';
import { EventCard, ServerBadge, StatusBadge, type StatusEvent } from '~/components/home/EventStatusCard';
import { data, Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import type { Route } from './+types/home';
import { getInstance } from '~/middleware/i18next';
import { DEFAULT_LOCALE, getLocaleShortName, SUPORTED_LOCALES, type Locale, type LocaleShortName } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import { CalendarWidget } from '~/components/CalendarWidget';
import { LOCALE_DEFAULT_REGION, NoticeWidget } from '~/components/NoticeWidget';
import { cdn } from '~/utils/cdn';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { useIsDarkState } from '~/store/isDarkState';
import type { GameServer } from '~/types/data';

import eventListJsonRaw from '~/data/jp/eventList.json';
import { getGlobalEventDates } from '~/data/globalEventDates';
import { formatInTimeZone } from '~/components/planner/EventInfo';
import { getlocaleMethond } from '~/components/planner/common/locale';
import type { EventEntry, EventListData } from '~/types/eventList';

const eventListJson = eventListJsonRaw as unknown as EventListData;

import { getLiveRaidInfo, LIVE_RAID_DURATION } from '~/data/liveRaid';
import { getKstTime } from '~/data/globalRaidDates';
import { loadRaidFullInfos } from '~/utils/loadRaidInfo';
import { parseCsvString, type ScheduleTrack } from '~/utils/calender.data';
import { loadScheduleDataV2 } from '~/utils/calender.data.v2';
import { MS_PER_HOUR } from '~/components/gantt/constants';
import { typecolor, type_translation_sorted } from '~/components/raid/raidToString';
import { TerrainIconGameStyle, type Terrain } from '~/components/raid/teran';
import bossData from '~/data/bossdata.json';
import krRaidCsvRaw from '~/data/kr/schedule/raid.csv?raw';
import krEraidCsvRaw from '~/data/kr/schedule/eraid.csv?raw';
import jpRaidCsvRaw from '~/data/jp/schedule/raid.csv?raw';
import jpEraidCsvRaw from '~/data/jp/schedule/eraid.csv?raw';

type BossDataMap = Record<string, { name: Record<string, string | null> }>;

import { MonthEndResetBanner } from '~/components/home/MonthEndResetBanner';
import { Changelog } from '~/components/Changelog';
import changelogJson from '~/data/changelog.json';

import { FaBirthdayCake } from 'react-icons/fa';
import { HiChevronRight } from 'react-icons/hi2';
import type { StudentPortraitData } from '~/types/plannerData';

// Screenshot images
import heatmapImage from '/img/2.webp'; // no dark variant
import type { AppHandle } from '~/types/link';

// ─── Constants ────────────────────────────────────────────────────────────────

const DIFF_ID_GL_JP = 3;

const TERRAIN_TYPES = new Set(['Outdoor', 'Indoor', 'Street']);
const ARMOR_TYPES = new Set(['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor', 'SpecialArmor']);

function extractBossKeyAndArmorType(field: string): { bossKey: string; armorType: string | null } {
  const parts = field.split('_');
  const last = parts[parts.length - 1];
  if (ARMOR_TYPES.has(last)) return { bossKey: parts.slice(0, -1).join('_'), armorType: last };
  return { bossKey: field, armorType: null };
}

function extractLocation(bossKey: string): string {
  const parts = bossKey.split('_');
  const last = parts[parts.length - 1];
  return TERRAIN_TYPES.has(last) ? last : '';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatusRaid {
  id: string;
  bossName: string;
  location: string;
  isGrand: boolean;
  status: 'live' | 'active' | 'upcoming'; // live = /live page, active = dashboard available, upcoming = not started yet (no link)
  endDateIso?: string; // available for live (+7d) and GL/KR CSV
  startDateIso?: string; // available for live (+7d) and GL/KR CSV
  types?: string[]; // defense types for Grand Assault (LightArmor, HeavyArmor, …)
  noLink?: boolean; // In progress in CSV but live/dashboard data not ready -> no link
}

interface BirthdayStudent {
  id: number;
  name_ko: string;
  name_en: string;
  name_ja: string;
  name_zh: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getBossName(bossKey: string, locale: LocaleShortName): string {
  const bossDataMap = bossData as BossDataMap;
  if (bossKey in bossDataMap) return bossDataMap[bossKey].name[locale] || bossKey;
  const shortBossKey = bossKey.split('_')[0];
  if (shortBossKey in bossDataMap) return bossDataMap[shortBossKey].name[locale] || shortBossKey;
  return bossKey;
}

// function getJstDateKey(offsetDays: number): string {
//   const d = new Date(Date.now() + (9 * 60 + offsetDays * 24 * 60) * 60 * 1000); // UTC+9 + N days
//   return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
// }

// Function to generate a date key based on the user's local time
function getLocalDateKey(offsetDays: number): string {
  const d = new Date(); // Current user's local time
  d.setDate(d.getDate() + offsetDays); // Add or subtract days based on local time (month/year transitions are handled automatically)
  return `${d.getMonth() + 1}/${d.getDate()}`; // Return month/day based on local time instead of UTC
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export function loader({ context }: LoaderFunctionArgs) {
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
  let glEvent: StatusEvent | null = null;
  {
    const glDates = getGlobalEventDates();
    const processed = Object.entries(glDates).map(([idStr, dates]) => {
      const id = Number(idStr);
      const d = eventListJson[idStr];
      const name = d ? (d[getlocaleMethond('', 'Jp', locale) as keyof EventEntry] as string | undefined) || d.Jp || `Event ${id}` : `Event ${id}`;
      return { id, name, startTime: new Date(getKstTime(dates.start)), endTime: new Date(getKstTime(dates.end)) };
    });

    const current = processed.find((e) => now >= e.startTime && now <= e.endTime);
    if (current) {
      glEvent = { id: current.id, name: current.name, status: 'active', dateIso: current.endTime.toISOString() };
    } else {
      const upcoming = processed.filter((e) => e.startTime > now).sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0];
      if (upcoming) {
        glEvent = { id: upcoming.id, name: upcoming.name, status: 'upcoming', dateIso: upcoming.startTime.toISOString() };
      }
    }
  }

  // ── JP Raid ───────────────────────────────────────────────────────────────
  // 1) liveRaids currently in progress → 'live'
  // 2) CSV startTime > now → 'upcoming' (no link)
  // 3) If none, null → "Kivotos is at peace"
  let jpRaid: StatusRaid | null = null;
  {
    // Step 1: Check if liveRaids is in progress
    const liveRaids = getLiveRaidInfo(locale);
    if (liveRaids.length > 0) {
      const startDate = getKstTime(liveRaids[0].Date);
      const endDate = new Date(startDate + LIVE_RAID_DURATION * 24 * 60 * 60 * 1000 - (11 - 4) * 60 * 60 * 1000);
      if (endDate.getTime() > nowMs) {
        const isGrand = liveRaids.length > 1;
        jpRaid = {
          id: liveRaids[0].Id,
          bossName: liveRaids[0].Boss || liveRaids[0].Id,
          location: liveRaids[0].Location,
          isGrand,
          status: 'live',
          startDateIso: new Date(startDate).toISOString(),
          endDateIso: endDate.toISOString(),
          types: isGrand ? (liveRaids.map((r) => r.Type).filter(Boolean) as string[]) : undefined,
        };
      }
    }

    // Step 2: Search in CSV — first check actively-running (startTime <= now < endTime),
    // then fall back to upcoming (startTime > now). Active-from-CSV means live data is
    // not yet available from the external provider, so we show it without a link.
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
          location: extractLocation(activeJpRaid.boss),
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
          location: extractLocation(bossKey),
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
            location: extractLocation(nextJpRaid.boss),
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
            location: extractLocation(bossKey),
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

  // ── GL/KR Raid ────────────────────────────────────────────────────────────
  // GL users look up the JP dashboard for the currently running GL raid (Future Sight)
  // Link always goes to /dashboard/jp/{id} for historical stats
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
        location: jpInfo?.Location ?? '',
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
          location: jpInfo?.Location ?? '',
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
    siteTitle: i18n.t('common:title'),
    description: i18n.t('common:description'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.siteTitle, loaderData.description, '/img/1.webp');
}

export function links() {
  return [...createLinkHreflang('home-v2')];
}

export const handle: AppHandle = {
  preload: (data: unknown) => {
    const d = data as Record<string, unknown> | undefined;
    const locale = typeof d?.locale === 'string' && SUPORTED_LOCALES.includes(d.locale as Locale) ? (d.locale as Locale) : DEFAULT_LOCALE;
    const newsServer = LOCALE_DEFAULT_REGION[locale];
    return [
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/w/students_portrait.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: `/api/notices?region=${newsServer}&sort=new&type=ALL&limit=5`,
        as: 'fetch',
        crossOrigin: 'use-credentials',
      },
    ];
  },
};

export function headers() {
  if (process.env.NODE_ENV === 'production') return { 'Cache-Control': CACHE_CONTROL_CONFIG };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RaidCard({ raid, server, locale }: { raid: StatusRaid | null; server: 'JP' | 'GL/KR'; locale: Locale }) {
  const { t: t_c } = useTranslation('common');
  if (!raid) return <EmptyRaidCard server={server} />;

  const seasonNum = raid.id.substring(1);
  const localeShort = getLocaleShortName(locale);
  const raidTypeLabel = raid.isGrand ? t_c('eraid') : t_c('raid');

  const inner = (
    <>
      {/* Header: badges + terrain */}
      <div className="flex items-center gap-1.5">
        <ServerBadge server={server} />
        <StatusBadge status={raid.status} />
        {raid.location && (
          <span className="ml-auto shrink-0">
            <TerrainIconGameStyle terrain={raid.location as Terrain} size="1em" />
          </span>
        )}
      </div>

      {/* Boss name */}
      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 leading-snug grow">
        <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500 mr-1">S{seasonNum}</span>
        {raid.bossName}
      </p>

      {/* Footer: type badges (Grand) or type label (Total) + end date */}
      <div className="flex items-center gap-1 flex-wrap">
        {raid.isGrand && raid.types && raid.types.length > 0 ? (
          raid.types.map((type) => (
            <span key={type} className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white leading-none" style={{ backgroundColor: typecolor[type as keyof typeof typecolor] }}>
              {type_translation_sorted[type as keyof typeof type_translation_sorted]?.[localeShort] ?? type}
            </span>
          ))
        ) : (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">{raidTypeLabel}</span>
        )}
        {raid.endDateIso && raid.startDateIso && (
          <RemainingTime
            targetDate={raid.status === 'upcoming' ? new Date(raid.startDateIso) : new Date(raid.endDateIso)}
            isUpcoming={raid.status === 'upcoming'}
            className="text-xs text-neutral-400 dark:text-neutral-500 ml-auto"
          />
        )}
      </div>
    </>
  );

  // No link for JP upcoming, or when live/dashboard data is not yet available
  if (server === 'JP' && (raid.status === 'upcoming' || raid.noLink)) {
    return (
      <div className="rounded-sm border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-800/70 backdrop-blur-sm p-3.5 flex flex-col gap-2 min-h-24 cursor-default">{inner}</div>
    );
  }

  const to = raid.status === 'live' ? localeLink(locale, '/live') : localeLink(locale, `/dashboard/jp/${raid.id}`);
  return (
    <Link
      to={to}
      className="group rounded-sm border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-800/70 backdrop-blur-sm p-3.5 hover:border-blue-400 dark:hover:border-blue-500 flex flex-col gap-2 min-h-24"
    >
      {inner}
    </Link>
  );
}

function EmptyRaidCard({ server }: { server: 'JP' | 'GL/KR' }) {
  const { t } = useTranslation('common');
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-800/70 backdrop-blur-sm p-3.5 flex flex-col gap-2 min-h-24">
      <div className="flex items-center gap-1.5">
        <ServerBadge server={server} />
      </div>
      <p className="text-sm text-neutral-400 dark:text-neutral-500 grow flex items-center">{t('home.kivotosPeace')}</p>
    </div>
  );
}

interface BirthdayEntry {
  student: BirthdayStudent;
  dateKey: string; // e.g. "4/10"
  daysFromNow: number; // 0 = today
}

// Birthday widget — fully client-side (JST date, hydration-safe)
function BirthdayWidget({ locale }: { locale: Locale }) {
  const { t: t_c } = useTranslation('common');
  const [entries, setEntries] = useState<BirthdayEntry[] | null>(null);
  const [portraits, setPortraits] = useState<StudentPortraitData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Dynamically import birthdays.json so date calculation always happens at client runtime (JST)
  useEffect(() => {
    let cancelled = false;
    import('~/data/birthdays.json')
      .then(({ default: birthdaysJson }) => {
        if (cancelled) return;
        const db = birthdaysJson as Record<string, BirthdayStudent[]>;
        const result: BirthdayEntry[] = [];
        for (let i = -1; i <= 6; i++) {
          const key = getLocalDateKey(i);
          // const key = getJstDateKey(i);
          (db[key] ?? []).forEach((s) => result.push({ student: s, dateKey: key, daysFromNow: i }));
        }
        setEntries(result);
      })
      .catch(() => {
        // silently fail on import error
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch portraits once entries are known
  useEffect(() => {
    if (entries === null) return; // still loading birthdays.json
    if (entries.length === 0) {
      setIsLoading(false); // no birthdays → no portraits needed
      return;
    }
    let cancelled = false;
    fetch(cdn('/w/students_portrait.json'))
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setPortraits(data as StudentPortraitData);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  // While loading, show 8 skeleton placeholders so the widget doesn't flicker in
  const displayEntries: BirthdayEntry[] =
    entries ??
    Array.from({ length: 8 }, (_, i) => ({
      student: { id: -2 - i, name_ko: '', name_en: '', name_ja: '', name_zh: '' },
      dateKey: '',
      daysFromNow: i - 1,
    }));

  // After loading, if no birthdays in the next 7 days → hide widget
  if (!isLoading && entries !== null && entries.length === 0) return null;

  const getName = (s: BirthdayStudent) => (locale === 'ko' ? s.name_ko : locale === 'ja' ? s.name_ja : locale === 'zh-Hant' ? s.name_zh : s.name_en);

  const dayLabel = (daysFromNow: number, dateKey: string) => {
    if (daysFromNow === -1) return t_c('yesterday');
    if (daysFromNow === 0) return t_c('today');
    if (daysFromNow === 1) return t_c('tomorrow');
    return dateKey;
  };

  return (
    <div className="w-full border-y md:border md:rounded-xl border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-900/10 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-100 dark:border-amber-800/30">
        <FaBirthdayCake className="text-amber-500 dark:text-amber-400 text-xs shrink-0" />
        <span className="text-sm font-bold text-amber-700 dark:text-amber-300">{t_c('home.birthdaySoon')}</span>
      </div>
      <div className="flex gap-3 px-4 py-3 overflow-x-auto">
        {displayEntries.map(({ student: s, dateKey, daysFromNow }) => {
          const portrait = portraits?.[s.id];
          const isToday = daysFromNow === 0;
          const showSkeleton = isLoading && !portrait;
          return (
            <Link key={`${s.id}-${dateKey}`} to={localeLink(locale, '/charts/jp/heatmap')} state={{ studentId: s.id }} className="flex flex-col items-center gap-1 shrink-0 group">
              <div
                className={`w-12 h-12 rounded-full overflow-hidden flex items-center justify-center border-2 transition-all group-hover:scale-105 ${
                  isToday ? 'border-amber-400 dark:border-amber-500 bg-amber-100 dark:bg-amber-900/40' : 'border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800'
                } ${showSkeleton ? 'animate-pulse' : ''}`}
              >
                {portrait ? (
                  <img src={`data:image/webp;base64,${portrait}`} alt={getName(s)} className="w-full h-full object-cover object-top" />
                ) : showSkeleton ? (
                  <div className={`w-full h-full ${isToday ? 'bg-amber-200 dark:bg-amber-800/60' : 'bg-neutral-200 dark:bg-neutral-600'}`} />
                ) : (
                  <FaBirthdayCake className={isToday ? 'text-amber-400' : 'text-neutral-400'} />
                )}
              </div>
              <span className={`text-xs font-semibold text-center max-w-14 leading-tight ${isToday ? 'text-amber-800 dark:text-amber-200' : 'text-neutral-600 dark:text-neutral-400'}`}>
                {getName(s)}
              </span>
              <span
                className={`text-xs font-bold px-1 py-0.5 rounded ${
                  isToday ? 'bg-amber-200 text-amber-700 dark:bg-amber-800/50 dark:text-amber-300' : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400'
                }`}
              >
                {dayLabel(daysFromNow, dateKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Tool links — Analytics rows (server-toggled) + Tool cards (with descriptions)
function ToolLinks({ locale, isDark }: { locale: Locale; isDark: boolean }) {
  const [server, setServer] = useState<'jp' | 'kr'>('jp');
  const { t: tCommon } = useTranslation('common');
  const { t: tDashboard } = useTranslation('dashboard');
  const { t: tCharts } = useTranslation('charts');
  // Card titles/descriptions live under common:navigation / common:homeFeatures (not the
  // planner namespace) so this feature-card grid doesn't drag in the whole planner.json
  // (~76KB, used by dozens of unrelated planner/gacha/scanner/minigame components).
  const { t: tNav } = useTranslation('common', { keyPrefix: 'navigation' });
  const { t: tHomeFeatures } = useTranslation('common', { keyPrefix: 'homeFeatures' });
  const { t: tEmblem } = useTranslation('emblemCounter');

  const s = server.toUpperCase();

  const analyticsLinks = [
    {
      to: localeLink(locale, `/dashboard/${server}`),
      img: isDark ? '/img/3_dark.webp' : '/img/3.webp',
      title: tCommon('dashboard-btn'),
      desc: tDashboard('description1'),
      badge: s,
    },
    {
      to: localeLink(locale, `/charts/${server}/ranking`),
      img: isDark ? '/img/1_dark.webp' : '/img/1.webp',
      title: tCommon('btn2'),
      desc: tCharts('ranking.description1'),
      badge: s,
    },
    {
      to: localeLink(locale, `/charts/${server}/heatmap`),
      img: heatmapImage,
      title: tCommon('btn1'),
      desc: tCharts('heatmap.description1'),
      badge: s,
    },
  ];

  const toolCards = [
    {
      to: localeLink(locale, '/planner/event'),
      img: isDark ? '/img/p_dark.webp' : '/img/p.webp',
      title: tNav('eventPlanner'),
      desc: tHomeFeatures('eventPlannerDesc'),
    },
    {
      to: localeLink(locale, '/planner/gacha'),
      img: isDark ? '/img/gacha_dark.webp' : '/img/gacha.webp',
      title: `${tNav('gachaPlanner', 'Pyroxene Planner')} (BETA)`,
      desc: tHomeFeatures('gachaPlannerDesc', 'Calculate income & Simulate gacha'),
    },
    {
      to: localeLink(locale, '/planner/students'),
      img: isDark ? '/img/growth_dark.webp' : '/img/growth.webp',
      title: tNav('studentGrowthPlanner'),
      desc: tHomeFeatures('studentGrowthPlannerDesc'),
    },
    {
      to: localeLink(locale, '/planner/equipment'),
      img: isDark ? '/img/equipment_dark.webp' : '/img/equipment.webp',
      title: `${tNav('equipmentFarmingPlanner')} (BETA)`,
      desc: tHomeFeatures('equipmentFarmingPlannerDesc'),
    },
    {
      to: localeLink(locale, '/charts/favor'),
      img: isDark ? '/img/f_dark.webp' : '/img/f.webp',
      title: tEmblem('title'),
      desc: tEmblem('description'),
    },
    {
      to: localeLink(locale, '/utils/favor'),
      img: isDark ? '/img/favorcalc_dark.webp' : '/img/favorcalc.webp',
      title: tNav('favorCalculator'),
      desc: tHomeFeatures('favorCalculatorDesc'),
    },
    {
      to: localeLink(locale, '/utils/jukebox'),
      img: isDark ? '/img/j_dark.webp' : '/img/j.webp',
      title: tNav('jukebox'),
      desc: tHomeFeatures('jukeboxDesc'),
    },
    {
      to: localeLink(locale, '/scanner/item'),
      img: isDark ? '/img/scanner_dark.webp' : '/img/scanner.webp',
      title: tNav('itemScanner'),
      desc: tHomeFeatures('itemScannerDesc'),
    },
    {
      to: localeLink(locale, '/scanner/student'),
      img: '/img/student-scanner.webp',
      title: tNav('studentScanner'),
      desc: tHomeFeatures('studentScannerDesc'),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Analytics — server toggle + compact rows */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{tCommon('home.analytics')}</span>
          <div className="inline-flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
            {(['jp', 'kr'] as const).map((sv) => (
              <button
                key={sv}
                onClick={() => setServer(sv)}
                className={`px-3 py-1 text-sm font-bold rounded-md transition-all ${
                  server === sv
                    ? 'bg-white dark:bg-neutral-600 text-blue-600 dark:text-blue-300 shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                }`}
              >
                {sv.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {analyticsLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 p-2.5 rounded-sm bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-blue-400 dark:hover:border-blue-500 group"
            >
              <img src={item.img} alt={item.title} className="w-22 h-22 rounded object-cover object-top shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold text-neutral-800 dark:text-neutral-100">
                    <Trans components={[<wbr />]}>{item.title}</Trans>
                  </span>
                  <span className="text-sm font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">{item.badge}</span>
                </div>
                <p className="text-sm text-neutral-400 line-clamp-3 mt-0.5">
                  <Trans components={[<wbr />]}>{item.desc}</Trans>
                </p>
              </div>
              <HiChevronRight className="text-neutral-400 group-hover:text-blue-500 shrink-0 transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      {/* Tools — 3-column cards with screenshot + description */}
      <div>
        <span className="text-sm font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 block mb-6">{tCommon('home.plannersAndTools')}</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {toolCards.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group flex flex-col rounded-sm p-2 border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-blue-400 dark:hover:border-blue-500 overflow-hidden"
            >
              <div className="aspect-video overflow-hidden bg-neutral-50 dark:bg-neutral-900">
                <img src={item.img} alt={item.title} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" />
              </div>
              <div className="p-1.5 mt-3">
                <h3 className="text-base font-bold text-neutral-800 dark:text-neutral-100">
                  <Trans components={[<wbr />]}>{item.title}</Trans>
                </h3>
                <p className="text-sm text-neutral-400 line-clamp-3 mt-1 leading-tight">
                  <Trans components={[<wbr />]}>{item.desc}</Trans>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomeV2() {
  const { locale, jpEvent, glEvent, jpRaid, glRaid, calendarWidgets } = useLoaderData<typeof loader>();
  const { t } = useTranslation('common');
  const { isDark } = useIsDarkState();
  const [calendarServer, setCalendarServer] = useState<GameServer>(locale === 'ja' ? 'jp' : 'kr');

  // return <></>

  return (
    <>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-sky-100 to-neutral-50 dark:from-neutral-800 dark:to-neutral-900" />
        <div className="relative m-auto max-w-7xl px-6 md:py-24 py-20 text-center transition-colors duration-300">
          {/* <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-blue-500 to-cyan-400 mb-2 tracking-tight font-pretendard">{t('title')}</h1>
          <p className="text-base text-neutral-500 dark:text-neutral-400 max-w-xl mx-auto">{t('description')}</p> */}
          <h1 className="text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-blue-500 to-cyan-400 mb-4 tracking-tight font-pretendard">{t('title')}</h1>
          <p className={'text-lg md:text-xl max-w-2xl mx-auto text-neutral-600 dark:text-neutral-300 mb-10 ' + (locale == 'ko' ? 'break-keep' : '')}>{t('description')}</p>
        </div>
      </div>

      <div className="m-auto max-w-7xl px-4 pb-20 -mt-1 space-y-12">
        {/* Status Grid */}
        <section className="pt-1">
          {/* Month-end shop reset warning — client-side only */}
          <MonthEndResetBanner />
          {/* <h2 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-2.5">{t('home.currentStatus')}</h2> */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <RaidCard raid={jpRaid} server="JP" locale={locale} />
            <RaidCard raid={glRaid} server="GL/KR" locale={locale} />
            <EventCard event={jpEvent} server="JP" locale={locale} />
            <EventCard event={glEvent} server="GL/KR" locale={locale} />
          </div>
        </section>

        {/* Birthday */}
        <BirthdayWidget locale={locale} />

        {/* Calendar */}
        <section>
          <div className="flex items-center justify-between mb-6.5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t('home.schedule')}</h2>
            <div className="inline-flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
              {(['jp', 'kr'] as GameServer[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setCalendarServer(s)}
                  className={`px-2.5 py-1 text-sm font-medium rounded-md transition-all ${
                    calendarServer === s
                      ? 'bg-white dark:bg-neutral-600 text-blue-600 dark:text-blue-300 shadow-sm'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                  }`}
                >
                  {s === 'jp' ? 'JP' : 'GL/KR'}
                </button>
              ))}
            </div>
          </div>
          <CalendarWidget key={`${locale}-${calendarServer}`} server={calendarServer} scheduleData={calendarWidgets[calendarServer]} />
        </section>

        {/* Tool Links */}
        <section>
          {/* <h2 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-2.5">{t('home.tools')}</h2> */}
          <ToolLinks locale={locale} isDark={isDark === 'dark'} />
        </section>

        {/* Notice */}
        <section>
          {/* <h2 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-2.5">{t('home.notices')}</h2> */}
          <NoticeWidget />
        </section>

        {/* Changelog */}
        <section>
          <Changelog changelogData={changelogJson} />
        </section>

        <p className="text-center text-xs text-neutral-400 dark:text-neutral-500 pb-4">
          {t('last-update')} <time>{changelogJson[0].date}</time> (JP), 2025-09-09 (KR)
        </p>
      </div>
    </>
  );
}
