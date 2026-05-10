import { useEffect, useMemo, useState } from 'react';
import type { Character, PortraitData, ReportEntryRank, StudentData } from '../common';
import { StudentIcon } from '../studentIcon';
import { useTranslation } from 'react-i18next';
import { CompositionDetailView } from './compositionDetailView';
import type { GameServer, RaidInfo } from '~/types/data';
import { RankScatterPlot } from './RankScatterPlot';
import { FaChevronDown } from 'react-icons/fa6';
import { FiVideo } from 'react-icons/fi';
import React from 'react';
import { CustomNumberInput } from '~/components/CustomInput';
import { StarRating } from '~/components/StarRatingProps';
import { cdn } from '~/utils/cdn';

// --- Video Data Types ---
interface VideoStudent {
  id: number;
  name_ja: string;
  name_en: string;
  grade: string;
}

interface VideoEntry {
  url: string;
  title: string;
  score: number;
  difficulty: string;
  has_tl: boolean;
  boss_types: string[];
  is_target_type: boolean;
  num_parties: number;
  parties: VideoStudent[][];
  channel_name: string;
  channel_id: string;
}

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
  mulliganIds: number[];
  count: number;
}

interface AggregatedComp {
  key: string;
  totalCount: number;
  ranks: number[];
  posVariants: PositionVariant[];
  mulVariants: MulliganVariant[];
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

// --- Helper ---
const isValid = (c: Character | null): c is Character => c !== null && c !== undefined && Boolean(c.id);

export const CompositionChart: React.FC<{
  data: ReportEntryRank[];
  detailedData?: ReportEntryRank[];
  studentData: StudentData;
  portraitData: PortraitData;
  raidInfo: RaidInfo;
  server: GameServer;
  onScrollToFilter?: () => void;
  useDetailed: boolean;
  onUseDetailedChange: (v: boolean) => void;
}> = React.memo(({ data, detailedData, studentData, portraitData, raidInfo, server, onScrollToFilter, useDetailed, onUseDetailedChange }) => {
  const { t } = useTranslation('dashboard'); // Translation hook
  const [analysisUnit, setAnalysisUnit] = useState<'report' | 'team'>('report');
  const [selectedCompKey, setSelectedCompKey] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const [showIdOrder, setShowIdOrder] = useState(false);
  const [sortBy, setSortBy] = useState<'count' | 'bestRank'>('count');
  const [videoData, setVideoData] = useState<VideoEntry[] | null>(null);

  useEffect(() => {
    // const filename = ;
    fetch(cdn(`/video/raid-${server}-${raidInfo.Id}.json`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setVideoData(data as VideoEntry[]);
      })
      .catch(() => {});
  }, [server, raidInfo.Id]);

  const matchingVideos = useMemo(() => {
    if (!videoData) return new Map<string, VideoEntry[]>();
    const map = new Map<string, VideoEntry[]>();
    for (const video of videoData) {
      if (analysisUnit === 'report') {
        const key = video.parties
          .flat()
          .map((s) => s.id)
          .sort((a, b) => a - b)
          .join(',');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(video);
      } else {
        for (const party of video.parties) {
          const key = party
            .map((s) => s.id)
            .sort((a, b) => a - b)
            .join(',');
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(video);
        }
      }
    }
    return map;
  }, [videoData, analysisUnit]);

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

  function processGroup(currentTeams: TeamSnapshot[], rank: number, compMap: Map<string, AggregatedComp>, excludeIncomplete: boolean, isReportMode: boolean) {
    const allMemberIds: number[] = [];
    const mulliganIds: number[] = [];
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
      for (const c of [...team.m, ...team.s]) {
        if (c && teamMemberIds.includes(c.id) && c.isMulligan) {
          mulliganIds.push(c.id);
        }
      }
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
      };
      compMap.set(compKey, group);
    }
    group.totalCount++;
    group.ranks.push(rank);

    const posKey = posKeyParts.join('_');
    let posVar = group.posVariants.find((v) => v.key === posKey);
    if (!posVar) {
      posVar = { key: posKey, teams: currentTeams, count: 0 };
      group.posVariants.push(posVar);
    }
    posVar.count++;

    mulliganIds.sort((a, b) => a - b);
    const mulKey = mulliganIds.join(',');
    let mulVar = group.mulVariants.find((v) => v.key === mulKey);
    if (!mulVar) {
      mulVar = { key: mulKey, mulliganIds, count: 0 };
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
    <div className="w-full max-w-5xl mx-auto space-y-4">
      {/* --- Control Panel --- */}
      <div className="text-sm overflow-hidden ">
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
                      ? 'bg-bluearchive-botton-blue text-black border-bluearchive-botton-blue'
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
                      ? 'bg-bluearchive-botton-blue text-black border-bluearchive-botton-blue'
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
                  ? 'bg-bluearchive-botton-blue text-black border-bluearchive-botton-blue'
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
                {t('composition.table_filter_reflect')} [New]
              </button>
            </div>
          )}

