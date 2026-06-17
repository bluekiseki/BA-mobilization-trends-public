import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import type { Student, StudentPortraitData } from '~/types/plannerData';
import type { GameServer } from '~/types/data';
import { type loadScheduleData } from '~/utils/calender.data';

import { useGanttController } from '~/components/gantt/useGanttController';
import { GanttChart } from '~/components/gantt/GanttChart';
import { FiArrowRight } from 'react-icons/fi';
import { localeLink } from '~/utils/localeLink';

// --- 2. Widget Component ---
interface CalendarWidgetProps {
  server: GameServer;
}

export function CalendarWidget({ server }: CalendarWidgetProps) {
  const { t, i18n } = useTranslation('calendar');
  const locale = i18n.language as Locale;

  const [widgetData, setWidgetData] = useState<Awaited<ReturnType<typeof loadScheduleData>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [studentData, setStudentData] = useState<Record<number, Student> | null>(null);
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData | null>(null);

  // 1. Widget data API call (re-called whenever server or language changes)
  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/calendar?type=widget&server=${server}&lang=${locale}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch widget data');
        return res.json();
      })
      .then((json: unknown) => {
        // Assumes API response structure is { data: { tracks, timeRange } }
        const data = json as { data: Awaited<ReturnType<typeof loadScheduleData>> };
        setWidgetData(data.data);
      })
      .catch((err: unknown) => {
        console.error('Calendar data error:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [server, locale]);

  // loaderData: Awaited<ReturnType<typeof loadCalendarWidgetData>>;

  // 2. Fetch student data
  useEffect(() => {
    fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`))
      .then((r) => r.json())
      .then((data: unknown) => {
        setStudentData(data as Record<number, Student>);
      })
      .catch((err: unknown) => {
        console.error(err);
      });
    fetch(cdn(`/w/students_portrait.json`))
      .then((r) => r.json())
      .then((data: unknown) => {
        setStudentPortraits(data as StudentPortraitData);
      })
      .catch((err: unknown) => {
        console.error(err);
      });
  }, [locale]);

  // Set up GanttController
  // Handle optional chaining since timeRange is missing during loading
  const ganttController = useGanttController({
    timeRange: widgetData?.timeRange || { min: 0, max: 1 },
    server,
  });

  if (!widgetData) {
    return (
      <div className="w-full h-132 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-center">
        <span className="text-neutral-400 animate-pulse">{t('loading', { defaultValue: 'Loading calendar...' })}</span>
      </div>
    );
  }

  return (
    <div
      className={`w-full bg-white dark:bg-neutral-900 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-sm transition-opacity duration-300 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
    >
      <div className="pb-2">
        <GanttChart
          data={{
            tracks: widgetData.tracks,
            timeRange: widgetData.timeRange,
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
          to={localeLink(locale, `/calendar/${server}`)}
          className="group flex items-center gap-2 text-sm font-bold text-neutral-700 dark:text-neutral-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <span>{t('widget.view-more', { defaultValue: 'Full Schedule' })}</span>
          <FiArrowRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
        </Link>
      </div>
    </div>
  );
}
