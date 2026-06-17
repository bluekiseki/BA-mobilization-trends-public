// app/components/planner/StudentGrowth/EquipmentTab.tsx

import React, { useState, useEffect } from 'react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiEdit3 } from 'react-icons/fi';
import { CustomNumberInput } from '~/components/CustomInput';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Student, IconData, EventData } from '~/types/plannerData';
import { equipmentBlueprintId } from '~/data/growthData';
import { calcEquipmentSlotNeeds } from '~/utils/calculatedGrowthNeeds';
import { MAX_TIER } from './const';
import { InlineCostHint } from './InlineCostHint';

// --- Constants & Helpers ---
const UNLOCK_LEVELS = [1, 10, 20];

const getEquipmentId = (equipType: string, tier: number): string | undefined => {
  if (tier <= 0 || !equipmentBlueprintId[equipType as keyof typeof equipmentBlueprintId]) return undefined;

  const ids = equipmentBlueprintId[equipType as keyof typeof equipmentBlueprintId];
  if (tier === 1) return ids[0].toString();

  const blueprintId = ids[tier - 1];
  return blueprintId ? (blueprintId % 100000).toString() : undefined;
};

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
interface EquipmentTabProps {
  plan: GrowthPlan;
  studentInfo: Student | null;
  handleBatchUpdate: (field: string, value: unknown) => void;
  iconData?: IconData;
  eventData?: EventData;
}

