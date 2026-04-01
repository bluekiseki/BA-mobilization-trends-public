// app/components/planner/StudentGrowth/FaverTab.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiFilter, FiTrendingUp, FiTarget, FiBox, FiRepeat, FiCoffee, FiCalendar, FiEdit3 } from 'react-icons/fi';

import { affectionExpToNextLevel } from '~/data/growthData';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventData, IconData } from '~/types/plannerData';

// Shared Components
import { ItemIcon } from '../common/Icon';
import { CustomNumberInput } from '~/components/CustomInput';
import { NumberInput } from '../common/NumberInput';
import { HighFlowerBouquetItemIds, LowFlowerBouquetItemIds } from './const';

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

// 1. New Helper Component for Click-to-Edit Logic
const EditableLevelDisplay = ({
  value,
  max,
  min = 1,
  onChange,
  prefix = '',
  textClassName = '',
}: {
  value: number;
  max: number;
  min?: number;
  onChange: (val: number) => void;
  prefix?: string;
  textClassName?: string;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    if (!isEditing) setLocalVal(value);
  }, [value, isEditing]);

  const handleCommit = () => {
    setIsEditing(false);
    onChange(localVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCommit();
  };

  // Edit mode (Input)
  if (isEditing) {
    return (
      <CustomNumberInput
        autoFocus
        value={localVal}
        min={min}
        max={max}
        onChange={(val) => setLocalVal(Number(val))}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
        className="w-16 h-6 text-sm text-center border-2 border-blue-500 rounded p-0 bg-white dark:bg-neutral-800 font-bold shadow-sm"
      />
    );
  }

  // View mode (Display)
  return (
    <div
      onClick={() => setIsEditing(true)}
      className={`
        group flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer select-none transition-all
        hover:bg-black/5 dark:hover:bg-white/10
        ${textClassName}
      `}
      title="Click to edit value"
    >
      <span className="border-b border-dashed border-gray-400/50 group-hover:border-transparent transition-colors">
        {prefix}
        {value}
      </span>

      <FiEdit3 className="text-[10px] opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all duration-200" />
    </div>
  );
};

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
      <div className="group flex flex-col p-1.5 w-full max-w-[80px] mx-auto bg-white dark:bg-neutral-800 rounded-md hover:bg-gray-50 dark:hover:bg-neutral-700/50 transition-colors">
        {/* Image Area */}
        <div className="relative w-full aspect-square bg-gray-50 dark:bg-neutral-900 rounded-sm flex items-center justify-center mb-1 overflow-hidden">
          <div className="transform transition-transform group-hover:scale-105">
            <ItemIcon type="Item" itemId={gift.id} amount={0} size={13} eventData={eventData} iconData={iconData} />
          </div>

          <div className="absolute top-0 left-0 bg-black/70 text-white px-1 py-px rounded-br-sm text-xs font-mono backdrop-blur-[1px] leading-none">+{gift.affectionPoints}</div>
          <div className="absolute bottom-0 right-0 p-0.5">
            <img src={prefIcon} alt="Pref" className="w-6 h-6 object-contain" />
          </div>
        </div>

        {/* Input Area */}
        <div className="mt-auto w-full">
          <div className="flex justify-end h-3.5 mb-0.5">
            {neededCount > 0 && <span className="text-[10px] text-red-500 flex items-center gap-1 truncate">{t('affectionTab.item.need', { counts: neededCount })}</span>}
          </div>

          <div className={`relative flex items-center bg-gray-50 dark:bg-neutral-900 rounded-sm overflow-hidden ${neededCount > 0 ? 'ring-1 ring-red-100 dark:ring-red-900/50' : ''}`}>
            <NumberInput
              value={ownedCount}
              onChange={(val) => onUpdate(gift.id, Number(val))}
              min={0}
              max={9999}
              className="w-full text-center h-7 text-base scale-[0.75] font-bold bg-transparent border-none focus:ring-0 px-0 text-gray-700 dark:text-gray-200"
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
    const expForCurrentLevel = affectionExpToNextLevel[plan.current.affection] || 1;
    let expNeededTotal = 0;

    const expToFinishCurrent = plan.current.affection === plan.target.affection ? 0 : expForCurrentLevel - plan.current.affectionExp;
    expNeededTotal += expToFinishCurrent;

    for (let i = plan.current.affection + 1; i < plan.target.affection; i++) {
      expNeededTotal += affectionExpToNextLevel[i] || 0;
    }

    const bestNormalGift = giftAffectionList.filter((g) => g.rarity === 2).reduce((prev, curr) => (curr.affectionPoints > prev.affectionPoints ? curr : prev), { affectionPoints: 0 });
    const targetUnitValue = bestNormalGift.affectionPoints || 60;

    const inventory = { ...ownedGifts };
    inventory[SELECTION_BOX_ID] = selectionBoxCount;

    const calculateCurrentTotal = () => {
      let sum = 0;
      giftAffectionList.forEach((gift) => {
        sum += (inventory[gift.id] || 0) * gift.affectionPoints;
      });
      sum += (inventory[SELECTION_BOX_ID] || 0) * targetUnitValue;
      return sum;
    };

    let currentExp = calculateCurrentTotal();
    let craftingCount = 0;

    if (simulateCrafting && currentExp < expNeededTotal) {
      const fodderCandidates = giftAffectionList.filter((g) => g.affectionPoints * 2 < targetUnitValue).sort((a, b) => a.affectionPoints - b.affectionPoints);

      for (const item of fodderCandidates) {
        let count = inventory[item.id] || 0;
        while (currentExp < expNeededTotal && count >= 2) {
          count -= 2;
          inventory[item.id] = count;
          craftingCount++;
          currentExp = currentExp - 2 * item.affectionPoints + targetUnitValue;
        }
      }
    }

    const finalDeficit = Math.max(0, expNeededTotal - currentExp);
    const surplus = Math.abs(expNeededTotal - currentExp);
    const isSuccess = currentExp >= expNeededTotal;

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

    const totalRange = totalExpToTargetLevelStart - totalExpToCurrentLevelStart;
    let overallPercentage = 0;
    if (totalRange > 0) {
      const progress = achievableTotalExp - totalExpToCurrentLevelStart;
      overallPercentage = Math.min(100, Math.max(0, (progress / totalRange) * 100));
    } else if (achievableTotalExp >= totalExpToTargetLevelStart) {
      overallPercentage = 100;
    }

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
      craftingRequiredCount: craftingCount,
    });
  }, [plan, ownedGifts, giftAffectionList, selectionBoxCount, simulateCrafting]);

  const displayedGifts = useMemo(() => {
    if (!hideNonPreferred) return giftAffectionList;
    return giftAffectionList.filter((gift) => {
      if ([...HighFlowerBouquetItemIds, ...LowFlowerBouquetItemIds].includes(Number(gift.id))) return false;
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
          {/* Current Level Control */}
          <div>
            <div className="flex justify-between items-center text-xs font-bold text-gray-500 mb-1.5 min-h-[24px]">
              <span>{t('affectionTab.labels.current')}</span>
              {/* Editable Current Level */}
              <EditableLevelDisplay
                value={plan.current.affection}
                max={100}
                min={1}
                prefix="Lv."
                onChange={(val) => handlePlanChange('current.affection', val, true)}
                textClassName="text-gray-800 dark:text-white"
              />
            </div>

            <input
              type="range"
              min="1"
              max="100"
              value={plan.current.affection}
              onChange={(e) => handlePlanChange('current.affection', Number(e.target.value), true)}
              className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-neutral-700 accent-gray-600"
            />

            {/* EXP Control */}
            <div className="flex items-center gap-2 mt-2 opacity-70 hover:opacity-100 transition-opacity">
              <div className="flex items-center justify-end text-[10px] font-bold text-gray-400 min-w-[60px] whitespace-nowrap gap-1">
                {/* Editable Current EXP */}
                <EditableLevelDisplay
                  value={plan.current.affectionExp}
                  max={affectionExpToNextLevel[plan.current.affection] || 0}
                  min={0}
                  onChange={(val) => handlePlanChange('current.affectionExp', val, true)}
                  textClassName="text-gray-500 dark:text-gray-300"
                />
                <span>/ {affectionExpToNextLevel[plan.current.affection] || 0}</span>
              </div>

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

          {/* Target Level Control */}
          <div>
            <div className="flex justify-between items-center text-xs font-bold text-gray-500 mb-1.5 min-h-[24px]">
              <span className="text-blue-500">{t('affectionTab.labels.target')}</span>
              {/* Editable Target Level */}
              <EditableLevelDisplay
                value={plan.target.affection}
                max={100}
                min={1}
                prefix="Lv."
                onChange={(val) => handlePlanChange('target.affection', val, true)}
                textClassName="text-blue-600 dark:text-blue-400"
              />
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
