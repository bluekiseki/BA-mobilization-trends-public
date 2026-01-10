// // app/components/dashboard/dashboardUI.tsx
// import { useState, useMemo, useRef, useEffect } from 'react';
// import { useTranslation } from 'react-i18next';
// import { Card } from '~/components/dashboard/card';
// import { getCharacterStarValue, InclusionUsage, isTotalAssault, type Character, type PortraitData, type ReportEntryRank, type StudentData, type TableFilters, type UsageStats } from '~/components/dashboard/common';
// import type { GameServer, RaidInfo } from '~/types/data';
// import { difficultyInfo } from '~/components/Difficulty';
// import { DownloadButton } from './DownloadButton';
// import { RankFilter, type RankRange } from './teamDetail/rankFilter';
// import { ScoreDistributionChart } from './teamDetail/scoreDistributionChart';
// import { StackedPickRateChart } from './teamDetail/stackedPickRateChart';
// import { PartyCountChart } from './teamDetail/partyCountChart';
// import { RankUsageChart } from './teamDetail/rankUsageChart';
// import { CompositionChart } from './teamDetail/compositionChart';
// import { TableFilterPanelComponent } from './teamDetail/tableFilterPanelComponent';
// import { RankingsTableComponent } from './teamDetail/rankingsTableComponent';
// import { HiOutlineBars3, HiOutlineChartBar, HiOutlineChartPie, HiOutlineTableCells, HiOutlineUserGroup, HiOutlineUsers, HiOutlineVariable, HiOutlineXMark } from 'react-icons/hi2';


// const RANK_RANGES: RankRange[] = [
//     { id: 'IN100', name: 'IN 100', min: 1, max: 100 },
//     { id: 'IN1000', name: 'IN 1000', min: 1, max: 1000 },
//     { id: 'IN10000', name: 'IN 10000', min: 1, max: 10000 },
//     { id: 'IN12000', name: 'IN 12000', min: 1, max: 12000 },
//     { id: 'IN15000', name: 'IN 15000', min: 1, max: 15000 },
//     { id: 'IN20000', name: 'IN 20000', min: 1, max: 20000 },
// ];


// interface DashboardUIProps {
//     dashboardData: ReportEntryRank[];
//     studentData: StudentData;
//     portraitData: PortraitData;
//     raidInfo: RaidInfo
//     server: GameServer
// }

// // --- MAIN UI COMPONENT ---
// function DashboardUI({ dashboardData: allData, studentData, portraitData, raidInfo, server }: DashboardUIProps) {
//     console.log('raidInfo.Cnt',raidInfo.Cnt)

//     const [currentPage, setCurrentPage] = useState(1);
//     const [itemsPerPage, setItemsPerPage] = useState(10);
//     const [tableFilters, setTableFilters] = useState<TableFilters>({
//         includable: [],
//         excludable: [],
//     });

//     const [displayData, setDisplayData] = useState<ReportEntryRank[]>([]);

//     const { t } = useTranslation("dashboard");

//     const rank_ranges: RankRange[] = []
//     rank_ranges.push({ id: 'all', name: 'All', min: 1, max: raidInfo.Cnt.All })
//     let c = 1
//     for (const { name } of difficultyInfo) {
//         if (raidInfo.Cnt[name]) {
//             rank_ranges.push({ id: name, name: name, min: c, max: c + raidInfo.Cnt[name] - 1 })
//             c += raidInfo.Cnt[name]
//         }
//     }
//     for (const r of RANK_RANGES) {
//         if (r.max <= raidInfo.Cnt.All)
//             rank_ranges.push(r)
//     }

//     const [activeRange, setActiveRange] = useState<RankRange>(rank_ranges[0]);

//     const rankFilteredData = useMemo(() => {
//         if (!activeRange || !allData.length) return [];
//         return allData.slice(activeRange.min - 1, activeRange.max);
//     }, [allData, activeRange]);

//     const detailedFilteredData = useMemo(() => {
//         if (tableFilters.includable.length === 0 && tableFilters.excludable.length === 0) {
//             return rankFilteredData;
//         }

//         return rankFilteredData.filter(entry => {
//             // let assist_brrowed = false
//             let assist_brrowed_id = null

//             const teamChars = entry.t.flatMap((team) => [...team.m, ...team.s]).filter(Boolean);
//             const assist = teamChars.filter(c => teamChars.filter(cc => cc.id == c.id).length > 1) // To view two appearances as assist

//             for (const cond of tableFilters.excludable) {
//                 const count = teamChars.filter((c) => c.id === cond.id).length;


