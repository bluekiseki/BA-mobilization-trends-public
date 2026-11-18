// app/components/planner/StudentGrowth/FaverTab.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { useTranslation, Trans } from 'react-i18next';
import { FiFilter, FiRepeat, FiCoffee, FiCalendar, FiEdit3, FiRotateCcw } from 'react-icons/fi';
import { RiHeartLine, RiCharacterRecognitionLine, RiKeyboardLine, RiInformationLine } from 'react-icons/ri';

import { affectionExpToNextLevel } from '~/data/growthData';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventData, IconData, StudentData } from '~/types/plannerData';
// import { getGiftAffectionList } from '../../utils/student/giftAffectionList';
import { GiftStudentSheet, getPreferenceIcon, type GiftEntry } from './GiftStudentSheet';
import { buildGiftToStudentsMap, type GiftStudentEntry } from '../../utils/student/giftStudents';
import { CraftNodeRecommendations } from './CraftNodeRecommendations';

import { ItemIcon } from '../item/Icon';
import { CustomNumberInput } from '~/components/common/CustomInput';
import { NumberInput } from '../common/NumberInput';
import { isPreferredGift } from '../../utils/student/giftAffectionList';
import { CRAFT_CREDIT_COST, CRAFT_HOURS, CRAFT_STONE_COST, CRAFT_STONE_ITEM_KEY } from '../../utils/student/const';
import { formatCompactNumber } from '~/utils/formatCompactNumber';
import { getItemName } from '~/utils/locale';
import { SELECTION_BOX_ID, calculateAffection, getMaxPointsById, isGivenGift, type ConvertMode, type GiftRule } from '../../utils/student/affectionCalc';
import { useLocation } from 'react-router';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';

// --- Types ---

interface AffectionTabProps {
  plan: GrowthPlan;
  giftAffectionList: GiftEntry[];
  eventData: EventData;
  iconData: IconData;
  handlePlanChange: (field: string, value: number | string | boolean, isNumeric?: boolean) => void;
  allStudents?: StudentData;
  /** Unrecruited plan: `current` is fixed to the recruit baseline. */
  currentLocked?: boolean;
}

// --- Sub-components ---

