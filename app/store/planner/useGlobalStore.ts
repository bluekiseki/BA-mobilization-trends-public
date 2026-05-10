// app/store/planner/useGlobalStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * return true when a>b
 */
export const isLarger = (a: any, b: any) => {
  // 1. Number vs Number comparison
  if (typeof a === 'number' && typeof b === 'number') {
    return a > b;
  }

  // 2. Array vs Array comparison
  if (Array.isArray(a) && Array.isArray(b)) {
    // 2-1. If lengths differ, the longer one is considered greater
    if (a.length !== b.length) {
      return a.length > b.length;
    }
    // 2-2. If lengths are equal, compare internal elements sequentially
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue; // If equal, move to the next element
      return a[i] > b[i]; // If different, determine based on the size of the element
    }
    return false; // If all elements are identical, it is not greater
  }

  // 3. Object comparison (based on key count)
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const aKeys = Object.keys(a).length;
    const bKeys = Object.keys(b).length;
    if (aKeys !== bKeys) return aKeys > bKeys;
  }

  // 4. String comparison (based on length)
  if (typeof a === 'string' && typeof b === 'string') {
    return a.length > b.length;
  }

  return false;
};

export interface GrowthPlan {
  uuid: string;
  studentId: number | null;
  current: {
    level: number;
    star: number;
    uw: number;
    uwLevel: number;
    ex: number;
    normal: number;
    passive: number;
    sub: number;
    eleph: number;

    affection: number;
    affectionExp: number;
    equipment: [number, number, number];
    gear: number;
    potential: { hp: number; atk: number; heal: number };
  };
  target: {
    level: number;
    star: number;
    uw: number;
    uwLevel: number;
    ex: number;
    normal: number;
    passive: number;
    sub: number;
    affection: number;
    equipment: [number, number, number];
    gear: number;
    potential: { hp: number; atk: number; heal: number };
  };
  includedInEvents: number[];
  useEligmaForStar: boolean;
  eligmaInfo: {
    price: number;
    stock: number;
  };
  isSelected: boolean;
  acquiredDate?: string;
}

interface GlobalState {
  growthPlans: GrowthPlan[];
  ownedGifts: Record<string, number>;
  addPlan: (eventId: number | null) => string | undefined;
  removePlan: (uuid: string) => void;
  updatePlan: (uuid: string, field: string, value: any) => void;
  toggleEventInclusion: (uuid: string, eventId: number) => void;
  setGrowthPlans: (plans: GrowthPlan[]) => void;
  updateOwnedGifts: (itemId: string, amount: number) => void;
  resetOwnedGifts: () => void;
  togglePlanSelection: (uuid: string) => void;
  selectAllPlans: (selected: boolean) => void;
  materialInventory: Record<string, number>;
  updateMaterialInventory: (key: string, amount: number) => void;
  resetMaterialInventory: () => void;
}