export const EquipmentTab = ({ plan, studentInfo, handleBatchUpdate, iconData, eventData }: EquipmentTabProps) => {
  const { t } = useTranslation('planner');

  if (!studentInfo) return null;

  const currentLevel = plan.current.level ?? 1;
  const targetLevel = plan.target.level ?? 1;

  const handleSliderChange = (index: number, value: number | number[]) => {
    if (Array.isArray(value)) {
      const [v1, v2] = value;
      const newCurrent = Math.min(v1, v2);
      const newTarget = Math.max(v1, v2);

      if (plan.current.equipment[index] !== newCurrent) {
        const newEquip = [...plan.current.equipment];
        newEquip[index] = newCurrent;
        handleBatchUpdate('current.equipment', newEquip);
      }

      if (plan.target.equipment[index] !== newTarget) {
        const newEquip = [...plan.target.equipment];
        newEquip[index] = newTarget;
        handleBatchUpdate('target.equipment', newEquip);
      }
    }
  };

  const renderTierInfo = (tier: number, equipType: string, isInvalid: boolean, onChange: (val: number) => void) => {
    const equipId = getEquipmentId(equipType, tier);
    const iconBase64 = equipId && iconData?.Equipment?.[equipId];
    const colorClass = isInvalid ? 'text-rose-500' : tier > 0 ? 'text-neutral-800 dark:text-neutral-200' : 'text-neutral-400 dark:text-neutral-500';

    return (
      <div className="flex items-center gap-1">
        {iconBase64 ? (
          <img src={`data:image/webp;base64,${iconBase64}`} className="w-8 h-8 object-cover" alt={`T${tier}`} loading="lazy" style={{ opacity: isInvalid || tier === 0 ? 0.6 : 1 }} />
        ) : (
          <div className="w-6 h-6 bg-neutral-200/50 dark:bg-neutral-800/50 rounded-md" />
        )}
        <EditableLevelDisplay value={tier} max={MAX_TIER} min={0} onChange={onChange} prefix="T" textClassName={`font-mono text-sm ${colorClass}`} />
      </div>
    );
  };

  return (
    // 3-column layout on desktop (lg:grid-cols-3), with spacing (gap-x-10 gap-y-8)
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-8 font-sans text-neutral-700 dark:text-neutral-200 py-4 px-2 w-full">
      {plan.current.equipment.map((currentTier, index) => {
        const targetTier = plan.target.equipment[index];
        const equipType = studentInfo.Equipment[index];
        const unlockLevel = UNLOCK_LEVELS[index] || 1;

        // Validation
        const isCurrentInvalid = currentTier > 0 && currentLevel < unlockLevel;
        const isTargetInvalid = targetTier > 0 && targetLevel < unlockLevel;
        const hasWarning = isCurrentInvalid || isTargetInvalid;

        return (
          <div key={index} className="flex flex-col gap-2">
            {/* Header: Label & Value Display */}
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-neutral-800 dark:text-neutral-100 tracking-wide uppercase">{t(`common.${equipType}`, equipType)}</span>

              <div className="flex items-center gap-1">
                {renderTierInfo(currentTier, equipType, isCurrentInvalid, (val) => handleSliderChange(index, [val, targetTier]))}

                <span className={`text-[10px] px-1 ${hasWarning ? 'text-rose-300' : 'text-neutral-400 dark:text-neutral-500'}`}>➜</span>

                {renderTierInfo(targetTier, equipType, isTargetInvalid, (val) => handleSliderChange(index, [currentTier, val]))}
              </div>
            </div>

            {/* Slider */}
            <div className="px-1 mt-1">
              <Slider
                range
                min={0}
                max={MAX_TIER}
                step={1}
                dots={true}
                allowCross={true}
                pushable={false}
                value={[currentTier, targetTier]}
                onChange={(val) => handleSliderChange(index, val)}
                styles={{
                  track: {
                    backgroundColor: hasWarning ? '#f43f5e' : '#3b82f6',
                    height: 5,
                  },
                  rail: {
                    backgroundColor: 'var(--tw-colors-neutral-200, #e5e7eb)',
                    height: 5,
                  },
                }}
                dotStyle={{
                  borderColor: 'var(--tw-colors-neutral-300, #d1d5db)',
                  backgroundColor: 'var(--tw-colors-white, #ffffff)',
                  borderWidth: 2,
                  width: 8,
                  height: 8,
                  bottom: -1.5,
                }}
                activeDotStyle={{
                  borderColor: hasWarning ? '#f43f5e' : '#3b82f6',
                  backgroundColor: hasWarning ? '#f43f5e' : '#3b82f6',
                  width: 8,
                  height: 8,
                  bottom: -1.5,
                }}
                // eslint-disable-next-line @typescript-eslint/no-deprecated
                handleStyle={[
                  {
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
                  {
                    borderColor: isTargetInvalid ? '#f43f5e' : '#3b82f6',
                    backgroundColor: isTargetInvalid ? '#f43f5e' : '#3b82f6',
                    opacity: 1,
                    height: 18,
                    width: 18,
                    marginTop: -6.5,
                    boxShadow: '0 1px 3px rgba(37,99,235,0.3)',
                    borderWidth: 2,
                    zIndex: 11,
                  },
                ]}
                className="
                  dark:[&_.rc-slider-rail]:bg-neutral-700! 
                  dark:[&_.rc-slider-dot]:border-neutral-500! dark:[&_.rc-slider-dot]:bg-neutral-800!
                  dark:[&_.rc-slider-dot-active]:border-blue-500! dark:[&_.rc-slider-dot-active]:bg-blue-500!
                  dark:[&_.rc-slider-handle-1]:bg-neutral-800!
                "
              />
            </div>

            {/* Warning Message */}
            {hasWarning && (
              <div className="flex items-center gap-1 mt-1 text-rose-500 text-[11px] font-medium">
                <FiAlertCircle className="w-3 h-3 shrink-0" />
                <span className="leading-tight">{t(isCurrentInvalid ? 'equipmentTab.reqCurrent' : 'equipmentTab.reqTarget', { level: unlockLevel })}</span>
              </div>
            )}
            <InlineCostHint needs={calcEquipmentSlotNeeds(currentTier, targetTier, equipType)} iconData={iconData} eventData={eventData} />
          </div>
        );
      })}
    </div>
  );
};
