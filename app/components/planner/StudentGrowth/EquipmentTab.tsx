// // app/components/planner/StudentGrowth/EquipmentTab.tsx
// import { TIER_OPTIONS, TIER_TO_LEVEL } from './const';
// import type { GrowthPlan } from '~/store/planner/useGlobalStore';
// import type { Student } from '~/types/plannerData';
// import { useTranslation } from 'react-i18next';
// import { Link } from 'react-router';
// import { localeLink } from '~/utils/localeLink';
// import { FaExternalLinkAlt } from 'react-icons/fa';
// import type { Locale } from '~/utils/i18n/config';

// export const EquipmentTab = ({ plan, studentInfo, handleEquipmentChange }: {
//     plan: GrowthPlan;
//     studentInfo: Student;
//     handleEquipmentChange: (type: "current" | "target", slotIndex: number, value: number) => void

// }) => {
//     const { t, i18n } = useTranslation("planner");
//     // Get locale for localeLink
//     const locale = i18n.language as Locale;

//     if (!studentInfo) return <div className="text-center p-4">Please choose the student first.</div>;

//     return (
//         // Changed space-y-2 -> space-y-4
//         <div className="space-y-4 text-sm">

//             {/* Link to Equipment Farming Planner */}
//             <div className="flex justify-end">
//                 <Link
//                     to={localeLink(locale, "/planner/equipment")}
//                     className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
//                 >
//                     {t('equipment.goToPlanner')}
//                     <FaExternalLinkAlt size={12} />
//                 </Link>
//             </div>

//             <div className="space-y-4 text-sm">
//                 {studentInfo.Equipment.map((equipmentName, i) => {
//                     const isEnabledCurrent = plan.current.level >= (i === 1 ? 10 : i === 2 ? 20 : 1);
//                     const isEnabledTarget = plan.target.level >= (i === 1 ? 10 : i === 2 ? 20 : 1);
//                     const currentTier = plan.current.equipment[i] || 0;
//                     const targetTier = plan.target.equipment[i] || 0;

//                     return (
//                         <div key={`equipment-row-${i}`} className=" ">

//                             <div className="flex justify-center items-center gap-2 sm:gap-4">

//                                 <div className="w-20 font-bold text-sm mr-2 text-gray-800 dark:text-neutral-200">
//                                     {t(`common.${equipmentName}` as any)}:
//                                 </div>

//                                 <div className={`flex-1 space-y-1 ${!isEnabledCurrent ? 'opacity-50' : ''}`}>
//                                     <label className="font-semibold text-gray-600 dark:text-gray-300">{t('common.current')}</label>
//                                     <select
//                                         value={currentTier}
//                                         onChange={e => handleEquipmentChange('current', i, Number(e.target.value))}
//                                         disabled={!isEnabledCurrent}
//                                         className={`w-full p-1.5 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600 focus:ring-2 focus:ring-blue-500 transition ${!isEnabledCurrent ? 'cursor-not-allowed' : ''}`}
//                                     >
//                                         <option value={0}>{t('common.tierNone')}</option>
//                                         {TIER_OPTIONS.map(tier =>
//                                             <option key={tier} value={tier}>{t('common.tierPrefix', { tier })}</option>
//                                         )}
//                                     </select>
//                                     <div className="text-right text-xs text-gray-500 dark:text-gray-400 h-4">
//                                         {currentTier > 0 && t('common.levelDisplay', { level: TIER_TO_LEVEL[currentTier] })}
//                                     </div>
//                                 </div>

//                                 <div className="pb-0 shrink-0">
//                                     <span className="text-center text-gray-400 font-bold text-xl">→</span>
//                                 </div>

