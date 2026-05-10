// // app/components/planner/StudentGrowth/GrowthAccordion.tsx
// import React from 'react';
// import { FiAlertTriangle, FiChevronDown, FiChevronUp } from 'react-icons/fi';

// interface GrowthAccordionProps {
//     title: string;
//     currentSummary: React.ReactNode;
//     targetSummary: React.ReactNode;
//     isOpen: boolean;
//     onToggle: () => void;
//     // Actions
//     onTargetMax: () => void;
//     onResetTarget: () => void;
//     onFullMax: () => void;
//     onFullReset: () => void;
//     // Warning
//     isWarning?: boolean;
//     warningText?: string;
//     children: React.ReactNode;
// }

// export const GrowthAccordion = ({
//     title, currentSummary, targetSummary, isOpen, onToggle,
//     onTargetMax, onResetTarget, onFullMax, onFullReset,
//     isWarning, warningText, children
// }: GrowthAccordionProps) => {
//     return (
//         <div className={`border-b border-gray-200 dark:border-neutral-700 transition-colors ...`}>    {/* Header Area */}
//             <div className="flex flex-col sm:flex-row items-stretch sm:items-center py-2.5 px-4 gap-2 min-h-[50px]">
//                 {/* Title */}
//                 <div className="flex items-center gap-2 w-full sm:w-28 cursor-pointer select-none shrink-0 group" onClick={onToggle}>
//                     <div className="text-gray-400 dark:text-gray-500 group-hover:text-blue-500 transition-colors">
//                         {isOpen ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
//                     </div>
//                     <span className="font-bold text-sm text-gray-700 dark:text-gray-200 truncate">{title}</span>
//                     {isWarning && <FiAlertTriangle size={14} className="text-amber-500 shrink-0 animate-pulse" />}
//                 </div>

//                 {/* Summaries */}
//                 <div className="flex-1 flex items-center gap-2 text-xs overflow-hidden">
//                     <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
//                         <span className="text-[9px] font-bold text-gray-400 uppercase">NOW</span>
//                         <span className="font-mono font-semibold truncate">{currentSummary}</span>
//                     </div>
//                     <span className="text-gray-300 dark:text-neutral-600">→</span>
//                     <div className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded ${isWarning ? 'text-amber-700 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
//                         <span className={`text-[9px] font-bold uppercase ${isWarning ? 'text-amber-600' : 'text-blue-500'}`}>GOAL</span>
//                         <span className="font-mono font-bold truncate">{targetSummary}</span>
//                     </div>
//                 </div>

//                 {/* Quick Actions */}
//                 <div className="flex items-center gap-1 shrink-0 mt-2 sm:mt-0 overflow-x-auto no-scrollbar opacity-100  focus-within:opacity-100 transition-opacity">
//                     <button onClick={(e) => { e.stopPropagation(); onFullReset(); }} className="px-2 py-0.5 text-[9px] font-bold text-gray-400 border border-gray-200 dark:border-neutral-700 rounded hover:bg-gray-100 dark:hover:bg-neutral-700 uppercase whitespace-nowrap">Min</button>
//                     <button onClick={(e) => { e.stopPropagation(); onResetTarget(); }} className="px-2 py-0.5 text-[9px] font-bold text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-neutral-600 rounded hover:bg-gray-100 dark:hover:bg-neutral-700 uppercase whitespace-nowrap">Reset</button>
//                     <button onClick={(e) => { e.stopPropagation(); onTargetMax(); }} className="px-2 py-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 uppercase whitespace-nowrap">T.Max</button>
//                     <button onClick={(e) => { e.stopPropagation(); onFullMax(); }} className="px-2 py-0.5 text-[9px] font-bold text-red-500 border border-red-200 dark:border-red-900/50 rounded hover:bg-red-50 dark:hover:bg-red-900/20 uppercase whitespace-nowrap">Max</button>
//                 </div>
//             </div>