          {videoData && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={filters.onlyWithVideo} onChange={(e) => setFilters((p) => ({ ...p, onlyWithVideo: e.target.checked }))} className="" />
              <span className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300">
                <FiVideo size={12} />
                {t('composition.only_with_video')} [NEW]
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
              onChange={(e) => setFilters((p) => ({ ...p, teamIndexDir: e.target.value as any }))}
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
      </div>

      {/* --- List Rendering --- */}
      {compData.slice(0, visibleCount).map((comp, i) => {
        const topPos = comp.posVariants[0];
        const topMul = comp.mulVariants[0];
        const isExpanded = selectedCompKey === comp.key;
        const videoMatches = matchingVideos.get(comp.key) ?? [];

        return (
          <div
            data-component-name="CompositionChart"
            key={comp.key}
            className={`bg-white dark:bg-neutral-800 p-1 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-teal-500 transition-all ${isExpanded ? 'ring-2 ring-teal-500' : 'hover:scale-101'}`}
          >
            <div
              className="group flex flex-col items-center md:flex-row md:items-center gap-4 cursor-pointer p-2 rounded-lg transition-colors "
              onClick={() => setSelectedCompKey((prev) => (prev === comp.key ? null : comp.key))}
            >
              {/* --- Left: Character icon area --- */}
              <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto items-center md:items-start">
                {topPos.teams.map((team, tIdx) => {
                  const members = [...team.m, ...team.s].filter((c): c is Character => !!c?.id);
                  const displayed = showIdOrder ? [...members].sort((a, b) => a.id - b.id) : members;
                  return (
                    <div key={tIdx} className="flex gap-2 relative justify-center md:justify-start">
                      {analysisUnit === 'report' && <div className="hidden md:block absolute -left-5 top-1/2 -translate-y-1/2 text-xs font-mono text-neutral-400 -rotate-90">T{tIdx + 1}</div>}

                      <div className="grid grid-cols-6 gap-2">
                        {displayed.map((char, idx) => (
                          <div key={idx} className="relative">
                            <StudentIcon character={{ id: char.id, isMulligan: topMul.mulliganIds.includes(char.id) } as Character} student={studentData[char.id]} portraitData={portraitData} />
                          </div>
                        ))}
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
                <RankScatterPlot
                  ranks={comp.ranks}
                  start_rank={activeData.length ? activeData[0].r : 1}
                  max_rank={activeData.length > 1 ? activeData[activeData.length - 1].r - activeData[0].r + 1 : 1}
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
                  entries={activeData.filter((e) => {
                    const tot = e.t.length;
                    if (filters.usePartyCount && (tot < filters.minParty || tot > filters.maxParty)) return false;

                    let targets: TeamSnapshot[] = analysisUnit === 'report' ? e.t : e.t;
                    if (analysisUnit === 'team' && filters.useTeamIndex) {
                      const idx = filters.teamIndexDir === 'start' ? filters.teamIndexVal - 1 : tot - filters.teamIndexVal;
                      targets = e.t[idx] ? [e.t[idx]] : [];
                    }

                    const iterations = analysisUnit === 'report' ? [targets] : targets.map((t) => [t]);
                    return iterations.some((currentTeams) => {
                      const sortedIds: number[] = [];
                      for (const team of currentTeams) {
                        const valid = [...team.m, ...team.s].filter(isValid);
                        if (filters.excludeIncomplete && valid.length < 6) return false;
                        sortedIds.push(...valid.map((c) => c.id));
                      }
                      return sortedIds.sort((a, b) => a - b).join(',') === comp.key;
                    });
                  })}
                  studentData={studentData}
                  raidInfo={raidInfo}
                  boss={raidInfo.Boss}
                  server={server}
                  id={raidInfo.Id}
                  portraitData={portraitData}
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
                    <VideoMatchSection videos={videoMatches} portraitData={portraitData} />
                  </>
                )}
                <div className="my-4 border-t dark:border-neutral-700"></div>
                <VariantStats comp={comp} portraitData={portraitData} studentData={studentData} />
              </div>
            )}
          </div>
        );
      })}

      {visibleCount < compData.length && (
        <button onClick={() => setVisibleCount((p) => p + 20)} className="w-full py-2 bg-neutral-200 dark:bg-neutral-700 rounded">
          {t('composition.load_more')}
        </button>
      )}
    </div>
  );
});

