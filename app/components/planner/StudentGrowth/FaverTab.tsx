// // AffectionTab.tsx
// import { useState, useEffect, useMemo } from 'react';
// import { affectionExpToNextLevel } from '~/data/growthData';
// import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
// import type { EventData, IconData, IconInfos } from '~/types/plannerData';
// import { NumberInput } from '../common/NumberInput';
// import { ItemIcon } from '../common/Icon';
// import { CustomNumberInput } from '~/components/CustomInput';
// import { useTranslation } from 'react-i18next';

// export const HighFlowerBouquetItemIds = [5996, 5997]
// export const LowFlowerBouquetItemIds = [5998, 5999]

// interface AffectionTabProps {
//     plan: GrowthPlan;
//     giftAffectionList: {
//         id: string;
//         type: string;
//         rarity: number;
//         affectionPoints: number;
//         preferenceLevel: number;
//     }[];
//     eventData: EventData;
//     iconData: IconData;
//     handlePlanChange: (field: string, value: any, isNumeric?: boolean) => void
// }

// const cumulativeAffectionExp: Record<number, number> = {};
// let cumulativeExp = 0;

// Object.keys(affectionExpToNextLevel).sort((a, b) => Number(a) - Number(b)).forEach(levelStr => {
//     const level = Number(levelStr);
//     cumulativeExp += affectionExpToNextLevel[level];
//     cumulativeAffectionExp[level] = cumulativeExp;
// });

// const getPreferenceIcon = (preferenceLevel: number, rarity: number): string => {
//     let levelForIcon = preferenceLevel;

//     if (rarity === 3 && levelForIcon === 1) {
//         levelForIcon = 2;
//     }

//     if (levelForIcon >= 4) return '/img/Cafe_Interaction_Gift_04.webp';
//     if (levelForIcon === 3) return '/img/Cafe_Interaction_Gift_03.webp';
//     if (levelForIcon === 2) return '/img/Cafe_Interaction_Gift_02.webp';
//     return '/img/Cafe_Interaction_Gift_01.webp';
// };

// export const AffectionTab = ({ plan, giftAffectionList, eventData, iconData, handlePlanChange }: AffectionTabProps) => {

//     const { ownedGifts, updateOwnedGifts, resetOwnedGifts } = useGlobalStore();
//     const [calculateWithOwned, setCalculateWithOwned] = useState(true);
//     const [hideNonPreferred, setHideNonPreferred] = useState(true);

//     const [maxLevelResult, setMaxLevelResult] = useState<{
//         text: string;
//         currentExp: number;
//         targetExp: number;
//         percentage: number;
//     } | null>(null);

//     const [targetResult, setTargetResult] = useState<React.ReactNode | null>(null);
//     const { t, i18n } = useTranslation("planner");

//     const expForCurrentLevel = affectionExpToNextLevel[plan.current.affection] || 1;

//     useEffect(() => {
//         let expNeededForTarget = 0;
//         const expToFinishCurrentLevel = (plan.current.affection == plan.target.affection) ? 0 : expForCurrentLevel - plan.current.affectionExp;
//         expNeededForTarget += expToFinishCurrentLevel;

//         for (let i = plan.current.affection + 1; i < plan.target.affection; i++) {
//             expNeededForTarget += affectionExpToNextLevel[i] || 0;
//         }

//         const expFromOwned = giftAffectionList.reduce((total, gift) => total + (ownedGifts[gift.id] || 0) * gift.affectionPoints, 0);

//         const totalExpToCurrentLevelStart = cumulativeAffectionExp[plan.current.affection - 1] || 0;
//         const totalExpToTargetLevelStart = cumulativeAffectionExp[plan.target.affection - 1] || 0;

//         const currentTotalExp = totalExpToCurrentLevelStart + plan.current.affectionExp;
//         const achievableTotalExp = currentTotalExp + expFromOwned;

