import { ALWAYS_SAFE_STORES, SYNC_TRACKED_STORES } from '~/store/crossTabPersistence';
export { SYNC_TRACKED_STORES } from '~/store/crossTabPersistence';
import { useEffect } from 'react';
import { getActiveProfileStorageKey, SESSION_HINT_KEY, useAuthStore } from '~/store/authStore';
import { clearAccountSession } from '~/store/clearAccountSession';
import { rehydrateStore, receiveSyncRevisions, SYNC_REVISIONS_KEY, useSyncStore } from '~/store/syncStore';
import { getPersistenceContext, hasPersistenceConflicts, PERSISTENCE_RESOLVED_EVENT } from '~/store/history/localPersistence';

/**
 * Keeps other open tabs in sync with localStorage writes made by this tab, and vice versa.
 * Without this, a tab with stale in-memory state would overwrite a newer localStorage value
 * wholesale the next time it calls `set()` (zustand persist writes the full state on every change).
 */
export function useCrossTabSync() {
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if ((event.storageArea && event.storageArea !== localStorage) || !event.key || event.newValue === event.oldValue) return;

      if (event.key === SYNC_REVISIONS_KEY) {
        receiveSyncRevisions(localStorage.getItem(event.key));
        return;
      }

      if (event.key === SESSION_HINT_KEY && event.newValue === null) {
        if (useAuthStore.getState().user) clearAccountSession();
        return;
      }

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

      if (hasPersistenceConflicts(event.key)) return;
      for (const store of ALWAYS_SAFE_STORES) {
        if (store.persist.getOptions().name === event.key) {
          rehydrateStore(store, false);
          return;
        }
      }

      const raw = localStorage.getItem(event.key);
      const context = getPersistenceContext(raw);
      const sync = useSyncStore.getState();
      if (context && (context.userId !== sync.currentUserId || context.profileId !== sync.currentProfileId)) return;
      // Account resets must not replace an unrelated anonymous tab's plan.
      if (!userId && (raw === null || context?.external)) return;
      if (!context && !userId && localStorage.getItem(SESSION_HINT_KEY) !== null) return;
      for (const store of SYNC_TRACKED_STORES) {
        if (store.persist.getOptions().name === event.key) {
          // User edits supersede this tab's queued values; server refreshes preserve them.
          // The guard also prevents mirrored writes from becoming edits or server pushes.
          rehydrateStore(store, true, !context?.external, context?.edits);
          return;
        }
      }
    };

    const handleResolution = (event: Event) => {
      const { key } = (event as CustomEvent<{ key: string }>).detail;
      const store = [...SYNC_TRACKED_STORES, ...ALWAYS_SAFE_STORES].find((store) => store.persist.getOptions().name === key);
      // An explicit choice must replace pending edits rather than reapply them over the chosen data.
      if (store) rehydrateStore(store, false);
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(PERSISTENCE_RESOLVED_EVENT, handleResolution);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(PERSISTENCE_RESOLVED_EVENT, handleResolution);
    };
  }, []);
}
