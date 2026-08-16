// components/planner/resources/StudentGoalsTab.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StarRating } from '~/components/StarRating';
import StudentElephCard from '~/components/planner/resources/StudentElephCard';
import ContentGroupedStudentView from '~/components/planner/StudentGrowth/ContentGroupedStudentView';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { StudentTargetGoal } from '~/types/resourcePlan';
import type { Student } from '~/types/data';
import type { ContentItem } from '~/routes/planner/Resources';
import type { GlobalAggregatedResult } from '~/utils/gachaEngine';

type GachaResult = GlobalAggregatedResult | null;
type StudentStats = NonNullable<GachaResult>['studentStats'];

type ViewMode = 'student' | 'schedule';

interface ActivePlan extends GrowthPlan {
  studentId: number;
}

interface StudentGoalsTabProps {
  selectedItemKey: string | null;
  activePlans: ActivePlan[];
  allGrowthPlans: GrowthPlan[];
  studentsRecord: Record<number, Student>;
  targetGoals: Record<number, StudentTargetGoal[]>;
  contentItems: ContentItem[];
  gachaStudentStats: StudentStats | undefined;
  onSelectItem: (key: string) => void;
  onAddGoal: (studentId: number, goal: Omit<StudentTargetGoal, 'id'>) => void;
  onUpdateGoal: (studentId: number, id: string, patch: Partial<StudentTargetGoal>) => void;
  onRemoveGoal: (studentId: number, id: string) => void;
  onClearStudent: () => void;
}

function parseStudentId(key: string | null): number | null {
  if (!key?.startsWith('Item_')) return null;
  const n = Number(key.slice(5));
  return n >= 10000 ? n : null;
}

export function StudentGoalsTab({
  selectedItemKey,
  activePlans,
  allGrowthPlans,
  studentsRecord,
  targetGoals,
  contentItems,
  gachaStudentStats,
  onSelectItem,
  onAddGoal,
  onUpdateGoal,
  onRemoveGoal,
  onClearStudent,
}: StudentGoalsTabProps) {
  const { t } = useTranslation('resources');
  const [viewMode, setViewMode] = useState<ViewMode>('student');

  const selectedStudentId = parseStudentId(selectedItemKey);
  const isElephSelected = selectedStudentId !== null;
  const selectedStudentMeta = selectedStudentId !== null ? studentsRecord[selectedStudentId] : null;
  const selectedPlan = selectedStudentId !== null ? allGrowthPlans.find((p) => p.studentId === selectedStudentId) : undefined;

  return (
    <div className="space-y-4">
      {/* View mode toggle */}
      <div className="flex rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden w-fit text-xs">
        {(['student', 'schedule'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 transition-colors ${
              viewMode === mode ? 'bg-blue-600 dark:bg-blue-500 text-white' : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
            }`}
          >
            {mode === 'student' ? t('studentGoals.byStudent') : t('studentGoals.bySchedule')}
          </button>
        ))}
      </div>

      {viewMode === 'schedule' ? (
        <ContentGroupedStudentView contentItems={contentItems} growthPlans={allGrowthPlans} allStudents={studentsRecord} />
      ) : (
        <>
          {/* Student plan quick-select pills */}
          {activePlans.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t('studentGoals.activePlans')}</span>
              <div className="flex flex-wrap gap-1.5">
                {activePlans.map((p) => {
                  const id = p.studentId;
                  const meta = studentsRecord[id];
                  const isSelected = selectedItemKey === `Item_${id}`;
                  return (
                    <button
                      key={id}
                      onClick={() => onSelectItem(`Item_${id}`)}
                      title={meta?.Name ?? `#${id}`}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                        isSelected
                          ? 'bg-blue-600 dark:bg-blue-500 text-white'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                      }`}
                    >
                      {meta?.Portrait && <img src={`data:image/webp;base64,${meta.Portrait}`} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />}
                      <span className="max-w-[80px] truncate" title={meta?.Name ?? `#${id}`}>
                        {meta?.Name ?? `#${id}`}
                      </span>
                      <span className="flex items-center gap-1 opacity-60 shrink-0">
                        <StarRating n={p.current.uw > 0 ? p.current.uw + 6 : p.current.star} />
                        <span className="text-[10px] font-mono">→</span>
                        <StarRating n={p.target.uw > 0 ? p.target.uw + 6 : p.target.star} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Prompt when no eleph item is selected */}
          {!isElephSelected && (
            <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 p-6 text-center space-y-1">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('studentGoals.noStudentSelected')}</p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">{t('studentGoals.selectStudentHint')}</p>
            </div>
          )}

          {/* Student eleph card */}
          {isElephSelected && selectedStudentId !== null && (
            <StudentElephCard
              key={selectedStudentId}
              studentId={selectedStudentId}
              studentName={selectedStudentMeta?.Name ?? `#${selectedStudentId}`}
              studentIcon={selectedStudentMeta?.Portrait}
              plan={selectedPlan}
              simStat={gachaStudentStats?.[selectedStudentId]}
              minStar={selectedStudentMeta?.StarGrade ?? 1}
              goals={targetGoals[selectedStudentId] ?? []}
              onAddGoal={(goal) => onAddGoal(selectedStudentId, goal)}
              onUpdateGoal={(id, patch) => onUpdateGoal(selectedStudentId, id, patch)}
              onRemoveGoal={(id) => onRemoveGoal(selectedStudentId, id)}
              contentItems={contentItems}
              onRemove={onClearStudent}
            />
          )}
        </>
      )}
    </div>
  );
}
