// // app/components/planner/StudentGrowth/BasicStatsTab.tsx
// import { useTranslation } from 'react-i18next';
// import { CustomNumberInput } from '~/components/CustomInput';
// import type { GrowthPlan } from '~/store/planner/useGlobalStore';
// import type { Student } from '~/types/plannerData';

// export const BasicStatsTab = ({ plan, studentInfo, handlePlanChange, handleRankChange, rankOptions }: {
//     plan: GrowthPlan;
//     studentInfo: Student;
//     handlePlanChange: (field: string, value: any, isNumeric?: boolean) => void,
//     handleRankChange: (type: "current" | "target", value: string) => void,
//     rankOptions: {
//         value: string;
//         label: string;
//     }[]

// }) => {
//     const baseStarGrade = studentInfo?.StarGrade || 1;
//     const currentRankValue = plan.current.uw > 0 ? `uw_${plan.current.uw}` : `star_${plan.current.star}`;
//     const targetRankValue = plan.target.uw > 0 ? `uw_${plan.target.uw}` : `star_${plan.target.star}`;
//     const { t } = useTranslation("planner");

//     return (
//         <>
//             <div className="space-y-2 text-sm">

//                 <div className="flex items-center gap-2 mb-2 text-center font-semibold">
//                     <span className="w-24 shrink-0"></span>
//                     <h3 className="flex-1 text-gray-700 dark:text-neutral-300">{t('common.current')}</h3>
//                     <span className="w-8 shrink-0"></span>
//                     <h3 className="flex-1 text-blue-600 dark:text-blue-400">{t('common.target')}</h3>
//                 </div>

//                 <div className="flex items-center gap-2">
//                     <label className="w-24 shrink-0 font-semibold">{t('basicStatsTab.level')}</label>
//                     <div className="flex-1">
//                         <CustomNumberInput min={1} max={90} value={plan.current.level} onChange={e => handlePlanChange('current.level', e, true)} className="w-full p-1 border rounded dark:bg-neutral-700 dark:border-neutral-600" />
//                     </div>
//                     <span className="w-8 text-center text-gray-400 font-bold text-lg shrink-0">→</span>
//                     <div className="flex-1">
//                         <CustomNumberInput min={plan.current.level} max={90} value={plan.target.level} onChange={e => handlePlanChange('target.level', e, true)} className="w-full p-1 border rounded dark:bg-neutral-700 dark:border-neutral-600" />
//                     </div>
//                 </div>

//                 <div className="flex items-center gap-2">
//                     <label className="w-24 shrink-0 font-semibold">{t('basicStatsTab.rank')}</label>
//                     <div className="flex-1">
//                         <select value={currentRankValue} onChange={e => handleRankChange('current', e.target.value)} className="w-full p-1.5 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600">
//                             {rankOptions.map(opt => {
//                                 const [type, level] = opt.value.split('_');
//                                 if (type === 'star' && Number(level) < baseStarGrade) return null;
//                                 return <option key={opt.value} value={opt.value}>{opt.label}</option>;
//                             })}
//                         </select>
//                     </div>
//                     <span className="w-8 text-center text-gray-400 font-bold text-lg shrink-0">→</span>
//                     <div className="flex-1">
//                         <select value={targetRankValue} onChange={e => handleRankChange('target', e.target.value)} className="w-full p-1.5 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600">
//                             {rankOptions.map(opt => {
//                                 const [type, level] = opt.value.split('_');
//                                 if (type === 'star' && Number(level) < baseStarGrade) return null;
//                                 const optRank = opt.value.startsWith('uw') ? 5 + Number(level) : Number(level);
//                                 const currentRank = currentRankValue.startsWith('uw') ? 5 + Number(currentRankValue.split('_')[1]) : Number(currentRankValue.split('_')[1]);
//                                 if (optRank < currentRank) return null;
//                                 return <option key={opt.value} value={opt.value}>{opt.label}</option>;
//                             })}
//                         </select>
//                     </div>
//                 </div>

