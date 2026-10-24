import { type LocaleShortName } from '~/utils/i18n/config';
import bossData from '~/data/bossdata.json';

type BossDataMap = Record<string, { name: Record<string, string | null> }>;
const TERRAIN_TYPES = new Set(['Outdoor', 'Indoor', 'Street']);
const ARMOR_TYPES = new Set(['LightArmor', 'HeavyArmor', 'Unarmed', 'ElasticArmor', 'SpecialArmor']);
export function extractBossKeyAndArmorType(field: string): { bossKey: string; armorType: string | null } {
  const parts = field.split('_');
  const last = parts[parts.length - 1];
  if (ARMOR_TYPES.has(last)) return { bossKey: parts.slice(0, -1).join('_'), armorType: last };
  return { bossKey: field, armorType: null };
}
export function extractLocation(bossKey: string): string {
  const parts = bossKey.split('_');
  const last = parts[parts.length - 1];
  return TERRAIN_TYPES.has(last) ? last : '';
}
// ─── Types ────────────────────────────────────────────────────────────────────

export interface StatusRaid {
  id: string;
  bossName: string;
  location: string;
  isGrand: boolean;
  status: 'live' | 'active' | 'upcoming'; // live = /live page, active = dashboard available, upcoming = not started yet (no link)
  endDateIso?: string; // available for live (+7d) and GL/KR CSV
  startDateIso?: string; // available for live (+7d) and GL/KR CSV
  types?: string[]; // defense types for Grand Assault (LightArmor, HeavyArmor, …)
  noLink?: boolean; // In progress in CSV but live/dashboard data not ready -> no link
}
// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getBossName(bossKey: string, locale: LocaleShortName): string {
  const bossDataMap = bossData as BossDataMap;
  if (bossKey in bossDataMap) return bossDataMap[bossKey].name[locale] || bossKey;
  const shortBossKey = bossKey.split('_')[0];
  if (shortBossKey in bossDataMap) return bossDataMap[shortBossKey].name[locale] || shortBossKey;
  return bossKey;
}
