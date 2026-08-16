// app/components/planner/resources/StudentElephCard.tsx
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaPlus, FaTrash } from 'react-icons/fa';
import { StarRating } from '~/components/StarRating';
import type { GrowthPlan } from '~/types/growthPlan';
import type { StudentSimulationStat } from '~/utils/gachaEngine';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { calcElephNeeded } from '~/utils/elephEligmaCalc';
import { useResourcePlanStore } from '~/store/planner/useResourcePlanStore';
import type { StudentTargetGoal } from '~/types/resourcePlan';
import type { ContentItem } from '~/types/plannerData';

interface Props {
  studentId: number;
  studentName: string;
  studentIcon?: string;
  plan?: GrowthPlan;
  simStat?: StudentSimulationStat;
  minStar?: number;
  goals: StudentTargetGoal[];
  onAddGoal: (goal: Omit<StudentTargetGoal, 'id'>) => void;
  onUpdateGoal: (goalId: string, patch: Partial<Omit<StudentTargetGoal, 'id'>>) => void;
  onRemoveGoal: (goalId: string) => void;
  contentItems?: ContentItem[];
  onRemove?: () => void;
}

// Linear star-value progression: 1★-5★, then UE1-UE4 (n=6 skipped — no clean game state)
const ALL_STAR_VALUES = [1, 2, 3, 4, 5, 7, 8, 9, 10] as const;

function toStarValue(star: number, uw: number): number {
  return uw === 0 ? star : uw + 6;
}

function fromStarValue(n: number): { star: number; uw: number } {
  return n <= 5 ? { star: n, uw: 0 } : { star: 5, uw: n - 6 };
}

// ─── Shared sub-components ────────────────────────────────────────────────────

const SELECT_CLS =
  'flex-1 min-w-0 px-1.5 py-0.5 text-[11px] rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400';
const DATE_CLS = SELECT_CLS;
const MODE_BTN_BASE = 'px-1.5 py-0.5 transition-colors';
const MODE_BTN_ACTIVE = 'bg-blue-600 dark:bg-blue-500 text-white';
const MODE_BTN_IDLE = 'bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800';
const STAR_BTN_ACTIVE = 'p-0.5 rounded transition-colors bg-neutral-200 dark:bg-neutral-700 ring-1 ring-amber-400 dark:ring-amber-500';
const STAR_BTN_IDLE = 'p-0.5 rounded transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800';

function starBtnCls(active: boolean) {
  return active ? STAR_BTN_ACTIVE : STAR_BTN_IDLE;
}

/** Toggle row: "Content | Date" mode buttons. */
function ModeToggle({ mode, onChange }: { mode: 'event' | 'date'; onChange: (m: 'event' | 'date') => void }) {
  const { t } = useTranslation('resources');
  return (
    <div className="flex rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden text-[10px] shrink-0">
      {(['event', 'date'] as const).map((m) => (
        <button key={m} onClick={() => onChange(m)} className={`${MODE_BTN_BASE} ${mode === m ? MODE_BTN_ACTIVE : MODE_BTN_IDLE}`}>
          {m === 'event' ? t('elephCard.contentMode') : t('elephCard.dateMode')}
        </button>
      ))}
    </div>
  );
}

/** Toggle row: "Start | End" timing for a content-type deadline. */
function TimingToggle({ timing, onChange }: { timing: 'start' | 'end'; onChange: (v: 'start' | 'end') => void }) {
  const { t } = useTranslation('resources');
  return (
    <div className="flex rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden text-[10px] shrink-0">
      {(['start', 'end'] as const).map((v) => (
        <button key={v} onClick={() => onChange(v)} className={`${MODE_BTN_BASE} ${timing === v ? MODE_BTN_ACTIVE : MODE_BTN_IDLE}`}>
          {v === 'start' ? t('elephCard.timingStart') : t('elephCard.timingEnd')}
        </button>
      ))}
    </div>
  );
}

