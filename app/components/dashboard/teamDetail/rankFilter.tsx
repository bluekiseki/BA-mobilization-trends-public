// // app/components/dashboard/teamDetail/rankFilter.tsx
// import { useEffect, useState } from "react";
// import { useTranslation } from "react-i18next";

// export interface RankRange {
//     id: string;
//     name: string;
//     min: number;
//     max: number;
// }

// export const RankFilter: React.FC<{
//     activeRange: RankRange;
//     onRangeChange: (range: RankRange) => void;
//     rankRanges: RankRange[];
// }> = ({ activeRange, onRangeChange, rankRanges }) => {
//     const [minRank, setMinRank] = useState(activeRange.min);
//     const [maxRank, setMaxRank] = useState(activeRange.max);
//     const { t: t_c } = useTranslation("common");

//     useEffect(() => {
//         setMinRank(activeRange.min);
//         setMaxRank(activeRange.max);
//     }, [activeRange]);

//     const handleApplyCustomRange = () => {
//         const min = Math.max(1, minRank); // min 1
//         const max = Math.max(min, maxRank); // sudo max >= min
//         onRangeChange({
//             id: 'custom', // id indicating custom range
//             name: `${min} - ${max}`,
//             min: min,
//             max: max,
//         });
//     };

//     return (
//         <>
//             {/* Preset Buttons */}
//             <div className='overflow-x-auto flex p-2 items-center space-x-4 '>
//                 {rankRanges.map(range => (
//                     <button
//                         key={range.id}
//                         onClick={() => onRangeChange(range)}
//                         className={`text-sm px-3 py-2 my-1 rounded whitespace-nowrap transition-colors ${activeRange.id === range.id
//                             ? 'bg-bluearchive-botton-yellow text-black'
//                             : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-500'
//                             }`}
//                     >
//                         {range.name}
//                     </button>
//                 ))}
//             </div>

//             {/* Custom Range Inputs */}
//             <div className="flex items-center space-x-2 mb-2">
//                 <input
//                     type="number"
//                     value={minRank}
//                     onChange={(e) => setMinRank(Number(e.target.value))}
//                     className="w-24 rounded border border-neutral-300 bg-white p-1 text-center text-neutral-900 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
//                 />
//                 <span className="text-neutral-700 dark:text-white">-</span>
//                 <input
//                     type="number"
//                     value={maxRank}
//                     onChange={(e) => setMaxRank(Number(e.target.value))}
//                     className="w-24 rounded border border-neutral-300 bg-white p-1 text-center text-neutral-900 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
//                 />
//                 <button
//                     onClick={handleApplyCustomRange}
//                     className="bg-bluearchive-botton-blue hover:bg-sky-500 text-black px-3 py-1 rounded"
//                 >
//                     {t_c('confirm')}
//                 </button>
//             </div>
//         </>

//     );
// };

import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { RaidInfo } from "~/types/data";
import { difficultyInfo } from "~/components/Difficulty";

export interface RankRange {
    id: string;
    name: string;
    min: number;
    max: number;
}

interface RankFilterProps {
    currentMin: number;
    currentMax: number;
    activeRangeId: string;
    onRangeChange: (min: number, max: number, id?: string) => void;
    raidInfo: RaidInfo;
}

