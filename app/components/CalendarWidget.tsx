// app/components/CalendarWidget.tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, type LoaderFunctionArgs } from 'react-router';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import type { Student, StudentPortraitData } from '~/types/plannerData';
import type { GameServer } from '~/types/data';
import { loadScheduleData, type ScheduleTrack } from '~/utils/calender.data';
import { getInstance } from '~/middleware/i18next';

// Refactored Imports
import { useGanttController } from '~/components/gantt/useGanttController';
import { GanttChart } from '~/components/gantt/GanttChart';
import { FiArrowRight } from 'react-icons/fi';
import { localeLink } from '~/utils/localeLink';

// --- 1. Loader Function (Must stay here for Home compatibility) ---
export async function loadCalendarWidgetData(context: LoaderFunctionArgs['context'], server: GameServer) {
  if (server !== 'jp' && server !== 'kr') {
    throw new Response('Not Found: Invalid server parameter.', { status: 404 });
  }

  let i18n = getInstance(context);
  const locale = i18n.language as Locale;

  // Widget mode: Load only 4 tracks
  const widgetTracks: ScheduleTrack[] = ['raid', 'event', 'campaign', 'pickup'];

  const data = await loadScheduleData({
    server: server as 'jp' | 'kr',
    locale,
    i18n,
    tracksToLoad: widgetTracks,
  });

  return data; // { tracks, timeRange }
}

// --- 2. Widget Component ---
interface CalendarWidgetProps {
  loaderData: Awaited<ReturnType<typeof loadCalendarWidgetData>>;
  server: GameServer;
}

export function CalendarWidget({ loaderData, server }: CalendarWidgetProps) {
  const { tracks, timeRange } = loaderData;
  const { t, i18n } = useTranslation('calendar');
  const locale = i18n.language as Locale;

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

  // Use the Shared Controller
  const ganttController = useGanttController({ timeRange, server });

  return (
    <div className="w-full bg-white dark:bg-neutral-900 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-sm">
      <div className="pb-2">
        <GanttChart
          // tracks={tracks}
          // timeRange={timeRange}
          // studentData={studentData}
          // studentPortraits={studentPortraits}
          // birthdayTrackItems={[]} // Widget doesn't show birthdays
          data={{
            tracks,
            timeRange,
            studentData,
            studentPortraits,
            birthdayTrackItems: [],
          }}
          mode="widget"
          controller={ganttController}
        />
      </div>

      <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center bg-neutral-50/50 dark:bg-neutral-800/30">
        <button onClick={ganttController.jumpToNow} className="text-xs font-semibold text-neutral-500 hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400 transition-colors">
          {t('scrollToNow')}
        </button>

        <Link
          to={localeLink(locale, '/calendar')}
          className="group flex items-center gap-2 text-sm font-bold text-neutral-700 dark:text-neutral-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <span>{t('widget.view-more', { defaultValue: 'Full Schedule' })}</span>
          <FiArrowRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
        </Link>
      </div>
    </div>
  );
}
