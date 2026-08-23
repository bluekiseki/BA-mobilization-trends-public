// app/routes/planner/EventMainPage.tsx
import { useMemo, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { getlocaleMethond } from '~/components/planner/common/locale';
import { formatInTimeZone } from '~/components/planner/EventInfo';
import eventListJsonRaw from '~/data/jp/eventList.json';
import type { EventEntry, EventListData } from '~/types/eventList';
const eventList = eventListJsonRaw as unknown as EventListData;

import { DEFAULT_LOCALE, type Locale } from '~/utils/i18n/config';
import { createLinkHreflang, createLocalizedUrl, createMetaDescriptor } from '~/components/head';
import { getGlobalEventDates } from '~/data/globalEventDates';
import { getInstance } from '~/middleware/i18next';
import type { Route } from './+types/EventMainPage';
import { localeLink } from '~/utils/localeLink';
import { FaSortAmountUp, FaSortAmountDown } from 'react-icons/fa';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { getKstTime } from '~/data/globalRaidDates';
import { EventCard, type StatusEvent } from '~/components/home/EventStatusCard';
import { PageHeader } from '~/components/common/PageHeader';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName } from '~/utils/i18n/config';
import type { Student, StudentPortraitData } from '~/types/plannerData';
import { type ScheduleTrack } from '~/utils/calender.data';
import { loadScheduleDataV2, type ScheduleItemV2 } from '~/utils/calender.data.v2';
import { RemainingTime } from '~/components/RemainingTime';
import { PickupStudentIcon } from '~/components/planner/PickupStudentIcon';
import { ExportImportPanel } from '~/components/planner/ExportImportPanel';
import { EventTotalItemsPreview } from '~/components/planner/EventTotalItemsPreview';
import { useEventPlanStore } from '~/store/planner/useEventPlanStore';
import type { AppHandle } from '~/types/link';

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  const now = new Date();

  const pickupTracks: ScheduleTrack[] = ['pickup'];
  const pickupScheduleData = {
    jp: loadScheduleDataV2({ server: 'jp', tracksToLoad: pickupTracks }),
    kr: loadScheduleDataV2({ server: 'kr', tracksToLoad: pickupTracks }),
  };

  let jpEvent: StatusEvent | null = null;
  {
    const events = Object.entries(eventList)
      .filter(([, d]) => d.Planable !== false)
      .map(([id, d]) => ({
        id: Number(id),
        name: (d[getlocaleMethond('', 'Jp', locale) as keyof EventEntry] as string | undefined) || d.Jp || `Event ${id}`,
        openTime: new Date(formatInTimeZone(d.OpenTime ?? '')),
        closeTime: new Date(formatInTimeZone(d.CloseTime ?? '')),
      }));
    const current = events.find((e) => now >= e.openTime && now <= e.closeTime);
    if (current) {
      jpEvent = { id: current.id, name: current.name, status: 'active', dateIso: current.closeTime.toISOString() };
    } else {
      const upcoming = events.filter((e) => e.openTime > now).sort((a, b) => a.openTime.getTime() - b.openTime.getTime())[0];
      if (upcoming) jpEvent = { id: upcoming.id, name: upcoming.name, status: 'upcoming', dateIso: upcoming.openTime.toISOString() };
    }
  }

  let glEvent: StatusEvent | null = null;
  {
    const glDates = getGlobalEventDates();
    const processed = Object.entries(glDates).map(([idStr, dates]) => {
      const id = Number(idStr);
      const d = eventList[idStr];
      const name = d ? (d[getlocaleMethond('', 'Jp', locale) as keyof EventEntry] as string | undefined) || d.Jp || `Event ${id}` : `Event ${id}`;
      return { id, name, startTime: new Date(getKstTime(dates.start)), endTime: new Date(getKstTime(dates.end)) };
    });
    const current = processed.find((e) => now >= e.startTime && now <= e.endTime);
    if (current) {
      glEvent = { id: current.id, name: current.name, status: 'active', dateIso: current.endTime.toISOString() };
    } else {
      const upcoming = processed.filter((e) => e.startTime > now).sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0];
      if (upcoming) glEvent = { id: upcoming.id, name: upcoming.name, status: 'upcoming', dateIso: upcoming.startTime.toISOString() };
    }
  }

  return data({
    locale,
    jpEvent,
    glEvent,
    pickupScheduleData,
    siteTitle: i18n.t('common:title'),
    title: i18n.t('planner:page.eventPlanner'),
    description: i18n.t('planner:page.plannerescription'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/p.webp', createLocalizedUrl(loaderData.locale, '/planner/event'));
}

export function links() {
  return [...createLinkHreflang('/planner/event')];
}

export const handle: AppHandle = {
  preload: (data) => {
    const locale = (data as { locale?: Locale })?.locale || DEFAULT_LOCALE;
    return [
      {
        rel: 'canonical',
        href: createLocalizedUrl(locale, '/planner/event'),
      },
    ];
  },
};

export function headers({}: Route.HeadersArgs) {
  if (process.env.NODE_ENV === 'production') return { 'Cache-Control': CACHE_CONTROL_CONFIG };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PickupMode = 'none' | 'jp' | 'kr';
type SortOrder = 'desc' | 'asc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKstShort(isoStr: string): string {
  const d = new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const EventMainPage = () => {
  const { i18n, t: tRaw } = useTranslation('planner');
  const t = tRaw as unknown as (key: string) => string;
  const { t: tc } = useTranslation('common');
  const { t: tg } = useTranslation('game');
  const locale = i18n.language as Locale;
  const { jpEvent, glEvent, pickupScheduleData } = useLoaderData<typeof loader>();
  const plans = useEventPlanStore((state) => state.plans);

  // ── UI controls ────────────────────────────────────────────────────────────
  const [pickupMode, setPickupMode] = useState<PickupMode>(() => (locale === 'ja' ? 'jp' : 'kr'));
  // desc (reverse order): upcoming first, then recent→old past
  // asc (chronological order): old→recent past first, then upcoming
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => (locale === 'ja' ? 'desc' : 'asc'));
  const [showGains, setShowGains] = useState(false);

  // ── Pickup data (lazy — portraits only) ───────────────────────────────────
  const [studentData, setStudentData] = useState<Record<number, Student> | null>(null);
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData | null>(null);
  const [pickupLoading, setPickupLoading] = useState(true);
  const [loadedForLocale, setLoadedForLocale] = useState<string | null>(null);

  useEffect(() => {
    if (pickupMode === 'none') return;
    if (loadedForLocale === locale) return;

    setPickupLoading(true);
    Promise.all([fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)).then((r) => r.json()), fetch(cdn('/w/students_portrait.json')).then((r) => r.json())])
      .then(([students, portraits]) => {
        setStudentData(students as Record<number, Student>);
        setStudentPortraits(portraits as StudentPortraitData);
        setLoadedForLocale(locale);
      })
      .catch(console.error)
      .finally(() => setPickupLoading(false));
  }, [pickupMode, locale, loadedForLocale]);

  // ── Event data ─────────────────────────────────────────────────────────────
  const now = useMemo(() => new Date(), []);

  const allEvents = useMemo(() => {
    return Object.entries(eventList)
      .filter(([, d]) => d.Planable != false)
      .map(([id, d]) => ({
        id: Number(id),
        name: (d[getlocaleMethond('', 'Jp', locale) as keyof typeof d] as string | undefined) || d.Jp || `Event ${id}`,
        openTime: new Date(formatInTimeZone(d.OpenTime)),
        closeTime: new Date(formatInTimeZone(d.CloseTime)),
      }));
  }, [locale]);

  // Upcoming: active or future, sorted ascending (nearest first)
  const upcomingEvents = useMemo(() => allEvents.filter((e) => e.closeTime >= now).sort((a, b) => a.openTime.getTime() - b.openTime.getTime()), [allEvents, now]);

  // Past: fully ended, sorted descending (most recent first)
  const pastEvents = useMemo(() => allEvents.filter((e) => e.closeTime < now).sort((a, b) => b.openTime.getTime() - a.openTime.getTime()), [allEvents, now]);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [visiblePastCount, setVisiblePastCount] = useState(() => {
    if (!glEvent || glEvent.status !== 'active') return 10;
    const idx = pastEvents.findIndex((e) => e.id === glEvent.id);
    return Math.max(10, idx + 1);
  });

  // Past events ordered according to sortOrder
  const displayedPastEvents = useMemo(() => {
    if (sortOrder === 'asc') {
      // Oldest first: reverse the descending array, then slice from the newest end
      // so "Load more" reveals progressively older events above
      return [...pastEvents].reverse().slice(Math.max(0, pastEvents.length - visiblePastCount));
    }
    // desc: most recent first
    return pastEvents.slice(0, visiblePastCount);
  }, [pastEvents, sortOrder, visiblePastCount]);

  // ── GL/KR dates ────────────────────────────────────────────────────────────
  const glDates = getGlobalEventDates();
  const isJpActive = (id: number) => jpEvent?.status === 'active' && jpEvent.id === id;
  const isGlActive = (id: number) => glEvent?.status === 'active' && glEvent.id === id;

  // ── Gains aggregate (all events with cached data) ──────────────────────────
  const aggregatedItems = useMemo(() => {
    if (!showGains) return null;
    const gained: Record<string, { amount: number; isBonusApplied: boolean }> = {};
    const spent: Record<string, { amount: number; isBonusApplied: boolean }> = {};
    let availableAp = 0;
    allEvents.forEach((event) => {
      const cached = plans[event.id]?.cachedTotalItems;
      if (!cached) return;
      Object.entries(cached.gained).forEach(([key, data]) => {
        gained[key] = { amount: (gained[key]?.amount ?? 0) + data.amount, isBonusApplied: data.isBonusApplied || (gained[key]?.isBonusApplied ?? false) };
      });
      Object.entries(cached.spent).forEach(([key, data]) => {
        spent[key] = { amount: (spent[key]?.amount ?? 0) + data.amount, isBonusApplied: data.isBonusApplied || (spent[key]?.isBonusApplied ?? false) };
      });
      availableAp += cached.availableAp;
    });
    return Object.keys(gained).length > 0 || Object.keys(spent).length > 0 || availableAp > 0 ? { gained, spent, availableAp } : null;
  }, [showGains, plans, allEvents]);

  // ── Pickup lookup ──────────────────────────────────────────────────────────
  const calPickups = useMemo(() => {
    if (pickupMode === 'none') return [];
    return pickupScheduleData[pickupMode].tracks.pickup ?? [];
  }, [pickupScheduleData, pickupMode]);

  const getPickupsForEvent = useCallback(
    (eventId: number, jpOpenTime: Date, jpCloseTime: Date): ScheduleItemV2[] => {
      let openMs: number;
      let closeMs: number;
      if (pickupMode === 'kr') {
        const glInfo = glDates[eventId];
        if (!glInfo) return [];
        openMs = getKstTime(glInfo.start);
        closeMs = getKstTime(glInfo.end);
      } else {
        openMs = jpOpenTime.getTime();
        closeMs = jpCloseTime.getTime();
      }
      return calPickups.filter((p) => {
        const pStart = new Date(p.startTime).getTime();
        const pEnd = new Date(p.endTime).getTime();
        return pStart < closeMs && pEnd > openMs;
      });
    },
    [calPickups, pickupMode, glDates],
  );

  // ── Event row ──────────────────────────────────────────────────────────────
  const renderEvent = (event: { id: number; name: string; openTime: Date; closeTime: Date }) => {
    const jpActive = isJpActive(event.id);
    const glActive = isGlActive(event.id);
    const isActive = jpActive || glActive;
    const glInfo = glDates[event.id];
    const glStart = glInfo ? formatInTimeZone(glInfo.start) : null;
    const glEnd = glInfo ? formatInTimeZone(glInfo.end) : null;
    const pickups = pickupMode !== 'none' ? getPickupsForEvent(event.id, event.openTime, event.closeTime) : [];

    return (
      <div key={event.id} className="relative pl-4 group">
        <div
          className={`absolute -left-3.5 top-2 w-2.5 h-2.5 rounded-full border-2 transition-colors ${
            isActive ? 'bg-green-400 dark:bg-green-500 border-white dark:border-neutral-900' : 'bg-neutral-300 dark:bg-neutral-600 border-white dark:border-neutral-800 group-hover:bg-blue-400'
          }`}
        />

        <Link to={localeLink(locale, `/planner/event/${event.id % 100000}`)} className="block">
          <div
            className={`text-sm font-medium transition-colors flex items-center gap-1.5 ${
              isActive ? 'text-neutral-800 dark:text-neutral-100' : 'text-neutral-700 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400'
            }`}
          >
            <span className="line-clamp-1">
              {((event.id / 10000) | 0) == 1 ? `[${tg('rerun')}] ` : ''}
              {event.name}
            </span>
            {jpActive && <span className="text-[9px] font-black px-1 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 shrink-0">JP</span>}
            {glActive && <span className="text-[9px] font-black px-1 py-0.5 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">GL/KR</span>}
          </div>

          <div suppressHydrationWarning className="mt-0.5 flex items-center flex-wrap gap-x-2 text-[10px]">
            {pickupMode === 'none' ? (
              // Default mode: show both JP and GL/KR dates with active highlighting
              <>
                <span suppressHydrationWarning className={`whitespace-nowrap ${jpActive ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
                  <span className="font-bold mr-0.5">JP</span>
                  {event.openTime.toLocaleDateString()}
                </span>
                {glInfo && glStart && (
                  <span
                    className={`whitespace-nowrap ${glActive ? 'font-bold text-blue-600 dark:text-blue-400' : glInfo.prediction ? 'text-neutral-400 italic' : 'text-neutral-400 dark:text-neutral-500'}`}
                  >
                    <span className="font-bold mr-0.5">GL</span>
                    {glStart.toLocaleDateString()}
                    {glInfo.prediction && <span className="ml-0.5 text-[8px] border border-neutral-300 dark:border-neutral-600 px-0.5 rounded font-normal">{tc('pred')}</span>}
                  </span>
                )}
              </>
            ) : pickupMode === 'kr' ? (
              // GL/KR pickup mode: show GL/KR date range + remaining time
              glInfo && glStart && glEnd ? (
                <>
                  <span suppressHydrationWarning className={`whitespace-nowrap ${glActive ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
                    {glStart.toLocaleDateString()} {t('ui.dateSeparator')} {glEnd.toLocaleDateString()}
                    {glInfo.prediction && <span className="ml-0.5 text-[8px] border border-neutral-300 dark:border-neutral-600 px-0.5 rounded font-normal">{tc('pred')}</span>}
                  </span>
                  <RemainingTime
                    targetDate={glActive ? new Date(getKstTime(glInfo.end)) : new Date(getKstTime(glInfo.start))}
                    isUpcoming={!glActive}
                    compact
                    className="text-neutral-400 dark:text-neutral-500"
                  />
                </>
              ) : null
            ) : (
              // JP pickup mode: show JP date range + remaining time
              <>
                <span suppressHydrationWarning className={`whitespace-nowrap ${jpActive ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
                  {event.openTime.toLocaleDateString()} {t('ui.dateSeparator')} {event.closeTime.toLocaleDateString()}
                </span>
                <RemainingTime targetDate={jpActive ? event.closeTime : event.openTime} isUpcoming={!jpActive} compact className="text-neutral-400 dark:text-neutral-500" />
              </>
            )}
          </div>
        </Link>

        {/* Cached gains/losses from event plan */}
        {showGains &&
          (() => {
            const items = plans[event.id]?.cachedTotalItems;
            return items && <EventTotalItemsPreview cachedTotalItems={items} />;
          })()}

        {/* Pickup students — each pickup on its own row when dates differ */}
        {!showGains && pickupMode !== 'none' && pickupLoading && pickups.length > 0 && (
          <div className="mt-1.5 space-y-1.5">
            {pickups.map((pickup) => {
              const count = pickup.details?.students?.length ?? 3;
              const HOUR_MS = 60 * 60 * 1000;
              const eStartMs = pickupMode === 'kr' && glInfo ? getKstTime(glInfo.start) : event.openTime.getTime();
              const eEndMs = pickupMode === 'kr' && glInfo ? getKstTime(glInfo.end) : event.closeTime.getTime();
              const isDifferentPeriod = Math.abs(new Date(pickup.startTime).getTime() - eStartMs) > HOUR_MS || Math.abs(new Date(pickup.endTime).getTime() - eEndMs) > HOUR_MS;
              return (
                <div key={pickup.id}>
                  {isDifferentPeriod && <div className="h-3 mb-0.5" />}
                  <div className="flex gap-1.5 flex-wrap">
                    {Array.from({ length: count }, (_, i) => (
                      <div key={i} className="w-14 h-14 rounded-lg bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!showGains && pickupMode !== 'none' && !pickupLoading && pickups.length > 0 && (
          <div className="mt-1.5 space-y-1.5">
            {pickups.map((pickup) => {
              const students = pickup.details?.students ?? [];
              const HOUR_MS = 60 * 60 * 1000;
              const pStart = new Date(pickup.startTime).getTime();
              const pEnd = new Date(pickup.endTime).getTime();
              const eStart = pickupMode === 'kr' && glInfo ? getKstTime(glInfo.start) : event.openTime.getTime();
              const eEnd = pickupMode === 'kr' && glInfo ? getKstTime(glInfo.end) : event.closeTime.getTime();
              const isDifferentPeriod = Math.abs(pStart - eStart) > HOUR_MS || Math.abs(pEnd - eEnd) > HOUR_MS;
              return (
                <div key={pickup.id}>
                  {isDifferentPeriod && (
                    <p suppressHydrationWarning className="text-[9px] text-neutral-400 dark:text-neutral-500 mb-0.5">
                      {formatKstShort(pickup.startTime)} {t('ui.dateSeparator')} {formatKstShort(pickup.endTime)}
                    </p>
                  )}
                  <div className="flex items-end gap-1.5 flex-wrap">
                    {students.map((s) => {
                      const portrait = studentPortraits?.[s.id];
                      const name = studentData?.[s.id]?.Name ?? String(s.id);
                      const bulletType = studentData?.[s.id]?.BulletType;
                      return (
                        <PickupStudentIcon key={s.id} portrait={portrait} name={name} studentId={s.id} rerun={s.rerun} fest={s.fest} limited={s.limited} bulletType={bulletType} locale={locale} />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Rendering ──────────────────────────────────────────────────────────────
  const orderedPast = displayedPastEvents;
  const showMorePast = visiblePastCount < pastEvents.length;

  // In asc mode: past (old→recent) at top, upcoming at bottom
  // In desc mode: upcoming at top, past (recent→old) at bottom
  const topSection = sortOrder === 'asc' ? orderedPast : upcomingEvents;
  const bottomSection = sortOrder === 'asc' ? upcomingEvents : orderedPast;

  return (
    <>
      <div className="px-4 sm:px-6 py-8">
        <PageHeader title={t('page.eventPlanner')} description={t('app.description')} />

        {/* Current event cards */}
        <section className="mb-6 mt-2">
          <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-3">{t('ui.currentEvent')}</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <EventCard event={jpEvent} server="JP" locale={locale} />
            <EventCard event={glEvent} server="GL/KR" locale={locale} />
          </div>
        </section>

        {/* Controls row */}
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          {/* Pickup mode */}
          <div className="flex gap-1">
            {(['none', 'kr', 'jp'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setPickupMode(mode)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                  pickupMode === mode ? 'bg-blue-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                {mode === 'none' ? t('ui.noPickup') : mode === 'kr' ? 'GL/KR' : 'JP'}
              </button>
            ))}
            {pickupLoading && <span className="text-xs text-neutral-400 dark:text-neutral-500 self-center animate-pulse ml-1">{t('ui.loadingData')}</span>}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            {/* Gains mode toggle */}
            <button
              onClick={() => setShowGains((v) => !v)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded transition-colors ${
                showGains ? 'bg-blue-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              <input type="checkbox" checked={showGains} readOnly tabIndex={-1} className="pointer-events-none w-3 h-3 shrink-0" />
              {t('ui.gainsMode')}
            </button>

            {/* Sort order toggle */}
            <button
              onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              {sortOrder === 'desc' ? <FaSortAmountDown className="w-3 h-3" /> : <FaSortAmountUp className="w-3 h-3" />}
              {sortOrder === 'desc' ? t('ui.sortDescLabel') : t('ui.sortAscLabel')}
            </button>
          </div>
        </div>

        {/* Gains aggregate summary */}
        {showGains && (
          <div className="mb-6 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3">
            <h2 className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-2">{t('ui.gainsTotal')}</h2>
            {aggregatedItems ? (
              <EventTotalItemsPreview cachedTotalItems={{ savedAt: 0, ...aggregatedItems }} />
            ) : (
              <p className="text-xs text-neutral-400 dark:text-neutral-500">{t('ui.gainsNoData')}</p>
            )}
          </div>
        )}

        {/* "Load more" at top in asc mode */}
        {sortOrder === 'asc' && showMorePast && (
          <div className="flex gap-2 mb-3 pl-6">
            <button onClick={() => setVisiblePastCount((n) => n + 10)} className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {t('ui.showMore')}
            </button>
            <span className="text-neutral-300 dark:text-neutral-600">·</span>
            <button onClick={() => setVisiblePastCount(pastEvents.length)} className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {t('ui.showAll')}
            </button>
          </div>
        )}

        {/* Unified event list */}
        <div className="space-y-3 pl-2 border-l-2 border-neutral-100 dark:border-neutral-700 ml-2">
          {topSection.map(renderEvent)}
          {bottomSection.map(renderEvent)}
        </div>

        {/* "Load more" at bottom in desc mode */}
        {sortOrder === 'desc' && showMorePast && (
          <div className="flex gap-2 mt-4 pl-6">
            <button onClick={() => setVisiblePastCount((n) => n + 10)} className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {t('ui.showMore')}
            </button>
            <span className="text-neutral-300 dark:text-neutral-600">·</span>
            <button onClick={() => setVisiblePastCount(pastEvents.length)} className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {t('ui.showAll')}
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-700">
        <ExportImportPanel />
      </div>
    </>
  );
};

export default EventMainPage;
