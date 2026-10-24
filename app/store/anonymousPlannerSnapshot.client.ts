import { getGrowthPlansSyncValue } from './planner/useGlobalStore';
import { getEquipmentPlanSyncValue } from './planner/useEquipmentPlanStore';
import { getResourcePlanData, useResourcePlanStore } from './planner/useResourcePlanStore';
import { useEventPlanStore } from './planner/useEventPlanStore';
import { getRaidHistorySyncValue } from './planner/useRaidHistoryStore';
import { getGachaHistorySyncValue } from './planner/useGachaHistoryStore';
import type { ProfileDataKey } from '~/schemas/profileDataValidation';

export interface AnonymousPlannerSnapshot {
  values: Partial<Record<ProfileDataKey, unknown>>;
}

function storageKey(userId: string, profileId: string): string {
  return `yuzu-anonymous-planner-v1:${userId}:${profileId}`;
}

function createSnapshot(): AnonymousPlannerSnapshot | null {
  const growth = getGrowthPlansSyncValue();
  const equipment = getEquipmentPlanSyncValue();
  const events = useEventPlanStore.getState();
  const raids = getRaidHistorySyncValue();
  const gacha = getGachaHistorySyncValue();
  const hasMeaningfulData =
    growth.growthPlans.length > 0 ||
    Object.keys(growth.ownedGifts).length > 0 ||
    Object.keys(growth.materialInventory).length > 0 ||
    Object.keys(equipment.runCounts).length > 0 ||
    Object.keys(events.plans).length > 0 ||
    raids.entries.length > 0 ||
    gacha.entries.length > 0;
  if (!hasMeaningfulData) return null;

  return {
    values: {
      growthPlans: growth,
      equipmentPlan: equipment,
      resourcePlan: getResourcePlanData(useResourcePlanStore.getState()),
      ...Object.fromEntries(Object.entries(events.plans).map(([eventId, value]) => [`eventPlans:${eventId}`, value])),
      raidHistory: raids,
      gachaHistory: gacha,
    },
  };
}

export function preserveAnonymousPlannerSnapshot(userId: string, profileId: string): void {
  try {
    if (localStorage.getItem(storageKey(userId, profileId))) return;
    const snapshot = createSnapshot();
    if (snapshot) localStorage.setItem(storageKey(userId, profileId), JSON.stringify(snapshot));
  } catch (error) {
    console.error('Failed to preserve anonymous planner data:', error);
  }
}

export function getAnonymousPlannerSnapshot(userId: string, profileId: string): AnonymousPlannerSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, profileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnonymousPlannerSnapshot;
    if (!parsed.values || typeof parsed.values !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAnonymousPlannerSnapshot(userId: string, profileId: string): void {
  try {
    localStorage.removeItem(storageKey(userId, profileId));
  } catch (error) {
    console.error('Failed to clear anonymous planner data:', error);
  }
}