//                 if (cond.isHardExclude) {
//                     if (count > 0) return false;
//                 } else {
//                     // cond is assist
//                     if (count > 1) return false;
//                     if (count == 1 && assist.length && assist[0].id != cond.id) {
//                         // Using another assist.
//                         // Assist can only borrow once
//                         return false
//                     }
//                     if (count == 1) {
//                         // assist_brrowed = true
//                         assist_brrowed_id = cond.id
//                     }
//                 }
//             }

//             for (const cond of tableFilters.includable) {
//                 const count = teamChars.filter((c) =>
//                     c.id === cond.id && cond.starValues.includes(Math.abs(getCharacterStarValue(c)))
//                 ).length;

//                 const student_count = teamChars.filter((c) =>
//                     c.id === cond.id
//                 ).length;

//                 let isConditionMet = true;
//                 // must included
//                 if (cond.mustBeIncluded) {
//                     if (cond.usage === InclusionUsage.Twice) {
//                         if (count !== 2) return false;
//                         if (assist_brrowed_id && assist_brrowed_id != cond.id) return false // It's already borrowed as an assist, so it can't be borrowed more
//                         else assist_brrowed_id = cond.id
//                     }
//                     else if (cond.usage === InclusionUsage.Any && count === 0) return false;
//                     else if (cond.usage === InclusionUsage.Assist) {
//                         if (count === 0) return false; // It not exists
//                         if (student_count == 2) return false // Rent current student twice
//                         if (assist.length && !assist.map(v => v.id).includes(cond.id)) return false // Redundant use of other students as helpers
//                         if (assist_brrowed_id && assist_brrowed_id != cond.id) return false // It's already borrowed an assist and can't borrow more
//                         assist_brrowed_id = cond.id

//                     }
//                 } else if (student_count) { // if student exit

//                     if (student_count > count) {
//                         // If a student exists and is out of range
//                         return false
//                     }

//                     // Now only cover count==student_count

//                     if (cond.usage === InclusionUsage.Twice) {
//                         if (assist_brrowed_id && assist_brrowed_id != cond.id) return false // It's already borrowed an assist and can't borrow more
//                         if (count === 2) assist_brrowed_id = cond.id // rest assist
//                     }
//                     else if (cond.usage === InclusionUsage.Assist) {
//                         if (student_count == 2) return false // Rent current student twice
//                         if (assist.length && !assist.map(v => v.id).includes(cond.id)) return false // Already used another student as an assistant
//                         if (assist_brrowed_id && assist_brrowed_id != cond.id) return false // Already borrow another student
//                         assist_brrowed_id = cond.id

//                     } else if (cond.usage === InclusionUsage.Any) {


//                     }

//                 }

//                 if (!isConditionMet) return false;
//             }

//             return true;
//         });
//     }, [rankFilteredData, tableFilters]);


//     const handleItemsPerPageChange = (size: number) => {
//         setItemsPerPage(size);
//     };

//     const handleLoadMore = () => {
//         const totalPages = Math.ceil(detailedFilteredData.length / itemsPerPage);
//         if (currentPage >= totalPages) return;

//         const nextPage = currentPage + 1;
//         const start = currentPage * itemsPerPage;
//         const end = start + itemsPerPage;
//         const nextData = detailedFilteredData.slice(start, end);

//         setDisplayData(prevData => [...prevData, ...nextData])
//         setCurrentPage(nextPage);
//     };

//     useEffect(() => {
//         setCurrentPage(1);
//         const firstPageData = detailedFilteredData.slice(0, itemsPerPage);
//         setDisplayData(firstPageData);
//     }, [detailedFilteredData, itemsPerPage]);

//     const handleTableFilterChange = (filters: TableFilters) => { setTableFilters(filters); setCurrentPage(1); };
//     const handlePageChange = (page: number) => {
//         const totalPages = Math.ceil(detailedFilteredData.length / itemsPerPage);
//         if (page > 0 && page <= totalPages) {
//             const start = (page - 1) * itemsPerPage;
//             const end = start + itemsPerPage;
//             setDisplayData(detailedFilteredData.slice(start, end));
//             setCurrentPage(page);
//         }
//     };

//     const handleRangeChange = (range: RankRange) => {
//         setActiveRange(range);
//         setCurrentPage(1);
//     };


//     const handleScrollToTableArea = () => scrollToSection(tableRef);