export const RankFilter: React.FC<RankFilterProps> = ({
    currentMin,
    currentMax,
    onRangeChange,
    raidInfo
}) => {
    // Actively utilize local state for immediate UI responsiveness.
    const [minRankInput, setMinRankInput] = useState(currentMin);
    const [maxRankInput, setMaxRankInput] = useState(currentMax);
    const { t: t_c } = useTranslation("common");

    // Synchronize only when parent values change externally (e.g., reset, clicking different presets)
    // (Caution may be needed to avoid synchronization during user input, but overwriting is fine in the current structure)
    useEffect(() => {
        setMinRankInput(currentMin);
        setMaxRankInput(currentMax);
    }, [currentMin, currentMax]);

    // --- 1. Button list generation logic ---
    const { minOptions, maxOptions } = useMemo(() => {
        const mins: { label?: string, value: number }[] = [];
        const maxs: { label?: string, value: number }[] = [];

        let currentCount = 1;

        // Iterate through difficulty levels
        for (const diff of difficultyInfo) {
            // If data for the corresponding difficulty exists
            if (raidInfo.Cnt[diff.name]) {
                const count = raidInfo.Cnt[diff.name] || 0;
                const startRank = currentCount;
                const endRank = currentCount + count - 1;

                // Min button: Difficulty starting point (e.g., 1, 10001...)
                mins.push({
                    value: startRank,
                    label: diff.name // Save difficulty name
                });

                // Max button: Difficulty end point
                maxs.push({
                    value: endRank,
                    label: diff.name // Save difficulty name
                });

                // Update next difficulty count
                currentCount += count;
            }
        }

        // Add fixed major cutoffs (e.g., IN100)
        // Exclude numbers that already exist as difficulty boundaries to prevent duplicates
        const fixedCuts = [100, 1000, 10000, 12000, 15000, 20000];
        fixedCuts.forEach(cut => {
            if (cut <= raidInfo.Cnt.All && !maxs.find(m => m.value === cut)) {
                maxs.push({ value: cut }); // No label
            }
        });

        // Sort in ascending order
        mins.sort((a, b) => a.value - b.value);
        maxs.sort((a, b) => a.value - b.value);

        return { minOptions: mins, maxOptions: maxs };
    }, [raidInfo]);


    // --- 2. Asynchronous handler (To prevent UI blocking) ---
    const handleApply = (newMin: number, newMax: number) => {
        const validatedMax = Math.max(newMin, newMax);

        // [Step 1] Immediate UI update (Optimistic Update)
        // Enhance responsiveness by updating the screen before the heavy onRangeChange execution
        setMinRankInput(newMin);
        setMaxRankInput(validatedMax);

        // [Step 2] Defer heavy computations to the next rendering cycle
        // Using setTimeout 0 allows execution after the browser finishes the current rendering (e.g., button color change)
        setTimeout(() => {
            onRangeChange(newMin, validatedMax, 'custom');
        }, 0);
    };

    const handleMinClick = (val: number) => {
        // If the selected Min is greater than the current Max, push Max to the same value
        const newMax = Math.max(val, maxRankInput);
        handleApply(val, newMax);
    };

    const handleMaxClick = (val: number) => {
        // If the selected Max is smaller than the current Min, reduce Min accordingly
        const newMin = Math.min(val, minRankInput);
        handleApply(newMin, val);
    };

    const handleInputConfirm = () => {
        handleApply(minRankInput, maxRankInput);
    };

    return (
        <div className="flex flex-col gap-3 p-1">

            {/* Row 1: Min Buttons (Start Points) */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-neutral-400 text-xs font-bold uppercase w-12 shrink-0">Start</span>
                {minOptions.map((opt) => (
                    <button
                        key={`min-${opt.value}`}
                        onClick={() => handleMinClick(opt.value)}
                        // React immediately by using minRankInput (local value) instead of currentMin (parent value) as the styling criterion
                        disabled={opt.value > maxRankInput}
                        className={`px-3 py-1.5 text-xs font-medium transition-all shadow-sm border
                            ${minRankInput === opt.value
                                ? 'bg-bluearchive-botton-yellow text-black border-bluearchive-botton-yellow ring-2 ring-yellow-200/50'
                                : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed'
                            }`}
                    >
                        {opt.value.toLocaleString()}
                        {opt.label && <span className="ml-1 opacity-70 font-normal">({opt.label})</span>}
                    </button>
                ))}
            </div>

            {/* Row 2: Max Buttons (End Points) */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-neutral-400 text-xs font-bold uppercase w-12 shrink-0">End</span>
                {maxOptions.map((opt) => (
                    <button
                        key={`max-${opt.value}`}
                        onClick={() => handleMaxClick(opt.value)}
                        disabled={opt.value < minRankInput}
                        className={`px-3 py-1.5 text-xs font-medium transition-all shadow-sm border
                            ${maxRankInput === opt.value
                                ? 'bg-bluearchive-botton-yellow text-black border-bluearchive-botton-yellow ring-2 ring-yellow-200/50'
                                : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed'
                            }`}
                    >
                        {opt.value.toLocaleString()}
                        {opt.label && <span className="ml-1 opacity-70 font-normal">({opt.label})</span>}
                    </button>
                ))}
            </div>

            {/* Row 3: Inputs & Confirm */}
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 overflow-hidden focus-within:ring-2 focus-within:ring-blue-400 transition-shadow shadow-sm">
                    <input
                        type="number"
                        value={minRankInput}
                        onChange={(e) => setMinRankInput(Number(e.target.value))}
                        className="w-24 p-2 text-center bg-transparent outline-none text-neutral-900 dark:text-white placeholder-neutral-400 text-sm"
                        placeholder="Min"
                    />
                    <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-600"></div>
                    <input
                        type="number"
                        value={maxRankInput}
                        onChange={(e) => setMaxRankInput(Number(e.target.value))}
                        className="w-24 p-2 text-center bg-transparent outline-none text-neutral-900 dark:text-white placeholder-neutral-400 text-sm"
                        placeholder="Max"
                    />
                </div>

                <button
                    onClick={handleInputConfirm}
                    className="bg-bluearchive-botton-blue hover:bg-sky-500 active:bg-sky-600 text-white px-5 py-2 text-sm font-bold transition-colors shadow-sm"
                >
                    {t_c('confirm')}
                </button>
            </div>
        </div>
    );
};