//             {/* Content Area - Divider based layout instead of Box */}
//             {isOpen && (
//                 <div className="border-t border-gray-200 dark:border-neutral-700 animate-in slide-in-from-top-1 duration-200">
//                     <div className="px-4 py-4">
//                         {isWarning && warningText && (
//                             <div className="mb-4 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-500 bg-amber-50/50 dark:bg-amber-900/10 p-2 rounded border-l-2 border-amber-400">
//                                 <FiAlertTriangle className="shrink-0 mt-0.5" />
//                                 <span>{warningText}</span>
//                             </div>
//                         )}
//                         {/* Children render directly without extra padding wrapper */}
//                         {children}
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// };

// // app/components/planner/StudentGrowth/GrowthAccordion.tsx

// import React, { useState } from 'react';
// import { FiAlertTriangle, FiChevronDown, FiChevronUp } from 'react-icons/fi';
// import { FaRegQuestionCircle } from 'react-icons/fa';
// import { useTranslation } from 'react-i18next';

// interface GrowthAccordionProps {
//   title: string;
//   currentSummary: React.ReactNode;
//   targetSummary: React.ReactNode;
//   isOpen: boolean;
//   onToggle: () => void;
//   // Actions
//   onTargetMax: () => void;
//   onResetTarget: () => void;
//   onFullMax: () => void;
//   onFullReset: () => void;
//   // Warning
//   isWarning?: boolean;
//   warningText?: string;
//   children: React.ReactNode;
// }

// export const GrowthAccordion = ({
//   title,
//   currentSummary,
//   targetSummary,
//   isOpen,
//   onToggle,
//   onTargetMax,
//   onResetTarget,
//   onFullMax,
//   onFullReset,
//   isWarning,
//   warningText,
//   children,
// }: GrowthAccordionProps) => {
//   const { t } = useTranslation('planner');

//   const [showHelp, setShowHelp] = useState(false);

//   const helpItems = [
//     { label: t('accordion.btnMin', 'Min'), text: t('accordion.tooltipMin') },
//     {
//       label: t('accordion.btnReset', 'Reset'),
//       text: t('accordion.tooltipReset'),
//     },
//     {
//       label: t('accordion.btnTargetMax', 'Goal Max'),
//       text: t('accordion.tooltipTargetMax'),
//     },
//     {
//       label: t('accordion.btnFullMax', 'Max'),
//       text: t('accordion.tooltipFullMax'),
//     },
//   ];

//   return (
//     <div className={`border-b border-gray-200 dark:border-neutral-700 transition-colors`}>
//       {/* Header Area Wrapper */}
//       <div className="flex flex-col">
//         <div className="flex flex-col sm:flex-row items-stretch sm:items-center py-2.5 px-4 gap-2 min-h-[50px]">
//           {/* Title */}
//           <div className="flex items-center gap-2 w-full sm:w-28 cursor-pointer select-none shrink-0 group" onClick={onToggle}>
//             <div className="text-gray-400 dark:text-gray-500 group-hover:text-blue-500 transition-colors">{isOpen ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}</div>
//             <span className="font-bold text-sm text-gray-700 dark:text-gray-200 truncate">{title}</span>
//             {isWarning && <FiAlertTriangle size={14} className="text-amber-500 shrink-0 animate-pulse" />}
//           </div>

//           {/* Summaries */}
//           <div className="flex-1 flex items-center gap-2 text-xs overflow-hidden">
//             <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
//               <span className="text-[9px] font-bold text-gray-400 uppercase">NOW</span>
//               <span className="font-mono font-semibold truncate">{currentSummary}</span>
//             </div>
//             <span className="text-gray-300 dark:text-neutral-600">→</span>
//             <div className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded ${isWarning ? 'text-amber-700 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
//               <span className={`text-[9px] font-bold uppercase ${isWarning ? 'text-amber-600' : 'text-blue-500'}`}>GOAL</span>
//               <span className="font-mono font-bold truncate">{targetSummary}</span>
//             </div>
//           </div>

