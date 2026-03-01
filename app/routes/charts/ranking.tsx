//'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import 'rc-slider/assets/index.css';
import type { GameServer, GameServerParams, RaidInfo, Student } from '~/types/data';
import { GAMESERVER_LIST } from '~/types/data';
import { difficultyInfo, type DifficultySelect } from '~/components/Difficulty';
import { useTranslation } from 'react-i18next';
import { ToggleButtonGroup } from '~/components/ToggleButtonGroupProps';
import TooltipSlider from '~/components/HandleTooltip';
import { raidToString, raidToStringTsx } from '~/components/raidToString';
import { useDataCache } from '~/utils/cache';
import type { Route } from './+types/ranking';
import { useLocation, useParams, type LoaderFunctionArgs } from 'react-router';
import type { AppHandle } from '~/types/link';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';

import { RankingChart } from '~/components/ranking/chart';
import { PlayIcon, StopIcon } from '~/components/Icon';
import { getInstance } from '~/middleware/i18next';
import { cdn } from '~/utils/cdn';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { useHelpKey } from '~/utils/usePageHelp';

interface RawRatingData {
  [key: string]: number; // e.g., "6|10074|6": 1024
}

export interface RatingData {
  rank: number;
  id: number;
  name: string;
  bullettype: Student['BulletType'];
  total: number;
  count: number;
  portrait: Student['Portrait'];
  ratings: {
    [key: string]: number;
  };
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const { server } = params;
  if (!server || !GAMESERVER_LIST.includes(server as GameServer)) {
    throw new Response('Not Found', { status: 404 });
  }
  const g_server = server as GameServer;
  let i18n = getInstance(context);
  return {
    siteTitle: i18n.t('common:title'),
    title: i18n.t('common:navigation.ranking'),
    description: i18n.t('charts:ranking.description1'),
    server: g_server,
  };
}

export const links: Route.LinksFunction = () => {
  return [
    {
      rel: 'preload',
      href: cdn(`/w/students_portrait.json`),
      crossOrigin: 'anonymous',
      as: 'fetch',
    },
  ];
};

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/1.webp');
}