// --- Extracted Component: VariantStats ---
const VariantStats: React.FC<{
  comp: AggregatedComp;
  portraitData: PortraitData;
  studentData: StudentData;
}> = ({ comp, portraitData }) => {
  const { t } = useTranslation('dashboard');
  return (
    <div data-component-name="VariantStats" className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <div>
        <h4 className="font-bold mb-2 text-neutral-600 dark:text-neutral-400">{t('composition.placement_variants')}</h4>
        <ul className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar p-1">
          {comp.posVariants.map((v, idx) => (
            <li key={idx} className="flex items-center justify-between p-2 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-100 dark:border-neutral-700">
              <div className="flex flex-col gap-1">
                {v.teams.map((team, tIdx) => (
                  <div key={tIdx} className="flex -space-x-1 scale-90 origin-left">
                    {[...team.m, ...team.s].map((c, ci) => (
                      <div key={ci} className="w-8 h-8 rounded-full border-white dark:border-neutral-600 overflow-hidden">
                        {c && <img src={`data:image/webp;base64,${portraitData[c.id]}`} alt="" className="w-full h-full object-cover" />}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <span className="text-xs font-mono ml-2 whitespace-nowrap">
                {v.count} <span className="text-neutral-400">({Math.round((v.count / comp.totalCount) * 100)}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="font-bold mb-2 text-neutral-600 dark:text-neutral-400">{t('composition.mulligan_variants')}</h4>
        <ul className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar p-1">
          {comp.mulVariants.map((v, idx) => (
            <li key={idx} className="flex items-center justify-between p-2 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-100 dark:border-neutral-700">
              <div className="flex gap-1 flex-wrap">
                {v.mulliganIds.map((id) => (
                  <div key={id} className="w-7 h-7 rounded-full overflow-hidden border-2 border-yellow-400 box-border">
                    <img src={`data:image/webp;base64,${portraitData[id]}`} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              <span className="text-xs font-mono ml-2 whitespace-nowrap">
                {v.count} <span className="text-neutral-400">({Math.round((v.count / comp.totalCount) * 100)}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// --- Video Match Section ---
const getYouTubeId = (url: string) => url.match(/[?&]v=([^&]+)/)?.[1] ?? null;

function parseGrade(grade: string): { num: number; isUE: boolean } {
  if (grade.startsWith('ue')) return { num: Number(grade.slice(2)), isUE: true };
  const m = grade.match(/^(\d+)/);
  return { num: m ? Number(m[1]) : Number(grade), isUE: false };
}

const VideoMatchSection: React.FC<{
  videos: VideoEntry[];
  portraitData: PortraitData;
}> = ({ videos, portraitData }) => {
  return (
    <div data-component-name="VideoMatchSection">
      <h4 className="font-bold mb-2 text-sm text-neutral-600 dark:text-neutral-400">Video ({videos.length}) (BETA)</h4>
      <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
        {videos
          .sort((a, b) => {
            return Number(b.score) - Number(a.score);
          })
          .map((video, idx) => {
            const ytId = getYouTubeId(video.url);
            return (
              <div key={idx} className="shrink-0 w-60 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                {/* YouTube Thumbnail (clickable) */}
                <a href={video.url} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition-opacity">
                  {ytId ? (
                    <div className="relative w-full aspect-video bg-neutral-200 dark:bg-neutral-800">
                      <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt={video.title} className="w-full h-full object-cover" />
                      <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded font-mono">▶</span>
                      {video.has_tl && <span className="absolute top-1 left-1 bg-blue-500 text-white text-[10px] px-1 py-0.5 rounded font-bold">TL</span>}
                    </div>
                  ) : (
                    <div className="w-full aspect-video bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-neutral-400 text-xs">No Thumbnail</div>
                  )}
                </a>

                <div className="p-2 space-y-1">
                  {/* Score + Difficulty */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded font-mono text-neutral-600 dark:text-neutral-300">{video.difficulty}</span>
                    <span className="text-xs font-bold text-teal-600 dark:text-teal-400 font-mono">{video.score?.toLocaleString() || video.score}</span>
                  </div>

                  {/* Title */}
                  <a href={video.url} target="_blank" rel="noopener noreferrer" className="block">
                    <p className="text-[11px] text-neutral-600 dark:text-neutral-300 line-clamp-2 leading-tight hover:underline">{video.title}</p>
                  </a>

                  {/* Channel */}
                  <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">{video.channel_name}</p>

                  {/* Student grades per party */}
                  <div className="space-y-1 pt-0.5">
                    {video.parties.map((party, pIdx) => (
                      <div key={pIdx} className="flex gap-1 flex-wrap">
                        {party.map((student, sIdx) => {
                          const { num, isUE } = parseGrade(student.grade);
                          return (
                            <div key={sIdx} className="flex flex-col items-center gap-0.5">
                              <div className="w-6 h-6 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 shrink-0">
                                {portraitData[student.id] ? (
                                  <img src={`data:image/webp;base64,${portraitData[student.id]}`} alt={student.name_en} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full" />
                                )}
                              </div>

                              {student.grade ? <StarRating n={isUE ? num + 6 : num} /> : '?'}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