//     const usageStats: UsageStats = useMemo(() => {
//         const stats: UsageStats = new Map();
//         rankFilteredData.forEach(entry => {
//             const uniqueChars = new Set<Character>();
//             entry.t.forEach(team => [...team.m, ...team.s].forEach(c => c && uniqueChars.add(c)));
//             uniqueChars.forEach(char => {
//                 if (!stats.has(char.id)) stats.set(char.id, { total: 0, stars: new Map() });
//                 const charStats = stats.get(char.id)!;
//                 charStats.total++;
//                 const starVal = getCharacterStarValue(char);
//                 charStats.stars.set(starVal, (charStats.stars.get(starVal) || 0) + 1);
//             });
//         });
//         return stats;
//     }, [rankFilteredData]);


//     const isRaid = isTotalAssault(raidInfo)

//     const rankFilterRef = useRef<HTMLDivElement>(null);
//     const scoreDistRef = useRef<HTMLDivElement>(null);
//     const pickRateRef = useRef<HTMLDivElement>(null);
//     const partyCountRef = useRef<HTMLDivElement>(null);
//     const rankUsageRef = useRef<HTMLDivElement>(null);
//     const compositionRef = useRef<HTMLDivElement>(null);
//     const tableRef = useRef<HTMLDivElement>(null);

//     const sections = useMemo(() => [
//         { id: 'rankRange', title: t("rankRange"), ref: rankFilterRef, icon: <HiOutlineVariable className="w-4 h-4" /> },
//         { id: 'score', title: t("scoreDistribution"), ref: scoreDistRef, icon: <HiOutlineChartBar className="w-4 h-4" /> },
//         { id: 'participation', title: t("participationRate"), ref: pickRateRef, icon: <HiOutlineChartPie className="w-4 h-4" /> },
//         { id: 'teamCount', title: t("teamUsageCount"), ref: partyCountRef, icon: <HiOutlineUsers className="w-4 h-4" /> },
//         { id: 'growth', title: t("StudentGrowthByRankTitle"), ref: rankUsageRef, icon: <HiOutlineUserGroup className="w-4 h-4" /> },
//         { id: 'formations', title: t("popularFormations").replace(/\{.*\}/, '').trim(), ref: compositionRef, icon: <HiOutlineUserGroup className="w-4 h-4" /> },
//         { id: 'rankings', title: t("rankingsAndTeams").replace(/\{.*\}/, '').trim(), ref: tableRef, icon: <HiOutlineTableCells className="w-4 h-4" /> },
//     ], [t]);

//     /*
//     const [visibleSection, setVisibleSection] = useState<string>(sections[0].id);

//     useEffect(() => {
//         const options = {
//             rootMargin: '-120px 0px -60% 0px',
//             threshold: 0
//         };

//         const observer = new IntersectionObserver((entries) => {
//             entries.forEach(entry => {
//                 if (entry.isIntersecting) {
//                     const matchingSection = sections.find(s => s.ref.current === entry.target);
//                     if (matchingSection) {
//                         setVisibleSection(matchingSection.id);
//                     }
//                 }
//             });
//         }, options);

//         sections.forEach(section => {
//             if (section.ref.current) {
//                 observer.observe(section.ref.current);
//             }
//         });

//         return () => {
//             sections.forEach(section => {
//                 if (section.ref.current) {
//                     observer.unobserve(section.ref.current);
//                 }
//             });
//         };
//     }, [sections]);
//     */

//     const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
//         ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
//     };

//     const [activeSection, setActiveSection] = useState<string>(sections[0].id);
//     const [isNavOpen, setIsNavOpen] = useState(false)

//     useEffect(() => {
//         const observerCallback = (entries: IntersectionObserverEntry[]) => {
//             entries.forEach((entry) => {
//                 if (entry.isIntersecting) {
//                     setActiveSection(entry.target.id);
//                 }
//             });
//         };

//         const observer = new IntersectionObserver(observerCallback, {
//             rootMargin: "-40% 0px -60% 0px",
//             threshold: 0
//         });

//         sections.forEach(section => {
//             if (section.ref.current) {
//                 section.ref.current.id = section.id;
//                 observer.observe(section.ref.current);
//             }
//         });

//         return () => observer.disconnect();
//     }, [sections]);

//     /**
//      * rendering the table of contents UI
//      * @param onLinkClick - Callback to close bottom sheet when link click
//      */
//     const renderNavLinks = (onLinkClick: () => void = () => { }) => {
//         return sections.map(section => (
//             <button
//                 key={section.id}
//                 onClick={() => {
//                     scrollToSection(section.ref);
//                     onLinkClick();
//                 }}
//                 className={`flex items-center gap-3 px-3 py-2.5 w-full text-left text-sm font-medium rounded-lg transition-all  ${activeSection === section.id
//                     ? 'bg-neutral-100 dark:bg-neutral-700 text-blue-700 dark:text-blue-400'
//                     : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700'
//                     }`}
//             >
//                 <span className="shrink-0 w-5 h-5">{section.icon}</span>
//                 <span>{section.title}</span>
//             </button>
//         ));
//     };


