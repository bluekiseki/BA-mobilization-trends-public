import { z } from 'zod';
import { resolveProfileDataKey, validateProfileDataValue } from '~/schemas/profileDataValidation';
import { downloadProfileFile } from '~/utils/profileFile';
import { editHistory } from './history/history';
import { readLocalProfile } from './history/profileSnapshot';
import { applyProfileData } from './syncStore';

const localKeys = new Set(['growthPlans', 'equipmentPlan', 'resourcePlan', 'raidHistory', 'gachaHistory', 'gacha_prefs', 'gacha_strategies']);
const supported = (key: string) => localKeys.has(key) || key.startsWith('eventPlans:');
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export function parseLocalProfileFile(text: string): Map<string, unknown> {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new Error('Invalid file size');
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) throw new Error('Invalid file format');
  const data = parsed.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid file format');
  const entries = Object.entries(data).filter(([key]) => supported(key));
  if (!entries.length || entries.length > 500) throw new Error('Invalid data keys');
  return new Map(
    entries.map(([key, value]) => {
      validateProfileDataValue(key, value);
      const schema = resolveProfileDataKey(key)?.schema;
      // Imported data must never overwrite store methods or transient state.
      return [key, value !== null && schema instanceof z.ZodObject ? schema.strip().parse(value) : value];
    }),
  );
}

export function exportLocalProfile(): void {
  downloadProfileFile({ data: Object.fromEntries(readLocalProfile()) }, `yuzu-local-${new Date().toISOString().slice(0, 10)}.profile.json`);
}

export function importLocalProfile(values: Map<string, unknown>): void {
  editHistory.action('import', () => {
    for (const [key, value] of values) applyProfileData(key, value, 'local');
  });
}