export const useGlobalStore = create<GlobalState>()(
  persist(
    (set, get) => ({
      growthPlans: [],
      ownedGifts: {},
      addPlan: (eventId: number | null = null) => {
        const { growthPlans } = get();

        const hasUnselectedPlan = growthPlans.some((plan) => plan.studentId === null);

        // If it already exists, stop the function here and do nothing.
        if (hasUnselectedPlan) {
          console.warn('A new plan cannot be added because a plan with no student selected already exists.');
          alert('A new plan cannot be added because a plan with no student selected already exists.');
          // You can also add logic to alert users (e.g., toast, alert, etc.)
          return;
        }

        const newPlan: GrowthPlan = {
          uuid: `${Date.now()}-${(Math.random() * 1e9) | 0}`,
          studentId: null,
          current: {
            level: 1,
            star: 3,
            uw: 0,
            uwLevel: 1,
            ex: 1,
            normal: 1,
            passive: 1,
            sub: 1,
            eleph: 0,
            affection: 1,
            affectionExp: 0,
            equipment: [0, 0, 0],
            gear: 0,
            potential: { hp: 0, atk: 0, heal: 0 },
          },
          target: {
            level: 1,
            star: 3,
            uw: 0,
            uwLevel: 1,
            ex: 1,
            normal: 1,
            passive: 1,
            sub: 1,
            affection: 1,
            equipment: [0, 0, 0],
            gear: 0,
            potential: { hp: 0, atk: 0, heal: 0 },
          },
          includedInEvents: eventId ? [eventId] : [],
          useEligmaForStar: false,
          eligmaInfo: {
            price: 1,
            stock: 20,
          },
          isSelected: true,
        };
        set({ growthPlans: [...get().growthPlans, newPlan] });
        return newPlan.uuid;
      },
      removePlan: (uuid) => {
        set({ growthPlans: get().growthPlans.filter((p) => p.uuid !== uuid) });
      },
      updatePlan: (uuid, field, value) => {
        set((state) => {
          const newGrowthPlans = state.growthPlans.map((p) => {
            if (p.uuid === uuid) {
              const newPlan = JSON.parse(JSON.stringify(p));

              const [main, sub] = field.split('.');
              if (sub) {
                (newPlan as any)[main][sub] = value;
              } else {
                (newPlan as any)[field] = value;
                // Reset gear when student changes — new student may not have gear
                if (field === 'studentId') {
                  newPlan.current.gear = 0;
                  newPlan.target.gear = 0;
                }
              }
              // Ensure target >= current
              if (sub) {
                const currentVal = newPlan.current[sub];
                const targetVal = newPlan.target[sub];

                if (isLarger(currentVal, targetVal)) {
                  newPlan.target[sub] = currentVal;
                } else if (typeof currentVal === 'object' && typeof targetVal === 'object' && isLarger(Object.values(currentVal), Object.values(targetVal))) {
                  newPlan.target[sub] = currentVal;
                }

                // ★ rank
                if (sub === 'star' || sub === 'uw') {
                  const currentRank = newPlan.current.uw > 0 ? 5 + newPlan.current.uw : newPlan.current.star;
                  const targetRank = newPlan.target.uw > 0 ? 5 + newPlan.target.uw : newPlan.target.star;
                  if (currentRank > targetRank) {
                    newPlan.target.star = newPlan.current.star;
                    newPlan.target.uw = newPlan.current.uw;
                    newPlan.target.uwLevel = newPlan.current.uwLevel;
                  }
                }
              }
              return newPlan;
            }
            return p;
          });

          return { growthPlans: newGrowthPlans };
        });
      },
      toggleEventInclusion: (uuid, eventId) => {
        set((state) => ({
          growthPlans: state.growthPlans.map((plan) => {
            if (plan.uuid === uuid) {
              const included = plan.includedInEvents.includes(eventId);
              return {
                ...plan,
                includedInEvents: included ? plan.includedInEvents.filter((id) => id !== eventId) : [...plan.includedInEvents, eventId],
              };
            }
            return plan;
          }),
        }));
      },
      setGrowthPlans: (plans) => set({ growthPlans: plans }),
      updateOwnedGifts: (itemId, amount) =>
        set((state) => {
          const newOwnedGifts = { ...state.ownedGifts };
          if (amount > 0) {
            newOwnedGifts[itemId] = amount;
          } else {
            delete newOwnedGifts[itemId]; // Remove from list if quantity is 0
          }
          return { ownedGifts: newOwnedGifts };
        }),
      resetOwnedGifts: () => set({ ownedGifts: {} }),

      materialInventory: {},
      updateMaterialInventory: (key, amount) =>
        set((state) => {
          const next = { ...state.materialInventory };
          if (amount > 0) next[key] = amount;
          else delete next[key];
          return { materialInventory: next };
        }),
      resetMaterialInventory: () => set({ materialInventory: {} }),

      togglePlanSelection: (uuid) =>
        set((state) => ({
          growthPlans: state.growthPlans.map((p) => (p.uuid === uuid ? { ...p, isSelected: !p.isSelected } : p)),
        })),
      selectAllPlans: (selected) =>
        set((state) => ({
          growthPlans: state.growthPlans.map((p) => ({
            ...p,
            isSelected: selected,
          })),
        })),
    }),
    {
      name: 'global-growth-plans-v2',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
