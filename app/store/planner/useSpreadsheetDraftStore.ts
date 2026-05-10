import { create } from 'zustand';
import { isLarger, type GrowthPlan } from './useGlobalStore';

interface SpreadsheetDraftState {
  draftPlans: GrowthPlan[];
  savedPlans: GrowthPlan[];
  updateDraft: (uuid: string, field: string, value: any) => void;
  addDraftPlan: (studentId: number) => string;
  removeDraftPlan: (uuid: string) => void;
  initializeDraft: (plans: GrowthPlan[], keepPendingChanges?: boolean) => void;
  saveDraft: (callback: (plans: GrowthPlan[]) => void) => void;
  discardDraft: () => void;
  getDraftPlans: () => GrowthPlan[];
  hasPendingChanges: boolean;
}

export const useSpreadsheetDraftStore = create<SpreadsheetDraftState>((set, get) => ({
  draftPlans: [],
  savedPlans: [],
  hasPendingChanges: false,

  initializeDraft: (plans: GrowthPlan[], keepPendingChanges = false) => {
    set({
      draftPlans: JSON.parse(JSON.stringify(plans)),
      savedPlans: JSON.parse(JSON.stringify(plans)),
      hasPendingChanges: keepPendingChanges,
    });
  },

  updateDraft: (uuid: string, field: string, value: any) => {
    set((state) => {
      const newPlans = state.draftPlans.map((p) => {
        if (p.uuid === uuid) {
          const newPlan = JSON.parse(JSON.stringify(p));
          const [main, sub] = field.split('.');

          if (sub) {
            (newPlan as any)[main][sub] = value;
          } else {
            (newPlan as any)[field] = value;
            if (field === 'studentId') {
              newPlan.current.gear = 0;
              newPlan.target.gear = 0;
            }
          }

          // Ensure target >= current (always verified in all cases)
          const currentVal = newPlan.current[sub as keyof typeof newPlan.current];
          const targetVal = newPlan.target[sub as keyof typeof newPlan.target];

          if (sub && typeof currentVal === 'number' && typeof targetVal === 'number') {
            // Numeric fields: target >= current
            if (currentVal > targetVal) {
              console.log(`[VALIDATION] Field: ${field}, sub: ${sub}, current: ${currentVal}, target: ${targetVal} -> correcting to ${currentVal}`);
              newPlan.target[sub as keyof typeof newPlan.target] = currentVal;
            }
          } else if (sub && typeof currentVal === 'object' && typeof targetVal === 'object') {
            // Object fields (equipment, potential, etc.)
            if (isLarger(Object.values(currentVal), Object.values(targetVal))) {
              console.log(`[VALIDATION] Field: ${field}, correcting array field`);
              newPlan.target[sub as keyof typeof newPlan.target] = currentVal;
            }
          }

          // Special handling for Star/UW
          if (sub === 'star' || sub === 'uw') {
            const currentRank = newPlan.current.uw > 0 ? 5 + newPlan.current.uw : newPlan.current.star;
            const targetRank = newPlan.target.uw > 0 ? 5 + newPlan.target.uw : newPlan.target.star;
            if (currentRank > targetRank) {
              console.log(`[VALIDATION] Star/UW field: ${field}, current rank: ${currentRank}, target rank: ${targetRank}, correcting`);
              newPlan.target.star = newPlan.current.star;
              newPlan.target.uw = newPlan.current.uw;
              newPlan.target.uwLevel = newPlan.current.uwLevel;
            }
          }

          return newPlan;
        }
        return p;
      });

      return {
        draftPlans: newPlans,
        hasPendingChanges: true,
      };
    });
  },

  saveDraft: (callback: (plans: GrowthPlan[]) => void) => {
    const { draftPlans } = get();
    callback(draftPlans);
    set({ hasPendingChanges: false });
  },

  discardDraft: () => {
    const { savedPlans } = get();
    set({
      draftPlans: JSON.parse(JSON.stringify(savedPlans)),
      hasPendingChanges: false,
    });
  },

  getDraftPlans: () => {
    return get().draftPlans;
  },

  addDraftPlan: (studentId: number) => {
    const uuid = `${Date.now()}-${(Math.random() * 1e9) | 0}`;
    const newPlan: GrowthPlan = {
      uuid,
      studentId,
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
      includedInEvents: [],
      useEligmaForStar: false,
      eligmaInfo: {
        price: 1,
        stock: 20,
      },
      isSelected: true,
    };

    set((state) => ({
      draftPlans: [...state.draftPlans, newPlan],
      hasPendingChanges: true,
    }));

    return uuid;
  },

  removeDraftPlan: (uuid: string) => {
    set((state) => ({
      draftPlans: state.draftPlans.filter((p) => p.uuid !== uuid),
      hasPendingChanges: true,
    }));
  },
}));
