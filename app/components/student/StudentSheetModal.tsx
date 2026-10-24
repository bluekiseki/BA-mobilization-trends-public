// app/components/planner/StudentGrowth/StudentSheetModal.tsx
import type { ReactNode } from 'react';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';

import type { StudentPortraitData } from '~/types/plannerData';
import { CombatStylePortrait } from '~/components/student/CombatStylePortrait';

// --- Shared modal shell for the "students related to this item" popups (gift / furniture / opart).
// Bottom sheet on mobile, centered popup on desktop. ---

export function StudentSheetModal({ icon, title, onClose, children }: { icon: ReactNode; title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-51 flex items-end sm:items-center justify-center" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative w-full sm:w-80 max-h-[70vh] sm:max-h-120 bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Handle bar (mobile) */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-8 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
          <div className="relative w-10 h-10 bg-neutral-50 dark:bg-neutral-800 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">{icon}</div>
          <div className="flex-1 min-w-0">{title}</div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors shrink-0 text-sm font-bold"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar px-3 py-3">{children}</div>
      </div>
    </div>
  );
}

// --- Shared round student avatar with name tooltip ---

export function StudentPortraitAvatar({ studentId, name, studentPortraits }: { studentId: number; name: string; studentPortraits?: StudentPortraitData }) {
  return (
    <Tooltip placement="top" overlay={<span className="text-xs font-medium">{name}</span>} mouseEnterDelay={0.1}>
      <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 ring-2 ring-white dark:ring-neutral-800 cursor-pointer">
        {studentPortraits?.[studentId] ? (
          <CombatStylePortrait studentId={studentId} portraits={studentPortraits} alt={name} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-500">{name[0]}</div>
        )}
      </div>
    </Tooltip>
  );
}

export function StudentPortraitList({ students, studentPortraits, emptyMessage }: { students: { studentId: number; name: string }[]; studentPortraits?: StudentPortraitData; emptyMessage: string }) {
  return students.length === 0 ? (
    <p className="text-center text-sm text-neutral-400 py-8">{emptyMessage}</p>
  ) : (
    <div className="flex flex-wrap gap-1.5">
      {students.map((student) => (
        <StudentPortraitAvatar key={student.studentId} studentId={student.studentId} name={student.name} studentPortraits={studentPortraits} />
      ))}
    </div>
  );
}
