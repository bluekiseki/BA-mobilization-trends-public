import type { Student } from '~/types/plannerData';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';

export type Box = { x: number; y: number; width: number; height: number };

export type Circle = { x: number; y: number; radius: number };

export type Anchors = {
  damageBadge: Box;
  armorBadge: Box;
  moodCircles: Circle[];
};

export type FixedLayout = {
  anchors: Anchors;
  panelBorders: [number, number];
  votes: number;
};

export type CandidateFrame = {
  frameIndex: number;
  time: number;
  blob: Blob;
};

// The fields matchStudents/filterByEquipment/etc. need out of this app's own Student type —
// derived (not duplicated) so it can never drift from the source type.
export type StudentRecord = Pick<
  Student,
  'Id' | 'Name' | 'StarGrade' | 'SquadType' | 'Position' | 'BulletType' | 'ArmorType' | 'StreetBattleAdaptation' | 'OutdoorBattleAdaptation' | 'IndoorBattleAdaptation' | 'Equipment' | 'Weapon'
>;

export type SkillState = { raw: string; max: boolean; level: number | null };

export type ReviewOverlayField =
  'level' | 'star' | 'uw' | 'uwLevel' | 'affection' | 'ex' | 'normal' | 'passive' | 'sub' | 'equipment1' | 'equipment2' | 'equipment3' | 'gear' | 'potentialHp' | 'potentialAtk' | 'potentialHeal';

export type ReviewOverlay = { field: ReviewOverlayField; box: Box };

export type ExtractionTiming = {
  decodeLayoutMs: number;
  prepareMs: number;
  ocrMs: number;
  equipmentMs: number;
  matchingMs: number;
  totalMs: number;
};

// Recursively nullable — OCR/detection can fail on any given field (including individual
// equipment slots and potential stats), and this pipeline should not fabricate values it
// isn't confident about.
type DeepNullable<T> = T extends object ? { [K in keyof T]: DeepNullable<T[K]> } : T | null;

// Derived from GrowthPlan.current (app/types/growthPlan.ts) — every field nullable except
// affectionExp/eleph, which are never detected (always 0, see extract.ts) — so
// applyReviewRows.ts can write recognized fields straight into a plan's `current` block with
// no adapter.
export type StudentCurrent = DeepNullable<Omit<GrowthPlan['current'], 'affectionExp' | 'eleph'>> & Pick<GrowthPlan['current'], 'affectionExp' | 'eleph'>;

export type StudentResult = {
  frameIndex: number;
  time: number;
  previewUrl: string;
  sourceSize: { width: number; height: number };
  reviewOverlay: ReviewOverlay[];
  student: { id: number; name: string; confidence: number | null } | null;
  candidates: number;
  current: StudentCurrent;
  // Diagnostic/review-only data behind the growth-shaped `current` values above.
  raw: {
    skills: Record<'ex' | 'normal' | 'passive' | 'sub', SkillState>;
    equipment: { type: string | null; tier: number | null; raw: string }[];
    gear: { equipped: boolean | null; raw: string };
    // `defense` is kept for diagnostics only; it does not correspond to a real
    // in-game potential stat (quadrant misdetection, see GROWTHPLAN_MAPPING.md).
    potential: { hp: string; attack: string; defense: string; heal: string };
  };
  debug: { bulletType?: string; armorType?: string; position?: string; positionRaw?: string; squadType?: string; terrain?: string[]; terrainConflict: boolean; layout: 'voted' | 'per-frame' };
};
