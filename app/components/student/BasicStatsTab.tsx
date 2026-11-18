// app/components/planner/StudentGrowth/BasicStatsTab.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiStar, FiHeart, FiTrendingUp, FiAlertCircle, FiEdit3 } from 'react-icons/fi';
import { StarRating } from '~/components/student/StarRating';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventData, IconData, Student } from '~/types/plannerData';
import { CustomNumberInput } from '~/components/common/CustomInput';
import { calcGearNeeds, calcLevelNeeds, calcRankNeeds, calcUWLevelNeeds } from '~/utils/calculatedGrowthNeeds';
import { uwMaxLevelMap } from '../../utils/student/const';
import { InlineCostHint } from './InlineCostHint';
import { GrowthRangeSlider, moveGrowthRange } from './GrowthRangeSlider';
import type { TFunction } from 'i18next';

// --- Helpers ---
// Highest rank slider index an acquired star can take (index 4 = 5 stars; the rest are unique weapon ranks)
const ACQUIRED_RANK_MAX_INDEX = 4;

const getAffectionLimit = (star: number, uw: number = 0): number => {
  if (uw > 0 || star >= 5) return 100;
  if (star === 4) return 30;
  if (star === 3) return 20;
  return 10;
};

// --- Sub-components ---
const EditableLevelDisplay = ({
  value,
  max,
  min = 1,
  onChange,
  prefix = '',
  textClassName = '',
  icon,
  disabled = false,
}: {
  value: number;
  max: number;
  min?: number;
  onChange: (val: number) => void;
  prefix?: string;
  textClassName?: string;
  icon?: React.ReactNode;
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
        {icon && <span className="mr-0.5">{icon}</span>}
        <span className="font-bold font-mono">-</span>
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
        className="w-10 h-6 text-sm text-center border-2 border-blue-500 rounded p-0 bg-white dark:bg-neutral-800 font-bold font-mono shadow-sm"
      />
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={`group flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer select-none transition-all hover:bg-black/5 dark:hover:bg-white/10 ${textClassName}`}
      title="Click to edit value"
    >
      {icon && <span className="mr-0.5">{icon}</span>}
      <span className="border-b border-dashed border-neutral-400/50 group-hover:border-transparent transition-colors font-bold">
        {prefix}
        {value}
      </span>
      <FiEdit3 className="text-[10px] opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all duration-200" />
    </div>
  );
};

// --- Main Component ---
interface BasicStatsTabProps {
  plan: GrowthPlan;
  studentInfo: Student;
  handlePlanChange: (field: string, value: string | number | boolean, isNumeric?: boolean) => void;
  rankOptions: { value: string; label: string }[];
  iconData?: IconData;
  eventData?: EventData;
  /** Unrecruited plan: `current` is fixed to the recruit baseline, except the acquired star. */
  currentLocked?: boolean;
}

