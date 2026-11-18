import { useEventPlanStore } from '~/store/planner/useEventPlanStore';
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNC_TRACKED_STORES, useCrossTabSync } from './useCrossTabSync';
import { useSyncWatcher } from '~/store/planner/useSyncWatcher';
import {
  hasPersistenceConflicts,
  hasPersistenceFailures,
  hasPersistenceReadFailures,
  resolvePersistenceConflicts,
  retryLocalPersistence,
  safeLocalStorage,
  setPersistenceReadFailure,
} from '~/store/history/localPersistence';
import { SESSION_HINT_KEY, useAuthStore } from '~/store/authStore';
import { SYNC_REVISIONS_KEY, useSyncStore } from '~/store/syncStore';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { editHistory, snapshot } from '~/store/history/history';

let root: Root;
function Harness() {
  useCrossTabSync();
  return null;
}
function TrackedHarness() {
  useCrossTabSync();
  useSyncWatcher();
  return null;
}
function recordEdit() {
  editHistory.seed('growthPlans', snapshot(0));
  editHistory.observe('growthPlans', snapshot(1));
  editHistory.commit();
}
function storage(key: string, oldValue: string | null, newValue: string | null) {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  useAuthStore.getState().logout();
  useSyncStore.getState().clearAccountData();
  root = createRoot(document.createElement('div'));
  act(() => {
    root.render(createElement(Harness));
  });
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  useAuthStore.getState().logout();
  useSyncStore.getState().clearAccountData();
  for (const store of SYNC_TRACKED_STORES) {
    const key = store.persist.getOptions().name;
    if (key) setPersistenceReadFailure(key);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('cross-tab logout', () => {
  it('clears account, pending sync and undo history before following shared planner writes', () => {
    useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
    useAuthStore.getState().setActiveProfile('profile-1');
    useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', pendingKeys: new Set(['growthPlans']) });
    useGlobalStore.setState({ ownedGifts: { gift: 5 } });
    recordEdit();

    storage(SESSION_HINT_KEY, '1', null);

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().activeProfileId).toBeNull();
    expect(useSyncStore.getState().currentProfileId).toBeNull();
    expect(useSyncStore.getState().pendingKeys.size).toBe(0);
    expect(editHistory.entries).toHaveLength(0);
    expect(useGlobalStore.getState().ownedGifts).toEqual({});
  });

  it('preserves anonymous edits and undo history when another tab logs out', () => {
    useGlobalStore.setState({ ownedGifts: { anonymousGift: 5 } });
    recordEdit();
    storage(SESSION_HINT_KEY, '1', null);
    const key = useGlobalStore.persist.getOptions().name;
    if (!key) throw new Error('Missing planner storage key');
    localStorage.removeItem(key);
    storage(key, '{"state":{}}', null);

    expect(useGlobalStore.getState().ownedGifts).toEqual({ anonymousGift: 5 });
    expect(editHistory.entries).toHaveLength(1);
    expect(editHistory.cursor).toBe(1);
  });
});

it('records an edit immediately after a synchronous cross-tab rehydrate', async () => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  useGlobalStore.setState({ ownedGifts: { gift: 1 } });
  editHistory.clear();
  editHistory.seed('growthPlans', snapshot(1));
  const stop = useGlobalStore.subscribe((state) => editHistory.observe('growthPlans', snapshot(state.ownedGifts.gift)));
  try {
    const key = useGlobalStore.persist.getOptions().name;
    if (!key) throw new Error('Missing planner storage key');
    const oldValue = localStorage.getItem(key);
    const newValue = JSON.stringify({ state: { ...useGlobalStore.getState(), ownedGifts: { gift: 2 } }, version: 0 });
    localStorage.setItem(key, newValue);
    storage(key, oldValue, newValue);
    act(() => {
      useGlobalStore.setState({ ownedGifts: { gift: 3 } });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(editHistory.entries).toHaveLength(1);
    expect(editHistory.entries[0].changes[0]).toMatchObject({ before: snapshot(2), after: snapshot(3) });
  } finally {
    stop();
  }
});

it.each(SYNC_TRACKED_STORES.map((store) => ({ store, name: store.persist.getOptions().name })))(
  'hydrates $name synchronously without recording or queuing external changes',
  async ({ store, name }) => {
    if (!name) throw new Error('Missing planner storage key');
    useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
    useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true });
    act(() => {
      root.render(createElement(TrackedHarness));
    });
    const overrides: Record<string, Record<string, unknown>> = {
      'global-growth-plans-v2': { ownedGifts: { gift: 2 } },
      'equipment-plan-storage': { farmingDays: 3 },
      'event-plans-v2': { plans: { '1': { selectedStudents: ['10'] } } },
      'gacha-history-v1': { simulationCount: 12345 },
      'resource-plan-v2': { server: 'kr', kr: { pvpAverageRank: 12345 } },
      'raid-history-v1': { entries: [{ id: 'cross-tab', raidId: '1', raidType: 'raid', server: 'JP', date: '2026-11-16' }] },
    };
    expect(overrides[name]).toBeDefined();
    const finished = vi.fn();
    const stop = store.persist.onFinishHydration(finished);
    try {
      const raw = JSON.stringify({ state: { ...store.getState(), ...overrides[name] }, version: store.persist.getOptions().version ?? 0 });
      localStorage.setItem(name, raw);
      storage(name, null, raw);
      expect(finished).toHaveBeenCalledTimes(1);
      expect(store.persist.hasHydrated()).toBe(true);
      expect(store.getState()).toMatchObject(overrides[name]);
      await act(async () => {
        await Promise.resolve();
      });
      expect(finished).toHaveBeenCalledTimes(1);
      editHistory.commit();
      expect(editHistory.entries).toHaveLength(0);
      expect(useSyncStore.getState().pendingKeys.size).toBe(0);
    } finally {
      stop();
    }
  },
);

