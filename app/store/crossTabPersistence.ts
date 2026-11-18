import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { useEquipmentPlanStore } from '~/store/planner/useEquipmentPlanStore';
import { useGachaResultStore } from '~/store/planner/useGachaResultStore';
import { useEventPlanStore } from '~/store/planner/useEventPlanStore';
import { useGachaHistoryStore } from '~/store/planner/useGachaHistoryStore';
import { useResourcePlanStore } from '~/store/planner/useResourcePlanStore';
import { useRaidHistoryStore } from '~/store/planner/useRaidHistoryStore';
import { useAppPreferencesStore } from '~/store/useAppPreferencesStore';
import { useLanguageBannerStore } from '~/store/languageBannerState';

// Pure UI/preference stores: never touched by the server-sync system, so there's no identity to
// conflate. Always safe to rehydrate on a storage event regardless of this tab's login state.
export const ALWAYS_SAFE_STORES = [useGachaResultStore, useAppPreferencesStore, useLanguageBannerStore];

// Planner stores share their existing localStorage envelope across tabs.
// Keys must match the profile data keys pushed by useSyncWatcher (eventPlans covers 'eventPlans:<id>'),
// since push() uses them to find the store whose shared edit counters it must observe.
export const SYNC_STORES = {
  growthPlans: useGlobalStore,
  equipmentPlan: useEquipmentPlanStore,
  eventPlans: useEventPlanStore,
  gachaHistory: useGachaHistoryStore,
  resourcePlan: useResourcePlanStore,
  raidHistory: useRaidHistoryStore,
};
export const SYNC_TRACKED_STORES = Object.values(SYNC_STORES);

export type MirroredStore = (typeof SYNC_TRACKED_STORES)[number] | (typeof ALWAYS_SAFE_STORES)[number];
