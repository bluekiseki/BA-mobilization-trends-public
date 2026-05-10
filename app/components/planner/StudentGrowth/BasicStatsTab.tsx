// app/components/planner/StudentGrowth/BasicStatsTab.tsx

// import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
// import Slider from 'rc-slider';
// import 'rc-slider/assets/index.css';
// import { useTranslation } from 'react-i18next';
// import { FiCheck, FiStar, FiHeart, FiTrendingUp, FiAlertCircle } from 'react-icons/fi';
// import { StarRating } from '~/components/StarRatingProps';
// import type { GrowthPlan } from '~/store/planner/useGlobalStore';
// import type { Student } from '~/types/plannerData';
// import { CustomNumberInput } from '~/components/CustomInput';

// interface BasicStatsTabProps {
//   plan: GrowthPlan;
//   studentInfo: Student;
//   handlePlanChange: (field: string, value: string | number | boolean, isNumeric?: boolean) => void;
//   handleRankChange: (type: 'current' | 'target', value: string) => void;
//   rankOptions: { value: string; label: string }[];
//   handleBatchUpdate: (field: string, value: unknown) => void;
// }

// interface RenderRowProps {
//   label: string;
//   icon: React.ReactNode;
//   value: [number, number];
//   onChange: (val: number | number[]) => void;
//   min: number;
//   max: number;
//   marks?: Record<number, React.ReactNode>;
//   renderValue: (val: number, isOverLimit: boolean) => React.ReactNode;
//   checkLimit?: (val: number) => boolean;
//   warningMessage?: React.ReactNode;
//   disableInput?: boolean;
// }

// // --- Helper Logic ---
// const getAffectionLimit = (star: number, uw: number = 0): number => {
//   if (uw > 0 || star >= 5) return 100;
//   if (star === 4) return 30;
//   if (star === 3) return 20;
//   return 10;
// };

// const RenderRow = React.memo(({ label, icon, value, onChange, min, max, marks, renderValue, checkLimit, warningMessage, disableInput = false }: RenderRowProps) => {
//   const [localValue, setLocalValue] = useState<[number, number]>(value);
//   const [editingIdx, setEditingIdx] = useState<0 | 1 | null>(null);

//   // 1. Ref to track current input value (does not trigger re-render)
//   const tempInputRef = useRef<number | null>(null);

//   // Sync on external props change (only when not editing)
//   useEffect(() => {
//     if (editingIdx === null) {
//       setLocalValue(value);
//     }
//   }, [value, editingIdx]);

//   const isStartOver = checkLimit ? checkLimit(localValue[0]) : false;
//   const isEndOver = checkLimit ? checkLimit(localValue[1]) : false;
//   const isWarning = isStartOver || isEndOver;

//   const trackColor = isWarning ? '#f43f5e' : '#9ca3af';
//   const handleActiveColor = isWarning ? '#e11d48' : '#2563eb';
//   const boxBorderColor = isWarning
//     ? 'bg-rose-50 border-rose-100 dark:bg-rose-900/20 dark:border-rose-800'
//     : 'bg-gray-50 border-transparent group-hover:border-gray-200 dark:bg-neutral-800/50 dark:group-hover:border-neutral-700';
//   const textColor = isWarning ? 'text-rose-600' : 'text-gray-600 dark:text-gray-400';
//   const activeTextColor = isWarning ? 'text-rose-600' : 'text-blue-600 dark:text-blue-400';

//   // --- Handlers ---

//   // A. Start input mode: Initialize Ref with current value
//   const handleStartEdit = (idx: 0 | 1) => {
//     if (disableInput) return;
//     tempInputRef.current = localValue[idx]; // Set initial value
//     setEditingIdx(idx);
//   };

//   // B. While typing: Update Ref only, without updating UI (slider)
//   const handleTyping = (val: number | null) => {
//     tempInputRef.current = val;
//   };

//   // C. Input Complete (Blur): Retrieve value from Ref and perform final update
//   const commitInput = () => {
//     if (editingIdx === null) return;

//     const finalVal = tempInputRef.current;

//     // If there is no valid value (empty, etc.), cancel or maintain the existing value
//     if (finalVal === null || isNaN(finalVal)) {
//       setEditingIdx(null);
//       return;
//     }