//                                 <div className={`flex-1 space-y-1 ${!isEnabledTarget ? 'opacity-50' : ''}`}>
//                                     <label className="font-semibold text-blue-600 dark:text-blue-400">{t('common.target')}</label>
//                                     <select
//                                         value={targetTier}
//                                         onChange={e => handleEquipmentChange('target', i, Number(e.target.value))}
//                                         disabled={!isEnabledTarget}
//                                         className={`w-full p-1.5 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600 focus:ring-2 focus:ring-blue-500 transition ${!isEnabledTarget ? 'cursor-not-allowed' : ''}`}
//                                     >
//                                         <option value={0}>{t('common.tierNone')}</option>
//                                         {TIER_OPTIONS.map(tier => {
//                                             if (tier < currentTier) return null;
//                                             return <option key={tier} value={tier}>{t('common.tierPrefix', { tier })}</option>;
//                                         })}
//                                     </select>
//                                     <div className="text-right text-xs text-blue-600 dark:text-blue-400 font-semibold h-4">
//                                         {targetTier > 0 && t('common.levelDisplay', { level: TIER_TO_LEVEL[targetTier] })}
//                                     </div>
//                                 </div>
//                             </div>
//                         </div>
//                     );
//                 })}
//             </div>

//         </div>
//     );
// };
// app/components/planner/StudentGrowth/EquipmentTab.tsx

import { useTranslation } from 'react-i18next';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Student } from '~/types/plannerData';
import { MinMaxControls } from './MinMaxControls';
import { MAX_TIER } from './const';

interface EquipmentTabProps {
  plan: GrowthPlan;
  studentInfo: Student | null;
  handleBatchUpdate: (field: string, value: any) => void;
}

export const EquipmentTab = ({ plan, studentInfo, handleBatchUpdate }: EquipmentTabProps) => {
  const { t } = useTranslation('planner');

  if (!studentInfo) return null;

  const updateTier = (type: 'current' | 'target', index: number, value: number) => {
    const newEquip = [...plan[type].equipment];
    newEquip[index] = value;
    handleBatchUpdate(`${type}.equipment`, newEquip);
  };

  const currentInputClass =
    'w-full p-1.5 text-sm border border-gray-200 rounded bg-gray-50 dark:bg-neutral-800 dark:border-neutral-600 text-center appearance-none font-medium outline-none focus:ring-1 focus:ring-gray-300 transition-all cursor-pointer';
  const targetInputClass =
    'w-full p-1.5 text-sm border border-blue-200 rounded bg-white text-blue-600 font-bold dark:bg-neutral-900 dark:border-blue-900/50 dark:text-blue-400 text-center appearance-none outline-none focus:ring-1 focus:ring-blue-300 transition-all cursor-pointer';

  return (
    <div className="flex flex-col divide-y divide-gray-100 dark:divide-neutral-800">
      {plan.current.equipment.map((currentTier, index) => {
        const targetTier = plan.target.equipment[index];
        const equipType = studentInfo.Equipment[index]; // e.g. "Hat", "Gloves"

        return (
          <div key={index} className="py-4 first:pt-0 last:pb-0 grid grid-cols-[70px_1fr_1fr] gap-3 items-center group">
            {/* 1. Label Column */}
            <div className="flex flex-col items-center justify-center">
              <div className="text-xs font-bold text-gray-500 dark:text-neutral-400 tracking-wide truncate w-full text-center" title={t(`common.${equipType}`, equipType)}>
                {t(`common.${equipType}`, equipType)}
              </div>
              {}
            </div>

            {/* 2. Current Column */}
            <div>
              <MinMaxControls label={undefined} onMin={() => updateTier('current', index, 0)} onMax={() => updateTier('current', index, MAX_TIER)} />
              <select value={currentTier} onChange={(e) => updateTier('current', index, Number(e.target.value))} className={currentInputClass}>
                <option value={0}>N/A</option>
                {Array.from({ length: MAX_TIER }, (_, i) => i + 1).map((tier) => (
                  <option key={tier} value={tier}>
                    T{tier}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Target Column */}
            <div>
              <MinMaxControls label={undefined} isTarget onMin={() => updateTier('target', index, currentTier)} onMax={() => updateTier('target', index, MAX_TIER)} />
              <select value={targetTier} onChange={(e) => updateTier('target', index, Number(e.target.value))} className={targetInputClass}>
                <option value={0} disabled>
                  N/A
                </option>
                {Array.from({ length: MAX_TIER }, (_, i) => i + 1).map((tier) => (
                  <option key={tier} value={tier} disabled={tier < currentTier}>
                    T{tier} {tier === MAX_TIER ? '(MAX)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
};
