export const CARD_FIELDS = ['stars', 'school', 'unrecruited', 'dimUnrecruited', 'level', 'affection', 'skills', 'equipment'] as const;
export type CardField = (typeof CARD_FIELDS)[number];

export const DEFAULT_CARD_FIELDS: readonly CardField[] = ['stars'];

export const CARD_FIELDS_STORAGE_KEY = 'students.cardFields';

/** Reads the saved field list, ignoring unknown entries; anything unreadable falls back to the defaults. */
export function parseCardFields(raw: string | null): readonly CardField[] {
  if (raw === null) return DEFAULT_CARD_FIELDS;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return DEFAULT_CARD_FIELDS;
    return CARD_FIELDS.filter((field) => value.includes(field));
  } catch {
    return DEFAULT_CARD_FIELDS;
  }
}
