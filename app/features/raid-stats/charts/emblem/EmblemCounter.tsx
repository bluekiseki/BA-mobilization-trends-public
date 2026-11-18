import { SheetIcon } from '~/components/common/SheetIcon';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import emblemDataList from '~/data/jp/emblem_counter/list.json';
// import Group_Name_Translation from '~/locales/club.json';
// const s_locale = Group_Name_Translation as any;
import { IoTriangleSharp } from 'react-icons/io5';
import { FiHash, FiTrendingUp, FiArrowUp, FiArrowDown } from 'react-icons/fi';
import type { TFunction } from 'i18next';
import EmblemTreemap from './EmblemTreemap';
import type { AggregationType, TreemapSourceEntry } from './types';
import { FavorTrendChart, type FavorTrendContextSeries, type FavorTrendMode, type FavorTrendPoint } from './FavorTrendChart';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';

const emblemDataModules = import.meta.glob(['/app/data/jp/emblem_counter/*.json', '!/app/data/jp/emblem_counter/list.json']);

export type EmblemCountEntry = [number, number, number, number];
export type EmblemCountData = EmblemCountEntry[];

export interface StudentMiniData {
  Id: number;
  Name: string;
  School: string;
  Club: string;
  StyleId?: number; // Present on internal combat/costume variant entries (e.g. Hoshino Armed) — not a real collectible student
}
export type StudentCollection = Record<string, StudentMiniData>;
export interface DisplayResult {
  name: string;
  count: number;
  percentage: number;
  iconId: number | null; // Student ID for the icon
  diff: number | null; // Difference from the previous dataset
}

const parseStudentName = (rawName: string): { baseName: string; seasonal: string | null } => {
  // const match = rawName.match(/(.+?)(?:\((.+)\))?$/);
  const match = rawName.match(/(.+?)\s*(?:[\(（](.+)[\)）])?$/);
  if (match) {
    return { baseName: match[1].trim(), seasonal: match[2]?.trim() || null };
  }
  return { baseName: rawName.trim(), seasonal: null };
};

const getAggregationKey = (student: StudentMiniData, aggregationType: AggregationType, t: TFunction<'emblemCounter'>): string => {
  switch (aggregationType) {
    case 'student_separate':
      return student.Name;
    case 'student_combined':
      return parseStudentName(student.Name).baseName;
    case 'club':
      return student.Club || t('etc', 'etc');
    case 'school':
      return student.School || t('etc', 'etc');
  }
};

