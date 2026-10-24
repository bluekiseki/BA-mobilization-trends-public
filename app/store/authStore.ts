import { create } from 'zustand';
import { getProfileServerLabel, PROFILE_SERVERS, type ProfileServer } from '~/utils/profileServer';

export interface UserProfile {
  id: string;
  name: string;
  server: ProfileServer;
  isDefault: boolean;
  sortOrder: number;
  /** Blue Archive student id used as the profile avatar; null = not set (UI falls back to a default). */
  avatarStudentId: number | null;
  createdAt: string;
  updatedAt: string;
}

export type { ProfileServer } from '~/utils/profileServer';

/** Raw shape returned by the `/__internal/session` endpoint (D1 row column names). */
export interface RawProfileRow {
  id: string;
  name: string;
  server: string;
  is_default: number;
  sort_order: number;
  avatar_student_id: number | null;
  created_at: number;
  updated_at: number;
}

export function mapRawProfile(row: RawProfileRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    server: row.server as ProfileServer,
    isDefault: row.is_default === 1,
    sortOrder: row.sort_order,
    avatarStudentId: row.avatar_student_id ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export const PROFILE_SERVER_OPTIONS: { value: ProfileServer; label: string }[] = PROFILE_SERVERS.map((server) => ({ value: server, label: getProfileServerLabel(server) }));

export const GLKR_PROFILE_SERVER_OPTIONS = PROFILE_SERVER_OPTIONS.filter((option) => option.value !== 'jp') as { value: Exclude<ProfileServer, 'jp'>; label: string }[];

export interface User {
  id: string;
  username: string;
  email?: string;
  profiles?: UserProfile[];
}

export function getActiveProfileStorageKey(userId: string): string {
  return `yuzu_activeProfileId:${userId}`;
}

// Set once a session has been applied to the store (from the SSR-injected script or a
// recovery fetch), cleared on sign-out. Lets root.tsx tell "never logged in on this browser"
// apart from "browser served a stale anonymous page after login" without a server round trip.
export const SESSION_HINT_KEY = 'yuzu_sessionHint';

interface AuthState {
  user: User | null;
  activeProfileId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setActiveProfile: (profileId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;

  // Computed
  activeProfile: () => UserProfile | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  activeProfileId: null,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user, error: null }),
  setActiveProfile: (profileId) => {
    const userId = get().user?.id;
    if (userId) localStorage.setItem(getActiveProfileStorageKey(userId), profileId);
    set({ activeProfileId: profileId });
  },
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  logout: () => {
    set({ user: null, activeProfileId: null });
  },

  activeProfile: () => {
    const { user, activeProfileId } = get();
    if (!user || !activeProfileId) return null;
    return user.profiles?.find((p) => p.id === activeProfileId) ?? null;
  },
}));
