// app/components/planner/StudentGrowth/PotentialTab.tsx

import React, { useState, useEffect } from 'react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiEdit3 } from 'react-icons/fi';
import { CustomNumberInput } from '~/components/CustomInput';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventData, IconData, Student } from '~/types/plannerData';
import { calcPotentialStatNeeds } from '~/utils/calculatedGrowthNeeds';
import { InlineCostHint } from './InlineCostHint';

// --- Constants ---
export const WB_HP_ID = 2000;
export const WB_ATK_ID = 2001;
export const WB_HEAL_ID = 2002;

const MAX_POTENTIAL = 25;
const UNLOCK_LEVEL = 90;

// --- Sub-components ---
const EditableLevelDisplay = ({
  value,
  max,
  min = 0,
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
      <span className="border-b border-dashed border-neutral-400/50 group-hover:border-transparent transition-colors font-bold">
        {prefix}
        {value}
      </span>
      <FiEdit3 className="text-[10px] opacity-0 -translate-x-1 group-hover:opacity-50 group-hover:translate-x-0 transition-all duration-200" />
    </div>
  );
};

// --- Component ---
interface PotentialTabProps {
  plan: GrowthPlan;
  handleBatchUpdate: (field: string, value: unknown) => void;
  iconData?: IconData;
  eventData?: EventData;
  studentInfo?: Student;
}

export const PotentialTab = ({ plan, handleBatchUpdate, iconData, eventData, studentInfo }: PotentialTabProps) => {
  const { t } = useTranslation('planner');

  const stats = ['hp', 'atk', 'heal'] as const;
  const wbIds = { hp: WB_HP_ID, atk: WB_ATK_ID, heal: WB_HEAL_ID };

  const currentLevel = plan.current.level ?? 1;
  const currentUw = plan.current.uw ?? 0;
  const targetLevel = plan.target.level ?? 1;
  const targetUw = plan.target.uw ?? 0;

  // Unlock condition: Lv.90+ AND UW 1+
  const checkUnlocked = (level: number, uw: number) => level >= UNLOCK_LEVEL && uw > 0;

  const isCurrentUnlocked = checkUnlocked(currentLevel, currentUw);
  const isTargetUnlocked = checkUnlocked(targetLevel, targetUw);

  const statLabels = {
    hp: t('common.hp', 'HP'),
    atk: t('common.atk', 'ATK'),
    heal: t('common.heal', 'HEAL'),
  };

  const handleSliderChange = (stat: (typeof stats)[number], value: number | number[]) => {
    if (Array.isArray(value)) {
      const [v1, v2] = value;
      const newCurrent = Math.min(v1, v2);
      const newTarget = Math.max(v1, v2);

      if (plan.current.potential[stat] !== newCurrent) {
        handleBatchUpdate('current.potential', { ...plan.current.potential, [stat]: newCurrent });
      }
      if (plan.target.potential[stat] !== newTarget) {
        handleBatchUpdate('target.potential', { ...plan.target.potential, [stat]: newTarget });
      }
    }
  };

  return (
    // 3-column layout on desktop (lg:grid-cols-3), with spacing (gap-x-10 gap-y-8)
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-8 font-sans text-neutral-700 dark:text-neutral-200 py-4 px-2 w-full">
      {stats.map((stat) => {
        const currentVal = plan.current.potential[stat];
        const targetVal = plan.target.potential[stat];
        const iconId = wbIds[stat];

        const isCurrentInvalid = currentVal > 0 && !isCurrentUnlocked;
        const isTargetInvalid = targetVal > 0 && !isTargetUnlocked;
        const hasWarning = isCurrentInvalid || isTargetInvalid;

        return (
          <div key={stat} className="flex flex-col gap-2">
            {/* Header: Label & Value Display */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {iconData?.Item?.[iconId] && <img src={`data:image/webp;base64,${iconData.Item[iconId]}`} alt={stat} className="w-8 h-8 object-cover" />}
                <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100 tracking-wide uppercase">{statLabels[stat]}</span>
              </div>

              <div className="flex items-center gap-1">
                <EditableLevelDisplay
                  value={currentVal}
                  max={MAX_POTENTIAL}
                  min={0}
                  onChange={(val) => handleSliderChange(stat, [val, targetVal])}
                  textClassName={`font-mono text-sm ${isCurrentInvalid ? 'text-rose-500' : 'text-neutral-500 dark:text-neutral-400'}`}
                />

                <span className={`text-[10px] px-1 ${hasWarning ? 'text-rose-300' : 'text-neutral-400 dark:text-neutral-500'}`}>➜</span>

                <EditableLevelDisplay
                  value={targetVal}
                  max={MAX_POTENTIAL}
                  min={0}
                  onChange={(val) => handleSliderChange(stat, [currentVal, val])}
                  textClassName={`font-mono text-sm ${isTargetInvalid ? 'text-rose-500' : 'text-blue-600 dark:text-blue-400'}`}
                />
              </div>
            </div>

            {/* Slider */}
            <div className="px-1 mt-1">
              <Slider
                range
                min={0}
                max={MAX_POTENTIAL}
                step={1}
                allowCross={true}
                pushable={false}
                value={[currentVal, targetVal]}
                onChange={(val) => handleSliderChange(stat, val)}
                styles={{
                  track: {
                    backgroundColor: hasWarning ? '#f43f5e' : '#3b82f6',
                    height: 5,
                  },
                  rail: {
                    backgroundColor: 'var(--tw-colors-neutral-200, #e5e7eb)',
                    height: 5,
                  },
                  handle: {
                    borderColor: isCurrentInvalid ? '#f43f5e' : '#9ca3af',
                    backgroundColor: '#ffffff',
                    opacity: 1,
                    height: 18,
                    width: 18,
                    marginTop: -6.5,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    borderWidth: 2,
                    zIndex: 10,
                  },
                }}
                className="dark:[&_.rc-slider-rail]:bg-neutral-700! dark:[&_.rc-slider-handle-1]:bg-neutral-800!"
              />
            </div>

            {/* Warning Message */}
            {hasWarning && (
              <div className="flex items-center gap-1 mt-1 text-rose-500 text-[11px] font-medium">
                <FiAlertCircle className="w-3 h-3 shrink-0" />
                <span className="leading-tight">{t(isCurrentInvalid ? 'potentialTab.reqCurrent' : 'potentialTab.reqTarget')}</span>
              </div>
            )}
            {studentInfo && <InlineCostHint needs={calcPotentialStatNeeds(stat, currentVal, targetVal, studentInfo.PotentialMaterial)} iconData={iconData} eventData={eventData} />}
          </div>
        );
      })}
    </div>
  );
};