it('reports a swallowed hydration parsing error and retries without replacing the current view', async () => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  useGlobalStore.setState({ ownedGifts: { gift: 5 } });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  localStorage.setItem(key, 'broken-json');
  storage(key, null, 'broken-json');
  await act(async () => {
    await Promise.resolve();
  });
  expect(hasPersistenceReadFailures()).toBe(true);
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 5 });
  localStorage.setItem(key, JSON.stringify({ state: { ownedGifts: { gift: 6 } }, version: 0 }));
  act(() => {
    retryLocalPersistence();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(hasPersistenceReadFailures()).toBe(false);
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 6 });
});

it('handles a rejected hydration promise without an unhandled rejection', async () => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  const hydrate = vi.spyOn(useGlobalStore.persist, 'rehydrate').mockRejectedValue(new Error('Read failed'));
  storage(key, null, '{}');
  await act(async () => {
    await Promise.resolve();
  });
  expect(hasPersistenceReadFailures()).toBe(true);
  hydrate.mockRestore();
  act(() => {
    retryLocalPersistence();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(hasPersistenceReadFailures()).toBe(false);
});

it('retains a failed anonymous edit until the user chooses the other tab', () => {
  useGlobalStore.setState({ ownedGifts: { gift: 1 } });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Quota');
  });
  useGlobalStore.setState({ ownedGifts: { gift: 2 } });
  write.mockRestore();
  const remote = JSON.stringify({ state: { ownedGifts: { gift: 3 } }, version: 0 });
  localStorage.setItem(key, remote);
  storage(key, null, remote);
  expect(hasPersistenceConflicts(key)).toBe(true);
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 2 });
  expect(JSON.parse(safeLocalStorage.getItem(key) ?? '{}')).toMatchObject({ state: { ownedGifts: { gift: 2 } } });
  act(() => {
    retryLocalPersistence();
  });
  expect(localStorage.getItem(key)).toBe(remote);
  act(() => {
    resolvePersistenceConflicts('remote');
  });
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 3 });
  expect(hasPersistenceFailures()).toBe(false);
});

it('replaces pending server edits when the user explicitly chooses the other tab', () => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true });
  const push = vi.spyOn(useSyncStore.getState(), 'push');
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Quota');
  });
  useGlobalStore.setState({ ownedGifts: { gift: 2 } });
  write.mockRestore();
  const remote = JSON.stringify({ state: { ownedGifts: { gift: 3 } }, version: 0 });
  localStorage.setItem(key, remote);
  storage(key, null, remote);
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 2 });
  act(() => {
    resolvePersistenceConflicts('remote');
  });
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 3 });
  expect(push).toHaveBeenLastCalledWith('growthPlans', expect.objectContaining({ ownedGifts: { gift: 3 } }));
});

