import { create } from 'zustand';
import { gqlFetch } from '~/utils/gqlFetch';
import { useGlobalStore } from './planner/useGlobalStore';
import { useEventPlanStore, type EventPlan } from './planner/useEventPlanStore';
import { useEquipmentPlanStore } from './planner/useEquipmentPlanStore';
import { useResourcePlanStore } from './planner/useResourcePlanStore';
import { useRaidHistoryStore } from './planner/useRaidHistoryStore';
import { useGachaHistoryStore } from './planner/useGachaHistoryStore';
import { ProfileDataSchemas, type ProfileDataKey } from '~/schemas/profileDataValidation';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'conflict' | 'error';

export const SYNC_IDLE_MS = 10_000;
export const SYNC_MIN_INTERVAL_MS = 30_000;
export const SYNC_MAX_WAIT_MS = 60_000;
// Retry backoff after a failed flush: 5s, 15s, 1m, 5m, 10m, 20m, then every 60m.
export const SYNC_RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 300_000, 600_000, 1_200_000, 3_600_000];
export const SYNC_STALE_BUTTON_MS = 10 * 60 * 1000; // Show manual force-sync button if idle this long

interface PendingChange {
  key: string;
  value: unknown;
  schemaVersion: number;
  baseRevision: number;
  generation: number;
  updatedAt: number;
  immediate: boolean;
}

export interface SyncConflict {
  key: string;
  localValue: unknown;
  serverValue: unknown;
  serverRevision: number;
  schemaVersion: number;
  localUpdatedAt: number;
  serverUpdatedAt: number | null;
}

interface SyncMutationResult {
  key: string;
  status: 'APPLIED' | 'CONFLICT' | 'REJECTED';
  revision: number;
  serverValue?: unknown;
  schemaVersion?: number;
  updatedAt?: number;
  message?: string;
}

interface ProfileDataRow {
  key: string;
  value: unknown;
  schemaVersion: number;
  revision: number;
  updatedAt: number;
}

interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  lastPulledAt: number | null;
  lastModifiedAt: number | null;
  pendingKeys: Set<string>;
  revisions: Record<string, number>;
  conflicts: Record<string, SyncConflict>;
  // Keys the server refused permanently (oversized/invalid). Kept pending locally but not retried until edited again.
  rejected: Record<string, string>;
  currentUserId: string | null;
  currentProfileId: string | null;
  isPulling: boolean;
  isInitialized: boolean;
  error: string | null;
  clearAccountData: () => void;
  initializeProfile: (userId: string, profileId: string) => Promise<boolean>;
  switchProfile: (profileId: string) => Promise<boolean>;
  push: (key: ProfileDataKey, value: unknown, schemaVersion?: number, immediate?: boolean) => void;
  flush: () => Promise<void>;
  pullAll: () => Promise<boolean>;
  resolveConflict: (key: string, resolution: 'server' | 'local') => void;
  forceSync: () => Promise<void>;
}

const pendingChanges = new Map<string, PendingChange>();
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let activeFlush: Promise<void> | null = null;
let activeFlushProfileId: string | null = null;
let lastFlushStartedAt = 0;
let contextEpoch = 0;
let retryAttempt = 0;
// A retry came due while the tab was hidden; it resumes when the tab becomes visible again.
let retryDeferred = false;
let pullSequence = 0;
let outboxModulePromise: Promise<typeof import('./syncOutbox.client')> | null = null;
let outboxWriteChain: Promise<void> = Promise.resolve();
// True only while sync itself is writing server/local-mirror data into the planner stores
// (applyRows / conflict resolution), so useSyncWatcher's reactive push() doesn't re-queue
// the value it just watched sync write.
let isApplyingSyncData = false;

function applyWithoutSyncPush(action: () => void): void {
  const previous = isApplyingSyncData;
  isApplyingSyncData = true;
  try {
    action();
  } finally {
    isApplyingSyncData = previous;
  }
}

/**
 * Same guard as `applyWithoutSyncPush`, but holds it until an async `action` (e.g. zustand's
 * `persist.rehydrate()`, which resolves after its internal `setState`) finishes — the sync
 * version resets the flag as soon as `action()` returns, before a promise it started has settled,
 * which would let useSyncWatcher's reactive push slip through. Exported for useCrossTabSync,
 * which mirrors another tab's sync-driven write via rehydrate() and must not have this tab's own
 * watcher re-push that value as if the user had just edited it.
 */
