import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SimMetricAccumulator, type GlobalAggregatedResult } from '~/utils/gachaEngine';

interface GachaResultState {
  result: GlobalAggregatedResult | null;
  setResult: (result: GlobalAggregatedResult | null) => void;
}

// SimMetricAccumulator keeps its data in a Map, which JSON.stringify silently drops.
// Flatten the Map on write; readers coerce the plain object back via asSimMetricAccumulator.
const replacer = (_key: string, value: unknown): unknown => (value instanceof SimMetricAccumulator ? { bin: value.bin, data: Object.fromEntries(value.data) } : value);

// Persisted gacha simulation result: written by Gacha_v2.tsx, read by ResourcePlanner.tsx for eligma/eleph contributions.
export const useGachaResultStore = create<GachaResultState>()(
  persist(
    (set) => ({
      result: null,
      setResult: (result) => set({ result }),
    }),
    { name: 'gacha-result-v1', storage: createJSONStorage(() => localStorage, { replacer }) },
  ),
);
