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

// app/components/planner/StudentGrowth/PotentialTab.tsx

import { useTranslation } from 'react-i18next';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import { CustomNumberInput } from '~/components/CustomInput';
import { MinMaxControls } from './MinMaxControls';
import { FiAlertCircle } from 'react-icons/fi';

interface PotentialTabProps {
  plan: GrowthPlan;
  handleBatchUpdate: (field: string, value: any) => void;
  isWarning?: boolean;
}

export const PotentialTab = ({ plan, handleBatchUpdate, isWarning }: PotentialTabProps) => {
  const { t } = useTranslation('planner');

  const stats = ['hp', 'atk', 'heal'] as const;
  const MAX_POTENTIAL = 25;

  const updatePotential = (type: 'current' | 'target', stat: (typeof stats)[number], value: number) => {
    const newPotential = { ...plan[type].potential, [stat]: value };
    handleBatchUpdate(`${type}.potential`, newPotential);
  };

  const statLabels = {
    hp: t('common.hp'),
    atk: t('common.atk'),
    heal: t('common.heal'),
  };

  const currentInputClass =
    'w-full p-1.5 text-sm border border-gray-200 rounded bg-gray-50 dark:bg-neutral-800 dark:border-neutral-600 text-center font-medium outline-none focus:ring-1 focus:ring-gray-300 transition-all';
  const targetInputClass =
    'w-full p-1.5 text-sm border border-blue-200 rounded bg-white text-blue-600 font-bold dark:bg-neutral-900 dark:border-blue-900/50 dark:text-blue-400 text-center outline-none focus:ring-1 focus:ring-blue-300 transition-all';

  return (
    <div className="flex flex-col">
      <div className="divide-y divide-gray-100 dark:divide-neutral-800">
        {stats.map((stat) => (
          <div key={stat} className="py-4 first:pt-0 last:pb-0 grid grid-cols-[70px_1fr_1fr] gap-3 items-center group">
            {/* 1. Label Column (Simple Text) */}
            <div className="flex justify-center">
              <span className="text-xs font-bold text-gray-500 dark:text-neutral-400 tracking-wide uppercase">{statLabels[stat]}</span>
            </div>

            {/* 2. Current Column */}
            <div>
              <MinMaxControls onMin={() => updatePotential('current', stat, 0)} onMax={() => updatePotential('current', stat, MAX_POTENTIAL)} />
              <CustomNumberInput min={0} max={MAX_POTENTIAL} value={plan.current.potential[stat]} onChange={(val) => updatePotential('current', stat, Number(val))} className={currentInputClass} />
            </div>

            {/* 3. Target Column */}
            <div>
              <MinMaxControls isTarget onMin={() => updatePotential('target', stat, plan.current.potential[stat])} onMax={() => updatePotential('target', stat, MAX_POTENTIAL)} />
              <CustomNumberInput
                min={plan.current.potential[stat]}
                max={MAX_POTENTIAL}
                value={plan.target.potential[stat]}
                onChange={(val) => updatePotential('target', stat, Number(val))}
                className={targetInputClass}
              />
            </div>
          </div>
        ))}
      </div>

      {}
      {isWarning && (
        <div className="mt-4 flex items-center justify-center gap-2 p-3 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 text-amber-600 dark:text-amber-500">
          <FiAlertCircle className="shrink-0" />
          <span className="text-xs font-medium">{t('potentialTab.lockedMessage')}</span>
        </div>
      )}
    </div>
  );
};