const processEmblemData = (
  emblemData: EmblemCountData,
  studentData: StudentCollection,
  tierFilter: number,
  bondLevelFilter: number,
  aggregationType: AggregationType,
  t: TFunction<'emblemCounter'>,
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
    const studentId = entry[2];
    const student = studentData[String(studentId)];
    const count = entry[3];
    let key: string | null = null;
    let currentStudentIdForIcon: number | null = studentId;

    // Internal variant entry (StyleId set, e.g. Hoshino Armed) — not a real collectible student, so skip it
    if (student?.StyleId) return;

    if (!student) {
      key = `Unknown (${studentId})`;
      currentStudentIdForIcon = studentId;
    } else {
      key = getAggregationKey(student, aggregationType, t);
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

type DatasetListEntry = { name: string; date: string };

// Build per-timepoint series for several aggregation keys (student / club / school) at once,
// applying the same filters as the main table. `orderedList` must be oldest -> newest.
// One processEmblemData pass per dataset regardless of how many keys are requested.
const buildFavorTimelines = (
  allDatasets: Map<string, EmblemCountData>,
  orderedList: DatasetListEntry[],
  keys: string[],
  studentData: StudentCollection,
  tierFilter: number,
  bondLevelFilter: number,
  aggregationType: AggregationType,
  t: TFunction<'emblemCounter'>,
): Map<string, FavorTrendPoint[]> => {
  const out = new Map<string, FavorTrendPoint[]>();
  keys.forEach((k) => out.set(k, []));
  for (const item of orderedList) {
    const dataset = allDatasets.get(item.name);
    if (!dataset || dataset.length === 0) continue;
    const map = processEmblemData(dataset, studentData, tierFilter, bondLevelFilter, aggregationType, t);
    const total = Array.from(map.values()).reduce((sum, d) => sum + d.count, 0);
    for (const key of keys) {
      const count = map.get(key)?.count ?? 0;
      out.get(key)?.push({
        date: item.date,
        name: item.name,
        label: `${item.date.slice(0, 7)} (${item.name})`,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      });
    }
  }
  return out;
};

const NEIGHBOR_SPAN = 2; // rows above / below the clicked one drawn as context lines

export function EmblemCounter({}) {
  const { t, i18n } = useTranslation('emblemCounter');
  const { t: t_ui } = useTranslation('ui');
  const { t: t_d } = useTranslation('dashboard');
  const { t: t_s } = useTranslation('club');
  const { t: t_charts } = useTranslation('charts');
  // club.json / school names are a flat string map whose keys aren't statically known here.
  const translateGroup = t_s as unknown as (key: string) => string;

  const locale = i18n.language as Locale;

  const [dataList] = useState(emblemDataList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  const [emblemData, setEmblemData] = useState<EmblemCountData>([]);
  const [prevEmblemData, setPrevEmblemData] = useState<EmblemCountData>([]);

  const [studentData, setStudentData] = useState<StudentCollection>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(true); // Specific loader for data file changes
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(dataList[0].name);
  const [tierFilter, setTierFilter] = useState<number>(3);
  const [bondLevelFilter, setBondLevelFilter] = useState<number>(100);
  const [aggregationType, setAggregationType] = useState<AggregationType>('student_separate');
  const [sortKey, setSortKey] = useState<SortKey>('count');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Full history (all timepoints) for the expandable per-row trend chart.
  const [allDatasets, setAllDatasets] = useState<Map<string, EmblemCountData>>(new Map());
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [trendMode, setTrendMode] = useState<FavorTrendMode>('absolute');
  const allLoadStartedRef = useRef(false);

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

  // Lazily load every timepoint file once (≈250KB gzip total). Used by the row trend chart.
  const loadAllDatasets = useCallback(async () => {
    if (allLoadStartedRef.current) return;
    allLoadStartedRef.current = true;
    setIsLoadingAll(true);
    try {
      const entries = await Promise.all(
        (dataList as DatasetListEntry[]).map(async (item): Promise<[string, EmblemCountData]> => {
          const path = `/app/data/jp/emblem_counter/${item.name}.json`;
          const mod = emblemDataModules[path] as (() => Promise<{ default: EmblemCountData }>) | undefined;
          if (!mod) return [item.name, []];
          const loaded = await mod();
          return [item.name, loaded.default];
        }),
      );
      setAllDatasets(new Map(entries));
    } catch (err: unknown) {
      console.error('Error loading all emblem datasets:', err);
      allLoadStartedRef.current = false; // allow retry on next expand
    } finally {
      setIsLoadingAll(false);
    }
  }, [dataList]);

  const orderedList = useMemo(() => [...(dataList as DatasetListEntry[])].reverse(), [dataList]);

  const handleRowToggle = (name: string) => {
    setExpandedName((prev) => (prev === name ? null : name));
    void loadAllDatasets();
  };

  useEffect(() => {
    setIsLoading(true);
    fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`))
      .then((v) => v.json())
      .then((studentJson: unknown) => {
        setStudentData(studentJson as StudentCollection);
        setError(null);
      })
      .catch((err: unknown) => {
        console.error('Error loading static data:', err);
        setError(t('errorLoadingData', 'Error loading static data'));
      })
      .finally(() => setIsLoading(false));
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
      .catch((err: unknown) => {
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
    if (isLoading || !studentData || Object.keys(studentData).length === 0) {
      // console.log('displayData: [],', { isLoading, studentData });
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

    // Seed a zero-count entry for every student/club/school so items with no
    // occurrences still show up in the table.
    Object.values(studentData).forEach((student) => {
      if (!student || student.StyleId) return; // Skip missing data and internal variant entries (StyleId set)
      const key = getAggregationKey(student, aggregationType, t);
      if (!currentMap.has(key)) {
        currentMap.set(key, { count: 0, topStudentId: student.Id, maxCount: 0 });
      }
    });

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

      // Show every key, including students/clubs/schools with zero occurrences
      results.push({
        name: key,
        count: count,
        percentage: totalCount > 0 ? (count / totalCount) * 100 : 0,
        iconId: iconId,
        diff: diff, // Pass diff (which is null if no prev data)
      });
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
  }, [emblemData, prevEmblemData, studentData, tierFilter, bondLevelFilter, aggregationType, t, isLoading, sortKey, sortOrder]);

  // Trend chart for the expanded row: the clicked key as the primary line plus a few
  // nearby-rank keys as faint, non-interactive context lines.
  const { trendPrimary, trendContext } = useMemo((): { trendPrimary: FavorTrendPoint[]; trendContext: FavorTrendContextSeries[] } => {
    if (!expandedName || allDatasets.size === 0 || isLoading || Object.keys(studentData).length === 0) {
      return { trendPrimary: [], trendContext: [] };
    }
    const idx = displayData.findIndex((d) => d.name === expandedName);
    if (idx < 0) return { trendPrimary: [], trendContext: [] };
    const isGroup = aggregationType === 'club' || aggregationType === 'school';
    const groupT = t_s as unknown as (key: string) => string;
    const neighbors = displayData.slice(Math.max(0, idx - NEIGHBOR_SPAN), idx + NEIGHBOR_SPAN + 1).filter((d) => d.name !== expandedName);
    const timelines = buildFavorTimelines(allDatasets, orderedList, [expandedName, ...neighbors.map((d) => d.name)], studentData, tierFilter, bondLevelFilter, aggregationType, t);
    return {
      trendPrimary: timelines.get(expandedName) ?? [],
      trendContext: neighbors
        .map((d) => ({
          label: isGroup ? groupT(d.name) : d.name,
          iconId: d.iconId ?? undefined,
          points: timelines.get(d.name) ?? [],
        }))
        .filter((s) => s.points.length > 0),
    };
  }, [expandedName, allDatasets, orderedList, displayData, studentData, tierFilter, bondLevelFilter, aggregationType, t, t_s, isLoading]);

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
      const studentId = entry[2];
      const count = entry[3];
      // Accumulate to existing count
      studentCountMap.set(studentId, (studentCountMap.get(studentId) || 0) + count);
    });

    // 4. Convert aggregated data to TreemapSourceEntry[] format
    const sourceData: TreemapSourceEntry[] = [];
    studentCountMap.forEach((count, studentId) => {
      const student = studentData[String(studentId)];
      if (!student || student.StyleId) return; // Skip if student info is missing, or it's an internal variant entry (StyleId set)

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

          <EmblemTreemap data={treemapSourceData} totalCount={totalCount} t_s={t_s} aggregationType={aggregationType} />

          <div className="overflow-x-auto">
            {/* Added table-fixed for mobile layout */}
            <table className="w-full text-sm text-left text-neutral-700 dark:text-neutral-300 table-fixed">
              <thead className="text-xs text-neutral-500 dark:text-neutral-400 uppercase bg-neutral-50 dark:bg-neutral-700/50">
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
                      <span>{sortKey === 'count' ? t_ui('count') : t('change')}</span>

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
                {displayData.map((item, _index) => {
                  const r = sortKey == 'count' ? displayData.findIndex((v) => v.count === item.count) : displayData.findIndex((v) => v.diff === item.diff); // Find first rank with this count
                  const isExpanded = expandedName === item.name;
                  const displayName = aggregationType === 'club' || aggregationType === 'school' ? translateGroup(item.name) : item.name;
                  return (
                    <Fragment key={item.name}>
                      <tr
                        onClick={() => handleRowToggle(item.name)}
                        className={`dark:bg-neutral-800 border-b dark:border-neutral-700 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/30 ${isExpanded ? 'bg-neutral-50 dark:bg-neutral-700/30' : ''}`}
                      >
                        <td className="px-2 py-2 font-medium align-middle text-center">{r + 1}</td>
                        {/* Image cell with shrink-0 */}
                        <td className="py-1 px-0.5 align-middle">
                          {item.iconId ? (
                            <SheetIcon
                              sheet="student"
                              id={item.iconId}
                              alt=""
                              className="w-10 h-10 rounded-full"
                              fallback={<div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 inline-block"></div>}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 inline-block"></div>
                          )}
                        </td>
                        {/* Name cell with truncate */}
                        <td className="px-2 py-1 font-medium align-middle truncate" title={displayName}>
                          {displayName}
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
                      {isExpanded && (
                        <tr className="dark:bg-neutral-800 border-b dark:border-neutral-700">
                          <td colSpan={5} className="p-0">
                            <div className="flex flex-col gap-2 border-t border-blue-500/40 px-2 py-3 sm:px-4 animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-xs font-medium text-neutral-600 dark:text-neutral-400" title={displayName}>
                                  {displayName}
                                </span>
                                <div className="flex shrink-0 gap-1 text-xs">
                                  {(['percent', 'absolute'] as const).map((m) => (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTrendMode(m);
                                      }}
                                      className={`rounded px-2 py-1 font-medium transition-colors ${
                                        trendMode === m
                                          ? 'bg-ba-btn-blue text-black'
                                          : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                                      }`}
                                    >
                                      {m === 'percent' ? t_charts('heatmap.draw.unit.percent') : t_charts('heatmap.draw.unit.absolute')}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {isLoadingAll && allDatasets.size === 0 ? (
                                <div className="py-8 text-center text-sm text-neutral-500">{t('loading', 'loading')}</div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <FavorTrendChart series={trendPrimary} context={trendContext} mode={trendMode} />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