//         let achievableLevel = 1;
//         let progressExpInLevel = 0;
//         const sortedLevels = Object.keys(cumulativeAffectionExp).map(Number);
//         for (const level of sortedLevels) {
//             if (achievableTotalExp >= cumulativeAffectionExp[level]) {
//                 achievableLevel = level + 1;
//             } else {
//                 const baseExp = cumulativeAffectionExp[level - 1] || 0;
//                 progressExpInLevel = achievableTotalExp - baseExp;
//                 break;
//             }
//         }
//         const expForAchievableLevel = affectionExpToNextLevel[achievableLevel] || 7365;

//         const totalExpRange = totalExpToTargetLevelStart - totalExpToCurrentLevelStart;
//         let overallPercentage = 0;
//         if (totalExpRange > 0) {
//             const expProgress = achievableTotalExp - totalExpToCurrentLevelStart;
//             overallPercentage = Math.min(100, (expProgress / totalExpRange) * 100);
//         } else if (achievableTotalExp >= totalExpToTargetLevelStart) {
//             overallPercentage = 100;
//         }

//         setMaxLevelResult({
//             text: t('affectionTab.results.achievableLevel', {
//                 level: achievableLevel,
//                 progressExp: progressExpInLevel,
//                 expForLevel: expForAchievableLevel
//             }),
//             currentExp: achievableTotalExp,
//             targetExp: totalExpToTargetLevelStart,
//             percentage: overallPercentage,
//         });

//         const bestHighTierGift = giftAffectionList.find(g => g.rarity === 3 && g.affectionPoints > 120 && !HighFlowerBouquetItemIds.includes(Number(g.id)));
//         const bestNormalGift = giftAffectionList.find(g => g.rarity === 2 && g.affectionPoints > 20);

//         const renderNeededItems = (exp: number) => {
//             if (exp <= 0) return null;

//             const highTierNeeded = bestHighTierGift ? Math.ceil(exp / bestHighTierGift.affectionPoints) : 0;
//             const normalNeeded = bestNormalGift ? Math.ceil(exp / bestNormalGift.affectionPoints) : 0;
//             const cafeTouches = Math.ceil(exp / 15);

//             return (
//                 <div className="flex items-center justify-center gap-x-4 gap-y-1 flex-wrap text-xs">
//                     {bestHighTierGift && (
//                         <div className="flex items-center gap-1">
//                             <ItemIcon type="Item" itemId={bestHighTierGift.id} amount={0} size={8} eventData={eventData} iconData={iconData} />
//                             <span>&times;{highTierNeeded.toLocaleString()}</span>
//                         </div>
//                     )}
//                     {bestHighTierGift && bestNormalGift && <span>or</span>}
//                     {bestNormalGift && (
//                         <div className="flex items-center gap-1">
//                             <ItemIcon type="Item" itemId={bestNormalGift.id} amount={0} size={8} eventData={eventData} iconData={iconData} />
//                             <span>&times;{normalNeeded.toLocaleString()}</span>
//                         </div>
//                     )}
//                     {(bestHighTierGift || bestNormalGift) && <span>{t('affectionTab.results.or')}</span>}
//                     <span>{t('affectionTab.results.cafeTouches', { counts: cafeTouches.toLocaleString() })}</span>
//                 </div>
//             );
//         };

//         // (3) Call the rendering function created above according to each condition.
//         if (calculateWithOwned) {
//             const finalDeficit = expNeededForTarget - expFromOwned;
//             if (finalDeficit <= 0) {
//                 setTargetResult(t('affectionTab.results.targetMetWithOwned', { surplusExp: (-finalDeficit).toLocaleString() }));
//             } else {
//                 const resultJSX = (
//                     <div className="space-y-1">
//                         <p className="text-red-500 dark:text-red-400">{t('affectionTab.results.deficit', { deficitExp: finalDeficit.toLocaleString() })}</p>
//                         {renderNeededItems(finalDeficit)}
//                     </div>
//                 );
//                 setTargetResult(resultJSX);
//             }
//         } else {
//             // Call rendering function based on the full required experience (expNeedForTarget) if the gift is not considered for holding
//             if (expNeededForTarget <= 0) {
//                 setTargetResult(t('affectionTab.results.targetMet'));
//             } else {
//                 setTargetResult(renderNeededItems(expNeededForTarget));
//             }
//         }