//                 <div className="flex items-center gap-2">
//                     <label className="w-24 shrink-0 font-semibold">{t('basicStatsTab.affectionRank')}</label>
//                     <div className="flex-1">
//                         <CustomNumberInput min={1} max={plan.current.uw ? 100 : (plan.current.star < 3 ? 10 : 20)} value={plan.current.affection} onChange={e => handlePlanChange('current.affection', e, true)} className="w-full p-1 border rounded dark:bg-neutral-700 dark:border-neutral-600" />
//                     </div>
//                     <span className="w-8 text-center text-gray-400 font-bold text-lg shrink-0">→</span>
//                     <div className="flex-1">
//                         <CustomNumberInput min={plan.current.affection} max={plan.target.uw ? 100 : (plan.target.star < 3 ? 10 : 20)} value={plan.target.affection} onChange={e => handlePlanChange('target.affection', e, true)} className="w-full p-1 border rounded dark:bg-neutral-700 dark:border-neutral-600" />
//                     </div>
//                 </div>
//             </div>
//             <div className="mt-4 border-t dark:border-neutral-700 pt-3">
//                 <h4 className="font-semibold text-sm mb-2">{t('basicStatsTab.growthOptionsTitle')}</h4>
//                 <div className="p-3 rounded-md bg-white dark:bg-neutral-800 border dark:border-neutral-700">

//                     <div className="flex items-center gap-4">
//                         <label className="font-semibold shrink-0">{t('basicStatsTab.ownedEleph')}</label>
//                         <div className="flex-1 max-w-[120px] ml-auto">
//                             <CustomNumberInput
//                                 min={0}
//                                 max={99999}
//                                 value={plan.current.eleph}
//                                 onChange={e => handlePlanChange('current.eleph', e, true)}
//                                 className="w-full p-1 border rounded dark:bg-neutral-700 dark:border-neutral-600 text-center"
//                             />
//                         </div>
//                     </div>

//                     <label className="flex items-center gap-2 cursor-pointer">
//                         <input
//                             type="checkbox"
//                             className="h-4 w-4 rounded"
//                             checked={plan.useEligmaForStar}
//                             onChange={e => handlePlanChange('useEligmaForStar', e.target.checked)}
//                         />
//                         <span>{t('basicStatsTab.useEligmaForRankUp')}</span>
//                     </label>

//                     {plan.useEligmaForStar && (
//                         <div className="grid grid-cols-2 gap-4 mt-3 pl-6 text-xs">
//                             <div>
//                                 <label className="font-semibold mb-1 block">{t('basicStatsTab.currentElephPrice')}</label>
//                                 <select
//                                     value={plan.eligmaInfo?.price || 1}
//                                     onChange={e => handlePlanChange('eligmaInfo.price', e.target.value, true)}
//                                     className="w-full p-1.5 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600"
//                                 >
//                                     {[1, 2, 3, 4, 5].map(p => <option key={p} value={p}>{p}</option>)}
//                                 </select>
//                             </div>
//                             <div>
//                                 <label className="font-semibold mb-1 block">{t('basicStatsTab.purchasableEleph')}</label>
//                                 <input
//                                     type="number"
//                                     value={plan.eligmaInfo?.stock || 0}
//                                     onChange={e => handlePlanChange('eligmaInfo.stock', e.target.value, true)}
//                                     className="w-full p-1.5 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600"
//                                 />
//                             </div>
//                         </div>
//                     )}
//                 </div>
//             </div>
//         </>
//     );
// };

// app/components/planner/StudentGrowth/BasicStatsTab.tsx

// import { useTranslation } from 'react-i18next';
// import { CustomNumberInput } from '~/components/CustomInput';
// import { MinMaxControls } from './MinMaxControls';
// import type { GrowthPlan } from '~/store/planner/useGlobalStore';
// import type { Student } from '~/types/plannerData';
// import { FiCheck } from 'react-icons/fi';

// interface BasicStatsTabProps {
//   plan: GrowthPlan;
//   studentInfo: Student;
//   handlePlanChange: (field: string, value: string | number | boolean, isNumeric?: boolean) => void;
//   handleRankChange: (type: 'current' | 'target', value: string) => void;
//   rankOptions: { value: string; label: string }[];
//   handleBatchUpdate: (field: string, value: unknown) => void;
// }

// export const BasicStatsTab = ({
//   plan,
//   studentInfo,
//   handlePlanChange,
//   handleRankChange,
//   rankOptions,
//   // eslint-disable-next-line @typescript-eslint/no-unused-vars
//   handleBatchUpdate,
// }: BasicStatsTabProps) => {
//   const { t } = useTranslation('planner');
//   const baseStar = studentInfo?.StarGrade || 1;

