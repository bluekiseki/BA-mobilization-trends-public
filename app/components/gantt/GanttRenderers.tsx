import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { FaShield } from 'react-icons/fa6';
import { FiSearch } from 'react-icons/fi';

import { TerrainIconGameStyle, type Terrain } from '~/components/raid/teran';
import type { PickupStudentInfo, ScheduleItem, ScheduleItemDetails } from '~/utils/calender.data';
import type { Student, StudentPortraitData } from '~/types/plannerData';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';

import { TRACK_COLORS, CAMPAIGN_COLORS, STRIPE_PATTERN_STYLE, MS_PER_HOUR } from './constants';

// --- Types ---
type CalcLeftFunc = (start: string) => number;
type CalcWidthFunc = (start: string, end: string) => number;

interface GanttRenderProps {
  item: ScheduleItem;
  calculateLeftPx: CalcLeftFunc;
  calculateWidthPx: CalcWidthFunc;
  studentData: Record<number, Student> | null;
  studentPortraits: StudentPortraitData | null;
  lane: number;
  laneHeight: number;
  colorMap?: Record<string, string>;
  colorKey?: string;
}

interface GanttTrackProps {
  title: string;
  items: ScheduleItem[];
  calculateLeftPx: CalcLeftFunc;
  calculateWidthPx: CalcWidthFunc;
  studentData: Record<number, Student> | null;
  studentPortraits: StudentPortraitData | null;
  scrollLeft: number;
  viewportWidth: number;
  colorMap?: Record<string, string>;
  colorKey?: string;
  laneHeight?: number;
}

// --- 1. Armor Icon (Modernized) ---
const ARMOR_COLORS: Record<string, string> = {
  LightArmor: '#ef4444', // Red-500
  HeavyArmor: '#eab308', // Yellow-500
  Unarmed: '#3b82f6', // Blue-500 (Special)
  ElasticArmor: '#a855f7', // Purple-500
  CompositeArmor: '#137973',
  Normal: '#94a3b8', // Slate-400
  Structure: '#22c55e', // Green-500
};

const formatDateTimeShort = (dateStr: string) => {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const getDynamicStyle = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hueRotate = (hash % 30) - 15;

  const brightness = 0.9 + Math.abs((hash % 20) / 100);

  const deg = 120 + (Math.abs(hash) % 40);

  return {
    filter: `hue-rotate(${hueRotate}deg) brightness(${brightness})`,

    backgroundImage: `linear-gradient(${deg}deg, rgba(255,255,255,0.1), rgba(0,0,0,0.1))`,
  };
};

function ArmorIcon({ armorType, difficulty }: { armorType: string; difficulty?: string | null }) {
  const color = ARMOR_COLORS[armorType] || '#94a3b8';
  const difficultyInitial = difficulty ? difficulty.substring(0, 1).toUpperCase() : null;
  return (
    <span className="relative inline-flex items-center justify-center w-4 h-4  rounded-full ml-0 shrink-0" title={armorType}>
      <FaShield style={{ color }} className="w-3.5 h-3.5" />
      {difficultyInitial && (
        <span className="absolute text-[8px] font-black text-white drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]" style={{ lineHeight: 1 }}>
          {difficultyInitial}
        </span>
      )}
    </span>
  );
}
interface GanttRenderProps {
  item: ScheduleItem;
  calculateLeftPx: CalcLeftFunc;
  calculateWidthPx: CalcWidthFunc;
  studentData: Record<number, Student> | null;
  studentPortraits: StudentPortraitData | null;
  lane: number;
  laneHeight: number;
  colorMap?: Record<string, string>;
  colorKey?: string;
}

interface GanttTrackProps {
  title: string;
  items: ScheduleItem[];
  calculateLeftPx: CalcLeftFunc;
  calculateWidthPx: CalcWidthFunc;
  studentData: Record<number, Student> | null;
  studentPortraits: StudentPortraitData | null;
  scrollLeft: number;
  viewportWidth: number;
  colorMap?: Record<string, string>;
  colorKey?: string;
  laneHeight?: number;
  pixelsPerHour: number;
}

