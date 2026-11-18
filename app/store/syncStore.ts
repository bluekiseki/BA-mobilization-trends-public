import { acceptEditOrder, clearEditOrder, currentEditIds, nextEditId, observeEditClock } from './crossTabEditOrder';
import { SYNC_STORES, SYNC_TRACKED_STORES, type MirroredStore } from './crossTabPersistence';
import { editHistory } from './history/history';
import { readLocalProfile } from './history/profileSnapshot';
import { eventPlanEditValue, isEventCacheOnly } from '~/utils/eventPlanValue';
import { sameProfileValue } from '~/utils/profileDataComparison';
import {
  getPersistenceContext,
  hasPersistenceConflicts,
  safeLocalStorage,
  setPersistenceReadFailure,
  setPersistenceContextReader,
  withoutLocalPersistence,
  writeProfileStorage,
} from './history/localPersistence';
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
  editId?: string;
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
// Mirrored edits remain protected until their writing tab confirms the same edit was saved.
const mirroredChanges = new Map<string, { value: unknown; editId: string; baseRevision: number; updatedAt: number }>();
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
// Keys edited locally since the in-flight pull started; a pull response predating a since-flushed edit must not be applied.
const keysWrittenSincePullStart = new Set<string>();
let outboxModulePromise: Promise<typeof import('./syncOutbox.client')> | null = null;
let outboxWriteChain: Promise<void> = Promise.resolve();
// True only while sync itself is writing server/local-mirror data into the planner stores
// (applyRows / conflict resolution), so useSyncWatcher's reactive push() doesn't re-queue
// the value it just watched sync write.
let isApplyingSyncData = false;

export function applyWithoutSyncPush(action: () => void): void {
  const previous = isApplyingSyncData;
  isApplyingSyncData = true;
  try {
    editHistory.external(action);
  } finally {
    isApplyingSyncData = previous;
  }
}

export function rehydrateStore(store: MirroredStore, tracked: boolean, adopt = false, edits: Record<string, string> = {}) {
  const key = store.persist.getOptions().name;
  if (!key || hasPersistenceConflicts(key)) return;
  const failed = () => setPersistenceReadFailure(key, () => rehydrateStore(store, tracked, adopt, edits));
  const check = () => {
    // Zustand handles parsing errors internally and leaves hasHydrated false.
    if (store.persist.hasHydrated()) setPersistenceReadFailure(key);
    else failed();
  };
  const apply = () => {
    if (adopt) observeEditClock(edits);
    const before = adopt ? readLocalProfile() : null;
    try {
      const result = store.persist.rehydrate();
      check();
      void Promise.resolve(result).then(check).catch(failed);
    } catch {
      failed();
    }
    const rejected = before && store.persist.hasHydrated() && adoptCrossTabChanges(before, readLocalProfile(), edits);
    if (tracked) reapplyPendingChanges();
    // Repair stale shared storage too; otherwise a reload could adopt the rejected edit.
    // This write is marked external, so other tabs do not queue it as a new edit.
    if (rejected) {
      const persistence: { setState(partial: Record<string, never>): unknown } = store;
      persistence.setState({});
    }
  };
  if (tracked) applyWithoutSyncPush(apply);
  else apply();
}

/** Consume shared edits even if the browser has not delivered their storage events yet. */
export function refreshSharedPlannerEdits(): void {
  const { currentUserId, currentProfileId } = useSyncStore.getState();
  if (!currentProfileId) return;
  for (const store of SYNC_TRACKED_STORES) {
    const key = store.persist.getOptions().name;
    if (!key || hasPersistenceConflicts(key)) continue;
    const context = getPersistenceContext(safeLocalStorage.getItem(key));
    if (!context || context.userId !== currentUserId || context.profileId !== currentProfileId) continue;
    observeEditClock(context.edits);
    if (context.external) continue;
    rehydrateStore(store, true, true, context.edits);
  }
  receiveSyncRevisions(safeLocalStorage.getItem(SYNC_REVISIONS_KEY));
}

