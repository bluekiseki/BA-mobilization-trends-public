// app/stores/languageBannerState.ts (new file)

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface LanguageBannerState {
  hasShownLanguageBanner: boolean;
  setHasShownLanguageBanner: () => void;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

/**
 * A store that manages and saves whether the language suggestion banner
 * has been shown, using localStorage.
 */
export const useLanguageBannerStore = create<LanguageBannerState>()(
  persist(
    (set) => ({
      hasShownLanguageBanner: false,
      _hasHydrated: false,
      setHasShownLanguageBanner: () => set({ hasShownLanguageBanner: true }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'language-banner-storage-h-en-ko-ja-zh_Hant',
      storage: createJSONStorage(() => localStorage),
      // Callback executed once storage is fully loaded
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