//   // Helpers
//   const setLevel = (target: 'current' | 'target', val: number) => handlePlanChange(`${target}.level`, val, true);
//   const setAffection = (target: 'current' | 'target', val: number) => handlePlanChange(`${target}.affection`, val, true);

//   const currentInputClass =
//     'w-full p-1.5 text-sm border border-gray-200 rounded bg-white dark:bg-neutral-800 dark:border-neutral-600 text-center appearance-none font-medium outline-none focus:ring-1 focus:ring-gray-300 transition-all';
//   const targetInputClass =
//     'w-full p-1.5 text-sm border border-blue-200 rounded bg-white text-blue-600 font-bold dark:bg-neutral-800 dark:border-blue-900/50 dark:text-blue-400 text-center appearance-none outline-none focus:ring-1 focus:ring-blue-300 transition-all';

//   // Grid Row Wrapper
//   const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
//     <div className="py-4 first:pt-0 grid grid-cols-[70px_1fr_1fr] gap-3 items-center">
//       <div className="text-xs font-bold text-gray-500 dark:text-neutral-400 tracking-wide truncate text-center">{label}</div>
//       {children}
//     </div>
//   );

//   return (
//     <div className="flex flex-col">
//       {/* Main Stats Rows */}
//       <div className="divide-y divide-gray-100 dark:divide-neutral-800 mb-6">
//         {/* --- Level Row --- */}
//         <Row label={t('basicStatsTab.level')}>
//           {/* Current */}
//           <div>
//             <MinMaxControls onMin={() => setLevel('current', 1)} onMax={() => setLevel('current', 90)} />
//             <CustomNumberInput min={1} max={90} value={plan.current.level} onChange={(v) => setLevel('current', Number(v))} className={currentInputClass} />
//           </div>
//           {/* Target */}
//           <div>
//             <MinMaxControls isTarget onMin={() => setLevel('target', plan.current.level)} onMax={() => setLevel('target', 90)} />
//             <CustomNumberInput min={plan.current.level} max={90} value={plan.target.level} onChange={(v) => setLevel('target', Number(v))} className={targetInputClass} />
//           </div>
//         </Row>

//         {/* --- Rank Row --- */}
//         <Row label={t('basicStatsTab.rank')}>
//           {/* Current */}
//           <div>
//             <MinMaxControls onMin={() => handleRankChange('current', `star_${baseStar}`)} onMax={() => handleRankChange('current', 'uw_3')} />
//             <select value={plan.current.uw > 0 ? `uw_${plan.current.uw}` : `star_${plan.current.star}`} onChange={(e) => handleRankChange('current', e.target.value)} className={currentInputClass}>
//               {rankOptions.map((opt) => (
//                 <option key={opt.value} value={opt.value}>
//                   {opt.label}
//                 </option>
//               ))}
//             </select>
//           </div>
//           {/* Target */}
//           <div>
//             <MinMaxControls
//               isTarget
//               onMin={() => handleRankChange('target', plan.current.uw > 0 ? `uw_${plan.current.uw}` : `star_${plan.current.star}`)}
//               onMax={() => handleRankChange('target', 'uw_3')}
//             />
//             <select value={plan.target.uw > 0 ? `uw_${plan.target.uw}` : `star_${plan.target.star}`} onChange={(e) => handleRankChange('target', e.target.value)} className={targetInputClass}>
//               {rankOptions.map((opt) => (
//                 <option key={opt.value} value={opt.value}>
//                   {opt.label}
//                 </option>
//               ))}
//             </select>
//           </div>
//         </Row>

//         {/* --- Affection Row --- */}
//         <Row label={t('basicStatsTab.affectionRank')}>
//           {/* Current */}
//           <div>
//             <MinMaxControls onMin={() => setAffection('current', 1)} onMax={() => setAffection('current', 100)} />
//             <CustomNumberInput min={1} max={100} value={plan.current.affection} onChange={(v) => setAffection('current', Number(v))} className={currentInputClass} />
//           </div>
//           {/* Target */}
//           <div>
//             <MinMaxControls isTarget onMin={() => setAffection('target', plan.current.affection)} onMax={() => setAffection('target', 100)} />
//             <CustomNumberInput min={1} max={100} value={plan.target.affection} onChange={(v) => setAffection('target', Number(v))} className={targetInputClass} />
//           </div>
//         </Row>
//       </div>

