import { getGrowthPlansSyncValue } from '../planner/useGlobalStore';
import { getEquipmentPlanSyncValue } from '../planner/useEquipmentPlanStore';
import { getResourcePlanData, useResourcePlanStore } from '../planner/useResourcePlanStore';
import { getRaidHistorySyncValue } from '../planner/useRaidHistoryStore';
import { getGachaHistorySyncValue } from '../planner/useGachaHistoryStore';
import { useEventPlanStore } from '../planner/useEventPlanStore';
import { safeLocalStorage } from './localPersistence';

export function readLocalProfile(): Map<string, unknown> {
  const values = new Map<string, unknown>([
    ['growthPlans', getGrowthPlansSyncValue()],
    ['equipmentPlan', getEquipmentPlanSyncValue()],
    ['resourcePlan', getResourcePlanData(useResourcePlanStore.getState())],
    ['raidHistory', getRaidHistorySyncValue()],
    ['gachaHistory', getGachaHistorySyncValue()],
    ...Object.entries(useEventPlanStore.getState().plans).map(([id, value]): [string, unknown] => [`eventPlans:${id}`, value]),
  ]);
  for (const [key, storageKeys] of [
    ['gacha_prefs', ['gacha_prefs_v1']],
    ['gacha_strategies', ['gacha_strategies_v3', 'gacha_strategies_v2']],
  ] as const) {
    for (const storageKey of storageKeys) {
      const raw = safeLocalStorage.getItem(storageKey);
      if (typeof raw !== 'string') continue;
      try {
        values.set(key, JSON.parse(raw));
        break;
      } catch {
        /* Ignore invalid legacy data. */
      }
    }
  }
  return values;
}
