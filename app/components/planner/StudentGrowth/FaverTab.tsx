// app/components/planner/StudentGrowth/FaverTab.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { FiFilter, FiBox, FiRepeat, FiCoffee, FiCalendar, FiEdit3, FiRotateCcw } from 'react-icons/fi';
import { RiHeartLine, RiCharacterRecognitionLine, RiKeyboardLine } from 'react-icons/ri';

import { affectionExpToNextLevel } from '~/data/growthData';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventData, IconData, StudentData, StudentPortraitData } from '~/types/plannerData';
// import { getGiftAffectionList } from './giftAffectionList';
import { GiftStudentSheet, getPreferenceIcon, buildGiftToStudentsMap, type GiftEntry, type GiftStudentEntry } from './GiftStudentSheet';

import { ItemIcon } from '../common/Icon';
import { CustomNumberInput } from '~/components/CustomInput';
import { NumberInput } from '../common/NumberInput';
import { HighFlowerBouquetItemIds, LowFlowerBouquetItemIds } from './const';
import { useNavigate } from 'react-router';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';

// --- Constants ---

const SELECTION_BOX_ID = 100008;
const CAFE_TOUCH_EXP = 15;
const SCHEDULE_EXP = 25;

const cumulativeAffectionExp: Record<number, number> = {};
let cumulativeExp = 0;
Object.keys(affectionExpToNextLevel)
  .sort((a, b) => Number(a) - Number(b))
  .forEach((levelStr) => {
    const level = Number(levelStr);
    cumulativeExp += affectionExpToNextLevel[level];
    cumulativeAffectionExp[level] = cumulativeExp;
  });

// --- Types ---

interface AffectionTabProps {
  plan: GrowthPlan;
  giftAffectionList: GiftEntry[];
  eventData: EventData;
  iconData: IconData;
  handlePlanChange: (field: string, value: number | string | boolean, isNumeric?: boolean) => void;
  allStudents?: StudentData;
  studentPortraits?: StudentPortraitData;
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

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={`group flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer select-none transition-all hover:bg-black/5 dark:hover:bg-white/10 ${textClassName}`}
      title="Click to edit value"
    >
      <span className="border-b border-dashed border-neutral-400/50 group-hover:border-transparent transition-colors">
        {prefix}
        {value}
      </span>
      <FiEdit3 className="text-[10px] opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all duration-200" />
    </div>
  );
};

// --- Inventory GiftItem ---

