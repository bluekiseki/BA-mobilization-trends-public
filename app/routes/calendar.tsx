// app/routes/calendar.tsx
import { useEffect, useState } from 'react';
import { useLoaderData, useNavigate, type LoaderFunctionArgs } from 'react-router';
import { useTranslation } from 'react-i18next';
import { loadScheduleDataV2, type ScheduleItemV2 } from '~/utils/calender.data.v2';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';

import { useGanttController } from '~/components/gantt/useGanttController';
import { useLazySchedule } from '~/components/gantt/useLazySchedule';
import { GanttChart } from '~/components/gantt/GanttChart';
import type { Student, StudentPortraitData } from '~/types/plannerData';
import { createLinkHreflang, createLocalizedUrl, createMetaDescriptor } from '~/components/head';
import { PageHeader } from '~/components/common/PageHeader';
import type { AppHandle } from '~/types/link';
import type { GameServer } from '~/types/data';
import { getInstance } from '~/middleware/i18next';
import type { Route } from './+types/calendar';
import { FiClock } from 'react-icons/fi';
import { localeLink } from '~/utils/localeLink';
import { getItemTitle } from '~/utils/scheduleDisplay';

const SEO_TRACKS = ['event', 'pickup', 'raid', 'multifloor'] as const;

interface CalendarSummaryItem {
  id: string;
  title: string;
  studentIds?: number[];
  typeLabel: string;
  dateLabel: string;
  prediction: boolean;
}

// --- 1. Loader: Validates params and loads locale-independent v2 calendar data ---
export function loader({ context, request }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  const requestedServer = new URL(request.url).searchParams.get('server');
  const defaultServer: GameServer = locale === 'ja' ? 'jp' : 'kr';
  const server: GameServer = requestedServer === 'jp' || requestedServer === 'kr' ? requestedServer : defaultServer;

  const now = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  // Full calendar page only needs a window around "now" up front — the rest loads lazily as the user scrolls (see useLazySchedule).
  // Kept wide enough that jumpToNow's center-viewport scroll doesn't land within the lazy-load edge threshold on first paint.
  const calendarV2 = loadScheduleDataV2({ server, tracksToLoad: 'all', dateRangeMs: { start: now - 120 * MS_PER_DAY, end: now + 240 * MS_PER_DAY } });
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' });
  const upcomingItems: CalendarSummaryItem[] = SEO_TRACKS.flatMap((track) => calendarV2.tracks[track] ?? [])
    .filter((item) => new Date(item.endTime).getTime() >= now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 12)
    .map((item) => {
      const isPickup = item.type === 'pickup';
      const typeLabel =
        item.type === 'raid'
          ? i18n.t('game:raid')
          : item.type === 'eraid'
            ? i18n.t('game:eraid')
            : item.type === 'jointFiringDrill'
              ? i18n.t('game:jfd')
              : item.type === 'event'
                ? i18n.t('game:event')
                : item.type === 'multifloor'
                  ? i18n.t('game:multifloor')
                  : item.type === 'pickup'
                    ? i18n.t('game:pickup')
                    : i18n.t(`calendar:track.${item.type}`);
      return {
        id: item.id,
        title: isPickup ? i18n.t('calendar:track.pickup') : getItemTitle(item, locale, i18n),
        studentIds: isPickup ? item.details?.students?.map((student) => student.id) : undefined,
        typeLabel,
        dateLabel: dateFormatter.format(new Date(item.startTime)),
        prediction: item.details?.prediction === true,
      };
    });

  return {
    server,
    locale,
    title: i18n.t('calendar:title'),
    metaTitle: i18n.t('calendar:metaTitle'),
    description: i18n.t('calendar:description.main'),
    canonicalUrl: createLocalizedUrl(locale, '/calendar'),
    siteTitle: i18n.t('common:title'),
    calendarV2,
    upcomingItems,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(`${loaderData.metaTitle} | ${loaderData.siteTitle}`, loaderData.description, '/img/1.webp', loaderData.canonicalUrl);
}

export const handle: AppHandle = {
  preload: (data: unknown) => {
    const d = data as Record<string, unknown> | undefined;

    const locale = d?.locale as Locale;
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
        rel: 'canonical',
        href: createLocalizedUrl(locale, '/calendar'),
      },
      ...createLinkHreflang('/calendar'),
    ];
  },
};

