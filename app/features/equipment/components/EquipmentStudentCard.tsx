import React from 'react';
import { MdArrowForward } from 'react-icons/md';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';

interface EquipmentStudentCardProps {
  plan: GrowthPlan;
  studentName: string;
  portraitSrc: string | null;
  isSelected: boolean;
  onClick: () => void;
}

export const EquipmentStudentCard = React.memo(({ plan, studentName, portraitSrc, isSelected, onClick }: EquipmentStudentCardProps) => {
  const hasChanges = plan.current.equipment.some((cur, i) => cur !== plan.target.equipment[i]);
  const currentSlots = plan.current.equipment.join('/');
  const targetSlots = plan.target.equipment.join('/');

  return (
    <div
      onClick={onClick}
      className={`w-24 flex flex-col items-center gap-0.5 p-1.5 rounded cursor-pointer transition-all select-none ${
        isSelected
          ? 'border-2 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30'
          : 'border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-750'
      }`}
    >
      {/* Portrait */}
      <div className="relative">
        {portraitSrc ? (
          <img src={portraitSrc} alt={studentName} className="w-8 h-8 rounded-full object-cover" loading="lazy" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
            <span className="text-[10px] text-neutral-400">?</span>
          </div>
        )}
        {isSelected && (
          <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center">
            <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        )}
      </div>

      {/* Name */}
      <p className="text-[10px] font-semibold text-neutral-800 dark:text-neutral-100 truncate w-full text-center leading-tight">{studentName}</p>

      {/* Slot changes — show as e.g. "1/1/1 → 3/3/3" */}
      {hasChanges && (
        <div className="flex items-center gap-0.5 px-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
          <span className="text-[9px] font-bold">{currentSlots}</span>
          <MdArrowForward className="w-2.5 h-2.5" />
          <span className="text-[9px] font-bold">{targetSlots}</span>
        </div>
      )}
    </div>
  );
});

EquipmentStudentCard.displayName = 'EquipmentStudentCard';