const GiftItem = React.memo(
  ({
    gift,
    ownedCount,
    deficitExp,
    eventData,
    iconData,
    onUpdate,
    onSelect,
    isSelected,
  }: {
    gift: GiftEntry;
    ownedCount: number;
    deficitExp: number;
    eventData: EventData;
    iconData: IconData;
    onUpdate: (id: string, val: number) => void;
    onSelect?: () => void;
    isSelected?: boolean;
  }) => {
    const { t } = useTranslation('planner');
    const prefIcon = useMemo(() => getPreferenceIcon(gift.preferenceLevel, gift.rarity), [gift.preferenceLevel, gift.rarity]);
    const neededCount = deficitExp > 0 ? Math.ceil(deficitExp / gift.affectionPoints) : 0;

    return (
      <div
        className={`group flex flex-col p-1.5 w-full max-w-[110px] mx-auto bg-white dark:bg-neutral-800 rounded-md transition-colors ${isSelected ? 'ring-2 ring-pink-400 dark:ring-pink-500' : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/50'}`}
      >
        <div
          onClick={onSelect}
          className="relative w-full aspect-square bg-neutral-50 dark:bg-neutral-900 rounded-sm flex items-center justify-center mb-1 overflow-hidden cursor-pointer"
          role="button"
          tabIndex={-1}
          onKeyDown={(e) => e.key === 'Enter' && onSelect?.()}
        >
          <div className="transform transition-transform group-hover:scale-105">
            <ItemIcon type="Item" itemId={gift.id} amount={0} size={13} eventData={eventData} iconData={iconData} />
          </div>
          <div className="absolute top-0 left-0 bg-black/70 text-white px-1 py-px rounded-br-sm text-xs font-mono backdrop-blur-[1px] leading-none">+{gift.affectionPoints}</div>
          <div className="absolute bottom-0 right-0 p-0.5">
            <img src={prefIcon} alt="Pref" className="w-6 h-6 object-cover" />
          </div>
          {onSelect && (
            <div className={`absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 dark:group-hover:bg-white/5 transition-colors`}>
              <RiHeartLine className="opacity-0 group-hover:opacity-60 text-white drop-shadow text-lg transition-opacity" />
            </div>
          )}
        </div>

        <div className="mt-auto w-full">
          <div className="flex justify-end h-3.5 mb-0.5">
            {neededCount > 0 && <span className="text-[10px] text-red-500 flex items-center gap-1 truncate">{t('affectionTab.item.need', { counts: neededCount })}</span>}
          </div>
          <div className={`relative flex items-center bg-neutral-50 dark:bg-neutral-900 rounded-sm overflow-hidden ${neededCount > 0 ? 'ring-1 ring-red-100 dark:ring-red-900/50' : ''}`}>
            <NumberInput
              value={ownedCount}
              onChange={(val) => onUpdate(gift.id, val)}
              min={0}
              max={9999}
              className="w-full text-center h-7 text-base scale-[0.75] font-bold bg-transparent border-none focus:ring-0 px-0 text-neutral-700 dark:text-neutral-200"
              placeholder="0"
              narrowButtonType="plus"
            />
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => prev.ownedCount === next.ownedCount && prev.gift.id === next.gift.id && prev.deficitExp === next.deficitExp && prev.isSelected === next.isSelected,
);
GiftItem.displayName = 'GiftItem';

// --- Main Component ---

export const AffectionTab = ({ plan, giftAffectionList, eventData, iconData, handlePlanChange, allStudents, studentPortraits }: AffectionTabProps) => {
  const { t, i18n } = useTranslation('planner');
  const locale = i18n.language as Locale;
  const navigate = useNavigate();
  const { ownedGifts, updateOwnedGifts } = useGlobalStore();

  const [simulateCrafting, setSimulateCrafting] = useState(false);
  const [hideNonPreferred, setHideNonPreferred] = useState(true);
  const [selectionBoxCount, setSelectionBoxCount] = useState(0);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);

  useEffect(() => {
    if (ownedGifts[SELECTION_BOX_ID] !== undefined) {
      setSelectionBoxCount(ownedGifts[SELECTION_BOX_ID]);
    }
  }, [ownedGifts]);

  const handleUpdateGift = useCallback((id: string, val: number) => updateOwnedGifts(id, val), [updateOwnedGifts]);

  const handleUpdateSelectionBox = (val: number) => {
    setSelectionBoxCount(val);
    updateOwnedGifts(String(SELECTION_BOX_ID), val);
  };

  // Gift reset function
  const handleResetGifts = useCallback(() => {
    // 1. Reset selection options
    setSelectionBoxCount(0);
    updateOwnedGifts(String(SELECTION_BOX_ID), 0);

    // 2. Initialize all potentially displayable gifts to 0
    giftAffectionList.forEach((gift) => {
      if (ownedGifts[gift.id]) {
        updateOwnedGifts(gift.id, 0);
      }
    });
  }, [giftAffectionList, ownedGifts, updateOwnedGifts]);

  // --- Gift → Students map (for Gift Index view) ---
  const giftToStudentsMap = useMemo<Record<string, GiftStudentEntry[]>>(() => {
    return buildGiftToStudentsMap(allStudents, eventData);
  }, [allStudents, eventData]);

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
      if (achievableTotalExp >= cumulativeAffectionExp[level]) achievableLevel = level + 1;
      else break;
    }
    if (achievableLevel > 100) achievableLevel = 100;

    const totalRange = totalExpToTargetLevelStart - totalExpToCurrentLevelStart;
    let overallPercentage = 0;
    if (totalRange > 0) {
      overallPercentage = Math.min(100, Math.max(0, ((achievableTotalExp - totalExpToCurrentLevelStart) / totalRange) * 100));
    } else if (achievableTotalExp >= totalExpToTargetLevelStart) {
      overallPercentage = 100;
    }

    setResult({
      status: isSuccess ? 'success' : 'deficit',
      achievableLevel,
      percentage: overallPercentage,
      deficitExp: finalDeficit,
      surplusExp: isSuccess ? surplus : 0,
      cafeTouchCount: Math.ceil(finalDeficit / CAFE_TOUCH_EXP),
      scheduleCount: Math.ceil(finalDeficit / SCHEDULE_EXP),
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
    <div className="flex flex-col lg:flex-row gap-4 font-sans text-neutral-700 dark:text-neutral-200">
      {/* --- LEFT: Result + Level Controls --- */}
      <div className="w-full lg:w-64 shrink-0 flex flex-col gap-3">
        {/* Result Card */}
        {result && (
          <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-3.5 flex flex-col gap-3">
            {/* Achievable level + Progress bar */}
            <div>
              <div className="flex items-end gap-2 mb-2">
                <span className="text-3xl font-black tabular-nums leading-none text-neutral-800 dark:text-neutral-100">{result.achievableLevel}</span>
                <span className="text-sm text-neutral-400 leading-none mb-0.5">/ {plan.target.affection}</span>
                <span className={`text-[11px] font-bold tabular-nums ml-auto leading-none mb-0.5 ${result.status === 'success' ? 'text-green-500' : 'text-red-400'}`}>
                  {result.status === 'success' ? `+${result.surplusExp.toLocaleString()}` : `−${result.deficitExp.toLocaleString()}`} EXP
                </span>
              </div>
              <div className="relative h-2 w-full bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${result.status === 'success' ? 'bg-green-400' : 'bg-red-400'}`} style={{ width: `${result.percentage}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5">
                <span>Lv.{plan.current.affection}</span>
                <span>Lv.{plan.target.affection}</span>
              </div>
            </div>

            {/* Means to supplement deficit (only when deficit exists) */}
            {result.status === 'deficit' && (
              <div className="flex flex-col gap-1.5 border-t border-neutral-200 dark:border-neutral-700 pt-2.5">
                <p className="text-[10px] text-neutral-400">{t('affectionTab.result.toFillDeficit')}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                    <FiCoffee size={11} />
                    {t('affectionTab.result.cafe')}
                    <span className="text-neutral-300 dark:text-neutral-600">+15</span>
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    {result.cafeTouchCount.toLocaleString()}
                    <span className="text-[10px] font-normal text-neutral-400 ml-0.5">{t('affectionTab.units.taps')}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                    <FiCalendar size={11} />
                    {t('affectionTab.result.schedule')}
                    <span className="text-neutral-300 dark:text-neutral-600">+25</span>
                  </span>
                  <span className="text-sm font-bold tabular-nums">
                    {result.scheduleCount.toLocaleString()}
                    <span className="text-[10px] font-normal text-neutral-400 ml-0.5">{t('affectionTab.units.runs')}</span>
                  </span>
                </div>
              </div>
            )}

            {/* Crafting information (Optional) */}
            {simulateCrafting && result.craftingRequiredCount > 0 && (
              <div className="flex items-center gap-2 border-t border-amber-200 dark:border-amber-800/40 pt-2">
                <FiRepeat size={11} className="text-amber-500 shrink-0" />
                <span className="text-[11px] text-amber-600 dark:text-amber-400 flex-1">{t('affectionTab.result.craftingNeeded')}</span>
                <span className="text-sm font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                  {result.craftingRequiredCount.toLocaleString()}
                  <span className="text-[10px] font-normal ml-0.5">{t('affectionTab.units.times')}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Level Controls */}
        <div className="flex flex-col gap-3 px-1">
          {/* Current / Target 2-column layout */}
          <div className="flex gap-3">
            {/* Current */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-neutral-500 mb-1">{t('affectionTab.labels.current')}</p>
              <EditableLevelDisplay
                value={plan.current.affection}
                max={100}
                min={1}
                prefix="Lv."
                onChange={(val) => handlePlanChange('current.affection', val, true)}
                textClassName="text-neutral-800 dark:text-white"
              />
              <input
                type="range"
                min="1"
                max="100"
                value={plan.current.affection}
                onChange={(e) => handlePlanChange('current.affection', Number(e.target.value), true)}
                className="w-full h-1 mt-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer dark:bg-neutral-700 accent-neutral-600"
              />
            </div>
            {/* Target */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-blue-500 mb-1">{t('affectionTab.labels.target')}</p>
              <EditableLevelDisplay
                value={plan.target.affection}
                max={100}
                min={1}
                prefix="Lv."
                onChange={(val) => handlePlanChange('target.affection', val, true)}
                textClassName="text-blue-600 dark:text-blue-400"
              />
              <input
                type="range"
                min="1"
                max="100"
                value={plan.target.affection}
                onChange={(e) => handlePlanChange('target.affection', Number(e.target.value), true)}
                className="w-full h-1 mt-1 bg-blue-100 rounded-lg appearance-none cursor-pointer dark:bg-blue-900/30 accent-blue-500"
              />
            </div>
          </div>

          {/* Current EXP */}
          <div className="flex items-center gap-2">
            <div className="flex items-center text-[10px] font-bold text-neutral-400 whitespace-nowrap gap-1">
              <EditableLevelDisplay
                value={plan.current.affectionExp}
                max={affectionExpToNextLevel[plan.current.affection] || 0}
                min={0}
                onChange={(val) => handlePlanChange('current.affectionExp', val, true)}
                textClassName="text-neutral-500 dark:text-neutral-300"
              />
              <span>/ {affectionExpToNextLevel[plan.current.affection] || 0}</span>
            </div>
            <input
              type="range"
              min="0"
              max={affectionExpToNextLevel[plan.current.affection] || 100}
              value={plan.current.affectionExp}
              onChange={(e) => handlePlanChange('current.affectionExp', Number(e.target.value), true)}
              className="flex-1 h-1 bg-neutral-100 rounded-lg appearance-none cursor-pointer dark:bg-neutral-800 accent-neutral-400"
            />
          </div>
        </div>
      </div>

      {/* --- RIGHT: Inventory --- */}
      <div className="flex-1 flex flex-col gap-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selection box */}
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 bg-amber-50 dark:bg-amber-900/20 rounded-sm flex items-center justify-center text-amber-500 shrink-0">
              <FiBox size={13} />
            </div>
            <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">{t('affectionTab.labels.choiceBox')}</span>
            <CustomNumberInput
              value={selectionBoxCount}
              onChange={(val) => handleUpdateSelectionBox(Number(val))}
              min={0}
              max={9999}
              className="w-14 h-7 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded text-center font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            />
          </div>

          <div className="flex gap-1 ml-auto">
            {/* Auto-input via Item Scanner */}
            <button
              onClick={() => void navigate(localeLink(locale, '/planner/item-scanner'))}
              className="px-2.5 py-1 rounded-sm text-xs font-bold transition-all flex items-center gap-1 bg-white text-neutral-500 ring-1 ring-neutral-100 hover:bg-blue-50 hover:text-blue-600 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-700 dark:hover:bg-blue-900/20 dark:hover:text-blue-300"
              title="Scan inventory screenshots to auto-input gift materials"
            >
              <RiCharacterRecognitionLine size={11} />
            </button>
            {/* Reset button */}
            <button
              onClick={handleResetGifts}
              className="px-2.5 py-1 rounded-sm text-xs font-bold transition-all flex items-center gap-1 bg-white text-neutral-500 ring-1 ring-neutral-100 hover:bg-neutral-50 hover:text-red-500 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-700 dark:hover:text-red-400"
              title={t('affectionTab.actions.reset')}
            >
              <FiRotateCcw size={11} />
            </button>
            <button
              onClick={() => setSimulateCrafting(!simulateCrafting)}
              className={`px-2.5 py-1 rounded-sm text-xs font-bold transition-all flex items-center gap-1 ${
                simulateCrafting
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800'
                  : 'bg-white text-neutral-500 ring-1 ring-neutral-100 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-700'
              }`}
            >
              <FiRepeat size={11} />
              {t('affectionTab.actions.craftingFill')}
            </button>
            <button
              onClick={() => setHideNonPreferred(!hideNonPreferred)}
              className={`px-2.5 py-1 rounded-sm text-xs font-bold transition-all flex items-center gap-1 ${
                hideNonPreferred
                  ? 'bg-neutral-800 text-white dark:bg-white dark:text-black'
                  : 'bg-white text-neutral-500 ring-1 ring-neutral-100 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-700'
              }`}
            >
              <FiFilter size={11} />
              {t('affectionTab.actions.showPreferredOnly')}
            </button>
          </div>
        </div>

        <div className="flex justify-end text-[9px] text-neutral-400 dark:text-neutral-500 px-1 pb-1 select-none">
          <span className="flex items-center gap-1">
            <RiKeyboardLine className="shrink-0" />
            <Trans
              i18nKey="planner:common.tabNavTip"
              components={{
                kbd: <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded text-[0.8em] font-mono" />,
              }}
            />
          </span>
        </div>

        {/* Gift grid */}
        <div className="pr-1 pb-2">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
            {displayedGifts.map((gift) => (
              <GiftItem
                key={gift.id}
                gift={gift}
                ownedCount={ownedGifts[gift.id] || 0}
                deficitExp={result?.deficitExp || 0}
                eventData={eventData}
                iconData={iconData}
                onUpdate={handleUpdateGift}
                onSelect={allStudents ? () => setSelectedGiftId(selectedGiftId === gift.id ? null : gift.id) : undefined}
                isSelected={selectedGiftId === gift.id}
              />
            ))}
          </div>
          {displayedGifts.length === 0 && (
            <div className="h-48 flex flex-col items-center justify-center text-neutral-300 dark:text-neutral-600">
              <FiFilter size={32} className="mb-2 opacity-20" />
              <p className="text-sm font-medium">{t('affectionTab.messages.noItems')}</p>
            </div>
          )}
        </div>
      </div>

      {/* --- STUDENT LIST SHEET (shared) --- */}
      {selectedGiftId &&
        (() => {
          const gift = giftAffectionList.find((g) => g.id === selectedGiftId);
          if (!gift) return null;
          return (
            <GiftStudentSheet
              gift={gift}
              students={giftToStudentsMap[selectedGiftId] ?? []}
              studentPortraits={studentPortraits}
              eventData={eventData}
              iconData={iconData}
              onClose={() => setSelectedGiftId(null)}
            />
          );
        })()}
    </div>
  );
};
