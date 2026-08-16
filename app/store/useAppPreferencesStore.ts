import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AppPreferences {
  greyOutUnplannedStudents: boolean;
  setGreyOutUnplannedStudents: (v: boolean) => void;
}

export const useAppPreferencesStore = create<AppPreferences>()(
  persist(
    (set) => ({
      greyOutUnplannedStudents: true,
      setGreyOutUnplannedStudents: (v) => set({ greyOutUnplannedStudents: v }),
    }),
    {
      name: 'app-preferences-v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
