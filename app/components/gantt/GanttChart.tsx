import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FiZoomIn, FiZoomOut } from 'react-icons/fi';
import type { Student, StudentPortraitData } from '~/types/plannerData';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import type { Locale } from '~/utils/i18n/config';
import { MS_PER_HOUR, BASE_PIXELS_PER_HOUR, CAMPAIGN_COLORS } from './constants';
import { GanttTrack } from './GanttRenderers';
import type { GanttControllerReturn } from './useGanttController';

interface WeeklyMarker {
  left: number;
  label: string;
  date: string;
}

interface MonthlyMarker {
  left: number;
  label: string;
  date: string;
  isYearMarker: boolean;
}

export interface GanttChartProps {
  // 1. Data Props
  data: {
    tracks: Record<string, ScheduleItemV2[]>;
    timeRange: { min: number; max: number };
    studentData: Record<number, Student> | null;
    studentPortraits: StudentPortraitData | null;
    birthdayTrackItems: ScheduleItemV2[];
  };

  // 2. Controller Props (Spread Object)
  controller: GanttControllerReturn;

  // 3. Display Mode
  mode: 'full' | 'widget';
  className?: string;
}

export function GanttChart({ data, controller, mode, className }: GanttChartProps) {
  const { t: t_cal } = useTranslation(['calendar', 'game']);
  const { t: t_ui } = useTranslation('ui');
  const { t: t_g } = useTranslation('game');
  const locale = useTranslation().i18n.language as Locale;
  const [hoverInfo, setHoverInfo] = useState<{ time: string; x: number; y: number } | null>(null);

  // Destructure controller for easier usage
  const { scrollContainerRef, calculateLeftPx, calculateWidthPx, scrollLeft, viewportWidth, pixelsPerHour, markers, nowMarkerLeft, zoomIn, zoomOut } = controller;

  const { tracks, timeRange, studentData, studentPortraits, birthdayTrackItems } = data;

  const totalWidth = ((timeRange.max - timeRange.min) / MS_PER_HOUR) * pixelsPerHour;

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = scrollContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const ms = ((scrollLeft + x) / pixelsPerHour) * MS_PER_HOUR;

    setHoverInfo({
      time: new Date(timeRange.min + ms).toLocaleString(locale, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      x: e.clientX,
      y: e.clientY,
    });
  };

  const commonProps = {
    calculateLeftPx,
    calculateWidthPx,
    studentData,
    studentPortraits,
    scrollLeft,
    viewportWidth,
    pixelsPerHour,
  };

  return (
    <div className={`relative group ${className || ''}`}>
      {/* Zoom Controls */}
      <div className="absolute top-2 right-2 z-20 flex flex-col gap-1 shadow-lg bg-white/90 dark:bg-neutral-800/90 rounded-lg p-1 border border-neutral-200 dark:border-neutral-700 backdrop-blur-sm touch-manipulation">
        <button onClick={zoomIn} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-md text-neutral-600 dark:text-neutral-300 transition-colors">
          <FiZoomIn className="w-4 h-4" />
        </button>
        <div className="h-px bg-neutral-200 dark:bg-neutral-700 mx-1" />
        <button onClick={zoomOut} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-md text-neutral-600 dark:text-neutral-300 transition-colors">
          <FiZoomOut className="w-4 h-4" />
        </button>
      </div>

      {/* Hover Tooltip */}
      {hoverInfo && (
        <div
          className="fixed z-50 px-1.5 py-0.5 bg-neutral-900/95 text-white rounded-xs text-[10px] font-mono pointer-events-none shadow-sm backdrop-blur-sm border border-white/10"
          style={{ top: hoverInfo.y + 10, left: hoverInfo.x + 10 }}
        >
          {hoverInfo.time}
        </div>
      )}

      {/* Main Scroll Container */}
      <div ref={scrollContainerRef} className="w-full overflow-x-auto border-y border-neutral-200 dark:border-neutral-800 select-none custom-scrollbar touch-[pan-x_pan-y] overscroll-x-none">
        <div className="relative" style={{ width: `${totalWidth}px` }} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverInfo(null)}>
          {/* Grid Layer */}
          {/* Markers: local timezone (suppressHydrationWarning for UTC↔client mismatch) */}
          <div className="absolute inset-0 pointer-events-none">
            {markers.daily.map((left, i) => (
              <div key={`d-${i}`} className="absolute top-0 h-full border-l border-dashed border-neutral-200 dark:border-neutral-800" style={{ left }} suppressHydrationWarning />
            ))}

            {markers.weekly.map((m: WeeklyMarker) => (
              <div key={m.date} className="absolute top-0 h-full border-l border-neutral-300 dark:border-neutral-600 z-0" style={{ left: m.left }} suppressHydrationWarning>
                <span
                  className="sticky top-8 -ml-1 text-[10px] font-bold text-neutral-500 dark:text-neutral-400 bg-white/80 dark:bg-black/80 px-1 rounded shadow-xs truncate max-w-20"
                  suppressHydrationWarning
                >
                  {m.label}
                </span>
              </div>
            ))}

            {/* 3. Monthly Markers */}
            {markers.monthly.map((m: MonthlyMarker) => (
              <div
                key={m.date}
                className={`absolute top-0 h-full border-l-2 ${m.isYearMarker ? 'border-neutral-500' : 'border-neutral-400 dark:border-neutral-500'} z-0`}
                style={{ left: m.left }}
                suppressHydrationWarning
              >
                <span className="sticky top-0 -ml-1 text-xs font-black p-1 text-neutral-900 dark:text-neutral-100 bg-white/90 dark:bg-black/90 rounded-br shadow-sm" suppressHydrationWarning>
                  {m.label}
                </span>
              </div>
            ))}

            {nowMarkerLeft !== null && (
              <div className="absolute top-0 h-full w-0.5 bg-red-500 z-30 shadow-[0_0_8px_rgba(239,68,68,0.6)]" style={{ left: nowMarkerLeft }}>
                <div className="sticky top-0 -ml-8 text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-sm">NOW</div>
              </div>
            )}
          </div>

          {/* Tracks Layer */}
          <div className="py-6 space-y-3">
            <GanttTrack title={'' /*t_cal('track.raid')*/} items={tracks.raid || []} {...commonProps} />
            <GanttTrack title={'' /*t_cal('game:event')*/} items={tracks.event || []} {...commonProps} />
            <GanttTrack title={t_g('campaign')} items={tracks.campaign || []} colorMap={CAMPAIGN_COLORS} colorKey="campaignType" laneHeight={32} {...commonProps} />
            <GanttTrack title={t_g('pickup')} items={tracks.pickup || []} {...commonProps} />

            {mode === 'full' && (
              <>
                <GanttTrack title={t_g('multifloor')} items={tracks.multifloor || []} {...commonProps} />
                <GanttTrack title={t_cal('track.birthday')} items={birthdayTrackItems} laneHeight={32} {...commonProps} />
                <GanttTrack title={t_g('story')} items={[...(tracks.mainstory || []), ...(tracks.ministory || [])]} {...commonProps} />
                <GanttTrack title={t_cal('track.patch')} items={tracks.patch || []} laneHeight={32} {...commonProps} />
                <GanttTrack title={t_ui('etc')} items={tracks.misc || []} laneHeight={32} {...commonProps} />
                <GanttTrack title={t_cal('track.maintenance')} items={tracks.maintenance || []} {...commonProps} />
              </>
            )}
          </div>
        </div>
      </div>
      {/* Set initial scroll position (centered on "now") before React hydration */}
      {timeRange.min > 0 && (
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){
              var el = document.currentScript.previousElementSibling;
              if (!el) return;
              var min = ${JSON.stringify(timeRange.min)};
              var pxPerHour = ${JSON.stringify(BASE_PIXELS_PER_HOUR)};
              var targetPx = ((Date.now() - min) / 3600000) * pxPerHour;
              el.scrollLeft = Math.max(0, targetPx - el.clientWidth / 2);
            })();`,
          }}
        />
      )}
    </div>
  );
}