//     }, [plan.current.affection, plan.target.affection, plan.current.affectionExp, ownedGifts, calculateWithOwned, giftAffectionList]);

//     const displayedGifts = useMemo(() => {
//         if (!hideNonPreferred) return giftAffectionList;
//         return giftAffectionList.filter(gift => {
//             if (gift.rarity == 2) return gift.affectionPoints > 20
//             if (gift.rarity == 3) return gift.affectionPoints > 120
//         });
//     }, [giftAffectionList, hideNonPreferred]);

//     return (
//         <div className="space-y-4 text-sm">
//             {/* 1. Set Target */}
//             <div className="space-y-3">
//                 <div className="w-full flex items-center gap-2">
//                     <label className="w-18 shrink-0 font-semibold">{t('affectionTab.rank')}</label>
//                     <div className="flex-1">
//                         <CustomNumberInput min={1} max={100} value={plan.current.affection} onChange={e => handlePlanChange('current.affection', e, true)} className="w-full p-1 border rounded dark:bg-neutral-700 dark:border-neutral-600" />
//                     </div>
//                     <span className="w-8 text-center text-gray-400 font-bold text-lg shrink-0">→</span>
//                     <div className="flex-1">
//                         <CustomNumberInput min={plan.current.affection} max={100} value={plan.target.affection} onChange={e => handlePlanChange('target.affection', e, true)} className="w-full p-1 border rounded dark:bg-neutral-700 dark:border-neutral-600" />
//                     </div>
//                 </div>
//                 <div>
//                     <label className="text-xs font-semibold">{t('affectionTab.currentLevelProgress')}</label>
//                     <div className="flex items-center gap-2">
//                         <input type="range" min="0" max={expForCurrentLevel - 1} value={plan.current.affectionExp} onChange={e => handlePlanChange('current.affectionExp', e.target.value, true)} className="w-full" />
//                         <span className="text-xs text-gray-500 dark:text-gray-400 w-28 text-right shrink-0">{plan.current.affectionExp} / {expForCurrentLevel} {t('common.exp')}</span>
//                     </div>
//                 </div>
//             </div>

//             {/* 2. Input Owned Gifts */}
//             <div>
//                 <div className="flex justify-between items-center mb-2">
//                     <h4 className="font-semibold text-base dark:text-neutral-200">{t('affectionTab.ownedGiftsTitle')}</h4>
//                     <div className="flex items-center gap-2">
//                         <button
//                             onClick={() => {
//                                 if (window.confirm(t('affectionTab.resetConfirm'))) {
//                                     resetOwnedGifts();
//                                 }
//                             }}
//                             className="text-xs font-semibold text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
//                         >
//                             {t('affectionTab.reset')}
//                         </button>
//                         <label className="flex items-center gap-1.5 cursor-pointer text-xs">
//                             <input type="checkbox" checked={hideNonPreferred} onChange={e => setHideNonPreferred(e.target.checked)} className="h-3.5 w-3.5 rounded" />
//                             <span>{t('affectionTab.showPreferredOnly')}</span>
//                         </label>
//                     </div>
//                 </div>
//                 <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200 dark:border-neutral-700">

//                     <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-7 gap-px bg-gray-200 dark:bg-neutral-700">
//                         {displayedGifts.map(gift => (
//                             <div
//                                 key={gift.id}
//                                 className="bg-white dark:bg-neutral-800 p-2 flex flex-col items-center justify-between gap-1.5"
//                             >
//                                 <div className="flex flex-col items-center gap-1 w-full">
//                                     <div className="relative">
//                                         <ItemIcon type={gift.type} itemId={gift.id} amount={0} size={10} eventData={eventData} iconData={iconData} />

//                                     </div>

