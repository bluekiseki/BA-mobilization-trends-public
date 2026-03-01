// // PotentialTab.tsx

// import React from 'react';
// import { useTranslation } from 'react-i18next';
// import type { GrowthPlan } from '~/store/planner/useGlobalStore';
// import type { Student } from '~/types/plannerData';

// interface PotentialTabProps {

//     plan: GrowthPlan;
//     handlePotentialChange: (type: 'current' | 'target', stat: 'hp' | 'atk' | 'heal', value: number) => void;
//     canEnablePotentialCurrent: boolean;
//     canEnablePotentialTarget: boolean;
// }

// export const PotentialTab = ({ plan, handlePotentialChange, canEnablePotentialCurrent, canEnablePotentialTarget }: PotentialTabProps) => {
//     const potentialStats = [
//         { key: 'hp', labelKey: 'common.hp' },
//         { key: 'atk', labelKey: 'common.atk' },
//         { key: 'heal', labelKey: 'common.heal' }
//     ];
//     const { t, i18n } = useTranslation("planner");

//     return (
//         <div className="space-y-3">
//             <h4 className={`font-semibold text-sm text-center ${!canEnablePotentialTarget ? 'text-gray-400 dark:text-gray-500' : ''}`}>
//                 {t('potentialTab.title')} {!canEnablePotentialTarget && t('potentialTab.unlockCondition')}
//             </h4>

//             <div className="space-y-2 text-sm">
//                 {/* Header */}
//                 <div className="flex items-center gap-2 mb-2 text-center font-semibold">
//                     <span className="w-16 shrink-0"></span>
//                     <h3 className="flex-1 text-gray-700 dark:text-gray-300">{t('common.current')}</h3>
//                     <span className="w-8 shrink-0"></span>
//                     <h3 className="flex-1 text-blue-600 dark:text-blue-300">{t('common.target')}</h3>
//                 </div>

//                 {potentialStats.map(stat => (
//                     <div key={`potential-row-${stat.key}`} className="flex items-center gap-2">
//                         <label className="w-16 shrink-0 font-semibold">{t(stat.labelKey)}:</label>

//                         {/* Enter current status */}
//                         <div className={`flex-1 ${!canEnablePotentialCurrent ? 'opacity-50' : ''}`}>
//                             <select
//                                 disabled={!canEnablePotentialCurrent}
//                                 value={plan.current.potential[stat.key as 'hp']}
//                                 onChange={e => handlePotentialChange('current', stat.key as 'hp', Number(e.target.value))}
//                                 className="w-full p-1 border rounded disabled:bg-gray-200 dark:disabled:bg-neutral-600 bg-white dark:bg-neutral-700 dark:border-neutral-600"
//                             >
//                                 {Array.from({ length: 26 }, (_, i) => i).map(level => (
//                                     <option key={level} value={level}>
//                                         {level === 0 ? '-' : t('common.levelPrefix', { level })}
//                                     </option>
//                                 ))}
//                             </select>
//                         </div>

//                         <span className="w-8 text-center text-gray-400 font-bold text-lg shrink-0">→</span>

//                         {/* Target Status */}
//                         <div className={`flex-1 ${!canEnablePotentialTarget ? 'opacity-50' : ''}`}>
//                             <select
//                                 disabled={!canEnablePotentialTarget}
//                                 value={plan.target.potential[stat.key as 'hp']}
//                                 onChange={e => handlePotentialChange('target', stat.key as 'hp', Number(e.target.value))}
//                                 className="w-full p-1 border rounded disabled:bg-gray-200 dark:disabled:bg-neutral-600 bg-white dark:bg-neutral-700 dark:border-neutral-600"
//                             >
//                                 {Array.from({ length: 26 }, (_, i) => i).map(level => {
//                                     if (level < plan.current.potential[stat.key as 'hp']) {
//                                         return null;
//                                     }
//                                     return (
//                                         <option key={level} value={level}>
//                                             {level === 0 ? '-' : t('common.levelPrefix', { level })}
//                                         </option>
//                                     );
//                                 })}
//                             </select>
//                         </div>
//                     </div>
//                 ))}
//             </div>
//         </div>
//     );
// };

// // app/components/planner/StudentGrowth/PotentialTab.tsx

// import { useTranslation } from 'react-i18next';
// import type { GrowthPlan } from '~/store/planner/useGlobalStore';
// import { CustomNumberInput } from '~/components/CustomInput';
// import { MinMaxControls } from './MinMaxControls';
// import { FiAlertCircle } from 'react-icons/fi';