/** Adopt changed shared values without publishing them back to localStorage. */
export function adoptCrossTabChanges(before: Map<string, unknown>, after: Map<string, unknown>, edits: Record<string, string> = {}): boolean {
  let rejected = false;
  const { currentUserId, currentProfileId } = useSyncStore.getState();
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const value = after.get(key) ?? null;
    if (valuesEqual(key, before.get(key), value)) continue;
    if (currentProfileId && !edits[key]) continue;
    const editId = edits[key];
    if (currentProfileId && !acceptEditOrder(key, editId)) {
      rejected = true;
      // Hydration reads whole-store snapshots, which may contain an older edit.
      withoutLocalPersistence(() => applyProfileData(key, before.get(key) ?? null));
      continue;
    }
    keysWrittenSincePullStart.add(key);
    const pending = pendingChanges.get(key);
    if (!pending) {
      if (currentProfileId) mirroredChanges.set(key, { value, editId, baseRevision: useSyncStore.getState().revisions[key] ?? 0, updatedAt: Date.now() });
      continue;
    }
    // A cache rewrite is not a new edit and must not replace a queued draft.
    if (!editId || editId === pending.editId) continue;
    const next = { ...pending, value, generation: pending.generation + 1, updatedAt: Date.now(), editId };
    pendingChanges.set(key, next);
    if (currentUserId && currentProfileId) persistPendingChange(currentUserId, currentProfileId, next);
    const conflict = useSyncStore.getState().conflicts[key];
    if (conflict) useSyncStore.setState((state) => ({ conflicts: { ...state.conflicts, [key]: { ...conflict, localValue: value, localUpdatedAt: next.updatedAt } } }));
  }
  if (mirroredChanges.size > 0 && ['idle', 'synced'].includes(useSyncStore.getState().status)) {
    useSyncStore.setState({ status: 'syncing' });
  }
  return rejected;
}

export function reapplyPendingChanges(): void {
  withoutLocalPersistence(() => {
    for (const [key, mirrored] of mirroredChanges) applyProfileData(key, mirrored.value);
    for (const [key, pending] of pendingChanges) applyProfileData(key, pending.value);
  });
}

export const SYNC_REVISIONS_KEY = 'yuzu_sync_revisions';
function publishSyncRevisions(edits: Record<string, string>) {
  const { currentUserId: userId, currentProfileId: profileId, revisions, lastModifiedAt } = useSyncStore.getState();
  try {
    localStorage.setItem(SYNC_REVISIONS_KEY, JSON.stringify({ userId, profileId, revisions, edits, lastModifiedAt }));
  } catch {
    /* Revision notifications are optional; normal server conflict checks remain active. */
  }
}
export function receiveSyncRevisions(raw: string | null) {
  if (!raw) return;
  try {
    const data: unknown = JSON.parse(raw);
    const state = useSyncStore.getState();
    if (
      !data ||
      typeof data !== 'object' ||
      !('userId' in data) ||
      data.userId !== state.currentUserId ||
      !('profileId' in data) ||
      !data.profileId ||
      data.profileId !== state.currentProfileId ||
      !('revisions' in data) ||
      !data.revisions ||
      typeof data.revisions !== 'object'
    )
      return;
    if (!('edits' in data) || !data.edits || typeof data.edits !== 'object') return;
    const edits = new Map<string, unknown>(Object.entries(data.edits));
    const revisions = { ...state.revisions };
    const conflicts = { ...state.conflicts };
    let acknowledged = false;
    for (const [key, revision] of Object.entries(data.revisions)) {
      const editId = edits.get(key);
      const pending = pendingChanges.get(key);
      const mirrored = mirroredChanges.get(key);
      // A revision alone is not proof that our value was saved. Never authorize an
      // unrelated draft to overwrite the server by advancing its base revision.
      if (typeof editId !== 'string' || (pending?.editId !== editId && mirrored?.editId !== editId)) continue;
      if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < (revisions[key] ?? 0)) continue;
      acknowledged = true;
      if (mirrored?.editId === editId) mirroredChanges.delete(key);
      revisions[key] = revision;
      keysWrittenSincePullStart.add(key);
      if (pending?.editId === editId) {
        pendingChanges.delete(key);
        delete conflicts[key];
        if (state.currentUserId && state.currentProfileId) {
          const { currentUserId, currentProfileId } = state;
          trackOutboxWrite(() => getOutboxModule().then((module) => module.deleteSyncOutboxEntry(currentUserId, currentProfileId, key, persistedChange(currentUserId, currentProfileId, pending))));
        }
      }
    }
    const modifiedAt = 'lastModifiedAt' in data && typeof data.lastModifiedAt === 'number' && Number.isFinite(data.lastModifiedAt) ? data.lastModifiedAt : null;
    useSyncStore.setState({
      revisions,
      ...(acknowledged
        ? {
            conflicts,
            pendingKeys: new Set(pendingChanges.keys()),
            lastSyncedAt: Date.now(),
            lastModifiedAt: modifiedAt === null ? state.lastModifiedAt : Math.max(state.lastModifiedAt ?? 0, modifiedAt),
            status:
              state.status === 'idle' || state.status === 'error'
                ? state.status
                : Object.keys(conflicts).length > 0
                  ? ('conflict' as const)
                  : Object.keys(state.rejected).length > 0
                    ? ('error' as const)
                    : state.isPulling || pendingChanges.size > 0 || mirroredChanges.size > 0
                      ? ('syncing' as const)
                      : ('synced' as const),
          }
        : {}),
    });
  } catch {
    /* Ignore malformed or unavailable cross-tab revision notifications. */
  }
}

