// app/store/planner/useEquipmentPlanStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface EquipmentPlanState {
  // Sweep counts by stage
  runCounts: Record<number, number>; // key: stageId, value: sweep count
  // Hard stage daily limit
  farmingDays: number;
  // Multiplier Event
  normalMultiplier: number;
  hardMultiplier: number;
  // Owned Equipment
  inventory: Record<string, number>; // key: 'Equipment_ID', value: owned quantity

  // Setters
  setRunCounts: (newCounts: Record<number, number>) => void;
  setRunCount: (stageId: number, count: number) => void;
  setFarmingDays: (days: number) => void;
  setMultipliers: (type: 'normal' | 'hard', value: number) => void;

  setInventoryItem: (key: string, amount: number) => void;
}

export const useEquipmentPlanStore = create<EquipmentPlanState>()(
  persist(
    (set) => ({
      // --- Initial State ---
      runCounts: {},
      farmingDays: 1,
      normalMultiplier: 1,
      hardMultiplier: 1,
      inventory: {},

      // --- Setters ---
      setRunCounts: (newCounts) => set({ runCounts: newCounts }),

      setRunCount: (stageId, count) =>
        set((state) => ({
          runCounts: { ...state.runCounts, [stageId]: Math.max(0, count) },
        })),

      setFarmingDays: (days) => set({ farmingDays: Math.max(1, days) }),

      setMultipliers: (type, value) => set(type === 'normal' ? { normalMultiplier: value } : { hardMultiplier: value }),

      setInventoryItem: (key, amount) =>
        set((state) => {
          const newInventory = { ...state.inventory };
          const cleanAmount = Math.max(0, amount);

          if (cleanAmount > 0) {
            newInventory[key] = cleanAmount;
          } else {
            // Remove from list if quantity is 0 or less
            delete newInventory[key];
          }
          return { inventory: newInventory };
        }),
    }),
    {
      name: 'equipment-plan-storage', // Key to be saved in localStorage
    },
  ),
);