// interface PotentialTabProps {
//   plan: GrowthPlan;
//   handleBatchUpdate: (field: string, value: any) => void;
//   isWarning?: boolean;
// }

// export const PotentialTab = ({ plan, handleBatchUpdate, isWarning }: PotentialTabProps) => {
//   const { t } = useTranslation('planner');

//   const stats = ['hp', 'atk', 'heal'] as const;
//   const MAX_POTENTIAL = 25;

//   const updatePotential = (type: 'current' | 'target', stat: (typeof stats)[number], value: number) => {
//     const newPotential = { ...plan[type].potential, [stat]: value };
//     handleBatchUpdate(`${type}.potential`, newPotential);
//   };

//   const statLabels = {
//     hp: t('common.hp'),
//     atk: t('common.atk'),
//     heal: t('common.heal'),
//   };

//   const currentInputClass =
//     'w-full p-1.5 text-sm border border-gray-200 rounded bg-gray-50 dark:bg-neutral-800 dark:border-neutral-600 text-center font-medium outline-none focus:ring-1 focus:ring-gray-300 transition-all';
//   const targetInputClass =
//     'w-full p-1.5 text-sm border border-blue-200 rounded bg-white text-blue-600 font-bold dark:bg-neutral-900 dark:border-blue-900/50 dark:text-blue-400 text-center outline-none focus:ring-1 focus:ring-blue-300 transition-all';

//   return (
//     <div className="flex flex-col">
//       <div className="divide-y divide-gray-100 dark:divide-neutral-800">
//         {stats.map((stat) => (
//           <div key={stat} className="py-4 first:pt-0 last:pb-0 grid grid-cols-[70px_1fr_1fr] gap-3 items-center group">
//             {/* 1. Label Column (Simple Text) */}
//             <div className="flex justify-center">
//               <span className="text-xs font-bold text-gray-500 dark:text-neutral-400 tracking-wide uppercase">{statLabels[stat]}</span>
//             </div>

//             {/* 2. Current Column */}
//             <div>
//               <MinMaxControls onMin={() => updatePotential('current', stat, 0)} onMax={() => updatePotential('current', stat, MAX_POTENTIAL)} />
//               <CustomNumberInput min={0} max={MAX_POTENTIAL} value={plan.current.potential[stat]} onChange={(val) => updatePotential('current', stat, Number(val))} className={currentInputClass} />
//             </div>

//             {/* 3. Target Column */}
//             <div>
//               <MinMaxControls isTarget onMin={() => updatePotential('target', stat, plan.current.potential[stat])} onMax={() => updatePotential('target', stat, MAX_POTENTIAL)} />
//               <CustomNumberInput
//                 min={plan.current.potential[stat]}
//                 max={MAX_POTENTIAL}
//                 value={plan.target.potential[stat]}
//                 onChange={(val) => updatePotential('target', stat, Number(val))}
//                 className={targetInputClass}
//               />
//             </div>
//           </div>
//         ))}
//       </div>

//       {}
//       {isWarning && (
//         <div className="mt-4 flex items-center justify-center gap-2 p-3 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 text-amber-600 dark:text-amber-500">
//           <FiAlertCircle className="shrink-0" />
//           <span className="text-xs font-medium">{t('potentialTab.lockedMessage')}</span>
//         </div>
//       )}
//     </div>
//   );
// };

import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle } from 'react-icons/fi';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { IconData } from '~/types/plannerData';

// --- Constants ---
export const WB_HP_ID = 2000;
export const WB_ATK_ID = 2001;
export const WB_HEAL_ID = 2002;

const MAX_POTENTIAL = 25;
const UNLOCK_LEVEL = 90;

// --- Component ---
interface PotentialTabProps {
  plan: GrowthPlan;
  handleBatchUpdate: (field: string, value: any) => void;
  iconData?: IconData;
}