it.each([false, true])('mirrors ordinary planner edits with loggedIn=%s without writing them back', (loggedIn) => {
  if (loggedIn) {
    useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
    useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true });
  }
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  const raw = JSON.stringify({ state: { ownedGifts: { gift: 42 } }, version: 0, syncContext: { userId: loggedIn ? 'user-1' : null, profileId: loggedIn ? 'profile-1' : null, external: false } });
  localStorage.setItem(key, raw);
  const write = vi.spyOn(Storage.prototype, 'setItem');
  storage(key, null, raw);
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 42 });
  expect(write).not.toHaveBeenCalled();
  expect(useSyncStore.getState().pendingKeys.size).toBe(0);
  expect(editHistory.entries).toHaveLength(0);
});

it('replaces stale queued data with a newer edit from another tab before flushing', async () => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true });
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  act(() => {
    useGlobalStore.setState({ ownedGifts: { gift: 2 } });
  });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  const raw = JSON.stringify({
    state: { ownedGifts: { gift: 3 } },
    version: 0,
    syncContext: { userId: 'user-1', profileId: 'profile-1', external: false, edits: { growthPlans: 'newer-edit-from-other-tab' } },
  });
  localStorage.setItem(key, raw);
  storage(key, null, raw);
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 3 });
  expect(localStorage.getItem(key)).toBe(raw);
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: { syncProfileData: [{ key: 'growthPlans', status: 'APPLIED', revision: 1, updatedAt: 1_700_000_000 }] } }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetch);
  await act(async () => {
    await useSyncStore.getState().flush();
  });
  const init = fetch.mock.calls[0]?.[1] as RequestInit | undefined;
  if (typeof init?.body !== 'string') throw new Error('Missing GraphQL request body');
  const request = JSON.parse(init.body) as { variables: { changes: Array<{ value: { ownedGifts: Record<string, number> } }> } };
  expect(request.variables.changes[0].value.ownedGifts).toEqual({ gift: 3 });
  expect(useSyncStore.getState().conflicts).toEqual({});
  expect(JSON.parse(localStorage.getItem(SYNC_REVISIONS_KEY) ?? '{}')).toMatchObject({ edits: { growthPlans: 'newer-edit-from-other-tab' } });
});

it('keeps queued edits over server refreshes without overwriting shared storage', () => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true });
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  act(() => {
    useGlobalStore.setState({ ownedGifts: { gift: 2 } });
  });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  const raw = JSON.stringify({ state: { ownedGifts: { gift: 1 } }, version: 0, syncContext: { userId: 'user-1', profileId: 'profile-1', external: true } });
  localStorage.setItem(key, raw);
  const write = vi.spyOn(Storage.prototype, 'setItem');
  storage(key, null, raw);
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 2 });
  expect(write).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).toBe(raw);
});

it('does not apply another account’s shared cache to an anonymous plan', () => {
  useGlobalStore.setState({ ownedGifts: { anonymousGift: 5 } });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  const raw = JSON.stringify({ state: { ownedGifts: {} }, version: 0, syncContext: { userId: 'other-user', profileId: 'other-profile', external: true } });
  localStorage.setItem(key, raw);
  storage(key, null, raw);
  expect(useGlobalStore.getState().ownedGifts).toEqual({ anonymousGift: 5 });
});

it('does not rebase an unrelated pending write from another tabs revision notification', async () => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true, revisions: { growthPlans: 1 } });
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  act(() => {
    useGlobalStore.setState({ ownedGifts: { gift: 3 } });
  });
  let respond: ((response: Response) => void) | undefined;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const operation = useSyncStore.getState().flush();
  const ack = JSON.stringify({ userId: 'user-1', profileId: 'profile-1', revisions: { growthPlans: 2 } });
  localStorage.setItem(SYNC_REVISIONS_KEY, ack);
  storage(SYNC_REVISIONS_KEY, null, ack);
  expect(useSyncStore.getState().revisions.growthPlans).toBe(1);
  if (!respond) throw new Error('Missing pending request');
  await act(async () => {
    respond?.(
      new Response(JSON.stringify({ data: { syncProfileData: [{ key: 'growthPlans', status: 'CONFLICT', revision: 2, serverValue: { ownedGifts: { gift: 2 } } }] } }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await operation;
  });
  expect(useSyncStore.getState().conflicts.growthPlans?.serverRevision).toBe(2);
  expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(true);
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 3 });
  localStorage.setItem(SYNC_REVISIONS_KEY, JSON.stringify({ userId: 'other-user', profileId: 'other-profile', revisions: { growthPlans: 99 } }));
  storage(SYNC_REVISIONS_KEY, ack, localStorage.getItem(SYNC_REVISIONS_KEY));
  expect(useSyncStore.getState().revisions.growthPlans).toBe(1);
});