//     const nextVal: [number, number] = [...localValue];
//     nextVal[editingIdx] = finalVal;

//     // 1. Update local state (slider movement)
//     setLocalValue(nextVal);
//     // 2. Update parent state (data storage)
//     onChange(nextVal);
//     // 3. Exit edit mode
//     setEditingIdx(null);
//   };

//   // D. Slider Change: Reflect slider changes immediately
//   const handleSliderChange = (val: number | number[]) => {
//     const newVal = val as [number, number];
//     setLocalValue(newVal);
//   };

//   // --- ValueDisplay Component ---
//   const ValueDisplay = ({ idx, colorClass, isOver }: { idx: 0 | 1; colorClass: string; isOver: boolean }) => {
//     const isEditing = editingIdx === idx;

//     if (!isEditing || disableInput) {
//       return (
//         <div
//           onClick={() => handleStartEdit(idx)}
//           className={`
//             flex items-center gap-1 font-mono text-xs font-bold px-1 py-0.5 rounded cursor-pointer select-none transition-colors
//             ${disableInput ? '' : 'hover:bg-black/5 dark:hover:bg-white/10'}
//             ${colorClass}
//           `}
//         >
//           {renderValue(localValue[idx], isOver)}
//         </div>
//       );
//     }

//     return (
//       <CustomNumberInput
//         autoFocus
//         // Initial value is localValue, but during typing, the internal state of CustomNumberInput controls the display
//         // Since props.value does not change (localValue is not updated in handleTyping),
//         // the useEffect of CustomNumberInput does not trigger, maintaining the input value.
//         value={localValue[idx]}
//         min={min}
//         max={max}
//         onChange={handleTyping} // Update only the Ref during typing
//         onBlur={commitInput} // Apply final changes on focus out
//         className={`w-12 border border-blue-400 dark:border-blue-600 rounded scale-75 origin-center ${colorClass}`}
//       />
//     );
//   };

//   return (
//     <div
//       className={`
//       flex flex-col gap-1 pb-2 group
//       [--rail-bg:#e5e7eb] dark:[--rail-bg:#374151]
//       [--handle-bg:#ffffff] dark:[--handle-bg:#262626]
//       [--handle-border:#9ca3af] dark:[--handle-border:#4b5563]
//     `}
//     >
//       {/* Label Header */}
//       <div className="flex items-center justify-between text-sm mb-1">
//         <div className={`flex items-center gap-2 ${isWarning ? 'text-rose-600' : 'text-gray-700 dark:text-gray-200'}`}>
//           {icon}
//           <span className="font-bold">{label}</span>
//         </div>
//         <div className={`flex items-center gap-0.5 px-1 py-0.5 rounded border transition-colors ${boxBorderColor}`}>
//           <ValueDisplay idx={0} colorClass={textColor} isOver={isStartOver} />
//           <span className="text-gray-300 text-[10px] pb-0.5">➜</span>
//           <ValueDisplay idx={1} colorClass={activeTextColor} isOver={isEndOver} />
//         </div>
//       </div>

//       {/* Slider */}
//       <div className={`px-1 ${marks ? 'pb-6' : 'pb-0'}`}>
//         <Slider
//           range
//           min={min}
//           max={max}
//           step={1}
//           marks={marks}
//           allowCross={true}
//           pushable={false}
//           value={localValue}
//           onChange={handleSliderChange}
//           onChangeComplete={onChange}
//           styles={{
//             // 2. Apply CSS variables
//             track: { backgroundColor: trackColor, height: 4 },
//             rail: { backgroundColor: 'var(--rail-bg)', height: 4 }, // Use variables
//           }}
//           dotStyle={{
//             borderColor: 'var(--rail-bg)', // Use the same color as the Rail
//             backgroundColor: 'var(--handle-bg)',
//           }}
//           activeDotStyle={{
//             borderColor: trackColor,
//             backgroundColor: trackColor,
//           }}
//           handleStyle={[
//             // Left handle (Inactive/Base style)
//             {
//               borderColor: 'var(--handle-border)', // Use variables
//               backgroundColor: 'var(--handle-bg)', // Use variables
//               opacity: 1,
//               height: 18,
//               width: 18,
//               marginTop: -7,
//               boxShadow: 'none',
//               borderWidth: 2,
//               zIndex: 10,
//             },
//             // Right handle (Active style)
//             {
//               borderColor: handleActiveColor,
//               backgroundColor: handleActiveColor,
//               opacity: 1,
//               height: 18,
//               width: 18,
//               marginTop: -7,
//               boxShadow: 'none',
//               borderWidth: 2,
//               zIndex: 11,
//             },
//           ]}
//         />
//       </div>