/** Content selector + optional Start/End timing toggle. */
function ContentPicker({
  contentRef,
  contentItems,
  onChange,
}: {
  contentRef: StudentTargetGoal['contentRef'] | undefined;
  contentItems: ContentItem[];
  onChange: (ref: StudentTargetGoal['contentRef']) => void;
}) {
  const { t } = useTranslation('resources');
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <select value={contentRef?.id ?? ''} onChange={(e) => onChange(e.target.value ? { id: e.target.value, timing: contentRef?.timing ?? 'start' } : undefined)} className={SELECT_CLS}>
        <option value="">{t('elephCard.selectContent')}</option>
        {contentItems.map((ci) => (
          <option key={ci.id} value={ci.id}>
            {ci.prefix}
            {ci.season} {ci.bossTitle} ({ci.date}
            {ci.endDate ? ` – ${ci.endDate}` : ''})
          </option>
        ))}
      </select>
      {contentRef?.id && <TimingToggle timing={contentRef.timing ?? 'start'} onChange={(t) => onChange({ ...contentRef, timing: t })} />}
    </div>
  );
}

// ─── GoalRow ──────────────────────────────────────────────────────────────────

interface GoalRowProps {
  goal: StudentTargetGoal;
  minStar: number;
  maxStar: number;
  contentItems: ContentItem[];
  onUpdate: (patch: Partial<Omit<StudentTargetGoal, 'id'>>) => void;
  onRemove: () => void;
}

