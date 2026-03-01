// app/routes/calendar.tsx
import { useEffect, useState } from 'react';
import { useLoaderData, useNavigate, type LoaderFunctionArgs } from 'react-router';
import { useTranslation } from 'react-i18next';
import { type loadScheduleData, type ScheduleItem } from '~/utils/calender.data';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import type { loader as rootLorder } from '~/root';

import { useGanttController } from '~/components/gantt/useGanttController';
import { GanttChart } from '~/components/gantt/GanttChart';
import type { Student, StudentPortraitData } from '~/types/plannerData';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import type { AppHandle } from '~/types/link';
import type { GameServer } from '~/types/data';
import { getInstance } from '~/middleware/i18next';
import type { Route } from './+types/calendar';
import { FiClock } from 'react-icons/fi';
import { localeLink } from '~/utils/localeLink';

// --- 1. Loader: Used only for metadata and parameter validation (heavy data fetching removed) ---
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const server = params.server || 'jp';
  if (server !== 'jp' && server !== 'kr') {
    throw new Response('Not Found: Invalid server parameter.', { status: 404 });
  }

  let i18n = getInstance(context);
  const locale = i18n.language as Locale;

  // 🗑️ loadScheduleData call removed (called via API from the client)

  return {
    server: server as GameServer,
    locale,
    title: i18n.t('calendar:title'),
    description: i18n.t('calendar:description.main'),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title, loaderData.description);
}

export const handle: AppHandle = {
  preload: (data) => {
    const { server, server: loadedServer } = useLoaderData<typeof rootLorder>().params;
    return [
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(data?.locale)}.students.min.json`),
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
        href: `/api/calendar?type=all&server=${loadedServer}&lang=${data?.locale}`,
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      ...createLinkHreflang(`/calendar/${server}`),
    ];
  },
};

// --- 2. Main Component ---
export default function SchedulePageGantt() {
  const { server: loadedServer } = useLoaderData<typeof loader>(); // Removed tracks and timeRange
  const navigate = useNavigate();
  const { i18n, t } = useTranslation('calendar');
  const locale = i18n.language as Locale;

  // State management for overall calendar data retrieved from the API
  const [calendarData, setCalendarData] = useState<Awaited<ReturnType<typeof loadScheduleData>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Data Fetching (Student info and portraits)
  const [studentData, setStudentData] = useState<Record<number, Student> | null>(null);
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData | null>(null);

  useEffect(() => {
    fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`))
      .then((r) => r.json() as any)
      .then(setStudentData)
      .catch(console.error);
    fetch(cdn(`/w/students_portrait.json`))
      .then((r) => r.json() as any)
      .then(setStudentPortraits)
      .catch(console.error);
  }, [locale]);

  // Call the full calendar data API (recall on server/language change)
  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/calendar?type=all&server=${loadedServer}&lang=${locale}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch full calendar data');
        return res.json() as any;
      })
      .then((json) => {
        setCalendarData(json.data); // Assume API response structure is { data: { tracks, timeRange } }
      })
      .catch((err) => console.error('Full calendar data error:', err))
      .finally(() => setIsLoading(false));
  }, [loadedServer, locale]);

  const [birthdayTrackItems, setBirthdayTrackItems] = useState<ScheduleItem[]>([]);
  useEffect(() => {
    if (!studentData || !calendarData?.timeRange?.min) return;

    const items: ScheduleItem[] = [];
    const startYear = new Date(calendarData.timeRange.min).getFullYear();
    const endYear = new Date(calendarData.timeRange.max).getFullYear();
    const MS_PER_HOUR = 1000 * 60 * 60;

    Object.values(studentData).forEach((student) => {
      if (!student.BirthDay || student.Name.includes('(') || student.Name.includes('（')) return;
      const [m, d] = student.BirthDay.split('/').map(Number);
      for (let y = startYear; y <= endYear; y++) {
        const date = new Date(y, m - 1, d);
        if (date.getTime() >= calendarData.timeRange.min && date.getTime() <= calendarData.timeRange.max) {
          items.push({
            id: `bday-${student.Id}-${y}`,
            type: 'birthday',
            startTime: date.toISOString(),
            endTime: new Date(date.getTime() + MS_PER_HOUR * 24).toISOString(),
            textColor: 'text-neutral-900',
            title: student.Name,
            details: { isPointEvent: true, studentId: student.Id },
          });
        }
      }
    });
    setBirthdayTrackItems(items);
  }, [studentData, calendarData?.timeRange]);

  // 4. Gantt Controller Integration (optional chaining applied for initialization after data load)
  const ganttController = useGanttController({
    timeRange: calendarData?.timeRange || { min: 0, max: 1 },
    server: loadedServer,
  });

  // 5. Server Change Handler
  const handleServerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    navigate(localeLink(locale, `/calendar/${e.target.value}`));
  };

  return (
    <div className="w-full bg-white dark:bg-neutral-900 text-gray-900 dark:text-white min-h-screen flex flex-col">
      <div className="px-4 py-6 sm:px-8 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 backdrop-blur-sm top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              {t('title')} <span className="text-blue-600 dark:text-blue-400 uppercase">({loadedServer})</span>
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {t('description.main')} / {t('description.prediction')}
            </p>
          </div>

          <div className="flex items-center gap-3">
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
          {/* Handle loading state */}
          {isLoading || !calendarData ? (
            <div className="flex justify-center items-center h-64 text-neutral-500 animate-pulse">{t('loading', 'Loading calendar data...')}</div>
          ) : (
            <GanttChart
              mode="full"
              data={{
                tracks: calendarData.tracks,
                timeRange: calendarData.timeRange,
                studentData,
                studentPortraits,
                birthdayTrackItems,
              }}
              controller={ganttController}
            />
          )}
        </div>
      </div>
    </div>
  );
}
