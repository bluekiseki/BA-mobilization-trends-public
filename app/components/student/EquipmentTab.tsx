// app/components/planner/StudentGrowth/EquipmentTab.tsx

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiEdit3 } from 'react-icons/fi';
import { CustomNumberInput } from '~/components/common/CustomInput';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Student, IconData, EventData } from '~/types/plannerData';
import { equipmentBlueprintId } from '~/data/growthData';
import { calcEquipmentSlotNeeds } from '~/utils/calculatedGrowthNeeds';
import { MAX_TIER } from '../../utils/student/const';
import { InlineCostHint } from './InlineCostHint';
import { GrowthRangeSlider, moveGrowthRange, type GrowthRangeValue } from './GrowthRangeSlider';

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
  iconData?: IconData;
  eventData?: EventData;
}

export const EquipmentTab = ({ plan, studentInfo, iconData, eventData }: EquipmentTabProps) => {
  const { t } = useTranslation('planner');
  const { t: tUi } = useTranslation('ui');
  const updateGrowthRange = useGlobalStore((state) => state.updateGrowthRange);

  if (!studentInfo) return null;

  const currentLevel = plan.current.level ?? 1;
  const targetLevel = plan.target.level ?? 1;

  const handleSliderChange = (index: 0 | 1 | 2, value: GrowthRangeValue) => {
    updateGrowthRange(plan.uuid, { kind: 'equipment', index }, value.current, value.target);
  };

  const renderTierInfo = (tier: number, equipType: string, isInvalid: boolean, onChange: (val: number) => void, isTarget = false) => {
    const equipId = getEquipmentId(equipType, tier);
    const iconBase64 = equipId && iconData?.Equipment?.[equipId];
    const colorClass = isInvalid
      ? 'text-red-600 dark:text-red-400'
      : isTarget
        ? 'text-blue-600 dark:text-blue-400'
        : tier > 0
          ? 'text-neutral-800 dark:text-neutral-200'
          : 'text-neutral-400 dark:text-neutral-500';

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
                {renderTierInfo(currentTier, equipType, isCurrentInvalid, (val) =>
                  handleSliderChange(index as 0 | 1 | 2, moveGrowthRange({ current: currentTier, target: targetTier }, 'current', val)),
                )}

                <span className={`text-[10px] px-1 ${hasWarning ? 'text-rose-300' : 'text-neutral-400 dark:text-neutral-500'}`}>➜</span>

                {renderTierInfo(
                  targetTier,
                  equipType,
                  isTargetInvalid,
                  (val) => handleSliderChange(index as 0 | 1 | 2, moveGrowthRange({ current: currentTier, target: targetTier }, 'target', val)),
                  true,
                )}
              </div>
            </div>

            {/* Slider */}
            <GrowthRangeSlider
              label={t(`common.${equipType}`, equipType)}
              currentLabel={tUi('current')}
              targetLabel={tUi('target')}
              min={0}
              max={MAX_TIER}
              value={{ current: currentTier, target: targetTier }}
              marks={Array.from({ length: MAX_TIER + 1 }, (_, tier) => ({ value: tier }))}
              invalid={{ current: isCurrentInvalid, target: isTargetInvalid }}
              onChange={(value) => handleSliderChange(index as 0 | 1 | 2, value)}
            />

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