//       {isWarning && warningMessage && (
//         <div className="flex items-center gap-2 mt-2 p-2 rounded bg-rose-50 border border-rose-100 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300 animate-in fade-in slide-in-from-top-1">
//           <FiAlertCircle className="w-4 h-4 shrink-0" />
//           <span className="text-xs font-medium leading-tight">{warningMessage}</span>
//         </div>
//       )}
//     </div>
//   );
// });
// RenderRow.displayName = 'RenderRow';

// // --- Main Component ---

// export const BasicStatsTab = ({ plan, studentInfo, handlePlanChange, handleRankChange, rankOptions, handleBatchUpdate }: BasicStatsTabProps) => {
//   const { t } = useTranslation('planner');

//   const getRankIndex = useCallback(
//     (type: 'current' | 'target') => {
//       const state = plan[type];
//       const key = state.uw > 0 ? `uw_${state.uw}` : `star_${state.star}`;
//       return rankOptions.findIndex((opt) => opt.value === key);
//     },
//     [plan, rankOptions],
//   );

//   const currentRankIdx = getRankIndex('current');
//   const targetRankIdx = getRankIndex('target');

//   const onRankSliderChange = useCallback(
//     (val: number | number[]) => {
//       if (Array.isArray(val)) {
//         const [v1, v2] = val;
//         const cIdx = Math.min(v1, v2);
//         const tIdx = Math.max(v1, v2);
//         if (currentRankIdx !== cIdx && rankOptions[cIdx]) handleRankChange('current', rankOptions[cIdx].value);
//         if (targetRankIdx !== tIdx && rankOptions[tIdx]) handleRankChange('target', rankOptions[tIdx].value);
//       }
//     },
//     [currentRankIdx, targetRankIdx, rankOptions, handleRankChange],
//   );

//   const rankMarks = useMemo(() => {
//     const marks: Record<number, React.ReactNode> = {};
//     rankOptions.forEach((_, index) => {
//       marks[index] = (
//         <div className="scale-67 origin-top pt-1 flex justify-center">
//           <StarRating n={index < 5 ? index + 1 : index + 2} />
//         </div>
//       );
//     });
//     return marks;
//   }, [rankOptions]);

//   // Affection Limits
//   const currentAffectionLimit = getAffectionLimit(plan.current.star, plan.current.uw);
//   const targetAffectionLimit = getAffectionLimit(plan.target.star, plan.target.uw);
//   const isCurrentExceeded = plan.current.affection > currentAffectionLimit;
//   const isTargetExceeded = plan.target.affection > targetAffectionLimit;

//   let warningMsg: string | null = null;
//   if (isCurrentExceeded) warningMsg = t('basicStatsTab.affectionWarning', { limit: currentAffectionLimit });
//   else if (isTargetExceeded) warningMsg = t('basicStatsTab.affectionWarning', { limit: targetAffectionLimit });

//   // --- Render Rows ---

//   const levelRow = useMemo(
//     () => (
//       <RenderRow
//         label={t('basicStatsTab.level')}
//         icon={<FiTrendingUp className="w-4 h-4" />}
//         min={1}
//         max={90}
//         value={[plan.current.level, plan.target.level]}
//         onChange={(val) => {
//           if (Array.isArray(val)) {
//             handlePlanChange('current.level', Math.min(val[0], val[1]), true);
//             handlePlanChange('target.level', Math.max(val[0], val[1]), true);
//           }
//         }}
//         renderValue={(val) => `Lv.${val}`}
//       />
//     ),
//     [plan.current.level, plan.target.level, t, handlePlanChange],
//   );

