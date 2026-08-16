import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useSyncStore } from '~/store/syncStore';
import type { RaidHistoryData, RaidHistoryEntry } from '~/types/raidHistory';

interface RaidHistoryState extends RaidHistoryData {
  addEntry: (entry: RaidHistoryEntry) => void;
  updateEntry: (entry: RaidHistoryEntry) => void;
  deleteEntry: (id: string) => void;
  replaceEntries: (entries: RaidHistoryEntry[]) => void;
}

function pushRaidHistory(entries: RaidHistoryEntry[]) {
  const sync = useSyncStore.getState();
  if (sync.isInitialized) {
    sync.push('raidHistory', { entries });
  }
}

export const useRaidHistoryStore = create<RaidHistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      addEntry: (entry) => {
        set((state) => ({ entries: [...state.entries, entry] }));
        pushRaidHistory(get().entries);
      },
      updateEntry: (entry) => {
        set((state) => ({ entries: state.entries.map((current) => (current.id === entry.id ? entry : current)) }));
        pushRaidHistory(get().entries);
      },
      deleteEntry: (id) => {
        set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) }));
        pushRaidHistory(get().entries);
      },
      replaceEntries: (entries) => {
        set({ entries });
        pushRaidHistory(get().entries);
      },
    }),
    {
      name: 'raid-history-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);
