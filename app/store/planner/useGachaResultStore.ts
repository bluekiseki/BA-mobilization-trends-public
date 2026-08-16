import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GlobalAggregatedResult } from '~/utils/gachaEngine';

interface GachaResultState {
  result: GlobalAggregatedResult | null;
  setResult: (result: GlobalAggregatedResult | null) => void;
}

// Persisted store: holds the latest gacha simulation result.
// Written by Gacha_v2.tsx after each simulation run.
// Read by ResourcePlanner.tsx to show eligma/eleph contributions.
export const useGachaResultStore = create<GachaResultState>()(
  persist(
    (set) => ({
      result: null,
      setResult: (result) => set({ result }),
    }),
    { name: 'gacha-result-v1', storage: createJSONStorage(() => localStorage) },
  ),
);
