import { useEffect, useMemo, useState } from 'react';
import type { Character, ReportEntryRank, ReportStudentData } from '../../../../types/raidReport';
import { StudentIcon } from '../../../../components/student/studentIcon';
import { useTranslation } from 'react-i18next';
import { CompositionDetailView } from './compositionDetailView';
import { InfiniteScrollList } from '~/components/common/InfiniteScrollList';
import type { GameServer, RaidInfo } from '~/types/data';
import { RankScatterPlot } from './RankScatterPlot';
import { FaChevronDown } from 'react-icons/fa6';
import { FiVideo } from 'react-icons/fi';
import React from 'react';
import { CustomNumberInput } from '~/components/common/CustomInput';
import { CheckboxSelect } from '~/components/common/CheckboxSelect';
import { matchesScope, type VideoScope } from '../../common/video/videoMerge';
import { VideoMatchSection } from '../../common/video/VideoMatchSection';
import { useMergedVideos } from '../../common/video/useMergedVideos';
import { hasVideoPartyInfo } from '../../common/video/videoFilters';
import type { VideoEntry } from '../../common/video/types';
import { useStudentFilterSearch } from '../useStudentFilterSearch';
import { StudentFilterBar } from '../StudentFilterBar';
import { createStudentFilter, matchesStudentFilter, type StudentFilterState } from '../studentFilter';
import type { Locale } from '~/utils/i18n/config';
import { SheetIcon } from '~/components/common/SheetIcon';

// --- Types ---
interface TeamSnapshot {
  m: (Character | null)[];
  s: (Character | null)[];
}

interface PositionVariant {
  key: string;
  teams: TeamSnapshot[];
  count: number;
}

interface MulliganVariant {
  key: string;
  mulliganIdsByTeam: number[][]; // per-party mulligan IDs; in pick order when hasMulliganOrder
  count: number;
}

interface AggregatedComp {
  key: string;
  totalCount: number;
  ranks: number[];
  posVariants: PositionVariant[];
  mulVariants: MulliganVariant[];
  hasMulliganOrder: boolean;
}

interface FilterState {
  usePartyCount: boolean;
  minParty: number;
  maxParty: number;
  useTeamIndex: boolean;
  teamIndexDir: 'start' | 'end';
  teamIndexVal: number;
  excludeIncomplete: boolean;
  onlyWithVideo: boolean;
}

const MUL_OX_MAX_PER_TEAM = 3;

// --- Helper ---
const isValid = (c: Character | null): c is Character => c !== null && c !== undefined && Boolean(c.id);

