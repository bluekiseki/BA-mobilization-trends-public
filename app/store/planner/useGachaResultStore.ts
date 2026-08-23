import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GlobalAggregatedResult } from '~/utils/gachaEngine';

interface GachaResultState {
  result: GlobalAggregatedResult | null;
  setResult: (result: GlobalAggregatedResult | null) => void;
}

// Persisted gacha simulation result: written by Gacha_v2.tsx, read by ResourcePlanner.tsx for eligma/eleph contributions.
export const useGachaResultStore = create<GachaResultState>()(
  persist(
    (set) => ({
      result: null,
      setResult: (result) => set({ result }),
    }),
    { name: 'gacha-result-v1', storage: createJSONStorage(() => localStorage) },
  ),
);
