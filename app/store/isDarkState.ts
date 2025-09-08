// store/themeStore.ts
import { create } from 'zustand';

type IsDark = 'light' | 'dark' | null;

interface IsDarkState {
  isDark: IsDark;
  setIsDark: (theme: IsDark) => void;
}

export const useIsDarkState = create<IsDarkState>((set) => ({
  isDark: null,
  setIsDark: (newTheme) => set({ isDark: newTheme }),
}));