export const CompositionChart: React.FC<{
  data: ReportEntryRank[];
  detailedData?: ReportEntryRank[];
  studentData: ReportStudentData;
  raidInfo: RaidInfo;
  server: GameServer;
  onScrollToFilter?: () => void;
  useDetailed: boolean;
  onUseDetailedChange: (v: boolean) => void;
}> = React.memo(({ data, detailedData, studentData, raidInfo, server, onScrollToFilter, useDetailed, onUseDetailedChange }) => {
  const { t, i18n } = useTranslation('dashboard'); // Translation hook
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;
  const [analysisUnit, setAnalysisUnit] = useState<'report' | 'team'>('report');
  const [selectedCompKey, setSelectedCompKey] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const [showIdOrder, setShowIdOrder] = useState(false);
  const [sortBy, setSortBy] = useState<'count' | 'bestRank'>('count');
  const merged = useMergedVideos(server, raidInfo.Id);
  const [videoScope, setVideoScope] = useState<VideoScope>('all');
  const videoData = merged.loaded ? merged.videos : null;
  const [studentFilter, setStudentFilter] = useState<StudentFilterState>(createStudentFilter);

  const matchingVideos = useMemo(() => {
    if (!videoData) return new Map<string, VideoEntry[]>();
    const map = new Map<string, VideoEntry[]>();
    for (const video of videoData) {
      // Only parties with real student IDs can match a composition.
      if (!hasVideoPartyInfo(video) || !matchesScope(video, videoScope)) continue;
      if (analysisUnit === 'report') {
        const key = video.parties
          .flat()
          .map((s) => s.id)
          .sort((a, b) => a - b)
          .join(',');
        if (!map.has(key)) map.set(key, []);
        map.get(key)?.push(video);
      } else {
        for (const party of video.parties) {
          if (!party.some((s) => Number.isInteger(s.id) && s.id > 0)) continue;
          const key = party
            .map((s) => s.id)
            .sort((a, b) => a - b)
            .join(',');
          if (!map.has(key)) map.set(key, []);
          map.get(key)?.push(video);
        }
      }
    }
    return map;
  }, [videoData, analysisUnit, videoScope]);

  const activeData = useDetailed && detailedData ? detailedData : data;

  // 1. Calculate data range
  const { globalMin, globalMax } = useMemo(() => {
    if (!activeData || activeData.length === 0) return { globalMin: 1, globalMax: 1 };
    let min = 99;
    let max = 0;
    for (let i = 0; i < activeData.length; i++) {
      const len = activeData[i].t.length;
      if (len < min) min = len;
      if (len > max) max = len;
    }
    return { globalMin: min, globalMax: max };
  }, [activeData]);

  const [filters, setFilters] = useState<FilterState>({
    usePartyCount: false,
    minParty: globalMin,
    maxParty: globalMax,
    useTeamIndex: false,
    teamIndexDir: 'start',
    teamIndexVal: 1,
    excludeIncomplete: false,
    onlyWithVideo: false,
  });

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      minParty: globalMin,
      maxParty: globalMax,
    }));
  }, [globalMin, globalMax]);

  // --- Aggregation Logic ---
  // Step 1: Basic filter (party count, team index) - Recalculate only when these values change
  const filteredData = useMemo(() => {
    const isReportMode = analysisUnit === 'report';
    const usePartyCount = filters.usePartyCount;
    const minP = filters.minParty;
    const maxP = filters.maxParty;
    const useTeamIdx = filters.useTeamIndex;
    const tDir = filters.teamIndexDir;
    const tVal = filters.teamIndexVal;

    const result: Array<{ targets: TeamSnapshot[]; entry: ReportEntryRank }> = [];

    for (let i = 0; i < activeData.length; i++) {
      const entry = activeData[i];
      const totalTeams = entry.t.length;

      if (usePartyCount) {
        if (totalTeams < minP || totalTeams > maxP) continue;
      }

      let targets: TeamSnapshot[] | null = null;

      if (isReportMode) {
        targets = entry.t;
      } else {
        if (useTeamIdx) {
          const idx = tDir === 'start' ? tVal - 1 : totalTeams - tVal;
          if (idx >= 0 && idx < totalTeams) {
            targets = [entry.t[idx]];
          }
        } else {
          targets = entry.t;
        }
      }

      if (targets) {
        result.push({ targets, entry });
      }
    }

    return result;
  }, [activeData, analysisUnit, filters.usePartyCount, filters.minParty, filters.maxParty, filters.useTeamIndex, filters.teamIndexDir, filters.teamIndexVal]);

  // Step 2: Composition generation (including excludeIncomplete filter)
  const compData = useMemo(() => {
    const compMap = new Map<string, AggregatedComp>();
    const isReportMode = analysisUnit === 'report';
    const excludeIncomplete = filters.excludeIncomplete;

    for (let i = 0; i < filteredData.length; i++) {
      const { targets, entry } = filteredData[i];

      if (isReportMode) {
        processGroup(targets, entry.typeRanking || entry.r, compMap, excludeIncomplete, true);
      } else {
        for (let j = 0; j < targets.length; j++) {
          processGroup([targets[j]], entry.typeRanking || entry.r, compMap, excludeIncomplete, false);
        }
      }
    }

    const sorted = Array.from(compMap.values())
      .map((g) => {
        g.posVariants.sort((a, b) => b.count - a.count);
        g.mulVariants.sort((a, b) => b.count - a.count);
        return g;
      })
      .sort((a, b) => {
        if (sortBy === 'bestRank') {
          return Math.min(...a.ranks) - Math.min(...b.ranks);
        }
        return b.totalCount - a.totalCount;
      });

    if (filters.onlyWithVideo && videoData) {
      return sorted.filter((comp) => (matchingVideos.get(comp.key)?.length ?? 0) > 0);
    }
    return sorted;
  }, [filteredData, analysisUnit, filters.excludeIncomplete, sortBy, filters.onlyWithVideo, matchingVideos, videoData]);

  const displayedCompData = useMemo(() => {
    if (analysisUnit !== 'team') return compData;
    return compData.filter((comp) => matchesStudentFilter([comp.key.split(',').map(Number)], studentFilter));
  }, [compData, analysisUnit, studentFilter]);

  const expandedCompEntries = useMemo(() => {
    if (!selectedCompKey) return [];
    return activeData.filter((e) => {
      const tot = e.t.length;
      if (filters.usePartyCount && (tot < filters.minParty || tot > filters.maxParty)) return false;

      let targets: TeamSnapshot[] = e.t;
      if (analysisUnit === 'team' && filters.useTeamIndex) {
        const idx = filters.teamIndexDir === 'start' ? filters.teamIndexVal - 1 : tot - filters.teamIndexVal;
        targets = e.t[idx] ? [e.t[idx]] : [];
      }

      const iterations = analysisUnit === 'report' ? [targets] : targets.map((t) => [t]);
      return iterations.some((currentTeams) => {
        const teams = filters.excludeIncomplete ? currentTeams.filter((t) => [...t.m, ...t.s].filter(isValid).length >= 6) : currentTeams;
        if (analysisUnit !== 'report' && teams.length < currentTeams.length) return false;
        const sortedIds = teams.flatMap((t) => [...t.m, ...t.s].filter(isValid).map((c) => c.id));
        if (sortedIds.length === 0) return false;
        if (analysisUnit === 'team' && !matchesStudentFilter([sortedIds], studentFilter)) return false;
        return sortedIds.sort((a, b) => a - b).join(',') === selectedCompKey;
      });
    });
  }, [selectedCompKey, activeData, filters, analysisUnit, studentFilter]);

  const studentUsageCounts = useMemo<Map<number, number>>(() => {
    const map = new Map<number, number>();
    for (const comp of compData) {
      const ids = comp.key.split(',').map(Number);
      for (const id of ids) {
        map.set(id, (map.get(id) ?? 0) + comp.totalCount);
      }
    }
    return map;
  }, [compData]);

  const { studentNames, searchFn } = useStudentFilterSearch(studentData, locale, studentUsageCounts);

  function processGroup(currentTeams: TeamSnapshot[], rank: number, compMap: Map<string, AggregatedComp>, excludeIncomplete: boolean, isReportMode: boolean) {
    const allMemberIds: number[] = [];
    const mulliganIdsByTeam: number[][] = [];
    let hasIndexData = false;
    const sortedCompIds: number[] = [];
    let hasIncomplete = false;

    const posKeyParts: string[] = [];

    for (const team of currentTeams) {
      let validCount = 0;
      const mIds: number[] = [];
      const teamMemberIds: number[] = [];

      for (const c of team.m) {
        if (c && c.id) {
          mIds.push(c.id);
          teamMemberIds.push(c.id);
          validCount++;
        } else {
          mIds.push(0);
        }
      }
      const sIds: number[] = [];
      for (const c of team.s) {
        if (c && c.id) {
          sIds.push(c.id);
          teamMemberIds.push(c.id);
          validCount++;
        } else {
          sIds.push(0);
        }
      }

      if (excludeIncomplete && validCount < 6) {
        if (isReportMode) {
          // report mode: Skip incomplete teams
          continue;
        } else {
          // team mode: Exclude incomplete teams
          hasIncomplete = true;
          break;
        }
      }

      // Add only verified teams
      for (const id of teamMemberIds) {
        allMemberIds.push(id);
        sortedCompIds.push(id);
      }
      const teamMulls = [...team.m, ...team.s].filter((c): c is Character => !!(c && teamMemberIds.includes(c.id) && (c.mulliganIndex !== undefined || c.isMulligan)));
      if (teamMulls.some((c) => c.mulliganIndex !== undefined)) {
        hasIndexData = true;
        teamMulls.sort((a, b) => (a.mulliganIndex ?? 999) - (b.mulliganIndex ?? 999));
      } else {
        teamMulls.sort((a, b) => a.id - b.id);
      }
      mulliganIdsByTeam.push(teamMulls.map((c) => c.id));
      posKeyParts.push(`${mIds.join(',')}|${sIds.join(',')}`);
    }

    if (hasIncomplete || allMemberIds.length === 0) return;

    sortedCompIds.sort((a, b) => a - b);
    const compKey = sortedCompIds.join(',');

    let group = compMap.get(compKey);
    if (!group) {
      group = {
        key: compKey,
        totalCount: 0,
        ranks: [],
        posVariants: [],
        mulVariants: [],
        hasMulliganOrder: false,
      };
      compMap.set(compKey, group);
    }
    group.totalCount++;
    group.ranks.push(rank);

    const posKey = posKeyParts.join('_');
    let posVar = group.posVariants.find((v) => v.key === posKey);
    if (!posVar) {
      const teamsForDisplay = excludeIncomplete ? currentTeams.filter((team) => [...team.m, ...team.s].filter(isValid).length >= 6) : currentTeams;
      posVar = { key: posKey, teams: teamsForDisplay, count: 0 };
      group.posVariants.push(posVar);
    }
    posVar.count++;

    if (hasIndexData) group.hasMulliganOrder = true;
    const mulKey = mulliganIdsByTeam.map((ids) => ids.join(',')).join('|');
    let mulVar = group.mulVariants.find((v) => v.key === mulKey);
    if (!mulVar) {
      mulVar = { key: mulKey, mulliganIdsByTeam, count: 0 };
      group.mulVariants.push(mulVar);
    }
    mulVar.count++;
  }

  // const handleNumInput = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
  const handleNumInput = (setter: (v: number) => void) => (e: number | null) => {
    const val = Number(e); //parseInt();
    if (!isNaN(val)) setter(val);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4">
      {/* --- Control Panel --- */}
      <div className="text-sm">
        {/* Row 1: Display and Sort */}
        <div className="flex flex-wrap gap-2 items-center pb-3 ">
          {/* Analysis Unit */}
          <div className="flex border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-sm">
            {(['team', 'report'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setAnalysisUnit(mode)}
                className={`px-3 py-1.5 text-xs font-medium transition-all border-r last:border-r-0 border-neutral-200 dark:border-neutral-700
                  ${
                    analysisUnit === mode
                      ? 'bg-ba-btn-blue text-black border-ba-btn-blue'
                      : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 cursor-pointer'
                  }`}
              >
                {t(`composition.mode_${mode}`)}
              </button>
            ))}
          </div>

          {/* Sort Criteria */}
          <div className="flex border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-sm">
            {(['count', 'bestRank'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSortBy(mode)}
                className={`px-3 py-1.5 text-xs font-medium transition-all border-r last:border-r-0 border-neutral-200 dark:border-neutral-700
                  ${
                    sortBy === mode
                      ? 'bg-ba-btn-blue text-black border-ba-btn-blue'
                      : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 cursor-pointer'
                  }`}
              >
                {t(`composition.sort_${mode}`)}
              </button>
            ))}
          </div>

          {/* Ignore Positioning */}
          <label
            className={`flex items-center gap-1.5 cursor-pointer px-2.5 py-1.5 border shadow-sm transition-all
              ${
                showIdOrder
                  ? 'bg-ba-btn-blue text-black border-ba-btn-blue'
                  : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-700'
              }`}
          >
            <input type="checkbox" checked={showIdOrder} onChange={(e) => setShowIdOrder(e.target.checked)} className="" />
            <span className="text-xs font-medium">{t('composition.ignore_position')}</span>
          </label>
        </div>

        {/* Row 2: Data Filter */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 items-center pb-3 pt-2 border-t border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-1.5">
            <input type="checkbox" id="usePartyCount" checked={filters.usePartyCount} onChange={(e) => setFilters((p) => ({ ...p, usePartyCount: e.target.checked }))} className="" />
            <label htmlFor="usePartyCount" className={`cursor-pointer ${filters.usePartyCount ? 'text-neutral-700 dark:text-neutral-200' : 'text-neutral-400'}`}>
              {t('composition.total_parties')}:
            </label>
            <CustomNumberInput
              // type="number"
              className="w-11 px-1 py-0.5 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-center text-xs disabled:opacity-40"
              disabled={!filters.usePartyCount}
              value={filters.minParty}
              min={globalMin}
              max={globalMax}
              onChange={handleNumInput((v) => setFilters((p) => ({ ...p, minParty: v })))}
            />
            <span className="text-neutral-400">~</span>
            <CustomNumberInput
              // type="number"
              className="w-11 px-1 py-0.5 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-center text-xs disabled:opacity-40"
              disabled={!filters.usePartyCount}
              value={filters.maxParty}
              min={globalMin}
              max={globalMax}
              onChange={handleNumInput((v) => setFilters((p) => ({ ...p, maxParty: v })))}
            />
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={filters.excludeIncomplete} onChange={(e) => setFilters((p) => ({ ...p, excludeIncomplete: e.target.checked }))} className="" />
            <span className="text-neutral-600 dark:text-neutral-300">{t('composition.full_party_only')}</span>
          </label>

          {detailedData && (
            <div className="flex items-center gap-1.5">
              <input type="checkbox" checked={useDetailed} onChange={(e) => onUseDetailedChange(e.target.checked)} className="cursor-pointer" />
              <button type="button" onClick={onScrollToFilter} className="text-left  underline  cursor-help transition-colors">
                {t('composition.table_filter_reflect')}
              </button>
            </div>
          )}

          {merged.referenceRaidId && (
            <div className="flex min-h-11 items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200 sm:min-h-7">
              <span>{t('videos_scope_label')}</span>
              <CheckboxSelect<VideoScope>
                ariaLabel={t('videos_scope_label')}
                options={[
                  { value: server === 'jp' ? 'current' : 'reference', label: 'JP' },
                  { value: server === 'kr' ? 'current' : 'reference', label: 'GL·KR' },
                ]}
                selectedValues={new Set<VideoScope>(videoScope === 'all' ? ['current', 'reference'] : videoScope === 'none' ? [] : [videoScope])}
                onChange={(values) => {
                  if (values.has('current') && values.has('reference')) setVideoScope('all');
                  else if (values.has('current')) setVideoScope('current');
                  else if (values.has('reference')) setVideoScope('reference');
                  else setVideoScope('none');
                }}
                buttonClassName="flex min-h-11 min-w-32 items-center justify-between gap-2 border border-neutral-300 bg-white px-2 text-base text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 sm:min-h-7 sm:text-sm"
              />
            </div>
          )}

          {videoData && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={filters.onlyWithVideo} onChange={(e) => setFilters((p) => ({ ...p, onlyWithVideo: e.target.checked }))} className="" />
              <span className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300">
                <FiVideo size={12} />
                {t('composition.only_with_video')} [BETA]
              </span>
            </label>
          )}
        </div>

        {/* Row 3: Specific Team (team mode only) */}
        {analysisUnit === 'team' && (
          <div className="flex flex-wrap items-center gap-2 pb-3 pt-2 border-t border-neutral-200 dark:border-neutral-700">
            <input type="checkbox" id="useTeamIndex" checked={filters.useTeamIndex} onChange={(e) => setFilters((p) => ({ ...p, useTeamIndex: e.target.checked }))} className="" />
            <label htmlFor="useTeamIndex" className={`cursor-pointer ${filters.useTeamIndex ? 'text-neutral-700 dark:text-neutral-200' : 'text-neutral-400'}`}>
              {t('composition.specific_team')}:
            </label>
            <select
              disabled={!filters.useTeamIndex}
              value={filters.teamIndexDir}
              onChange={(e) => setFilters((p) => ({ ...p, teamIndexDir: e.target.value as 'start' | 'end' }))}
              className="px-2 py-0.5 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-xs disabled:opacity-40"
            >
              <option value="start">{t('composition.from_start')}</option>
              <option value="end">{t('composition.from_end')}</option>
            </select>
            <span className="text-neutral-400">#</span>
            <CustomNumberInput
              // type="number"
              className="w-11 px-1 py-0.5 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-center text-xs disabled:opacity-40"
              disabled={!filters.useTeamIndex}
              value={filters.teamIndexVal}
              min={1}
              onChange={handleNumInput((v) => setFilters((p) => ({ ...p, teamIndexVal: v })))}
            />
          </div>
        )}

        {/* Row 4: Student pool filter (team mode only) */}
        {analysisUnit === 'team' && (
          <div className="flex flex-col gap-2 pb-3 pt-2 border-t border-neutral-200 dark:border-neutral-700">
            <StudentFilterBar
              filter={studentFilter}
              onChange={setStudentFilter}
              studentNames={studentNames}
              searchFn={searchFn}
              usageCounts={studentUsageCounts}
              filteredCount={displayedCompData.length}
              totalCount={compData.length}
              compact
            />
          </div>
        )}
      </div>

      {/* --- List Rendering --- */}
      {displayedCompData.slice(0, visibleCount).map((comp, i) => {
        const topPos = comp.posVariants[0];
        const topMul = comp.mulVariants[0];
        const isExpanded = selectedCompKey === comp.key;
        const videoMatches = matchingVideos.get(comp.key) ?? [];

        return (
          <div
            data-component-name="CompositionChart"
            key={`${comp.key}-${i}`}
            className={`bg-white dark:bg-neutral-800 p-1 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-teal-500 transition-all ${isExpanded ? 'ring-1 ring-teal-500' : ''}`}
          >
            <div
              className="group flex flex-col items-center md:flex-row md:items-center gap-4 cursor-pointer p-2 rounded-lg transition-colors "
              onClick={() => setSelectedCompKey((prev) => (prev === comp.key ? null : comp.key))}
            >
              {/* --- Left: Character icon area --- */}
              <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto items-center md:items-start">
                {topPos.teams.map((team, tIdx) => {
                  const teamMulIds = topMul.mulliganIdsByTeam[tIdx] ?? [];
                  const members = [...team.m, ...team.s].filter((c): c is Character => !!c?.id);
                  const displayed = showIdOrder ? [...members].sort((a, b) => a.id - b.id) : members;
                  return (
                    <div key={tIdx} className="flex gap-2 relative justify-center md:justify-start">
                      {analysisUnit === 'report' && <div className="hidden md:block absolute -left-5 top-1/2 -translate-y-1/2 text-xs font-mono text-neutral-400 -rotate-90">T{tIdx + 1}</div>}

                      <div className="grid grid-cols-[repeat(6,minmax(0,3.5rem))] gap-2">
                        {displayed.map((char, idx) => {
                          const mulIdx = teamMulIds.indexOf(char.id);
                          const mulProps = mulIdx >= 0 ? (comp.hasMulliganOrder ? { mulliganIndex: mulIdx } : { isMulligan: true as const }) : {};
                          return (
                            <div key={idx} className="relative w-full">
                              <StudentIcon character={{ id: char.id, CombatStyleIndex: char.CombatStyleIndex, ...mulProps } as Character} student={studentData[char.id]} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex-1 w-full flex flex-col justify-center shrink-0 min-w-0 text-center md:text-left">
                <div className="flex justify-between items-baseline mb-0 mx-1.5 px-1">
                  <span className="text-neutral-700 dark:text-neutral-100 text-base font-bold">{((comp.totalCount / activeData.length) * 100).toFixed(1)}%</span>
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{comp.totalCount.toLocaleString()}</span>
                </div>
                {/* {activeData.length}-{activeData[activeData.length - 1].r }-{activeData[0].r}-{console.log(activeData) || '1'} */}
                <RankScatterPlot
                  ranks={comp.ranks}
                  start_rank={activeData.length ? activeData[0]?.typeRanking || activeData[0].r : 1}
                  max_rank={activeData.length > 1 ? (activeData[activeData.length - 1]?.typeRanking || activeData[activeData.length - 1].r) - (activeData[0]?.typeRanking || activeData[0].r) + 1 : 1}
                />
              </div>

              <div className="hidden md:flex items-center justify-center px-2 text-neutral-400 gap-2">
                {videoMatches.length > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-neutral-500 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-600 rounded px-1.5 py-0.5">
                    <FiVideo size={11} />
                    <span className="font-mono">{videoMatches.length}</span>
                  </span>
                )}
                <FaChevronDown className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} size={16} />
              </div>
            </div>

            {isExpanded && (
              <div className="mt-4 pt-4 border-t border-dashed border-neutral-200 dark:border-neutral-700 animate-fadeIn">
                <CompositionDetailView
                  comp={{
                    ...comp,
                    percentage: (comp.totalCount / activeData.length) * 100,
                    count: comp.totalCount,
                    ids: comp.key.split(',').map(Number),
                    displayChars: [],
                  }}
                  analysisUnit={analysisUnit}
                  rankRange={{
                    start: activeData.length ? activeData[0]?.typeRanking || activeData[0].r : 1,
                    max: activeData.length > 1 ? (activeData[activeData.length - 1]?.typeRanking || activeData[activeData.length - 1].r) - (activeData[0]?.typeRanking || activeData[0].r) + 1 : 1,
                  }}
                  partyLayout={topPos.teams.map((team) => [...team.m, ...team.s].filter(isValid).map((c) => c.id))}
                  entries={expandedCompEntries}
                  studentData={studentData}
                  raidInfo={raidInfo}
                  boss={raidInfo.Boss}
                  server={server}
                  id={raidInfo.Id}
                  onClose={() => setSelectedCompKey(null)}
                />
                {/* 
                <div className="mt-3 flex justify-end">
                  <YouTubeSearchGenerator
                    raidInfo={raidInfo}
                    showType={raidInfo.Type ? true : false}
                    partyStudentIds={topPos.teams.map((team) =>
                      [...team.m, ...team.s].filter((c): c is NonNullable<typeof c> => !!c?.id).map((c) => c.id)
                    )}
                  />
                </div> */}

                {videoMatches.length > 0 && (
                  <>
                    <div className="my-4 border-t dark:border-neutral-700"></div>
                    <VideoMatchSection videos={videoMatches} studentData={studentData} />
                  </>
                )}
                <div className="my-4 border-t dark:border-neutral-700"></div>
                <VariantStats comp={comp} studentData={studentData} />
              </div>
            )}
          </div>
        );
      })}

      {visibleCount < displayedCompData.length && (
        <button onClick={() => setVisibleCount((p) => p + 20)} className="w-full py-2 bg-neutral-200 dark:bg-neutral-700 rounded">
          {t_ui('loadMore')}
        </button>
      )}
    </div>
  );
});

// --- Extracted Component: VariantStats ---
const VariantStats: React.FC<{
  comp: AggregatedComp;
  studentData: ReportStudentData;
}> = ({ comp }) => {
  const { t } = useTranslation('dashboard');
  const [mulView, setMulView] = useState<'order' | 'ox'>('order');

  const oxVariants = useMemo(() => {
    if (!comp.hasMulliganOrder) return comp.mulVariants;
    const map = new Map<string, MulliganVariant>();
    for (const v of comp.mulVariants) {
      const oxIdsByTeam = v.mulliganIdsByTeam.map((ids) => [...ids].slice(0, MUL_OX_MAX_PER_TEAM).sort((a, b) => a - b));
      const oxKey = oxIdsByTeam.map((ids) => ids.join(',')).join('|');
      const existing = map.get(oxKey);
      if (existing) {
        existing.count += v.count;
      } else {
        map.set(oxKey, { key: oxKey, mulliganIdsByTeam: oxIdsByTeam, count: v.count });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [comp.mulVariants, comp.hasMulliganOrder]);

  const displayedMulVariants = !comp.hasMulliganOrder || mulView === 'ox' ? oxVariants : comp.mulVariants;

  return (
    <div data-component-name="VariantStats" className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <div>
        <h4 className="font-bold mb-2 text-neutral-600 dark:text-neutral-400">{t('composition.placement_variants')}</h4>
        <InfiniteScrollList
          items={comp.posVariants}
          className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar p-1"
          renderItem={(v, idx) => (
            <li key={idx} className="flex items-center justify-between p-2 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-100 dark:border-neutral-700">
              <div className="flex flex-col gap-1">
                {v.teams.map((team, tIdx) => (
                  <div key={tIdx} className="flex -space-x-1 scale-90 origin-left">
                    {[...team.m, ...team.s].map((c, ci) => (
                      <div key={ci} className="w-11 h-11 rounded-sm border-white dark:border-neutral-600 overflow-hidden">
                        {c && <SheetIcon sheet="student" id={c.id} alt="" />}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <span className="text-xs font-mono ml-2 whitespace-nowrap">
                {v.count} <span className="text-neutral-400">({Math.round((v.count / comp.totalCount) * 100)}%)</span>
              </span>
            </li>
          )}
        />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="font-bold text-neutral-600 dark:text-neutral-400">{t('composition.mulligan_variants')}</h4>
          {comp.hasMulliganOrder && (
            <div className="flex border border-neutral-200 dark:border-neutral-600 overflow-hidden text-xs">
              <button
                onClick={() => setMulView('order')}
                className={`px-2 py-0.5 transition-colors ${mulView === 'order' ? 'bg-ba-btn-blue text-black' : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer'}`}
              >
                {t('composition.mulligan_view_order')}
              </button>
              <button
                onClick={() => setMulView('ox')}
                className={`px-2 py-0.5 border-l border-neutral-200 dark:border-neutral-600 transition-colors ${mulView === 'ox' ? 'bg-ba-btn-blue text-black' : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer'}`}
              >
                O/X
              </button>
            </div>
          )}
        </div>
        <InfiniteScrollList
          items={displayedMulVariants}
          className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar p-1"
          renderItem={(v, idx) => (
            <li key={idx} className="flex items-center justify-between p-2 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-100 dark:border-neutral-700">
              <div className="flex flex-col gap-1">
                {v.mulliganIdsByTeam.map((teamIds, tIdx) => (
                  <div key={tIdx} className="flex items-center gap-1 flex-wrap">
                    {teamIds.length === 0 ? (
                      <span className="text-neutral-400 text-xs">-</span>
                    ) : (
                      teamIds.map((id, pickIdx) => (
                        <div key={id} className="relative">
                          <div
                            className={`w-10 h-10 rounded-full overflow-hidden border-2 box-border ${
                              comp.hasMulliganOrder && mulView === 'order'
                                ? pickIdx >= 3
                                  ? 'border-blue-400 dark:border-[#71fdff]'
                                  : 'border-yellow-500 dark:border-yellow-200'
                                : 'border-yellow-500 dark:border-yellow-200'
                            }`}
                          >
                            <SheetIcon sheet="student" id={id} alt="" />
                          </div>
                          {comp.hasMulliganOrder && mulView === 'order' && (
                            <div
                              className="absolute top-0 right-0 z-10 text-[8px] font-bold leading-none px-0.5"
                              style={{
                                backgroundColor: pickIdx >= 3 ? '#5cc8fa' : '#fff26a',
                                color: pickIdx >= 3 ? '#153f5b' : '#80522d',
                              }}
                            >
                              {pickIdx + 1}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
              <span className="text-xs font-mono ml-2 whitespace-nowrap">
                {v.count} <span className="text-neutral-400">({Math.round((v.count / comp.totalCount) * 100)}%)</span>
              </span>
            </li>
          )}
        />
      </div>
    </div>
  );
};
