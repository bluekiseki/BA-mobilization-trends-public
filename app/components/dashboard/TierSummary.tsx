import { TIER_COLORS, TIER_ORDER } from '~/data/raidInfo';
import { getBracketFromTotalScore, getDifficultyFromScoreAndBoss } from '../Difficulty';
import { useEffect, useMemo, useState } from 'react';
import type { FullData, GameServer, RaidInfo } from '~/types/data';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import { formatTimeToTimestamp } from '~/utils/time';


const TierSummarySkeleton = () => (
    <div className="w-full px-2 sm:px-4 mt-8 mb-8 cursor-progress">
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="p-4 bg-white dark:bg-neutral-800 rounded-xl animate-pulse">
                    <div className="flex justify-between items-center">
                        <div className="h-6 w-20 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                        <div className="space-y-1 text-right">
                            <div className="h-4 w-24 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                            <div className="h-3 w-16 bg-gray-200 dark:bg-neutral-700 rounded ml-auto"></div>
                        </div>
                    </div>
                    <div className="mt-3 h-2.5 bg-gray-200 dark:bg-neutral-700 rounded-full"></div>
                    <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
                        <div className="h-3 w-full bg-gray-200 dark:bg-neutral-700 rounded"></div>
                    </div>
                </div>
            ))}
        </div>
        <div className="md:hidden p-4 bg-white dark:bg-neutral-800 rounded-xl animate-pulse">
            <div className="flex justify-between items-center">
                <div className="h-6 w-20 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                <div className="space-y-1 text-right">
                    <div className="h-4 w-24 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                    <div className="h-3 w-16 bg-gray-200 dark:bg-neutral-700 rounded ml-auto"></div>
                </div>
            </div>
            <div className="mt-3 h-2.5 bg-gray-200 dark:bg-neutral-700 rounded-full"></div>
            <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
                <div className="h-3 w-full bg-gray-200 dark:bg-neutral-700 rounded"></div>
                <div className="h-3 w-full mt-3 bg-gray-200 dark:bg-neutral-700 rounded"></div>
            </div>
        </div>


        <div className="md:hidden py-7">

        </div>
    </div>
);