export const handle: AppHandle = {
  preload: (data) => {
    // Create a link dynamically using the return value (data) of the root loader
    const pathname = useLocation().pathname;
    const match = pathname.match(/\/charts\/([a-zA-Z]{2})\//);
    if (!match || !GAMESERVER_LIST.includes(match[1] as GameServer)) return [];
    const server = match[1] as GameServer;
    if (!data?.locale) return [];

    return [
      {
        rel: 'preload',
        href: cdn(`/w/${server}/play_rate_rank.bin`),
        crossOrigin: 'anonymous',
        as: 'fetch',
      },
      {
        rel: 'preload',
        href: cdn(`/w/${getLocaleShortName(data?.locale)}.students.bin`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/w/${server}/${getLocaleShortName(data?.locale)}.raid_info.bin`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      ...createLinkHreflang(`/charts/${server}/ranking`),
    ];
  },
};

export function headers({ loaderHeaders, parentHeaders }: Route.HeadersArgs) {
  if (process.env.NODE_ENV === 'production')
    return {
      'Cache-Control': CACHE_CONTROL_CONFIG,
    };
}

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
  const [selectedRaidIds, setSelectedRaidIds] = useState<number[]>([0, 102]); // Stores [min, max] range
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultySelect>('All'); // Stores [min, max] range
  const [isPlaying, setIsPlaying] = useState(false);
  const currentLocale = useTranslation().i18n.language as Locale;
  const { t, i18n } = useTranslation('charts', { keyPrefix: 'ranking' });
  const { t: t_raids } = useTranslation('raidInfo');
  const locale = i18n.language as Locale;

  const { server } = useParams<GameServerParams>();

  useHelpKey('chart.ranking');
  if (!server) return <></>;

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
        setSvgWidth(containerRef.current.offsetWidth);
      }
    };

    // Set initial width
    updateWidth();
    setSvgWidth(Math.min(window.innerWidth, 1280) - (window.innerWidth < 640 ? 32 : 48));

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
          fetchData(cdn(`/w/${server}/play_rate_rank.bin`), (res) => res.json() as Promise<RawRatingData>),
          fetchStudents(cdn(`/w/${getLocaleShortName(currentLocale)}.students.bin`), (res) => res.json() as Promise<Record<string, Student>>),
          fetchRaids(cdn(`/w/${server}/${getLocaleShortName(currentLocale)}.raid_info.bin`), (res) => res.json() as Promise<RaidInfo[]>),
        ]);

        setAllStudents(students);

        await (async () => {
          const students_portrait = (await fetch(cdn('/w/students_portrait.json')).then((res) => res.json())) as {
            [key: number]: string;
          };
          Object.entries(students).map(([studentId, student]) => {
            student.Portrait = students_portrait[parseInt(studentId)];
          });
          setAllStudents(students);
        })();

        const nameMap: Record<number, Student> = {};
        for (const key in students) {
          const studentId = parseInt(key, 10);
          if (!isNaN(studentId)) {
            nameMap[studentId] = students[key];
          }
        }

        setStudentMap(nameMap);
        setRawRatingData(ratings);
        setraidInfo(raids);
        setSelectedRaidIds([0, raids.length - 1]);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDataAndStudents();
  }, [fetchData, fetchStudents, fetchRaids, currentLocale, server]);

  const processedData = useMemo(() => {
    if (Object.keys(rawRatingData).length === 0 || Object.keys(allStudents).length === 0) return [];

    // Filter students based on selected SquadType and TacticRole
    const filteredStudentIds = Object.keys(allStudents)
      .filter((studentId) => {
        const student = allStudents[studentId];
        const squadTypeMatch = selectedSquadType === 'All' || student.SquadType === selectedSquadType;
        const tacticRoleMatch = selectedTacticRole === 'All' || student.TacticRole === selectedTacticRole;

        return squadTypeMatch && tacticRoleMatch;
      })
      .map((id) => parseInt(id, 10));

    // Process only the filtered students' data
    const studentTotals: Record<number, number> = {};
    const studentRankCounts: Record<number, Record<string, number>> = {};

    const [startId, endId] = selectedRaidIds;

    const displayValue = displayMode === 'average';

    for (const key in rawRatingData) {
      const [raidStr, studentStr, rankStr, difficultyIndex] = key.split('|');
      const student = parseInt(studentStr, 10);
      const rank = parseInt(rankStr, 10);
      let count = rawRatingData[key];
      const raidIdNum = parseInt(raidStr, 10);
      const difficulty = difficultyInfo[parseInt(difficultyIndex)].name;

      if (displayValue) {
        if (selectedDifficulty == 'All') count /= raidInfo[raidIdNum].Cnt.All;
        else count /= raidInfo[raidIdNum].Cnt[selectedDifficulty] || raidInfo[raidIdNum].Cnt.All;
      }

      if (selectedDifficulty != 'All' && selectedDifficulty != difficulty) continue;

      // Filter by raid ID range
      const raidIdMatch = raidIdNum >= startId && raidIdNum <= endId;

      // Only process data for students that match the filter
      if (filteredStudentIds.includes(student) && raidIdMatch) {
        const studentTypeMatch = selectedStudentType === 'All' || (selectedStudentType === 'Normal' && rank >= 0) || (selectedStudentType === 'Helper' && rank < 0);
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

    const sortedStudents = Object.entries(studentTotals).sort(([, totalA], [, totalB]) => totalB - totalA);

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

    const maxTotal = Math.max(...formattedData.map((item) => item.total));

    return formattedData.map((item) => {
      let xOffset = 0;
      const processedRatings = Object.entries(item.ratings)
        .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
        .sort(([a], [b]) => {
          const f = (x: number) => (x >= 0 ? x : 10000 + -x);
          return f(parseInt(a, 10)) - f(parseInt(b, 10));
        })
        .map(([key, value]) => {
          const width = isRelativeMode ? (value / item.total) * (svgWidth - 120) : (value / maxTotal) * (svgWidth - 120);
          const x = xOffset;
          const percent = `${((value / item.total) * 100).toFixed(2)}%`;
          xOffset += width;
          return {
            rating: parseInt(key),
            value: value,
            width,
            x,
            percent,
            label: isRelativeMode ? percent : displayMode == 'average' ? value.toFixed(2) : value.toLocaleString(),
          };
        });
      return { ...item, processedRatings };
    });
  }, [rawRatingData, isRelativeMode, studentMap, svgWidth, allStudents, selectedSquadType, selectedTacticRole, selectedRaidIds, selectedStudentType, displayMode, selectedDifficulty]);

  // Create marks for the slider
  // const raidIds = Object.keys(raidInfo).map(Number).filter(id => !isNaN(id));

  const filteredRaidInfoByDifficulty = raidInfo
    .map((raid, index) => ({ ...raid, index }))
    .filter((raid) => {
      if (selectedDifficulty == 'All') return true;
      return selectedDifficulty in raid.Cnt;
    });

  const toFilteredRaidId = (origID: number) => {
    for (let i = 0; i < filteredRaidInfoByDifficulty.length; i++) {
      const raid = filteredRaidInfoByDifficulty[i];
      if (raid.index >= origID) return i;
    }
    return filteredRaidInfoByDifficulty.length - 1;
  };

  const labelMap: Record<number, React.ReactNode> = filteredRaidInfoByDifficulty.reduce(
    (map, raid, index) => {
      map[raid.index] = raidToString(raid, locale, true);
      return map;
    },
    {} as Record<number, React.ReactNode>,
  );

  const markMap: Record<number, React.ReactNode> = filteredRaidInfoByDifficulty.reduce(
    (map, raid, index) => {
      map[raid.index] = ' ';
      return map;
    },
    {} as Record<number, React.ReactNode>,
  );

  // animation
  useEffect(() => {
    if (!isPlaying || !filteredRaidInfoByDifficulty.length) {
      return;
    }

    const maxIndex = filteredRaidInfoByDifficulty[filteredRaidInfoByDifficulty.length - 1].index;

    const interval = setInterval(() => {
      setSelectedRaidIds((prevIds) => {
        if (prevIds[1] + 1 > maxIndex) {
          setIsPlaying(false);
          return prevIds;
        }
        return [prevIds[0] + 1, prevIds[1] + 1];
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, filteredRaidInfoByDifficulty]);

  if (loading) return <div>{t('loading_txt')}</div>;

  return (
    <div data-component-name="RankingChartPage" className="flex flex-col items-center justify-center py-6">
      <div className="w-full mx-auto p-4 sm:p-6 pt-0 sm:pt-0 bg-neutral-50 dark:bg-neutral-900  transition-colors duration-300">
        {/* header */}
        <div className="mb-1">
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
            {t('title')} ({server.toUpperCase()})
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{t('description1')}</p>
        </div>

        <hr className="my-3 border-neutral-200 dark:border-neutral-700" />

        {/* Control groups: Configure reactive layouts using grids */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3">
          {/* 1. Display Mode Section */}
          <div className="space-x-4">
            <h3 className="text-base mb-2 font-semibold text-neutral-800 dark:text-white">{t('control.display_mode')}</h3>
            <div className="flex flex-col sm:flex-row items-center gap-1">
              <div className="flex justify-between items-center w-full px-1 ">
                <ToggleButtonGroup
                  label={t('control.bar_option.name')}
                  options={[
                    { value: true, label: t('control.bar_option.percent') },
                    {
                      value: false,
                      label: t('control.bar_option.absolute'),
                    },
                  ]}
                  selectedValue={isRelativeMode}
                  onSelect={(val) => setIsRelativeMode(val)}
                />
              </div>
              <div className="flex justify-between items-center w-full  px-1">
                <ToggleButtonGroup
                  label={t('control.sum_option.name')}
                  options={[
                    {
                      value: 'total',
                      label: t('control.sum_option.display_total'),
                    },
                    {
                      value: 'average',
                      label: t('control.sum_option.display_average'),
                    },
                  ]}
                  selectedValue={displayMode}
                  onSelect={(val) => setDisplayMode(val as 'total' | 'average')}
                />
              </div>
            </div>
          </div>

          {/* 2. Detailed Filter */}
          <div data-component-name="RankingChartPage_DetailedFilter" className="space-y-2">
            <h3 className="text-base font-semibold text-neutral-800 dark:text-white">{t('filters')}</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 space-x-2">
              <div className="flex items-center space-x-2 py-0.5">
                <label htmlFor="student-type-select" className="text-sm font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                  {t('control.rank')}
                </label>
                <select
                  id="student-type-select"
                  value={selectedStudentType}
                  onChange={(e) => setSelectedStudentType(e.target.value)}
                  className="p-1 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-700 dark:text-white"
                >
                  <option value="All">{t('control.rank_all')}</option>
                  <option value="Normal">{t('control.rank_normal')}</option>
                  <option value="Helper">{t('control.rank_assist')}</option>
                </select>
              </div>

              <div className="flex items-center space-x-2 py-0.5">
                <label htmlFor="squad-type-select" className="text-sm font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                  {t('control.squad_type')}
                </label>
                <select
                  id="squad-type-select"
                  value={selectedSquadType}
                  onChange={(e) => setSelectedSquadType(e.target.value)}
                  className="p-1 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-700 dark:text-white"
                >
                  <option value="All">{t('control.squad_type_all')}</option>
                  <option value="Main">{t('control.squad_type_main')}</option>
                  <option value="Support">{t('control.squad_type_support')}</option>
                </select>
              </div>

              <div className="flex items-center space-x-2 py-0.5">
                <label htmlFor="squad-type-select" className="text-sm font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                  {t('control.difficulty')}
                </label>
                <select
                  id="squad-type-select"
                  value={selectedDifficulty}
                  onChange={(e) => {
                    const difficultySelect = e.target.value as DifficultySelect;
                    setSelectedDifficulty(difficultySelect);
                  }}
                  className="p-1 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-700 dark:text-white"
                >
                  <option value="All">{t('control.squad_type_all')}</option>
                  {difficultyInfo
                    .filter((v) => v.name != 'Extreme')
                    .map(({ name }) => (
                      <option value={name} key={name}>
                        {t_raids(name)}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center space-x-2 py-0.5">
                <label htmlFor="tactic-role-select" className="text-sm font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                  {t('control.tactic_role')}
                </label>
                <select
                  id="tactic-role-select"
                  value={selectedTacticRole}
                  onChange={(e) => setSelectedTacticRole(e.target.value)}
                  className="p-1 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-700 dark:text-white"
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

        <hr className="my-3 border-neutral-200 dark:border-neutral-700" />

        {/* 3. Raid Period Setting Slider Section */}
        <div data-component-name="RankingChartPage_Slider" className="w-full">
          <div className="flex justify-center items-center gap-x-3 mb-2">
            <h3 className="font-semibold text-neutral-800 dark:text-white select-none">{t('control.raid')}</h3>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={!filteredRaidInfoByDifficulty.length || selectedRaidIds[1] >= filteredRaidInfoByDifficulty[filteredRaidInfoByDifficulty.length - 1].index}
              className={`
                  w-5 h-5 flex items-center justify-center rounded-sm transition-colors duration-200
                  bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-neutral-900

                  ${
                    isPlaying
                      ? // Stop:
                        'text-blue-600 dark:text-blue-400'
                      : // Play
                        'text-neutral-600 dark:text-neutral-400'
                  }
                  disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed
                  dark:disabled:bg-neutral-800 dark:disabled:text-neutral-600
                `}
              aria-label={isPlaying ? 'Stop' : 'Play'}
            >
              <span>{isPlaying ? <StopIcon /> : <PlayIcon />}</span>
            </button>
          </div>
          <div className="px-2 select-none">
            <style>
              .rc-slider-dot{'{'}display: none{'}'}
            </style>
            <TooltipSlider
              range
              labelMap={labelMap}
              // min={0}
              min={filteredRaidInfoByDifficulty.length ? filteredRaidInfoByDifficulty[0].index : 0}
              // max={filteredRaidInfoByDifficulty.length - 1}
              max={filteredRaidInfoByDifficulty.length ? filteredRaidInfoByDifficulty[filteredRaidInfoByDifficulty.length - 1].index : 0}
              // defaultValue={selectedRaidIds.map(v => toFilteredRaidId(v))}
              value={selectedRaidIds}
              marks={markMap}
              step={null}
              onChange={(value) => {
                if (Array.isArray(value)) {
                  setSelectedRaidIds(value);
                }
              }}
            />
          </div>
          <div className="flex justify-between items-center text-xs sm:text-sm mt-3 text-neutral-600 dark:text-neutral-400">
            {filteredRaidInfoByDifficulty.length ? (
              <>
                <div className="text-left flex flex-col sm:flex-row">
                  {/* <div className="font-bold text-blue-600 dark:text-blue-400 sm:inline">{raidInfo[selectedRaidIds[0]].Id}</div> */}
                  <div className="font-bold text-blue-600 dark:text-blue-400 sm:inline">{filteredRaidInfoByDifficulty[toFilteredRaidId(selectedRaidIds[0])].Id}</div>
                  {/* <div className="sm:ml-2 sm:inline">{raidToStringTsx(filteredRaidInfoByDifficulty[Math.max(filteredRaidInfoByDifficulty[0].index, selectedRaidIds[0])], locale, true)}</div> */}
                  <div className="sm:ml-2 sm:inline">{raidToStringTsx(filteredRaidInfoByDifficulty[toFilteredRaidId(selectedRaidIds[0])], locale, true)}</div>
                </div>
                <div className="font-semibold text-neutral-800 dark:text-white px-2 whitespace-nowrap">
                  {/* {t('total_x', { 'x': selectedRaidIds[1] - selectedRaidIds[0] + 1 })} -  */}
                  {t('total_x').replace(
                    /{x}/,
                    `${((from: number, to: number) => {
                      if (!filteredRaidInfoByDifficulty.length) return 0;

                      const filteredMin = filteredRaidInfoByDifficulty[0].index;
                      if (from < filteredMin && to < filteredMin) return 0;

                      const filteredMax = filteredRaidInfoByDifficulty[filteredRaidInfoByDifficulty.length - 1].index;
                      if (from > filteredMax && to > filteredMax) return 0;

                      return toFilteredRaidId(to) - toFilteredRaidId(from) + 1;
                    })(selectedRaidIds[0], selectedRaidIds[1])}`,
                  )}
                  {/* {t('total_x')} */}
                </div>
                <div className="text-right flex flex-col sm:flex-row">
                  {/* <div className="font-bold text-blue-600 dark:text-blue-400">{raidInfo[selectedRaidIds[1]].Id}</div> */}
                  <div className="font-bold text-blue-600 dark:text-blue-400">{filteredRaidInfoByDifficulty[toFilteredRaidId(selectedRaidIds[1])].Id}</div>
                  {/* <div className="ml-2 sm:inline">{raidToStringTsx(filteredRaidInfoByDifficulty[Math.min(filteredRaidInfoByDifficulty[filteredRaidInfoByDifficulty.length-1].index, selectedRaidIds[1])], locale, true)}</div> */}
                  <div className="ml-2 sm:inline">{raidToStringTsx(filteredRaidInfoByDifficulty[toFilteredRaidId(selectedRaidIds[1])], locale, true)}</div>
                </div>
              </>
            ) : (
              <> {t('total_x').replace(/{x}/, '0')}</>
            )}
          </div>
        </div>
      </div>

      {/* Attach the ref to the container div */}
      <div className="w-full bg-white p-4 sm:p-6 rounded-lg shadow-xl overflow-x-auto dark:bg-neutral-800 dark:shadow-xl transition-colors duration-300 dark:text-neutral-300">
        <RankingChart svgWidth={svgWidth} containerRef={containerRef} processedData={processedData} displayMode={displayMode} isRelativeMode={isRelativeMode} />
      </div>
    </div>
  );
}
