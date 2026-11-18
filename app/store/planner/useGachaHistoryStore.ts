import { safeLocalStorage } from '../history/localPersistence';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { GachaHistoryData, GachaHistoryEntry } from '~/types/gachaHistory';

interface GachaHistoryState extends GachaHistoryData {
  addEntry: (entry: GachaHistoryEntry) => void;
  updateEntry: (entry: GachaHistoryEntry) => void;
  deleteEntry: (id: string) => void;
  replaceEntries: (entries: GachaHistoryEntry[]) => void;
  /** undefined = no choice made, so the page falls back to its computed default. */
  setSimulationCount: (simulationCount: number | undefined) => void;
}

export const useGachaHistoryStore = create<GachaHistoryState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) => set((state) => ({ entries: [...state.entries, entry] })),
      updateEntry: (entry) => set((state) => ({ entries: state.entries.map((current) => (current.id === entry.id ? entry : current)) })),
      deleteEntry: (id) => set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) })),
      replaceEntries: (entries) => set({ entries }),
      setSimulationCount: (simulationCount) => set({ simulationCount }),
    }),
    { name: 'gacha-history-v1', storage: createJSONStorage(() => safeLocalStorage), partialize: (state) => ({ entries: state.entries, simulationCount: state.simulationCount }) },
  ),
);

export function getGachaHistorySyncValue(): GachaHistoryData {
  const { entries, simulationCount } = useGachaHistoryStore.getState();
  return { entries, simulationCount };
}