export const BasicStatsTab = ({ plan, studentInfo, handlePlanChange, rankOptions, iconData, eventData, currentLocked = false }: BasicStatsTabProps) => {
  const { t } = useTranslation('planner');
  const { t: tUi } = useTranslation('ui');
  const { t: tGame } = useTranslation('game');
  const updateGrowthRange = useGlobalStore((state) => state.updateGrowthRange);

  // Rank Indexing
  const getRankIndex = useCallback(
    (type: 'current' | 'target') => {
      const state = plan[type];
      const key = state.uw > 0 ? `uw_${state.uw}` : `star_${state.star}`;
      return rankOptions.findIndex((opt) => opt.value === key);
    },
    [plan, rankOptions],
  );

  const currentRankIdx = getRankIndex('current');
  const targetRankIdx = getRankIndex('target');

  // Limits
  const currentAffectionLimit = getAffectionLimit(plan.current.star, plan.current.uw);
  const targetAffectionLimit = getAffectionLimit(plan.target.star, plan.target.uw);
  const isCurrentExceeded = plan.current.affection > currentAffectionLimit;
  const isTargetExceeded = plan.target.affection > targetAffectionLimit;
  const hasAffectionWarning = isCurrentExceeded || isTargetExceeded;

  let warningMsg: string | null = null;
  if (isCurrentExceeded) warningMsg = t('basicStatsTab.affectionWarning', { limit: currentAffectionLimit });
  else if (isTargetExceeded) warningMsg = t('basicStatsTab.affectionWarning', { limit: targetAffectionLimit });

  return (
    <div className="flex flex-col gap-8 py-4 px-2 w-full font-sans text-neutral-700 dark:text-neutral-200">
      {/* 3 Grid Layout for Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-8">
        {/* 1. Level */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {iconData ? (
                <img src={`data:image/webp;base64,${iconData.Item[13]}`} className="w-8 h-8 object-cover" loading="lazy" />
              ) : (
                <FiTrendingUp className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
              )}
              <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100 uppercase">{t('basicStatsTab.level')}</span>
            </div>
            <div className="flex items-center gap-1">
              <EditableLevelDisplay
                value={plan.current.level}
                max={90}
                min={1}
                prefix="Lv."
                disabled={currentLocked}
                onChange={(val) => {
                  const next = moveGrowthRange({ current: plan.current.level, target: plan.target.level }, 'current', val);
                  updateGrowthRange(plan.uuid, { kind: 'scalar', field: 'level' }, next.current, next.target);
                }}
                textClassName="font-mono text-sm text-neutral-500 dark:text-neutral-400"
              />
              <span className="text-[10px] px-1 text-neutral-400 dark:text-neutral-500">➜</span>
              <EditableLevelDisplay
                value={plan.target.level}
                max={90}
                min={1}
                prefix="Lv."
                onChange={(val) => {
                  const next = moveGrowthRange({ current: plan.current.level, target: plan.target.level }, 'target', val);
                  updateGrowthRange(plan.uuid, { kind: 'scalar', field: 'level' }, next.current, next.target);
                }}
                textClassName="font-mono text-sm text-blue-600 dark:text-blue-400"
              />
            </div>
          </div>
          <GrowthRangeSlider
            label={t('basicStatsTab.level')}
            currentLabel={tUi('current')}
            targetLabel={tUi('target')}
            min={1}
            max={90}
            value={{ current: plan.current.level, target: plan.target.level }}
            disabled={{ current: currentLocked }}
            hideCurrent={currentLocked}
            onChange={({ current, target }) => updateGrowthRange(plan.uuid, { kind: 'scalar', field: 'level' }, current, target)}
          />
          <InlineCostHint needs={calcLevelNeeds(plan.current.level, plan.target.level)} iconData={iconData} eventData={eventData} />
        </div>

        {/* 2. Rank (Star/UW) */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiStar className="w-4 h-4 text-amber-400" />
              {/* {
                iconData ? 
                <img src={`data:image/webp;base64,${iconData.Item[studentInfo.Id]}`} className="w-8 h-8 object-cover" loading="lazy" />
                :
                <FiStar className="w-4 h-4 text-amber-400" />
              } */}
              <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100 uppercase">{t('basicStatsTab.rank')}</span>
            </div>
            <div className="flex items-center gap-1 px-1 py-0.5">
              <div className="scale-75 origin-right">
                <StarRating n={currentRankIdx < 5 ? currentRankIdx + 1 : currentRankIdx + 2} />
              </div>
              <span className="text-[10px] px-1 text-neutral-400 dark:text-neutral-500">➜</span>
              <div className="scale-75 origin-left">
                <StarRating n={targetRankIdx < 5 ? targetRankIdx + 1 : targetRankIdx + 2} />
              </div>
            </div>
          </div>
          <GrowthRangeSlider
            label={t('basicStatsTab.rank')}
            currentLabel={tUi('current')}
            targetLabel={tUi('target')}
            min={0}
            max={rankOptions.length - 1}
            value={{ current: currentRankIdx, target: targetRankIdx }}
            marks={rankOptions.map((_, index) => ({
              value: index,
              label: (
                <div className="scale-[0.6] origin-top pt-1 flex justify-center">
                  <StarRating n={index < 5 ? index + 1 : index + 2} />
                </div>
              ),
            }))}
            formatValue={(index) => rankOptions[index]?.label ?? String(index)}
            onChange={({ current, target }) => updateGrowthRange(plan.uuid, { kind: 'rank' }, currentLocked ? Math.min(current, ACQUIRED_RANK_MAX_INDEX) : current, target)}
          />
          <InlineCostHint needs={calcRankNeeds(plan.current.star, plan.target.star, plan.current.uw, plan.target.uw, plan.studentId ?? undefined)} iconData={iconData} eventData={eventData} />
        </div>

        {/* 3. Affection */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiHeart className={`w-4 h-4 ${hasAffectionWarning ? 'text-rose-500' : 'text-rose-400'}`} />
              <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100 uppercase">{t('basicStatsTab.affectionRank')}</span>
            </div>
            <div className="flex items-center gap-1">
              <EditableLevelDisplay
                value={plan.current.affection}
                max={100}
                min={1}
                disabled={currentLocked}
                onChange={(val) => {
                  const next = moveGrowthRange({ current: plan.current.affection, target: plan.target.affection }, 'current', val);
                  updateGrowthRange(plan.uuid, { kind: 'scalar', field: 'affection' }, next.current, next.target);
                }}
                textClassName={`font-mono text-sm ${isCurrentExceeded ? 'text-rose-500' : 'text-neutral-500 dark:text-neutral-400'}`}
                icon={isCurrentExceeded && <FiAlertCircle className="w-3 h-3 text-rose-500 inline-block" />}
              />
              <span className={`text-[10px] px-1 ${hasAffectionWarning ? 'text-rose-300' : 'text-neutral-400 dark:text-neutral-500'}`}>➜</span>
              <EditableLevelDisplay
                value={plan.target.affection}
                max={100}
                min={1}
                onChange={(val) => {
                  const next = moveGrowthRange({ current: plan.current.affection, target: plan.target.affection }, 'target', val);
                  updateGrowthRange(plan.uuid, { kind: 'scalar', field: 'affection' }, next.current, next.target);
                }}
                textClassName={`font-mono text-sm ${isTargetExceeded ? 'text-rose-500' : 'text-blue-600 dark:text-blue-400'}`}
                icon={isTargetExceeded && <FiAlertCircle className="w-3 h-3 text-rose-500 inline-block" />}
              />
            </div>
          </div>
          <GrowthRangeSlider
            label={t('basicStatsTab.affectionRank')}
            currentLabel={tUi('current')}
            targetLabel={tUi('target')}
            min={1}
            max={100}
            value={{ current: plan.current.affection, target: plan.target.affection }}
            invalid={{ current: isCurrentExceeded, target: isTargetExceeded }}
            disabled={{ current: currentLocked }}
            hideCurrent={currentLocked}
            onChange={({ current, target }) => updateGrowthRange(plan.uuid, { kind: 'scalar', field: 'affection' }, current, target)}
          />
          {hasAffectionWarning && warningMsg && (
            <div className="flex items-center gap-1 mt-1 text-rose-500 text-[11px] font-medium">
              <FiAlertCircle className="w-3 h-3 shrink-0" />
              <span className="leading-tight">{warningMsg}</span>
            </div>
          )}
        </div>
        {/* 4. UW Level — only shown when weapon is unlocked on at least one side */}
        {(plan.current.uw > 0 || plan.target.uw > 0) &&
          (() => {
            const maxUw = Math.max(plan.current.uw, plan.target.uw);
            const maxLevel = uwMaxLevelMap[maxUw] ?? 70;
            const currentUwDisabled = plan.current.uw === 0;
            const targetUwDisabled = plan.target.uw === 0;
            return (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {iconData ? <img src={`data:image/webp;base64,${iconData.Equipment[43]}`} className="w-8 h-8 object-cover" loading="lazy" /> : <FiTrendingUp className="w-4 h-4 text-amber-400" />}
                    <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100 uppercase">{t('basicStatsTab.uwLevel', 'UW Level')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <EditableLevelDisplay
                      value={plan.current.uwLevel}
                      max={maxLevel}
                      min={1}
                      prefix="Lv."
                      disabled={currentUwDisabled}
                      onChange={(val) => {
                        const next = moveGrowthRange({ current: plan.current.uwLevel, target: plan.target.uwLevel }, 'current', val);
                        updateGrowthRange(plan.uuid, { kind: 'scalar', field: 'uwLevel' }, next.current, next.target);
                      }}
                      textClassName="font-mono text-sm text-neutral-500 dark:text-neutral-400"
                    />
                    <span className="text-[10px] px-1 text-neutral-400 dark:text-neutral-500">➜</span>
                    <EditableLevelDisplay
                      value={plan.target.uwLevel}
                      max={maxLevel}
                      min={1}
                      prefix="Lv."
                      disabled={targetUwDisabled}
                      onChange={(val) => {
                        const next = moveGrowthRange({ current: plan.current.uwLevel, target: plan.target.uwLevel }, 'target', val);
                        updateGrowthRange(plan.uuid, { kind: 'scalar', field: 'uwLevel' }, next.current, next.target);
                      }}
                      textClassName="font-mono text-sm text-blue-600 dark:text-blue-400"
                    />
                  </div>
                </div>
                <GrowthRangeSlider
                  label={t('basicStatsTab.uwLevel')}
                  currentLabel={tUi('current')}
                  targetLabel={tUi('target')}
                  min={1}
                  max={maxLevel}
                  value={{ current: plan.current.uwLevel, target: plan.target.uwLevel }}
                  disabled={{ current: currentUwDisabled, target: targetUwDisabled }}
                  onChange={({ current, target }) => updateGrowthRange(plan.uuid, { kind: 'scalar', field: 'uwLevel' }, current, target)}
                />
                <InlineCostHint needs={calcUWLevelNeeds(plan.current.uwLevel, plan.target.uwLevel, studentInfo.WeaponType)} iconData={iconData} eventData={eventData} />
              </div>
            );
          })()}
      </div>

      {/* Bond Gear — only for students with gear */}
      {studentInfo.Gear &&
        'TierUpMaterial' in studentInfo.Gear &&
        (() => {
          const TIERS = [0, 1, 2] as const;
          const tierLabel = (v: number) => (v === 0 ? tUi('none') : `T${v}`);
          const currentGear = plan.current.gear ?? 0;
          const targetGear = plan.target.gear ?? 0;
          const affectionCurrent = plan.current.affection;
          const affectionTarget = plan.target.affection;

          const gearAffectionReq = (tier: number) => (tier === 1 ? 15 : tier === 2 ? 20 : 0);

          // Current: show all tiers that meet affection req (always show current selection)
          // Target: additionally hide tiers below currentGear (game doesn't allow downgrade)
          const showCurrentGearBtn = (val: number) => {
            if (val === currentGear) return true;
            return affectionCurrent >= gearAffectionReq(val);
          };
          const showTargetGearBtn = (val: number) => {
            if (val === targetGear) return true;
            if (val < currentGear) return false;
            return affectionTarget >= gearAffectionReq(val);
          };

          const TierBtn = ({ val, selected, onClick, disabled = false }: { val: number; selected: boolean; onClick: () => void; disabled?: boolean }) => (
            <button
              onClick={onClick}
              disabled={disabled}
              className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors disabled:opacity-40 disabled:cursor-default ${
                selected
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-transparent border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400 hover:border-blue-400 hover:text-blue-500'
              }`}
            >
              {tierLabel(val)}
            </button>
          );

          return (
            <div className="pt-4 border-t border-dashed border-neutral-200 dark:border-neutral-800">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100 uppercase">{tGame('gear')}</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    {/* Current */}
                    <div className="flex items-center gap-1">
                      {currentLocked ? (
                        <span className="px-2 text-xs font-bold text-neutral-400 dark:text-neutral-500">-</span>
                      ) : (
                        TIERS.filter(showCurrentGearBtn).map((v) => <TierBtn key={v} val={v} selected={currentGear === v} onClick={() => handlePlanChange('current.gear', v, true)} />)
                      )}
                    </div>
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500">➜</span>
                    {/* Target */}
                    <div className="flex items-center gap-1">
                      {TIERS.filter(showTargetGearBtn).map((v) => (
                        <TierBtn key={v} val={v} selected={targetGear === v} onClick={() => handlePlanChange('target.gear', v, true)} />
                      ))}
                    </div>
                  </div>
                  <InlineCostHint
                    needs={calcGearNeeds(currentGear, targetGear, studentInfo.Gear as { TierUpMaterial: number[][]; TierUpMaterialAmount: number[][] })}
                    iconData={iconData}
                    eventData={eventData}
                  />
                </div>
              </div>
            </div>
          );
        })()}

      {/* Eligma Option - spans full width below grid */}
      <div className="pt-4 border-t border-dashed border-neutral-200 dark:border-neutral-800 mt-2">
        <EligmaToggle plan={plan} handlePlanChange={handlePlanChange} t={t} />
      </div>
    </div>
  );
};

// --- EligmaToggle Component ---
// (Changed to flat design by minimizing background color and padding)
const EligmaToggle = React.memo(
  ({ plan, handlePlanChange, t }: { plan: GrowthPlan; handlePlanChange: (field: string, value: string | number | boolean, isNumeric?: boolean) => void; t: TFunction<'planner'> }) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      {/* Checkbox row */}
      <div onClick={() => handlePlanChange('useEligmaForStar', !plan.useEligmaForStar)} className="flex items-center gap-2 cursor-pointer select-none group w-fit">
        <div
          className={`
          w-4 h-4 rounded flex items-center justify-center border transition-colors
          ${plan.useEligmaForStar ? 'bg-blue-500 border-blue-500 text-white' : 'bg-transparent border-neutral-400 group-hover:border-blue-400 text-transparent dark:border-neutral-500'}
        `}
        >
          <FiCheck size={12} strokeWidth={3} />
        </div>
        <span
          className={`text-sm font-bold transition-colors ${plan.useEligmaForStar ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-600 dark:text-neutral-300 group-hover:text-neutral-900 dark:group-hover:text-neutral-100'}`}
        >
          {t('basicStatsTab.useEligmaForRankUp')}
        </span>
      </div>

      {/* Options row (Only visible when checked) */}
      {plan.useEligmaForStar && (
        <div className="flex gap-4 items-center animate-in fade-in slide-in-from-left-2 ml-6 sm:ml-0 border-l-2 border-blue-100 dark:border-blue-900 pl-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{t('basicStatsTab.currentElephPrice')}</label>
            <select
              value={plan.eligmaInfo?.price || 1}
              onChange={(e) => handlePlanChange('eligmaInfo.price', e.target.value, true)}
              className="bg-neutral-50 dark:bg-neutral-800 border-none rounded py-1 px-2 text-xs font-mono font-bold text-neutral-700 dark:text-neutral-200 focus:ring-1 focus:ring-blue-400 outline-none cursor-pointer"
            >
              {[1, 2, 3, 4, 5].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{t('basicStatsTab.purchasableEleph')}</label>
            <input
              type="number"
              value={plan.eligmaInfo?.stock || 0}
              onChange={(e) => handlePlanChange('eligmaInfo.stock', e.target.value, true)}
              className="w-16 bg-neutral-50 dark:bg-neutral-800 border-none rounded py-1 px-2 text-xs font-mono font-bold text-center text-neutral-700 dark:text-neutral-200 focus:ring-1 focus:ring-blue-400 outline-none"
            />
          </div>
        </div>
      )}
    </div>
  ),
);
EligmaToggle.displayName = 'EligmaToggle';
