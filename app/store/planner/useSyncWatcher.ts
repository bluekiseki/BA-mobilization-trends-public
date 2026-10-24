import { useEffect } from 'react';
import { getGrowthPlansSyncValue, useGlobalStore } from './useGlobalStore';
import { useEventPlanStore } from './useEventPlanStore';
import { getEquipmentPlanSyncValue, useEquipmentPlanStore } from './useEquipmentPlanStore';
import { getResourcePlanData, useResourcePlanStore } from './useResourcePlanStore';
import { getRaidHistorySyncValue, useRaidHistoryStore } from './useRaidHistoryStore';
import { getGachaHistorySyncValue, useGachaHistoryStore } from './useGachaHistoryStore';
import { resumeDeferredSyncRetry, useSyncStore } from '../syncStore';

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // Resync if idle for more than 5 minutes

function watchJson<T>(read: () => T, subscribe: (listener: () => void) => () => void, emit: (value: T) => void): () => void {
  let previous = JSON.stringify(read());
  return subscribe(() => {
    const value = read();
    const serialized = JSON.stringify(value);
    if (serialized === previous) return;
    previous = serialized;
    emit(value);
  });
}

export function useSyncWatcher() {
  useEffect(() => {
    let prevEventPlans: Record<string, unknown> = useEventPlanStore.getState().plans;
    const push = useSyncStore.getState().push;

    const unsubs = [
      watchJson(
        getGrowthPlansSyncValue,
        (listener) => useGlobalStore.subscribe(listener),
        (value) => push('growthPlans', value),
      ),
      watchJson(
        getEquipmentPlanSyncValue,
        (listener) => useEquipmentPlanStore.subscribe(listener),
        (value) => push('equipmentPlan', value),
      ),
      watchJson(
        () => getResourcePlanData(useResourcePlanStore.getState()),
        (listener) => useResourcePlanStore.subscribe(listener),
        (value) => push('resourcePlan', value),
      ),
      watchJson(
        getRaidHistorySyncValue,
        (listener) => useRaidHistoryStore.subscribe(listener),
        (value) => push('raidHistory', value, 1, true),
      ),
      watchJson(
        getGachaHistorySyncValue,
        (listener) => useGachaHistoryStore.subscribe(listener),
        (value) => push('gachaHistory', value, 1, true),
      ),

      useEventPlanStore.subscribe((state) => {
        Object.keys(state.plans).forEach((eventId) => {
          if (state.plans[eventId] !== prevEventPlans[eventId]) {
            push(`eventPlans:${eventId}`, state.plans[eventId]);
          }
        });
        prevEventPlans = state.plans;
      }),
    ];

    // Automatically refresh stale data when the tab becomes active again
    // Automatically apply changes when returning to the PC tab after editing on mobile
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      resumeDeferredSyncRetry();
      const { currentProfileId, isPulling, isInitialized, lastPulledAt } = useSyncStore.getState();
      if (!currentProfileId || isPulling || !isInitialized) return;
      if (!lastPulledAt || Date.now() - lastPulledAt > STALE_THRESHOLD_MS) {
        void useSyncStore.getState().pullAll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubs.forEach((u) => u());
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