//       {/* Eligma Options (Flat Panel) */}
//       <div
//         onClick={() => handlePlanChange('useEligmaForStar', !plan.useEligmaForStar)}
//         className={`
//               group relative flex flex-col sm:flex-row gap-4 p-3 rounded-lg border transition-all cursor-pointer select-none
//               ${
//                 plan.useEligmaForStar
//                   ? 'bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-800'
//                   : 'bg-white border-gray-100 hover:border-gray-200 dark:bg-neutral-800/50 dark:border-neutral-700'
//               }
//           `}
//       >
//         {/* Checkbox Area */}
//         <div className="flex items-center gap-3 shrink-0 h-8">
//           <div
//             className={`
//               w-4 h-4 rounded flex items-center justify-center border transition-colors
//               ${plan.useEligmaForStar ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-gray-300 text-transparent dark:bg-neutral-700 dark:border-neutral-600'}
//           `}
//           >
//             <FiCheck size={10} strokeWidth={4} />
//           </div>
//           <span className={`text-xs font-bold ${plan.useEligmaForStar ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>{t('basicStatsTab.useEligmaForRankUp')}</span>
//         </div>

//         {/* Expanded Options */}
//         {plan.useEligmaForStar && (
//           <div className="flex flex-1 gap-3 animate-in fade-in slide-in-from-left-2 items-center" onClick={(e) => e.stopPropagation()}>
//             <div className="w-px h-8 bg-blue-200 dark:bg-blue-800 hidden sm:block"></div>

//             {/* Eleph Price */}
//             <div className="flex-1">
//               <label className="block text-[10px] font-medium text-blue-600/70 dark:text-blue-300/70 mb-1 truncate">{t('basicStatsTab.currentElephPrice')}</label>
//               <select
//                 value={plan.eligmaInfo?.price || 1}
//                 onChange={(e) => handlePlanChange('eligmaInfo.price', e.target.value, true)}
//                 className="w-full bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 rounded py-1 px-2 text-xs text-blue-900 dark:text-blue-100 focus:ring-1 focus:ring-blue-400 outline-none"
//               >
//                 {[1, 2, 3, 4, 5].map((p) => (
//                   <option key={p} value={p}>
//                     {p}
//                   </option>
//                 ))}
//               </select>
//             </div>

//             {/* Eleph Stock */}
//             <div className="flex-1">
//               <label className="block text-[10px] font-medium text-blue-600/70 dark:text-blue-300/70 mb-1 truncate">{t('basicStatsTab.purchasableEleph')}</label>
//               <input
//                 type="number"
//                 value={plan.eligmaInfo?.stock || 0}
//                 onChange={(e) => handlePlanChange('eligmaInfo.stock', e.target.value, true)}
//                 className="w-full bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 rounded py-1 px-2 text-xs text-blue-900 dark:text-blue-100 focus:ring-1 focus:ring-blue-400 outline-none"
//               />
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiStar, FiHeart, FiTrendingUp, FiAlertCircle } from 'react-icons/fi';
import { StarRating } from '~/components/StarRatingProps';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Student } from '~/types/plannerData';
import { CustomNumberInput } from '~/components/CustomInput';

interface BasicStatsTabProps {
  plan: GrowthPlan;
  studentInfo: Student;
  handlePlanChange: (field: string, value: string | number | boolean, isNumeric?: boolean) => void;
  handleRankChange: (type: 'current' | 'target', value: string) => void;
  rankOptions: { value: string; label: string }[];
  handleBatchUpdate: (field: string, value: unknown) => void;
}

interface RenderRowProps {
  label: string;
  icon: React.ReactNode;
  value: [number, number];
  onChange: (val: number | number[]) => void;
  min: number;
  max: number;
  marks?: Record<number, React.ReactNode>;
  renderValue: (val: number, isOverLimit: boolean) => React.ReactNode;
  checkLimit?: (val: number) => boolean;
  warningMessage?: React.ReactNode;
  disableInput?: boolean;
}

// --- Helper Logic ---
const getAffectionLimit = (star: number, uw: number = 0): number => {
  if (uw > 0 || star >= 5) return 100;
  if (star === 4) return 30;
  if (star === 3) return 20;
  return 10;
};