const EditableLevelDisplay = ({
  value,
  max,
  min = 1,
  onChange,
  prefix = '',
  textClassName = '',
  disabled = false,
}: {
  value: number;
  max: number;
  min?: number;
  onChange: (val: number) => void;
  prefix?: string;
  textClassName?: string;
  disabled?: boolean;
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

  if (disabled) {
    return (
      <div className={`flex items-center gap-1 px-1 py-0.5 opacity-30 select-none ${textClassName}`}>
        <span className="font-bold">-</span>
      </div>
    );
  }

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
    skipLabel,
  }: {
    gift: GiftEntry;
    ownedCount: number;
    deficitExp: number;
    eventData: EventData;
    iconData: IconData;
    onUpdate: (id: string, val: number) => void;
    onSelect?: () => void;
    isSelected?: boolean;
    /** Set when the gift rule withholds this gift; shown dimmed with this label. */
    skipLabel?: string;
  }) => {
    const { t } = useTranslation('planner');
    const prefIcon = useMemo(() => getPreferenceIcon(gift.preferenceLevel, gift.rarity), [gift.preferenceLevel, gift.rarity]);
    const neededCount = deficitExp > 0 ? Math.ceil(deficitExp / gift.affectionPoints) : 0;

    return (
      <div
        className={`group flex flex-col p-1.5 w-full max-w-27.5 mx-auto bg-white dark:bg-neutral-800 rounded-md transition-colors ${isSelected ? 'ring-2 ring-pink-400 dark:ring-pink-500' : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/50'} ${skipLabel ? 'opacity-50' : ''}`}
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
          {skipLabel && <div className="absolute top-0 right-0 bg-neutral-700 text-white px-1 py-px rounded-bl-sm text-[10px] leading-none">{skipLabel}</div>}
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
  (prev, next) =>
    prev.ownedCount === next.ownedCount &&
    prev.gift.id === next.gift.id &&
    prev.gift.affectionPoints === next.gift.affectionPoints &&
    prev.deficitExp === next.deficitExp &&
    prev.isSelected === next.isSelected &&
    prev.skipLabel === next.skipLabel,
);
GiftItem.displayName = 'GiftItem';

// --- Segmented control (one row of mutually exclusive buttons) ---

const SegmentedControl = <T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[] }) => (
  <div className="flex gap-1">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => onChange(option.value)}
        className={`px-2.5 py-1 rounded-sm text-xs font-bold transition-all ${
          value === option.value
            ? 'bg-neutral-800 text-white dark:bg-white dark:text-black'
            : 'bg-white text-neutral-500 ring-1 ring-neutral-100 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-700'
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

// --- Main Component ---

export const AffectionTab = ({ plan, giftAffectionList, eventData, iconData, handlePlanChange, allStudents, currentLocked = false }: AffectionTabProps) => {
  const { t, i18n } = useTranslation('planner');
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const itemScannerLink = `${localeLink(locale, '/scanner/item')}?returnTo=${encodeURIComponent(returnTo)}`;
  const { ownedGifts, updateOwnedGifts, materialInventory, updateMaterialInventory } = useGlobalStore();

  const [giftRule, setGiftRule] = useState<GiftRule>('all');
  // Display-only filter; it does not change the calculation (that is what the gift rule is for).
  const [hideNonPreferred, setHideNonPreferred] = useState(true);
  const [convertMode, setConvertMode] = useState<ConvertMode>('off');
  // 'owned' limits crafts to the stone count in the real inventory (0 stones means no crafts).
  const [stoneMode, setStoneMode] = useState<'unlimited' | 'owned'>('unlimited');
  const ownedStones = materialInventory[CRAFT_STONE_ITEM_KEY] ?? 0;
  const stoneLimit = stoneMode === 'owned' ? ownedStones : null;
  const stoneName = getItemName(CRAFT_STONE_ITEM_KEY, eventData.icons, locale);
  const [selectionBoxCount, setSelectionBoxCount] = useState(0);
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

  const maxPointsById = useMemo(() => getMaxPointsById(giftToStudentsMap), [giftToStudentsMap]);

  // --- Core Calculation ---
  const result = useMemo(
    () =>
      calculateAffection({
        currentLevel: plan.current.affection,
        currentExp: plan.current.affectionExp,
        targetLevel: plan.target.affection,
        gifts: giftAffectionList,
        inventory: { ...ownedGifts, [SELECTION_BOX_ID]: selectionBoxCount },
        giftRule,
        maxPointsById,
        convertMode,
        stoneLimit,
      }),
    [plan, ownedGifts, giftAffectionList, selectionBoxCount, giftRule, maxPointsById, convertMode, stoneLimit],
  );

  // Gifts the rule withholds stay visible (dimmed) so entered counts never seem to vanish.
  const skippedIds = useMemo(() => new Set(giftAffectionList.filter((g) => !isGivenGift(g, giftRule, maxPointsById)).map((g) => g.id)), [giftAffectionList, giftRule, maxPointsById]);
  const displayedGifts = useMemo(() => (hideNonPreferred ? giftAffectionList.filter(isPreferredGift) : giftAffectionList), [giftAffectionList, hideNonPreferred]);
  const skipLabel = convertMode === 'off' ? t('affectionTab.rules.excluded') : t('affectionTab.rules.material');
  const simulateCrafting = convertMode !== 'off';

  return (
    <div className="font-sans text-neutral-700 dark:text-neutral-200 flex flex-col gap-5">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* --- LEFT: Result + Level Controls --- */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-3">
          {/* Result Card */}
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
                    <span className="text-[10px] font-normal text-neutral-400 ml-0.5">{t_ui('runsUnit')}</span>
                  </span>
                </div>
              </div>
            )}

            {/* Crafting information (Optional) */}
            {simulateCrafting && result.craftingRequiredCount > 0 && (
              <div className="flex flex-col gap-2 border-t border-amber-200 dark:border-amber-800/40 pt-2">
                <div className="flex items-center gap-2">
                  <FiRepeat size={11} className="text-amber-500 shrink-0" />
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 flex-1">{t('affectionTab.result.craftingNeeded')}</span>
                  <span className="text-sm font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                    {result.craftingRequiredCount.toLocaleString()}
                    <span className="text-[10px] font-normal ml-0.5">{t('affectionTab.units.times')}</span>
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                  <div className="flex flex-col min-w-0">
                    <span className="truncate" title={stoneName}>
                      {stoneName}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-neutral-700 dark:text-neutral-200">{(result.craftingRequiredCount * CRAFT_STONE_COST).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate" title={t('affectionTab.cost.credit')}>
                      {t('affectionTab.cost.credit')}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-neutral-700 dark:text-neutral-200">{formatCompactNumber(result.craftingRequiredCount * CRAFT_CREDIT_COST)}</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate" title={t('affectionTab.cost.time')}>
                      {t('affectionTab.cost.time')}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-neutral-700 dark:text-neutral-200">
                      {t('affectionTab.cost.hours', { hours: (result.craftingRequiredCount * CRAFT_HOURS).toLocaleString() })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

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
                  disabled={currentLocked}
                  onChange={(val) => handlePlanChange('current.affection', val, true)}
                  textClassName="text-neutral-800 dark:text-white"
                />
                {!currentLocked && (
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={plan.current.affection}
                    onChange={(e) => handlePlanChange('current.affection', Number(e.target.value), true)}
                    className="w-full h-1 mt-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer dark:bg-neutral-700 accent-neutral-600"
                  />
                )}
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
            {!currentLocked && (
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
            )}
          </div>
        </div>

        {/* --- RIGHT: Inventory --- */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Selection box */}
            <div className="flex items-center gap-1.5">
              <ItemIcon type="Item" itemId={String(SELECTION_BOX_ID)} amount={0} size={7} eventData={eventData} iconData={iconData} />
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
                onClick={() => window.location.assign(itemScannerLink)}
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
              <label className="flex items-center gap-1.5 px-1 text-xs font-bold text-neutral-600 dark:text-neutral-300 cursor-pointer select-none">
                <input type="checkbox" checked={hideNonPreferred} onChange={(e) => setHideNonPreferred(e.target.checked)} className="accent-neutral-700 dark:accent-neutral-300" />
                {t('affectionTab.actions.showPreferredOnly')}
              </label>
            </div>
          </div>

          {/* Rules: which gifts to give, and whether to convert spare gifts by crafting */}
          <div className="flex flex-col gap-2 px-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              <span className="text-xs font-bold text-neutral-500 sm:w-40 shrink-0">{t('affectionTab.rules.giftRule')}</span>
              <div className="flex items-center gap-1">
                <SegmentedControl
                  value={giftRule}
                  onChange={setGiftRule}
                  options={[
                    { value: 'all', label: t('affectionTab.rules.all') },
                    { value: 'preferred', label: t('affectionTab.rules.preferred') },
                    { value: 'maxOnly', label: t('affectionTab.rules.maxOnly') },
                  ]}
                />
                {giftRule === 'maxOnly' && (
                  <Tooltip placement="top" trigger={['hover', 'click']} overlay={<span className="text-xs">{t('affectionTab.rules.maxOnlyHelp')}</span>}>
                    <span className="text-neutral-400 cursor-help p-1">
                      <RiInformationLine size={14} />
                    </span>
                  </Tooltip>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              <span className="text-xs font-bold text-neutral-500 sm:w-40 shrink-0">{t('affectionTab.actions.craftingFill')}</span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <SegmentedControl
                  value={convertMode}
                  onChange={setConvertMode}
                  options={[
                    { value: 'off', label: t('affectionTab.rules.convertOff') },
                    { value: 'toTarget', label: t('affectionTab.rules.convertToTarget') },
                    { value: 'all', label: t('affectionTab.rules.all') },
                  ]}
                />
                {simulateCrafting && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="flex items-center gap-1 text-xs text-neutral-500">
                      <ItemIcon type="Item" itemId={CRAFT_STONE_ITEM_KEY.slice(CRAFT_STONE_ITEM_KEY.indexOf('_') + 1)} amount={0} size={7} eventData={eventData} iconData={iconData} />
                      {stoneName}
                    </span>
                    <SegmentedControl
                      value={stoneMode}
                      onChange={setStoneMode}
                      options={[
                        { value: 'unlimited', label: t('affectionTab.rules.unlimited') },
                        { value: 'owned', label: t('affectionTab.rules.stoneOwnedMode') },
                      ]}
                    />
                    {stoneMode === 'owned' && (
                      <CustomNumberInput
                        value={ownedStones}
                        onChange={(val) => updateMaterialInventory(CRAFT_STONE_ITEM_KEY, val ?? 0)}
                        min={0}
                        max={9999999}
                        className="w-24 h-7 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded text-center font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                      />
                    )}
                  </div>
                )}
              </div>
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
                  deficitExp={result.deficitExp}
                  eventData={eventData}
                  iconData={iconData}
                  onUpdate={handleUpdateGift}
                  onSelect={allStudents ? () => setSelectedGiftId(selectedGiftId === gift.id ? null : gift.id) : undefined}
                  isSelected={selectedGiftId === gift.id}
                  skipLabel={skippedIds.has(gift.id) ? skipLabel : undefined}
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
            return <GiftStudentSheet gift={gift} students={giftToStudentsMap[selectedGiftId] ?? []} eventData={eventData} iconData={iconData} onClose={() => setSelectedGiftId(null)} />;
          })()}
      </div>

      <CraftNodeRecommendations giftAffectionList={giftAffectionList} eventData={eventData} iconData={iconData} locale={locale} simulateCrafting={simulateCrafting} />
    </div>
  );
};