//     return (
//         <div className="bg-neutral-50 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 min-h-screen font-sans" >

//             <div className="fixed bottom-6 right-6 z-40">
//                 <button
//                     onClick={() => setIsNavOpen(true)}
//                     className="p-4 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 rounded-full shadow-lg ring-1 ring-black/5 dark:ring-white/10 hover:bg-neutral-50 dark:hover:bg-neutral-700 active:scale-95 transition-all"
//                     aria-label={t('openNavigation', 'open')}
//                 >
//                     <HiOutlineBars3 className="w-6 h-6" />
//                 </button>
//             </div>

//             <div
//                 className={`fixed inset-0 z-50 transition-opacity duration-300 ${isNavOpen ? 'bg-black/40 backdrop-blur-sm' : 'bg-transparent pointer-events-none'
//                     }`}
//                 onClick={() => setIsNavOpen(false)}
//                 aria-hidden="true"
//             ></div>

//             <div
//                 className={`fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-neutral-800 rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out
//                            sm:max-w-md sm:mx-auto sm:bottom-4 sm:rounded-2xl ${isNavOpen ? 'translate-y-0' : 'translate-y-full sm:translate-y-[calc(100%+1rem)]'
//                     }`}
//             >
//                 <div className="flex justify-between items-center p-4 border-b border-neutral-200 dark:border-neutral-700">
//                     <h3 className="text-lg font-semibold">{t('quickNavigation')}</h3>
//                     <button
//                         onClick={() => setIsNavOpen(false)}
//                         className="p-2 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full"
//                         aria-label={t('closeNavigation', 'close')}
//                     >
//                         <HiOutlineXMark className="w-6 h-6" />
//                     </button>
//                 </div>
//                 <nav className="space-y-1 p-4 max-h-[50vh] overflow-y-auto">
//                     {renderNavLinks(() => setIsNavOpen(false))}
//                 </nav>
//             </div>


//             <div id={sections[0].id} className="gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={rankFilterRef}>
//                 <Card title={t("rankRange")} height='h-[100px]' icon={<HiOutlineVariable className="w-4 h-4" />}>
//                     <RankFilter activeRange={activeRange} onRangeChange={handleRangeChange} rankRanges={rank_ranges} />
//                 </Card>
//             </div>

//             <div id={sections[1].id} className="gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={scoreDistRef}>
//                 <Card title={t("scoreDistribution")} defaultExpanded={false} icon={<HiOutlineChartBar className="w-4 h-4" />}>
//                     <ScoreDistributionChart data={rankFilteredData} raid={raidInfo} server={server} />
//                 </Card>
//             </div>

//             <div id={sections[2].id} className="gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={pickRateRef}>
//                 <Card title={t("participationRate")} defaultExpanded={true} icon={<HiOutlineChartPie className="w-4 h-4" />}>
//                     <StackedPickRateChart data={rankFilteredData} studentData={studentData} portraitData={portraitData} />
//                 </Card>
//             </div>

//             <div id={sections[3].id} className="gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={partyCountRef}>
//                 <Card title={t("teamUsageCount")} height={"h-[125px]"} defaultExpanded={true} icon={<HiOutlineUsers className="w-4 h-4" />}>
//                     <PartyCountChart data={rankFilteredData} />
//                 </Card>
//             </div>

//             <div id={sections[4].id} className="gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={rankUsageRef}>
//                 <Card title={t("StudentGrowthByRankTitle")} defaultExpanded={false} icon={<HiOutlineUserGroup className="w-4 h-4" />}>
//                     <RankUsageChart data={rankFilteredData} studentData={studentData} portraitData={portraitData} />
//                 </Card>
//             </div>

//             <div id={sections[5].id} className="grid grid-cols-1 xl:grid-cols-1 gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={compositionRef}>
//                 <Card title={t("popularFormations").replace('{x}', detailedFilteredData.length.toLocaleString())} defaultExpanded={true} icon={<HiOutlineUserGroup className="w-4 h-4" />}>
//                     <CompositionChart data={rankFilteredData} studentData={studentData} portraitData={portraitData} raidInfo={raidInfo}
//                         server={server} />
//                 </Card>
//             </div>

