import { safeLocalStorage } from '../history/localPersistence';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { RaidHistoryData, RaidHistoryEntry } from '~/types/raidHistory';

interface RaidHistoryState extends RaidHistoryData {
  addEntry: (entry: RaidHistoryEntry) => void;
  updateEntry: (entry: RaidHistoryEntry) => void;
  deleteEntry: (id: string) => void;
  replaceEntries: (entries: RaidHistoryEntry[]) => void;
}

export const useRaidHistoryStore = create<RaidHistoryState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) => set((state) => ({ entries: [...state.entries, entry] })),
      updateEntry: (entry) => set((state) => ({ entries: state.entries.map((current) => (current.id === entry.id ? entry : current)) })),
      deleteEntry: (id) => set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) })),
      replaceEntries: (entries) => set({ entries }),
    }),
    {
      name: 'raid-history-v1',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);

export function getRaidHistorySyncValue(): RaidHistoryData {
  return { entries: useRaidHistoryStore.getState().entries };
}
