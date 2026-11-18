import type { TFunction } from 'i18next';
import { getConflictStats } from './profileDataStats';

export function profileSummary(key: string, value: unknown, t: TFunction<'auth'>, locale: string): string {
  return getConflictStats(key, value)
    .map((stat) =>
      stat.key === 'inventoryTotal'
        ? t('settings.profiles.stats.inventory', { total: stat.value.toLocaleString(locale) })
        : `${t(`settings.profiles.stats.${stat.key}`)} ${stat.value.toLocaleString(locale)}`,
    )
    .join(' · ');
}

const STORAGE_PROFILE_KEYS: Record<string, string> = {
  'global-growth-plans-v2': 'growthPlans',
  'equipment-plan-storage': 'equipmentPlan',
  'resource-plan-v2': 'resourcePlan',
  'raid-history-v1': 'raidHistory',
  'gacha-history-v1': 'gachaHistory',
  gacha_strategies_v3: 'gacha_strategies',
  gacha_strategies_v2: 'gacha_strategies',
};

export function storageProfileSummary(key: string, value: unknown, t: TFunction<'auth'>, locale: string): string {
  const state = value !== null && typeof value === 'object' && 'state' in value ? value.state : value;
  if (key === 'event-plans-v2') {
    const plans = state !== null && typeof state === 'object' && 'plans' in state ? state.plans : null;
    const count = plans !== null && typeof plans === 'object' ? Object.keys(plans).length : 0;
    return `${t('settings.profiles.stats.eventPlans')} ${count.toLocaleString(locale)}`;
  }
  return profileSummary(STORAGE_PROFILE_KEYS[key] ?? key, state, t, locale);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export const sameProfileValue = (a: unknown, b: unknown) => canonical(a) === canonical(b);

// Compare collections by stable entity identifiers; other fields remain single settings.
function entities(value: unknown, prefix = '', result = new Map<string, unknown>()) {
  if (Array.isArray(value)) {
    value.forEach((item: unknown, index) => {
      const record = item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const candidate = record.uuid ?? record.id ?? record.studentId;
      const id = typeof candidate === 'string' || typeof candidate === 'number' ? candidate : index;
      result.set(`${prefix}/${String(id)}`, item);
    });
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) entities(item, prefix ? `${prefix}/${key}` : key, result);
  } else if (value !== null && value !== undefined) result.set(prefix, value);
  return result;
}
export function compareProfileValues(current: unknown, target: unknown) {
  const before = entities(current);
  const after = entities(target);
  const changes: Array<{ id: string; kind: 'added' | 'removed' | 'modified' }> = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (!before.has(id)) changes.push({ id, kind: 'added' });
    else if (!after.has(id)) changes.push({ id, kind: 'removed' });
    else if (!sameProfileValue(before.get(id), after.get(id))) changes.push({ id, kind: 'modified' });
  }
  return {
    same: sameProfileValue(current, target),
    changes,
    added: changes.filter((item) => item.kind === 'added').length,
    removed: changes.filter((item) => item.kind === 'removed').length,
    modified: changes.filter((item) => item.kind === 'modified').length,
  };
}