it('keeps a mirrored edit while an idle signed-in tab refreshes an older server snapshot', async () => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true, revisions: { growthPlans: 1 } });
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  const raw = JSON.stringify({ state: { ownedGifts: { gift: 3 } }, version: 0, syncContext: { userId: 'user-1', profileId: 'profile-1', external: false, edits: { growthPlans: 'remote-edit' } } });
  localStorage.setItem(key, raw);
  storage(key, null, raw);
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 3 });
  expect(useSyncStore.getState().pendingKeys.size).toBe(0);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { profileAllData: [{ key: 'growthPlans', value: { growthPlans: [], ownedGifts: { gift: 1 }, materialInventory: {} }, revision: 1, schemaVersion: 1, updatedAt: 1_700_000_000 }] },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    ),
  );
  await act(async () => {
    await useSyncStore.getState().pullAll();
  });
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 3 });
  expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({ state: { ownedGifts: { gift: 3 } } });
});

it('reconciles a mirrored conflict and clears it when its own save is acknowledged', async () => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true, revisions: { growthPlans: 1 } });
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  const raw = JSON.stringify({ state: { ownedGifts: { gift: 3 } }, version: 0, syncContext: { userId: 'user-1', profileId: 'profile-1', external: false, edits: { growthPlans: 'latest-edit' } } });
  localStorage.setItem(key, raw);
  storage(key, null, raw);
  const reply = (gift: number, revision: number) =>
    new Response(
      JSON.stringify({
        data: { profileAllData: [{ key: 'growthPlans', value: { growthPlans: [], ownedGifts: { gift }, materialInventory: {} }, revision, schemaVersion: 1, updatedAt: 1_700_000_000 }] },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(reply(2, 2)));
  vi.stubGlobal('fetch', fetch);
  const acknowledge = (editId: string) => {
    const ack = JSON.stringify({ userId: 'user-1', profileId: 'profile-1', revisions: { growthPlans: 2 }, edits: { growthPlans: editId } });
    const previous = localStorage.getItem(SYNC_REVISIONS_KEY);
    localStorage.setItem(SYNC_REVISIONS_KEY, ack);
    storage(SYNC_REVISIONS_KEY, previous, ack);
  };
  acknowledge('older-edit');
  await act(async () => {
    await useSyncStore.getState().pullAll();
  });
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 3 });
  expect(useSyncStore.getState().pendingKeys.size).toBe(1);
  expect(useSyncStore.getState().conflicts.growthPlans?.serverRevision).toBe(2);
  acknowledge('latest-edit');
  expect(useSyncStore.getState().pendingKeys.size).toBe(0);
  expect(useSyncStore.getState().conflicts).toEqual({});
  fetch.mockImplementation(() => Promise.resolve(reply(4, 3)));
  await act(async () => {
    await useSyncStore.getState().pullAll();
  });
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 4 });
  expect(useSyncStore.getState().conflicts).toEqual({});
});

