import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { StudentData, StudentPortraitData } from '~/types/plannerData';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { useSpreadsheetDraftStore } from '~/store/planner/useSpreadsheetDraftStore';
import { useUndoRedoStore } from '~/store/planner/useUndoRedoStore';
import { useDraftUndoRedoStore } from '~/store/planner/useDraftUndoRedoStore';
import { useTranslation } from 'react-i18next';
import { SpreadsheetHeader } from './SpreadsheetHeader';
import { SpreadsheetTableRow } from './SpreadsheetTableRow';
import { compareRows, type Row } from './spreadsheetSort';
import { MdKeyboard, MdExpandMore, MdChevronRight, MdWarning, MdSave, MdClose } from 'react-icons/md';

interface Props {
  allStudents: StudentData;
  studentPortraits: StudentPortraitData;
  searchTerm: string;
  showOnlySelected: boolean;
}

export function StudentSpreadsheetView({ allStudents, studentPortraits, searchTerm, showOnlySelected }: Props) {
  const [isMobile, setIsMobile] = useState(false);
  const [screenWidth, setScreenWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);
  const [sortStack, setSortStack] = useState<{ field: string; direction: 'asc' | 'desc' }[]>([]);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedRowsOrderRef = useRef<Map<number, number> | null>(null);

  const growthPlans = useGlobalStore((s) => s.growthPlans);
  const setGrowthPlans = useGlobalStore((s) => s.setGrowthPlans);
  // const globalRemovePlan = useGlobalStore((s) => s.removePlan);
  // const addPlan = useGlobalStore((s) => s.addPlan);
  const { undo, redo, pushUndo } = useUndoRedoStore();

  const draftPlans = useSpreadsheetDraftStore((s) => s.draftPlans);
  const updateDraft = useSpreadsheetDraftStore((s) => s.updateDraft);
  const addDraftPlan = useSpreadsheetDraftStore((s) => s.addDraftPlan);
  const removeDraftPlan = useSpreadsheetDraftStore((s) => s.removeDraftPlan);
  const initializeDraft = useSpreadsheetDraftStore((s) => s.initializeDraft);
  const saveDraft = useSpreadsheetDraftStore((s) => s.saveDraft);
  const discardDraft = useSpreadsheetDraftStore((s) => s.discardDraft);
  const hasPendingChanges = useSpreadsheetDraftStore((s) => s.hasPendingChanges);

  const draftPushUndo = useDraftUndoRedoStore((s) => s.pushUndo);
  const draftUndo = useDraftUndoRedoStore((s) => s.undo);
  const draftRedo = useDraftUndoRedoStore((s) => s.redo);
  const draftClear = useDraftUndoRedoStore((s) => s.clear);

  const updatePlan = useCallback(
    (uuid: string, field: string, value: unknown, saveUndo = true) => {
      if (saveUndo) draftPushUndo(draftPlans);
      // console.log('updateDraft',uuid, field, value)
      updateDraft(uuid, field, value);
    },
    [updateDraft, draftPlans, draftPushUndo],
  );

  // const removePlan = useCallback(
  //   (uuid: string) => {
  //     const updatedPlans = draftPlans.filter((p) => p.uuid !== uuid);
  //     initializeDraft(updatedPlans);
  //   },
  //   [draftPlans, initializeDraft],
  // );

  const handleSort = (field: string) => {
    setSortStack((prev) => {
      const existing = prev.find((s) => s.field === field);
      if (existing) {
        if (existing.direction === 'asc') {
          return prev.map((s) => (s.field === field ? { ...s, direction: 'desc' as const } : s));
        } else {
          return prev.filter((s) => s.field !== field);
        }
      } else {
        return [...prev, { field, direction: 'asc' }];
      }
    });
  };

  const getSortIcon = (field: string) => {
    const sort = sortStack.find((s) => s.field === field);
    if (!sort) return '';
    const icon = sort.direction === 'asc' ? '↑' : '↓';
    return ` ${icon}`;
  };

  const { t: t_club } = useTranslation('club', { keyPrefix: 'short' });
  const { t } = useTranslation('planner', { keyPrefix: 'spreadsheet' });

  const starUwOptions = useMemo(
    () =>
      [
        { label: t('starOptions.star1'), star: 1, uw: 0 },
        { label: t('starOptions.star2'), star: 2, uw: 0 },
        { label: t('starOptions.star3'), star: 3, uw: 0 },
        { label: t('starOptions.star4'), star: 4, uw: 0 },
        { label: t('starOptions.star5'), star: 5, uw: 0 },
        { label: t('starOptions.ue1'), star: 5, uw: 1 },
        { label: t('starOptions.ue2'), star: 5, uw: 2 },
        { label: t('starOptions.ue3'), star: 5, uw: 3 },
        { label: t('starOptions.ue4'), star: 5, uw: 4 },
      ] as const,
    [t],
  );

  useEffect(() => {
    initializeDraft(growthPlans);
    draftClear();
  }, [growthPlans, initializeDraft, draftClear]);

  useEffect(() => {
    const check = () => {
      setScreenWidth(window.innerWidth);
      setIsMobile(window.innerWidth < 768);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S or Cmd+S: Save draft
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (hasPendingChanges) {
          saveDraft((plans) => {
            pushUndo(growthPlans);
            setGrowthPlans(plans);
            draftClear();
          });
        }
      }
      // Ctrl+Shift+Z or Cmd+Shift+Z: Redo
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (hasPendingChanges) {
          const nextPlans = draftRedo(draftPlans);
          if (nextPlans) {
            initializeDraft(nextPlans, true);
          }
        } else {
          const nextState = redo(growthPlans);
          if (nextState) setGrowthPlans(nextState);
        }
      }
      // Ctrl+Z or Cmd+Z: Undo
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (hasPendingChanges) {
          const prevPlans = draftUndo(draftPlans);
          if (prevPlans) {
            initializeDraft(prevPlans, true);
          }
        } else {
          const prevState = undo(growthPlans);
          if (prevState) setGrowthPlans(prevState);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, growthPlans, setGrowthPlans, hasPendingChanges, saveDraft, draftPlans, draftUndo, draftRedo, initializeDraft, draftClear, pushUndo]);

  const planByStudentId = useMemo(() => {
    const map = new Map<number, GrowthPlan>();
    for (const plan of draftPlans) {
      if (plan.studentId !== null && !map.has(plan.studentId)) {
        map.set(plan.studentId, plan);
      }
    }
    return map;
  }, [draftPlans]);

  const rows = useMemo(() => {
    // console.log('[StudentSpreadsheetView] rows useMemo recalculating');
    const lower = searchTerm.toLowerCase();
    const unsorted = Object.entries(allStudents)
      .filter(([, v]) => !v.StyleId)
      .map(([id, student]): Row => {
        const sid = parseInt(id);
        const plan = planByStudentId.get(sid) ?? null;
        return {
          studentId: sid,
          name: student.Name,
          school: (t_club as (key: string, defaultValue?: string) => string)(
            ((x: string) => {
              if (['Sakugawa', 'ETC', 'Tokiwadai'].includes(x)) return 'ETC';
              return x;
            })(student.School),
            student.School,
          ),
          portrait: studentPortraits[sid],
          plan,
          hasGear: Object.keys(student.Gear ?? {}).length > 0,
          minStar: student.StarGrade ?? 1,
        };
      })
      .filter((row) => {
        if (lower && !row.name.toLowerCase().includes(lower)) return false;
        if (showOnlySelected) {
          if (!row.plan || !row.plan.isSelected) return false;
        }
        return true;
      })
      .sort((a, b) => compareRows(a, b, sortStack));

    if (!hasPendingChanges) {
      // After saving: save new sort state
      savedRowsOrderRef.current = new Map(unsorted.map((r, i) => [r.studentId, i]));
      return unsorted;
    } else {
      // While drafting: maintain saved order
      if (!savedRowsOrderRef.current) {
        savedRowsOrderRef.current = new Map(unsorted.map((r, i) => [r.studentId, i]));
        return unsorted;
      }

      const savedMap = savedRowsOrderRef.current;
      return unsorted.sort((a, b) => {
        const aOrder = savedMap.get(a.studentId) ?? 9999;
        const bOrder = savedMap.get(b.studentId) ?? 9999;
        return aOrder - bOrder;
      });
    }
  }, [allStudents, studentPortraits, planByStudentId, searchTerm, showOnlySelected, sortStack, t_club, hasPendingChanges]);

  const handleAdd = useCallback(
    (studentId: number) => {
      draftPushUndo(draftPlans);
      const uuid = addDraftPlan(studentId);
      if (uuid) updatePlan(uuid, 'studentId', studentId, false);
    },
    [addDraftPlan, updatePlan, draftPlans, draftPushUndo],
  );

  const handleRemove = useCallback(
    (uuid: string) => {
      // if (window.confirm(t('messages.deleteConfirm'))) {
      draftPushUndo(draftPlans);
      removeDraftPlan(uuid);
      // }
    },
    [removeDraftPlan, t, draftPlans, draftPushUndo],
  );

  const handleStarUw = useCallback(
    (uuid: string, section: 'current' | 'target', idx: number) => {
      draftPushUndo(draftPlans);
      const opt = starUwOptions[idx];
      updatePlan(uuid, `${section}.star`, opt.star, false);
      updatePlan(uuid, `${section}.uw`, opt.uw, false);
      if (opt.uw === 0) updatePlan(uuid, `${section}.uwLevel`, 1, false);
    },
    [updatePlan, starUwOptions, draftPlans, draftPushUndo],
  );

  const handleEquip = useCallback(
    (uuid: string, section: 'current' | 'target', idx: number, val: number, equip: [number, number, number]) => {
      draftPushUndo(draftPlans);
      const next = [...equip] as [number, number, number];
      next[idx] = val;
      // console.log('handleEquip', uuid, `${section}.equipment`, next)
      updatePlan(uuid, `${section}.equipment`, next, false);
    },
    [updatePlan, draftPlans, draftPushUndo],
  );

  const hGroup = 'text-xs font-bold text-center px-1 py-1 border-r border-b border-neutral-200 dark:border-neutral-700 whitespace-nowrap';
  const hField = 'text-xs font-medium text-center px-0.5 py-0.5 border-r border-b border-neutral-200 dark:border-neutral-700 whitespace-nowrap';
  const td = 'border-r border-b border-neutral-100 dark:border-neutral-800 text-center p-0';
  const inp =
    'w-12 text-xs text-center bg-transparent border-0 focus:ring-1 focus:ring-blue-400 focus:outline-none rounded py-0.5 dark:text-neutral-200 disabled:text-neutral-300 dark:disabled:text-neutral-600';
  const sel = 'text-xs bg-transparent border-0 focus:ring-1 focus:ring-blue-400 rounded dark:text-neutral-200 cursor-pointer py-0.5 w-[80px]';

  const L = { add: 0, sel: 40, icon: 80, name: 112, school: 232 };
  const hClass = { td, inp, sel, L };

  return (
    <div className="w-full space-y-2">
      {isMobile && (
        <div className="text-xs px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200 rounded flex items-center gap-2">
          <MdWarning className="shrink-0" size={16} />
          {t('messages.mobileWarning')}
        </div>
      )}

      {hasPendingChanges && (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-200 rounded">
          <span className="text-sm font-semibold">{t('messages.unsavedChanges')}</span>
          <button
            onClick={() =>
              saveDraft((plans) => {
                pushUndo(growthPlans);
                setGrowthPlans(plans);
                draftClear();
              })
            }
            className="ml-auto px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded font-semibold flex items-center gap-1"
          >
            <MdSave size={14} />
            {t('messages.save')}
          </button>
          <button onClick={() => discardDraft()} className="px-3 py-1 bg-neutral-400 hover:bg-neutral-500 text-white text-xs rounded font-semibold flex items-center gap-1">
            <MdClose size={14} />
            {t('messages.cancel')}
          </button>
        </div>
      )}

      <div className="text-xs px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 rounded">
        <button onClick={() => setShowKeyboardShortcuts(!showKeyboardShortcuts)} className="font-semibold hover:underline flex items-center gap-1">
          <MdKeyboard className="w-4 h-4" />
          {t('messages.keyboardShortcutsTitle')}
          {showKeyboardShortcuts ? <MdExpandMore className="w-4 h-4" /> : <MdChevronRight className="w-4 h-4" />}
        </button>
        {showKeyboardShortcuts && (
          <div className="mt-3 space-y-1.5 text-blue-700 dark:text-blue-300">
            <div className="flex items-start gap-2">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-neutral-800 border border-current rounded text-xs min-w-fit">Ctrl/Cmd+D</kbd>
              <span>{t('messages.shortcutCopyAbove')}</span>
            </div>
            <div className="flex items-start gap-2">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-neutral-800 border border-current rounded text-xs min-w-fit">Enter</kbd>
              <span>{t('messages.shortcutNextRow')}</span>
            </div>
            <div className="flex items-start gap-2">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-neutral-800 border border-current rounded text-xs min-w-fit">Tab</kbd>
              <span>{t('messages.shortcutNextCell')}</span>
            </div>
            <div className="flex items-start gap-2">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-neutral-800 border border-current rounded text-xs min-w-fit">Shift+Tab</kbd>
              <span>{t('messages.shortcutPrevCell')}</span>
            </div>
            <div className="flex items-start gap-2">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-neutral-800 border border-current rounded text-xs min-w-fit">M</kbd>
              <span>{t('messages.shortcutSetMax')}</span>
            </div>
            <div className="flex items-start gap-2">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-neutral-800 border border-current rounded text-xs min-w-fit">Ctrl/⌘+Z</kbd>
              <span>{t('messages.shortcutUndo')}</span>
            </div>
            <div className="flex items-start gap-2">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-neutral-800 border border-current rounded text-xs min-w-fit">Ctrl/⌘+Shift+Z</kbd>
              <span>{t('messages.shortcutRedo')}</span>
            </div>
            <div className="flex items-start gap-2">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-neutral-800 border border-current rounded text-xs min-w-fit">Ctrl/⌘+S</kbd>
              <span>{t('messages.shortcutSave')}</span>
            </div>
          </div>
        )}
      </div>

      {sortStack.length > 0 && (
        <div className="text-sm px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 rounded">
          {t('messages.sortLabel')}{' '}
          {sortStack
            .map((s) => {
              const sortLabels: Record<string, string> = {
                hasPlan: t('sortLabels.hasPlan'),
                isSelected: t('sortLabels.isSelected'),
                school: t('sortLabels.school'),
                name: t('sortLabels.name'),
                level: t('sortLabels.currentLevel'),
                star: t('sortLabels.currentRank'),
                uwLevel: t('sortLabels.currentUeLevel'),
                affection: t('sortLabels.currentAffection'),
                affectionExp: t('sortLabels.currentExperience'),
                targetLevel: t('sortLabels.targetLevel'),
                targetStar: t('sortLabels.targetRank'),
                targetUwLevel: t('sortLabels.targetUeLevel'),
                targetAffection: t('sortLabels.targetAffection'),
                currentEquipment0: t('sortLabels.currentEquipment1'),
                currentEquipment1: t('sortLabels.currentEquipment2'),
                currentEquipment2: t('sortLabels.currentEquipment3'),
                currentGear: t('sortLabels.currentBondGear'),
                targetEquipment0: t('sortLabels.targetEquipment1'),
                targetEquipment1: t('sortLabels.targetEquipment2'),
                targetEquipment2: t('sortLabels.targetEquipment3'),
                targetGear: t('sortLabels.targetBondGear'),
                ex: 'EX',
                normal: 'N',
                passive: 'P',
                sub: 'S',
                acquiredDate: t('sortLabels.acquiredDate'),
              };
              return `${sortLabels[s.field] || s.field} ${s.direction === 'asc' ? '↑' : '↓'}`;
            })
            .join(' > ')}
          <button onClick={() => setSortStack([])} className="ml-3 text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 dark:hover:bg-blue-600">
            {t('messages.resetSort')}
          </button>
        </div>
      )}

      <div className="text-sm text-neutral-600 dark:text-neutral-400 px-3 py-2">
        {t('messages.recruitedStudents')}: <span className="font-semibold text-neutral-900 dark:text-neutral-100">{rows.filter((r) => r.plan !== null).length}</span>
      </div>

      <div className="w-full overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
        <div ref={scrollContainerRef} className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 250px)', overscrollBehaviorX: 'contain', transform: 'translateZ(0)' }}>
          <table className="border-collapse text-xs" style={{ minWidth: 'min-content' }}>
            <SpreadsheetHeader hGroup={hGroup} hField={hField} L={L} handleSort={handleSort} getSortIcon={getSortIcon} screenWidth={screenWidth} />

            <tbody>
              {rows.map((row, rowIndex) => (
                <SpreadsheetTableRow
                  key={row.studentId}
                  row={row}
                  rowIndex={rowIndex}
                  plan={row.plan}
                  starUwOptions={starUwOptions}
                  updatePlan={updatePlan}
                  handleAdd={handleAdd}
                  handleRemove={handleRemove}
                  handleStarUw={handleStarUw}
                  handleEquip={handleEquip}
                  screenWidth={screenWidth}
                  hClass={hClass}
                  // t={(key: string) => t(key as any)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
