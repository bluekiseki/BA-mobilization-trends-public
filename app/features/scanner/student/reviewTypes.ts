import type { Student } from '~/types/plannerData';
import type { ReviewOverlay, StudentCurrent } from './types';

// One row per recognized student in the review-and-apply UI (StudentScanner glue —
// not part of the ported pipeline, so it lives outside pipeline/ and types.ts).
export interface StudentReviewRow {
  studentId: number | null;
  name: string;
  equipmentTypes: Student['Equipment'] | null;
  // Student's base rarity, used to seed the default target star when no growth
  // plan exists yet — prevents dispatch/low-rarity students from defaulting to 5★.
  starGrade: number;
  confidence: number | null;
  // The source frame gives the user evidence for the OCR values shown in the review card.
  previewUrl: string;
  sourceSize: { width: number; height: number };
  reviewOverlay: ReviewOverlay[];
  apply: boolean;
  detected: StudentCurrent;
  recognized: StudentCurrent;
  // True once the user has hand-edited a recognized field — protects the row from being
  // silently overwritten by a later live-scan duplicate detection of the same student.
  edited: boolean;
}
