import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle } from 'react-icons/fi';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Student, IconData, EventData } from '~/types/plannerData';
import { equipmentBlueprintId } from '~/data/growthData';
import { MAX_TIER } from './const';

// --- Constants & Helpers ---
const UNLOCK_LEVELS = [1, 10, 20];

const getEquipmentId = (equipType: string, tier: number): string | undefined => {
  if (tier <= 0 || !equipmentBlueprintId[equipType as keyof typeof equipmentBlueprintId]) return undefined;

  const ids = equipmentBlueprintId[equipType as keyof typeof equipmentBlueprintId];
  if (tier === 1) return ids[0].toString();

  const blueprintId = ids[tier - 1];
  return blueprintId ? (blueprintId % 100000).toString() : undefined;
};

// --- Component ---
interface EquipmentTabProps {
  plan: GrowthPlan;
  studentInfo: Student | null;
  handleBatchUpdate: (field: string, value: any) => void;
  iconData?: IconData;
  eventData?: EventData;
}

export const EquipmentTab = ({ plan, studentInfo, handleBatchUpdate, iconData }: EquipmentTabProps) => {
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

  const renderTierInfo = (tier: number, equipType: string, isInvalid: boolean) => {
    if (tier === 0) {
      return <span className="text-xs font-mono text-gray-400">N/A</span>;
    }

    const equipId = getEquipmentId(equipType, tier);
    const iconBase64 = equipId && iconData?.Equipment?.[equipId];

    return (
      <div className={`flex items-center gap-1 ${isInvalid ? 'text-rose-500' : 'text-gray-600 dark:text-gray-300'}`}>
        {iconBase64 && <img src={`data:image/webp;base64,${iconBase64}`} className="w-8 h-8 object-contain" alt={`T${tier}`} loading="lazy" style={{ opacity: isInvalid ? 0.7 : 1 }} />}
        <span className="text-xs font-bold font-mono">T{tier}</span>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-6 py-2 px-1">
      {plan.current.equipment.map((currentTier, index) => {
        const targetTier = plan.target.equipment[index];
        const equipType = studentInfo.Equipment[index];
        const unlockLevel = UNLOCK_LEVELS[index] || 1;

        // Validation
        const isCurrentInvalid = currentTier > 0 && currentLevel < unlockLevel;
        const isTargetInvalid = targetTier > 0 && targetLevel < unlockLevel;
        const hasWarning = isCurrentInvalid || isTargetInvalid;

        // Styling variables
        const trackColor = hasWarning ? '#f43f5e' : '#9ca3af'; // Warning or Gray
        const targetHandleColor = isTargetInvalid ? '#f43f5e' : '#2563eb'; // Warning or Blue

        // Current Handle Border (Warning or Default Gray variable)
        const currentHandleBorder = isCurrentInvalid ? '#f43f5e' : 'var(--handle-border)';

        return (
          <div
            key={index}
            className={`
              flex flex-col gap-1
              [--rail-bg:#e5e7eb] dark:[--rail-bg:#374151]
              [--handle-bg:#ffffff] dark:[--handle-bg:#262626]
              [--handle-border:#9ca3af] dark:[--handle-border:#4b5563]
            `}
          >
            {/* Top Row */}
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-gray-700 dark:text-gray-200">{t(`common.${equipType}`, equipType)}</span>
              <div
                className={`flex items-center gap-2 px-2 py-0.5 rounded transition-colors ${
                  hasWarning ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800/30' : 'bg-gray-50 dark:bg-neutral-800/50'
                }`}
              >
                {renderTierInfo(currentTier, equipType, isCurrentInvalid)}
                <span className={`text-[10px] ${hasWarning ? 'text-rose-300' : 'text-gray-300'}`}>➜</span>
                {renderTierInfo(targetTier, equipType, isTargetInvalid)}
              </div>
            </div>

            {/* Slider */}
            <div className="pt-1 px-0.5 pb-2">
              {' '}
              <Slider
                range
                min={0}
                max={MAX_TIER}
                step={1}
                dots={true} // Enable dot display
                allowCross={true}
                pushable={false}
                value={[currentTier, targetTier]}
                onChange={(val) => handleSliderChange(index, val)}
                styles={{
                  track: { backgroundColor: trackColor, height: 4 },
                  rail: { backgroundColor: 'var(--rail-bg)', height: 4 }, // Apply dark mode variables
                }}
                // Inactive dot style (matches rail color)
                dotStyle={{
                  borderColor: 'var(--rail-bg)',
                  backgroundColor: 'var(--handle-bg)',
                  width: 8,
                  height: 8,
                  bottom: -2,
                }}
                // Active dot style (matches track color)
                activeDotStyle={{
                  borderColor: trackColor,
                  backgroundColor: trackColor,
                  width: 8,
                  height: 8,
                  bottom: -2,
                }}
                handleStyle={[
                  // 1. Current Handle (Left)
                  {
                    borderColor: currentHandleBorder,
                    backgroundColor: 'var(--handle-bg)', // Apply dark mode background color
                    opacity: 1,
                    height: 18,
                    width: 18,
                    marginTop: -7,
                    boxShadow: 'none',
                    borderWidth: 2,
                    zIndex: 10,
                  },
                  // 2. Target Handle (Right)
                  {
                    borderColor: targetHandleColor,
                    backgroundColor: targetHandleColor,
                    opacity: 1,
                    height: 18,
                    width: 18,
                    marginTop: -7,
                    boxShadow: 'none',
                    borderWidth: 2,
                    zIndex: 11,
                  },
                ]}
              />
            </div>

            {/* Warning Message */}
            {hasWarning && (
              <div className="flex items-center gap-1 mt-1 text-rose-500 text-[10px] font-medium animate-fadeIn">
                <FiAlertCircle className="w-3 h-3" />
                <span>{t(isCurrentInvalid ? 'equipmentTab.reqCurrent' : 'equipmentTab.reqTarget', { level: unlockLevel })}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