export async function applyWithoutSyncPushAsync(action: () => void | Promise<void>): Promise<void> {
  const previous = isApplyingSyncData;
  isApplyingSyncData = true;
  try {
    await action();
  } finally {
    isApplyingSyncData = previous;
  }
}

function getOutboxModule() {
  outboxModulePromise ??= import('./syncOutbox.client');
  return outboxModulePromise;
}

function trackOutboxWrite(operation: () => Promise<void>): void {
  outboxWriteChain = outboxWriteChain.then(operation).catch((error: unknown) => console.error('Failed to persist sync outbox:', error));
}

function persistPendingChange(userId: string, profileId: string, change: PendingChange): void {
  trackOutboxWrite(() =>
    getOutboxModule().then((module) =>
      module.putSyncOutboxEntry({
        userId,
        profileId,
        key: change.key,
        baseRevision: change.baseRevision,
        desiredValue: change.value,
        schemaVersion: change.schemaVersion,
        generation: change.generation,
        updatedAt: change.updatedAt,
      }),
    ),
  );
}

function withoutKey(keys: Set<string>, key: string): Set<string> {
  const next = new Set(keys);
  next.delete(key);
  return next;
}

async function waitForOutboxWrites(): Promise<void> {
  await outboxWriteChain;
}

function cancelScheduledFlushes(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (maxWaitTimer) clearTimeout(maxWaitTimer);
  if (retryTimer) clearTimeout(retryTimer);
  idleTimer = null;
  maxWaitTimer = null;
  retryTimer = null;
  retryDeferred = false;
}

function clearCompletedSchedule(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (maxWaitTimer) clearTimeout(maxWaitTimer);
  idleTimer = null;
  maxWaitTimer = null;
}

function parseError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function applyLocalStorageValue(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  if (key === 'theme' && typeof value === 'string') localStorage.setItem('theme', value);
  else if (key === 'gacha_prefs') localStorage.setItem('gacha_prefs_v1', JSON.stringify(value));
  else if (key === 'gacha_strategies') localStorage.setItem('gacha_strategies_v3', JSON.stringify(value));
}

function clearPlannerStores(): void {
  useGlobalStore.setState({ growthPlans: [], ownedGifts: {}, materialInventory: {} });
  useEquipmentPlanStore.setState({ runCounts: {}, farmingDays: 1, normalMultiplier: 2, hardMultiplier: 2, campaignSource: 'jp' });
  useResourcePlanStore.getState().resetAll();
  useEventPlanStore.setState({ plans: {} });
  useRaidHistoryStore.setState({ entries: [] });
  useGachaHistoryStore.setState({ entries: [] });
}

function applyProfileData(key: string, value: unknown): void {
  if (value === null || value === undefined) {
    if (key === 'growthPlans') useGlobalStore.setState({ growthPlans: [], ownedGifts: {}, materialInventory: {} });
    else if (key === 'equipmentPlan') useEquipmentPlanStore.setState({ runCounts: {}, farmingDays: 1, normalMultiplier: 2, hardMultiplier: 2, campaignSource: 'jp' });
    else if (key === 'resourcePlan') useResourcePlanStore.getState().resetAll();
    else if (key === 'raidHistory') useRaidHistoryStore.setState({ entries: [] });
    else if (key === 'gachaHistory') useGachaHistoryStore.setState({ entries: [] });
    else if (key.startsWith('eventPlans:')) {
      const eventId = key.slice(11);
      useEventPlanStore.setState((state) => {
        const plans = { ...state.plans };
        delete plans[eventId];
        return { plans };
      });
    }
    return;
  }
  if (key.startsWith('eventPlans:')) {
    const eventId = key.slice(11);
    useEventPlanStore.setState((state) => ({ plans: { ...state.plans, [eventId]: value } }));
  } else if (key === 'growthPlans' && typeof value === 'object' && value !== null) {
    useGlobalStore.setState(value as Record<string, unknown>);
  } else if (key === 'equipmentPlan' && typeof value === 'object' && value !== null) {
    useEquipmentPlanStore.setState(value as Record<string, unknown>);
  } else if (key === 'resourcePlan' && typeof value === 'object' && value !== null) {
    const resourceData = value as Record<string, unknown>;
    const activeServer = resourceData.server === 'jp' ? 'jp' : 'kr';
    const activeData = (resourceData[activeServer] as Record<string, unknown>) ?? {};
    useResourcePlanStore.setState({ ...resourceData, ...activeData });
  } else if (key === 'raidHistory') {
    const validated = ProfileDataSchemas.raidHistory.safeParse(value);
    if (validated.success) useRaidHistoryStore.setState(validated.data);
  } else if (key === 'gachaHistory') {
    const validated = ProfileDataSchemas.gachaHistory.safeParse(value);
    if (validated.success) useGachaHistoryStore.setState(validated.data);
  } else {
    applyLocalStorageValue(key, value);
  }
}

