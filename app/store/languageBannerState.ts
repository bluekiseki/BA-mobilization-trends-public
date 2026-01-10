// app/stores/languageBannerState.ts (new file)

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface LanguageBannerState {
  hasShownLanguageBanner: boolean
  setHasShownLanguageBanner: () => void
}

/**
 * A store that manages and saves whether the language suggestion banner
 * has been shown, using localStorage.
 */
export const useLanguageBannerStore = create<LanguageBannerState>()(
  persist(
    (set) => ({
      hasShownLanguageBanner: false,
      setHasShownLanguageBanner: () => set({ hasShownLanguageBanner: true }),
    }),
    {
      name: 'language-banner-storage-en-ko-ja-zh_Hant', // Key name to be stored in localStorage
      storage: createJSONStorage(() => localStorage),
    },
  ),
)