// --- 2. Main Component ---
export default function SchedulePageGantt() {
  const { server: loadedServer, calendarV2, upcomingItems } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { i18n, t } = useTranslation('calendar');
  useTranslation('jukebox'); // ensure jukebox namespace is loaded for main story items
  const locale = i18n.language as Locale;
  const serverLabel = loadedServer === 'kr' ? 'GL/KR' : 'JP';

  // Loader only sends a window around "now" — fetch more as the user scrolls toward an edge.
  const { data: scheduleData, checkEdges } = useLazySchedule({
    server: loadedServer,
    apiType: 'all',
    initialData: calendarV2,
    resetKey: loadedServer,
  });

  // 1. Data Fetching (Student info and portraits)
  const [studentData, setStudentData] = useState<Record<number, Student> | null>(null);
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData | null>(null);

  useEffect(() => {
    fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`))
      .then((r) => r.json())
      .then((data) => setStudentData(data as Record<number, Student>))
      .catch(console.error);
    fetch(cdn(`/w/students_portrait.json`))
      .then((r) => r.json())
      .then((data) => setStudentPortraits(data as StudentPortraitData))
      .catch(console.error);
  }, [locale]);

  const [birthdayTrackItems, setBirthdayTrackItems] = useState<ScheduleItemV2[]>([]);
  useEffect(() => {
    if (!studentData || !scheduleData.timeRange.min) return;

    const items: ScheduleItemV2[] = [];
    const startYear = new Date(scheduleData.timeRange.min).getFullYear();
    const endYear = new Date(scheduleData.timeRange.max).getFullYear();
    const MS_PER_HOUR = 1000 * 60 * 60;

    Object.values(studentData).forEach((student) => {
      if (!student.BirthDay || student.Name.includes('(') || student.Name.includes('（')) return;
      const [m, d] = student.BirthDay.split('/').map(Number);
      for (let y = startYear; y <= endYear; y++) {
        const date = new Date(y, m - 1, d);
        if (scheduleData.timeRange.min && date.getTime() >= scheduleData.timeRange.min && date.getTime() <= scheduleData.timeRange.max) {
          items.push({
            id: `bday-${student.Id}-${y}`,
            type: 'birthday',
            startTime: date.toISOString(),
            endTime: new Date(date.getTime() + MS_PER_HOUR * 24).toISOString(),
            details: { isPointEvent: true, studentId: student.Id },
          });
        }
      }
    });
    setBirthdayTrackItems(items);
  }, [studentData, scheduleData.timeRange]);

  // 4. Gantt Controller Integration
  const ganttController = useGanttController({
    timeRange: scheduleData.timeRange,
    server: loadedServer,
  });

  useEffect(() => {
    checkEdges(ganttController.scrollLeft, ganttController.viewportWidth, ganttController.pixelsPerHour);
  }, [ganttController.scrollLeft, ganttController.viewportWidth, ganttController.pixelsPerHour, checkEdges]);

  // 5. Server Change Handler
  const handleServerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    void navigate(`${localeLink(locale, '/calendar')}?server=${e.target.value}`);
  };

  return (
    <div className="w-full bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white min-h-screen flex flex-col">
      <div className="px-4 py-6 sm:px-8 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 backdrop-blur-sm top-0 z-40">
        <div className="max-w-7xl mx-auto">
          <PageHeader title={`${t('title')} (${serverLabel})`} description={`${t('description.main')} / ${t('description.prediction')}`} />
          <div className="flex items-center gap-3 mt-3">
            <div className="relative">
              <select
                value={loadedServer}
                onChange={handleServerChange}
                className="appearance-none bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white py-2 pl-4 pr-10 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm transition-all hover:bg-neutral-50 dark:hover:bg-neutral-700"
              >
                <option value="jp">Japan (JP)</option>
                <option value="kr">Global (KR)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-neutral-500">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>

            <button
              onClick={ganttController.jumpToNow}
              title={t('scrollToNow', 'Scroll to current time')}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 active:scale-95"
            >
              <FiClock className="w-4 h-4" />
              <span className="hidden sm:inline">Now</span>
            </button>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="flex-1 w-full max-w-[100vw] overflow-hidden">
        <div className="py-4">
          <GanttChart
            mode="full"
            data={{
              tracks: scheduleData.tracks,
              timeRange: scheduleData.timeRange,
              studentData,
              studentPortraits,
              birthdayTrackItems,
            }}
            controller={ganttController}
          />
        </div>
      </div>
      {upcomingItems.length > 0 && (
        <div className="px-4 pb-6 sm:px-8">
          <details className="border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
            <summary className="cursor-pointer select-none font-medium text-neutral-600 dark:text-neutral-300">
              {t('upcomingTitle')} <span className="text-xs text-neutral-500 dark:text-neutral-400">({serverLabel})</span>
            </summary>
            <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingItems.map((item) => {
                const localizedStudentNames = item.studentIds?.map((studentId) => studentData?.[studentId]?.Name).filter((name): name is string => Boolean(name)) ?? [];
                const displayTitle = item.studentIds && localizedStudentNames.length === item.studentIds.length ? localizedStudentNames.join(', ') : item.title;

                return (
                  <li key={item.id} className="flex min-w-0 items-baseline gap-2">
                    <time className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">{item.dateLabel}</time>
                    <span className="truncate text-neutral-700 dark:text-neutral-300" title={displayTitle}>
                      <span className="text-xs text-neutral-500 dark:text-neutral-500">[{item.typeLabel}]</span> {displayTitle}
                      {item.prediction ? ` ${t('predictionLabel')}` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