export const PotentialTab = ({ plan, handleBatchUpdate, iconData }: PotentialTabProps) => {
  const { t } = useTranslation('planner');

  const stats = ['hp', 'atk', 'heal'] as const;
  const wbIds = { hp: WB_HP_ID, atk: WB_ATK_ID, heal: WB_HEAL_ID };

  // Fetch state information
  const currentLevel = plan.current.level ?? 1;
  const currentUw = plan.current.uw ?? 0;
  const targetLevel = plan.target.level ?? 1;
  const targetUw = plan.target.uw ?? 0;

  const handleSliderChange = (stat: (typeof stats)[number], value: number | number[]) => {
    if (Array.isArray(value)) {
      const [v1, v2] = value;
      const newCurrent = Math.min(v1, v2);
      const newTarget = Math.max(v1, v2);

      if (plan.current.potential[stat] !== newCurrent) {
        const newPotential = { ...plan.current.potential, [stat]: newCurrent };
        handleBatchUpdate('current.potential', newPotential);
      }

      if (plan.target.potential[stat] !== newTarget) {
        const newPotential = { ...plan.target.potential, [stat]: newTarget };
        handleBatchUpdate('target.potential', newPotential);
      }
    }
  };

  const statLabels = {
    hp: t('common.hp', 'HP'),
    atk: t('common.atk', 'ATK'),
    heal: t('common.heal', 'HEAL'),
  };

  // Unlock condition check function (Lv.90 or above OR unique weapon owned)
  const checkUnlocked = (level: number, uw: number) => level >= UNLOCK_LEVEL && uw > 0;

  return (
    <div className="flex flex-col gap-6 py-2 px-1">
      {stats.map((stat) => {
        const currentVal = plan.current.potential[stat];
        const targetVal = plan.target.potential[stat];
        const iconId = wbIds[stat];

        const isCurrentInvalid = currentVal > 0 && !checkUnlocked(currentLevel, currentUw);
        const isTargetInvalid = targetVal > 0 && !checkUnlocked(targetLevel, targetUw);
        const hasWarning = isCurrentInvalid || isTargetInvalid;

        const trackColor = hasWarning ? '#f43f5e' : '#9ca3af';
        const currentHandleBorder = isCurrentInvalid ? '#f43f5e' : 'var(--handle-border)';

        const targetHandleColor = isTargetInvalid ? '#f43f5e' : '#2563eb';

        return (
          <div
            key={stat}
            className={`
              flex flex-col gap-1
              [--rail-bg:#e5e7eb] dark:[--rail-bg:#374151]
              [--handle-bg:#ffffff] dark:[--handle-bg:#262626]
              [--handle-border:#9ca3af] dark:[--handle-border:#4b5563]
            `}
          >
            {/* Top Row: Label & Status */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {/* Icon */}
                {iconData?.Item?.[iconId] && <img src={`data:image/webp;base64,${iconData.Item[iconId]}`} alt={stat} className="w-8 h-8 object-contain" />}
                {/* Text Label */}
                <span className="font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">{statLabels[stat]}</span>
              </div>

              {/* Value Display Box */}
              <div
                className={`flex items-center gap-2 px-2 py-0.5 rounded transition-colors ${
                  hasWarning ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800/30' : 'bg-gray-50 dark:bg-neutral-800/50'
                }`}
              >
                <span className={`font-mono text-xs font-bold ${isCurrentInvalid ? 'text-rose-500' : 'text-gray-600 dark:text-gray-400'}`}>{currentVal}</span>

                <span className={`text-[10px] ${hasWarning ? 'text-rose-300' : 'text-gray-300'}`}>➜</span>

                <span className={`font-mono text-xs font-bold ${isTargetInvalid ? 'text-rose-500' : 'text-blue-600 dark:text-blue-400'}`}>{targetVal}</span>
              </div>
            </div>

            {/* Slider */}
            <div className="pt-1 px-0.5">
              <Slider
                range
                min={0}
                max={MAX_POTENTIAL}
                step={1}
                allowCross={true}
                pushable={false}
                value={[currentVal, targetVal]}
                onChange={(val) => handleSliderChange(stat, val)}
                // Styles: Apply CSS variables
                styles={{
                  track: { backgroundColor: trackColor, height: 4 },
                  rail: { backgroundColor: 'var(--rail-bg)', height: 4 },
                }}
                handleStyle={[
                  {
                    borderColor: currentHandleBorder,
                    backgroundColor: 'var(--handle-bg)', // Dark mode background color
                    opacity: 1,
                    height: 18,
                    width: 18,
                    marginTop: -7,
                    boxShadow: 'none',
                    borderWidth: 2,
                    zIndex: 10,
                  },
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
                <span>{t(isCurrentInvalid ? 'potentialTab.reqCurrent' : 'potentialTab.reqTarget')}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