const RenderRow = React.memo(({ label, icon, value, onChange, min, max, marks, renderValue, checkLimit, warningMessage, disableInput = false }: RenderRowProps) => {
  const [localValue, setLocalValue] = useState<[number, number]>(value);
  const [editingIdx, setEditingIdx] = useState<0 | 1 | null>(null);

  // 1. Ref to track current input value (does not trigger re-render)
  const tempInputRef = useRef<number | null>(null);

  // Sync on external props change (only when not editing)
  useEffect(() => {
    if (editingIdx === null) {
      setLocalValue(value);
    }
  }, [value, editingIdx]);

  const isStartOver = checkLimit ? checkLimit(localValue[0]) : false;
  const isEndOver = checkLimit ? checkLimit(localValue[1]) : false;
  const isWarning = isStartOver || isEndOver;

  const trackColor = isWarning ? '#f43f5e' : '#9ca3af';
  const handleActiveColor = isWarning ? '#e11d48' : '#2563eb';
  const boxBorderColor = isWarning
    ? 'bg-rose-50 border-rose-100 dark:bg-rose-900/20 dark:border-rose-800'
    : 'bg-gray-50 border-transparent group-hover:border-gray-200 dark:bg-neutral-800/50 dark:group-hover:border-neutral-700';
  const textColor = isWarning ? 'text-rose-600' : 'text-gray-600 dark:text-gray-400';
  const activeTextColor = isWarning ? 'text-rose-600' : 'text-blue-600 dark:text-blue-400';

  // --- Handlers ---

  // A. Start input mode: Initialize Ref with current value
  const handleStartEdit = (idx: 0 | 1) => {
    if (disableInput) return;
    tempInputRef.current = localValue[idx]; // Set initial value
    setEditingIdx(idx);
  };

  // B. While typing: Update Ref only, without updating UI (slider)
  const handleTyping = (val: number | null) => {
    tempInputRef.current = val;
  };

  // C. Input Complete (Blur): Retrieve value from Ref and perform final update
  const commitInput = () => {
    if (editingIdx === null) return;

    const finalVal = tempInputRef.current;

    // If there is no valid value (empty, etc.), cancel or maintain the existing value
    if (finalVal === null || isNaN(finalVal)) {
      setEditingIdx(null);
      return;
    }

    const nextVal: [number, number] = [...localValue];
    nextVal[editingIdx] = finalVal;

    // 1. Update local state (slider movement)
    setLocalValue(nextVal);
    // 2. Update parent state (data storage)
    onChange(nextVal);
    // 3. Exit edit mode
    setEditingIdx(null);
  };

  // D. Slider Change: Reflect slider changes immediately
  const handleSliderChange = (val: number | number[]) => {
    const newVal = val as [number, number];
    setLocalValue(newVal);
  };

  // --- ValueDisplay Component ---
  const ValueDisplay = ({ idx, colorClass, isOver }: { idx: 0 | 1; colorClass: string; isOver: boolean }) => {
    const isEditing = editingIdx === idx;

    if (!isEditing || disableInput) {
      return (
        <div
          onClick={() => handleStartEdit(idx)}
          className={`
            flex items-center gap-1 font-mono text-xs font-bold px-1 py-0.5 rounded cursor-pointer select-none transition-colors
            ${disableInput ? '' : 'hover:bg-black/5 dark:hover:bg-white/10'} 
            ${colorClass}
          `}
        >
          {renderValue(localValue[idx], isOver)}
        </div>
      );
    }

    return (
      <CustomNumberInput
        autoFocus
        // Initial value is localValue, but during typing, the internal state of CustomNumberInput controls the display
        // Since props.value does not change (localValue is not updated in handleTyping),
        // the useEffect of CustomNumberInput does not trigger, maintaining the input value.
        value={localValue[idx]}
        min={min}
        max={max}
        onChange={handleTyping} // Update only the Ref during typing
        onBlur={commitInput} // Apply final changes on focus out
        className={`w-12 border border-blue-400 dark:border-blue-600 rounded scale-75 origin-center ${colorClass}`}
      />
    );
  };

  return (
    <div
      className={`
      flex flex-col gap-1 pb-2 group
      [--rail-bg:#e5e7eb] dark:[--rail-bg:#374151]
      [--handle-bg:#ffffff] dark:[--handle-bg:#262626]
      [--handle-border:#9ca3af] dark:[--handle-border:#4b5563]
    `}
    >
      {/* Label Header */}
      <div className="flex items-center justify-between text-sm mb-1">
        <div className={`flex items-center gap-2 ${isWarning ? 'text-rose-600' : 'text-gray-700 dark:text-gray-200'}`}>
          {icon}
          <span className="font-bold">{label}</span>
        </div>
        <div className={`flex items-center gap-0.5 px-1 py-0.5 rounded border transition-colors ${boxBorderColor}`}>
          <ValueDisplay idx={0} colorClass={textColor} isOver={isStartOver} />
          <span className="text-gray-300 text-[10px] pb-0.5">➜</span>
          <ValueDisplay idx={1} colorClass={activeTextColor} isOver={isEndOver} />
        </div>
      </div>

      {/* Slider */}
      <div className={`px-1 ${marks ? 'pb-6' : 'pb-0'}`}>
        <Slider
          range
          min={min}
          max={max}
          step={1}
          marks={marks}
          allowCross={true}
          pushable={false}
          value={localValue}
          onChange={handleSliderChange}
          onChangeComplete={onChange}
          styles={{
            // 2. Apply CSS variables
            track: { backgroundColor: trackColor, height: 4 },
            rail: { backgroundColor: 'var(--rail-bg)', height: 4 }, // Use variables
          }}
          dotStyle={{
            borderColor: 'var(--rail-bg)', // Use the same color as the Rail
            backgroundColor: 'var(--handle-bg)',
          }}
          activeDotStyle={{
            borderColor: trackColor,
            backgroundColor: trackColor,
          }}
          handleStyle={[
            // Left handle (Inactive/Base style)
            {
              borderColor: 'var(--handle-border)', // Use variables
              backgroundColor: 'var(--handle-bg)', // Use variables
              opacity: 1,
              height: 18,
              width: 18,
              marginTop: -7,
              boxShadow: 'none',
              borderWidth: 2,
              zIndex: 10,
            },
            // Right handle (Active style)
            {
              borderColor: handleActiveColor,
              backgroundColor: handleActiveColor,
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

      {isWarning && warningMessage && (
        <div className="flex items-center gap-2 mt-2 p-2 rounded bg-rose-50 border border-rose-100 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300 animate-in fade-in slide-in-from-top-1">
          <FiAlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-xs font-medium leading-tight">{warningMessage}</span>
        </div>
      )}
    </div>
  );
});
RenderRow.displayName = 'RenderRow';

// --- Main Component ---

export const BasicStatsTab = ({ plan, studentInfo, handlePlanChange, handleRankChange, rankOptions, handleBatchUpdate }: BasicStatsTabProps) => {
  const { t } = useTranslation('planner');

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
        <div className="scale-67 origin-top pt-1 flex justify-center">
          <StarRating n={index < 5 ? index + 1 : index + 2} />
        </div>
      );
    });
    return marks;
  }, [rankOptions]);

  // Affection Limits
  const currentAffectionLimit = getAffectionLimit(plan.current.star, plan.current.uw);
  const targetAffectionLimit = getAffectionLimit(plan.target.star, plan.target.uw);
  const isCurrentExceeded = plan.current.affection > currentAffectionLimit;
  const isTargetExceeded = plan.target.affection > targetAffectionLimit;

  let warningMsg: string | null = null;
  if (isCurrentExceeded) warningMsg = t('basicStatsTab.affectionWarning', { limit: currentAffectionLimit });
  else if (isTargetExceeded) warningMsg = t('basicStatsTab.affectionWarning', { limit: targetAffectionLimit });

  // --- Render Rows ---

  const levelRow = useMemo(
    () => (
      <RenderRow
        label={t('basicStatsTab.level')}
        icon={<FiTrendingUp className="w-4 h-4" />}
        min={1}
        max={90}
        value={[plan.current.level, plan.target.level]}
        onChange={(val) => {
          if (Array.isArray(val)) {
            handlePlanChange('current.level', Math.min(val[0], val[1]), true);
            handlePlanChange('target.level', Math.max(val[0], val[1]), true);
          }
        }}
        renderValue={(val) => `Lv.${val}`}
      />
    ),
    [plan.current.level, plan.target.level, t, handlePlanChange],
  );

  const rankRow = useMemo(
    () => (
      <RenderRow
        label={t('basicStatsTab.rank')}
        icon={<FiStar className="w-4 h-4" />}
        min={0}
        max={rankOptions.length - 1}
        value={[currentRankIdx, targetRankIdx]}
        onChange={onRankSliderChange}
        marks={rankMarks}
        disableInput={true}
        renderValue={(val) => <StarRating n={val < 5 ? val + 1 : val + 2} />}
      />
    ),
    [currentRankIdx, targetRankIdx, rankOptions.length, onRankSliderChange, rankMarks],
  );

  const affectionRow = useMemo(
    () => (
      <RenderRow
        label={t('basicStatsTab.affectionRank')}
        icon={<FiHeart className="w-4 h-4" />}
        min={1}
        max={100}
        value={[plan.current.affection, plan.target.affection]}
        warningMessage={warningMsg}
        checkLimit={(val) => {
          if (val === plan.current.affection && isCurrentExceeded) return true;
          if (val === plan.target.affection && isTargetExceeded) return true;
          return false;
        }}
        renderValue={(val, isOver) => (
          <div className={`flex items-center gap-1 ${isOver ? 'text-rose-600' : ''}`}>
            <FiHeart className={`w-3 h-3 ${isOver ? 'fill-rose-600' : 'fill-rose-400 text-rose-400'}`} />
            <span>{val}</span>
            {isOver && <FiAlertCircle className="w-3 h-3 ml-0.5" />}
          </div>
        )}
        onChange={(val) => {
          if (Array.isArray(val)) {
            handlePlanChange('current.affection', Math.min(val[0], val[1]), true);
            handlePlanChange('target.affection', Math.max(val[0], val[1]), true);
          }
        }}
      />
    ),
    [plan.current.affection, plan.target.affection, isCurrentExceeded, isTargetExceeded, warningMsg, t, handlePlanChange],
  );

  return (
    <div className="flex flex-col gap-6 py-2">
      {levelRow}
      {rankRow}
      {affectionRow}
      <EligmaToggle plan={plan} handlePlanChange={handlePlanChange} t={t} />
    </div>
  );
};

