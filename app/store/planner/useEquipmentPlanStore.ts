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
  // @deprecated Use useGlobalStore.materialInventory instead
  inventory: Record<string, number>; // key: 'Equipment_ID', value: owned quantity
  // Campaign data source
  campaignSource: 'kr' | 'jp';
  // Universal blueprints inventory (by equipment type name)
  // @deprecated Use useGlobalStore.materialInventory with Equipment_501000~509000 instead
  blueprints: Record<string, number>; // key: 'Hat'|'Gloves'|'Shoes'|'Bag'|'Badge'|'Hairpin'|'Charm'|'Watch'|'Necklace'

  // Setters
  setRunCounts: (newCounts: Record<number, number>) => void;
  setRunCount: (stageId: number, count: number) => void;
  setFarmingDays: (days: number) => void;
  setMultipliers: (type: 'normal' | 'hard', value: number) => void;
  // @deprecated Use useGlobalStore.updateMaterialInventory instead
  setInventoryItem: (key: string, amount: number) => void;
  setCampaignSource: (source: 'kr' | 'jp') => void;
  // @deprecated Use useGlobalStore.updateMaterialInventory with Equipment_501000~509000 instead
  setBlueprint: (type: string, amount: number) => void;
}

export const useEquipmentPlanStore = create<EquipmentPlanState>()(
  persist(
    (set) => ({
      // --- Initial State ---
      runCounts: {},
      farmingDays: 1,
      normalMultiplier: 2,
      hardMultiplier: 2,
      inventory: {},
      campaignSource: 'jp',
      blueprints: {},

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
            delete newInventory[key];
          }
          return { inventory: newInventory };
        }),

      setCampaignSource: (source) => set({ campaignSource: source }),

      setBlueprint: (type, amount) =>
        set((state) => {
          const newBlueprints = { ...state.blueprints };
          const cleanAmount = Math.max(0, amount);

          if (cleanAmount > 0) {
            newBlueprints[type] = cleanAmount;
          } else {
            delete newBlueprints[type];
          }
          return { blueprints: newBlueprints };
        }),
    }),
    {
      name: 'equipment-plan-storage',
    },
  ),
);
