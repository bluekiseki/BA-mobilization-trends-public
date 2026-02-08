// // app/components/planner/StudentGrowth/FaverTab.tsx

// import React, { useState, useEffect, useMemo, useCallback } from 'react';
// import { useTranslation } from 'react-i18next';
// import { affectionExpToNextLevel } from '~/data/growthData';
// import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
// import type { EventData, IconData } from '~/types/plannerData';
// import { NumberInput } from '../common/NumberInput';
// import { ItemIcon } from '../common/Icon';
// import { CustomNumberInput } from '~/components/CustomInput';
// import { MinMaxControls } from './MinMaxControls';
// import { FiCheck, FiFilter, FiRefreshCw, FiAlertCircle, FiPackage, FiTrendingUp, FiTarget } from 'react-icons/fi';

// const HighFlowerBouquetItemIds = [5996, 5997];

// interface AffectionTabProps {
//   plan: GrowthPlan;
//   giftAffectionList: {
//     id: string;
//     type: string;
//     rarity: number;
//     affectionPoints: number;
//     preferenceLevel: number;
//   }[];
//   eventData: EventData;
//   iconData: IconData;
//   handlePlanChange: (field: string, value: number | string | boolean, isNumeric?: boolean) => void;
// }

// // --- Logic Helpers ---
// const cumulativeAffectionExp: Record<number, number> = {};
// let cumulativeExp = 0;
// Object.keys(affectionExpToNextLevel)
//   .sort((a, b) => Number(a) - Number(b))
//   .forEach((levelStr) => {
//     const level = Number(levelStr);
//     cumulativeExp += affectionExpToNextLevel[level];
//     cumulativeAffectionExp[level] = cumulativeExp;
//   });

// const getPreferenceIcon = (preferenceLevel: number, rarity: number): string => {
//   let levelForIcon = preferenceLevel;
//   if (rarity === 3 && levelForIcon === 1) levelForIcon = 2;
//   if (levelForIcon >= 4) return '/img/Cafe_Interaction_Gift_04.webp';
//   if (levelForIcon === 3) return '/img/Cafe_Interaction_Gift_03.webp';
//   if (levelForIcon === 2) return '/img/Cafe_Interaction_Gift_02.webp';
//   return '/img/Cafe_Interaction_Gift_01.webp';
// };

// export const AffectionTab = ({ plan, giftAffectionList, eventData, iconData, handlePlanChange }: AffectionTabProps) => {
//   const { ownedGifts, updateOwnedGifts, resetOwnedGifts } = useGlobalStore();
//   const [calculateWithOwned, setCalculateWithOwned] = useState(true);
//   const [hideNonPreferred, setHideNonPreferred] = useState(true);
//   const { t } = useTranslation('planner');

//   const [maxLevelResult, setMaxLevelResult] = useState<{
//     text: string;
//     currentExp: number;
//     targetExp: number;
//     percentage: number;
//   } | null>(null);

//   const [targetResult, setTargetResult] = useState<React.ReactNode | null>(null);

//   const expForCurrentLevel = affectionExpToNextLevel[plan.current.affection] || 1;
//   const currentExpPercentage = (plan.current.affectionExp / expForCurrentLevel) * 100;

//   // --- Calculation Effect ---
//   useEffect(() => {
//     let expNeededForTarget = 0;
//     const expToFinishCurrentLevel = plan.current.affection === plan.target.affection ? 0 : expForCurrentLevel - plan.current.affectionExp;
//     expNeededForTarget += expToFinishCurrentLevel;

//     for (let i = plan.current.affection + 1; i < plan.target.affection; i++) {
//       expNeededForTarget += affectionExpToNextLevel[i] || 0;
//     }

//     const expFromOwned = giftAffectionList.reduce((total, gift) => total + (ownedGifts[gift.id] || 0) * gift.affectionPoints, 0);

//     const totalExpToCurrentLevelStart = cumulativeAffectionExp[plan.current.affection - 1] || 0;
//     const totalExpToTargetLevelStart = cumulativeAffectionExp[plan.target.affection - 1] || 0;

//     const currentTotalExp = totalExpToCurrentLevelStart + plan.current.affectionExp;
//     const achievableTotalExp = currentTotalExp + expFromOwned;

//     let achievableLevel = 1;
//     let progressExpInLevel = 0;
//     const sortedLevels = Object.keys(cumulativeAffectionExp).map(Number);

//     for (const level of sortedLevels) {
//       if (achievableTotalExp >= cumulativeAffectionExp[level]) {
//         achievableLevel = level + 1;
//       } else {
//         const baseExp = cumulativeAffectionExp[level - 1] || 0;
//         progressExpInLevel = achievableTotalExp - baseExp;
//         break;
//       }
//     }

