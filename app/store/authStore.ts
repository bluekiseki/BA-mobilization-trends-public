import { create } from 'zustand';

export interface UserProfile {
  id: string;
  name: string;
  server: 'jp' | 'kr' | 'tw' | 'asia' | 'global' | 'na';
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  profiles?: UserProfile[];
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
    localStorage.setItem('yuzu_activeProfileId', profileId);
    set({ activeProfileId: profileId });
  },
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  logout: () => {
    localStorage.removeItem('yuzu_activeProfileId');
    set({ user: null, activeProfileId: null });
  },

  activeProfile: () => {
    const { user, activeProfileId } = get();
    if (!user || !activeProfileId) return null;
    return user.profiles?.find((p) => p.id === activeProfileId) ?? null;
  },
}));