interface TierSummaryProp {
    // tierSummaryData?: {
    //     name: string;
    //     count: number;
    //     lowestRank: number;
    //     highestRank: number;
    //     highestScore: number;
    //     lowestScore: number;
    //     difficultyTop: DifficultyName | null;
    //     difficultyCut: DifficultyName | null;
    //     timeTop: string | null;
    //     timeCut: string | null;
    //     percentage: number;
    //     startPercentage: number;
    // }[] | null
    fullData: FullData | null;
    raidInfos?: RaidInfo[]
    server: GameServer
    activeTab: string
}
const TierSummary = ({ fullData, raidInfos, server, activeTab }: TierSummaryProp) => {
    const [selectedTierName, setSelectedTierName] = useState('');





    const tierSummaryData = useMemo(() => {
        if (!fullData) return null;
        if (!raidInfos || !fullData || !raidInfos.length) return null

        const id = raidInfos[0].Id
        const isGrandAssault = raidInfos.length > 1
        const currentRaidInfo = isGrandAssault ? raidInfos.find(r => r.Type === activeTab) || raidInfos[0] : raidInfos[0];


        const totalPlayers = Object.values(fullData.tier_counter).reduce((a, b) => a + b, 0);
        if (totalPlayers === 0) return [];

        let cumulativeRank = 0;
        let cumulativePercentage = 0;

        const armorTypeIndex = raidInfos.findIndex(info => info.Type === activeTab);
        const key = (armorTypeIndex >= 0 ? `rank_${armorTypeIndex + 1}` : 'rank') as keyof FullData
        const fullDataPart = fullData[key] as Int32Array
        if (!fullDataPart) return null
        const isHideTime = isGrandAssault && activeTab == 'All'


        return TIER_ORDER.map(tierName => {
            const tierKey = String(TIER_ORDER.length - TIER_ORDER.indexOf(tierName));
            const count = fullData.tier_counter[tierKey] || 0;
            if (count === 0) return null;

            const lowestRank = cumulativeRank + 1;
            cumulativeRank += count;
            const highestRank = cumulativeRank;

            const highestScore = fullDataPart[lowestRank - 1];
            const lowestScore = fullDataPart[highestRank - 1];

            // --- New Calculations ---
            const timeTopInSeconds = isHideTime ? null : calculateTimeFromScore(highestScore, currentRaidInfo.Boss, server, id) || 0;
            const difficultyTop = isHideTime ? getBracketFromTotalScore(highestScore) : getDifficultyFromScoreAndBoss(highestScore, server, id);
            const timeCutInSeconds = (!lowestScore || isHideTime) ? null : calculateTimeFromScore(lowestScore, currentRaidInfo.Boss, server, id) || 0;
            const difficultyCut = (!lowestScore || isHideTime) ? getBracketFromTotalScore(lowestScore) : getDifficultyFromScoreAndBoss(lowestScore, server, id);
            // --- End New Calculations ---

            const percentage = (count / totalPlayers) * 100;
            const startPercentage = cumulativePercentage;
            cumulativePercentage += percentage;

            return {
                name: tierName,
                count: count,
                lowestRank: lowestRank,
                highestRank: highestRank,
                highestScore: highestScore,
                lowestScore: lowestScore,
                difficultyTop: difficultyTop,
                difficultyCut: difficultyCut,
                timeTop: timeTopInSeconds ? formatTimeToTimestamp(timeTopInSeconds) : null,
                timeCut: timeCutInSeconds ? formatTimeToTimestamp(timeCutInSeconds) : null,
                percentage: percentage,
                startPercentage: startPercentage,
            };
        }).filter(v => v != null);
    }, [fullData, server, activeTab]);



    // Sets the default selection tier for mobile views when data is loaded.
    useEffect(() => {
        if (tierSummaryData && tierSummaryData.length > 0 && !selectedTierName) {
            setSelectedTierName(tierSummaryData[0].name);
        }
    }, [tierSummaryData, selectedTierName]);


    if (!tierSummaryData || !tierSummaryData.length) return <TierSummarySkeleton />
    const selectedTier = tierSummaryData?.find(t => t.name === selectedTierName);
    if (selectedTier==undefined) return <TierSummarySkeleton />

    return (
        <div className="w-full px-2 sm:px-4 mt-8 mb-8">
            {/* --- Desktop View (md size and up) --- */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                {tierSummaryData.map(tier => (
                    <div key={`desktop-${tier.name}`} className="p-4 bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-transparent dark:border-neutral-700/50">
                        <div className="flex justify-between items-start">
                            <p className="font-bold text-xl" style={{ color: TIER_COLORS[tier.name] }}>{tier.name}</p>
                            <div className="text-right">
                                <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">
                                    {tier.lowestRank.toLocaleString()} - {tier.highestRank.toLocaleString()}th
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">({tier.count.toLocaleString()} users)</p>
                            </div>
                        </div>
                        <div className="relative w-full bg-gray-200 dark:bg-neutral-700 rounded-full h-2.5 mt-3">
                            <div className="absolute h-2.5 rounded-full" style={{ left: `${tier.startPercentage}%`, width: `${tier.percentage}%`, backgroundColor: TIER_COLORS[tier.name] }}></div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700 text-xs text-gray-600 dark:text-gray-400 space-y-1 font-mono">
                            <div className="flex justify-between">
                                <span className="font-sans font-semibold text-gray-500">Top:</span>
                                <span>{tier.difficultyTop && `[${tier.difficultyTop}]`} <b>{tier.highestScore?.toLocaleString()}</b> {tier.timeTop && `(${tier.timeTop})`}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-sans font-semibold text-gray-500">Cut:</span>
                                <span>{tier.difficultyCut && `[${tier.difficultyCut}]`} <b>{tier.lowestScore?.toLocaleString()}</b> {tier.timeCut && `(${tier.timeCut})`}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* --- Mobile View (below md size) --- */}
            <div className="md:hidden space-y-3">
                {selectedTier && (
                    <div className="p-4 bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-transparent dark:border-neutral-700/50">
                        <div className="flex justify-between items-start">
                            <p className="font-bold text-xl" style={{ color: TIER_COLORS[selectedTier.name] }}>{selectedTier.name}</p>
                            <div className="text-right">
                                <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">
                                    {selectedTier.lowestRank.toLocaleString()} - {selectedTier.highestRank.toLocaleString()}th
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">({selectedTier.count.toLocaleString()} users)</p>
                            </div>
                        </div>
                        <div className="relative w-full bg-gray-200 dark:bg-neutral-700 rounded-full h-2.5 mt-3">
                            <div className="absolute h-2.5 rounded-full" style={{ left: `${selectedTier.startPercentage}%`, width: `${selectedTier.percentage}%`, backgroundColor: TIER_COLORS[selectedTier.name] }}></div>
                        </div>
                        {/* {selectedTier.name !== 'Bronze' && ( */}
                        <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700 text-xs text-gray-600 dark:text-gray-400 space-y-1 font-mono">
                            <div className="flex justify-between">
                                <span className="font-sans font-semibold text-gray-500">Top:</span>
                                <span>{selectedTier.difficultyTop && `[${selectedTier.difficultyTop}]`} <b>{selectedTier.highestScore?.toLocaleString()}</b> {selectedTier.timeTop && `(${selectedTier.timeTop})`}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-sans font-semibold text-gray-500">Cut:</span>
                                <span>{selectedTier.difficultyCut && `[${selectedTier.difficultyCut}]`} <b>{selectedTier.lowestScore?.toLocaleString()}</b> {selectedTier.timeCut && `(${selectedTier.timeCut})`}</span>
                            </div>
                        </div>
                    </div>
                )}
                <div className="flex justify-center items-center flex-wrap gap-3 pt-2 text-white">
                    {tierSummaryData.map(tier => (
                        <button
                            key={`mobile-${tier.name}`}
                            onClick={() => setSelectedTierName(tier.name)}
                            className={`transition-all rounded-full shadow-sm ${selectedTierName === tier.name ? 'w-auto px-4 py-1.5 text-xs font-bold text-white' : 'w-5 h-5 opacity-80 hover:opacity-100'}`}
                            style={{ backgroundColor: TIER_COLORS[tier.name] }}
                        >
                            {selectedTierName === tier.name && tier.name}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}


export default TierSummary