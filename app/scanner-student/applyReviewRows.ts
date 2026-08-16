import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { useUndoRedoStore } from '~/store/planner/useUndoRedoStore';
import type { StudentReviewRow } from './reviewTypes';
import { projectReviewRow } from './reviewImpact';

const NUMERIC_FIELDS = ['level', 'star', 'uw', 'uwLevel', 'ex', 'normal', 'passive', 'sub', 'affection', 'gear'] as const;

// Merges recognized (non-null) fields into each row's GrowthPlan.current via the global
// store's own updatePlan action — reused as-is (not reimplemented) so the same
// target-invariant correction manual spreadsheet edits already get (current never exceeds
// target) applies to scanner-applied values too. Unrecognized (null) fields are left
// untouched, never coerced to 0. Returns the number of students applied.
export function applyReviewRows(rows: StudentReviewRow[]): number {
  const applicable = rows.filter((row) => row.apply && row.studentId !== null);
  if (!applicable.length) return 0;

  const { growthPlans, addPlanForStudent, updatePlan } = useGlobalStore.getState();
  useUndoRedoStore.getState().pushUndo(growthPlans);

  for (const row of applicable) {
    const studentId = row.studentId as number;
    const uuid = row.existingPlanUuid ?? addPlanForStudent(studentId);
    const recognized = row.recognized;
    const projection = projectReviewRow(row);

    for (const field of NUMERIC_FIELDS) {
      const value = recognized[field];
      if (value !== null) updatePlan(uuid, `current.${field}`, value);
    }

    if (recognized.equipment.some((v) => v !== null)) {
      const plan = useGlobalStore.getState().growthPlans.find((p) => p.uuid === uuid);
      const base = plan?.current.equipment ?? [0, 0, 0];
      const merged = base.map((existing, index) => recognized.equipment[index] ?? existing) as [number, number, number];
      updatePlan(uuid, 'current.equipment', merged);
    }

    if (recognized.potential.hp !== null || recognized.potential.atk !== null || recognized.potential.heal !== null) {
      const plan = useGlobalStore.getState().growthPlans.find((p) => p.uuid === uuid);
      const base = plan?.current.potential ?? { hp: 0, atk: 0, heal: 0 };
      updatePlan(uuid, 'current.potential', {
        hp: recognized.potential.hp ?? base.hp,
        atk: recognized.potential.atk ?? base.atk,
        heal: recognized.potential.heal ?? base.heal,
      });
    }

    for (const field of NUMERIC_FIELDS) updatePlan(uuid, `target.${field}`, projection.target[field]);
    updatePlan(uuid, 'target.equipment', projection.target.equipment);
    updatePlan(uuid, 'target.potential', projection.target.potential);
  }

  return applicable.length;
}