//     if (achievableLevel > 100) {
//       achievableLevel = 100;
//       progressExpInLevel = 0;
//     }

//     const expForAchievableLevel = affectionExpToNextLevel[achievableLevel] || 0;
//     const totalExpRange = totalExpToTargetLevelStart - totalExpToCurrentLevelStart;

//     let overallPercentage = 0;
//     if (totalExpRange > 0) {
//       const expProgress = achievableTotalExp - totalExpToCurrentLevelStart;
//       overallPercentage = Math.min(100, Math.max(0, (expProgress / totalExpRange) * 100));
//     } else if (achievableTotalExp >= totalExpToTargetLevelStart && plan.target.affection > plan.current.affection) {
//       overallPercentage = 100;
//     }

//     setMaxLevelResult({
//       text: t('affectionTab.results.achievableLevel', {
//         level: achievableLevel,
//         progressExp: progressExpInLevel,
//         expForLevel: expForAchievableLevel,
//       }),
//       currentExp: achievableTotalExp,
//       targetExp: totalExpToTargetLevelStart,
//       percentage: overallPercentage,
//     });

//     // Recommendation Logic
//     const bestHighTierGift = giftAffectionList.find((g) => g.rarity === 3 && g.affectionPoints > 120 && !HighFlowerBouquetItemIds.includes(Number(g.id)));
//     const bestNormalGift = giftAffectionList.find((g) => g.rarity === 2 && g.affectionPoints > 20);

//     const renderNeededItems = (exp: number) => {
//       if (exp <= 0) return null;

//       const highTierNeeded = bestHighTierGift ? Math.ceil(exp / bestHighTierGift.affectionPoints) : 0;
//       const normalNeeded = bestNormalGift ? Math.ceil(exp / bestNormalGift.affectionPoints) : 0;
//       const cafeTouches = Math.ceil(exp / 15);

//       return (
//         <div className="mt-2">
//           <div className="flex flex-wrap items-center gap-2">
//             {/* High Tier Item */}
//             {bestHighTierGift && (
//               <div className="flex items-center gap-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded px-2 py-1">
//                 <ItemIcon type="Item" itemId={bestHighTierGift.id} amount={0} size={7} eventData={eventData} iconData={iconData} />
//                 <span className="text-xs font-bold text-gray-700 dark:text-gray-300">&times; {highTierNeeded.toLocaleString()}</span>
//               </div>
//             )}

//             {/* OR Separator */}
//             {bestHighTierGift && bestNormalGift && <span className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 ">OR</span>}

//             {/* Normal Tier Item */}
//             {bestNormalGift && (
//               <div className="flex items-center gap-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded px-2 py-1">
//                 <ItemIcon type="Item" itemId={bestNormalGift.id} amount={0} size={7} eventData={eventData} iconData={iconData} />
//                 <span className="text-xs font-bold text-gray-700 dark:text-gray-300">&times; {normalNeeded.toLocaleString()}</span>
//               </div>
//             )}
//             <span className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 ">OR</span>
//           </div>

//           {/* Cafe Touches */}
//           <div className="mt-2 text-[10px] text-gray-500 font-medium pl-1">{t('affectionTab.results.cafeTouches', { counts: cafeTouches.toLocaleString() })}</div>
//         </div>
//       );
//     };

//     if (calculateWithOwned) {
//       const finalDeficit = expNeededForTarget - expFromOwned;
//       if (finalDeficit <= 0) {
//         setTargetResult(
//           <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-bold text-xs mt-1">
//             <FiCheck size={12} />
//             {t('affectionTab.results.targetMetWithOwned', { surplusExp: (-finalDeficit).toLocaleString() })}
//           </div>,
//         );
//       } else {
//         setTargetResult(
//           <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg">
//             <div className="flex items-center gap-2 mb-2">
//               <FiAlertCircle className="text-red-500" size={14} />
//               <span className="text-red-600 dark:text-red-400 font-bold text-xs">{t('affectionTab.results.deficit', { deficitExp: finalDeficit.toLocaleString() })}</span>
//             </div>
//             {renderNeededItems(finalDeficit)}
//           </div>,
//         );
//       }
//     } else {
//       if (expNeededForTarget <= 0) {
//         setTargetResult(
//           <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold text-xs mt-1">
//             <FiCheck size={12} />
//             {t('affectionTab.results.targetMet')}
//           </div>,
//         );
//       } else {
//         setTargetResult(
//           <div className="mt-2 p-3 bg-gray-50 dark:bg-neutral-800/50 border border-gray-100 dark:border-neutral-800 rounded-lg">
//             <p className="text-gray-500 dark:text-gray-400 text-[10px] font-bold uppercase mb-1">Total Needed</p>
//             {renderNeededItems(expNeededForTarget)}
//           </div>,
//         );
//       }
//     }
//   }, [plan.current.affection, plan.target.affection, plan.current.affectionExp, ownedGifts, calculateWithOwned, giftAffectionList, t, eventData, iconData, expForCurrentLevel]);