//             <div id={sections[6].id} className="grid grid-cols-1 xl:grid-cols-1 gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={tableRef}>
//                 <Card title={t("rankingsAndTeams").replace('{x}', detailedFilteredData.length.toLocaleString())} className="block!" icon={<HiOutlineTableCells className="w-4 h-4" />} headerActions={
//                     <DownloadButton data={detailedFilteredData} filename="TeamDataDetail.csv" />
//                 }>
//                     <TableFilterPanelComponent tableFilters={tableFilters} handleTableFilterChange={handleTableFilterChange} usageStats={usageStats} studentData={studentData} portraitData={portraitData} />

//                     <RankingsTableComponent
//                         detailedFilteredData={detailedFilteredData}
//                         currentPage={currentPage}
//                         itemsPerPage={itemsPerPage}
//                         studentData={studentData}
//                         portraitData={portraitData}
//                         paginatedData={displayData}
//                         handlePageChange={handlePageChange}
//                         handleItemsPerPageChange={handleItemsPerPageChange}
//                         handleLoadMore={handleLoadMore}
//                         handleScrollToTop={handleScrollToTableArea}
//                         showRank={!isRaid}
//                         activeRange={activeRange}
//                         raidInfo={raidInfo}
//                         server={server}
//                     />
//                 </Card>
//             </div>
//         </div>
//     );
// }

// export default DashboardUI;






import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '~/components/dashboard/card';
import { getCharacterStarValue, InclusionUsage, isTotalAssault, type Character, type PortraitData, type ReportEntryRank, type StudentData, type TableFilters, type UsageStats } from '~/components/dashboard/common';
import type { GameServer, RaidInfo } from '~/types/data';
import { difficultyInfo } from '~/components/Difficulty';
import { DownloadButton } from './DownloadButton';
import { RankFilter, type RankRange } from './teamDetail/rankFilter';
import { ScoreDistributionChart } from './teamDetail/scoreDistributionChart';
import { StackedPickRateChart } from './teamDetail/stackedPickRateChart';
import { PartyCountChart } from './teamDetail/partyCountChart';
import { RankUsageChart } from './teamDetail/rankUsageChart';
import { CompositionChart } from './teamDetail/compositionChart';
import { TableFilterPanelComponent } from './teamDetail/tableFilterPanelComponent';
import { RankingsTableComponent } from './teamDetail/rankingsTableComponent';
import { HiOutlineBars3, HiOutlineChartBar, HiOutlineChartPie, HiOutlineTableCells, HiOutlineUserGroup, HiOutlineUsers, HiOutlineVariable, HiOutlineXMark } from 'react-icons/hi2';


const RANK_RANGES: RankRange[] = [
    { id: 'IN100', name: 'IN 100', min: 1, max: 100 },
    { id: 'IN1000', name: 'IN 1000', min: 1, max: 1000 },
    { id: 'IN10000', name: 'IN 10000', min: 1, max: 10000 },
    { id: 'IN12000', name: 'IN 12000', min: 1, max: 12000 },
    { id: 'IN15000', name: 'IN 15000', min: 1, max: 15000 },
    { id: 'IN20000', name: 'IN 20000', min: 1, max: 20000 },
];


interface DashboardUIProps {
    dashboardData: ReportEntryRank[];
    studentData: StudentData;
    portraitData: PortraitData;
    raidInfo: RaidInfo
    server: GameServer
}

