import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import emblemDataList from '~/data/jp/emblem_counter/list.json';
import type { PortraitData } from '../dashboard/common';
// import Group_Name_Translation from '~/locales/club.json';
// const s_locale = Group_Name_Translation as any;
import { IoTriangleSharp } from 'react-icons/io5';
import { FiHash, FiTrendingUp, FiArrowUp, FiArrowDown } from 'react-icons/fi';
import type { TFunction } from 'i18next';
import EmblemTreemap from './EmblemTreemap';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';

const emblemDataModules = import.meta.glob('/app/data/jp/emblem_counter/*.json');

export type EmblemCountEntry = [number, number, number, number];
export type EmblemCountData = EmblemCountEntry[];

export interface StudentMiniData {
  Id: number;
  Name: string;
  School: string;
  Club: string;
}
export type StudentCollection = Record<string, StudentMiniData>;
export type AggregationType = 'student_separate' | 'student_combined' | 'club' | 'school';
export interface DisplayResult {
  name: string;
  count: number;
  percentage: number;
  iconId: number | null; // Student ID for the icon
  diff: number | null; // Difference from the previous dataset
}

export type TreemapSourceEntry = {
  school: string;
  club: string;
  baseName: string;
  seasonalName: string; // Student's unique name (e.g., "Akari (New Year)")
  count: number;
  iconId: number;
};

const parseStudentName = (rawName: string): { baseName: string; seasonal: string | null } => {
  // const match = rawName.match(/(.+?)(?:\((.+)\))?$/);
  const match = rawName.match(/(.+?)\s*(?:[\(（](.+)[\)）])?$/);
  if (match) {
    return { baseName: match[1].trim(), seasonal: match[2]?.trim() || null };
  }
  return { baseName: rawName.trim(), seasonal: null };
};

const processEmblemData = (
  emblemData: EmblemCountData,
  studentData: StudentCollection,
  tierFilter: number,
  bondLevelFilter: number,
  aggregationType: AggregationType,
  t: TFunction<'emblemCounter', undefined>,
): Map<string, { count: number; topStudentId: number | null; maxCount: number }> => {
  const aggregationMap = new Map<string, { count: number; topStudentId: number | null; maxCount: number }>();
  if (!emblemData || emblemData.length === 0) {
    return aggregationMap;
  }

  // 1. Filter entries based on selections
  const filteredEntries = emblemData.filter((entry) => {
    const [tier, bondLevel] = entry;
    if (bondLevelFilter !== bondLevel) return false;
    if (tierFilter === 4) return tier === 4;
    if (tierFilter === 3) return tier === 3 || tier === 4;
    if (tierFilter === 2) return tier === 3 || tier === 4 || tier === 2;
    if (tierFilter === 1) return tier === 3 || tier === 4 || tier === 2 || tier === 1;
    return false;
  });

  // 2. Aggregate data
  filteredEntries.forEach((entry) => {
    const studentId = Number(entry[2]);
    const student = studentData[String(studentId)];
    const count = entry[3];
    let key: string | null = null;
    let currentStudentIdForIcon: number | null = studentId;

    if (!student) {
      key = `Unknown (${studentId})`;
      currentStudentIdForIcon = studentId;
    } else {
      switch (aggregationType) {
        case 'student_separate':
          key = student.Name;
          break;
        case 'student_combined':
          key = parseStudentName(student.Name).baseName;
          break;
        case 'club':
          key = student.Club || t('etc', 'etc');
          break;
        case 'school':
          key = student.School || t('etc', 'etc');
          break;
      }
    }

    if (key) {
      const existing = aggregationMap.get(key) || {
        count: 0,
        topStudentId: null,
        maxCount: 0,
      };
      const newTotalCount = existing.count + count;
      let newTopStudentId = existing.topStudentId;
      let newMaxCount = existing.maxCount;

      if (aggregationType === 'club' || aggregationType === 'school') {
        if (count > newMaxCount) {
          newTopStudentId = currentStudentIdForIcon;
          newMaxCount = count;
        } else if (!newTopStudentId) {
          newTopStudentId = currentStudentIdForIcon;
        }
      } else {
        newTopStudentId = currentStudentIdForIcon;
      }

      aggregationMap.set(key, {
        count: newTotalCount,
        topStudentId: newTopStudentId,
        maxCount: newMaxCount,
      });
    }
  });

  return aggregationMap;
};

type SortKey = 'name' | 'count' | 'diff';
type SortOrder = 'asc' | 'desc';