//                                     <div className='flex items-center gap-0.5 justify-center w-full'>
//                                         <img
//                                             src={getPreferenceIcon(gift.preferenceLevel, gift.rarity)}
//                                             alt={t('common.preferenceLevelAlt', { level: gift.preferenceLevel })}
//                                             className="object-contain h-3 w-3 opacity-80"
//                                         />
//                                         <span className="text-[10px] sm:text-xs font-bold text-yellow-600 dark:text-yellow-500 leading-none">
//                                             +{gift.affectionPoints}
//                                         </span>
//                                     </div>
//                                 </div>

//                                 <div className="w-full">
//                                     <NumberInput
//                                         value={ownedGifts[gift.id] || 0}
//                                         onChange={val => updateOwnedGifts(gift.id, val)}
//                                         min={0}
//                                         max={99999}
//                                         narrowButtonType='plus'
//                                     />
//                                 </div>
//                             </div>
//                         ))}
//                     </div>
//                 </div>
//             </div>

//             {/* 3. Calculation Settings and Results */}
//             <div>
//                 <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/40 rounded-t-lg">
//                     <label className="flex items-center gap-2 cursor-pointer">
//                         <input type="checkbox" checked={calculateWithOwned} onChange={e => setCalculateWithOwned(e.target.checked)} className="h-4 w-4 rounded" />
//                         <span className="font-semibold text-blue-800 dark:text-blue-300">{t('affectionTab.calculateWithOwned')}</span>
//                     </label>
//                 </div>
//                 <div className="p-4 bg-gray-200 dark:bg-neutral-700 rounded-b-lg text-center text-gray-800 dark:text-neutral-200 space-y-2">
//                     {maxLevelResult && (
//                         <div className="font-bold">
//                             <p>{maxLevelResult.text}</p>
//                             <div className="w-full bg-gray-300 dark:bg-neutral-600 rounded-full h-2.5 my-1.5">
//                                 <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${maxLevelResult.percentage}%` }}></div>
//                             </div>
//                             <p className="text-xs font-mono text-gray-600 dark:text-gray-400">
//                                 {maxLevelResult.currentExp.toLocaleString()} / {maxLevelResult.targetExp.toLocaleString()} {t('common.exp')}
//                             </p>
//                         </div>
//                     )}
//                     <div className="text-xs font-normal border-t dark:border-neutral-600 pt-2 mt-2">{targetResult}</div>
//                 </div>
//             </div>
//         </div>
//     );
// };