function GoalRow({ goal, minStar, maxStar, contentItems, onUpdate, onRemove }: GoalRowProps) {
  const { t } = useTranslation('resources');
  const goalSV = toStarValue(goal.targetStar, goal.targetUw);
  const visibleValues = ALL_STAR_VALUES.filter((n) => n >= minStar && n <= maxStar);
  const [mode, setMode] = useState<'event' | 'date'>(() => (goal.contentRef ? 'event' : 'date'));

  const handleSwitchMode = (m: 'event' | 'date') => {
    setMode(m);
    if (m === 'event') onUpdate({ date: undefined });
    else onUpdate({ contentRef: undefined });
  };

  return (
    <div className="space-y-1.5">
      {/* Target star selector */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 w-10 shrink-0">{t('elephCard.target')}</span>
        <div className="flex flex-wrap gap-0.5 flex-1">
          {visibleValues.map((n) => (
            <button
              key={n}
              onClick={() => {
                const { star, uw } = fromStarValue(n);
                onUpdate({ targetStar: star, targetUw: uw });
              }}
              className={starBtnCls(goalSV === n)}
            >
              <StarRating n={n} />
            </button>
          ))}
        </div>
        <button onClick={onRemove} className="text-neutral-300 hover:text-red-500 dark:text-neutral-600 dark:hover:text-red-400 transition-colors shrink-0">
          <FaTrash size={11} />
        </button>
      </div>

      {/* Deadline */}
      <div className="flex items-center gap-1.5">
        <ModeToggle mode={mode} onChange={handleSwitchMode} />
        {mode === 'event' ? (
          <ContentPicker contentRef={goal.contentRef} contentItems={contentItems} onChange={(ref) => onUpdate({ contentRef: ref })} />
        ) : (
          <input type="date" className={DATE_CLS} value={goal.date ?? ''} onChange={(e) => onUpdate({ date: e.target.value || undefined })} />
        )}
      </div>
    </div>
  );
}

// ─── PendingGoalRow ───────────────────────────────────────────────────────────

interface PendingGoalRowProps {
  minStar: number;
  maxStar: number;
  defaultStar: number;
  defaultUw: number;
  contentItems: ContentItem[];
  onAdd: (goal: Omit<StudentTargetGoal, 'id'>) => void;
  onCancel: () => void;
}

function PendingGoalRow({ minStar, maxStar, defaultStar, defaultUw, contentItems, onAdd, onCancel }: PendingGoalRowProps) {
  const { t } = useTranslation('resources');
  const [star, setStar] = useState(defaultStar);
  const [uw, setUw] = useState(defaultUw);
  const [mode, setMode] = useState<'event' | 'date'>('event');
  // Pending contentRef — held locally until the user picks a date/content
  const [pendingRef, setPendingRef] = useState<StudentTargetGoal['contentRef']>(undefined);
  const goalSV = toStarValue(star, uw);
  const visibleValues = ALL_STAR_VALUES.filter((n) => n >= minStar && n <= maxStar);

  const handleContentChange = (ref: StudentTargetGoal['contentRef']) => {
    setPendingRef(ref);
    if (ref?.id) onAdd({ targetStar: star, targetUw: uw, contentRef: ref });
  };

  return (
    <div className="space-y-1.5">
      {/* Target star */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 w-10 shrink-0">{t('elephCard.target')}</span>
        <div className="flex flex-wrap gap-0.5 flex-1">
          {visibleValues.map((n) => (
            <button
              key={n}
              onClick={() => {
                const { star: s, uw: u } = fromStarValue(n);
                setStar(s);
                setUw(u);
              }}
              className={starBtnCls(goalSV === n)}
            >
              <StarRating n={n} />
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="text-neutral-300 hover:text-red-500 dark:text-neutral-600 dark:hover:text-red-400 transition-colors shrink-0">
          <FaTrash size={11} />
        </button>
      </div>

      {/* Deadline */}
      <div className="flex items-center gap-1.5">
        <ModeToggle mode={mode} onChange={setMode} />
        {mode === 'event' ? (
          <ContentPicker contentRef={pendingRef} contentItems={contentItems} onChange={handleContentChange} />
        ) : (
          <input
            type="date"
            className={DATE_CLS}
            onChange={(e) => {
              if (e.target.value) onAdd({ targetStar: star, targetUw: uw, date: e.target.value });
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── FinalGoalSection ─────────────────────────────────────────────────────────

interface FinalGoalSectionProps {
  currentSV: number;
  studentId: number;
  plan?: GrowthPlan;
  finalGoal: StudentTargetGoal | undefined;
  contentItems: ContentItem[];
  /** Called whenever star, deadline, or timing changes. Receives the full new goal data. */
  onFinalGoalChange: (goal: Omit<StudentTargetGoal, 'id'> | null) => void;
}

function FinalGoalSection({ currentSV, studentId, plan, finalGoal, contentItems, onFinalGoalChange }: FinalGoalSectionProps) {
  const { t } = useTranslation('resources');
  const { addPlanForStudent, updatePlan } = useGlobalStore();
  const [mode, setMode] = useState<'event' | 'date'>(() => (finalGoal?.contentRef ? 'event' : 'date'));

  // Source of truth for displayed target: finalGoal entry first, then plan.target
  const finalTargetSV = finalGoal ? toStarValue(finalGoal.targetStar, finalGoal.targetUw) : plan ? toStarValue(plan.target.star, plan.target.uw) : null;

  // Build the current goal base (star/uw from finalGoal or plan, deadline preserved)
  const buildGoal = (overrides: Partial<Omit<StudentTargetGoal, 'id'>>): Omit<StudentTargetGoal, 'id'> => ({
    targetStar: finalGoal?.targetStar ?? plan?.target.star ?? fromStarValue(currentSV).star,
    targetUw: finalGoal?.targetUw ?? plan?.target.uw ?? 0,
    date: finalGoal?.date,
    contentRef: finalGoal?.contentRef,
    ...overrides,
  });

  const handleSetTargetSV = (n: number) => {
    const { star, uw } = fromStarValue(n);
    if (!plan) {
      const { star: curStar } = fromStarValue(currentSV);
      addPlanForStudent(studentId, curStar, star);
    } else {
      updatePlan(plan.uuid, 'target.star', star);
      updatePlan(plan.uuid, 'target.uw', uw);
    }
    onFinalGoalChange(buildGoal({ targetStar: star, targetUw: uw }));
  };

  const handleSwitchMode = (m: 'event' | 'date') => {
    setMode(m);
    // Clear only the deadline part; keep star/uw
    if (finalGoal) {
      onFinalGoalChange(buildGoal({ date: undefined, contentRef: undefined }));
    }
  };

  const hasAnyFinalData = Boolean(plan || finalGoal);

  return (
    <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3 space-y-2">
      {/* Target star row */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500 dark:text-neutral-400 w-16 shrink-0">{t('elephCard.finalGoal')}</span>
        <div className="flex flex-wrap gap-0.5">
          {ALL_STAR_VALUES.filter((n) => n >= currentSV).map((n) => (
            <button key={n} onClick={() => handleSetTargetSV(n)} className={starBtnCls(finalTargetSV === n)}>
              <StarRating n={n} />
            </button>
          ))}
        </div>
      </div>

      {/* Deadline row — shown once a plan or finalGoal exists */}
      {hasAnyFinalData && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 w-16 shrink-0">{t('elephCard.by')}</span>
          <ModeToggle mode={mode} onChange={handleSwitchMode} />
          {mode === 'event' ? (
            <ContentPicker contentRef={finalGoal?.contentRef} contentItems={contentItems} onChange={(ref) => onFinalGoalChange(buildGoal({ contentRef: ref ?? undefined, date: undefined }))} />
          ) : (
            <input type="date" value={finalGoal?.date ?? ''} onChange={(e) => onFinalGoalChange(buildGoal({ date: e.target.value || undefined, contentRef: undefined }))} className={DATE_CLS} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudentElephCard({ studentId, studentName, studentIcon, plan, simStat, minStar, goals, onAddGoal, onUpdateGoal, onRemoveGoal, contentItems = [], onRemove }: Props) {
  const { t } = useTranslation('resources');
  const { materialInventory, updateMaterialInventory, updatePlan, addPlanForStudent } = useGlobalStore();
  const { targetGoals, setFinalGoal } = useResourcePlanStore();
  const [showPending, setShowPending] = useState(false);

  const currentEleph = materialInventory[`Item_${studentId}`] ?? plan?.current.eleph ?? 0;
  const currentSV = toStarValue(plan?.current.star ?? minStar ?? 1, plan?.current.uw ?? 0);
  const visibleValues = ALL_STAR_VALUES.filter((n) => n >= (minStar ?? 1));

  const sortedGoals = useMemo(
    () =>
      [...goals]
        .filter((g) => g.id !== 'final')
        .sort((a, b) => {
          const dateA = a.date ?? contentItems.find((c) => c.id === a.contentRef?.id)?.date ?? '';
          const dateB = b.date ?? contentItems.find((c) => c.id === b.contentRef?.id)?.date ?? '';
          return dateA.localeCompare(dateB);
        }),
    [goals, contentItems],
  );

  const finalGoal = targetGoals[studentId]?.find((g) => g.id === 'final');
  const finalGoalSV = finalGoal ? toStarValue(finalGoal.targetStar, finalGoal.targetUw) : plan ? toStarValue(plan.target.star, plan.target.uw) : 10;

  const totalElephNeeded = plan ? goals.reduce((acc, g) => acc + Math.max(0, calcElephNeeded(plan.current.star, g.targetStar, plan.current.uw, g.targetUw)), 0) : null;

  const handleSetCurrentSV = (n: number) => {
    const { star, uw } = fromStarValue(n);
    if (plan) {
      updatePlan(plan.uuid, 'current.uw', uw);
      updatePlan(plan.uuid, 'current.star', star);
    } else {
      const uuid = addPlanForStudent(studentId, star, Math.max(star, 5));
      if (uw > 0) updatePlan(uuid, 'current.uw', uw);
    }
  };

  const inputCls =
    'w-16 px-1.5 py-1 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400 text-center';

  // Default for a new pending goal: highest star value strictly below Final Goal
  const intermediateValues = ALL_STAR_VALUES.filter((n) => n >= currentSV && n < finalGoalSV);
  const defaultPendingSV = intermediateValues.at(-1) ?? currentSV;
  const { star: defaultPendingStar, uw: defaultPendingUw } = fromStarValue(defaultPendingSV);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        {studentIcon && <img src={`data:image/webp;base64,${studentIcon}`} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-neutral-800 dark:text-neutral-100 truncate">{studentName}</div>
          {totalElephNeeded !== null ? (
            <div className="text-xs text-neutral-400 dark:text-neutral-500">
              {goals.length > 0 ? t('elephCard.goalsCount', { count: goals.length, eleph: totalElephNeeded }) : t('elephCard.noGoalsSet')}
            </div>
          ) : (
            <div className="text-xs text-neutral-400 dark:text-neutral-500">{t('elephCard.setGoalsBelow')}</div>
          )}
        </div>
        {onRemove && (
          <button onClick={onRemove} className="text-xs text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors px-1">
            {t('elephCard.remove')}
          </button>
        )}
      </div>

      {/* Current star */}
      <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3">
        <div className="flex items-center gap-2">
          <span className="w-16 text-xs text-neutral-500 dark:text-neutral-400 shrink-0">{t('elephCard.current')}</span>
          <div className="flex flex-wrap gap-0.5">
            {visibleValues.map((n) => (
              <button key={n} onClick={() => handleSetCurrentSV(n)} className={starBtnCls(currentSV === n)}>
                <StarRating n={n} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Intermediate Goals */}
      <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('elephCard.intermediateGoals')}</span>
          {!showPending && (
            <button
              onClick={() => setShowPending(true)}
              className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              <FaPlus size={9} />
              {t('elephCard.addGoal')}
            </button>
          )}
        </div>

        {sortedGoals.length === 0 && !showPending && <p className="text-[11px] text-neutral-400 dark:text-neutral-500 italic">{t('elephCard.noGoalsYet')}</p>}

        {(sortedGoals.length > 0 || showPending) && (
          <div className="relative">
            <div className="absolute left-2.5 top-2 bottom-2 w-px bg-neutral-200 dark:bg-neutral-700" />
            {sortedGoals.map((goal) => (
              <div key={goal.id} className="flex mb-2.5">
                <div className="w-5 shrink-0 flex justify-center pt-1.5 relative z-10">
                  <div className="w-2 h-2 rounded-full bg-neutral-400 dark:bg-neutral-500 ring-2 ring-white dark:ring-neutral-900" />
                </div>
                <div className="flex-1 min-w-0">
                  <GoalRow
                    goal={goal}
                    minStar={currentSV}
                    maxStar={finalGoalSV}
                    contentItems={contentItems}
                    onUpdate={(patch) => onUpdateGoal(goal.id, patch)}
                    onRemove={() => onRemoveGoal(goal.id)}
                  />
                </div>
              </div>
            ))}
            {showPending && (
              <div className="flex">
                <div className="w-5 shrink-0 flex justify-center pt-1.5 relative z-10">
                  <div className="w-2 h-2 rounded-full border-2 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900" />
                </div>
                <div className="flex-1 min-w-0">
                  <PendingGoalRow
                    minStar={currentSV}
                    maxStar={finalGoalSV}
                    defaultStar={defaultPendingStar}
                    defaultUw={defaultPendingUw}
                    contentItems={contentItems}
                    onAdd={(goal) => {
                      onAddGoal(goal);
                      setShowPending(false);
                    }}
                    onCancel={() => setShowPending(false)}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Final Goal (star + deadline) */}
      <FinalGoalSection
        currentSV={currentSV}
        plan={plan}
        studentId={studentId}
        finalGoal={targetGoals[studentId]?.find((g) => g.id === 'final')}
        contentItems={contentItems}
        onFinalGoalChange={(goal) => setFinalGoal(studentId, goal)}
      />

      {/* Current eleph */}
      <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="flex-1 text-neutral-500 dark:text-neutral-400">{t('elephCard.currentEleph')}</span>
          <input
            type="number"
            className={inputCls}
            value={currentEleph}
            min={0}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              updateMaterialInventory(`Item_${studentId}`, v);
              if (plan) updatePlan(plan.uuid, 'current.eleph', v);
            }}
          />
        </div>
        {simStat && (
          <div className="flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
            <span className="flex-1">{t('elephCard.gachaAvg')}</span>
            <span className="font-mono">{t('elephCard.gachaAvgValue', { value: simStat.avgEleph.toFixed(1) })}</span>
          </div>
        )}
      </div>
    </div>
  );
}
