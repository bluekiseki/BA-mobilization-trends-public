import { useEffect, useMemo, useState } from "react";
import type { Character, PortraitData, ReportEntryRank, StudentData } from "../common";
import { StudentIcon } from "../studentIcon";
import { useTranslation } from "react-i18next";
import { CompositionDetailView } from "./compositionDetailView";
import type { GameServer, RaidInfo } from "~/types/data";
import { RankScatterPlot } from "./RankScatterPlot";
import { FaChevronDown } from "react-icons/fa6";

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
}

// --- Helper ---
const isValid = (c: Character | null): c is Character => c !== null && c !== undefined;

export const CompositionChart: React.FC<{
    data: ReportEntryRank[], studentData: StudentData, portraitData: PortraitData, raidInfo: RaidInfo, server: GameServer
}> = ({ data, studentData, portraitData, raidInfo, server }) => {

    const { t } = useTranslation("dashboard"); // Translation hook
    const [analysisUnit, setAnalysisUnit] = useState<'report' | 'team'>('team');
    const [selectedCompKey, setSelectedCompKey] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState(5);

    // 1. Calculate data range
    const { globalMin, globalMax } = useMemo(() => {
        if (!data || data.length === 0) return { globalMin: 1, globalMax: 1 };
        let min = 99;
        let max = 0;
        for (let i = 0; i < data.length; i++) {
            const len = data[i].t.length;
            if (len < min) min = len;
            if (len > max) max = len;
        }
        return { globalMin: min, globalMax: max };
    }, [data]);

    const [filters, setFilters] = useState<FilterState>({
        usePartyCount: false,
        minParty: globalMin,
        maxParty: globalMax,
        useTeamIndex: false,
        teamIndexDir: 'start',
        teamIndexVal: 1,
        excludeIncomplete: false
    });

    useEffect(() => {
        setFilters(prev => ({
            ...prev,
            minParty: globalMin,
            maxParty: globalMax
        }));
    }, [globalMin, globalMax]);

    // --- Aggregation Logic ---
    const compData = useMemo(() => {
        const compMap = new Map<string, AggregatedComp>();

        const isReportMode = analysisUnit === 'report';
        const usePartyCount = filters.usePartyCount;
        const minP = filters.minParty;
        const maxP = filters.maxParty;
        const useTeamIdx = filters.useTeamIndex;
        const tDir = filters.teamIndexDir;
        const tVal = filters.teamIndexVal;
        const excludeIncomplete = filters.excludeIncomplete;

        for (let i = 0; i < data.length; i++) {
            const entry = data[i];
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

            if (!targets) continue;

            if (isReportMode) {
                processGroup(targets, entry.typeRanking || entry.r, compMap, excludeIncomplete);
            } else {
                for (let j = 0; j < targets.length; j++) {
                    processGroup([targets[j]], entry.typeRanking || entry.r, compMap, excludeIncomplete);
                }
            }
        }

        return Array.from(compMap.values())
            .map(g => {
                g.posVariants.sort((a, b) => b.count - a.count);
                g.mulVariants.sort((a, b) => b.count - a.count);
                return g;
            })
            .sort((a, b) => b.totalCount - a.totalCount);

    }, [data, analysisUnit, filters, globalMin, globalMax]);

    function processGroup(
        currentTeams: TeamSnapshot[],
        rank: number,
        compMap: Map<string, AggregatedComp>,
        excludeIncomplete: boolean
    ) {
        const allMemberIds: number[] = [];
        const mulliganIds: number[] = [];
        const sortedCompIds: number[] = [];
        let hasIncomplete = false;

        const posKeyParts: string[] = [];

        for (const team of currentTeams) {
            let validCount = 0;
            const mIds: number[] = [];
            for (const c of team.m) {
                if (c) {
                    mIds.push(c.id);
                    allMemberIds.push(c.id);
                    if (c.isMulligan) mulliganIds.push(c.id);
                    sortedCompIds.push(c.id);
                    validCount++;
                } else {
                    mIds.push(0);
                }
            }
            const sIds: number[] = [];
            for (const c of team.s) {
                if (c) {
                    sIds.push(c.id);
                    allMemberIds.push(c.id);
                    if (c.isMulligan) mulliganIds.push(c.id);
                    sortedCompIds.push(c.id);
                    validCount++;
                } else {
                    sIds.push(0);
                }
            }

            if (excludeIncomplete && validCount < 6) {
                hasIncomplete = true;
                break;
            }
            posKeyParts.push(`${mIds.join(',')}|${sIds.join(',')}`);
        }

        if (hasIncomplete || allMemberIds.length === 0) return;

        sortedCompIds.sort((a, b) => a - b);
        const compKey = sortedCompIds.join(',');

        let group = compMap.get(compKey);
        if (!group) {
            group = { key: compKey, totalCount: 0, ranks: [], posVariants: [], mulVariants: [] };
            compMap.set(compKey, group);
        }
        group.totalCount++;
        group.ranks.push(rank);

        const posKey = posKeyParts.join('_');
        let posVar = group.posVariants.find(v => v.key === posKey);
        if (!posVar) {
            posVar = { key: posKey, teams: currentTeams, count: 0 };
            group.posVariants.push(posVar);
        }
        posVar.count++;

        mulliganIds.sort((a, b) => a - b);
        const mulKey = mulliganIds.join(',');
        let mulVar = group.mulVariants.find(v => v.key === mulKey);
        if (!mulVar) {
            mulVar = { key: mulKey, mulliganIds, count: 0 };
            group.mulVariants.push(mulVar);
        }
        mulVar.count++;
    }


    const handleNumInput = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val)) setter(val);
    };

    return (
        <div className="w-full max-w-5xl mx-auto space-y-4">
            {/* --- Filter Toolbar --- */}
            <div className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded-lg text-sm flex flex-col gap-3">
                <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex bg-white dark:bg-neutral-900 rounded p-1 border dark:border-neutral-700">
                        {(['team', 'report'] as const).map(mode => (
                            <button key={mode} onClick={() => setAnalysisUnit(mode)}
                                className={`px-3 py-1 rounded capitalize ${analysisUnit === mode ? 'bg-teal-500 text-white' : 'text-neutral-500'}`}>
                                {t(`composition.mode_${mode}`)}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 border-l pl-4 dark:border-neutral-700">
                        <input type="checkbox" checked={filters.usePartyCount}
                            onChange={e => setFilters(p => ({ ...p, usePartyCount: e.target.checked }))} />
                        <span className={filters.usePartyCount ? '' : 'text-neutral-400'}>{t('composition.total_parties')}:</span>

                        <input type="number" className="w-12 p-1 rounded border text-center"
                            disabled={!filters.usePartyCount}
                            value={filters.minParty}
                            min={globalMin} max={globalMax}
                            onChange={handleNumInput(v => setFilters(p => ({ ...p, minParty: v })))} />
                        <span>~</span>
                        <input type="number" className="w-12 p-1 rounded border text-center"
                            disabled={!filters.usePartyCount}
                            value={filters.maxParty}
                            min={globalMin} max={globalMax}
                            onChange={handleNumInput(v => setFilters(p => ({ ...p, maxParty: v })))} />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer border-l pl-4 dark:border-neutral-700">
                        <input type="checkbox" checked={filters.excludeIncomplete}
                            onChange={e => setFilters(p => ({ ...p, excludeIncomplete: e.target.checked }))} />
                        <span>{t('composition.full_party_only')}</span>
                    </label>
                </div>

                {analysisUnit === 'team' && (
                    <div className="flex items-center gap-2 pt-2 border-t dark:border-neutral-700">
                        <input type="checkbox" checked={filters.useTeamIndex}
                            onChange={e => setFilters(p => ({ ...p, useTeamIndex: e.target.checked }))} />
                        <span className={filters.useTeamIndex ? '' : 'text-neutral-400'}>{t('composition.specific_team')}:</span>
                        <select disabled={!filters.useTeamIndex} value={filters.teamIndexDir}
                            onChange={e => setFilters(p => ({ ...p, teamIndexDir: e.target.value as any }))}
                            className="p-1 rounded border bg-white dark:bg-neutral-900">
                            <option value="start">{t('composition.from_start')}</option>
                            <option value="end">{t('composition.from_end')}</option>
                        </select>
                        <span>#</span>
                        <input type="number" className="w-12 p-1 rounded border text-center"
                            disabled={!filters.useTeamIndex} value={filters.teamIndexVal} min={1}
                            onChange={handleNumInput(v => setFilters(p => ({ ...p, teamIndexVal: v })))} />
                    </div>
                )}
            </div>

            {/* --- List Rendering --- */}
            {compData.slice(0, visibleCount).map((comp, i) => {
                const topPos = comp.posVariants[0];
                const topMul = comp.mulVariants[0];
                const isExpanded = selectedCompKey === comp.key;

                return (
                    <div key={comp.key} className={`bg-white dark:bg-neutral-800 p-1 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-teal-500 transition-all ${isExpanded ? 'ring-2 ring-teal-500' : 'hover:scale-101'}`}>

                        <div
                            // [Change 1] Changed md:items-start to md:items-center for vertical center alignment
                            className="group flex flex-col items-center md:flex-row md:items-center gap-4 cursor-pointer p-2 rounded-lg transition-colors "
                            onClick={() => setSelectedCompKey(prev => prev === comp.key ? null : comp.key)}
                        >
                            {/* --- Left: Character icon area --- */}
                            <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto items-center md:items-start">
                                {topPos.teams.map((team, tIdx) => (
                                    <div key={tIdx} className="flex gap-2 relative justify-center md:justify-start">
                                        {analysisUnit === 'report' && (
                                            <div className="hidden md:block absolute -left-5 top-1/2 -translate-y-1/2 text-xs font-mono text-neutral-400 -rotate-90">
                                                T{tIdx + 1}
                                            </div>
                                        )}

                                        <div className="grid grid-cols-6 gap-2">
                                            {[...team.m, ...team.s].map((char, idx) => (
                                                <div key={idx} className="relative">
                                                    {char && <StudentIcon
                                                        character={{ id: char.id, isMulligan: topMul.mulliganIds.includes(char.id) } as Character}
                                                        student={studentData[char.id]} portraitData={portraitData} />}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex-1 w-full flex flex-col justify-center shrink-0 min-w-0 text-center md:text-left">
                                <div className="flex justify-between items-baseline mb-0 mx-1.5 px-1">
                                    <span className="text-neutral-700 dark:text-neutral-100 text-base font-bold">
                                        {((comp.totalCount / data.length) * 100).toFixed(1)}%
                                    </span>
                                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                                        {comp.totalCount.toLocaleString()}
                                    </span>
                                </div>
                                <RankScatterPlot ranks={comp.ranks} start_rank={data ? data[0].r : 1} max_rank={data.length} />
                            </div>

                            <div className="hidden md:flex items-center justify-center px-2 text-neutral-400">
                                <FaChevronDown
                                    className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                                    size={16}
                                />
                            </div>
                        </div>


                        {isExpanded && (
                            <div className="mt-4 pt-4 border-t border-dashed border-neutral-200 dark:border-neutral-700 animate-fadeIn">

                                <CompositionDetailView
                                    comp={{
                                        ...comp,
                                        percentage: (comp.totalCount / data.length) * 100,
                                        count: comp.totalCount,
                                        ids: comp.key.split(',').map(Number),
                                        displayChars: []
                                    }}
                                    entries={data.filter(e => {
                                        const tot = e.t.length;
                                        if (filters.usePartyCount && (tot < filters.minParty || tot > filters.maxParty)) return false;

                                        let targets: TeamSnapshot[] = analysisUnit === 'report' ? e.t : e.t;
                                        if (analysisUnit === 'team' && filters.useTeamIndex) {
                                            const idx = filters.teamIndexDir === 'start' ? filters.teamIndexVal - 1 : tot - filters.teamIndexVal;
                                            targets = (e.t[idx]) ? [e.t[idx]] : [];
                                        }

                                        const iterations = analysisUnit === 'report' ? [targets] : targets.map(t => [t]);
                                        return iterations.some(currentTeams => {
                                            const sortedIds: number[] = [];
                                            for (const team of currentTeams) {
                                                const valid = [...team.m, ...team.s].filter(isValid);
                                                if (filters.excludeIncomplete && valid.length < 6) return false;
                                                sortedIds.push(...valid.map(c => c.id));
                                            }
                                            return sortedIds.sort((a, b) => a - b).join(',') === comp.key;
                                        });
                                    })}
                                    studentData={studentData} boss={raidInfo.Boss} server={server} id={raidInfo.Id} portraitData={portraitData}
                                    onClose={() => setSelectedCompKey(null)}
                                />

                                <div className="my-4 border-t dark:border-neutral-700"></div>
                                <VariantStats comp={comp} portraitData={portraitData} studentData={studentData} />
                            </div>
                        )}
                    </div>
                );
            })}

            {visibleCount < compData.length && (
                <button onClick={() => setVisibleCount(p => p + 20)} className="w-full py-2 bg-neutral-200 dark:bg-neutral-700 rounded">
                    {t('composition.load_more')}
                </button>
            )}
        </div>
    );
};

// --- Extracted Component: VariantStats ---
const VariantStats: React.FC<{
    comp: AggregatedComp,
    portraitData: PortraitData,
    studentData: StudentData
}> = ({ comp, portraitData }) => {
    const { t } = useTranslation("dashboard"); // Translation hook 추가
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
                <h4 className="font-bold mb-2 text-neutral-600 dark:text-neutral-400">{t('composition.placement_variants')}</h4>
                <ul className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar p-1">
                    {comp.posVariants.map((v, idx) => (
                        <li key={idx} className="flex items-center justify-between p-2 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-100 dark:border-neutral-700">
                            <div className="flex flex-col gap-1">
                                {v.teams.map((team, tIdx) => (
                                    <div key={tIdx} className="flex -space-x-1 scale-90 origin-left">
                                        {[...team.m, ...team.s].map((c, ci) => (
                                            <div key={ci} className="w-8 h-8 rounded-full bg-gray-200 border border-white dark:border-neutral-600 overflow-hidden">
                                                {c && <img src={`data:image/webp;base64,${portraitData[c.id]}`} alt="" className="w-full h-full object-cover" />}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                            <span className="text-xs font-mono ml-2 whitespace-nowrap">{v.count} <span className="text-neutral-400">({Math.round(v.count / comp.totalCount * 100)}%)</span></span>
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
                                {v.mulliganIds.map(id => (
                                    <div key={id} className="w-7 h-7 rounded-full overflow-hidden border-2 border-yellow-400 box-border">
                                        <img src={`data:image/webp;base64,${portraitData[id]}`} alt="" className="w-full h-full object-cover" />
                                    </div>
                                ))}
                            </div>
                            <span className="text-xs font-mono ml-2 whitespace-nowrap">{v.count} <span className="text-neutral-400">({Math.round(v.count / comp.totalCount * 100)}%)</span></span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};