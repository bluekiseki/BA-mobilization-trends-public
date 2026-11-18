import type { StudentData } from '~/types/plannerData';
import type { StudentResult } from './types';
import type { StudentReviewRow } from './reviewTypes';
import { getCombatStyleRepresentativeId } from '~/utils/combatStyle';

function toReviewRow(result: StudentResult, students: StudentData): StudentReviewRow {
  const studentId = result.student ? getCombatStyleRepresentativeId(result.student.id) : null;
  const equipmentTypes = studentId !== null ? (students[String(studentId)]?.Equipment ?? null) : null;
  const starGrade = studentId !== null ? (students[String(studentId)]?.StarGrade ?? 1) : 1;
  return {
    studentId,
    name: studentId !== null ? (students[String(studentId)]?.Name ?? result.student?.name ?? '') : '',
    equipmentTypes,
    starGrade,
    confidence: result.student?.confidence ?? null,
    previewUrl: result.previewUrl,
    sourceSize: result.sourceSize,
    reviewOverlay: result.reviewOverlay,
    apply: studentId !== null,
    detected: structuredClone(result.current),
    recognized: structuredClone(result.current),
    edited: false,
  };
}

// Dedupe by studentId (keeping highest-confidence), but leave already-edited rows untouched.
export function mergeReviewRow(rows: StudentReviewRow[], result: StudentResult, students: StudentData): { rows: StudentReviewRow[]; duplicate: boolean } {
  if (result.student === null) {
    return { rows: [...rows, toReviewRow(result, students)], duplicate: false };
  }

  const representativeId = getCombatStyleRepresentativeId(result.student.id);
  const index = rows.findIndex((row) => row.studentId === representativeId);
  if (index === -1) {
    return { rows: [...rows, toReviewRow(result, students)], duplicate: false };
  }

  const existing = rows[index];
  if (existing.edited || (existing.confidence ?? -1) >= (result.student.confidence ?? -1)) {
    return { rows, duplicate: true };
  }

  const next = [...rows];
  next[index] = toReviewRow(result, students);
  return { rows: next, duplicate: true };
}