function applyRows(rows: ProfileDataRow[]): void {
  applyWithoutSyncPush(() => {
    clearPlannerStores();
    const values = new Map(rows.map((row) => [row.key, row.value]));
    for (const [key, pending] of pendingChanges) values.set(key, pending.value);
    const eventPlans: Record<string, Partial<EventPlan>> = {};
    for (const [key, value] of values) {
      if (key.startsWith('eventPlans:')) eventPlans[key.slice(11)] = value as Partial<EventPlan>;
      else applyProfileData(key, value);
    }
    useEventPlanStore.setState({ plans: eventPlans });
  });
}

function scheduleFlush(flush: () => Promise<void>, immediate = false): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (!maxWaitTimer) {
    maxWaitTimer = setTimeout(() => {
      clearCompletedSchedule();
      void flush();
    }, SYNC_MAX_WAIT_MS);
  }
  const sinceLastFlush = Date.now() - lastFlushStartedAt;
  const minimumDelay = lastFlushStartedAt === 0 ? 0 : Math.max(0, SYNC_MIN_INTERVAL_MS - sinceLastFlush);
  const delay = immediate ? minimumDelay : Math.max(SYNC_IDLE_MS, minimumDelay);
  idleTimer = setTimeout(() => {
    clearCompletedSchedule();
    void flush();
  }, delay);
}

