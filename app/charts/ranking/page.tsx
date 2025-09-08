'use client';

import { RaidInfo, Student } from '@/app/types/data';
import { useDataCache } from '@/app/utils/cache';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import 'rc-slider/assets/index.css';
import TooltipSlider from '@/app/components/HandleTooltip';
import { raidToString } from '@/app/utils/raidToString';
import { useTranslations } from 'next-intl';
import { StarRating } from '@/app/components/StarRatingProps';
import { ToggleButtonGroup } from '@/app/components/ToggleButtonGroupProps';
import Image from 'next/image';
import { useIsDarkState } from '@/app/store/isDarkState';
import { difficultyInfo, DifficultySelect } from '@/app/components/Difficulty';

// Define the interface for the raw fetched data
interface RawRatingData {
  [key: string]: number; // e.g., "6|10074|6": 1024
}

export interface RatingData {
  rank: number;
  id: number;
  name: string;
  bullettype: Student['BulletType']
  total: number;
  count: number;
  portrait: Student['Portrait']
  ratings: {
    [key: string]: number;
  };
}

const ratingColors: { [key: number]: string } = {
  1: "#dc2626", // red-600
  2: "#f97316", // orange-500
  3: "#f87171", // red-400
  4: "#facc15", // yellow-400
  5: "#4ade80", // green-400
  6: "#3b82f6", // blue-500
  7: "#8b5cf6", // violet-500
  8: "#ff69b4", // hotpink
  9: "#40e0d0", // turquoise
  10: "#ffd700", // gold
  11: "#c0c0c0", // silver
};
const getBackgroundRatingColor = (index: number, theme:'light' | 'dark'|null) => {
  
  const color = ratingColors[Math.abs(index)];
  if (!color) {
    return 'rgba(0, 0, 0, 0.1)';
  }

  const isDark = theme == 'dark'

  if (index < 0) {
    const r = parseInt(color.substring(1, 3), 16);
    const g = parseInt(color.substring(3, 5), 16);
    const b = parseInt(color.substring(5, 7), 16);
    const alpha = 0.20
    const alpha_dark = 0.55
    const t = (x: number) => isDark ? x * alpha_dark : 255 - (255 - x) * alpha
    // return `rgba(${r}, ${g}, ${b}, 0.15)`;
    return `rgba(${t(r)}, ${t(g)}, ${t(b)})`;
  }

  return color;
};

const barHeight = 30;
const barSpacing = 5;