//   const rankRow = useMemo(
//     () => (
//       <RenderRow
//         label={t('basicStatsTab.rank')}
//         icon={<FiStar className="w-4 h-4" />}
//         min={0}
//         max={rankOptions.length - 1}
//         value={[currentRankIdx, targetRankIdx]}
//         onChange={onRankSliderChange}
//         marks={rankMarks}
//         disableInput={true}
//         renderValue={(val) => <StarRating n={val < 5 ? val + 1 : val + 2} />}
//       />
//     ),
//     [currentRankIdx, targetRankIdx, rankOptions.length, onRankSliderChange, rankMarks],
//   );

//   const affectionRow = useMemo(
//     () => (
//       <RenderRow
//         label={t('basicStatsTab.affectionRank')}
//         icon={<FiHeart className="w-4 h-4" />}
//         min={1}
//         max={100}
//         value={[plan.current.affection, plan.target.affection]}
//         warningMessage={warningMsg}
//         checkLimit={(val) => {
//           if (val === plan.current.affection && isCurrentExceeded) return true;
//           if (val === plan.target.affection && isTargetExceeded) return true;
//           return false;
//         }}
//         renderValue={(val, isOver) => (
//           <div className={`flex items-center gap-1 ${isOver ? 'text-rose-600' : ''}`}>
//             <FiHeart className={`w-3 h-3 ${isOver ? 'fill-rose-600' : 'fill-rose-400 text-rose-400'}`} />
//             <span>{val}</span>
//             {isOver && <FiAlertCircle className="w-3 h-3 ml-0.5" />}
//           </div>
//         )}
//         onChange={(val) => {
//           if (Array.isArray(val)) {
//             handlePlanChange('current.affection', Math.min(val[0], val[1]), true);
//             handlePlanChange('target.affection', Math.max(val[0], val[1]), true);
//           }
//         }}
//       />
//     ),
//     [plan.current.affection, plan.target.affection, isCurrentExceeded, isTargetExceeded, warningMsg, t, handlePlanChange],
//   );

//   return (
//     <div className="flex flex-col gap-6 py-2">
//       {levelRow}
//       {rankRow}
//       {affectionRow}
//       <EligmaToggle plan={plan} handlePlanChange={handlePlanChange} t={t} />
//     </div>
//   );
// };

// const EligmaToggle = React.memo(({ plan, handlePlanChange, t }: { plan: GrowthPlan; handlePlanChange: any; t: any }) => (
//   <div
//     onClick={() => handlePlanChange('useEligmaForStar', !plan.useEligmaForStar)}
//     className={`
//       mt-2 group relative flex flex-col sm:flex-row gap-4 p-3 rounded-lg border transition-all cursor-pointer select-none
//       ${
//         plan.useEligmaForStar
//           ? 'bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-800'
//           : 'bg-white border-gray-100 hover:border-gray-200 dark:bg-neutral-800/50 dark:border-neutral-700'
//       }
//     `}
//   >
//     <div className="flex items-center gap-3 shrink-0 h-8">
//       <div
//         className={`
//           w-4 h-4 rounded flex items-center justify-center border transition-colors
//           ${plan.useEligmaForStar ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-gray-300 text-transparent dark:bg-neutral-700 dark:border-neutral-600'}
//         `}
//       >
//         <FiCheck size={10} strokeWidth={4} />
//       </div>
//       <span className={`text-xs font-bold ${plan.useEligmaForStar ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>{t('basicStatsTab.useEligmaForRankUp')}</span>
//     </div>

