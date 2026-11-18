import { gqlFetch } from '~/utils/gqlFetch';
import { clearAccountSession } from '~/store/clearAccountSession';
import { downloadProfileFile } from '~/utils/profileFile';

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
  clearAccountSession();
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
  };
  downloadProfileFile(payload, `yuzu-${name.replace(/[^a-z0-9]/gi, '_')}-${server}.profile.json`);
}
