// // app/components/planner/StudentGrowth/GrowthAccordion.tsx

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
  // warningText,
  children,
}: GrowthAccordionProps) => {
  const { t } = useTranslation('planner');

  const actionBtnClass = 'p-1 rounded text-neutral-400 hover:text-neutral-700 dark:text-neutral-300 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-700 transition-all';

  return (
    <div className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      {/* 1. Header Area */}
      <div
        className={`
          flex items-center justify-between py-3 sm:py-6 px-4 cursor-pointer select-none transition-colors duration-200
          ${isOpen ? 'bg-neutral-100 dark:bg-neutral-500/60' : 'hover:bg-neutral-100 dark:hover:bg-neutral-500/60 bg-white dark:bg-neutral-900'}
        `}
        onClick={onToggle}
      >
        {/* Left: Title & Summary Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Chevron Icon */}
          <div className={`text-neutral-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}>
            <FiChevronDown size={16} />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 overflow-hidden">
            {/* Title */}
            <span className="font-bold text-md text-neutral-700 dark:text-neutral-200 whitespace-nowrap flex items-center gap-1.5">
              {title}
              {isWarning && <FiAlertTriangle size={12} className="text-amber-500" />}
            </span>

            {/* Summary Line: Simple Text Arrow */}
            <div className="flex items-center gap-1.5 text-xs truncate opacity-70 group-hover:opacity-100 transition-opacity">
              {/* <span className="font-mono text-neutral-500 dark:text-neutral-400">{currentSummary}</span> */}
              <span className={`font-mono font-semibold ${isWarning ? 'text-amber-600 dark:text-amber-500' : 'text-neutral-500 dark:text-neutral-200'}`}>{currentSummary}</span>
              <span className="text-neutral-500 dark:text-neutral-400 text-[10px]">→</span>
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
          <div className="px-6 py-4 mb-8 border-t border-neutral-100 dark:border-neutral-800">
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