//           {/* Quick Actions & Help Button */}
//           <div className="flex items-center gap-2 shrink-0 mt-2 sm:mt-0">
//             <div className="flex items-center gap-1 overflow-x-auto no-scrollbar opacity-100 focus-within:opacity-100 transition-opacity">
//               <button
//                 onClick={(e) => {
//                   e.stopPropagation();
//                   onFullReset();
//                 }}
//                 title={t('accordion.tooltipMin')}
//                 className="px-2 py-0.5 text-[9px] font-bold text-gray-400 border border-gray-200 dark:border-neutral-700 rounded hover:bg-gray-100 dark:hover:bg-neutral-700 uppercase whitespace-nowrap"
//               >
//                 {t('accordion.btnMin')}
//               </button>

//               <button
//                 onClick={(e) => {
//                   e.stopPropagation();
//                   onResetTarget();
//                 }}
//                 title={t('accordion.tooltipReset')}
//                 className="px-2 py-0.5 text-[9px] font-bold text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-neutral-600 rounded hover:bg-gray-100 dark:hover:bg-neutral-700 uppercase whitespace-nowrap"
//               >
//                 {t('accordion.btnReset')}
//               </button>

//               <button
//                 onClick={(e) => {
//                   e.stopPropagation();
//                   onTargetMax();
//                 }}
//                 title={t('accordion.tooltipTargetMax')}
//                 className="px-2 py-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 uppercase whitespace-nowrap"
//               >
//                 {t('accordion.btnTargetMax')}
//               </button>

//               <button
//                 onClick={(e) => {
//                   e.stopPropagation();
//                   onFullMax();
//                 }}
//                 title={t('accordion.tooltipFullMax')}
//                 className="px-2 py-0.5 text-[9px] font-bold text-red-500 border border-red-200 dark:border-red-900/50 rounded hover:bg-red-50 dark:hover:bg-red-900/20 uppercase whitespace-nowrap"
//               >
//                 {t('accordion.btnFullMax')}
//               </button>
//             </div>

//             <button
//               onClick={(e) => {
//                 e.stopPropagation();
//                 setShowHelp(!showHelp);
//               }}
//               className={`p-1 rounded-full transition-colors shrink-0 ${showHelp ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-300 hover:text-gray-500 dark:text-neutral-600 dark:hover:text-neutral-400'}`}
//               title="Help"
//             >
//               <FaRegQuestionCircle size={14} />
//             </button>
//           </div>
//         </div>

//         {showHelp && (
//           <div className="mx-4 mb-2 p-2 bg-gray-50 dark:bg-neutral-800 rounded text-[10px] text-gray-500 dark:text-gray-400 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 animate-in fade-in zoom-in-95 duration-200">
//             {helpItems.map((item, idx) => (
//               <div key={idx} className="flex gap-2">
//                 <span className="font-bold min-w-[50px] text-right shrink-0">{item.label}:</span>
//                 <span className="break-keep">{item.text}</span>
//               </div>
//             ))}
//           </div>
//         )}
//       </div>

//       {/* Content Area */}
//       {isOpen && (
//         <div className="border-t border-gray-200 dark:border-neutral-700 animate-in slide-in-from-top-1 duration-200">
//           <div className="px-4 py-4">
//             {isWarning && warningText && (
//               <div className="mb-4 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-500 bg-amber-50/50 dark:bg-amber-900/10 p-2 rounded border-l-2 border-amber-400">
//                 <FiAlertTriangle className="shrink-0 mt-0.5" />
//                 <span>{warningText}</span>
//               </div>
//             )}
//             {children}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// app/components/planner/StudentGrowth/GrowthAccordion.tsx

// app/components/planner/StudentGrowth/GrowthAccordion.tsx

import React from 'react';
import {
  FiAlertTriangle,
  FiChevronDown,
  FiChevronsUp, // Max
  FiChevronsDown, // Min
  FiTarget, // Goal
} from 'react-icons/fi';
import { IoSync } from 'react-icons/io5'; // Sync
import { useTranslation } from 'react-i18next';

interface GrowthAccordionProps {
  title: string;
  currentSummary: React.ReactNode;
  targetSummary: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  // Actions
  onTargetMax: () => void;
  onResetTarget: () => void;
  onFullMax: () => void;
  onFullReset: () => void;
  // Warning
  isWarning?: boolean;
  warningText?: string;
  children: React.ReactNode;
}