function getOutboxModule() {
  outboxModulePromise ??= import('./syncOutbox.client');
  return outboxModulePromise;
}

function trackOutboxWrite(operation: () => Promise<void>): void {
  outboxWriteChain = outboxWriteChain.then(operation).catch((error: unknown) => console.error('Failed to persist sync outbox:', error));
}

function persistedChange(userId: string, profileId: string, change: PendingChange) {
  return {
    userId,
    profileId,
    key: change.key,
    baseRevision: change.baseRevision,
    desiredValue: change.value,
    schemaVersion: change.schemaVersion,
    generation: change.generation,
    updatedAt: change.updatedAt,
    editId: change.editId,
  };
}
function persistPendingChange(userId: string, profileId: string, change: PendingChange): void {
  trackOutboxWrite(() => getOutboxModule().then((module) => module.putSyncOutboxEntry(persistedChange(userId, profileId, change))));
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

function valuesEqual(key: string, left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return sameProfileValue(key.startsWith('eventPlans:') ? eventPlanEditValue(left) : left, key.startsWith('eventPlans:') ? eventPlanEditValue(right) : right);
  } catch {
    return false;
  }
}

function applyLocalStorageValue(key: string, value: unknown, origin: 'local' | 'external'): void {
  if (typeof localStorage === 'undefined') return;
  if (key === 'theme' && typeof value === 'string') writeProfileStorage('theme', value);
  else if (key === 'gacha_prefs') writeProfileStorage('gacha_prefs_v1', JSON.stringify(value), origin);
  else if (key === 'gacha_strategies') writeProfileStorage('gacha_strategies_v3', JSON.stringify(value), origin);
}

function clearPlannerStores(): void {
  useGlobalStore.setState({ growthPlans: [], ownedGifts: {}, materialInventory: {} });
  useEquipmentPlanStore.setState({ runCounts: {}, farmingDays: 1, normalMultiplier: 2, hardMultiplier: 2, campaignSource: 'jp' });
  useResourcePlanStore.getState().resetAll();
  useEventPlanStore.setState({ plans: {} });
  useRaidHistoryStore.setState({ entries: [] });
  useGachaHistoryStore.setState({ entries: [] });
}

export function applyProfileData(key: string, value: unknown, origin: 'local' | 'external' = 'external'): void {
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
    if (key === 'gacha_prefs') writeProfileStorage('gacha_prefs_v1', null, origin);
    if (key === 'gacha_strategies') {
      writeProfileStorage('gacha_strategies_v2', null, origin);
      writeProfileStorage('gacha_strategies_v3', null, origin);
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
    applyLocalStorageValue(key, value, origin);
  }
}