//   const displayedGifts = useMemo(() => {
//     if (!hideNonPreferred) return giftAffectionList;
//     return giftAffectionList.filter((gift) => {
//       if (gift.rarity === 2) return gift.affectionPoints > 20;
//       if (gift.rarity === 3) return gift.affectionPoints > 120;
//       return false;
//     });
//   }, [giftAffectionList, hideNonPreferred]);

//   // Styles
//   const currentInputClass =
//     'w-full p-1.5 text-sm border border-gray-200 rounded bg-gray-50 dark:bg-neutral-800 dark:border-neutral-600 text-center font-medium outline-none focus:ring-1 focus:ring-gray-300 transition-all';
//   const targetInputClass =
//     'w-full p-1.5 text-sm border border-blue-200 rounded bg-white text-blue-600 font-bold dark:bg-neutral-900 dark:border-blue-900/50 dark:text-blue-400 text-center outline-none focus:ring-1 focus:ring-blue-300 transition-all';

//   return (
//     <div className="flex flex-col gap-6">
//       {/* 1. Rank & EXP Controls */}
//       <div className="flex flex-col gap-4">
//         {/* Rank Row */}
//         <div className="grid grid-cols-[70px_1fr_1fr] gap-3 items-end">
//           <div className="text-xs font-bold text-gray-400 dark:text-neutral-500 text-center uppercase pb-2">Rank</div>

//           {/* Current Rank */}
//           <div>
//             <MinMaxControls onMin={() => handlePlanChange('current.affection', 1, true)} onMax={() => handlePlanChange('current.affection', 100, true)} />
//             <CustomNumberInput min={1} max={100} value={plan.current.affection} onChange={(e) => handlePlanChange('current.affection', e || '', true)} className={currentInputClass} />
//           </div>

//           {/* Target Rank */}
//           <div>
//             <MinMaxControls isTarget onMin={() => handlePlanChange('target.affection', plan.current.affection, true)} onMax={() => handlePlanChange('target.affection', 100, true)} />
//             <CustomNumberInput
//               min={plan.current.affection}
//               max={100}
//               value={plan.target.affection}
//               onChange={(e) => handlePlanChange('target.affection', e || '', true)}
//               className={targetInputClass}
//             />
//           </div>
//         </div>

//         {/* EXP Bar */}
//         <div className="pl-[82px]">
//           <div className="flex justify-between items-end mb-1.5">
//             <span className="text-[10px] font-bold text-gray-400">EXP</span>
//             <span className="text-[10px] font-mono font-medium text-gray-500 dark:text-gray-400">
//               <span className="text-blue-600 dark:text-blue-400">{plan.current.affectionExp}</span>
//               <span className="text-gray-300 mx-1">/</span>
//               {expForCurrentLevel}
//             </span>
//           </div>

//           <div className="relative h-4 flex items-center group">
//             <div className="absolute w-full h-2 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
//               <div className="h-full bg-blue-500 dark:bg-blue-600 transition-all duration-150 ease-out" style={{ width: `${currentExpPercentage}%` }} />
//             </div>
//             <input
//               type="range"
//               min="0"
//               max={expForCurrentLevel - 1}
//               value={plan.current.affectionExp}
//               onChange={(e) => handlePlanChange('current.affectionExp', Number(e.target.value), true)}
//               className="absolute w-full h-full opacity-0 cursor-pointer z-10"
//             />
//           </div>
//         </div>
//       </div>

//       {/* 2. Inventory Grid */}
//       <div className="flex flex-col gap-3">
//         <div className="flex items-center justify-between border-b border-gray-100 dark:border-neutral-800 pb-2">
//           <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t('affectionTab.ownedGiftsTitle')}</h3>
//           <div className="flex gap-3">
//             <button
//               onClick={() => setHideNonPreferred(!hideNonPreferred)}
//               className={`flex items-center gap-1 text-[10px] font-bold transition-colors ${hideNonPreferred ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
//             >
//               <FiFilter size={10} />
//               {t('affectionTab.showPreferredOnly')}
//             </button>
//             <button
//               onClick={() => {
//                 if (window.confirm(t('affectionTab.resetConfirm'))) resetOwnedGifts();
//               }}
//               className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-red-500 transition-colors"
//             >
//               <FiRefreshCw size={10} />
//               {t('affectionTab.reset')}
//             </button>
//           </div>
//         </div>

