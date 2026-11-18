import { SESSION_HINT_KEY, useAuthStore } from './authStore';
import { useSyncStore } from './syncStore';

export function clearAccountSession(): void {
  // Notify other tabs before clearing shared planner keys, so they stop syncing first.
  try {
    localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Local cleanup still works when browser storage is unavailable.
  }
  useAuthStore.getState().logout();
  useSyncStore.getState().clearAccountData();
}