it.each([false, true])('preserves a cross-tab edit arriving during a pull without refetching (acknowledged: %s)', async (acknowledged) => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true, revisions: { growthPlans: 1 } });
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  let resolvePull: ((response: Response) => void) | undefined;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolvePull = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  let pull: Promise<boolean>;
  act(() => {
    pull = useSyncStore.getState().pullAll();
  });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  const raw = JSON.stringify({ state: { ownedGifts: { gift: 3 } }, version: 0, syncContext: { userId: 'user-1', profileId: 'profile-1', external: false, edits: { growthPlans: 'remote-edit' } } });
  localStorage.setItem(key, raw);
  storage(key, null, raw);
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 3 });
  expect(useSyncStore.getState().pendingKeys.size).toBe(0);
  if (acknowledged) {
    const ack = JSON.stringify({ userId: 'user-1', profileId: 'profile-1', revisions: { growthPlans: 2 }, edits: { growthPlans: 'remote-edit' } });
    localStorage.setItem(SYNC_REVISIONS_KEY, ack);
    storage(SYNC_REVISIONS_KEY, null, ack);
  }
  await act(async () => {
    resolvePull?.(new Response(JSON.stringify({ data: { profileAllData: [] } }), { headers: { 'Content-Type': 'application/json' } }));
    await pull;
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(useSyncStore.getState().revisions.growthPlans).toBe(acknowledged ? 2 : 1);
  expect(useSyncStore.getState().pendingKeys.size).toBe(0);
  expect(useSyncStore.getState().conflicts).toEqual({});
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 3 });
  expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({ state: { ownedGifts: { gift: 3 } } });
});

it('reads a shared edit before applying a server response even when the storage event is still queued', async () => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true, revisions: { growthPlans: 1 } });
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  let resolvePull: ((response: Response) => void) | undefined;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolvePull = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  let pull: Promise<boolean>;
  act(() => {
    pull = useSyncStore.getState().pullAll();
  });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  const raw = JSON.stringify({ state: { ownedGifts: { gift: 3 } }, version: 0, syncContext: { userId: 'user-1', profileId: 'profile-1', external: false, edits: { growthPlans: 'remote-edit' } } });
  localStorage.setItem(key, raw);
  // Another tab has written, but this tab has not received its storage event yet.
  expect(useSyncStore.getState().pendingKeys.size).toBe(0);
  await act(async () => {
    resolvePull?.(new Response(JSON.stringify({ data: { profileAllData: [] } }), { headers: { 'Content-Type': 'application/json' } }));
    await pull;
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(useSyncStore.getState().revisions.growthPlans).toBe(1);
  expect(useSyncStore.getState().pendingKeys.size).toBe(0);
  expect(useSyncStore.getState().conflicts).toEqual({});
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 3 });
  expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({ state: { ownedGifts: { gift: 3 } } });
});

it('preserves event purchases when a shared write arrives before its storage event', async () => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true, revisions: { 'eventPlans:10850': 1 } });
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  let resolvePull: ((response: Response) => void) | undefined;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolvePull = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  let pull: Promise<boolean>;
  act(() => {
    pull = useSyncStore.getState().pullAll();
  });
  const key = useEventPlanStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  const raw = JSON.stringify({
    state: { plans: { 10850: { purchaseCounts: { 1: 3 } } } },
    version: 0,
    syncContext: { userId: 'user-1', profileId: 'profile-1', external: false, edits: { 'eventPlans:10850': 'remote-edit' } },
  });
  localStorage.setItem(key, raw);
  // Another tab has written, but this tab has not received its storage event yet.
  expect(useSyncStore.getState().pendingKeys.size).toBe(0);
  await act(async () => {
    resolvePull?.(new Response(JSON.stringify({ data: { profileAllData: [] } }), { headers: { 'Content-Type': 'application/json' } }));
    await pull;
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(useSyncStore.getState().revisions['eventPlans:10850']).toBe(1);
  expect(useSyncStore.getState().pendingKeys.size).toBe(0);
  expect(useSyncStore.getState().conflicts).toEqual({});
  expect(useEventPlanStore.getState().plans[10850]?.purchaseCounts).toEqual({ 1: 3 });
  expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({ state: { plans: { 10850: { purchaseCounts: { 1: 3 } } } } });
});

it('does not let an old acknowledgement turn an empty startup draft into an overwrite', async () => {
  useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true, revisions: {} });
  useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: {}, materialInventory: {} });
  const ack = JSON.stringify({ userId: 'user-1', profileId: 'profile-1', revisions: { growthPlans: 8 }, edits: { growthPlans: 'previous-session-edit' } });
  localStorage.setItem(SYNC_REVISIONS_KEY, ack);
  storage(SYNC_REVISIONS_KEY, null, ack);
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ data: { syncProfileData: [{ key: 'growthPlans', status: 'CONFLICT', revision: 8, serverValue: { growthPlans: [], ownedGifts: { gift: 50 }, materialInventory: {} } }] } }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
  vi.stubGlobal('fetch', fetch);
  await act(async () => {
    await useSyncStore.getState().flush();
  });
  const init = fetch.mock.calls[0]?.[1] as RequestInit | undefined;
  if (typeof init?.body !== 'string') throw new Error('Missing GraphQL request body');
  const request = JSON.parse(init.body) as { variables: { changes: Array<{ baseRevision: number }> } };
  expect(request.variables.changes[0].baseRevision).toBe(0);
  expect(useSyncStore.getState().conflicts.growthPlans?.serverRevision).toBe(8);
});

