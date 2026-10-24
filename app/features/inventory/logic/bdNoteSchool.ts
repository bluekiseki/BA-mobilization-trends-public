// School order for tactical BD (Item_3000+school*10+grade) and tech notes (Item_4000+school*10+grade).
// Verified against icon_info.json on 2026-08-20 — do not reorder without re-verifying. Labels live in app/locales/*/club.json.
export const BD_NOTE_SCHOOL_ORDER = ['Hyakkiyako', 'RedWinter', 'Trinity', 'Gehenna', 'Abydos', 'Millennium', 'Arius', 'Shanhaijing', 'Valkyrie', 'Highlander', 'WildHunt'] as const;

export type BdNoteSchoolKey = (typeof BD_NOTE_SCHOOL_ORDER)[number];

export type BdNoteGrade = 0 | 1 | 2 | 3;

// Grade tiers reuse the game's N/R/SR/SSR rarity naming rather than "basic/normal/advanced/premium".
export const BD_NOTE_GRADE_LABEL: Record<BdNoteGrade, string> = {
  0: 'N',
  1: 'R',
  2: 'SR',
  3: 'SSR',
};

export function getBdNoteItemKey(base: 3000 | 4000, schoolIndex: number, grade: BdNoteGrade): string {
  return `Item_${base + schoolIndex * 10 + grade}`;
}

// Decode: given a BD/Note item id (e.g. 3023), recover its school key. Returns null if out of range.
export function getBdNoteSchoolKey(id: number, base: 3000 | 4000): BdNoteSchoolKey | null {
  const schoolIndex = Math.floor((id - base) / 10);
  return BD_NOTE_SCHOOL_ORDER[schoolIndex] ?? null;
}
