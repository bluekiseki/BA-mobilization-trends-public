// Populates the auth/sync stores from a session payload, whether it came from the SSR-injected
// <script id="__ba_session__"> (see workers/session-inject.ts) or from a client-side recovery
// fetch to /api/auth/session-recover (see app/root.tsx). Kept out of app/root.tsx so it can be
// unit-tested without pulling in that module's `cloudflare:workers` / route-component imports.
import { getActiveProfileStorageKey, mapRawProfile, useAuthStore, SESSION_HINT_KEY, type RawProfileRow } from './authStore';
import { useSyncStore } from './syncStore';

export interface SessionPayload {
  user: { id: string; username: string; email?: string };
  profiles: RawProfileRow[];
}

// Returns whether a session was actually applied, so callers can distinguish
// "logged out" (no user / no resolvable profile) from a successful bootstrap.
export function applySession({ user, profiles: rawProfiles }: SessionPayload): boolean {
  if (!user) return false;

  const profiles = rawProfiles.map(mapRawProfile);
  useAuthStore.getState().setUser({ ...user, profiles });

  const storageKey = getActiveProfileStorageKey(user.id);
  const savedProfileId = localStorage.getItem(storageKey) ?? localStorage.getItem('yuzu_activeProfileId');
  const savedProfile = savedProfileId ? profiles.find((p) => p.id === savedProfileId) : null;
  const defaultProfile = savedProfile ?? profiles.find((p) => p.isDefault) ?? profiles[0];
  if (!defaultProfile) return false;

  useAuthStore.getState().setActiveProfile(defaultProfile.id);
  localStorage.removeItem('yuzu_activeProfileId');
  try {
    localStorage.setItem(SESSION_HINT_KEY, '1');
  } catch {
    // Storage may be unavailable (private browsing); the recovery fetch is skipped next time, non-fatal.
  }

  void import('./anonymousPlannerSnapshot.client').then(async ({ preserveAnonymousPlannerSnapshot, clearAnonymousPlannerSnapshot }) => {
    const current = useAuthStore.getState();
    if (current.user?.id !== user.id || current.activeProfileId !== defaultProfile.id) return;
    preserveAnonymousPlannerSnapshot(user.id, defaultProfile.id);
    const hasServerData = await useSyncStore.getState().initializeProfile(user.id, defaultProfile.id);
    if (hasServerData) clearAnonymousPlannerSnapshot(user.id, defaultProfile.id);
  });

  return true;
}
