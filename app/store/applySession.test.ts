import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RawProfileRow } from './authStore';
import type { SessionPayload } from './applySession';

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

const initializeProfile = vi.fn().mockResolvedValue(false);

// applySession dynamically imports anonymousPlannerSnapshot.client, which in turn pulls in
// every planner store; mocked out since this test only cares about the auth/sync bootstrap.
vi.mock('./anonymousPlannerSnapshot.client', () => ({
  preserveAnonymousPlannerSnapshot: vi.fn(),
  clearAnonymousPlannerSnapshot: vi.fn(),
}));

vi.mock('./syncStore', () => ({
  useSyncStore: { getState: () => ({ initializeProfile }) },
}));

function makeProfile(overrides: Partial<RawProfileRow> = {}): RawProfileRow {
  return {
    id: 'profile-1',
    name: 'Default',
    server: 'kr',
    is_default: 1,
    sort_order: 0,
    avatar_student_id: null,
    created_at: 1_700_000_000,
    updated_at: 1_700_000_000,
    ...overrides,
  };
}

async function loadModules() {
  vi.resetModules();
  vi.stubGlobal('localStorage', new MemoryStorage());
  const [{ applySession }, { useAuthStore, getActiveProfileStorageKey, SESSION_HINT_KEY }] = await Promise.all([import('./applySession'), import('./authStore')]);
  return { applySession, useAuthStore, getActiveProfileStorageKey, SESSION_HINT_KEY };
}

describe('applySession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('applies the user and defaults to the isDefault profile', async () => {
    const { applySession, useAuthStore, SESSION_HINT_KEY } = await loadModules();
    const payload: SessionPayload = {
      user: { id: 'user-1', username: 'alice' },
      profiles: [makeProfile({ id: 'p-a', is_default: 0 }), makeProfile({ id: 'p-b', is_default: 1 })],
    };

    const applied = applySession(payload);

    expect(applied).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe('user-1');
    expect(useAuthStore.getState().activeProfileId).toBe('p-b');
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBe('1');
  });

  it('prefers a locally saved profile over the server-marked default', async () => {
    const { applySession, useAuthStore, getActiveProfileStorageKey } = await loadModules();
    localStorage.setItem(getActiveProfileStorageKey('user-1'), 'p-a');
    const payload: SessionPayload = {
      user: { id: 'user-1', username: 'alice' },
      profiles: [makeProfile({ id: 'p-a', is_default: 0 }), makeProfile({ id: 'p-b', is_default: 1 })],
    };

    applySession(payload);

    expect(useAuthStore.getState().activeProfileId).toBe('p-a');
  });

  it('migrates the legacy unscoped profile-id key and removes it', async () => {
    const { applySession, useAuthStore } = await loadModules();
    localStorage.setItem('yuzu_activeProfileId', 'p-a');
    const payload: SessionPayload = {
      user: { id: 'user-1', username: 'alice' },
      profiles: [makeProfile({ id: 'p-a', is_default: 0 }), makeProfile({ id: 'p-b', is_default: 1 })],
    };

    applySession(payload);

    expect(useAuthStore.getState().activeProfileId).toBe('p-a');
    expect(localStorage.getItem('yuzu_activeProfileId')).toBeNull();
  });

  it('returns false and sets no hint when there are no profiles to select', async () => {
    const { applySession, useAuthStore, SESSION_HINT_KEY } = await loadModules();
    const payload: SessionPayload = { user: { id: 'user-1', username: 'alice' }, profiles: [] };

    const applied = applySession(payload);

    expect(applied).toBe(false);
    expect(useAuthStore.getState().activeProfileId).toBeNull();
    expect(localStorage.getItem(SESSION_HINT_KEY)).toBeNull();
  });

  it('returns false for a payload with no user (treated as logged out)', async () => {
    const { applySession, useAuthStore } = await loadModules();
    const payload = { user: null, profiles: [] } as unknown as SessionPayload;

    const applied = applySession(payload);

    expect(applied).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });
});