//         {/* Gift Grid: Item Cells with Border/Background */}
//         <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 gap-2">
//           {displayedGifts.map((gift) => (
//             <div
//               key={gift.id}
//               className="flex flex-col items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/40 transition-all hover:border-blue-300 dark:hover:border-blue-700"
//             >
//               <div className="relative">
//                 <ItemIcon type={gift.type} itemId={gift.id} amount={0} size={10} eventData={eventData} iconData={iconData} />
//                 {/* Preference Badge: Icon + Points */}
//                 <div className="absolute -bottom-1 -right-1.5 bg-white/95 dark:bg-neutral-900/90 rounded px-1 py-0.5 border border-gray-100 dark:border-neutral-700 shadow-sm flex items-center gap-0.5">
//                   <img src={getPreferenceIcon(gift.preferenceLevel, gift.rarity)} alt="" className="w-2.5 h-2.5 object-contain" />
//                   <span className="text-[8px] font-bold text-gray-600 dark:text-gray-400">+{gift.affectionPoints}</span>
//                 </div>
//               </div>
//               <div className="w-full">
//                 <NumberInput value={ownedGifts[gift.id] || 0} onChange={(val) => updateOwnedGifts(gift.id, val)} min={0} max={999} narrowButtonType="plus" />
//               </div>
//             </div>
//           ))}
//         </div>
//       </div>

//       {/* 3. Results Section */}
//       <div className="pt-2 border-t border-gray-100 dark:border-neutral-800">
//         <label className="flex items-center gap-2 cursor-pointer mb-3 w-fit select-none">
//           <input
//             type="checkbox"
//             checked={calculateWithOwned}
//             onChange={(e) => setCalculateWithOwned(e.target.checked)}
//             className="rounded text-blue-500 focus:ring-0 border-gray-300 dark:border-neutral-600 dark:bg-neutral-800 w-4 h-4"
//           />
//           <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{t('affectionTab.calculateWithOwned')}</span>
//         </label>

//         {calculateWithOwned && maxLevelResult && (
//           <div className="px-3 animate-in fade-in slide-in-from-top-1 space-y-3 ">
//             <div className="flex flex-col gap-1.5">
//               <div className="flex justify-between items-baseline">
//                 <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{maxLevelResult.text}</span>
//                 <span className="text-xs font-mono font-bold text-blue-500">{maxLevelResult.percentage.toFixed(0)}%</span>
//               </div>
//               <div className="w-full h-1.5 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
//                 <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${maxLevelResult.percentage}%` }}></div>
//               </div>
//             </div>
//             <div className="text-sm">{targetResult}</div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };
// */

// app/components/planner/StudentGrowth/FaverTab.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiFilter, FiTrendingUp, FiTarget, FiBox, FiRepeat, FiCoffee, FiCalendar } from 'react-icons/fi';

import { affectionExpToNextLevel } from '~/data/growthData';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventData, IconData } from '~/types/plannerData';

// Shared Components
import { ItemIcon } from '../common/Icon';
import { CustomNumberInput } from '~/components/CustomInput';
import { NumberInput } from '../common/NumberInput';

// --- Constants ---

const SELECTION_BOX_ID = 100008;
const CAFE_TOUCH_EXP = 15;
const SCHEDULE_EXP = 25;

// Pre-calculate cumulative EXP
const cumulativeAffectionExp: Record<number, number> = {};
let cumulativeExp = 0;
Object.keys(affectionExpToNextLevel)
  .sort((a, b) => Number(a) - Number(b))
  .forEach((levelStr) => {
    const level = Number(levelStr);
    cumulativeExp += affectionExpToNextLevel[level];
    cumulativeAffectionExp[level] = cumulativeExp;
  });

const getPreferenceIcon = (preferenceLevel: number, rarity: number): string => {
  let levelForIcon = preferenceLevel;
  if (rarity === 3 && levelForIcon === 1) levelForIcon = 2;
  if (levelForIcon >= 4) return '/img/Cafe_Interaction_Gift_04.webp';
  if (levelForIcon === 3) return '/img/Cafe_Interaction_Gift_03.webp';
  if (levelForIcon === 2) return '/img/Cafe_Interaction_Gift_02.webp';
  return '/img/Cafe_Interaction_Gift_01.webp';
};

// --- Types ---

interface AffectionTabProps {
  plan: GrowthPlan;
  giftAffectionList: {
    id: string;
    type: string;
    rarity: number;
    affectionPoints: number;
    preferenceLevel: number;
  }[];
  eventData: EventData;
  iconData: IconData;
  handlePlanChange: (field: string, value: number | string | boolean, isNumeric?: boolean) => void;
}

