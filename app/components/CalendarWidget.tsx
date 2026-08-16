import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import type { Student, StudentPortraitData } from '~/types/plannerData';
import type { GameServer } from '~/types/data';
import type { loadScheduleDataV2 } from '~/utils/calender.data.v2';

import { useGanttController } from '~/components/gantt/useGanttController';
import { useLazySchedule } from '~/components/gantt/useLazySchedule';
import { GanttChart } from '~/components/gantt/GanttChart';
import { FiArrowRight } from 'react-icons/fi';
import { localeLink } from '~/utils/localeLink';

// --- 2. Widget Component ---
export type CalendarWidgetData = ReturnType<typeof loadScheduleDataV2>;

interface CalendarWidgetProps {
  server: GameServer;
  scheduleData: CalendarWidgetData;
}

export function CalendarWidget({ server, scheduleData: initialScheduleData }: CalendarWidgetProps) {
  const { t, i18n } = useTranslation('calendar');
  const locale = i18n.language as Locale;

  const [studentData, setStudentData] = useState<Record<number, Student> | null>(null);
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData | null>(null);

  // 1. Fetch student data
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

  // Loader only sends a narrow window around "now" — fetch more as the user scrolls toward an edge.
  const { data: scheduleData, checkEdges } = useLazySchedule({
    server,
    apiType: 'widget',
    initialData: initialScheduleData,
    resetKey: server,
  });

  // Set up GanttController
  const ganttController = useGanttController({
    timeRange: scheduleData.timeRange,
    server,
  });

  useEffect(() => {
    checkEdges(ganttController.scrollLeft, ganttController.viewportWidth, ganttController.pixelsPerHour);
  }, [ganttController.scrollLeft, ganttController.viewportWidth, ganttController.pixelsPerHour, checkEdges]);

  return (
    <div className="w-full bg-white dark:bg-neutral-900 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-sm transition-opacity duration-300">
      <div className="pb-2">
        <GanttChart
          data={{
            tracks: scheduleData.tracks,
            timeRange: scheduleData.timeRange,
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
          to={`${localeLink(locale, '/calendar')}?server=${server}`}
          className="group flex items-center gap-2 text-sm font-bold text-neutral-700 dark:text-neutral-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <span>{t('widget.view-more', { defaultValue: 'Full Schedule' })}</span>
          <FiArrowRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
        </Link>
      </div>
    </div>
  );
}