//     {plan.useEligmaForStar && (
//       <div className="flex flex-1 gap-3 animate-in fade-in slide-in-from-left-2 items-center" onClick={(e) => e.stopPropagation()}>
//         <div className="w-px h-8 bg-blue-200 dark:bg-blue-800 hidden sm:block"></div>
//         <div className="flex-1">
//           <label className="block text-[10px] font-medium text-blue-600/70 dark:text-blue-300/70 mb-1 truncate">{t('basicStatsTab.currentElephPrice')}</label>
//           <select
//             value={plan.eligmaInfo?.price || 1}
//             onChange={(e) => handlePlanChange('eligmaInfo.price', e.target.value, true)}
//             className="w-full bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 rounded py-1 px-2 text-xs text-blue-900 dark:text-blue-100 focus:ring-1 focus:ring-blue-400 outline-none"
//           >
//             {[1, 2, 3, 4, 5].map((p) => (
//               <option key={p} value={p}>
//                 {p}
//               </option>
//             ))}
//           </select>
//         </div>
//         <div className="flex-1">
//           <label className="block text-[10px] font-medium text-blue-600/70 dark:text-blue-300/70 mb-1 truncate">{t('basicStatsTab.purchasableEleph')}</label>
//           <input
//             type="number"
//             value={plan.eligmaInfo?.stock || 0}
//             onChange={(e) => handlePlanChange('eligmaInfo.stock', e.target.value, true)}
//             className="w-full bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 rounded py-1 px-2 text-xs text-blue-900 dark:text-blue-100 focus:ring-1 focus:ring-blue-400 outline-none"
//           />
//         </div>
//       </div>
//     )}
//   </div>
// ));
// EligmaToggle.displayName = 'EligmaToggle';

// app/components/planner/StudentGrowth/BasicStatsTab.tsx

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiStar, FiHeart, FiTrendingUp, FiAlertCircle, FiEdit3 } from 'react-icons/fi';
import { StarRating } from '~/components/StarRatingProps';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventData, IconData, Student } from '~/types/plannerData';
import { CustomNumberInput } from '~/components/CustomInput';
import { calcGearNeeds, calcLevelNeeds, calcRankNeeds, calcUWLevelNeeds } from '~/utils/calculatedGrowthNeeds';
import { uwMaxLevelMap } from './const';
import { InlineCostHint } from './InlineCostHint';

// --- Helpers ---
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
        <span className="font-bold font-mono">
          {prefix}
          {value}
        </span>
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
      <span className="border-b border-dashed border-gray-400/50 group-hover:border-transparent transition-colors font-bold">
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
  handleRankChange: (type: 'current' | 'target', value: string) => void;
  rankOptions: { value: string; label: string }[];
  handleBatchUpdate: (field: string, value: unknown) => void;
  iconData?: IconData;
  eventData?: EventData;
}

