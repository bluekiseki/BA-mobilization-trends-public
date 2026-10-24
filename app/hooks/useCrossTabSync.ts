import { useEffect } from 'react';
import { getActiveProfileStorageKey, useAuthStore } from '~/store/authStore';
import { applyWithoutSyncPushAsync, useSyncStore } from '~/store/syncStore';
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
const ALWAYS_SAFE_STORES = [useGachaResultStore, useAppPreferencesStore, useLanguageBannerStore];

// Stores mirrored to/from the server via useSyncStore (see useSyncWatcher.ts / syncStore.ts's
// clearPlannerStores). These share the same unscoped localStorage keys whether the tab is
// anonymous or logged in. Only rehydrate them in a tab that is itself logged in — see the guard
// below for why an anonymous tab must not follow these.
const SYNC_TRACKED_STORES = [useGlobalStore, useEquipmentPlanStore, useEventPlanStore, useGachaHistoryStore, useResourcePlanStore, useRaidHistoryStore];

/**
 * Keeps other open tabs in sync with localStorage writes made by this tab, and vice versa.
 * Without this, a tab with stale in-memory state would overwrite a newer localStorage value
 * wholesale the next time it calls `set()` (zustand persist writes the full state on every change).
 */
export function useCrossTabSync() {
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.newValue === event.oldValue) return;

      // Another tab switched the active profile: mirror the switch instead of reloading,
      // reusing the same path the in-tab profile switcher uses (settings/index.tsx).
      const userId = useAuthStore.getState().user?.id;
      if (userId && event.key === getActiveProfileStorageKey(userId)) {
        const newProfileId = event.newValue;
        if (newProfileId && newProfileId !== useAuthStore.getState().activeProfileId) {
          useAuthStore.getState().setActiveProfile(newProfileId);
          void useSyncStore.getState().switchProfile(newProfileId);
        }
        return;
      }

      for (const store of ALWAYS_SAFE_STORES) {
        if (store.persist.getOptions().name === event.key) {
          void store.persist.rehydrate();
          return;
        }
      }

      // An anonymous tab has no server backstop: if another tab just logged in, its
      // clearPlannerStores() + pullAll() sequence rewrites these same shared keys for a
      // completely unrelated account, and blindly rehydrating here would wipe this tab's own
      // unsynced local data for a login it has nothing to do with. A logged-in tab is safe to
      // follow, since the revision-based sync system corrects any mismatch on its next pull/push.
      if (!useAuthStore.getState().user) return;
      for (const store of SYNC_TRACKED_STORES) {
        if (store.persist.getOptions().name === event.key) {
          // Without this guard, rehydrating here fires this tab's OWN useSyncWatcher subscription,
          // which would mistake the mirrored value for a real local edit and push it to the server
          // — isApplyingSyncData is a per-tab module variable, so the writing tab's own guard
          // (set during its clearPlannerStores()/applyRows()) never protects this tab.
          void applyWithoutSyncPushAsync(() => store.persist.rehydrate());
          return;
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);
}
