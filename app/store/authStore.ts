import { create } from 'zustand';
import { getProfileServerLabel, PROFILE_SERVERS, type ProfileServer } from '~/utils/profileServer';

export interface UserProfile {
  id: string;
  name: string;
  server: ProfileServer;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type { ProfileServer } from '~/utils/profileServer';

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
