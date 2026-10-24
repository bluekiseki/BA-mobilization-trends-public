import { gqlFetch } from '~/utils/gqlFetch';
import { SESSION_HINT_KEY, useAuthStore } from '~/store/authStore';
import { useSyncStore } from '~/store/syncStore';

/**
 * Sign out, clear local account/planner state, and return to the home page.
 */
export async function logoutAccount(): Promise<void> {
  // better-auth's sign-out endpoint requires a JSON Content-Type + body; without it the
  // server returns 415 and the session cookie is never cleared, so the account reappears
  // after the reload below re-reads the still-valid session.
  const res = await fetch('/api/auth/sign-out', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    console.error('Logout failed:', res.status, await res.text());
    return;
  }
  useAuthStore.getState().logout();
  useSyncStore.getState().clearAccountData();
  try {
    localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Storage may be unavailable (private browsing); non-fatal.
  }
  window.location.href = '/';
}

/**
 * Download a profile's synced data as a JSON file. Throws on failure so the
 * caller can surface an error. Extracted from settings/index.tsx.
 */
export async function exportProfileData(profileId: string, name: string, server: string): Promise<void> {
  const res = await gqlFetch<{ profileAllData: { key: string; value: unknown }[] }>('query ProfileAllData($id: ID!) { profileAllData(id: $id) { key value } }', {
    id: profileId,
  });

  const payload = {
    profile: { id: profileId, name, server },
    data: Object.fromEntries(res.profileAllData.map(({ key, value }) => [key, value])),
    exportedAt: new Date().toISOString(),
  };

  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `yuzu-${name.replace(/[^a-z0-9]/gi, '_')}-${server}.profile.json`;
  a.click();
  URL.revokeObjectURL(url);
}
