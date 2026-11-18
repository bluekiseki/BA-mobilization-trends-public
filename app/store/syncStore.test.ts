import { afterEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

type GraphqlRequest = {
  query: string;
  variables?: Record<string, unknown>;
};

function parseGraphqlRequest(init?: RequestInit): GraphqlRequest {
  if (typeof init?.body !== 'string') throw new Error('Expected string GraphQL body');
  return JSON.parse(init.body) as GraphqlRequest;
}

function graphqlResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function syncAppliedResponse(key: string, revision: number): Response {
  return graphqlResponse({
    syncProfileData: [{ key, status: 'APPLIED', revision, updatedAt: 1_700_000_000 }],
  });
}

async function loadSyncModules() {
  vi.resetModules();
  vi.stubGlobal('localStorage', new MemoryStorage());

  const [{ useSyncStore }, { useGlobalStore, getGrowthPlansSyncValue }, { useRaidHistoryStore }] = await Promise.all([
    import('./syncStore'),
    import('./planner/useGlobalStore'),
    import('./planner/useRaidHistoryStore'),
  ]);

  return { useSyncStore, useGlobalStore, getGrowthPlansSyncValue, useRaidHistoryStore };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('syncStore revision sync', () => {
  it('seeds the edit clock from shared storage before the first edit after initialization resets it', async () => {
    const { useSyncStore, useGlobalStore } = await loadSyncModules();
    const { clearEditOrder, currentEditIds } = await import('./crossTabEditOrder');
    const key = useGlobalStore.persist.getOptions().name;
    if (!key) throw new Error('Missing storage key');
    localStorage.setItem(
      key,
      JSON.stringify({
        state: {},
        version: 0,
        syncContext: {
          userId: 'user-1',
          profileId: 'profile-1',
          external: true,
          edits: { growthPlans: '99:other-tab' },
        },
      }),
    );
    clearEditOrder();
    useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isPulling: true });
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { gift: 1 }, materialInventory: {} });
    expect(Number(currentEditIds().growthPlans.split(':')[0])).toBeGreaterThan(99);
    useSyncStore.getState().clearAccountData();
  });

  it.each([1, 2])('reconciles an unacknowledged mirrored edit on pull (server revision %s)', async (serverRevision) => {
    vi.useFakeTimers();
    const { useSyncStore } = await loadSyncModules();
    const { adoptCrossTabChanges } = await import('./syncStore');
    const value = { growthPlans: [], ownedGifts: { gift: 20 }, materialInventory: {} };
    useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true, status: 'synced', revisions: { growthPlans: 1 } });
    adoptCrossTabChanges(new Map([['growthPlans', null]]), new Map([['growthPlans', value]]), { growthPlans: '1:closed-tab' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          graphqlResponse({ profileAllData: [{ key: 'growthPlans', value: { ...value, ownedGifts: { gift: 5 } }, revision: serverRevision, schemaVersion: 1, updatedAt: 1_700_000_000 }] }),
        ),
      ),
    );
    await useSyncStore.getState().pullAll();
    expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(true);
    if (serverRevision === 2) {
      expect(useSyncStore.getState().status).toBe('conflict');
      expect(useSyncStore.getState().conflicts.growthPlans.localValue).toEqual(value);
    } else {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(syncAppliedResponse('growthPlans', 2))),
      );
      await vi.advanceTimersByTimeAsync(10_000);
      expect(useSyncStore.getState().pendingKeys.size).toBe(0);
      expect(useSyncStore.getState().status).toBe('synced');
    }
    useSyncStore.getState().clearAccountData();
  });

  it('does not report a conflict when another tab acknowledges the in-flight edit first', async () => {
    vi.useFakeTimers();
    const { useSyncStore } = await loadSyncModules();
    const { receiveSyncRevisions } = await import('./syncStore');
    const { currentEditIds } = await import('./crossTabEditOrder');
    const value = { growthPlans: [], ownedGifts: { gift: 1 }, materialInventory: {} };
    let resolveWrite: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (parseGraphqlRequest(init).query.includes('profileAllData')) {
          return Promise.resolve(
            graphqlResponse({ profileAllData: [{ key: 'growthPlans', value: { growthPlans: [], ownedGifts: {}, materialInventory: {} }, schemaVersion: 1, revision: 1, updatedAt: 1_700_000_000 }] }),
          );
        }
        return new Promise((resolve) => {
          resolveWrite = resolve;
        });
      }),
    );
    useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'prof_1' });
    await useSyncStore.getState().pullAll();
    useSyncStore.getState().push('growthPlans', value);
    await vi.advanceTimersByTimeAsync(10_000);
    receiveSyncRevisions(JSON.stringify({ userId: 'user-1', profileId: 'prof_1', revisions: { growthPlans: 2 }, edits: { growthPlans: currentEditIds().growthPlans }, lastModifiedAt: null }));
    resolveWrite?.(graphqlResponse({ syncProfileData: [{ key: 'growthPlans', status: 'CONFLICT', revision: 2, serverValue: value, schemaVersion: 1, updatedAt: 1_700_000_000 }] }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(useSyncStore.getState().conflicts).toEqual({});
    expect(useSyncStore.getState().status).toBe('synced');
    useSyncStore.getState().clearAccountData();
  });

  it('updates the saved time only when another tab acknowledges the mirrored edit', async () => {
    const { useSyncStore } = await loadSyncModules();
    const { adoptCrossTabChanges, receiveSyncRevisions } = await import('./syncStore');
    const oldTime = Date.now() - 180_000;
    const savedTime = Date.now();
    useSyncStore.setState({ currentUserId: 'user-1', currentProfileId: 'profile-1', isInitialized: true, status: 'synced', lastModifiedAt: oldTime });
    adoptCrossTabChanges(new Map([['growthPlans', null]]), new Map([['growthPlans', { growthPlans: [], ownedGifts: { gift: 20 }, materialInventory: {} }]]), { growthPlans: '1:remote' });
    expect(useSyncStore.getState().status).toBe('syncing');
    const acknowledge = (editId: string) =>
      receiveSyncRevisions(JSON.stringify({ userId: 'user-1', profileId: 'profile-1', revisions: { growthPlans: 2 }, edits: { growthPlans: editId }, lastModifiedAt: savedTime }));
    acknowledge('unrelated');
    expect(useSyncStore.getState().lastModifiedAt).toBe(oldTime);
    acknowledge('1:remote');
    expect(useSyncStore.getState().lastModifiedAt).toBe(savedTime);
    expect(useSyncStore.getState().status).toBe('synced');
    useSyncStore.getState().clearAccountData();
  });

  it('does not publish empty planner data to other tabs while initialization awaits the server', async () => {
    const { useSyncStore, useGlobalStore } = await loadSyncModules();
    const value = { growthPlans: [], ownedGifts: { gift: 5 }, materialInventory: {} };
    useGlobalStore.setState(value);
    const storageKey = useGlobalStore.persist.getOptions().name;
    if (!storageKey) throw new Error('Missing planner storage key');
    const before = localStorage.getItem(storageKey);
    let finishPull: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finishPull = resolve;
          }),
      ),
    );
    const initialization = useSyncStore.getState().initializeProfile('user-1', 'profile-1');
    expect(useGlobalStore.getState().ownedGifts).toEqual({});
    expect(localStorage.getItem(storageKey)).toBe(before);
    await vi.waitFor(() => {
      expect(finishPull).toBeDefined();
    });
    expect(localStorage.getItem(storageKey)).toBe(before);
    finishPull?.(graphqlResponse({ profileAllData: [{ key: 'growthPlans', value, schemaVersion: 1, revision: 1 }] }));
    await initialization;
    expect(useGlobalStore.getState().ownedGifts).toEqual({ gift: 5 });
  });

  it('discards legacy cache-only pending data on reload and preserves the server plan', async () => {
    const { useSyncStore } = await loadSyncModules();
    const outbox = await import('./syncOutbox.client');
    const { useEventPlanStore } = await import('./planner/useEventPlanStore');
    await outbox.putSyncOutboxEntry({
      userId: 'user-1',
      profileId: 'profile-1',
      key: 'eventPlans:1',
      baseRevision: 0,
      desiredValue: { cachedTotalItems: { savedAt: 10, gained: {}, spent: {}, availableAp: 100 } },
      schemaVersion: 1,
      generation: 1,
      updatedAt: 10,
    });
    const value = { selectedStudents: ['10'], ownedCurrency: { 100: 42 } };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(graphqlResponse({ profileAllData: [{ key: 'eventPlans:1', value, schemaVersion: 1, revision: 3, updatedAt: 20 }] }))),
    );
    await useSyncStore.getState().initializeProfile('user-1', 'profile-1');
    expect(useSyncStore.getState().conflicts).toEqual({});
    expect(useSyncStore.getState().pendingKeys.size).toBe(0);
    expect(useEventPlanStore.getState().plans['1']).toEqual(value);
    await vi.waitFor(async () => {
      expect(await outbox.getSyncOutboxEntries('user-1', 'profile-1')).toEqual([]);
    });
  });

  it('does not report a conflict for matching event edits with different caches or property order', async () => {
    const { useSyncStore } = await loadSyncModules();
    const outbox = await import('./syncOutbox.client');
    await outbox.putSyncOutboxEntry({
      userId: 'user-1',
      profileId: 'profile-1',
      key: 'eventPlans:1',
      baseRevision: 1,
      desiredValue: { selectedStudents: ['10'], ownedCurrency: { 100: 42 } },
      schemaVersion: 1,
      generation: 1,
      updatedAt: 10,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          graphqlResponse({
            profileAllData: [{ key: 'eventPlans:1', value: { ownedCurrency: { 100: 42 }, selectedStudents: ['10'], cachedTotalItems: { savedAt: 20 } }, schemaVersion: 1, revision: 2, updatedAt: 20 }],
          }),
        ),
      ),
    );
    await useSyncStore.getState().initializeProfile('user-1', 'profile-1');
    expect(useSyncStore.getState().conflicts).toEqual({});
    expect(useSyncStore.getState().pendingKeys.size).toBe(0);
    expect(useSyncStore.getState().revisions['eventPlans:1']).toBe(2);
  });

  it('keeps genuine event edits pending when they differ from the server after reload', async () => {
    const { useSyncStore } = await loadSyncModules();
    const outbox = await import('./syncOutbox.client');
    await outbox.putSyncOutboxEntry({
      userId: 'user-1',
      profileId: 'profile-1',
      key: 'eventPlans:1',
      baseRevision: 1,
      desiredValue: { selectedStudents: ['20'] },
      schemaVersion: 1,
      generation: 1,
      updatedAt: 10,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(graphqlResponse({ profileAllData: [{ key: 'eventPlans:1', value: { selectedStudents: ['10'] }, schemaVersion: 1, revision: 2, updatedAt: 20 }] }))),
    );
    await useSyncStore.getState().initializeProfile('user-1', 'profile-1');
    expect(useSyncStore.getState().conflicts['eventPlans:1'].localValue).toEqual({ selectedStudents: ['20'] });
    useSyncStore.getState().clearAccountData();
  });

  it('does not delete a newer outbox edit while cleaning an old cache-only entry', async () => {
    await loadSyncModules();
    const outbox = await import('./syncOutbox.client');
    const old = { userId: 'user-1', profileId: 'profile-1', key: 'eventPlans:1', baseRevision: 1, desiredValue: { cachedTotalItems: {} }, schemaVersion: 1, generation: 1, updatedAt: 10 };
    const newer = { ...old, desiredValue: { selectedStudents: ['20'] }, generation: 2, updatedAt: 20 };
    await outbox.putSyncOutboxEntry(newer);
    await outbox.deleteSyncOutboxEntry('user-1', 'profile-1', 'eventPlans:1', old);
    expect(await outbox.getSyncOutboxEntries('user-1', 'profile-1')).toEqual([newer]);
  });

  it('clears history immediately on profile initialization even when planner values do not change', async () => {
    const { useSyncStore } = await loadSyncModules();
    const { editHistory, snapshot } = await import('./history/history');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(graphqlResponse({ profileAllData: [] }))),
    );
    editHistory.seed('plan', snapshot(1));
    editHistory.observe('plan', snapshot(null));
    editHistory.commit();
    const initialization = useSyncStore.getState().initializeProfile('user-1', 'profile-2');
    expect(editHistory.entries).toHaveLength(0);
    expect(editHistory.cursor).toBe(0);
    await initialization;
  });

  it('stores server revisions from pullAll and sends baseRevision on push', async () => {
    vi.useFakeTimers();
    const { useSyncStore } = await loadSyncModules();
    const requests: GraphqlRequest[] = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = parseGraphqlRequest(init);
      requests.push(request);
      if (request.query.includes('profileAllData')) {
        return Promise.resolve(
          graphqlResponse({
            profileAllData: [
              {
                key: 'growthPlans',
                value: { growthPlans: [], ownedGifts: {}, materialInventory: {} },
                schemaVersion: 1,
                revision: 7,
              },
            ],
          }),
        );
      }
      return Promise.resolve(syncAppliedResponse('growthPlans', 8));
    });
    vi.stubGlobal('fetch', fetchMock);

    useSyncStore.setState({ currentProfileId: 'prof_1' });
    await useSyncStore.getState().pullAll();
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { gift: 1 }, materialInventory: {} });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(requests).toHaveLength(2);
    expect(requests[1]?.variables).toMatchObject({
      profileId: 'prof_1',
      changes: [expect.objectContaining({ key: 'growthPlans', baseRevision: 7 })],
    });
    expect(useSyncStore.getState().revisions.growthPlans).toBe(8);
  });

  it('preserves the local value and reports a conflict when baseRevision conflicts', async () => {
    vi.useFakeTimers();
    const { useSyncStore, useGlobalStore } = await loadSyncModules();
    let pullCount = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = parseGraphqlRequest(init);
      if (request.query.includes('profileAllData')) {
        pullCount += 1;
        return Promise.resolve(
          graphqlResponse({
            profileAllData: [
              {
                key: 'growthPlans',
                value: {
                  growthPlans: [],
                  ownedGifts: { serverGift: pullCount },
                  materialInventory: {},
                },
                schemaVersion: 1,
                revision: pullCount === 1 ? 2 : 3,
              },
            ],
          }),
        );
      }
      return Promise.resolve(
        graphqlResponse({
          syncProfileData: [
            {
              key: 'growthPlans',
              status: 'CONFLICT',
              revision: 3,
              serverValue: { growthPlans: [], ownedGifts: { serverGift: 2 }, materialInventory: {} },
              schemaVersion: 1,
            },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    useSyncStore.setState({ currentProfileId: 'prof_1' });
    await useSyncStore.getState().pullAll();
    useGlobalStore.setState({ ownedGifts: { localGift: 1 } });
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { localGift: 1 }, materialInventory: {} });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(useSyncStore.getState().status).toBe('conflict');
    expect(useSyncStore.getState().error).toBeNull();
    expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(true);
    expect(useSyncStore.getState().revisions.growthPlans).toBe(2);
    expect(useSyncStore.getState().conflicts.growthPlans.serverRevision).toBe(3);
    expect(useGlobalStore.getState().ownedGifts).toEqual({ localGift: 1 });
    expect(pullCount).toBe(1);
  });

  it('keeps pending keys when a push fails with a transient network error', async () => {
    vi.useFakeTimers();
    const { useSyncStore } = await loadSyncModules();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = parseGraphqlRequest(init);
      if (request.query.includes('profileAllData')) {
        return Promise.resolve(
          graphqlResponse({
            profileAllData: [
              {
                key: 'growthPlans',
                value: { growthPlans: [], ownedGifts: {}, materialInventory: {} },
                schemaVersion: 1,
                revision: 4,
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error('Network timeout'));
    });
    vi.stubGlobal('fetch', fetchMock);

    useSyncStore.setState({ currentProfileId: 'prof_1' });
    await useSyncStore.getState().pullAll();
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { localGift: 1 }, materialInventory: {} });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(useSyncStore.getState().status).toBe('error');
    expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(true);
    expect(useSyncStore.getState().revisions.growthPlans).toBe(4);
  });

  it('clears local planner data when pulling an empty server profile', async () => {
    const { useSyncStore, useGlobalStore, useRaidHistoryStore } = await loadSyncModules();
    const fetchMock = vi.fn((): Promise<Response> => Promise.resolve(graphqlResponse({ profileAllData: [] })));
    vi.stubGlobal('fetch', fetchMock);

    useGlobalStore.setState({ ownedGifts: { staleGift: 4 }, materialInventory: { staleItem: 8 } });
    useRaidHistoryStore.setState({ entries: [{ id: 'stale', raidId: 'raid-binah-1', server: 'jp', raidType: 'raid', date: '2026-01-01', difficulty: 'INSANE', score: 1 }] });
    useSyncStore.setState({ currentProfileId: 'empty_profile' });

    await useSyncStore.getState().pullAll();

    expect(useGlobalStore.getState().ownedGifts).toEqual({});
    expect(useGlobalStore.getState().materialInventory).toEqual({});
    expect(useRaidHistoryStore.getState().entries).toEqual([]);
    expect(useSyncStore.getState().isInitialized).toBe(true);
  });

  it('skips invalid raidHistory rows without blocking future sync', async () => {
    const { useSyncStore, useGlobalStore, useRaidHistoryStore } = await loadSyncModules();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn((): Promise<Response> =>
      Promise.resolve(
        graphqlResponse({
          profileAllData: [
            {
              key: 'growthPlans',
              value: { growthPlans: [], ownedGifts: { serverGift: 3 }, materialInventory: {} },
              schemaVersion: 1,
              revision: 1,
            },
            {
              key: 'raidHistory',
              value: { entries: [{ invalid: true }] },
              schemaVersion: 1,
              revision: 5,
            },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    useRaidHistoryStore.setState({ entries: [{ id: 'local', raidId: 'raid-binah-1', server: 'jp', raidType: 'raid', date: '2026-01-01' }] });
    useSyncStore.setState({ currentProfileId: 'prof_1' });

    await useSyncStore.getState().pullAll();

    expect(useSyncStore.getState().status).toBe('synced');
    expect(useSyncStore.getState().isInitialized).toBe(true);
    expect(useSyncStore.getState().revisions.raidHistory).toBe(5);
    expect(useGlobalStore.getState().ownedGifts).toEqual({ serverGift: 3 });
    expect(useRaidHistoryStore.getState().entries).toEqual([]);
    consoleErrorSpy.mockRestore();
  });

  it('serializes a newer change behind an in-flight write and rebases its revision', async () => {
    vi.useFakeTimers();
    const { useSyncStore, useGlobalStore } = await loadSyncModules();
    const requests: GraphqlRequest[] = [];
    let resolveFirstWrite: ((response: Response) => void) | undefined;
    let writeCount = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = parseGraphqlRequest(init);
      requests.push(request);
      if (request.query.includes('profileAllData')) {
        return Promise.resolve(
          graphqlResponse({
            profileAllData: [{ key: 'growthPlans', value: { growthPlans: [], ownedGifts: {}, materialInventory: {} }, schemaVersion: 1, revision: 7 }],
          }),
        );
      }
      writeCount += 1;
      if (writeCount === 1) {
        return new Promise((resolve) => {
          resolveFirstWrite = resolve;
        });
      }
      return Promise.resolve(syncAppliedResponse('growthPlans', 9));
    });
    vi.stubGlobal('fetch', fetchMock);

    useSyncStore.setState({ currentProfileId: 'prof_1' });
    await useSyncStore.getState().pullAll();
    useGlobalStore.setState({ ownedGifts: { gift: 1 } });
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { gift: 1 }, materialInventory: {} });
    await vi.advanceTimersByTimeAsync(10_000);

    useGlobalStore.setState({ ownedGifts: { gift: 2 } });
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { gift: 2 }, materialInventory: {} });
    resolveFirstWrite?.(syncAppliedResponse('growthPlans', 8));
    await useSyncStore.getState().flush();
    await vi.advanceTimersByTimeAsync(30_000);

    const firstChanges = requests[1]?.variables?.changes as Array<{ baseRevision: number }>;
    const secondChanges = requests[2]?.variables?.changes as Array<{ baseRevision: number }>;
    expect(firstChanges[0]?.baseRevision).toBe(7);
    expect(secondChanges[0]?.baseRevision).toBe(8);
    expect(useSyncStore.getState().revisions.growthPlans).toBe(9);
    expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(false);
  });

  it('keeps a conflicted key pending while completing other keys in the same batch', async () => {
    vi.useFakeTimers();
    const { useSyncStore } = await loadSyncModules();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = parseGraphqlRequest(init);
      if (request.query.includes('profileAllData')) {
        return Promise.resolve(
          graphqlResponse({
            profileAllData: [
              { key: 'growthPlans', value: { growthPlans: [], ownedGifts: {}, materialInventory: {} }, schemaVersion: 1, revision: 2 },
              { key: 'equipmentPlan', value: { runCounts: {}, farmingDays: 1 }, schemaVersion: 1, revision: 4 },
            ],
          }),
        );
      }
      return Promise.resolve(
        graphqlResponse({
          syncProfileData: [
            { key: 'growthPlans', status: 'CONFLICT', revision: 3, serverValue: { growthPlans: [], ownedGifts: { remote: 1 }, materialInventory: {} }, schemaVersion: 1 },
            { key: 'equipmentPlan', status: 'APPLIED', revision: 5, updatedAt: 1_700_000_000 },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    useSyncStore.setState({ currentProfileId: 'prof_1' });
    await useSyncStore.getState().pullAll();
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { local: 1 }, materialInventory: {} });
    useSyncStore.getState().push('equipmentPlan', { runCounts: { 1: 3 }, farmingDays: 1 });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(useSyncStore.getState().status).toBe('conflict');
    expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(true);
    expect(useSyncStore.getState().pendingKeys.has('equipmentPlan')).toBe(false);
    expect(useSyncStore.getState().revisions.equipmentPlan).toBe(5);
    expect(useSyncStore.getState().conflicts.growthPlans.serverRevision).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not drop an edit made while a stale-refresh pull is in flight', async () => {
    const { useSyncStore, useGlobalStore } = await loadSyncModules();
    const { editHistory, snapshot } = await import('./history/history');
    let resolveSecondPull: ((response: Response) => void) | undefined;
    let pullCount = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = parseGraphqlRequest(init);
      if (request.query.includes('profileAllData')) {
        pullCount += 1;
        if (pullCount === 1) return Promise.resolve(graphqlResponse({ profileAllData: [] }));
        return new Promise((resolve) => {
          resolveSecondPull = resolve;
        });
      }
      return Promise.resolve(syncAppliedResponse('growthPlans', 1));
    });
    vi.stubGlobal('fetch', fetchMock);

    await useSyncStore.getState().initializeProfile('user_1', 'prof_1');
    expect(useSyncStore.getState().isInitialized).toBe(true);

    const secondPull = useSyncStore.getState().pullAll();
    editHistory.clear();
    editHistory.seed('growthPlans', snapshot(useGlobalStore.getState().ownedGifts));
    const stop = useGlobalStore.subscribe((state) => editHistory.observe('growthPlans', snapshot(state.ownedGifts)));
    try {
      // Simulates a user edit landing while useSyncWatcher's stale-tab refresh pull is still in flight.
      useGlobalStore.setState({ ownedGifts: { local: 1 } });
      useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { local: 1 }, materialInventory: {} });
      editHistory.commit();
      expect(editHistory.entries).toHaveLength(1);
      expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(true);

      resolveSecondPull?.(graphqlResponse({ profileAllData: [] }));
      await secondPull;

      expect(useGlobalStore.getState().ownedGifts).toEqual({ local: 1 });
      expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(true);
      expect(editHistory.entries).toHaveLength(1);
      expect(editHistory.entries[0].changes[0]).toMatchObject({ before: snapshot({}), after: snapshot({ local: 1 }) });
    } finally {
      stop();
    }
  });

  it('preserves a resolved value while applying unrelated rows without another request', async () => {
    const { useSyncStore, useGlobalStore } = await loadSyncModules();
    let resolveSecondPull: ((response: Response) => void) | undefined;
    let pullCount = 0;
    const fetchMock = vi.fn((): Promise<Response> => {
      pullCount += 1;
      if (pullCount === 1) return Promise.resolve(graphqlResponse({ profileAllData: [] }));
      if (pullCount === 2) {
        return new Promise((resolve) => {
          resolveSecondPull = resolve;
        });
      }
      // A later normal pull can still apply a newer server version.
      return Promise.resolve(
        graphqlResponse({
          profileAllData: [{ key: 'growthPlans', value: { growthPlans: [], ownedGifts: { later: 1 }, materialInventory: {} }, schemaVersion: 1, revision: 6 }],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await useSyncStore.getState().initializeProfile('user_1', 'prof_1');

    const secondPull = useSyncStore.getState().pullAll();

    // An edit lands mid-pull and is then resolved in favor of the server (e.g. the user clicks "keep
    // server" on a conflict) before the pull's own response — which still carries the pre-resolution
    // value — comes back.
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { local: 1 }, materialInventory: {} });
    useSyncStore.setState({
      conflicts: {
        growthPlans: {
          key: 'growthPlans',
          localValue: { growthPlans: [], ownedGifts: { local: 1 }, materialInventory: {} },
          serverValue: { growthPlans: [], ownedGifts: { serverWins: 1 }, materialInventory: {} },
          serverRevision: 5,
          schemaVersion: 1,
          localUpdatedAt: Date.now(),
          serverUpdatedAt: null,
        },
      },
    });
    useSyncStore.getState().resolveConflict('growthPlans', 'server');

    resolveSecondPull?.(
      graphqlResponse({
        profileAllData: [
          { key: 'growthPlans', value: { growthPlans: [], ownedGifts: { local: 1 }, materialInventory: {} }, schemaVersion: 1, revision: 1 },
          { key: 'equipmentPlan', value: { farmingDays: 7 }, schemaVersion: 1, revision: 2 },
        ],
      }),
    );
    await secondPull;

    expect(pullCount).toBe(2);
    expect(useSyncStore.getState().isPulling).toBe(false);
    expect(useGlobalStore.getState().ownedGifts).toEqual({ serverWins: 1 });
    expect(useSyncStore.getState().revisions.growthPlans).toBe(5);
    const { useEquipmentPlanStore } = await import('./planner/useEquipmentPlanStore');
    expect(useEquipmentPlanStore.getState().farmingDays).toBe(7);

    await useSyncStore.getState().pullAll();
    expect(pullCount).toBe(3);
    expect(useGlobalStore.getState().ownedGifts).toEqual({ later: 1 });
    expect(useSyncStore.getState().revisions.growthPlans).toBe(6);
  });

  it("discards a superseded pull response instead of evaluating it against a newer pull's stale-check bookkeeping", async () => {
    const { useSyncStore, useGlobalStore } = await loadSyncModules();
    let resolveFirstPull: ((response: Response) => void) | undefined;
    let resolveSecondPull: ((response: Response) => void) | undefined;
    let pullCount = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = parseGraphqlRequest(init);
      if (request.query.includes('profileAllData')) {
        pullCount += 1;
        if (pullCount === 1)
          return new Promise((resolve) => {
            resolveFirstPull = resolve;
          });
        return new Promise((resolve) => {
          resolveSecondPull = resolve;
        });
      }
      return Promise.resolve(syncAppliedResponse('growthPlans', 1));
    });
    vi.stubGlobal('fetch', fetchMock);
    useSyncStore.setState({ currentProfileId: 'prof_1' });

    const firstPull = useSyncStore.getState().pullAll();
    await vi.waitFor(() => {
      expect(resolveFirstPull).toBeDefined();
    });
    // A second pull starts (e.g. a stale-tab refresh) while the first is still in flight, clearing
    // and reusing the module-level keysWrittenSincePullStart bookkeeping for itself.
    const secondPull = useSyncStore.getState().pullAll();
    await vi.waitFor(() => {
      expect(resolveSecondPull).toBeDefined();
    });

    // An edit lands while both are in flight — tracked only under the second pull's bookkeeping.
    useGlobalStore.setState({ ownedGifts: { local: 1 } });
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { local: 1 }, materialInventory: {} });

    // The first pull's response (reflecting server state from before the edit) lands first. It must
    // be dropped outright by the pullSequence guard — never reaching the keysWrittenSincePullStart
    // check at all, so it can't be misjudged against the second pull's bookkeeping.
    resolveFirstPull?.(graphqlResponse({ profileAllData: [{ key: 'growthPlans', value: { growthPlans: [], ownedGifts: { stale: 1 }, materialInventory: {} }, schemaVersion: 1, revision: 1 }] }));
    expect(await firstPull).toBe(false);
    expect(useGlobalStore.getState().ownedGifts).toEqual({ local: 1 });

    resolveSecondPull?.(graphqlResponse({ profileAllData: [] }));
    await secondPull;
    expect(useGlobalStore.getState().ownedGifts).toEqual({ local: 1 });
  });

  it("attributes an edit made while initializeProfile's outbox read is pending to the new profile", async () => {
    const { useSyncStore } = await loadSyncModules();
    const outboxModule = await import('./syncOutbox.client');
    let resolveOutboxRead: ((entries: never[]) => void) | undefined;
    const spy = vi.spyOn(outboxModule, 'getSyncOutboxEntries').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOutboxRead = resolve;
        }),
    );
    const fetchMock = vi.fn((): Promise<Response> => Promise.resolve(graphqlResponse({ profileAllData: [] })));
    vi.stubGlobal('fetch', fetchMock);

    const initPromise = useSyncStore.getState().initializeProfile('user_1', 'new_profile');
    // The profile context must switch synchronously, before the outbox read even resolves.
    expect(useSyncStore.getState().currentProfileId).toBe('new_profile');

    // Let initializeProfile's internal awaits progress until it actually calls the mocked
    // getSyncOutboxEntries and captures its resolver — resolving too early would resolve nothing.
    await vi.waitFor(() => {
      if (!resolveOutboxRead) throw new Error('getSyncOutboxEntries not called yet');
    });

    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { local: 1 }, materialInventory: {} });
    expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(true);

    resolveOutboxRead?.([]);
    await initPromise;

    expect(useSyncStore.getState().currentProfileId).toBe('new_profile');
    expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(true);
    spy.mockRestore();
  });

  it('recovers from an outbox read failure without getting stuck loading, but leaves sync paused for this profile', async () => {
    const { useSyncStore } = await loadSyncModules();
    const outboxModule = await import('./syncOutbox.client');
    const spy = vi.spyOn(outboxModule, 'getSyncOutboxEntries').mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    const fetchMock = vi.fn((): Promise<Response> => Promise.resolve(graphqlResponse({ profileAllData: [] })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await useSyncStore.getState().initializeProfile('user_1', 'prof_1');

    expect(result).toBe(false);
    expect(useSyncStore.getState().isPulling).toBe(false);
    expect(useSyncStore.getState().status).toBe('error');
    // isInitialized stays false — this is a "don't get stuck loading" fix, not full automatic recovery.
    expect(useSyncStore.getState().isInitialized).toBe(false);

    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: {}, materialInventory: {} });
    await useSyncStore.getState().flush();
    expect(fetchMock).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it('does not re-queue server-applied data via the watcher during a pull', async () => {
    const { useSyncStore, useGlobalStore, getGrowthPlansSyncValue } = await loadSyncModules();
    const fetchMock = vi.fn((): Promise<Response> =>
      Promise.resolve(
        graphqlResponse({
          profileAllData: [{ key: 'growthPlans', value: { growthPlans: [], ownedGifts: { server: 1 }, materialInventory: {} }, schemaVersion: 1, revision: 3 }],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const unsubscribe = useGlobalStore.subscribe(() => {
      useSyncStore.getState().push('growthPlans', getGrowthPlansSyncValue());
    });
    try {
      await useSyncStore.getState().initializeProfile('user_1', 'prof_1');
    } finally {
      unsubscribe();
    }

    expect(useGlobalStore.getState().ownedGifts).toEqual({ server: 1 });
    expect(useSyncStore.getState().pendingKeys.size).toBe(0);
    expect(useSyncStore.getState().status).toBe('synced');
  });

  it('does not re-queue the server value after resolving a conflict with "server"', async () => {
    const { useSyncStore, useGlobalStore, getGrowthPlansSyncValue } = await loadSyncModules();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = parseGraphqlRequest(init);
      if (request.query.includes('profileAllData')) {
        return Promise.resolve(graphqlResponse({ profileAllData: [{ key: 'growthPlans', value: { growthPlans: [], ownedGifts: {}, materialInventory: {} }, schemaVersion: 1, revision: 1 }] }));
      }
      return Promise.resolve(
        graphqlResponse({
          syncProfileData: [{ key: 'growthPlans', status: 'CONFLICT', revision: 2, serverValue: { growthPlans: [], ownedGifts: { serverWins: 1 }, materialInventory: {} }, schemaVersion: 1 }],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const unsubscribe = useGlobalStore.subscribe(() => {
      useSyncStore.getState().push('growthPlans', getGrowthPlansSyncValue());
    });
    try {
      await useSyncStore.getState().initializeProfile('user_1', 'prof_1');
      useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { local: 1 }, materialInventory: {} });
      await useSyncStore.getState().flush();
      expect(useSyncStore.getState().status).toBe('conflict');

      useSyncStore.getState().resolveConflict('growthPlans', 'server');

      expect(useGlobalStore.getState().ownedGifts).toEqual({ serverWins: 1 });
      expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(false);
    } finally {
      unsubscribe();
    }
  });

  it('does not leak an empty value into the outgoing profile outbox on logout', async () => {
    const { useSyncStore, useGlobalStore, getGrowthPlansSyncValue } = await loadSyncModules();
    const fetchMock = vi.fn((): Promise<Response> => Promise.resolve(graphqlResponse({ profileAllData: [] })));
    vi.stubGlobal('fetch', fetchMock);

    const unsubscribe = useGlobalStore.subscribe(() => {
      useSyncStore.getState().push('growthPlans', getGrowthPlansSyncValue());
    });
    try {
      await useSyncStore.getState().initializeProfile('user_1', 'prof_1');
      useGlobalStore.setState({ ownedGifts: { local: 1 } });
      expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(true);

      useSyncStore.getState().clearAccountData();

      // Re-initializing the same profile replays whatever the outbox actually holds — if logout
      // had let the watcher push the just-cleared empty value, this would come back empty.
      await useSyncStore.getState().initializeProfile('user_1', 'prof_1');
      expect(useGlobalStore.getState().ownedGifts).toEqual({ local: 1 });
    } finally {
      unsubscribe();
    }
  });

  it('still empties a key that is absent from both the server and pending changes on a same-profile re-pull', async () => {
    const { useSyncStore, useRaidHistoryStore } = await loadSyncModules();
    const fetchMock = vi.fn((): Promise<Response> => Promise.resolve(graphqlResponse({ profileAllData: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await useSyncStore.getState().initializeProfile('user_1', 'prof_1');
    // Data that exists locally but was never registered as a pending sync change — e.g. leftover
    // from another profile's shared localStorage key. Full-clear-on-pull is intentionally kept.
    useRaidHistoryStore.setState({ entries: [{ id: 'stale', raidId: 'raid-binah-1', server: 'jp', raidType: 'raid', date: '2026-01-01' }] });

    await useSyncStore.getState().pullAll();

    expect(useRaidHistoryStore.getState().entries).toEqual([]);
  });

  it('preserves an immediate flush request that landed during a pull', async () => {
    vi.useFakeTimers();
    const { useSyncStore } = await loadSyncModules();
    let resolveSecondPull: ((response: Response) => void) | undefined;
    let pullCount = 0;
    const flushRequests: GraphqlRequest[] = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = parseGraphqlRequest(init);
      if (request.query.includes('profileAllData')) {
        pullCount += 1;
        if (pullCount === 1) return Promise.resolve(graphqlResponse({ profileAllData: [] }));
        return new Promise((resolve) => {
          resolveSecondPull = resolve;
        });
      }
      flushRequests.push(request);
      return Promise.resolve(syncAppliedResponse('raidHistory', 1));
    });
    vi.stubGlobal('fetch', fetchMock);

    await useSyncStore.getState().initializeProfile('user_1', 'prof_1');

    const secondPull = useSyncStore.getState().pullAll();
    // raidHistory/gachaHistory pushes always request immediate flush (see useSyncWatcher.ts).
    useSyncStore.getState().push('raidHistory', { entries: [{ id: 'a' }] }, 1, true);
    resolveSecondPull?.(graphqlResponse({ profileAllData: [] }));
    await secondPull;

    await vi.advanceTimersByTimeAsync(1);
    expect(flushRequests).toHaveLength(1);
  });

  it("does not carry the previous profile's untouched fields into an edit made while the new profile initializes", async () => {
    const { useSyncStore, useGlobalStore, getGrowthPlansSyncValue } = await loadSyncModules();
    const outboxModule = await import('./syncOutbox.client');
    let resolveOutboxRead: ((entries: never[]) => void) | undefined;
    const spy = vi.spyOn(outboxModule, 'getSyncOutboxEntries').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOutboxRead = resolve;
        }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn((): Promise<Response> => Promise.resolve(graphqlResponse({ profileAllData: [] }))),
    );

    // The previous profile's data is still sitting in the live store when the switch begins.
    useSyncStore.setState({ currentUserId: 'user_1', currentProfileId: 'old_profile', isInitialized: true });
    useGlobalStore.setState({ growthPlans: [], ownedGifts: { previousProfileGift: 100 }, materialInventory: {} });

    const unsubscribe = useGlobalStore.subscribe(() => {
      useSyncStore.getState().push('growthPlans', getGrowthPlansSyncValue());
    });
    try {
      const initialization = useSyncStore.getState().initializeProfile('user_1', 'new_profile');
      await vi.waitFor(() => {
        if (!resolveOutboxRead) throw new Error('getSyncOutboxEntries not called yet');
      });

      // Only growthPlans is actually edited — the watcher bundles the whole store, so this is
      // the case that would leak stale ownedGifts if the store weren't cleared up front.
      useGlobalStore.setState({ growthPlans: [{ uuid: 'new-plan' }] as never[] });
      resolveOutboxRead?.([]);
      await initialization;

      expect(useGlobalStore.getState().ownedGifts).toEqual({});
    } finally {
      unsubscribe();
      spy.mockRestore();
    }
  });

  it('does not register an empty value anywhere when initializeProfile fails while the previous profile still has data', async () => {
    const { useSyncStore, useGlobalStore, getGrowthPlansSyncValue } = await loadSyncModules();
    const outboxModule = await import('./syncOutbox.client');
    const spy = vi.spyOn(outboxModule, 'getSyncOutboxEntries').mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    vi.stubGlobal(
      'fetch',
      vi.fn((): Promise<Response> => Promise.resolve(graphqlResponse({ profileAllData: [] }))),
    );

    useSyncStore.setState({ currentUserId: 'user_1', currentProfileId: 'old_profile', isInitialized: true });
    useGlobalStore.setState({ growthPlans: [], ownedGifts: { previousProfileGift: 100 }, materialInventory: {} });

    const unsubscribe = useGlobalStore.subscribe(() => {
      useSyncStore.getState().push('growthPlans', getGrowthPlansSyncValue());
    });
    try {
      const result = await useSyncStore.getState().initializeProfile('user_1', 'new_profile');

      expect(result).toBe(false);
      expect(useSyncStore.getState().status).toBe('error');
      // The store is now empty (accepted trade-off) — but that emptiness must not
      // itself have been registered as a pending change / outbox entry for either profile.
      expect(useGlobalStore.getState().ownedGifts).toEqual({});
      expect(useSyncStore.getState().pendingKeys.size).toBe(0);

      const oldProfileEntries = await outboxModule.getSyncOutboxEntries('user_1', 'old_profile');
      const newProfileEntries = await outboxModule.getSyncOutboxEntries('user_1', 'new_profile');
      expect(oldProfileEntries).toHaveLength(0);
      expect(newProfileEntries).toHaveLength(0);
    } finally {
      unsubscribe();
      spy.mockRestore();
    }
  });

  it('records a successful empty pull separately from the presence of server data', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T00:00:00Z'));
    const { useSyncStore } = await loadSyncModules();
    vi.stubGlobal(
      'fetch',
      vi.fn((): Promise<Response> => Promise.resolve(graphqlResponse({ profileAllData: [] }))),
    );
    useSyncStore.setState({ currentProfileId: 'empty_profile' });

    await useSyncStore.getState().pullAll();

    expect(useSyncStore.getState().lastPulledAt).toBe(Date.now());
    expect(useSyncStore.getState().lastSyncedAt).toBeNull();
  });

  it('rejects one key without blocking the rest of the batch or re-sending it until edited again', async () => {
    vi.useFakeTimers();
    const { useSyncStore } = await loadSyncModules();
    let syncCalls = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = parseGraphqlRequest(init);
      if (request.query.includes('profileAllData')) return Promise.resolve(graphqlResponse({ profileAllData: [] }));
      syncCalls += 1;
      const changes = (request.variables?.changes ?? []) as { key: string }[];
      return Promise.resolve(
        graphqlResponse({
          syncProfileData: changes.map(({ key }) =>
            key === 'raidHistory' ? { key, status: 'REJECTED', revision: 0, message: 'Payload too large' } : { key, status: 'APPLIED', revision: 1, updatedAt: 1_700_000_000 },
          ),
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    useSyncStore.setState({ currentProfileId: 'prof_1' });
    await useSyncStore.getState().pullAll();
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { a: 1 }, materialInventory: {} });
    useSyncStore.getState().push('raidHistory', { entries: [] });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(false);
    expect(useSyncStore.getState().pendingKeys.has('raidHistory')).toBe(true);
    expect(useSyncStore.getState().rejected).toEqual({ raidHistory: 'Payload too large' });
    expect(useSyncStore.getState().status).toBe('error');

    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(syncCalls).toBe(1);

    useSyncStore.getState().push('raidHistory', { entries: [] });
    expect(useSyncStore.getState().rejected).toEqual({});
    await vi.advanceTimersByTimeAsync(60_000);
    expect(syncCalls).toBe(2);
  });

  it('backs off retries up to one hour after repeated failures', async () => {
    vi.useFakeTimers();
    const { useSyncStore } = await loadSyncModules();
    let syncCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const request = parseGraphqlRequest(init);
        if (request.query.includes('profileAllData')) return Promise.resolve(graphqlResponse({ profileAllData: [] }));
        syncCalls += 1;
        return Promise.reject(new Error('down'));
      }),
    );
    const { SYNC_RETRY_DELAYS_MS } = await import('./syncStore');

    useSyncStore.setState({ currentProfileId: 'prof_1' });
    await useSyncStore.getState().pullAll();
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { a: 1 }, materialInventory: {} });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncCalls).toBe(1);

    for (let i = 0; i < SYNC_RETRY_DELAYS_MS.length; i += 1) {
      await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[i] - 1);
      expect(syncCalls).toBe(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(syncCalls).toBe(i + 2);
    }
    // Capped: the next retry is again one hour away.
    await vi.advanceTimersByTimeAsync(3_600_000 - 1);
    expect(syncCalls).toBe(SYNC_RETRY_DELAYS_MS.length + 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(syncCalls).toBe(SYNC_RETRY_DELAYS_MS.length + 2);
  });

  it('postpones a retry while the tab is hidden and resumes it when visible again', async () => {
    vi.useFakeTimers();
    const { useSyncStore } = await loadSyncModules();
    const { resumeDeferredSyncRetry } = await import('./syncStore');
    let syncCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const request = parseGraphqlRequest(init);
        if (request.query.includes('profileAllData')) return Promise.resolve(graphqlResponse({ profileAllData: [] }));
        syncCalls += 1;
        return syncCalls === 1 ? Promise.reject(new Error('down')) : Promise.resolve(syncAppliedResponse('growthPlans', 1));
      }),
    );
    const visibility = { visibilityState: 'visible' };
    vi.stubGlobal('document', visibility);

    useSyncStore.setState({ currentProfileId: 'prof_1' });
    await useSyncStore.getState().pullAll();
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { a: 1 }, materialInventory: {} });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncCalls).toBe(1);

    visibility.visibilityState = 'hidden';
    await vi.advanceTimersByTimeAsync(5_000);
    expect(syncCalls).toBe(1);

    visibility.visibilityState = 'visible';
    resumeDeferredSyncRetry();
    await vi.advanceTimersByTimeAsync(0);
    expect(syncCalls).toBe(2);
    expect(useSyncStore.getState().pendingKeys.size).toBe(0);
  });

  it('keeps local planner data when a pull fails with a non-GraphQL 503', async () => {
    const { useSyncStore, useGlobalStore } = await loadSyncModules();
    useGlobalStore.setState({ ownedGifts: { local: 1 } });
    vi.stubGlobal(
      'fetch',
      vi.fn((): Promise<Response> => Promise.resolve(new Response(JSON.stringify({ error: 'maintenance' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))),
    );
    useSyncStore.setState({ currentProfileId: 'prof_1' });

    const hasData = await useSyncStore.getState().pullAll();

    expect(hasData).toBe(false);
    expect(useSyncStore.getState().status).toBe('error');
    expect(useSyncStore.getState().isInitialized).toBe(false);
    expect(useGlobalStore.getState().ownedGifts).toEqual({ local: 1 });
  });
});