const EligmaToggle = React.memo(({ plan, handlePlanChange, t }: { plan: GrowthPlan; handlePlanChange: any; t: any }) => (
  <div
    onClick={() => handlePlanChange('useEligmaForStar', !plan.useEligmaForStar)}
    className={`
      mt-2 group relative flex flex-col sm:flex-row gap-4 p-3 rounded-lg border transition-all cursor-pointer select-none
      ${
        plan.useEligmaForStar
          ? 'bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-800'
          : 'bg-white border-gray-100 hover:border-gray-200 dark:bg-neutral-800/50 dark:border-neutral-700'
      }
    `}
  >
    <div className="flex items-center gap-3 shrink-0 h-8">
      <div
        className={`
          w-4 h-4 rounded flex items-center justify-center border transition-colors
          ${plan.useEligmaForStar ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-gray-300 text-transparent dark:bg-neutral-700 dark:border-neutral-600'}
        `}
      >
        <FiCheck size={10} strokeWidth={4} />
      </div>
      <span className={`text-xs font-bold ${plan.useEligmaForStar ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>{t('basicStatsTab.useEligmaForRankUp')}</span>
    </div>

    {plan.useEligmaForStar && (
      <div className="flex flex-1 gap-3 animate-in fade-in slide-in-from-left-2 items-center" onClick={(e) => e.stopPropagation()}>
        <div className="w-px h-8 bg-blue-200 dark:bg-blue-800 hidden sm:block"></div>
        <div className="flex-1">
          <label className="block text-[10px] font-medium text-blue-600/70 dark:text-blue-300/70 mb-1 truncate">{t('basicStatsTab.currentElephPrice')}</label>
          <select
            value={plan.eligmaInfo?.price || 1}
            onChange={(e) => handlePlanChange('eligmaInfo.price', e.target.value, true)}
            className="w-full bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 rounded py-1 px-2 text-xs text-blue-900 dark:text-blue-100 focus:ring-1 focus:ring-blue-400 outline-none"
          >
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-[10px] font-medium text-blue-600/70 dark:text-blue-300/70 mb-1 truncate">{t('basicStatsTab.purchasableEleph')}</label>
          <input
            type="number"
            value={plan.eligmaInfo?.stock || 0}
            onChange={(e) => handlePlanChange('eligmaInfo.stock', e.target.value, true)}
            className="w-full bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 rounded py-1 px-2 text-xs text-blue-900 dark:text-blue-100 focus:ring-1 focus:ring-blue-400 outline-none"
          />
        </div>
      </div>
    )}
  </div>
));
EligmaToggle.displayName = 'EligmaToggle';
