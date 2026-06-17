import { useEffect } from 'react';
import { useGlobalStore } from './useGlobalStore';
import { useEventPlanStore } from './useEventPlanStore';
import { useEquipmentPlanStore } from './useEquipmentPlanStore';
import { useSyncStore } from '../syncStore';

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // Resync if idle for more than 5 minutes

export function useSyncWatcher() {
  useEffect(() => {
    let prevEventPlans: Record<string, unknown> = useEventPlanStore.getState().plans;

    const unsubs = [
      useGlobalStore.subscribe((state) => {
        useSyncStore.getState().push(
          'growthPlans',
          {
            growthPlans: state.growthPlans,
            ownedGifts: state.ownedGifts,
            materialInventory: state.materialInventory,
          },
          1,
        );
      }),

      useEquipmentPlanStore.subscribe((state) => {
        useSyncStore.getState().push(
          'equipmentPlan',
          {
            runCounts: state.runCounts,
            farmingDays: state.farmingDays,
            normalMultiplier: state.normalMultiplier,
            hardMultiplier: state.hardMultiplier,
            // inventory: state.inventory,
            campaignSource: state.campaignSource,
            // blueprints: state.blueprints,
          },
          1,
        );
      }),

      useEventPlanStore.subscribe((state) => {
        const { push } = useSyncStore.getState();
        Object.keys(state.plans).forEach((eventId) => {
          if (state.plans[eventId] !== prevEventPlans[eventId]) {
            push(`eventPlans:${eventId}`, state.plans[eventId], 1);
          }
        });
        prevEventPlans = state.plans;
      }),
    ];

    // Automatically refresh stale data when the tab becomes active again
    // Automatically apply changes when returning to the PC tab after editing on mobile
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const { currentProfileId, isPulling, isInitialized, lastSyncedAt } = useSyncStore.getState();
      if (!currentProfileId || isPulling || !isInitialized) return;
      if (!lastSyncedAt || Date.now() - lastSyncedAt > STALE_THRESHOLD_MS) {
        void useSyncStore.getState().pullAll(currentProfileId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubs.forEach((u) => u());
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
