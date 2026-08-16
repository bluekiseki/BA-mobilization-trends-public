import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Student } from '~/types/plannerData';
import type { ReviewOverlay, StudentCurrent } from './types';

// One row per recognized student in the review-and-apply UI (StudentScanner glue —
// not part of the ported pipeline, so it lives outside pipeline/ and types.ts).
export interface StudentReviewRow {
  studentId: number | null;
  name: string;
  portrait: string | undefined;
  equipmentTypes: Student['Equipment'] | null;
  confidence: number | null;
  // The source frame gives the user evidence for the OCR values shown in the review card.
  previewUrl: string;
  sourceSize: { width: number; height: number };
  reviewOverlay: ReviewOverlay[];
  apply: boolean;
  detected: StudentCurrent;
  recognized: StudentCurrent;
  plannerCurrent: GrowthPlan['current'] | null;
  plannerTarget: GrowthPlan['target'] | null;
  existingPlanUuid: string | null;
  // True once the user has hand-edited a recognized field — protects the row from being
  // silently overwritten by a later live-scan duplicate detection of the same student.
  edited: boolean;
}