export default function RankingChartPage() {
  const [isRelativeMode, setIsRelativeMode] = useState<boolean>(false);
  const [rawRatingData, setRawRatingData] = useState<RawRatingData>({});
  const [studentMap, setStudentMap] = useState<Record<number, Student>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [displayMode, setDisplayMode] = useState<'total' | 'average'>('average');

  // Inside your RankingChartPage component
  const [selectedSquadType, setSelectedSquadType] = useState<string>('All');
  const [selectedTacticRole, setSelectedTacticRole] = useState<string>('All');
  const [selectedStudentType, setSelectedStudentType] = useState<string>('All');
  const [allStudents, setAllStudents] = useState<Record<string, Student>>({});
  const [raidInfo, setraidInfo] = useState<RaidInfo[]>([]);

  const {isDark} = useIsDarkState();


  const [selectedRaidIds, setSelectedRaidIds] = useState<number[]>([0, 102]); // Stores [min, max] range
  const [selectedDiffculty, setSelectedDiffculty] = useState<DifficultySelect>("All"); // Stores [min, max] range

  const tLocale = useTranslations();
  const currentLocale = tLocale('currentLocale');
  const t = useTranslations('charts.ranking')

  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    content: React.ReactNode;
    x: number;
    y: number;
  }>({ visible: false, content: '', x: 0, y: 0 });



  // Create a ref for the SVG container
  const containerRef = useRef<HTMLDivElement>(null);
  // State to hold the dynamic width of the SVG container
  const [svgWidth, setSvgWidth] = useState(800); // window.innerWidth - 50

  const fetchData = useDataCache<RawRatingData>();
  const fetchStudents = useDataCache<Record<string, Student>>();
  const fetchRaids = useDataCache<RaidInfo[]>();


  useEffect(() => {
    // Function to get the current container width
    const updateWidth = () => {
      if (containerRef.current) {
        // console.log('3')
        setSvgWidth(containerRef.current.offsetWidth);
      }
    };

    // Set initial width
    updateWidth();
    setSvgWidth(Math.min(window.innerWidth, 900) - 0);

    // window.addEventListener('load', ()=>{
    //   setSvgWidth(window.innerWidth - 50)
    // })

    // Add event listener for window resize
    window.addEventListener('resize', updateWidth);

    // Clean up event listener
    return () => {
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  useEffect(() => {
    const fetchDataAndStudents = async () => {
      try {
        const [ratings, students, raids] = await Promise.all([
          fetchData('/w/play_rate_rank.json.xz', res => res.json() as Promise<RawRatingData>),
          fetchStudents(`/w/${currentLocale}.students.json.xz`, res => res.json() as Promise<Record<string, Student>>),
          fetchRaids(`/w/${currentLocale}.raid_info.json.xz`, res => res.json() as Promise<RaidInfo[]>),
        ]);

        const nameMap: Record<number, Student> = {};
        for (const key in students) {
          const studentId = parseInt(key, 10);
          if (!isNaN(studentId)) {
            nameMap[studentId] = students[key];
          }
        }

        setAllStudents(students);
        setStudentMap(nameMap);
        setRawRatingData(ratings);
        setraidInfo(raids);
        // console.log([0, parseInt(raids.length)])
        setSelectedRaidIds([0, raids.length - 1])

      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDataAndStudents();
  }, [fetchData, fetchStudents, fetchRaids, currentLocale]);


  const processedData = useMemo(() => {
    if (Object.keys(rawRatingData).length === 0 || Object.keys(allStudents).length === 0) return [];

    // Filter students based on selected SquadType and TacticRole
    const filteredStudentIds = Object.keys(allStudents).filter(studentId => {
      const student = allStudents[studentId];
      const squadTypeMatch = selectedSquadType === 'All' || student.SquadType === selectedSquadType;
      const tacticRoleMatch = selectedTacticRole === 'All' || student.TacticRole === selectedTacticRole;


      return squadTypeMatch && tacticRoleMatch;
    }).map(id => parseInt(id, 10));

    // Process only the filtered students' data
    const studentTotals: Record<number, number> = {};
    const studentRankCounts: Record<number, Record<string, number>> = {};

    const [startId, endId] = selectedRaidIds;

    const displayValue = displayMode === 'average'

    for (const key in rawRatingData) {
      const [raidStr, studentStr, rankStr, diffcultyIndex] = key.split('|');
      const student = parseInt(studentStr, 10);
      const rank = parseInt(rankStr, 10);
      let count = rawRatingData[key];
      const raidIdNum = parseInt(raidStr, 10);
      const diffculty = difficultyInfo[parseInt(diffcultyIndex)].name

      if (displayValue) {
        if (selectedDiffculty == 'All') count /=  raidInfo[raidIdNum].Cnt.All
        else count /=  raidInfo[raidIdNum].Cnt[selectedDiffculty] || raidInfo[raidIdNum].Cnt.All
      }

      if (selectedDiffculty != 'All' && selectedDiffculty != diffculty) continue


      // Filter by raid ID range
      const raidIdMatch = raidIdNum >= startId && raidIdNum <= endId;


      // Only process data for students that match the filter
      if (filteredStudentIds.includes(student) && raidIdMatch) {
        const studentTypeMatch = selectedStudentType === 'All' ||
          (selectedStudentType === 'Normal' && rank >= 0) ||
          (selectedStudentType === 'Helper' && rank < 0);
        if (!studentTypeMatch) {
          continue;
        }
        studentTotals[student] = (studentTotals[student] || 0) + count;
        if (!studentRankCounts[student]) {
          studentRankCounts[student] = {};
        }
        studentRankCounts[student][rankStr] = (studentRankCounts[student][rankStr] || 0) + count;
      }
    }

    const sortedStudents = Object.entries(studentTotals)
      .sort(([, totalA], [, totalB]) => totalB - totalA);

    const formattedData: RatingData[] = sortedStudents.map(([studentIdStr, total], index) => {
      const studentId = parseInt(studentIdStr, 10);
      const ratings = studentRankCounts[studentId];
      return {
        rank: index + 1,
        id: studentId,
        name: studentMap[studentId].Name,
        bullettype: studentMap[studentId].BulletType,
        portrait: studentMap[studentId].Portrait,
        total: total,
        count: total,
        ratings: ratings,
      };
    });

    const maxTotal = Math.max(...formattedData.map(item => item.total));


    return formattedData.map(item => {
      let xOffset = 0;
      const processedRatings = Object.entries(item.ratings)
        .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
        .sort(([a], [b]) => {
          const f = (x: number) => x >= 0 ? x : 10000 + -x
          return f(parseInt(a, 10)) - f(parseInt(b, 10))
        })
        .map(([key, value]) => {
          const width = isRelativeMode ? (value / item.total) * (svgWidth - 150) : (value / maxTotal) * (svgWidth - 150);
          const x = xOffset;
          const percent = `${Math.round((value / item.total) * 100).toFixed(2)}%`
          xOffset += width;
          return {
            rating: parseInt(key),
            value: value,
            width,
            x,
            percent,
            label: isRelativeMode ? percent : (displayMode == 'average' ? value.toFixed(2) : value.toLocaleString()),
          };
        });
      return { ...item, processedRatings };
    });
  }, [rawRatingData, isRelativeMode, studentMap, svgWidth, allStudents, selectedSquadType, selectedTacticRole, selectedRaidIds, selectedStudentType, displayMode, selectedDiffculty]);

  if (loading) return <div>{t('loading_txt')}</div>;


  // Create marks for the slider
  const raidIds = Object.keys(raidInfo).map(Number).filter(id => !isNaN(id));
  const minRaidId = Math.min(...raidIds);
  const maxRaidId = Math.max(...raidIds);

  // const sliderMarks = raidIds.reduce((acc, id) => {
  //   // Only show marks for raids that exist in raidInfo
  //   if (raidInfo[String(id)]) {
  //     acc[id] = raidInfo[String(id)];
  //   }
  //   return acc;
  // }, {} as Record<number, string>);

  const barTooltipHandler = (item: typeof processedData[number], rating: number) => (e: React.MouseEvent) => {
    const tooltipContent = (
      <div
        style={{
          background: 'white',
          padding: '6px 9px',
          borderRadius: '6px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          width: 'max-content',
        }}
      >
        <div className='flex flex-row items-center pb-2'>
          <div
            className="flex items-center justify-center flex-shrink-0" // 'flex-shrink-0' to prevent shrinking
            style={{
              width: '44px',
              height: '44px',
              backgroundColor: ({
                Explosion: "#b62915",
                Pierce: '#bc8800',
                Mystic: '#206d9b',
                Sonic: '#9a46a8',
              }[item.bullettype]),
            }}
          >
            <Image
              src={`data:image/webp;base64,${item.portrait}`}
              alt={`${item.name}'s icon`}
              width={40}
              height={40}
              className=""
            />
          </div>
          <div className="font-semibold px-4 text-gray-800 mb-1">{item.name}</div>
        </div>

        {item.processedRatings.map((r, idx) => (
          <div
            key={idx}
            className={"grid text-sm pr-2 pl-2 gap-x-2 " + (rating == r.rating ? "bg-black text-white font-bold" : '')}

            style={{ gridTemplateColumns: 'auto auto 1fr 1fr' }}
          >
            <React.Fragment key={idx}>
              {/* <span className={(rating==r.rating ? "bg-black text-white font-bold" : '')}> */}
              <div style={{ "color": getBackgroundRatingColor(r.rating, isDark) }}>⦁</div>
              <div className="text-right text-gray-800" ><StarRating n={r.rating} /></div>
              <div className={"text-right text-gray-600 " + (rating == r.rating ? "text-white" : '')}>
                {displayMode == 'average' ? r.value.toFixed(2) : r.value.toLocaleString()}{t('unit_cnt')}
              </div>
              <div className={"text-right text-gray-600 " + (rating == r.rating ? "text-white" : '')}>
                ({r.percent})
              </div>
              {/* </span> */}
            </React.Fragment>
          </div>
        ))}
      </div>

    );

    const mouseX = e.clientX;
    const mouseY = e.clientY;
    setTooltip({
      visible: true,
      content: tooltipContent,
      x: mouseX,
      y: mouseY,
    });
  }

  const labelMap: Record<number, React.ReactNode> = raidInfo.reduce((map, raid, index) => {
    map[index] = raidToString(raid, true);
    return map;
  }, {} as Record<number, React.ReactNode>);


  // console.log('raidInfo',raidInfo)

  return (
    <div className="flex flex-col items-center justify-center">
      <>
        <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 pt-0 sm:pt-0 bg-white dark:bg-slate-900 rounded-lg shadow-md transition-colors duration-300">
          {/* header */}
          <div className="mb-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t('description1')}</p>
          </div>

          <hr className="my-3 border-gray-200 dark:border-gray-700" />

          {/* Control groups: Configure reactive layouts using grids */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">

            {/* 1. Display Mode Section */}
            <div className="space-x-4">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white">{t('control.display_mode')}</h3>
              <div className='flex flex-col sm:flex-row items-center gap-1'>
                <ToggleButtonGroup
                  options={[
                    { value: true, label: t('control.percent') },
                    { value: false, label: t('control.absolute') },
                  ]}
                  selectedValue={isRelativeMode}
                  onSelect={(val) => setIsRelativeMode(val)}
                />
                <ToggleButtonGroup
                  options={[
                    { value: 'total', label: t('control.display_total') },
                    { value: 'average', label: t('control.display_average') },
                  ]}
                  selectedValue={displayMode}
                  onSelect={(val) => setDisplayMode(val as 'total' | 'average')}
                />
              </div>
            </div>

            {/* 2. Detailed Filter */}
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white">{t('filters')}</h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 space-x-2">
                <div className="flex items-center space-x-2 py-0.5">
                  <label htmlFor="student-type-select" className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{t('control.rank')}</label>
                  <select
                    id="student-type-select"
                    value={selectedStudentType}
                    onChange={(e) => setSelectedStudentType(e.target.value)}
                    className="p-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="All">{t('control.rank_all')}</option>
                    <option value="Normal">{t('control.rank_normal')}</option>
                    <option value="Helper">{t('control.rank_assist')}</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2 py-0.5">
                  <label htmlFor="squad-type-select" className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{t('control.squad_type')}</label>
                  <select
                    id="squad-type-select"
                    value={selectedSquadType}
                    onChange={(e) => setSelectedSquadType(e.target.value)}
                    className="p-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="All">{t('control.squad_type_all')}</option>
                    <option value="Main">{t('control.squad_type_main')}</option>
                    <option value="Support">{t('control.squad_type_support')}</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2 py-0.5">
                  <label htmlFor="squad-type-select" className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{t('control.diffculty')}</label>
                  <select
                    id="squad-type-select"
                    value={selectedDiffculty}
                    onChange={(e) => setSelectedDiffculty(e.target.value as DifficultySelect)}
                    className="p-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="All">{t('control.squad_type_all')}</option>
                    {difficultyInfo.map(({name})=><option value={name} key={name}>{name}</option>)}
                  </select>
                </div>

                <div className="flex items-center space-x-2 py-0.5">
                  <label htmlFor="tactic-role-select" className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{t('control.tactic_role')}</label>
                  <select
                    id="tactic-role-select"
                    value={selectedTacticRole}
                    onChange={(e) => setSelectedTacticRole(e.target.value)}
                    className="p-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="All">{t('control.tactic_role_All')}</option>
                    <option value="DamageDealer">{t('control.tactic_role_DamageDealer')}</option>
                    <option value="Healer">{t('control.tactic_role_Healer')}</option>
                    <option value="Supporter">{t('control.tactic_role_Supporter')}</option>
                    <option value="Tanker">{t('control.tactic_role_Tanker')}</option>
                    <option value="Vehicle">{t('control.tactic_role_Vehicle')}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <hr className="my-3 border-gray-200 dark:border-gray-700" />

          {/* 3. Raid Period Setting Slider Section */}
          <div className="w-full">
            <h3 className="font-semibold text-gray-800 dark:text-white text-center mb-4">{t('control.raid')}</h3>
            <div className="px-2">
              <TooltipSlider
                range
                labelMap={labelMap}
                min={minRaidId}
                max={maxRaidId}
                defaultValue={selectedRaidIds}
                onChange={(value) => {
                  if (Array.isArray(value)) {
                    setSelectedRaidIds(value);
                  }
                }}
              />
            </div>
            <div className="flex justify-between items-center text-xs sm:text-sm mt-3 text-gray-600 dark:text-gray-400">
              <div className="text-left flex flex-col sm:flex-row">
                <div className="font-bold text-blue-600 dark:text-blue-400 sm:inline">{raidInfo[selectedRaidIds[0]].Id}</div>
                <div className="sm:ml-2 sm:inline">{raidToString(raidInfo[selectedRaidIds[0]], true)}</div>
              </div>
              <div className="font-semibold text-gray-800 dark:text-white px-2">
                {t('total_x', { 'x': selectedRaidIds[1] - selectedRaidIds[0] + 1 })}
              </div>
              <div className="text-right flex flex-col sm:flex-row">
                <div className="font-bold text-blue-600 dark:text-blue-400">{raidInfo[selectedRaidIds[1]].Id}</div>
                <div className="ml-2 sm:inline">{raidToString(raidInfo[selectedRaidIds[1]], true)}</div>
              </div>
            </div>
          </div>
        </div>
      </>





      {/* Attach the ref to the container div */}
      <div ref={containerRef} className="w-full max-w-4xl bg-white p-4 sm:p-6 rounded-lg shadow-xl overflow-x-auto dark:bg-gray-800 dark:shadow-xl transition-colors duration-300">
        <div className="mb-4">
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 transition-colors duration-300">{isRelativeMode ? t('desp_percent') : t('desp_absolute')}</p>
        </div>

        <svg
          width={svgWidth}
          height={(barHeight + barSpacing) * processedData.length + 50}
          // The viewBox width remains a fixed logical size (e.g., 800) for consistent scaling
          viewBox={`0 0 ${svgWidth} ${(barHeight + barSpacing) * processedData.length + 50}`}
          className="overflow-visible"
        >
          {processedData.map((item, index) => (
            <g
              key={item.id}
              transform={`translate(0, ${index * (barHeight + barSpacing)})`}
              className="transition-transform duration-500 ease-in-out"
            >
              {/* Product Label */}
              {/* <text
                x="110"
                y={barHeight / 2}
                dy="0.35em"
                textAnchor="end"
                className="font-medium text-sm fill-gray-800"
              >
                {item.name}
              </text> */}
              <rect
                x="0"
                fill={
                  {
                    Explosion: "#b62915",
                    Pierce: '#bc8800',
                    Mystic: '#206d9b',
                    Sonic: '#9a46a8',
                  }[item.bullettype]
                }
                width="30"
                height="30"
              />
              <image
                x="0"
                // href={`/w/img/student/icon/${item.id}.webp`}
                href={`d-ata:image/webp;base64,${item.portrait}`}
                width="30"
                height="30"
              />

              {/* Bars and Labels */}
              {item.processedRatings.map((rating, i) => (
                <React.Fragment key={i}>
                  <g
                    onMouseLeave={() => setTooltip({ ...tooltip, visible: false })}
                  >
                    {/* Bar */}
                    <rect
                      x={29 + 10 + rating.x}
                      y="0"
                      width={rating.width}
                      height={barHeight}
                      fill={getBackgroundRatingColor(rating.rating, isDark)}
                      className="transition-all duration-500 ease-in-out"
                      rx="4"
                      ry="4"
                      onMouseEnter={barTooltipHandler(item, rating.rating)}
                      onMouseMove={barTooltipHandler(item, rating.rating)}
                      onClick={barTooltipHandler(item, rating.rating)}


                    />
                    {/* Label - Only show if the bar is wide enough to fit the text */}
                    {rating.width > 50 && (
                      <text
                        x={29 + 10 + rating.x + rating.width / 2}
                        y={barHeight / 2}
                        dy="0.35em"
                        textAnchor="middle"
                        className={"font-semibold text-xs transition-opacity duration-300 " + ((rating.rating > 0 && isDark!='dark') ? "fill-white" : "fill-black")}
                        onMouseEnter={barTooltipHandler(item, rating.rating)}
                        onMouseMove={barTooltipHandler(item, rating.rating)}
                        onClick={barTooltipHandler(item, rating.rating)}
                      >
                        {rating.label}
                      </text>
                    )}
                  </g>
                </React.Fragment>
              ))}

              {/* Data Labels (Total or Percentage) */}
              <text
                x={svgWidth - 40}
                y={barHeight / 2}
                dy="0.35em"
                textAnchor="end"
                className="font-bold text-sm fill-gray-800"
              >
                {displayMode === "average" ? item.total.toFixed(2) : item.total.toLocaleString()}{t('unit_cnt')}
              </text>
            </g>
          ))}




        </svg>

        {tooltip.visible && (
          <div
            style={{
              position: 'fixed',
              left: tooltip.x,
              top: tooltip.y,
              transform: tooltip.x > window.innerWidth / 2 ? 'translate(-110%, -30%)' : 'translate(+10%, -30%)',
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            {tooltip.content}
            {/* {tooltip.x} {tooltip.y} */}
          </div>
        )}

        {/* Legend */}
        <div className="flex justify-center mt-6 space-x-2 sm:space-x-4 flex-wrap">
          {Object.entries(ratingColors).map(([rating, color]) => (
            <div key={rating} className="flex items-center my-1">
              <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full mr-1 sm:mr-2" style={{ backgroundColor: color }}></div>
              <span className="text-xs sm:text-sm font-medium text-gray-700">
                <StarRating n={parseInt(rating)} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 