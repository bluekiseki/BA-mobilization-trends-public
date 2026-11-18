import { editHistory, snapshot, eventEditSnapshot, equalSnapshot, snapshotValue } from '../history/history';
import { watchHistoryInteractions } from '../history/interactions';
import { PROFILE_STORAGE_EVENT, safeLocalStorage } from '../history/localPersistence';
import type { ProfileDataKey } from '~/schemas/profileDataValidation';
import { useEffect } from 'react';
import { getGrowthPlansSyncValue, useGlobalStore } from './useGlobalStore';
import { useEventPlanStore } from './useEventPlanStore';
import { getEquipmentPlanSyncValue, useEquipmentPlanStore } from './useEquipmentPlanStore';
import { getResourcePlanData, useResourcePlanStore } from './useResourcePlanStore';
import { getRaidHistorySyncValue, useRaidHistoryStore } from './useRaidHistoryStore';
import { getGachaHistorySyncValue, useGachaHistoryStore } from './useGachaHistoryStore';
import { resumeDeferredSyncRetry, useSyncStore } from '../syncStore';

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // Resync if idle for more than 5 minutes

function watchJson<T>(key: string, read: () => T, subscribe: (listener: () => void) => () => void, emit: (value: T) => void): () => void {
  let previous = JSON.stringify(read());
  editHistory.seed(key, snapshot(read()));
  return subscribe(() => {
    const value = read();
    const serialized = JSON.stringify(value);
    if (serialized === previous) return;
    previous = serialized;
    editHistory.observe(key, snapshot(value));
    emit(value);
  });
}

export function useSyncWatcher() {
  useEffect(() => {
    let prevEventPlans: Record<string, unknown> = useEventPlanStore.getState().plans;
    for (const [id, value] of Object.entries(prevEventPlans)) editHistory.seed(`eventPlans:${id}`, eventEditSnapshot(value));
    const push = useSyncStore.getState().push;

    const unsubs = [
      watchJson(
        'growthPlans',
        getGrowthPlansSyncValue,
        (listener) => useGlobalStore.subscribe(listener),
        (value) => push('growthPlans', value),
      ),
      watchJson(
        'equipmentPlan',
        getEquipmentPlanSyncValue,
        (listener) => useEquipmentPlanStore.subscribe(listener),
        (value) => push('equipmentPlan', value),
      ),
      watchJson(
        'resourcePlan',
        () => getResourcePlanData(useResourcePlanStore.getState()),
        (listener) => useResourcePlanStore.subscribe(listener),
        (value) => push('resourcePlan', value),
      ),
      watchJson(
        'raidHistory',
        getRaidHistorySyncValue,
        (listener) => useRaidHistoryStore.subscribe(listener),
        (value) => push('raidHistory', value, 1, true),
      ),
      watchJson(
        'gachaHistory',
        getGachaHistorySyncValue,
        (listener) => useGachaHistoryStore.subscribe(listener),
        (value) => push('gachaHistory', value, 1, true),
      ),

      useEventPlanStore.subscribe((state) => {
        Array.from(new Set([...Object.keys(prevEventPlans), ...Object.keys(state.plans)])).forEach((eventId) => {
          if (state.plans[eventId] !== prevEventPlans[eventId]) {
            const next = eventEditSnapshot(state.plans[eventId]);
            if (equalSnapshot(eventEditSnapshot(prevEventPlans[eventId]), next)) return;
            editHistory.observe(`eventPlans:${eventId}`, next);
            push(`eventPlans:${eventId}`, snapshotValue(next));
          }
        });
        prevEventPlans = state.plans;
      }),
    ];

    const storageKeys: Record<string, { key: ProfileDataKey; version: number }> = {
      gacha_prefs_v1: { key: 'gacha_prefs', version: 1 },
      gacha_strategies_v3: { key: 'gacha_strategies', version: 3 },
      gacha_strategies_v2: { key: 'gacha_strategies', version: 2 },
    };
    for (const [storageKey, { key, version }] of Object.entries(storageKeys).reverse()) {
      const raw = safeLocalStorage.getItem(storageKey);
      if (typeof raw === 'string') {
        try {
          editHistory.seed(key, snapshot(JSON.parse(raw), version));
        } catch {
          /* Invalid legacy preferences are reset by the editor. */
        }
      }
    }
    const onStorage = (event: Event) => {
      const { key: storageKey, value, origin } = (event as CustomEvent<{ key: string; value: string | null; origin: string }>).detail;
      const entry = storageKeys[storageKey];
      if (!entry) return;
      const parsed: unknown = value === null ? null : JSON.parse(value);
      const observe = () => editHistory.observe(entry.key, snapshot(parsed, entry.version));
      if (origin === 'local') {
        observe();
        push(entry.key, parsed, entry.version);
      } else editHistory.external(observe);
    };
    window.addEventListener(PROFILE_STORAGE_EVENT, onStorage);
    const stopInteractions = watchHistoryInteractions(editHistory, document);

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
      window.removeEventListener(PROFILE_STORAGE_EVENT, onStorage);
      stopInteractions();
      unsubs.forEach((u) => u());
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
