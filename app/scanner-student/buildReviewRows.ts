import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { StudentData, StudentPortraitData } from '~/types/plannerData';
import type { StudentResult } from './types';
import type { StudentReviewRow } from './reviewTypes';

function toReviewRow(result: StudentResult, growthPlans: GrowthPlan[], portraits: StudentPortraitData, students: StudentData): StudentReviewRow {
  const studentId = result.student?.id ?? null;
  const plan = studentId !== null ? (growthPlans.find((p) => p.studentId === studentId) ?? null) : null;
  const equipmentTypes = studentId !== null ? (students[String(studentId)]?.Equipment ?? null) : null;
  return {
    studentId,
    name: result.student?.name ?? '',
    portrait: studentId !== null ? portraits[studentId] : undefined,
    equipmentTypes,
    confidence: result.student?.confidence ?? null,
    previewUrl: result.previewUrl,
    sourceSize: result.sourceSize,
    reviewOverlay: result.reviewOverlay,
    apply: studentId !== null,
    detected: structuredClone(result.current),
    recognized: structuredClone(result.current),
    plannerCurrent: plan?.current ?? null,
    plannerTarget: plan?.target ?? null,
    existingPlanUuid: plan?.uuid ?? null,
    edited: false,
  };
}

// Dedupe by studentId (keeping highest-confidence), but leave already-edited rows untouched.
export function mergeReviewRow(
  rows: StudentReviewRow[],
  result: StudentResult,
  growthPlans: GrowthPlan[],
  portraits: StudentPortraitData,
  students: StudentData,
): { rows: StudentReviewRow[]; duplicate: boolean } {
  if (result.student === null) {
    return { rows: [...rows, toReviewRow(result, growthPlans, portraits, students)], duplicate: false };
  }

  const index = rows.findIndex((row) => row.studentId === result.student?.id);
  if (index === -1) {
    return { rows: [...rows, toReviewRow(result, growthPlans, portraits, students)], duplicate: false };
  }

  const existing = rows[index];
  if (existing.edited || (existing.confidence ?? -1) >= (result.student.confidence ?? -1)) {
    return { rows, duplicate: true };
  }

  const next = [...rows];
  next[index] = toReviewRow(result, growthPlans, portraits, students);
  return { rows: next, duplicate: true };
}
