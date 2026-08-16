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

function graphqlError(message: string): Response {
  return new Response(JSON.stringify({ errors: [{ message }] }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function loadSyncModules() {
  vi.resetModules();
  vi.stubGlobal('localStorage', new MemoryStorage());

  const [{ useSyncStore }, { useGlobalStore }, { useRaidHistoryStore }] = await Promise.all([import('./syncStore'), import('./planner/useGlobalStore'), import('./planner/useRaidHistoryStore')]);

  return { useSyncStore, useGlobalStore, useRaidHistoryStore };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('syncStore revision sync', () => {
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
      return Promise.resolve(graphqlResponse({ upsertProfileData: true }));
    });
    vi.stubGlobal('fetch', fetchMock);

    useSyncStore.getState().setCurrentProfileId('prof_1');
    await useSyncStore.getState().pullAll('prof_1');
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { gift: 1 }, materialInventory: {} });
    await vi.advanceTimersByTimeAsync(2000);

    expect(requests).toHaveLength(2);
    expect(requests[1]?.variables).toMatchObject({
      profileId: 'prof_1',
      key: 'growthPlans',
      baseRevision: 7,
    });
    expect(useSyncStore.getState().revisions.growthPlans).toBe(8);
  });

  it('refreshes from server instead of overwriting when baseRevision conflicts', async () => {
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
      return Promise.resolve(graphqlError('SYNC_CONFLICT'));
    });
    vi.stubGlobal('fetch', fetchMock);

    useSyncStore.getState().setCurrentProfileId('prof_1');
    await useSyncStore.getState().pullAll('prof_1');
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { localGift: 1 }, materialInventory: {} });
    await vi.advanceTimersByTimeAsync(2000);

    expect(useSyncStore.getState().status).toBe('synced');
    expect(useSyncStore.getState().error).toBeNull();
    expect(useSyncStore.getState().pendingKeys.has('growthPlans')).toBe(false);
    expect(useSyncStore.getState().revisions.growthPlans).toBe(3);
    expect(useGlobalStore.getState().ownedGifts).toEqual({ serverGift: 2 });
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

    useSyncStore.getState().setCurrentProfileId('prof_1');
    await useSyncStore.getState().pullAll('prof_1');
    useSyncStore.getState().push('growthPlans', { growthPlans: [], ownedGifts: { localGift: 1 }, materialInventory: {} });
    await vi.advanceTimersByTimeAsync(2000);

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

    await useSyncStore.getState().pullAll('empty_profile');

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

    await useSyncStore.getState().pullAll('prof_1');

    expect(useSyncStore.getState().status).toBe('synced');
    expect(useSyncStore.getState().isInitialized).toBe(true);
    expect(useSyncStore.getState().revisions.raidHistory).toBe(5);
    expect(useGlobalStore.getState().ownedGifts).toEqual({ serverGift: 3 });
    expect(useRaidHistoryStore.getState().entries).toEqual([]);
    consoleErrorSpy.mockRestore();
  });
});