export function EmblemCounter({}) {
  const { t, i18n } = useTranslation('emblemCounter');
  const { t: t_d } = useTranslation('dashboard');
  const { t: t_s } = useTranslation('club');

  const locale = i18n.language as Locale;
  // const t_s = (x: string) => {
  //   if (!s_locale[locale]) return x;
  //   if (!s_locale[locale][x]) return x;
  //   return s_locale[locale][x];
  // };

  const [dataList] = useState(emblemDataList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  const [emblemData, setEmblemData] = useState<EmblemCountData>([]);
  const [prevEmblemData, setPrevEmblemData] = useState<EmblemCountData>([]);

  const [studentData, setStudentData] = useState<StudentCollection>({});
  const [portraitData, setPortraitData] = useState<PortraitData>({}); // State for portraits
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(true); // Specific loader for data file changes
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(dataList[0].name);
  const [tierFilter, setTierFilter] = useState<number>(3);
  const [bondLevelFilter, setBondLevelFilter] = useState<number>(100);
  const [aggregationType, setAggregationType] = useState<AggregationType>('student_separate');
  const [sortKey, setSortKey] = useState<SortKey>('count');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = () => {
    if (sortKey === 'count') {
      if (sortOrder === 'desc') {
        // count desc -> count asc
        setSortOrder('asc');
      } else {
        // count asc -> diff desc
        setSortKey('diff');
        setSortOrder('desc');
      }
    } else {
      // sortKey === 'diff'
      if (sortOrder === 'desc') {
        // diff desc -> diff asc
        setSortOrder('asc');
      } else {
        // diff asc -> count desc
        setSortKey('count');
        setSortOrder('desc');
      }
    }
  };

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)).then((res) => res.json() as any),
      fetch(cdn('/w/students_portrait.json')).then((res) => res.json() as any),
    ])
      .then(([studentJson, portraitJson]) => {
        // studentJson[10131] = {
        //   Id: 10131,
        //   Name: 'Takane',
        //   Club: 'PublicationDepartment',
        //   School: 'RedWinter'
        // }
        setStudentData(studentJson);
        setPortraitData(portraitJson);
        setError(null);
      })
      .catch((err) => {
        console.error('Error loading static data:', err);
        setError(t('errorLoadingData', 'Error loading static data'));
      })
      .finally(() => setIsLoading(false)); // This only stops the *initial* load
  }, [locale, t]);

  // Effect 2: Load emblem data when selectedDate changes
  useEffect(() => {
    if (!selectedDate) return;

    setIsLoadingData(true);
    setError(null); // Clear previous errors

    // Find index of current and previous data files
    const currentIndex = dataList.findIndex((item) => item.name === selectedDate);
    const prevIndex = currentIndex + 1;

    // Construct the module path keys
    // These paths MUST exactly match the keys in emblemDataModules
    const currentModulePath = `/app/data/jp/emblem_counter/${selectedDate}.json`;
    const prevModulePath = prevIndex < dataList.length ? `/app/data/jp/emblem_counter/${dataList[prevIndex].name}.json` : null;

    // Check if the current module exists in our glob
    if (!emblemDataModules[currentModulePath]) {
      console.error(`Data module not found: ${currentModulePath}`);
      setError(t('errorLoadingData', 'Data module not found'));
      setIsLoadingData(false);
      return;
    }

    // Create dynamic import promises (no fetch)
    // We assume the JSON files use default export
    const currentDataPromise = (
      emblemDataModules[currentModulePath] as () => Promise<{
        default: EmblemCountData;
      }>
    )().then((module) => module.default);

    const prevDataPromise =
      prevModulePath && emblemDataModules[prevModulePath]
        ? (
            emblemDataModules[prevModulePath] as () => Promise<{
              default: EmblemCountData;
            }>
          )().then((module) => module.default)
        : Promise.resolve([]); // Resolve with empty array if no previous data

    Promise.all([currentDataPromise, prevDataPromise])
      .then(([currentJson, prevJson]) => {
        setEmblemData(currentJson);
        setPrevEmblemData(prevJson);
      })
      .catch((err) => {
        console.error('Error loading emblem data module:', err);
        setError(t('errorLoadingData', 'Error loading emblem data module'));
      })
      .finally(() => setIsLoadingData(false));
  }, [selectedDate, dataList, t]);

  const { displayData, totalCount, totalDelta, totalRaidPlayers } = useMemo((): {
    displayData: DisplayResult[];
    totalCount: number;
    totalDelta: number | null;
    totalRaidPlayers: number;
  } => {
    // Wait for all data to be ready
    if (isLoading || !studentData || Object.keys(studentData).length === 0 || Object.keys(portraitData).length === 0) {
      return {
        displayData: [],
        totalCount: 0,
        totalDelta: null,
        totalRaidPlayers: 20000,
      };
    }

    // Process both current and previous data with the same filters
    const currentMap = processEmblemData(emblemData, studentData, tierFilter, bondLevelFilter, aggregationType, t);
    const prevMap = processEmblemData(prevEmblemData, studentData, tierFilter, bondLevelFilter, aggregationType, t);

    // Check if there is actually previous data to compare against
    const hasPrevData = prevEmblemData.length > 0;

    // Get total count from *current* data for percentage calculation
    const totalCount = Array.from(currentMap.values()).reduce((sum, data) => sum + data.count, 0);
    const totalRaidPlayers = Array.from(processEmblemData(emblemData, studentData, 1, 0, aggregationType, t).values()).reduce((sum, data) => sum + data.count, 0);

    // Use all keys from both maps to include items that dropped to 0
    const allKeys = new Set([...currentMap.keys(), ...prevMap.keys()]);

    const results: DisplayResult[] = [];
    allKeys.forEach((key) => {
      const currentData = currentMap.get(key) || {
        count: 0,
        topStudentId: null,
        maxCount: 0,
      };
      const prevData = prevMap.get(key) || {
        count: 0,
        topStudentId: null,
        maxCount: 0,
      };

      const count = currentData.count;
      const prevCount = prevData.count;

      // Calculate diff only if prev data exists, otherwise set to null
      const diff = hasPrevData ? count - prevCount : null;

      const iconId = currentData.topStudentId || prevData.topStudentId;

      // Only show if it has a count now OR had a count before
      if (count > 0 || prevCount > 0) {
        results.push({
          name: key,
          count: count,
          percentage: totalCount > 0 ? (count / totalCount) * 100 : 0,
          iconId: iconId,
          diff: diff, // Pass diff (which is null if no prev data)
        });
      }
    });

    // Sort by current count descending
    // return results.sort((a, b) => b.count - a.count);
    results.sort((a, b) => {
      let valA: string | number | null = 0;
      let valB: string | number | null = 0;

      switch (sortKey) {
        case 'name':
          valA = a.name;
          valB = b.name;
          break;
        case 'diff':
          valA = a.diff ?? (sortOrder === 'asc' ? Infinity : -Infinity);
          valB = b.diff ?? (sortOrder === 'asc' ? Infinity : -Infinity);
          break;
        case 'count':
        default:
          valA = a.count;
          valB = b.count;
          break;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      return 0;
    });

    const totalDelta = Array.from(results.values()).reduce((sum, data) => sum + (data.diff || 0), 0);

    return {
      displayData: results,
      totalCount: totalCount,
      totalDelta,
      totalRaidPlayers,
    };
  }, [emblemData, prevEmblemData, studentData, portraitData, tierFilter, bondLevelFilter, aggregationType, t, isLoading, sortKey, sortOrder]);

  const treemapSourceData = useMemo((): TreemapSourceEntry[] => {
    // 1. Verify data load
    if (isLoading || !studentData || Object.keys(studentData).length === 0) {
      return [];
    }

    // 2. Filter current data (based on tier, bondLevel)
    const filteredEntries = emblemData.filter((entry) => {
      const [tier, bondLevel] = entry;
      if (bondLevelFilter !== bondLevel) return false;
      if (tierFilter === 4) return tier === 4;
      if (tierFilter === 3) return tier === 3 || tier === 4;
      if (tierFilter === 2) return tier === 3 || tier === 4 || tier === 2;
      if (tierFilter === 1) return tier === 3 || tier === 4 || tier === 2 || tier === 1;
      return false;
    });

    // 3. Aggregate counts based on Student ID (studentId) (Resolve duplication issue) [!!!]
    const studentCountMap = new Map<number, number>(); // <StudentId, total count>
    filteredEntries.forEach((entry) => {
      const studentId = Number(entry[2]);
      const count = entry[3];
      // Accumulate to existing count
      studentCountMap.set(studentId, (studentCountMap.get(studentId) || 0) + count);
    });

    // 4. Convert aggregated data to TreemapSourceEntry[] format
    const sourceData: TreemapSourceEntry[] = [];
    studentCountMap.forEach((count, studentId) => {
      const student = studentData[String(studentId)];
      if (!student) return; // Skip if student info is missing

      const { baseName } = parseStudentName(student.Name);

      sourceData.push({
        school: student.School || t('etc', 'etc'),
        club: student.Club || t('etc', 'etc'),
        baseName: baseName,
        seasonalName: student.Name,
        count: count,
        iconId: student.Id,
      });
    });

    return sourceData;
  }, [emblemData, studentData, tierFilter, bondLevelFilter, t, isLoading]); // 'aggregationType' dependency removed

  const totalPlayers = tierFilter === 4 ? 20000 : tierFilter === 3 ? 120000 : tierFilter === 2 ? 240000 : totalRaidPlayers;
  const possessionRate = totalCount <= totalPlayers && totalCount > 0 ? ((totalCount / totalPlayers) * 100).toFixed(2) : totalCount > totalPlayers ? '???' : '0.00';

  return (
    <div data-component-name="EmblemCounter" className=" border-neutral-200 dark:border-neutral-700 p-6 px-3 sm:px-6">
      <h2 className="text-xl font-bold mb-4 text-neutral-800 dark:text-white">{t('title')} (JP)</h2>
      <h2 className="text-sm font-light mb-4 text-neutral-600 dark:text-neutral-400">{t('description')}</h2>

      {/* --- Filter Options --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 text-sm">
        {/* Date Selection Dropdown */}
        <div>
          <label className="block font-medium mb-1 text-neutral-700 dark:text-neutral-300">{t('dataDate')}</label>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={isLoading} // Disable only during initial load
            className="w-full p-2 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600"
          >
            {dataList.map((item) => (
              <option key={item.name} value={item.name}>
                {item.date} ({item.name})
              </option>
            ))}
          </select>
        </div>

        {/* Tier Filter */}
        <div>
          <label className="block font-medium mb-1 text-neutral-700 dark:text-neutral-300">{t('rankRange')}</label>
          <select value={tierFilter} onChange={(e) => setTierFilter(Number(e.target.value))} className="w-full p-2 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600">
            <option value={4}>{t('in20k')}</option>
            <option value={3}>{t('in120k')}</option>
            <option value={2}>{t('in240k')}</option>
            <option value={1}>{t('overall')}</option>
          </select>
        </div>

        {/* Bond Level Filter */}
        <div>
          <label className="block font-medium mb-1 text-neutral-700 dark:text-neutral-300">{t('emblemType')}</label>
          <select value={bondLevelFilter} onChange={(e) => setBondLevelFilter(Number(e.target.value))} className="w-full p-2 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600">
            <option value={0}>{t('bond0')}</option>
            <option value={20}>{t('bond20')}</option>
            <option value={50}>{t('bond50')}</option>
            <option value={100}>{t('bond100')}</option>
          </select>
        </div>

        {/* Aggregation Filter */}
        <div>
          <label className="block font-medium mb-1 text-neutral-700 dark:text-neutral-300">{t('aggregationType')}</label>
          <select
            value={aggregationType}
            onChange={(e) => setAggregationType(e.target.value as AggregationType)}
            className="w-full p-2 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600"
          >
            <option value="student_separate">{t('byStudentSeparate')}</option>
            <option value="student_combined">{t('byStudentCombined')}</option>
            <option value="club">{t('byClub')}</option>
            <option value="school">{t('bySchool')}</option>
          </select>
        </div>
      </div>

      {/* Display Results Table */}
      {(isLoading || isLoadingData) && <div className="text-center py-4">{t('loading', 'loading')}</div>}
      {error && <div className="text-center py-4 text-red-500">{error}</div>}

      {!isLoading && !isLoadingData && !error && displayData.length > 0 && (
        <>
          <div className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">
            <span className="flex items-center">
              {t('emblemSummary', {
                counts: totalCount.toLocaleString(),
                rate: possessionRate,
              })}

              {totalDelta != null && (
                <span className={`ml-2 text-xs sm:text-sm font-medium ${totalDelta > 0 ? 'text-green-500' : totalDelta < 0 ? 'text-red-500' : 'text-neutral-500'}`}>
                  {<> (</>}
                  {totalDelta > 0 && <IoTriangleSharp size={12} className="inline mr-0.5" />}
                  {totalDelta < 0 && <IoTriangleSharp size={12} className="inline rotate-180 mr-0.5" />}
                  {((x: number) => {
                    return x > 0 ? x : -x;
                  })(totalDelta || 0)}
                  {<>)</>}
                </span>
              )}
            </span>
          </div>

          <EmblemTreemap data={treemapSourceData} totalCount={totalCount} t_s={t_s} portraitData={portraitData} aggregationType={aggregationType} />

          <div className="overflow-x-auto">
            {/* Added table-fixed for mobile layout */}
            <table className="w-full text-sm text-left text-neutral-700 dark:text-neutral-300 table-fixed">
              <thead className="text-xs text-neutral-500 dark:text-neutral-400 uppercase bg-gray-50 dark:bg-neutral-700/50">
                <tr>
                  <th scope="col" className="py-2 px-0 w-10 text-center">
                    #
                  </th>
                  <th scope="col" className="py-2 px-1 w-14"></th>
                  <th scope="col" className="px-4 py-2 w-auto">
                    {t(aggregationType)}
                  </th>
                  {/* <th scope="col" className="px-4 py-2 w-20 sm:w-32 text-right">{t('count')}</th> */}
                  <th
                    scope="col"
                    className="py-2 px-1 w-22 sm:w-32 text-right cursor-pointer group"
                    onClick={handleSort} // Attach the cycling handler
                    title={sortKey === 'count' ? t('sortByChange', 'sortByChange') : t('sortByCount', 'sortByCount')} // Tooltip for next action
                  >
                    <div className="flex items-center sm:justify-start justify-end gap-1">
                      {/* Dynamic Icon */}
                      {sortKey === 'count' ? <FiHash size={12} /> : <FiTrendingUp size={12} />}

                      {/* Dynamic Label */}
                      <span>{sortKey === 'count' ? t('count') : t('change')}</span>

                      {/* Sort Order Arrow */}
                      <span className="transition-opacity opacity-100">{sortOrder === 'desc' ? <FiArrowDown size={14} /> : <FiArrowUp size={14} />}</span>
                    </div>
                  </th>
                  <th scope="col" className="px-4 py-2 w-20 text-right">
                    {t('percentage')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayData.map((item, index) => {
                  const r = sortKey == 'count' ? displayData.findIndex((v) => v.count === item.count) : displayData.findIndex((v) => v.diff === item.diff); // Find first rank with this count
                  return (
                    <tr key={item.name} className=" dark:bg-neutral-800 border-b dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-700/30">
                      <td className="px-2 py-2 font-medium align-middle text-center">{r + 1}</td>
                      {/* Image cell with flex-shrink-0 */}
                      <td className="py-1 px-0.5 align-middle">
                        {item.iconId && portraitData[item.iconId] ? (
                          <img src={`data:image/webp;base64,${portraitData[item.iconId]}`} alt="" className="w-10 h-10 rounded-full object-cover block" loading="lazy" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-neutral-700 inline-block"></div>
                        )}
                      </td>
                      {/* Name cell with truncate */}
                      <td className="px-2 py-1 font-medium align-middle truncate">
                        {t_s(
                          t(item.name, {
                            ns: 'term',
                            defaultValue: item.name,
                          } as any),
                        )}
                      </td>
                      <td className="px-2 py-1 align-middle text-right">
                        {/* Responsive container: */}
                        {/* Mobile: flex-col, items-end (default) */}
                        {/* Desktop: sm:flex-row, sm:items-baseline, sm:justify-end */}
                        <div className="flex flex-col items-end sm:flex-row sm:items-baseline  sm:gap-x-1">
                          {/* 1. Count (Always larger) */}
                          <span className="font-semibold text-base text-black dark:text-white">{item.count.toLocaleString()}</span>

                          {/* 2. Change (conditionally rendered) */}
                          {/* Renders only if diff is not null (i.e., prev data existed) */}
                          {item.diff !== null && (
                            <span className={`flex items-center text-xs sm:text-sm font-medium ${item.diff > 0 ? 'text-green-500' : item.diff < 0 ? 'text-red-500' : 'text-neutral-500'}`}>
                              {<span className="hidden sm:inline">(</span>}
                              {item.diff > 0 && <IoTriangleSharp size={12} className="inline mr-0.5" />}
                              {item.diff < 0 && <IoTriangleSharp size={12} className="inline rotate-180 mr-0.5" />}
                              {((x: number) => {
                                return x > 0 ? x : -x;
                              })(item.diff || 0)}
                              {<span className="hidden sm:inline">)</span>}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 pr-4 py-1 text-right align-middle">{item.percentage.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!isLoading && !isLoadingData && !error && displayData.length === 0 && <div className="text-center py-4 text-neutral-500">{t_d('noData')}</div>}
    </div>
  );
}
