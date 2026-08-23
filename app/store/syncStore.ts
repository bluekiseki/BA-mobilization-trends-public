import { create } from 'zustand';
import { gqlFetch } from '~/utils/gqlFetch';
import { useGlobalStore } from './planner/useGlobalStore';
import { useEventPlanStore, type EventPlan } from './planner/useEventPlanStore';
import { useEquipmentPlanStore } from './planner/useEquipmentPlanStore';
import { useResourcePlanStore } from './planner/useResourcePlanStore';
import { useRaidHistoryStore } from './planner/useRaidHistoryStore';
import { ProfileDataSchemas } from '~/schemas/profileDataValidation';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

// Debounce timers live outside Zustand state to avoid re-renders
const pushTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function cancelAllPushTimers() {
  Object.keys(pushTimers).forEach((key) => {
    clearTimeout(pushTimers[key]);
    delete pushTimers[key];
  });
}

interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  pendingKeys: Set<string>;
  revisions: Record<string, number>;
  currentProfileId: string | null;
  isPulling: boolean;
  // Blocks pushes until the first pullAll succeeds, preventing stale
  // localStorage data (from zustand persist) from overwriting server data.
  isInitialized: boolean;
  error: string | null;

  setStatus: (status: SyncStatus) => void;
  setLastSyncedAt: (timestamp: number | null) => void;
  addPendingKey: (key: string) => void;
  removePendingKey: (key: string) => void;
  clearPendingKeys: () => void;
  setCurrentProfileId: (profileId: string | null) => void;
  setError: (error: string | null) => void;
  clearPlannerStores: () => void;
  clearAccountData: () => void;
  reset: () => void;
  hasPendingChanges: () => boolean;

  push: (key: string, value: unknown, schemaVersion?: number) => void;
  pullAll: (profileId: string) => Promise<boolean>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'idle',
  lastSyncedAt: null,
  pendingKeys: new Set(),
  revisions: {},
  currentProfileId: null,
  isPulling: false,
  isInitialized: false,
  error: null,

  setStatus: (status) => set({ status }),
  setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp }),

  addPendingKey: (key) =>
    set((state) => {
      const next = new Set(state.pendingKeys);
      next.add(key);
      return { pendingKeys: next };
    }),

  removePendingKey: (key) =>
    set((state) => {
      const next = new Set(state.pendingKeys);
      next.delete(key);
      return { pendingKeys: next };
    }),

  clearPendingKeys: () => set({ pendingKeys: new Set() }),
  setCurrentProfileId: (profileId) => set({ currentProfileId: profileId }),
  setError: (error) => set({ error }),

  clearPlannerStores: () => {
    useGlobalStore.setState({ growthPlans: [], ownedGifts: {}, materialInventory: {} });
    useEquipmentPlanStore.setState({ runCounts: {}, farmingDays: 1, normalMultiplier: 2, hardMultiplier: 2, /*inventory: {},*/ campaignSource: 'jp' /*blueprints: {}*/ });
    useResourcePlanStore.getState().resetAll();
    useEventPlanStore.setState({ plans: {} });
    useRaidHistoryStore.setState({ entries: [] });
  },

  clearAccountData: () => {
    cancelAllPushTimers();
    get().clearPlannerStores();
    set({
      status: 'idle',
      lastSyncedAt: null,
      pendingKeys: new Set(),
      revisions: {},
      currentProfileId: null,
      isPulling: false,
      isInitialized: false,
      error: null,
    });
  },

  reset: () =>
    set({
      status: 'idle',
      lastSyncedAt: null,
      pendingKeys: new Set(),
      revisions: {},
      error: null,
      isInitialized: false,
      // currentProfileId and isPulling intentionally not reset here
    }),

  hasPendingChanges: () => get().pendingKeys.size > 0,

  push: (key, value, schemaVersion = 1) => {
    const { currentProfileId, isPulling, isInitialized } = get();
    if (!currentProfileId || isPulling || !isInitialized) return;

    get().addPendingKey(key);
    clearTimeout(pushTimers[key]);
    pushTimers[key] = setTimeout(() => {
      void (async () => {
        const profileId = get().currentProfileId;
        if (!profileId || get().isPulling || !get().isInitialized) return;
        const baseRevision = get().revisions[key] ?? 0;

        set({ status: 'syncing' });
        try {
          await gqlFetch(
            `mutation($profileId:ID!,$key:String!,$value:JSON!,$schemaVersion:Int!,$baseRevision:Int!){
              upsertProfileData(profileId:$profileId,key:$key,value:$value,schemaVersion:$schemaVersion,baseRevision:$baseRevision)
            }`,
            { profileId, key, value, schemaVersion, baseRevision },
          );
          get().removePendingKey(key);
          set((state) => ({ revisions: { ...state.revisions, [key]: baseRevision + 1 } }));
          set({
            status: get().pendingKeys.size > 0 ? 'syncing' : 'synced',
            lastSyncedAt: Date.now(),
            error: null,
          });
        } catch (err) {
          if (String(err).includes('SYNC_CONFLICT')) {
            get().removePendingKey(key);
            await get().pullAll(profileId);
            return;
          }
          set({ status: 'error', error: String(err) });
        }
      })();
    }, 2000);
  },

  pullAll: async (profileId) => {
    // Cancel any pending push timers so stale captured values cannot be
    // sent to the server after the pull overwrites local state.
    cancelAllPushTimers();
    set({ status: 'syncing', isPulling: true, pendingKeys: new Set() });
    try {
      const data = await gqlFetch<{ profileAllData: { key: string; value: unknown; schemaVersion: number; revision: number }[] }>(
        `query($id:ID!){ profileAllData(id:$id){ key value schemaVersion revision } }`,
        {
          id: profileId,
        },
      );

      const rows = data?.profileAllData ?? [];
      const revisions = Object.fromEntries(rows.map(({ key, revision }) => [key, revision]));
      get().clearPlannerStores();
      if (rows.length === 0) {
        set({ status: 'idle', isPulling: false, isInitialized: true, revisions });
        return false;
      }

      const eventPlansMap: Record<string, unknown> = {};
      for (const { key, value } of rows) {
        if (key === 'growthPlans' && typeof value === 'object' && value !== null) {
          useGlobalStore.setState(value as Record<string, unknown>);
        } else if (key === 'equipmentPlan' && typeof value === 'object' && value !== null) {
          useEquipmentPlanStore.setState(value as Record<string, unknown>);
        } else if (key === 'resourcePlan' && typeof value === 'object' && value !== null) {
          const data = value as Record<string, unknown>;
          const activeServer = (data.server as 'kr' | 'jp') ?? 'kr';
          const activeData = (data[activeServer] as Record<string, unknown>) ?? {};
          // Restore nested server data AND spread active server's data into flat fields for component reads
          useResourcePlanStore.setState({ ...data, ...activeData });
        } else if (key === 'raidHistory' && typeof value === 'object' && value !== null) {
          const validated = ProfileDataSchemas.raidHistory.safeParse(value);
          if (!validated.success) {
            console.error('Invalid raid history data from sync:', validated.error);
            continue;
          }
          useRaidHistoryStore.setState(validated.data);
        } else if (key.startsWith('eventPlans:')) {
          eventPlansMap[key.slice(11)] = value;
        } else if (key === 'theme' && typeof value === 'string') {
          localStorage.setItem('theme', value);
        } else if (key === 'gacha_prefs') {
          localStorage.setItem('gacha_prefs_v1', JSON.stringify(value));
        } else if (key === 'gacha_strategies') {
          localStorage.setItem('gacha_strategies_v3', JSON.stringify(value));
        }
      }
      if (Object.keys(eventPlansMap).length > 0) {
        useEventPlanStore.setState((s) => ({
          plans: { ...s.plans, ...(eventPlansMap as Record<string, Partial<EventPlan>>) },
        }));
      }

      set({ status: 'synced', lastSyncedAt: Date.now(), isPulling: false, isInitialized: true, revisions });
      return true;
    } catch (err) {
      set({ status: 'error', error: String(err), isPulling: false });
      return false;
    }
  },
}));