// app/components/planner/StudentGrowth/FaverTab.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { affectionExpToNextLevel } from '~/data/growthData';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventData, IconData } from '~/types/plannerData';
import { NumberInput } from '../common/NumberInput';
import { ItemIcon } from '../common/Icon';
import { CustomNumberInput } from '~/components/CustomInput';
import { MinMaxControls } from './MinMaxControls';
import { FiCheck, FiFilter, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';

const HighFlowerBouquetItemIds = [5996, 5997];

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

// --- Logic Helpers ---
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

export const AffectionTab = ({ plan, giftAffectionList, eventData, iconData, handlePlanChange }: AffectionTabProps) => {
  const { ownedGifts, updateOwnedGifts, resetOwnedGifts } = useGlobalStore();
  const [calculateWithOwned, setCalculateWithOwned] = useState(true);
  const [hideNonPreferred, setHideNonPreferred] = useState(true);
  const { t } = useTranslation('planner');

  const [maxLevelResult, setMaxLevelResult] = useState<{
    text: string;
    currentExp: number;
    targetExp: number;
    percentage: number;
  } | null>(null);

  const [targetResult, setTargetResult] = useState<React.ReactNode | null>(null);

  const expForCurrentLevel = affectionExpToNextLevel[plan.current.affection] || 1;
  const currentExpPercentage = (plan.current.affectionExp / expForCurrentLevel) * 100;

  // --- Calculation Effect ---
  useEffect(() => {
    let expNeededForTarget = 0;
    const expToFinishCurrentLevel = plan.current.affection === plan.target.affection ? 0 : expForCurrentLevel - plan.current.affectionExp;
    expNeededForTarget += expToFinishCurrentLevel;

    for (let i = plan.current.affection + 1; i < plan.target.affection; i++) {
      expNeededForTarget += affectionExpToNextLevel[i] || 0;
    }

    const expFromOwned = giftAffectionList.reduce((total, gift) => total + (ownedGifts[gift.id] || 0) * gift.affectionPoints, 0);

    const totalExpToCurrentLevelStart = cumulativeAffectionExp[plan.current.affection - 1] || 0;
    const totalExpToTargetLevelStart = cumulativeAffectionExp[plan.target.affection - 1] || 0;

    const currentTotalExp = totalExpToCurrentLevelStart + plan.current.affectionExp;
    const achievableTotalExp = currentTotalExp + expFromOwned;

    let achievableLevel = 1;
    let progressExpInLevel = 0;
    const sortedLevels = Object.keys(cumulativeAffectionExp).map(Number);

    for (const level of sortedLevels) {
      if (achievableTotalExp >= cumulativeAffectionExp[level]) {
        achievableLevel = level + 1;
      } else {
        const baseExp = cumulativeAffectionExp[level - 1] || 0;
        progressExpInLevel = achievableTotalExp - baseExp;
        break;
      }
    }

    if (achievableLevel > 100) {
      achievableLevel = 100;
      progressExpInLevel = 0;
    }

    const expForAchievableLevel = affectionExpToNextLevel[achievableLevel] || 0;
    const totalExpRange = totalExpToTargetLevelStart - totalExpToCurrentLevelStart;

    let overallPercentage = 0;
    if (totalExpRange > 0) {
      const expProgress = achievableTotalExp - totalExpToCurrentLevelStart;
      overallPercentage = Math.min(100, Math.max(0, (expProgress / totalExpRange) * 100));
    } else if (achievableTotalExp >= totalExpToTargetLevelStart && plan.target.affection > plan.current.affection) {
      overallPercentage = 100;
    }

    setMaxLevelResult({
      text: t('affectionTab.results.achievableLevel', {
        level: achievableLevel,
        progressExp: progressExpInLevel,
        expForLevel: expForAchievableLevel,
      }),
      currentExp: achievableTotalExp,
      targetExp: totalExpToTargetLevelStart,
      percentage: overallPercentage,
    });

    // Recommendation Logic
    const bestHighTierGift = giftAffectionList.find((g) => g.rarity === 3 && g.affectionPoints > 120 && !HighFlowerBouquetItemIds.includes(Number(g.id)));
    const bestNormalGift = giftAffectionList.find((g) => g.rarity === 2 && g.affectionPoints > 20);

    const renderNeededItems = (exp: number) => {
      if (exp <= 0) return null;

      const highTierNeeded = bestHighTierGift ? Math.ceil(exp / bestHighTierGift.affectionPoints) : 0;
      const normalNeeded = bestNormalGift ? Math.ceil(exp / bestNormalGift.affectionPoints) : 0;
      const cafeTouches = Math.ceil(exp / 15);

      return (
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* High Tier Item */}
            {bestHighTierGift && (
              <div className="flex items-center gap-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded px-2 py-1">
                <ItemIcon type="Item" itemId={bestHighTierGift.id} amount={0} size={7} eventData={eventData} iconData={iconData} />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">&times; {highTierNeeded.toLocaleString()}</span>
              </div>
            )}

            {/* OR Separator */}
            {bestHighTierGift && bestNormalGift && <span className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 ">OR</span>}

            {/* Normal Tier Item */}
            {bestNormalGift && (
              <div className="flex items-center gap-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded px-2 py-1">
                <ItemIcon type="Item" itemId={bestNormalGift.id} amount={0} size={7} eventData={eventData} iconData={iconData} />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">&times; {normalNeeded.toLocaleString()}</span>
              </div>
            )}
            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 ">OR</span>
          </div>

          {/* Cafe Touches */}
          <div className="mt-2 text-[10px] text-gray-500 font-medium pl-1">{t('affectionTab.results.cafeTouches', { counts: cafeTouches.toLocaleString() })}</div>
        </div>
      );
    };

    if (calculateWithOwned) {
      const finalDeficit = expNeededForTarget - expFromOwned;
      if (finalDeficit <= 0) {
        setTargetResult(
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-bold text-xs mt-1">
            <FiCheck size={12} />
            {t('affectionTab.results.targetMetWithOwned', { surplusExp: (-finalDeficit).toLocaleString() })}
          </div>,
        );
      } else {
        setTargetResult(
          <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <FiAlertCircle className="text-red-500" size={14} />
              <span className="text-red-600 dark:text-red-400 font-bold text-xs">{t('affectionTab.results.deficit', { deficitExp: finalDeficit.toLocaleString() })}</span>
            </div>
            {renderNeededItems(finalDeficit)}
          </div>,
        );
      }
    } else {
      if (expNeededForTarget <= 0) {
        setTargetResult(
          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold text-xs mt-1">
            <FiCheck size={12} />
            {t('affectionTab.results.targetMet')}
          </div>,
        );
      } else {
        setTargetResult(
          <div className="mt-2 p-3 bg-gray-50 dark:bg-neutral-800/50 border border-gray-100 dark:border-neutral-800 rounded-lg">
            <p className="text-gray-500 dark:text-gray-400 text-[10px] font-bold uppercase mb-1">Total Needed</p>
            {renderNeededItems(expNeededForTarget)}
          </div>,
        );
      }
    }
  }, [plan.current.affection, plan.target.affection, plan.current.affectionExp, ownedGifts, calculateWithOwned, giftAffectionList, t, eventData, iconData, expForCurrentLevel]);

  const displayedGifts = useMemo(() => {
    if (!hideNonPreferred) return giftAffectionList;
    return giftAffectionList.filter((gift) => {
      if (gift.rarity === 2) return gift.affectionPoints > 20;
      if (gift.rarity === 3) return gift.affectionPoints > 120;
      return false;
    });
  }, [giftAffectionList, hideNonPreferred]);

  // Styles
  const currentInputClass =
    'w-full p-1.5 text-sm border border-gray-200 rounded bg-gray-50 dark:bg-neutral-800 dark:border-neutral-600 text-center font-medium outline-none focus:ring-1 focus:ring-gray-300 transition-all';
  const targetInputClass =
    'w-full p-1.5 text-sm border border-blue-200 rounded bg-white text-blue-600 font-bold dark:bg-neutral-900 dark:border-blue-900/50 dark:text-blue-400 text-center outline-none focus:ring-1 focus:ring-blue-300 transition-all';

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Rank & EXP Controls */}
      <div className="flex flex-col gap-4">
        {/* Rank Row */}
        <div className="grid grid-cols-[70px_1fr_1fr] gap-3 items-end">
          <div className="text-xs font-bold text-gray-400 dark:text-neutral-500 text-center uppercase pb-2">Rank</div>

          {/* Current Rank */}
          <div>
            <MinMaxControls onMin={() => handlePlanChange('current.affection', 1, true)} onMax={() => handlePlanChange('current.affection', 100, true)} />
            <CustomNumberInput min={1} max={100} value={plan.current.affection} onChange={(e) => handlePlanChange('current.affection', e || '', true)} className={currentInputClass} />
          </div>

          {/* Target Rank */}
          <div>
            <MinMaxControls isTarget onMin={() => handlePlanChange('target.affection', plan.current.affection, true)} onMax={() => handlePlanChange('target.affection', 100, true)} />
            <CustomNumberInput
              min={plan.current.affection}
              max={100}
              value={plan.target.affection}
              onChange={(e) => handlePlanChange('target.affection', e || '', true)}
              className={targetInputClass}
            />
          </div>
        </div>

        {/* EXP Bar */}
        <div className="pl-[82px]">
          <div className="flex justify-between items-end mb-1.5">
            <span className="text-[10px] font-bold text-gray-400">EXP</span>
            <span className="text-[10px] font-mono font-medium text-gray-500 dark:text-gray-400">
              <span className="text-blue-600 dark:text-blue-400">{plan.current.affectionExp}</span>
              <span className="text-gray-300 mx-1">/</span>
              {expForCurrentLevel}
            </span>
          </div>

          <div className="relative h-4 flex items-center group">
            <div className="absolute w-full h-2 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 dark:bg-blue-600 transition-all duration-150 ease-out" style={{ width: `${currentExpPercentage}%` }} />
            </div>
            <input
              type="range"
              min="0"
              max={expForCurrentLevel - 1}
              value={plan.current.affectionExp}
              onChange={(e) => handlePlanChange('current.affectionExp', Number(e.target.value), true)}
              className="absolute w-full h-full opacity-0 cursor-pointer z-10"
            />
          </div>
        </div>
      </div>

      {/* 2. Inventory Grid */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-neutral-800 pb-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t('affectionTab.ownedGiftsTitle')}</h3>
          <div className="flex gap-3">
            <button
              onClick={() => setHideNonPreferred(!hideNonPreferred)}
              className={`flex items-center gap-1 text-[10px] font-bold transition-colors ${hideNonPreferred ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <FiFilter size={10} />
              {t('affectionTab.showPreferredOnly')}
            </button>
            <button
              onClick={() => {
                if (window.confirm(t('affectionTab.resetConfirm'))) resetOwnedGifts();
              }}
              className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-red-500 transition-colors"
            >
              <FiRefreshCw size={10} />
              {t('affectionTab.reset')}
            </button>
          </div>
        </div>

        {/* Gift Grid: Item Cells with Border/Background */}
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 gap-2">
          {displayedGifts.map((gift) => (
            <div
              key={gift.id}
              className="flex flex-col items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/40 transition-all hover:border-blue-300 dark:hover:border-blue-700"
            >
              <div className="relative">
                <ItemIcon type={gift.type} itemId={gift.id} amount={0} size={10} eventData={eventData} iconData={iconData} />
                {/* Preference Badge: Icon + Points */}
                <div className="absolute -bottom-1 -right-1.5 bg-white/95 dark:bg-neutral-900/90 rounded px-1 py-0.5 border border-gray-100 dark:border-neutral-700 shadow-sm flex items-center gap-0.5">
                  <img src={getPreferenceIcon(gift.preferenceLevel, gift.rarity)} alt="" className="w-2.5 h-2.5 object-contain" />
                  <span className="text-[8px] font-bold text-gray-600 dark:text-gray-400">+{gift.affectionPoints}</span>
                </div>
              </div>
              <div className="w-full">
                <NumberInput value={ownedGifts[gift.id] || 0} onChange={(val) => updateOwnedGifts(gift.id, val)} min={0} max={999} narrowButtonType="plus" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Results Section */}
      <div className="pt-2 border-t border-gray-100 dark:border-neutral-800">
        <label className="flex items-center gap-2 cursor-pointer mb-3 w-fit select-none">
          <input
            type="checkbox"
            checked={calculateWithOwned}
            onChange={(e) => setCalculateWithOwned(e.target.checked)}
            className="rounded text-blue-500 focus:ring-0 border-gray-300 dark:border-neutral-600 dark:bg-neutral-800 w-4 h-4"
          />
          <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{t('affectionTab.calculateWithOwned')}</span>
        </label>

        {calculateWithOwned && maxLevelResult && (
          <div className="px-3 animate-in fade-in slide-in-from-top-1 space-y-3 ">
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{maxLevelResult.text}</span>
                <span className="text-xs font-mono font-bold text-blue-500">{maxLevelResult.percentage.toFixed(0)}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${maxLevelResult.percentage}%` }}></div>
              </div>
            </div>
            <div className="text-sm">{targetResult}</div>
          </div>
        )}
      </div>
    </div>
  );
};
