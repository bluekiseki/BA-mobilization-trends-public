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

// A video scroll can pass the same student more than once, or a stable frame can misfire —
// dedupe by studentId, keeping the highest-confidence result per student. Unmatched results
// (student === null) are kept individually since there is no id to dedupe on.
//
// Called once per recognized frame as results stream in live (see StudentScanCallbacks.onResult
// in pipeline.client.ts), so a row the user has already hand-edited (row.edited) is left alone
// instead of being silently overwritten by a later, possibly-lower-quality detection of the
// same student.
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