export function GanttTrack({ title, items, scrollLeft, viewportWidth, laneHeight, pixelsPerHour, ...rest }: GanttTrackProps) {
  const effectiveLaneHeight = laneHeight || 40;

  // Lane Calculation Logic
  const itemsWithLanes = useMemo(() => {
    if (!items) return { scheduledItems: [], maxLanes: 0 };
    const MARKER_COLLISION_WIDTH_MS = (60 / pixelsPerHour) * MS_PER_HOUR * 0.5;
    const sortedItems = [...items].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const lanes: number[] = [];

    const scheduledItems = sortedItems.map((item) => {
      const startTime = new Date(item.startTime).getTime();
      const endTime = item.details?.isPointEvent ? startTime + MARKER_COLLISION_WIDTH_MS : new Date(item.endTime).getTime();

      let assignedLane = -1;
      for (let i = 0; i < lanes.length; i++) {
        if (startTime >= lanes[i]) {
          lanes[i] = endTime;
          assignedLane = i;
          break;
        }
      }
      if (assignedLane === -1) {
        assignedLane = lanes.length;
        lanes.push(endTime);
      }
      return { ...item, lane: assignedLane };
    });
    return { scheduledItems, maxLanes: lanes.length };
  }, [items]);

  const { scheduledItems, maxLanes } = itemsWithLanes;
  const trackMinHeight = Math.max(maxLanes * effectiveLaneHeight, effectiveLaneHeight);

  // Virtualization
  const buffer = viewportWidth;
  const visibleStart = scrollLeft - buffer;
  const visibleEnd = scrollLeft + viewportWidth + buffer;

  const visibleItems = scheduledItems.filter((item) => {
    const itemLeft = rest.calculateLeftPx(item.startTime);
    let itemWidth = 0;
    if (item.details?.isPointEvent) {
      itemWidth = 100;
    } else {
      itemWidth = Math.max(rest.calculateWidthPx(item.startTime, item.endTime), 40);
    }
    const itemRight = itemLeft + itemWidth;
    return itemRight > visibleStart && itemLeft < visibleEnd;
  });

  if (items.length === 0) return null;

  return (
    <div className="relative mb-2">
      <div className="sticky left-0 z-30 w-fit pointer-events-none mb-1">
        {title ? (
          <h3 className="inline-block px-3 py-1 text-[11px] font-bold tracking-wide uppercase text-neutral-700 dark:text-neutral-300 bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-md rounded-r-md border border-l-0 border-neutral-200 dark:border-neutral-700 shadow-sm">
            {title}
          </h3>
        ) : (
          <div className="py-4"></div>
        )}
      </div>

      <div className="relative w-full" style={{ height: `${trackMinHeight}px` }}>
        {visibleItems.map((item) => {
          const props = { item, lane: item.lane, laneHeight: effectiveLaneHeight, ...rest };

          if (item.details?.isPointEvent) return <GanttMarker key={item.id} {...props} />;
          if (item.type === 'pickup') return <GanttPickupBar key={item.id} {...props} />;
          return <GanttBar key={item.id} {...props} />;
        })}
      </div>
    </div>
  );
}
// --- 1. Gantt Bar ---
export function GanttBar({ item, calculateLeftPx, calculateWidthPx, studentPortraits, lane, laneHeight, colorMap, colorKey }: GanttRenderProps) {
  const { t: t_cal_orig } = useTranslation('calendar');
  const t_cal = t_cal_orig as (key: string) => string;
  const locale = useTranslation().i18n.language as Locale;

  const width = Math.max(calculateWidthPx(item.startTime, item.endTime), 2);
  const left = calculateLeftPx(item.startTime);
  const isPrediction = item.details?.prediction === true;

  let bgClass = TRACK_COLORS[item.type] || 'bg-neutral-500';
  if (colorMap && colorKey && item.details?.[colorKey as keyof ScheduleItemDetails]) {
    const colorKeyValue = item.details[colorKey as keyof ScheduleItemDetails];
    if (typeof colorKeyValue === 'string' || typeof colorKeyValue === 'number') {
      bgClass = colorMap[String(colorKeyValue)] || CAMPAIGN_COLORS.default;
    }
  }

  const textColorClass = item.textColor || 'text-white';

  const portrait = item.details?.studentId && studentPortraits ? studentPortraits[item.details.studentId] : null;

  let displayTitle = item.title;
  if (item.type === 'campaign' && item.details?.campaignType) {
    const rawTitle = t_cal(`campaign.${item.details.campaignType.toLowerCase()}`);
    const multiplier = item.title.split(' x')[1];
    displayTitle = multiplier ? `${rawTitle} x${multiplier}` : rawTitle;
  }

  const showTime = ['raid', 'eraid', 'event', 'jointFiringDrill', 'multifloor'].includes(item.type);
  const timeRangeStr = showTime ? `${formatDateTimeShort(item.startTime)} ~ ${formatDateTimeShort(item.endTime)}` : null;
  const isEraid = item.type === 'eraid' && item.details?.bosses && item.details.bosses.length > 0;

  const containerStyle = `
    absolute z-10 transition-all hover:z-30 hover:shadow-md rounded-[2px] group overflow-visible
    ${isPrediction ? 'opacity-90 shadow-none' : ''}
  `;

  const backgroundLayerStyle = `absolute inset-0 z-0 rounded-[2px] ${bgClass}`;
  const dynamicStyles = getDynamicStyle(item.id);

  return (
    <div style={{ left, width, top: lane * laneHeight + 2, height: laneHeight - 4 }} className={containerStyle}>
      <div className={backgroundLayerStyle} style={dynamicStyles} />

      {/* 2. Hatched pattern layer (Rendered only for Prediction) */}
      {isPrediction && <div className="absolute inset-0 z-1 rounded-[2px] pointer-events-none" style={STRIPE_PATTERN_STYLE} />}

      {}
      <div className={`relative z-10 h-full w-full ${textColorClass}`}>
        {/* Sticky Container */}
        <div className="sticky left-0 top-0 h-full w-fit flex items-center pr-4 max-w-full">
          {item.label && (
            <div
              className={`
                absolute top-[-14px] left-0 h-[14px] px-2 flex items-center justify-center whitespace-nowrap
                text-[9px] font-black uppercase tracking-wider
                rounded-t-[3px] border-b-0 shadow-sm z-50 pointer-events-none
                ${bgClass} ${textColorClass}
              `}
              style={{
                ...dynamicStyles,

                opacity: isPrediction ? 0.8 : 1,
                clipPath: 'polygon(0 0, 100% 0, 92% 100%, 0% 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
              }}
            >
              <span className="opacity-90 drop-shadow-sm">{item.label}</span>
            </div>
          )}

          {portrait && (
            <Link
              to={localeLink(locale, `/charts/jp/heatmap`)}
              state={
                item.details
                  ? {
                      studentId: item.details?.studentId,
                    }
                  : undefined
              }
              className="relative -ml-3 z-20 shrink-0 flex items-end h-full"
            >
              {/* <div className="relative -ml-3 z-20 shrink-0 select-none pointer-events-none flex items-end h-full"> */}
              <img
                src={`data:image/webp;base64,${portrait}`}
                alt=""
                className="h-[160%] w-auto max-w-none object-contain drop-shadow-lg translate-y-[10%]"
                style={{ maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)' }}
              />
              {/* </div> */}
            </Link>
          )}

          <div className={`flex flex-col justify-center min-w-0 z-10 pl-1 ${portrait ? '-ml-1' : ''}`}>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold leading-none whitespace-nowrap drop-shadow-sm">{displayTitle}</span>
              {}
              {isPrediction && <span className="text-[9px] opacity-80 font-normal border border-white/40 rounded px-0.5 ml-0.5">?</span>}

              {(item.details?.terrain || item.details?.armorType) && !isEraid && (
                <div className="flex items-center gap-0.5 opacity-90">
                  {item.details?.terrain && <TerrainIconGameStyle terrain={item.details.terrain as Terrain} size="0.7em" />}
                  {item.details?.armorType && <ArmorIcon armorType={item.details.armorType} difficulty={item.details?.maxDifficulty} />}
                </div>
              )}
              {}
              {isEraid && (
                <div className="flex items-center gap-1">
                  {item.details?.terrain && <TerrainIconGameStyle terrain={item.details.terrain as Terrain} size="0.7em" />}
                  {item.details?.bosses?.map((boss: { armorType: string; armorName: string; difficulty: string }, idx: number) => (
                    <div key={idx} className="flex items-center scale-90">
                      <ArmorIcon armorType={boss.armorType} difficulty={boss.difficulty} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            {timeRangeStr && <span className="text-[8px] leading-none opacity-80 font-mono my-[2px] tracking-tight whitespace-nowrap">{timeRangeStr}</span>}
          </div>
        </div>

        {item.link && (
          <Link
            to={localeLink(locale, item.link)}
            className="absolute right-0 top-0 h-full w-8 flex items-center justify-center bg-black/0 hover:bg-white/20 z-10 opacity-80 hover:opacity-100 transition-opacity"
          >
            <FiSearch className="w-4 h-4 text-white drop-shadow-sm" />
          </Link>
        )}
      </div>
    </div>
  );
}

const PickupStudentItem = ({
  student,
  index,
  portrait,
  studentName,
  laneHeight,
  TooltipComponent,
}: {
  student: PickupStudentInfo;
  index: number;
  portrait: string;
  studentName: string;
  laneHeight: number;
  TooltipComponent: typeof Tooltip;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [tappedOnce, setTappedOnce] = useState(false); // State for checking mobile double-tap
  const { t: t_c, i18n } = useTranslation('common');
  const locale = i18n.language as Locale; // Need to verify Locale type definition

  const isInvalidId = /ID: \d+/.test(studentName);

  // Reset tap state when hover is lost (e.g., touching elsewhere on mobile)
  useEffect(() => {
    if (!isHovered) {
      setTappedOnce(false);
    }
  }, [isHovered]);

  const handleLinkClick = (e: React.MouseEvent) => {
    // 1. Completely ignore clicks if the student ID is invalid
    if (isInvalidId) {
      e.preventDefault();
      return;
    }

    // 2. Check if the device is touch-based
    const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    if (isTouchDevice) {
      // For touch devices, prevent navigation on the first tap and only update state
      if (!tappedOnce) {
        e.preventDefault();
        setTappedOnce(true);
      }
      // On the second tap (tappedOnce === true), navigation occurs normally as preventDefault() is not called
    }
  };

  return (
    <TooltipComponent placement="top" overlay={<span className="text-xs font-bold">{studentName}</span>} mouseEnterDelay={0.05}>
      <div
        className="relative group cursor-help flex items-center justify-center transition-all duration-200 ease-out pointer-events-auto"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          zIndex: isHovered ? 100 : 50 - index,
          width: laneHeight,
          height: laneHeight,
          marginLeft: index === 0 ? 0 : '0px',
        }}
      >
        {/* <div className="relative w-full h-full flex items-center justify-center transition-transform hover:scale-125 origin-bottom"> */}
        <Link
          to={localeLink(locale, `/charts/jp/heatmap`)} // Adjust according to the link function being used
          state={{
            studentId: student.id,
          }}
          onClick={handleLinkClick}
          className={`relative w-full h-full flex items-center justify-center transition-transform origin-bottom 
            ${isInvalidId ? 'cursor-default' : 'hover:scale-125 cursor-pointer'}
          `}
        >
          <img
            src={`data:image/webp;base64,${portrait}`}
            className="h-[140%] w-auto max-w-none object-contain rounded-xl drop-shadow-md translate-y-[5%]"
            alt={studentName}
            style={{ maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)' }}
          />
          <div className="absolute top-[-4px] left-0 right-0 flex justify-between w-full px-0 pointer-events-none opacity-90 group-hover:opacity-100">
            {student.rerun ? <span className="bg-blue-600/90 text-white text-[7px] font-black px-1 rounded-sm shadow-sm backdrop-blur-[1px] whitespace-nowrap">{t_c('rerun')}</span> : <span />}
            <div className="flex gap-px whitespace-nowrap">
              {student.fest && <span className="bg-amber-600/90 text-white text-[7px] font-black px-1 rounded-sm shadow-sm">{t_c('fest')}</span>}
              {!student.fest && student.limited && <span className="bg-pink-600/90 text-white text-[7px] font-black px-1 rounded-sm shadow-sm">{t_c('limited')}</span>}
            </div>
          </div>
        </Link>
      </div>
    </TooltipComponent>
  );
};

export function GanttPickupBar({ item, calculateLeftPx, calculateWidthPx, studentData, studentPortraits, lane, laneHeight }: GanttRenderProps) {
  const width = Math.max(calculateWidthPx(item.startTime, item.endTime), 2);
  const left = calculateLeftPx(item.startTime);
  const isPrediction = item.details?.prediction === true;
  const TooltipComponent = ((Tooltip as unknown as Record<string, unknown>).default as typeof Tooltip) || Tooltip;
  const students = item.details?.students || [];

  const containerStyle = `
    absolute z-10 rounded-[2px] transition-colors overflow-visible pointer-events-none
    ${isPrediction ? 'opacity-90' : ''}
  `;

  const backgroundLayerStyle = `absolute inset-0 z-0 rounded-[2px] ${TRACK_COLORS.pickup} border-l-[0px] border-black/20`;
  const dynamicStyles = getDynamicStyle(item.id);

  return (
    <div style={{ left, width, top: lane * laneHeight + 2, height: laneHeight - 4 }} className={containerStyle}>
      {}
      <div className={backgroundLayerStyle} style={dynamicStyles} />

      {/* 2. Hatched pattern layer */}
      {isPrediction && <div className="absolute inset-0 z-1 rounded-[2px] pointer-events-none" style={STRIPE_PATTERN_STYLE} />}

      {}
      <div className="relative z-10 w-full h-full flex items-center">
        {}
        <div className="sticky left-0 z-20 flex items-center h-full w-fit pl-3 pr-1">
          <div className="flex items-center -space-x-2 h-full">
            {students.map((s, idx) => {
              const portrait = s.id && studentPortraits ? studentPortraits[s.id] : null;
              const studentName = studentData?.[s.id]?.Name || `ID: ${s.id}`;

              if (!portrait) return null;
              return <PickupStudentItem key={s.id} student={s} index={idx} portrait={portrait} studentName={studentName} laneHeight={laneHeight} TooltipComponent={TooltipComponent} />;
            })}
          </div>
        </div>

        {width > 120 && (
          <span className="ml-auto sticky right-2 text-[9px] text-white/90 font-medium pr-1 drop-shadow-md whitespace-nowrap">
            {isPrediction && '(?)'} {formatDateTimeShort(item.startTime)} ~ {formatDateTimeShort(item.endTime)}
          </span>
        )}
      </div>
    </div>
  );
}

export function GanttMarker({ item, calculateLeftPx, lane, laneHeight }: GanttRenderProps) {
  const { t: t_cal_orig } = useTranslation('calendar');
  const t_cal = t_cal_orig as (key: string) => string;
  const left = calculateLeftPx(item.startTime);
  const colorClass = TRACK_COLORS[item.type] || 'bg-neutral-500';

  const textColorClass = item.textColor || 'text-white';

  const bgColorClass = colorClass.replace(/text-[\w-]+/g, '').trim();

  return (
    <div className="absolute z-20 flex flex-col items-center group -translate-x-1/2 pointer-events-none hover:pointer-events-auto" style={{ left, top: lane * laneHeight, height: laneHeight }}>
      <div
        className={`
          px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold shadow-sm whitespace-nowrap mb-0.5
          ${bgColorClass} ${textColorClass} 
        `}
      >
        {item.type === 'shop-reset' ? t_cal(item.title) : item.title}
      </div>

      <div className={`w-[2px] grow ${bgColorClass} opacity-60 group-hover:opacity-100 transition-opacity`} />
      <div className={`w-1.5 h-1.5 rounded-full ${bgColorClass} mt-auto`} />
    </div>
  );
}