function applyRows(rows: ProfileDataRow[], preservedValues: Map<string, unknown>): void {
  applyWithoutSyncPush(() => {
    withoutLocalPersistence(clearPlannerStores);
    const values = new Map(rows.map((row) => [row.key, row.value]));
    for (const [key, mirrored] of mirroredChanges) {
      if (valuesEqual(key, values.get(key), mirrored.value)) mirroredChanges.delete(key);
      else values.set(key, mirrored.value);
    }
    for (const [key, value] of preservedValues) values.set(key, value);
    for (const [key, pending] of pendingChanges) values.set(key, pending.value);
    const eventPlans: Record<string, Partial<EventPlan>> = {};
    for (const [key, value] of values) {
      if (key.startsWith('eventPlans:') && value !== null) eventPlans[key.slice(11)] = value as Partial<EventPlan>;
      else applyProfileData(key, value);
    }
    useEventPlanStore.setState({ plans: eventPlans });
    // Missing rows still need their final empty value published, without an intermediate reset.
    for (const [key, publish] of [
      ['growthPlans', () => useGlobalStore.setState({})],
      ['equipmentPlan', () => useEquipmentPlanStore.setState({})],
      ['resourcePlan', () => useResourcePlanStore.setState({})],
      ['raidHistory', () => useRaidHistoryStore.setState({})],
      ['gachaHistory', () => useGachaHistoryStore.setState({})],
    ] as const)
      if (!values.has(key)) publish();
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
    editHistory.clear();
    contextEpoch += 1;
    cancelScheduledFlushes();
    pendingChanges.clear();
    mirroredChanges.clear();
    clearEditOrder();
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
    applyWithoutSyncPush(clearPlannerStores);
  },

  initializeProfile: async (userId, profileId) => {
    editHistory.clear();
    contextEpoch += 1;
    const epoch = contextEpoch;
    cancelScheduledFlushes();
    pendingChanges.clear();
    mirroredChanges.clear();
    clearEditOrder();
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
    applyWithoutSyncPush(() => withoutLocalPersistence(clearPlannerStores));
    try {
      await waitForOutboxWrites();
      const entries = await getOutboxModule().then((module) => module.getSyncOutboxEntries(userId, profileId));
      if (epoch !== contextEpoch) return false;
      for (const entry of entries) {
        if (isEventCacheOnly(entry.key, entry.desiredValue)) {
          trackOutboxWrite(() => getOutboxModule().then((module) => module.deleteSyncOutboxEntry(userId, profileId, entry.key, entry)));
          continue;
        }
        // A push() that landed while we were reading the outbox already reflects the newest edit — keep it.
        if (pendingChanges.has(entry.key)) continue;
        if (entry.editId) acceptEditOrder(entry.key, entry.editId);
        pendingChanges.set(entry.key, {
          key: entry.key,
          value: entry.key.startsWith('eventPlans:') ? eventPlanEditValue(entry.desiredValue) : entry.desiredValue,
          schemaVersion: entry.schemaVersion,
          baseRevision: entry.baseRevision,
          generation: entry.generation,
          updatedAt: entry.updatedAt,
          immediate: false,
          editId: entry.editId,
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
    if (isEventCacheOnly(key, value)) return;
    if (key.startsWith('eventPlans:')) value = eventPlanEditValue(value);
    // Read counters only: hydrating here would overwrite the input that triggered push().
    const kind = key.split(':')[0];
    const store = kind in SYNC_STORES ? SYNC_STORES[kind as keyof typeof SYNC_STORES] : undefined;
    const name = store?.persist.getOptions().name;
    const context = name ? getPersistenceContext(safeLocalStorage.getItem(name)) : null;
    if (context?.userId === currentUserId && context.profileId === currentProfileId) observeEditClock(context.edits);
    keysWrittenSincePullStart.add(key);
    mirroredChanges.delete(key);
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
      editId: nextEditId(key),
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
      let bytes = 0;
      const changes = Array.from(pendingChanges.values())
        .filter((change) => !conflicts[change.key] && !rejected[change.key])
        .slice(0, 20)
        .filter((change) => {
          const size = new TextEncoder().encode(JSON.stringify(change)).byteLength;
          if (bytes > 0 && bytes + size > 2 * 1024 * 1024) return false;
          bytes += size;
          return true;
        });
      if (changes.length === 0) return;
      lastFlushStartedAt = Date.now();
      set({ status: 'syncing', error: null });
      try {
        const response = await gqlFetch<{ syncProfileData: SyncMutationResult[] }>(
          `mutation SyncProfileData($profileId:ID!,$changes:[SyncProfileDataChangeInput!]!){ syncProfileData(profileId:$profileId,changes:$changes){ key status revision serverValue schemaVersion updatedAt message } }`,
          { profileId: currentProfileId, changes: changes.map(({ key, value, schemaVersion, baseRevision }) => ({ key, value, schemaVersion, baseRevision })) },
        );
        if (epoch !== contextEpoch || currentProfileId !== get().currentProfileId) return;
        const results = new Map(response.syncProfileData.map((result) => [result.key, result]));
        const nextConflicts = { ...get().conflicts };
        const nextRejected = { ...get().rejected };
        const nextRevisions = { ...get().revisions };
        let latestModifiedAt = get().lastModifiedAt;
        const savedEdits: Record<string, string> = {};

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
            // Another tab acknowledged this same edit while the request was in flight: it is already saved.
            if (!current && valuesEqual(sent.key, result.serverValue, sent.value)) {
              nextRevisions[sent.key] = Math.max(nextRevisions[sent.key] ?? 0, result.revision);
              continue;
            }
            // Another tab already acknowledged this revision while this request was in flight.
            if (current && current.baseRevision > sent.baseRevision && current.baseRevision >= result.revision) {
              nextRevisions[sent.key] = Math.max(nextRevisions[sent.key] ?? 0, result.revision);
              continue;
            }
            if (current && valuesEqual(sent.key, result.serverValue, current.value)) {
              if (current.editId) savedEdits[sent.key] = current.editId;
              nextRevisions[sent.key] = Math.max(nextRevisions[sent.key] ?? 0, result.revision);
              pendingChanges.delete(sent.key);
              set((state) => ({ pendingKeys: withoutKey(state.pendingKeys, sent.key) }));
              if (currentUserId)
                trackOutboxWrite(() =>
                  getOutboxModule().then((module) => module.deleteSyncOutboxEntry(currentUserId, currentProfileId, sent.key, persistedChange(currentUserId, currentProfileId, current ?? sent))),
                );
              continue;
            }
            if (current && current.generation !== sent.generation && valuesEqual(sent.key, result.serverValue, sent.value)) {
              const rebased = { ...current, baseRevision: Math.max(current.baseRevision, result.revision) };
              pendingChanges.set(sent.key, rebased);
              nextRevisions[sent.key] = Math.max(nextRevisions[sent.key] ?? 0, result.revision);
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
          if (sent.editId) savedEdits[sent.key] = sent.editId;
          nextRevisions[sent.key] = Math.max(nextRevisions[sent.key] ?? 0, result.revision);
          if (typeof result.updatedAt === 'number') latestModifiedAt = Math.max(latestModifiedAt ?? 0, result.updatedAt * 1000);
          if (current?.generation === sent.generation) {
            pendingChanges.delete(sent.key);
            set((state) => ({ pendingKeys: withoutKey(state.pendingKeys, sent.key) }));
            if (currentUserId)
              trackOutboxWrite(() =>
                getOutboxModule().then((module) => module.deleteSyncOutboxEntry(currentUserId, currentProfileId, sent.key, persistedChange(currentUserId, currentProfileId, current ?? sent))),
              );
          } else if (current) {
            const rebased = { ...current, baseRevision: Math.max(current.baseRevision, result.revision) };
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
          status: Object.keys(nextConflicts).length > 0 ? 'conflict' : hasRetryable ? 'syncing' : rejectedMessages.length > 0 ? 'error' : mirroredChanges.size > 0 ? 'syncing' : 'synced',
          lastSyncedAt: Date.now(),
          lastModifiedAt: latestModifiedAt,
          error: rejectedMessages.length > 0 ? rejectedMessages[0] : null,
        });
        publishSyncRevisions(savedEdits);
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
    refreshSharedPlannerEdits();
    const sequence = ++pullSequence;
    keysWrittenSincePullStart.clear();
    set({ status: 'syncing', isPulling: true, error: null });
    try {
      const data = await gqlFetch<{ profileAllData: ProfileDataRow[] }>(`query($id:ID!){ profileAllData(id:$id){ key value schemaVersion revision updatedAt } }`, { id: profileId });
      if (epoch !== contextEpoch || sequence !== pullSequence || profileId !== get().currentProfileId) return false;
      refreshSharedPlannerEdits();
      const rows = data?.profileAllData ?? [];
      const rowByKey = new Map(rows.map((row) => [row.key, row]));
      const revisions = { ...get().revisions };
      const preservedKeys = new Set(keysWrittenSincePullStart);
      // A response can predate a save acknowledged by this tab or another tab.
      for (const [key, revision] of Object.entries(revisions)) {
        if ((rowByKey.get(key)?.revision ?? 0) < revision) preservedKeys.add(key);
      }
      for (const row of rows) revisions[row.key] = Math.max(revisions[row.key] ?? 0, row.revision);
      const localValues = preservedKeys.size > 0 ? readLocalProfile() : new Map<string, unknown>();
      const preservedValues = new Map([...preservedKeys].map((key) => [key, localValues.get(key) ?? null]));
      const conflicts: Record<string, SyncConflict> = {};
      // A surviving tab can finish an orphaned edit using the normal queue and conflict UI.
      // Edits arriving during this request need a later baseline, not its older response.
      for (const [key, mirrored] of mirroredChanges) {
        const row = rowByKey.get(key);
        if (valuesEqual(key, row?.value, mirrored.value)) {
          mirroredChanges.delete(key);
        } else if (!keysWrittenSincePullStart.has(key) && (row?.revision ?? 0) >= (get().revisions[key] ?? 0)) {
          const change: PendingChange = {
            key,
            value: mirrored.value,
            editId: mirrored.editId,
            baseRevision: mirrored.baseRevision,
            updatedAt: mirrored.updatedAt,
            schemaVersion: row?.schemaVersion ?? 1,
            generation: 1,
            immediate: false,
          };
          pendingChanges.set(key, change);
          mirroredChanges.delete(key);
          const { currentUserId } = get();
          if (currentUserId) persistPendingChange(currentUserId, profileId, change);
        }
      }
      for (const [key, pending] of pendingChanges) {
        const row = rowByKey.get(key);
        const serverRevision = row?.revision ?? 0;
        // An older response cannot establish a conflict against an already acknowledged revision.
        if (serverRevision < (get().revisions[key] ?? 0)) {
          if (get().conflicts[key]) conflicts[key] = get().conflicts[key];
          continue;
        }
        if (serverRevision !== pending.baseRevision && row && valuesEqual(key, row.value, pending.value)) {
          pendingChanges.delete(key);
          const { currentUserId } = get();
          if (currentUserId)
            trackOutboxWrite(() => getOutboxModule().then((module) => module.deleteSyncOutboxEntry(currentUserId, profileId, key, persistedChange(currentUserId, profileId, pending))));
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
      applyRows(rows, preservedValues);
      const updatedAtSeconds = rows.map((row) => row.updatedAt).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      const lastModifiedAt = updatedAtSeconds.length > 0 ? Math.max(...updatedAtSeconds) * 1000 : null;
      set({
        status: Object.keys(conflicts).length > 0 ? 'conflict' : pendingChanges.size > 0 || mirroredChanges.size > 0 ? 'syncing' : rows.length > 0 ? 'synced' : 'idle',
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
    do {
      const count = pendingChanges.size;
      await get().flush();
      if (pendingChanges.size >= count || get().status === 'error' || get().status === 'conflict') break;
    } while (pendingChanges.size);
  },

  resolveConflict: (key, resolution) => {
    const conflict = get().conflicts[key];
    if (!conflict) return;
    keysWrittenSincePullStart.add(key);
    const nextConflicts = { ...get().conflicts };
    delete nextConflicts[key];
    if (resolution === 'server') {
      applyWithoutSyncPush(() => applyProfileData(key, conflict.serverValue));
      const discarded = pendingChanges.get(key);
      pendingChanges.delete(key);
      const { currentUserId, currentProfileId } = get();
      if (currentUserId && currentProfileId && discarded)
        trackOutboxWrite(() => getOutboxModule().then((module) => module.deleteSyncOutboxEntry(currentUserId, currentProfileId, key, persistedChange(currentUserId, currentProfileId, discarded))));
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

setPersistenceContextReader(() => {
  const state = useSyncStore.getState();
  return {
    userId: state.currentUserId,
    profileId: state.currentProfileId,
    external: isApplyingSyncData,
    edits: { ...currentEditIds(), ...Object.fromEntries([...mirroredChanges, ...pendingChanges].flatMap(([key, change]) => (change.editId ? [[key, change.editId]] : []))) },
  };
});