it('does not replace a queued edit with an empty cache lacking an edit identity', () => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true });
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  act(() => {
    useGlobalStore.setState({ ownedGifts: { gift: 50 } });
  });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  const raw = JSON.stringify({ state: { growthPlans: [], ownedGifts: {}, materialInventory: {} }, version: 0, syncContext: { userId: 'user-1', profileId: 'profile-1', external: false, edits: {} } });
  localStorage.setItem(key, raw);
  storage(key, null, raw);
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 50 });
});

it('loads server data on startup without treating a previous sessions acknowledgement as a local value', async () => {
  useAuthStore.getState().setUser({ id: 'user-1', username: 'Alice' });
  const ack = JSON.stringify({ userId: 'user-1', profileId: 'profile-1', revisions: { growthPlans: 9, 'eventPlans:10850': 9 }, edits: { growthPlans: 'old-growth', 'eventPlans:10850': 'old-event' } });
  localStorage.setItem(SYNC_REVISIONS_KEY, ack);
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          profileAllData: [
            { key: 'growthPlans', value: { growthPlans: [], ownedGifts: { gift: 50 }, materialInventory: {} }, revision: 8, schemaVersion: 1 },
            { key: 'eventPlans:10850', value: { purchaseCounts: { 1: 20 } }, revision: 8, schemaVersion: 1 },
          ],
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    ),
  );
  vi.stubGlobal('fetch', fetch);
  await act(async () => {
    await useSyncStore.getState().initializeProfile('user-1', 'profile-1');
  });
  await useSyncStore.getState().flush();
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 50 });
  expect(useEventPlanStore.getState().plans[10850]?.purchaseCounts).toEqual({ 1: 20 });
  expect(useSyncStore.getState().pendingKeys.size).toBe(0);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('keeps the latest rapid input when another tab republishes an earlier edit', () => {
  useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true });
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  const key = useGlobalStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  act(() => {
    useGlobalStore.setState({ ownedGifts: { gift: 1 } });
  });
  const earlier = localStorage.getItem(key);
  if (!earlier) throw new Error('Missing first edit');
  for (let gift = 2; gift <= 20; gift++) {
    act(() => {
      useGlobalStore.setState({ ownedGifts: { gift } });
    });
  }
  const latest = localStorage.getItem(key);
  localStorage.setItem(key, earlier);
  storage(key, latest, earlier);
  expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 20 });
  expect(JSON.parse(localStorage.getItem(key) ?? '{}')).toMatchObject({ state: { ownedGifts: { gift: 20 } } });
});

it('rejects an older event edit after the latest input has finished saving', async () => {
  useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true });
  act(() => {
    root.render(createElement(TrackedHarness));
  });
  const key = useEventPlanStore.persist.getOptions().name;
  if (!key) throw new Error('Missing planner storage key');
  act(() => {
    useEventPlanStore.getState().setPurchaseCounts(1, { 10: 1 });
  });
  const earlier = localStorage.getItem(key);
  if (!earlier) throw new Error('Missing first edit');
  for (let count = 2; count <= 20; count++) {
    act(() => {
      useEventPlanStore.getState().setPurchaseCounts(1, { 10: count });
    });
  }
  const latest = localStorage.getItem(key);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            syncProfileData: [{ key: 'eventPlans:1', status: 'APPLIED', revision: 1, updatedAt: 1_700_000_000 }],
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    ),
  );
  await act(async () => {
    await useSyncStore.getState().flush();
  });
  expect(useSyncStore.getState().pendingKeys.size).toBe(0);
  localStorage.setItem(key, earlier);
  storage(key, latest, earlier);
  expect(useEventPlanStore.getState().plans[1].purchaseCounts).toEqual({ 10: 20 });
  expect(useSyncStore.getState().pendingKeys.size).toBe(0);
});