interface CalculationResult {
  status: 'success' | 'deficit';
  achievableLevel: number;
  percentage: number;
  deficitExp: number;
  surplusExp: number;
  cafeTouchCount: number;
  scheduleCount: number;
  craftingRequiredCount: number;
}

// --- Sub-components ---

const GiftItem = React.memo(
  ({
    gift,
    ownedCount,
    deficitExp,
    eventData,
    iconData,
    onUpdate,
  }: {
    gift: AffectionTabProps['giftAffectionList'][0];
    ownedCount: number;
    deficitExp: number;
    eventData: EventData;
    iconData: IconData;
    onUpdate: (id: string, val: number) => void;
  }) => {
    const { t } = useTranslation('planner');
    const prefIcon = useMemo(() => getPreferenceIcon(gift.preferenceLevel, gift.rarity), [gift.preferenceLevel, gift.rarity]);

    const neededCount = deficitExp > 0 ? Math.ceil(deficitExp / gift.affectionPoints) : 0;

    return (
      // 1. Limit max width (max-w-[60px]), center alignment (mx-auto), and reduce padding (p-1.5)
      <div className="group flex flex-col p-1.5 w-full max-w-[80px] mx-auto bg-white dark:bg-neutral-800 rounded-md hover:bg-gray-50 dark:hover:bg-neutral-700/50 transition-colors">
        {/* Image Area */}
        <div className="relative w-full aspect-square bg-gray-50 dark:bg-neutral-900 rounded-sm flex items-center justify-center mb-1 overflow-hidden">
          {/* 2. Increase image size: increase size prop instead of scale (7 -> 9) */}
          <div className="transform transition-transform group-hover:scale-105">
            <ItemIcon type="Item" itemId={gift.id} amount={0} size={13} eventData={eventData} iconData={iconData} />
          </div>

          {/* Info Overlays */}
          <div className="absolute top-0 left-0 bg-black/70 text-white px-1 py-px rounded-br-sm text-[9px] font-mono backdrop-blur-[1px] leading-none">+{gift.affectionPoints}</div>
          <div className="absolute bottom-0 right-0 p-0.5 bg-white/90 dark:bg-black/60 rounded-tl-sm backdrop-blur-sm">
            <img src={prefIcon} alt="Pref" className="w-4 h-4 object-contain" />
          </div>
        </div>

        {/* Input Area */}
        <div className="mt-auto w-full">
          <div className="flex justify-end h-3.5 mb-0.5">
            {neededCount > 0 && <span className="text-[9px] font-bold text-red-500 flex items-center gap-1 animate-pulse truncate">{t('affectionTab.item.need', { counts: neededCount })}</span>}
          </div>

          <div className={`relative flex items-center bg-gray-50 dark:bg-neutral-900 rounded-sm overflow-hidden ${neededCount > 0 ? 'ring-1 ring-red-100 dark:ring-red-900/50' : ''}`}>
            <NumberInput
              value={ownedCount}
              onChange={(val) => onUpdate(gift.id, Number(val))}
              min={0}
              max={9999}
              className="w-full text-center h-7 text-xs font-bold bg-transparent border-none focus:ring-0 px-0 text-gray-700 dark:text-gray-200"
              placeholder="0"
              narrowButtonType="plus"
            />
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => prev.ownedCount === next.ownedCount && prev.gift.id === next.gift.id && prev.deficitExp === next.deficitExp,
);

GiftItem.displayName = 'GiftItem';

// --- Main Component ---

export const AffectionTab = ({ plan, giftAffectionList, eventData, iconData, handlePlanChange }: AffectionTabProps) => {
  const { t } = useTranslation('planner');
  const { ownedGifts, updateOwnedGifts } = useGlobalStore();

  // UI States
  const [simulateCrafting, setSimulateCrafting] = useState(false);
  const [hideNonPreferred, setHideNonPreferred] = useState(true);
  const [selectionBoxCount, setSelectionBoxCount] = useState(0);

  // Logic States
  const [result, setResult] = useState<CalculationResult | null>(null);

  useEffect(() => {
    if (ownedGifts[SELECTION_BOX_ID] !== undefined) {
      setSelectionBoxCount(ownedGifts[SELECTION_BOX_ID]);
    }
  }, [ownedGifts]);

  const handleUpdateGift = useCallback(
    (id: string, val: number) => {
      updateOwnedGifts(id, val);
    },
    [updateOwnedGifts],
  );

  const handleUpdateSelectionBox = (val: number) => {
    setSelectionBoxCount(val);
    updateOwnedGifts(String(SELECTION_BOX_ID), val);
  };

  // --- Core Calculation ---
  useEffect(() => {
    // 1. Calculate target EXP
    const expForCurrentLevel = affectionExpToNextLevel[plan.current.affection] || 1;
    let expNeededTotal = 0;

    // Remaining EXP for current level
    const expToFinishCurrent = plan.current.affection === plan.target.affection ? 0 : expForCurrentLevel - plan.current.affectionExp;
    expNeededTotal += expToFinishCurrent;

    // Intermediate levels
    for (let i = plan.current.affection + 1; i < plan.target.affection; i++) {
      expNeededTotal += affectionExpToNextLevel[i] || 0;
    }

    // 2. Variable settings
    // Maximum efficiency obtainable with a selection box (based on current student, highest value among Rarity 2)
    const bestNormalGift = giftAffectionList.filter((g) => g.rarity === 2).reduce((prev, curr) => (curr.affectionPoints > prev.affectionPoints ? curr : prev), { affectionPoints: 0 });

    // Selection box value (defaults to 60 if none)
    const targetUnitValue = bestNormalGift.affectionPoints || 60;

    // 3. Simulation logic
    // Copy original inventory (for simulation purposes)
    const inventory = { ...ownedGifts };
    // Reflect the number of selection boxes in inventory (ID: SELECTION_BOX_ID)
    inventory[SELECTION_BOX_ID] = selectionBoxCount;

    // Function to calculate total EXP obtainable with currently held items
    const calculateCurrentTotal = () => {
      let sum = 0;
      // Normal gifts
      giftAffectionList.forEach((gift) => {
        sum += (inventory[gift.id] || 0) * gift.affectionPoints;
      });
      // Selection boxes (assuming conversion at maximum efficiency)
      sum += (inventory[SELECTION_BOX_ID] || 0) * targetUnitValue;
      return sum;
    };

    let currentExp = calculateCurrentTotal();
    let craftingCount = 0;

    // If crafting simulation is enabled and goal is not yet reached, start 'conversion'
    if (simulateCrafting && currentExp < expNeededTotal) {
      // Find conversion candidates: Items where (Individual Efficiency * 2 < Selection Box Efficiency)
      // Sort by lowest efficiency (lowest EXP) to consume first (maximize gain)
      const fodderCandidates = giftAffectionList.filter((g) => g.affectionPoints * 2 < targetUnitValue).sort((a, b) => a.affectionPoints - b.affectionPoints);

      // Iterate through candidates and convert
      for (const item of fodderCandidates) {
        // Current item stock
        let count = inventory[item.id] || 0;

        // Continue conversion if goal is not met and at least 2 materials remain
        while (currentExp < expNeededTotal && count >= 2) {
          // Consume 2 materials
          count -= 2;
          inventory[item.id] = count;

          // Increase craft count (assuming 1 selection box is created)
          craftingCount++;

          // Update EXP: (-2 * Individual EXP) + (1 * Selection Box EXP)
          // Instead of increasing selection boxes in actual inventory, only update the total score (currentExp).
          currentExp = currentExp - 2 * item.affectionPoints + targetUnitValue;
        }
      }
    }

    // 4. Calculate final results
    const finalDeficit = Math.max(0, expNeededTotal - currentExp);
    const surplus = Math.abs(expNeededTotal - currentExp);
    const isSuccess = currentExp >= expNeededTotal;

    // Predict achievable level
    const totalExpToCurrentLevelStart = cumulativeAffectionExp[plan.current.affection - 1] || 0;
    const totalExpToTargetLevelStart = cumulativeAffectionExp[plan.target.affection - 1] || 0;
    const achievableTotalExp = totalExpToCurrentLevelStart + plan.current.affectionExp + currentExp;

    let achievableLevel = 1;
    const sortedLevels = Object.keys(cumulativeAffectionExp).map(Number);
    for (const level of sortedLevels) {
      if (achievableTotalExp >= cumulativeAffectionExp[level]) {
        achievableLevel = level + 1;
      } else {
        break;
      }
    }
    if (achievableLevel > 100) achievableLevel = 100;

    // Calculate percentage
    const totalRange = totalExpToTargetLevelStart - totalExpToCurrentLevelStart;
    let overallPercentage = 0;
    if (totalRange > 0) {
      const progress = achievableTotalExp - totalExpToCurrentLevelStart;
      overallPercentage = Math.min(100, Math.max(0, (progress / totalRange) * 100));
    } else if (achievableTotalExp >= totalExpToTargetLevelStart) {
      overallPercentage = 100;
    }

    // Number of crafts required to fill the deficit (for the remaining deficit only)
    const cafeTouchCount = Math.ceil(finalDeficit / CAFE_TOUCH_EXP);
    const scheduleCount = Math.ceil(finalDeficit / SCHEDULE_EXP);

    setResult({
      status: isSuccess ? 'success' : 'deficit',
      achievableLevel,
      percentage: overallPercentage,
      deficitExp: finalDeficit,
      surplusExp: isSuccess ? surplus : 0,
      cafeTouchCount,
      scheduleCount,
      craftingRequiredCount: craftingCount, // Calculated minimum number of crafts
    });
  }, [plan, ownedGifts, giftAffectionList, selectionBoxCount, simulateCrafting]);

  const displayedGifts = useMemo(() => {
    if (!hideNonPreferred) return giftAffectionList;
    return giftAffectionList.filter((gift) => {
      if (gift.rarity === 2) return gift.affectionPoints > 20;
      if (gift.rarity === 3) return gift.affectionPoints > 120;
      return false;
    });
  }, [giftAffectionList, hideNonPreferred]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full font-sans text-gray-700 dark:text-gray-200">
      {/* --- LEFT: Dashboard --- */}
      <div className="w-full lg:w-72 shrink-0 flex flex-col gap-6">
        {/* Result Card */}
        {result && (
          <div className="bg-gray-50 dark:bg-neutral-800 rounded-md p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between text-xs text-gray-400 font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <FiTrendingUp /> {t('affectionTab.result.title')}
              </span>
              {result.status === 'success' ? (
                <span className="text-green-500 flex items-center gap-1">
                  {simulateCrafting && result.craftingRequiredCount > 0 && <FiRepeat className="animate-spin-slow" />}
                  <FiCheck /> {t('affectionTab.result.success')}
                </span>
              ) : (
                <span className="text-red-500 flex items-center gap-1">
                  <FiTarget /> {t('affectionTab.result.missing')}
                </span>
              )}
            </div>

            <div>
              <div className="text-3xl font-black text-gray-800 dark:text-gray-100 leading-none mb-2">
                Lv.{result.achievableLevel}
                <span className="text-sm font-medium text-gray-400 ml-1">/ {plan.target.affection}</span>
              </div>
              <div className="h-1 w-full bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-700 ease-out ${result.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${result.percentage}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 mt-1">
              <div className="col-span-2 bg-white dark:bg-neutral-700/30 p-2.5 rounded-sm flex justify-between items-center shadow-sm dark:shadow-none">
                <span className="text-[10px] text-gray-400 font-bold uppercase">{t('affectionTab.result.expGap')}</span>
                {result.status === 'deficit' ? (
                  <span className="text-sm font-bold text-red-500">-{result.deficitExp.toLocaleString()}</span>
                ) : (
                  <span className="text-sm font-bold text-green-500">+{result.surplusExp.toLocaleString()}</span>
                )}
              </div>

              <div className={`bg-white dark:bg-neutral-700/30 p-2 rounded-sm shadow-sm dark:shadow-none ${result.status === 'success' ? 'opacity-40 grayscale' : ''}`}>
                <p className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1 mb-0.5">
                  <FiCoffee /> {t('affectionTab.result.cafe')} +15
                </p>
                <p className="text-sm font-bold">
                  {result.cafeTouchCount.toLocaleString()} <span className="text-[9px] font-normal text-gray-400">{t('affectionTab.units.taps')}</span>
                </p>
              </div>

              <div className={`bg-white dark:bg-neutral-700/30 p-2 rounded-sm shadow-sm dark:shadow-none ${result.status === 'success' ? 'opacity-40 grayscale' : ''}`}>
                <p className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1 mb-0.5">
                  <FiCalendar /> {t('affectionTab.result.schedule')} +25
                </p>
                <p className="text-sm font-bold">
                  {result.scheduleCount.toLocaleString()} <span className="text-[9px] font-normal text-gray-400">{t('affectionTab.units.runs')}</span>
                </p>
              </div>

              {/* Display craft count (Conversion Crafting) */}
              {simulateCrafting && result.craftingRequiredCount > 0 && (
                <div className="col-span-2 mt-1 bg-amber-50 dark:bg-amber-900/20 p-2.5 rounded-sm flex justify-between items-center border-l-2 border-amber-400 dark:border-amber-600">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase flex items-center gap-1">
                      <FiRepeat /> {t('affectionTab.result.craftingNeeded')}
                    </span>
                    <span className="text-[9px] text-amber-500/80">{t('affectionTab.result.lowTierConversion')}</span>
                  </div>
                  <span className="text-base font-bold text-amber-700 dark:text-amber-300">
                    {result.craftingRequiredCount.toLocaleString()} <span className="text-xs font-normal">{t('affectionTab.units.times')}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Level Controls */}
        <div className="space-y-6 px-1">
          {/* Current Level */}
          <div>
            <div className="flex justify-between text-xs font-bold text-gray-500 mb-1.5">
              <span>{t('affectionTab.labels.current')}</span>
              <span className="text-gray-800 dark:text-white">Lv.{plan.current.affection}</span>
            </div>

            {/* Level Slider */}
            <input
              type="range"
              min="1"
              max="100"
              value={plan.current.affection}
              onChange={(e) => handlePlanChange('current.affection', Number(e.target.value), true)}
              className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-neutral-700 accent-gray-600"
            />

            {/* Percentage Slider with Numeric Display */}
            <div className="flex items-center gap-2 mt-2 opacity-70 hover:opacity-100 transition-opacity">
              {/* Display values (e.g., 3 / 43) */}
              <span className="text-[10px] font-bold text-gray-400 min-w-[60px] text-right tabular-nums whitespace-nowrap">
                {plan.current.affectionExp} / {affectionExpToNextLevel[plan.current.affection] || 0}
              </span>

              <input
                type="range"
                min="0"
                max={affectionExpToNextLevel[plan.current.affection] || 100}
                value={plan.current.affectionExp}
                onChange={(e) => handlePlanChange('current.affectionExp', Number(e.target.value), true)}
                className="flex-1 h-1 bg-gray-100 rounded-lg appearance-none cursor-pointer dark:bg-neutral-800 accent-gray-400"
              />
            </div>
          </div>

          {/* Target Level */}
          <div>
            <div className="flex justify-between text-xs font-bold text-gray-500 mb-1.5">
              <span className="text-blue-500">{t('affectionTab.labels.target')}</span>
              <span className="text-blue-600 dark:text-blue-400">Lv.{plan.target.affection}</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              value={plan.target.affection}
              onChange={(e) => handlePlanChange('target.affection', Number(e.target.value), true)}
              className="w-full h-1 bg-blue-100 rounded-lg appearance-none cursor-pointer dark:bg-blue-900/30 accent-blue-500"
            />
          </div>
        </div>
      </div>

      {/* --- RIGHT: Inventory --- */}
      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {/* Top Bar */}
        <div className="bg-white dark:bg-neutral-800 rounded-md p-3 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-[160px]">
            <div className="w-8 h-8 bg-amber-50 dark:bg-amber-900/20 rounded-sm flex items-center justify-center text-amber-500">
              <FiBox size={16} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{t('affectionTab.labels.choiceBox')}</span>
            </div>
            <CustomNumberInput
              value={selectionBoxCount}
              onChange={(val) => handleUpdateSelectionBox(Number(val))}
              min={0}
              max={999}
              className="w-14 h-8 bg-gray-50 dark:bg-neutral-900 border-none rounded-sm text-center font-bold text-sm focus:ring-1 focus:ring-amber-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSimulateCrafting(!simulateCrafting)}
              className={`px-3 py-1.5 rounded-sm text-xs font-bold transition-all flex items-center gap-1.5 ${
                simulateCrafting
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800'
                  : 'bg-white text-gray-500 ring-1 ring-gray-100 hover:bg-gray-50 dark:bg-neutral-800 dark:text-gray-400 dark:ring-neutral-700'
              }`}
            >
              <FiRepeat /> {t('affectionTab.actions.craftingFill')}
            </button>

            <button
              onClick={() => setHideNonPreferred(!hideNonPreferred)}
              className={`px-3 py-1.5 rounded-sm text-xs font-bold transition-all flex items-center gap-1.5 ${
                hideNonPreferred
                  ? 'bg-gray-800 text-white dark:bg-white dark:text-black'
                  : 'bg-white text-gray-500 ring-1 ring-gray-100 hover:bg-gray-50 dark:bg-neutral-800 dark:text-gray-400 dark:ring-neutral-700'
              }`}
            >
              <FiFilter />
              {t('affectionTab.actions.showPreferredOnly')}
            </button>
          </div>
        </div>

        {/* Grid Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-2">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
            {displayedGifts.map((gift) => (
              <GiftItem key={gift.id} gift={gift} ownedCount={ownedGifts[gift.id] || 0} deficitExp={result?.deficitExp || 0} eventData={eventData} iconData={iconData} onUpdate={handleUpdateGift} />
            ))}
          </div>

          {displayedGifts.length === 0 && (
            <div className="h-64 flex flex-col items-center justify-center text-gray-300 dark:text-neutral-600">
              <FiFilter size={40} className="mb-2 opacity-20" />
              <p className="text-sm font-medium">{t('affectionTab.messages.noItems')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