/** Resumes a retry that was postponed while the tab was hidden. Called when the tab becomes visible. */
export function resumeDeferredSyncRetry(): void {
  if (!retryDeferred) return;
  retryDeferred = false;
  retryAttempt = 0;
  void useSyncStore.getState().flush();
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'idle',
  lastSyncedAt: null,
  lastPulledAt: null,
  lastModifiedAt: null,
  pendingKeys: new Set(),
  revisions: {},
  conflicts: {},
  rejected: {},
  currentUserId: null,
  currentProfileId: null,
  isPulling: false,
  isInitialized: false,
  error: null,

  clearAccountData: () => {
    contextEpoch += 1;
    cancelScheduledFlushes();
    pendingChanges.clear();
    // Clear the profile context before touching the planner stores: clearing them fires
    // useSyncWatcher's subscriptions, and push() only no-ops once currentProfileId is gone —
    // otherwise the reset (empty) values get queued and persisted into the outgoing profile's outbox.
    set({
      status: 'idle',
      lastSyncedAt: null,
      lastPulledAt: null,
      lastModifiedAt: null,
      pendingKeys: new Set(),
      revisions: {},
      conflicts: {},
      rejected: {},
      currentUserId: null,
      currentProfileId: null,
      isPulling: false,
      isInitialized: false,
      error: null,
    });
    clearPlannerStores();
  },

  initializeProfile: async (userId, profileId) => {
    contextEpoch += 1;
    const epoch = contextEpoch;
    cancelScheduledFlushes();
    pendingChanges.clear();
    // Switch the profile context before awaiting the outbox read: any push() that happens
    // while we're waiting must be attributed to the new profile, not the outgoing one.
    set({
      currentUserId: userId,
      currentProfileId: profileId,
      pendingKeys: new Set(),
      conflicts: {},
      rejected: {},
      revisions: {},
      status: 'idle',
      lastPulledAt: null,
      error: null,
      isInitialized: false,
      isPulling: true,
    });
    // Empty the planner stores immediately, before the outbox read even resolves — otherwise an
    // edit made during that wait bundles the *previous* profile's still-live fields (via the
    // watcher's whole-store JSON) into the new profile's pending change.
    applyWithoutSyncPush(() => clearPlannerStores());
    try {
      await waitForOutboxWrites();
      const entries = await getOutboxModule().then((module) => module.getSyncOutboxEntries(userId, profileId));
      if (epoch !== contextEpoch) return false;
      for (const entry of entries) {
        // A push() that landed while we were reading the outbox already reflects the newest edit — keep it.
        if (pendingChanges.has(entry.key)) continue;
        pendingChanges.set(entry.key, {
          key: entry.key,
          value: entry.desiredValue,
          schemaVersion: entry.schemaVersion,
          baseRevision: entry.baseRevision,
          generation: entry.generation,
          updatedAt: entry.updatedAt,
          immediate: false,
        });
      }
      set({ pendingKeys: new Set(pendingChanges.keys()) });
      return await get().pullAll();
    } catch (error) {
      if (epoch === contextEpoch) set({ status: 'error', error: parseError(error), isPulling: false });
      return false;
    }
  },

  switchProfile: async (profileId) => {
    const userId = get().currentUserId;
    if (!userId) return false;
    return get().initializeProfile(userId, profileId);
  },

  push: (key, value, schemaVersion = 1, immediate = false) => {
    const { currentUserId, currentProfileId, revisions, conflicts, rejected } = get();
    if (!currentProfileId || isApplyingSyncData) return;
    const previous = pendingChanges.get(key);
    const updatedAt = Date.now();
    const change: PendingChange = {
      key,
      value,
      schemaVersion,
      baseRevision: previous?.baseRevision ?? revisions[key] ?? 0,
      generation: (previous?.generation ?? 0) + 1,
      updatedAt,
      immediate: immediate || (previous?.immediate ?? false),
    };
    pendingChanges.set(key, change);
    if (rejected[key]) {
      const nextRejected = { ...rejected };
      delete nextRejected[key];
      set({ rejected: nextRejected });
    }
    set((state) => ({
      pendingKeys: new Set(state.pendingKeys).add(key),
      conflicts: conflicts[key] ? { ...state.conflicts, [key]: { ...state.conflicts[key], localValue: value, localUpdatedAt: updatedAt } } : state.conflicts,
    }));
    if (currentUserId) persistPendingChange(currentUserId, currentProfileId, change);
    if (!conflicts[key]) scheduleFlush(get().flush, immediate);
  },

  flush: async () => {
    if (activeFlush) return activeFlush;
    const operation = (async () => {
      const { currentUserId, currentProfileId, isPulling, isInitialized, conflicts, rejected } = get();
      if (!currentProfileId || isPulling || !isInitialized) return;
      const epoch = contextEpoch;
      const changes = Array.from(pendingChanges.values()).filter((change) => !conflicts[change.key] && !rejected[change.key]);
      if (changes.length === 0) return;
      lastFlushStartedAt = Date.now();
      set({ status: 'syncing', error: null });
      try {
        const response = await gqlFetch<{ syncProfileData: SyncMutationResult[] }>(
          `mutation SyncProfileData($profileId:ID!,$changes:[SyncProfileDataChangeInput!]!){ syncProfileData(profileId:$profileId,changes:$changes){ key status revision serverValue schemaVersion updatedAt } }`,
          { profileId: currentProfileId, changes: changes.map(({ key, value, schemaVersion, baseRevision }) => ({ key, value, schemaVersion, baseRevision })) },
        );
        if (epoch !== contextEpoch || currentProfileId !== get().currentProfileId) return;
        const results = new Map(response.syncProfileData.map((result) => [result.key, result]));
        const nextConflicts = { ...get().conflicts };
        const nextRejected = { ...get().rejected };
        const nextRevisions = { ...get().revisions };
        let latestModifiedAt = get().lastModifiedAt;

        for (const sent of changes) {
          const result = results.get(sent.key);
          if (!result) throw new Error(`Missing sync result for '${sent.key}'`);
          const current = pendingChanges.get(sent.key);
          if (result.status === 'REJECTED') {
            // Permanent failure for this key only: keep the local value pending, but stop re-sending it.
            if (current?.generation === sent.generation) nextRejected[sent.key] = result.message ?? 'Rejected by server';
            continue;
          }
          if (result.status === 'CONFLICT') {
            if (current && valuesEqual(result.serverValue, current.value)) {
              nextRevisions[sent.key] = result.revision;
              pendingChanges.delete(sent.key);
              set((state) => ({ pendingKeys: withoutKey(state.pendingKeys, sent.key) }));
              if (currentUserId) trackOutboxWrite(() => getOutboxModule().then((module) => module.deleteSyncOutboxEntry(currentUserId, currentProfileId, sent.key)));
              continue;
            }
            if (current && current.generation !== sent.generation && valuesEqual(result.serverValue, sent.value)) {
              const rebased = { ...current, baseRevision: result.revision };
              pendingChanges.set(sent.key, rebased);
              nextRevisions[sent.key] = result.revision;
              if (currentUserId) persistPendingChange(currentUserId, currentProfileId, rebased);
              continue;
            }
            nextConflicts[sent.key] = {
              key: sent.key,
              localValue: current?.value ?? sent.value,
              serverValue: result.serverValue,
              serverRevision: result.revision,
              schemaVersion: result.schemaVersion ?? sent.schemaVersion,
              localUpdatedAt: current?.updatedAt ?? sent.updatedAt,
              serverUpdatedAt: result.updatedAt ? result.updatedAt * 1000 : null,
            };
            continue;
          }
          nextRevisions[sent.key] = result.revision;
          if (typeof result.updatedAt === 'number') latestModifiedAt = Math.max(latestModifiedAt ?? 0, result.updatedAt * 1000);
          if (current?.generation === sent.generation) {
            pendingChanges.delete(sent.key);
            set((state) => ({ pendingKeys: withoutKey(state.pendingKeys, sent.key) }));
            if (currentUserId) trackOutboxWrite(() => getOutboxModule().then((module) => module.deleteSyncOutboxEntry(currentUserId, currentProfileId, sent.key)));
          } else if (current) {
            const rebased = { ...current, baseRevision: result.revision };
            pendingChanges.set(sent.key, rebased);
            if (currentUserId) persistPendingChange(currentUserId, currentProfileId, rebased);
          }
        }
        retryAttempt = 0;
        const rejectedMessages = Object.values(nextRejected);
        const hasRetryable = Array.from(pendingChanges.keys()).some((key) => !nextConflicts[key] && !nextRejected[key]);
        set({
          revisions: nextRevisions,
          conflicts: nextConflicts,
          rejected: nextRejected,
          status: Object.keys(nextConflicts).length > 0 ? 'conflict' : hasRetryable ? 'syncing' : rejectedMessages.length > 0 ? 'error' : 'synced',
          lastSyncedAt: Date.now(),
          lastModifiedAt: latestModifiedAt,
          error: rejectedMessages.length > 0 ? rejectedMessages[0] : null,
        });
      } catch (error) {
        if (epoch !== contextEpoch) return;
        const delay = SYNC_RETRY_DELAYS_MS[Math.min(retryAttempt, SYNC_RETRY_DELAYS_MS.length - 1)];
        retryAttempt += 1;
        set({ status: 'error', error: parseError(error) });
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            retryDeferred = true;
            return;
          }
          void get().flush();
        }, delay);
      }
    })();
    activeFlush = operation;
    activeFlushProfileId = get().currentProfileId;
    try {
      await operation;
    } finally {
      activeFlush = null;
      activeFlushProfileId = null;
      // A pending backoff retry owns the next attempt; scheduling here too would retry every ~30s and defeat the backoff.
      if (!retryTimer && !retryDeferred && Array.from(pendingChanges.keys()).some((key) => !get().conflicts[key] && !get().rejected[key])) scheduleFlush(get().flush);
    }
  },

  pullAll: async () => {
    const profileId = get().currentProfileId;
    if (!profileId) return false;
    const epoch = contextEpoch;
    if (activeFlush && activeFlushProfileId === profileId) await activeFlush;
    if (epoch !== contextEpoch || profileId !== get().currentProfileId) return false;
    const sequence = ++pullSequence;
    set({ status: 'syncing', isPulling: true, error: null });
    try {
      const data = await gqlFetch<{ profileAllData: ProfileDataRow[] }>(`query($id:ID!){ profileAllData(id:$id){ key value schemaVersion revision updatedAt } }`, { id: profileId });
      if (epoch !== contextEpoch || sequence !== pullSequence || profileId !== get().currentProfileId) return false;
      const rows = data?.profileAllData ?? [];
      const revisions = Object.fromEntries(rows.map(({ key, revision }) => [key, revision]));
      const rowByKey = new Map(rows.map((row) => [row.key, row]));
      const conflicts: Record<string, SyncConflict> = {};
      for (const [key, pending] of pendingChanges) {
        const row = rowByKey.get(key);
        const serverRevision = row?.revision ?? 0;
        if (serverRevision !== pending.baseRevision && row && valuesEqual(row.value, pending.value)) {
          pendingChanges.delete(key);
          const { currentUserId } = get();
          if (currentUserId) trackOutboxWrite(() => getOutboxModule().then((module) => module.deleteSyncOutboxEntry(currentUserId, profileId, key)));
        } else if (serverRevision !== pending.baseRevision) {
          conflicts[key] = {
            key,
            localValue: pending.value,
            serverValue: row?.value ?? null,
            serverRevision,
            schemaVersion: row?.schemaVersion ?? pending.schemaVersion,
            localUpdatedAt: pending.updatedAt,
            serverUpdatedAt: row?.updatedAt ? row.updatedAt * 1000 : null,
          };
        }
      }
      applyRows(rows);
      const updatedAtSeconds = rows.map((row) => row.updatedAt).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      const lastModifiedAt = updatedAtSeconds.length > 0 ? Math.max(...updatedAtSeconds) * 1000 : null;
      set({
        status: Object.keys(conflicts).length > 0 ? 'conflict' : pendingChanges.size > 0 ? 'syncing' : rows.length > 0 ? 'synced' : 'idle',
        lastSyncedAt: rows.length > 0 ? Date.now() : null,
        lastPulledAt: Date.now(),
        lastModifiedAt,
        isPulling: false,
        isInitialized: true,
        revisions,
        conflicts,
        pendingKeys: new Set(pendingChanges.keys()),
      });
      if (pendingChanges.size > 0 && Object.keys(conflicts).length === 0) {
        scheduleFlush(
          get().flush,
          Array.from(pendingChanges.values()).some((change) => change.immediate),
        );
      }
      return rows.length > 0;
    } catch (error) {
      if (epoch === contextEpoch && sequence === pullSequence) set({ status: 'error', error: parseError(error), isPulling: false });
      return false;
    }
  },

  forceSync: async () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    retryAttempt = 0;
    retryDeferred = false;
    if (!get().isInitialized) await get().pullAll(); // only to establish a baseline if sync never even started
    await get().flush(); // the actual point: force-push pending local changes now
  },

  resolveConflict: (key, resolution) => {
    const conflict = get().conflicts[key];
    if (!conflict) return;
    const nextConflicts = { ...get().conflicts };
    delete nextConflicts[key];
    if (resolution === 'server') {
      applyWithoutSyncPush(() => applyProfileData(key, conflict.serverValue));
      pendingChanges.delete(key);
      const { currentUserId, currentProfileId } = get();
      if (currentUserId && currentProfileId) trackOutboxWrite(() => getOutboxModule().then((module) => module.deleteSyncOutboxEntry(currentUserId, currentProfileId, key)));
      set((state) => ({
        conflicts: nextConflicts,
        revisions: { ...state.revisions, [key]: conflict.serverRevision },
        pendingKeys: withoutKey(state.pendingKeys, key),
        status: Object.keys(nextConflicts).length > 0 ? 'conflict' : pendingChanges.size > 0 ? 'syncing' : 'synced',
      }));
      return;
    }
    const current = pendingChanges.get(key);
    if (!current) return;
    const rebased = { ...current, baseRevision: conflict.serverRevision, generation: current.generation + 1 };
    pendingChanges.set(key, rebased);
    const { currentUserId, currentProfileId } = get();
    if (currentUserId && currentProfileId) persistPendingChange(currentUserId, currentProfileId, rebased);
    set((state) => ({ conflicts: nextConflicts, revisions: { ...state.revisions, [key]: conflict.serverRevision }, status: 'syncing' }));
    scheduleFlush(get().flush, true);
  },
}));