export const BasicStatsTab = ({ plan, studentInfo, handlePlanChange, handleRankChange, rankOptions, handleBatchUpdate, iconData, eventData }: BasicStatsTabProps) => {
  const { t } = useTranslation('planner');

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

  const onRankSliderChange = useCallback(
    (val: number | number[]) => {
      if (Array.isArray(val)) {
        const [v1, v2] = val;
        const cIdx = Math.min(v1, v2);
        const tIdx = Math.max(v1, v2);
        if (currentRankIdx !== cIdx && rankOptions[cIdx]) handleRankChange('current', rankOptions[cIdx].value);
        if (targetRankIdx !== tIdx && rankOptions[tIdx]) handleRankChange('target', rankOptions[tIdx].value);
      }
    },
    [currentRankIdx, targetRankIdx, rankOptions, handleRankChange],
  );

  const rankMarks = useMemo(() => {
    const marks: Record<number, React.ReactNode> = {};
    rankOptions.forEach((_, index) => {
      marks[index] = (
        <div className="scale-[0.6] origin-top pt-1 flex justify-center">
          <StarRating n={index < 5 ? index + 1 : index + 2} />
        </div>
      );
    });
    return marks;
  }, [rankOptions]);

  // Limits
  const currentAffectionLimit = getAffectionLimit(plan.current.star, plan.current.uw);
  const targetAffectionLimit = getAffectionLimit(plan.target.star, plan.target.uw);
  const isCurrentExceeded = plan.current.affection > currentAffectionLimit;
  const isTargetExceeded = plan.target.affection > targetAffectionLimit;
  const hasAffectionWarning = isCurrentExceeded || isTargetExceeded;

  let warningMsg: string | null = null;
  if (isCurrentExceeded) warningMsg = t('basicStatsTab.affectionWarning', { limit: currentAffectionLimit });
  else if (isTargetExceeded) warningMsg = t('basicStatsTab.affectionWarning', { limit: targetAffectionLimit });

  const getSliderStyles = (hasWarning: boolean) => ({
    track: { backgroundColor: hasWarning ? '#f43f5e' : '#3b82f6', height: 5 },
    rail: { backgroundColor: 'var(--tw-colors-gray-200, #e5e7eb)', height: 5 },
  });

  const getDotStyle = () => ({
    borderColor: 'var(--tw-colors-gray-300, #d1d5db)',
    backgroundColor: 'var(--tw-colors-white, #ffffff)',
    borderWidth: 2,
    width: 8,
    height: 8,
    bottom: -1.5,
  });

  const getActiveDotStyle = (hasWarning: boolean) => ({
    borderColor: hasWarning ? '#f43f5e' : '#3b82f6',
    backgroundColor: hasWarning ? '#f43f5e' : '#3b82f6',
    width: 8,
    height: 8,
    bottom: -1.5,
  });

  const getHandleStyle = (isCurrentInvalid: boolean, isTargetInvalid: boolean) => [
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
  ];

  return (
    <div className="flex flex-col gap-8 py-4 px-2 w-full font-sans text-gray-700 dark:text-gray-200">
      {/* 3 Grid Layout for Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-8">
        {/* 1. Level */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {iconData ? (
                <img src={`data:image/webp;base64,${iconData.Item[13]}`} className="w-8 h-8 object-cover" loading="lazy" />
              ) : (
                <FiTrendingUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              )}
              <span className="font-bold text-sm text-gray-800 dark:text-gray-100 uppercase">{t('basicStatsTab.level')}</span>
            </div>
            <div className="flex items-center gap-1">
              <EditableLevelDisplay
                value={plan.current.level}
                max={90}
                min={1}
                prefix="Lv."
                onChange={(val) => handlePlanChange('current.level', val, true)}
                textClassName="font-mono text-sm text-gray-500 dark:text-gray-400"
              />
              <span className="text-[10px] px-1 text-gray-400 dark:text-neutral-500">➜</span>
              <EditableLevelDisplay
                value={plan.target.level}
                max={90}
                min={1}
                prefix="Lv."
                onChange={(val) => handlePlanChange('target.level', val, true)}
                textClassName="font-mono text-sm text-blue-600 dark:text-blue-400"
              />
            </div>
          </div>
          <div className="px-1 mt-1">
            <Slider
              range
              min={1}
              max={90}
              step={1}
              pushable={false}
              allowCross={true}
              value={[plan.current.level, plan.target.level]}
              onChange={(val) => {
                if (Array.isArray(val)) {
                  handlePlanChange('current.level', Math.min(val[0], val[1]), true);
                  handlePlanChange('target.level', Math.max(val[0], val[1]), true);
                }
              }}
              styles={getSliderStyles(false)}
              handleStyle={getHandleStyle(false, false)}
              className="dark:[&_.rc-slider-rail]:bg-neutral-700! dark:[&_.rc-slider-handle-1]:bg-neutral-800!"
            />
          </div>
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
              <span className="font-bold text-sm text-gray-800 dark:text-gray-100 uppercase">{t('basicStatsTab.rank')}</span>
            </div>
            <div className="flex items-center gap-1 px-1 py-0.5">
              <div className="scale-75 origin-right">
                <StarRating n={currentRankIdx < 5 ? currentRankIdx + 1 : currentRankIdx + 2} />
              </div>
              <span className="text-[10px] px-1 text-gray-400 dark:text-neutral-500">➜</span>
              <div className="scale-75 origin-left">
                <StarRating n={targetRankIdx < 5 ? targetRankIdx + 1 : targetRankIdx + 2} />
              </div>
            </div>
          </div>
          <div className="px-1 mt-1 pb-5">
            <Slider
              range
              min={0}
              max={rankOptions.length - 1}
              step={1}
              marks={rankMarks}
              pushable={false}
              allowCross={true}
              value={[currentRankIdx, targetRankIdx]}
              onChange={onRankSliderChange}
              styles={getSliderStyles(false)}
              dotStyle={getDotStyle()}
              activeDotStyle={getActiveDotStyle(false)}
              handleStyle={getHandleStyle(false, false)}
              className="
                dark:[&_.rc-slider-rail]:bg-neutral-700!
                dark:[&_.rc-slider-dot]:border-neutral-500! dark:[&_.rc-slider-dot]:bg-neutral-800!
                dark:[&_.rc-slider-dot-active]:border-blue-500! dark:[&_.rc-slider-dot-active]:bg-blue-500!
                dark:[&_.rc-slider-handle-1]:bg-neutral-800!
              "
            />
          </div>
          <InlineCostHint needs={calcRankNeeds(plan.current.star, plan.target.star, plan.current.uw, plan.target.uw, plan.studentId ?? undefined)} iconData={iconData} eventData={eventData} />
        </div>

        {/* 3. Affection */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiHeart className={`w-4 h-4 ${hasAffectionWarning ? 'text-rose-500' : 'text-rose-400'}`} />
              <span className="font-bold text-sm text-gray-800 dark:text-gray-100 uppercase">{t('basicStatsTab.affectionRank')}</span>
            </div>
            <div className="flex items-center gap-1">
              <EditableLevelDisplay
                value={plan.current.affection}
                max={100}
                min={1}
                onChange={(val) => handlePlanChange('current.affection', val, true)}
                textClassName={`font-mono text-sm ${isCurrentExceeded ? 'text-rose-500' : 'text-gray-500 dark:text-gray-400'}`}
                icon={isCurrentExceeded && <FiAlertCircle className="w-3 h-3 text-rose-500 inline-block" />}
              />
              <span className={`text-[10px] px-1 ${hasAffectionWarning ? 'text-rose-300' : 'text-gray-400 dark:text-neutral-500'}`}>➜</span>
              <EditableLevelDisplay
                value={plan.target.affection}
                max={100}
                min={1}
                onChange={(val) => handlePlanChange('target.affection', val, true)}
                textClassName={`font-mono text-sm ${isTargetExceeded ? 'text-rose-500' : 'text-blue-600 dark:text-blue-400'}`}
                icon={isTargetExceeded && <FiAlertCircle className="w-3 h-3 text-rose-500 inline-block" />}
              />
            </div>
          </div>
          <div className="px-1 mt-1">
            <Slider
              range
              min={1}
              max={100}
              step={1}
              pushable={false}
              allowCross={true}
              value={[plan.current.affection, plan.target.affection]}
              onChange={(val) => {
                if (Array.isArray(val)) {
                  handlePlanChange('current.affection', Math.min(val[0], val[1]), true);
                  handlePlanChange('target.affection', Math.max(val[0], val[1]), true);
                }
              }}
              styles={getSliderStyles(hasAffectionWarning)}
              handleStyle={getHandleStyle(isCurrentExceeded, isTargetExceeded)}
              className="dark:[&_.rc-slider-rail]:bg-neutral-700! dark:[&_.rc-slider-handle-1]:bg-neutral-800!"
            />
          </div>
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
                    <span className="font-bold text-sm text-gray-800 dark:text-gray-100 uppercase">{t('basicStatsTab.uwLevel', 'UW Level')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <EditableLevelDisplay
                      value={plan.current.uwLevel}
                      max={maxLevel}
                      min={1}
                      prefix="Lv."
                      disabled={currentUwDisabled}
                      onChange={(val) => handlePlanChange('current.uwLevel', val, true)}
                      textClassName="font-mono text-sm text-gray-500 dark:text-gray-400"
                    />
                    <span className="text-[10px] px-1 text-gray-400 dark:text-neutral-500">➜</span>
                    <EditableLevelDisplay
                      value={plan.target.uwLevel}
                      max={maxLevel}
                      min={1}
                      prefix="Lv."
                      disabled={targetUwDisabled}
                      onChange={(val) => handlePlanChange('target.uwLevel', val, true)}
                      textClassName="font-mono text-sm text-blue-600 dark:text-blue-400"
                    />
                  </div>
                </div>
                <div className="px-1 mt-1">
                  <Slider
                    range
                    min={1}
                    max={maxLevel}
                    step={1}
                    pushable={false}
                    allowCross={true}
                    value={[plan.current.uwLevel, plan.target.uwLevel]}
                    onChange={(val) => {
                      if (Array.isArray(val)) {
                        const [v0, v1] = val;
                        if (!currentUwDisabled) handlePlanChange('current.uwLevel', Math.min(v0, v1), true);
                        if (!targetUwDisabled) handlePlanChange('target.uwLevel', Math.max(v0, v1), true);
                      }
                    }}
                    styles={getSliderStyles(false)}
                    handleStyle={getHandleStyle(false, false)}
                    className="dark:[&_.rc-slider-rail]:bg-neutral-700! dark:[&_.rc-slider-handle-1]:bg-neutral-800!"
                  />
                </div>
                <InlineCostHint needs={calcUWLevelNeeds(plan.current.uwLevel, plan.target.uwLevel)} iconData={iconData} eventData={eventData} />
              </div>
            );
          })()}
      </div>

      {/* Bond Gear — only for students with gear */}
      {studentInfo.Gear &&
        'TierUpMaterial' in studentInfo.Gear &&
        (() => {
          const TIERS = [0, 1, 2] as const;
          const tierLabel = (v: number) => (v === 0 ? t('basicStatsTab.gearNone', 'None') : `T${v}`);
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

          const TierBtn = ({ val, selected, onClick }: { val: number; selected: boolean; onClick: () => void }) => (
            <button
              onClick={onClick}
              className={`px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                selected
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-transparent border-gray-300 dark:border-neutral-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500'
              }`}
            >
              {tierLabel(val)}
            </button>
          );

          return (
            <div className="pt-4 border-t border-dashed border-gray-200 dark:border-neutral-800">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  <span className="font-bold text-sm text-gray-800 dark:text-gray-100 uppercase">{t('basicStatsTab.bondGear', 'Bond Gear')}</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    {/* Current */}
                    <div className="flex items-center gap-1">
                      {TIERS.filter(showCurrentGearBtn).map((v) => (
                        <TierBtn key={v} val={v} selected={currentGear === v} onClick={() => handlePlanChange('current.gear', v, true)} />
                      ))}
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-neutral-500">➜</span>
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
      <div className="pt-4 border-t border-dashed border-gray-200 dark:border-neutral-800 mt-2">
        <EligmaToggle plan={plan} handlePlanChange={handlePlanChange} t={t} />
      </div>
    </div>
  );
};

// --- EligmaToggle Component ---
// (Changed to flat design by minimizing background color and padding)
const EligmaToggle = React.memo(({ plan, handlePlanChange, t }: { plan: GrowthPlan; handlePlanChange: any; t: any }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
    {/* Checkbox row */}
    <div onClick={() => handlePlanChange('useEligmaForStar', !plan.useEligmaForStar)} className="flex items-center gap-2 cursor-pointer select-none group w-fit">
      <div
        className={`
          w-4 h-4 rounded flex items-center justify-center border transition-colors
          ${plan.useEligmaForStar ? 'bg-blue-500 border-blue-500 text-white' : 'bg-transparent border-gray-400 group-hover:border-blue-400 text-transparent dark:border-neutral-500'}
        `}
      >
        <FiCheck size={12} strokeWidth={3} />
      </div>
      <span
        className={`text-sm font-bold transition-colors ${plan.useEligmaForStar ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100'}`}
      >
        {t('basicStatsTab.useEligmaForRankUp')}
      </span>
    </div>

    {/* Options row (Only visible when checked) */}
    {plan.useEligmaForStar && (
      <div className="flex gap-4 items-center animate-in fade-in slide-in-from-left-2 ml-6 sm:ml-0 border-l-2 border-blue-100 dark:border-blue-900 pl-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('basicStatsTab.currentElephPrice')}</label>
          <select
            value={plan.eligmaInfo?.price || 1}
            onChange={(e) => handlePlanChange('eligmaInfo.price', e.target.value, true)}
            className="bg-gray-50 dark:bg-neutral-800 border-none rounded py-1 px-2 text-xs font-mono font-bold text-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-blue-400 outline-none cursor-pointer"
          >
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('basicStatsTab.purchasableEleph')}</label>
          <input
            type="number"
            value={plan.eligmaInfo?.stock || 0}
            onChange={(e) => handlePlanChange('eligmaInfo.stock', e.target.value, true)}
            className="w-16 bg-gray-50 dark:bg-neutral-800 border-none rounded py-1 px-2 text-xs font-mono font-bold text-center text-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-blue-400 outline-none"
          />
        </div>
      </div>
    )}
  </div>
));
EligmaToggle.displayName = 'EligmaToggle';