export const GrowthAccordion = ({
  title,
  currentSummary,
  targetSummary,
  isOpen,
  onToggle,
  onTargetMax,
  onResetTarget,
  onFullMax,
  onFullReset,
  isWarning,
  warningText,
  children,
}: GrowthAccordionProps) => {
  const { t } = useTranslation('planner');

  const actionBtnClass = 'p-1 rounded text-gray-400 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-neutral-700 transition-all';

  return (
    <div className="border-b border-gray-100 dark:border-neutral-800 last:border-0">
      {/* 1. Header Area */}
      <div
        className={`
          flex items-center justify-between py-3 sm:py-6 px-4 cursor-pointer select-none transition-colors duration-200
          ${isOpen ? 'bg-gray-100 dark:bg-neutral-500/60' : 'hover:bg-gray-100 dark:hover:bg-neutral-500/60 bg-white dark:bg-neutral-900'}
        `}
        onClick={onToggle}
      >
        {/* Left: Title & Summary Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Chevron Icon */}
          <div className={`text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}>
            <FiChevronDown size={16} />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 overflow-hidden">
            {/* Title */}
            <span className="font-bold text-md text-gray-700 dark:text-gray-200 whitespace-nowrap flex items-center gap-1.5">
              {title}
              {isWarning && <FiAlertTriangle size={12} className="text-amber-500" />}
            </span>

            {/* Summary Line: Simple Text Arrow */}
            <div className="flex items-center gap-1.5 text-xs truncate opacity-70 group-hover:opacity-100 transition-opacity">
              {/* <span className="font-mono text-gray-500 dark:text-gray-400">{currentSummary}</span> */}
              <span className={`font-mono font-semibold ${isWarning ? 'text-amber-600 dark:text-amber-500' : 'text-gray-500 dark:text-gray-200'}`}>{currentSummary}</span>
              <span className="text-gray-500 dark:text-neutral-400 text-[10px]">→</span>
              <span className={`font-mono font-semibold ${isWarning ? 'text-amber-600 dark:text-amber-500' : 'text-blue-600 dark:text-blue-400'}`}>{targetSummary}</span>
            </div>
          </div>
        </div>

        {/* Right: Quick Actions (No Box, Just Icons) */}
        <div className="flex items-center gap-1 ml-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Reset / Sync Group */}
          <button onClick={onFullReset} title={t('growthCard.tooltipMinAll', 'Min All')} className={`${actionBtnClass} hover:text-red-500 dark:hover:text-red-400`}>
            <FiChevronsDown size={15} />
          </button>

          <button onClick={onResetTarget} title={t('growthCard.tooltipResetTargets', 'Sync')} className={`${actionBtnClass} hover:text-blue-500 dark:hover:text-blue-400`}>
            <IoSync size={15} />
          </button>

          {/* Growth Group */}
          <button
            onClick={onTargetMax}
            title={t('growthCard.tooltipMaxTargets', 'Goal Max')}
            className={`${actionBtnClass} text-blue-400/80 dark:text-blue-500/80 hover:bg-blue-50 dark:hover:bg-blue-900/20`}
          >
            <FiTarget size={15} />
          </button>

          <button onClick={onFullMax} title={t('growthCard.tooltipMaxAll', 'All Max')} className={`${actionBtnClass} text-red-400/80 dark:text-red-500/80 hover:bg-red-50 dark:hover:bg-red-900/20`}>
            <FiChevronsUp size={15} />
          </button>
        </div>
      </div>

      {/* 2. Content Body */}
      {isOpen && (
        <div className="bg-white dark:bg-neutral-900 animate-in slide-in-from-top-1 duration-200">
          <div className="px-6 py-4 mb-8 border-t border-gray-100 dark:border-neutral-800">
            {/* Warning Banner (Compact & Flat) */}
            {/* {isWarning && warningText && (
              <div className="mb-4 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded">
                <FiAlertTriangle className="shrink-0" size={12} />
                <span>{warningText}</span>
              </div>
            )} */}

            {/* Child Content */}
            {children}
          </div>
        </div>
      )}
    </div>
  );
};