// --- MAIN UI COMPONENT ---
function DashboardUI({ dashboardData: allData, studentData, portraitData, raidInfo, server }: DashboardUIProps) {

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [tableFilters, setTableFilters] = useState<TableFilters>({
        includable: [],
        excludable: [],
    });

    const [displayData, setDisplayData] = useState<ReportEntryRank[]>([]);

    const { t } = useTranslation("dashboard");

    // --- Rank Range Initialization Logic ---
    const rank_ranges: RankRange[] = []
    rank_ranges.push({ id: 'all', name: 'All', min: 1, max: raidInfo.Cnt.All })
    let c = 1
    for (const { name } of difficultyInfo) {
        if (raidInfo.Cnt[name]) {
            rank_ranges.push({ id: name, name: name, min: c, max: c + raidInfo.Cnt[name] - 1 })
            c += raidInfo.Cnt[name]
        }
    }
    for (const r of RANK_RANGES) {
        if (r.max <= raidInfo.Cnt.All)
            rank_ranges.push(r)
    }

    const defaultRange = rank_ranges[0];
    const [currentMin, setCurrentMin] = useState<number>(defaultRange.min);
    const [currentMax, setCurrentMax] = useState<number>(defaultRange.max);
    const [activeRangeId, setActiveRangeId] = useState<string>(defaultRange.id);

    const rankFilteredData = useMemo(() => {
        if (!allData.length) return [];
        // Adjusted as min must be at least 1
        const safeMin = Math.max(1, currentMin);
        return allData.slice(safeMin - 1, currentMax);
    }, [allData, currentMin, currentMax]);

    const handleRankChange = (min: number, max: number, id?: string) => {
        setCurrentMin(min);
        setCurrentMax(max);
        // If ID is missing, treat as 'custom' or handle logic to maintain current state
        setActiveRangeId(id || 'custom');
        setCurrentPage(1);
    };

    const detailedFilteredData = useMemo(() => {
        if (tableFilters.includable.length === 0 && tableFilters.excludable.length === 0) {
            return rankFilteredData;
        }

        return rankFilteredData.filter(entry => {
            let assist_brrowed_id = null

            const teamChars = entry.t.flatMap((team) => [...team.m, ...team.s]).filter(Boolean);
            const assist = teamChars.filter(c => teamChars.filter(cc => cc.id == c.id).length > 1)

            for (const cond of tableFilters.excludable) {
                const count = teamChars.filter((c) => c.id === cond.id).length;

                if (cond.isHardExclude) {
                    if (count > 0) return false;
                } else {
                    if (count > 1) return false;
                    if (count == 1 && assist.length && assist[0].id != cond.id) return false
                    if (count == 1) assist_brrowed_id = cond.id
                }
            }

            for (const cond of tableFilters.includable) {
                const count = teamChars.filter((c) =>
                    c.id === cond.id && cond.starValues.includes(Math.abs(getCharacterStarValue(c)))
                ).length;

                const student_count = teamChars.filter((c) => c.id === cond.id).length;
                let isConditionMet = true;

                if (cond.mustBeIncluded) {
                    if (cond.usage === InclusionUsage.Twice) {
                        if (count !== 2) return false;
                        if (assist_brrowed_id && assist_brrowed_id != cond.id) return false
                        else assist_brrowed_id = cond.id
                    }
                    else if (cond.usage === InclusionUsage.Any && count === 0) return false;
                    else if (cond.usage === InclusionUsage.Assist) {
                        if (count === 0) return false;
                        if (student_count == 2) return false
                        if (assist.length && !assist.map(v => v.id).includes(cond.id)) return false
                        if (assist_brrowed_id && assist_brrowed_id != cond.id) return false
                        assist_brrowed_id = cond.id
                    }
                } else if (student_count) {
                    if (student_count > count) return false

                    if (cond.usage === InclusionUsage.Twice) {
                        if (assist_brrowed_id && assist_brrowed_id != cond.id) return false
                        if (count === 2) assist_brrowed_id = cond.id
                    }
                    else if (cond.usage === InclusionUsage.Assist) {
                        if (student_count == 2) return false
                        if (assist.length && !assist.map(v => v.id).includes(cond.id)) return false
                        if (assist_brrowed_id && assist_brrowed_id != cond.id) return false
                        assist_brrowed_id = cond.id
                    }
                }
                if (!isConditionMet) return false;
            }
            return true;
        });
    }, [rankFilteredData, tableFilters]);


    const handleItemsPerPageChange = (size: number) => {
        setItemsPerPage(size);
    };

    const handleLoadMore = () => {
        const totalPages = Math.ceil(detailedFilteredData.length / itemsPerPage);
        if (currentPage >= totalPages) return;

        const nextPage = currentPage + 1;
        const start = currentPage * itemsPerPage;
        const end = start + itemsPerPage;
        const nextData = detailedFilteredData.slice(start, end);

        setDisplayData(prevData => [...prevData, ...nextData])
        setCurrentPage(nextPage);
    };

    useEffect(() => {
        setCurrentPage(1);
        const firstPageData = detailedFilteredData.slice(0, itemsPerPage);
        setDisplayData(firstPageData);
    }, [detailedFilteredData, itemsPerPage]);

    const handleTableFilterChange = (filters: TableFilters) => { setTableFilters(filters); setCurrentPage(1); };
    const handlePageChange = (page: number) => {
        const totalPages = Math.ceil(detailedFilteredData.length / itemsPerPage);
        if (page > 0 && page <= totalPages) {
            const start = (page - 1) * itemsPerPage;
            const end = start + itemsPerPage;
            setDisplayData(detailedFilteredData.slice(start, end));
            setCurrentPage(page);
        }
    };

    const handleScrollToTableArea = () => scrollToSection(tableRef);

    const usageStats: UsageStats = useMemo(() => {
        const stats: UsageStats = new Map();
        rankFilteredData.forEach(entry => {
            const uniqueChars = new Set<Character>();
            entry.t.forEach(team => [...team.m, ...team.s].forEach(c => c && uniqueChars.add(c)));
            uniqueChars.forEach(char => {
                if (!stats.has(char.id)) stats.set(char.id, { total: 0, stars: new Map() });
                const charStats = stats.get(char.id)!;
                charStats.total++;
                const starVal = getCharacterStarValue(char);
                charStats.stars.set(starVal, (charStats.stars.get(starVal) || 0) + 1);
            });
        });
        return stats;
    }, [rankFilteredData]);


    const isRaid = isTotalAssault(raidInfo)

    // Refs
    const rankFilterRef = useRef<HTMLDivElement>(null);
    const scoreDistRef = useRef<HTMLDivElement>(null);
    const pickRateRef = useRef<HTMLDivElement>(null);
    const partyCountRef = useRef<HTMLDivElement>(null);
    const rankUsageRef = useRef<HTMLDivElement>(null);
    const compositionRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    const sections = useMemo(() => [
        { id: 'rankRange', title: t("rankRange"), ref: rankFilterRef, icon: <HiOutlineVariable className="w-4 h-4" /> },
        { id: 'score', title: t("scoreDistribution"), ref: scoreDistRef, icon: <HiOutlineChartBar className="w-4 h-4" /> },
        { id: 'participation', title: t("participationRate"), ref: pickRateRef, icon: <HiOutlineChartPie className="w-4 h-4" /> },
        { id: 'teamCount', title: t("teamUsageCount"), ref: partyCountRef, icon: <HiOutlineUsers className="w-4 h-4" /> },
        { id: 'growth', title: t("StudentGrowthByRankTitle"), ref: rankUsageRef, icon: <HiOutlineUserGroup className="w-4 h-4" /> },
        { id: 'formations', title: t("popularFormations").replace(/\{.*\}/, '').trim(), ref: compositionRef, icon: <HiOutlineUserGroup className="w-4 h-4" /> },
        { id: 'rankings', title: t("rankingsAndTeams").replace(/\{.*\}/, '').trim(), ref: tableRef, icon: <HiOutlineTableCells className="w-4 h-4" /> },
    ], [t]);

    const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const [activeSection, setActiveSection] = useState<string>(sections[0].id);
    const [isNavOpen, setIsNavOpen] = useState(false)

    useEffect(() => {
        const observerCallback = (entries: IntersectionObserverEntry[]) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    setActiveSection(entry.target.id);
                }
            });
        };
        const observer = new IntersectionObserver(observerCallback, {
            rootMargin: "-40% 0px -60% 0px",
            threshold: 0
        });
        sections.forEach(section => {
            if (section.ref.current) {
                section.ref.current.id = section.id;
                observer.observe(section.ref.current);
            }
        });
        return () => observer.disconnect();
    }, [sections]);

    const renderNavLinks = (onLinkClick: () => void = () => { }) => {
        return sections.map(section => (
            <button
                key={section.id}
                onClick={() => {
                    scrollToSection(section.ref);
                    onLinkClick();
                }}
                className={`flex items-center gap-3 px-3 py-2.5 w-full text-left text-sm font-medium rounded-lg transition-all  ${activeSection === section.id
                    ? 'bg-neutral-100 dark:bg-neutral-700 text-blue-700 dark:text-blue-400'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                    }`}
            >
                <span className="shrink-0 w-5 h-5">{section.icon}</span>
                <span>{section.title}</span>
            </button>
        ));
    };

    return (
        <div className="bg-neutral-50 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 min-h-screen font-sans" >

            <div className="fixed bottom-6 right-6 z-40">
                <button
                    onClick={() => setIsNavOpen(true)}
                    className="p-4 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 rounded-full shadow-lg ring-1 ring-black/5 dark:ring-white/10 hover:bg-neutral-50 dark:hover:bg-neutral-700 active:scale-95 transition-all"
                    aria-label={t('openNavigation', 'open')}
                >
                    <HiOutlineBars3 className="w-6 h-6" />
                </button>
            </div>

            <div
                className={`fixed inset-0 z-50 transition-opacity duration-300 ${isNavOpen ? 'bg-black/40 backdrop-blur-sm' : 'bg-transparent pointer-events-none'
                    }`}
                onClick={() => setIsNavOpen(false)}
                aria-hidden="true"
            ></div>

            <div
                className={`fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-neutral-800 rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out
                            sm:max-w-md sm:mx-auto sm:bottom-4 sm:rounded-2xl ${isNavOpen ? 'translate-y-0' : 'translate-y-full sm:translate-y-[calc(100%+1rem)]'
                    }`}
            >
                <div className="flex justify-between items-center p-4 border-b border-neutral-200 dark:border-neutral-700">
                    <h3 className="text-lg font-semibold">{t('quickNavigation')}</h3>
                    <button
                        onClick={() => setIsNavOpen(false)}
                        className="p-2 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full"
                        aria-label={t('closeNavigation', 'close')}
                    >
                        <HiOutlineXMark className="w-6 h-6" />
                    </button>
                </div>
                <nav className="space-y-1 p-4 max-h-[50vh] overflow-y-auto">
                    {renderNavLinks(() => setIsNavOpen(false))}
                </nav>
            </div>

            <div id={sections[0].id} className="gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={rankFilterRef}>
                <Card title={t("rankRange")} height='min-h-[100px]' icon={<HiOutlineVariable className="w-4 h-4" />}>
                    <RankFilter
                        currentMin={currentMin}
                        currentMax={currentMax}
                        activeRangeId={activeRangeId}
                        onRangeChange={handleRankChange}
                        raidInfo={raidInfo}
                        // rankRanges={rank_ranges}
                    />
                </Card>
            </div>

            {/* ... Remaining charts and components ... */}
            <div id={sections[1].id} className="gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={scoreDistRef}>
                <Card title={t("scoreDistribution")} defaultExpanded={false} icon={<HiOutlineChartBar className="w-4 h-4" />}>
                    <ScoreDistributionChart data={rankFilteredData} raid={raidInfo} server={server} />
                </Card>
            </div>

            <div id={sections[2].id} className="gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={pickRateRef}>
                <Card title={t("participationRate")} defaultExpanded={true} icon={<HiOutlineChartPie className="w-4 h-4" />}>
                    <StackedPickRateChart data={rankFilteredData} studentData={studentData} portraitData={portraitData} />
                </Card>
            </div>

            <div id={sections[3].id} className="gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={partyCountRef}>
                <Card title={t("teamUsageCount")} height={"h-[125px]"} defaultExpanded={true} icon={<HiOutlineUsers className="w-4 h-4" />}>
                    <PartyCountChart data={rankFilteredData} />
                </Card>
            </div>

            <div id={sections[4].id} className="gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={rankUsageRef}>
                <Card title={t("StudentGrowthByRankTitle")} defaultExpanded={false} icon={<HiOutlineUserGroup className="w-4 h-4" />}>
                    <RankUsageChart data={rankFilteredData} studentData={studentData} portraitData={portraitData} />
                </Card>
            </div>

            <div id={sections[5].id} className="grid grid-cols-1 xl:grid-cols-1 gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={compositionRef}>
                <Card title={t("popularFormations").replace('{x}', detailedFilteredData.length.toLocaleString())} defaultExpanded={true} icon={<HiOutlineUserGroup className="w-4 h-4" />}>
                    <CompositionChart data={rankFilteredData} studentData={studentData} portraitData={portraitData} raidInfo={raidInfo}
                        server={server} />
                </Card>
            </div>


            <div id={sections[6].id} className="grid grid-cols-1 xl:grid-cols-1 gap-8 mb-6 sm:mb-14 scroll-mt-15" ref={tableRef}>
                <Card title={t("rankingsAndTeams").replace('{x}', detailedFilteredData.length.toLocaleString())} className="block!" icon={<HiOutlineTableCells className="w-4 h-4" />} headerActions={
                    <DownloadButton data={detailedFilteredData} filename="TeamDataDetail.csv" />
                }>
                    <TableFilterPanelComponent tableFilters={tableFilters} handleTableFilterChange={handleTableFilterChange} usageStats={usageStats} studentData={studentData} portraitData={portraitData} />

                    <RankingsTableComponent
                        detailedFilteredData={detailedFilteredData}
                        currentPage={currentPage}
                        itemsPerPage={itemsPerPage}
                        studentData={studentData}
                        portraitData={portraitData}
                        paginatedData={displayData}
                        handlePageChange={handlePageChange}
                        handleItemsPerPageChange={handleItemsPerPageChange}
                        handleLoadMore={handleLoadMore}
                        handleScrollToTop={handleScrollToTableArea}
                        showRank={!isRaid}
                        activeRange={{ id: activeRangeId, name: 'Custom', min: currentMin, max: currentMax }}
                        raidInfo={raidInfo}
                        server={server}
                    />
                </Card>
            </div>
        </div>
    );
}

export default DashboardUI;