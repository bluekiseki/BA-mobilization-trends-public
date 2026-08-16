// app/store/planner/useResourcePlanStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { isoAddDays } from '~/utils/dateUtils';
import { DEFAULT_RAID_CONFIG } from '~/data/raidCoinData';
import type { CoinShopItem } from '~/data/elephSources';
import type { RaidDetailConfig, ResourcePlanData, ResourcePlanEvent, StageFarmingPlan, StudentTargetGoal } from '~/types/resourcePlan';

// ─── State shape ──────────────────────────────────────────────────────────────

/** Fields that can be safely replaced via the `update` action. */
export type ResourcePlanUpdatableFields = Omit<
  ResourcePlanData,
  'gachaEligmaPercentile' | 'gachaEligmaUseMean' | 'purchaseEvents' | 'dailySourceAmounts' | 'contentEventYields' | 'targetGoals' | 'stageFarmingPlans'
>;

interface ResourcePlanState extends ResourcePlanData {
  // ── Server selection (persisted) ──────────────────────────────────────────
  server: 'kr' | 'jp';
  kr: ResourcePlanData;
  jp: ResourcePlanData;

  setServer: (s: 'kr' | 'jp') => void;

  // ── Actions ──────────────────────────────────────────────────────────────

  setGachaEligmaPercentile: (v: number) => void;
  setGachaEligmaUseMean: (v: boolean) => void;

  addPurchaseEvent: (event: Omit<ResourcePlanEvent, 'id'>) => void;
  removePurchaseEvent: (id: string) => void;
  removePurchasesInRange: (gainItemKey: string, coinKey: string, rangeMin: string, rangeMax: string) => void;
  updatePurchaseEvent: (id: string, patch: Partial<Omit<ResourcePlanEvent, 'id'>>) => void;

  setDailySourceAmount: (sourceId: string, date: string, amount: number) => void;
  setDailySourceRange: (sourceId: string, startDate: string, endDate: string, amount: number) => void;
  clearDailySource: (sourceId: string) => void;

  setContentEventYield: (scheduleItemId: string, amount: number) => void;

  // Goal actions — intermediate goals only (id !== 'final')
  addTargetGoal: (studentId: number, goal: Omit<StudentTargetGoal, 'id'>) => void;
  updateTargetGoal: (studentId: number, goalId: string, patch: Partial<Omit<StudentTargetGoal, 'id'>>) => void;
  removeTargetGoal: (studentId: number, goalId: string) => void;

  // Final goal action — upserts the id='final' entry for a student
  setFinalGoal: (studentId: number, goal: Pick<StudentTargetGoal, 'targetStar' | 'targetUw' | 'date' | 'contentRef'> | null) => void;

  addStageFarmingPlan: (stageId: string, plan: StageFarmingPlan) => void;
  removeStageFarmingPlan: (stageId: string) => void;
  setStageFarmingRunsRange: (stageId: string, startDate: string, endDate: string, runs: number) => void;

  /** Shallow-merge patch for UpdatableFields. */
  update: (patch: Partial<ResourcePlanUpdatableFields>) => void;

  setRaidDetailConfig: (id: string, config: RaidDetailConfig | null) => void;

  setPurchasesForRange: (params: { gainItemKey: string; coinKey: string; shopItem: CoinShopItem; count: number; sourceType: string; rangeMin: string; rangeMax: string; refreshCost?: number }) => void;

  resetAll: () => void;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const defaults: ResourcePlanData = {
  gachaEligmaPercentile: 50,
  gachaEligmaUseMean: false,
  purchaseEvents: [],
  dailySourceAmounts: {},
  contentEventYields: {},
  targetGoals: {},
  stageFarmingPlans: {},

  pvpAverageRank: 100,
  pvpDailyDefenseWins: 1,
  pvpExtraWeeklyIncome: 0,

  raidGlobalConfig: DEFAULT_RAID_CONFIG,
  eraidGlobalConfig: DEFAULT_RAID_CONFIG,
  raidDetailConfigs: {},

  jfdDefaultDailyCoins: 80,
  jfdPerPeriodCoins: {},

  multifloorDefaultMaxFloor: 0,
  multifloorMaxFloors: {},

  expertPermitMode: 'weekly_max',
  expertPermitWeeklyMax: 0,
  expertPermitDailyAmounts: {},
};

// ─── Sync export ──────────────────────────────────────────────────────────────

/** Returns the full persisted state (both servers) for sync. */
export function getResourcePlanData(state: ResourcePlanState): { server: 'kr' | 'jp'; kr: ResourcePlanData; jp: ResourcePlanData } {
  return { server: state.server, kr: state.kr, jp: state.jp };
}

// ─── ID helpers ───────────────────────────────────────────────────────────────

let nextEventId = Date.now();
function genId(): string {
  return `pe_${(nextEventId++).toString(36)}`;
}

function genGoalId(): string {
  return `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

// Applies updates to both the flat fields (for component reads) and the nested server copy (for persistence).
function both(s: ResourcePlanState, updates: Partial<ResourcePlanData>): Partial<ResourcePlanState> {
  return {
    ...updates,
    [s.server]: { ...s[s.server], ...updates },
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useResourcePlanStore = create<ResourcePlanState>()(
  persist(
    (set) => ({
      server: 'kr',
      kr: { ...defaults },
      jp: { ...defaults },
      ...defaults,

      // ── Server switch ──────────────────────────────────────────────────────
      setServer: (newServer) =>
        set((s) => {
          if (s.server === newServer) return {};
          // Load the new server's data into flat fields for component reads
          return { server: newServer, ...s[newServer] };
        }),

      // ── Gacha ──────────────────────────────────────────────────────────────
      setGachaEligmaPercentile: (v) => set((s) => both(s, { gachaEligmaPercentile: v })),
      setGachaEligmaUseMean: (v) => set((s) => both(s, { gachaEligmaUseMean: v })),

      // ── Purchase events ────────────────────────────────────────────────────
      addPurchaseEvent: (event) => set((s) => both(s, { purchaseEvents: [...s.purchaseEvents, { ...event, id: genId() }] })),

      removePurchaseEvent: (id) => set((s) => both(s, { purchaseEvents: s.purchaseEvents.filter((e) => e.id !== id) })),

      removePurchasesInRange: (gainItemKey, coinKey, rangeMin, rangeMax) =>
        set((s) =>
          both(s, {
            purchaseEvents: s.purchaseEvents.filter((e) => !(e.gainItemKey === gainItemKey && e.spendItemKey === coinKey && e.date >= rangeMin && e.date <= rangeMax)),
          }),
        ),

      updatePurchaseEvent: (id, patch) => set((s) => both(s, { purchaseEvents: s.purchaseEvents.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),

      // ── Daily sources ──────────────────────────────────────────────────────
      setDailySourceAmount: (sourceId, date, amount) =>
        set((s) => {
          const prev = s.dailySourceAmounts[sourceId] ?? {};
          const next = { ...prev };
          if (amount <= 0) delete next[date];
          else next[date] = amount;
          return both(s, { dailySourceAmounts: { ...s.dailySourceAmounts, [sourceId]: next } });
        }),

      setDailySourceRange: (sourceId, startDate, endDate, amount) =>
        set((s) => {
          const next = { ...(s.dailySourceAmounts[sourceId] ?? {}) };
          let cur = startDate;
          while (cur <= endDate) {
            if (amount <= 0) delete next[cur];
            else next[cur] = amount;
            cur = isoAddDays(cur, 1);
          }
          return both(s, { dailySourceAmounts: { ...s.dailySourceAmounts, [sourceId]: next } });
        }),

      clearDailySource: (sourceId) =>
        set((s) => {
          const next = { ...s.dailySourceAmounts };
          delete next[sourceId];
          return both(s, { dailySourceAmounts: next });
        }),

      setContentEventYield: (scheduleItemId, amount) => set((s) => both(s, { contentEventYields: { ...s.contentEventYields, [scheduleItemId]: amount } })),

      // ── Goals ──────────────────────────────────────────────────────────────
      addTargetGoal: (studentId, goal) =>
        set((s) => {
          const existing = (s.targetGoals[studentId] ?? []).filter((g) => g.id !== 'final');
          return both(s, {
            targetGoals: {
              ...s.targetGoals,
              [studentId]: [...existing, { ...goal, id: genGoalId() }, ...(s.targetGoals[studentId]?.filter((g) => g.id === 'final') ?? [])],
            },
          });
        }),

      updateTargetGoal: (studentId, goalId, patch) =>
        set((s) =>
          both(s, {
            targetGoals: {
              ...s.targetGoals,
              [studentId]: (s.targetGoals[studentId] ?? []).map((g) => (g.id === goalId ? { ...g, ...patch } : g)),
            },
          }),
        ),

      removeTargetGoal: (studentId, goalId) =>
        set((s) => {
          const next = (s.targetGoals[studentId] ?? []).filter((g) => g.id !== goalId);
          const updated = { ...s.targetGoals };
          if (next.length === 0) delete updated[studentId];
          else updated[studentId] = next;
          return both(s, { targetGoals: updated });
        }),

      setFinalGoal: (studentId, goal) =>
        set((s) => {
          const intermediate = (s.targetGoals[studentId] ?? []).filter((g) => g.id !== 'final');
          const updated = { ...s.targetGoals };
          if (!goal) {
            if (intermediate.length === 0) delete updated[studentId];
            else updated[studentId] = intermediate;
          } else {
            updated[studentId] = [...intermediate, { ...goal, id: 'final' }];
          }
          return both(s, { targetGoals: updated });
        }),

      // ── Stage farming ──────────────────────────────────────────────────────
      addStageFarmingPlan: (stageId, plan) => set((s) => both(s, { stageFarmingPlans: { ...s.stageFarmingPlans, [stageId]: plan } })),

      removeStageFarmingPlan: (stageId) =>
        set((s) => {
          const next = { ...s.stageFarmingPlans };
          delete next[stageId];
          return both(s, { stageFarmingPlans: next });
        }),

      setStageFarmingRunsRange: (stageId, startDate, endDate, runs) =>
        set((s) => {
          const plan = s.stageFarmingPlans[stageId];
          if (!plan) return s;
          const next = { ...plan.dailyRuns };
          let cur = startDate;
          while (cur <= endDate) {
            if (runs <= 0) delete next[cur];
            else next[cur] = runs;
            cur = isoAddDays(cur, 1);
          }
          return both(s, { stageFarmingPlans: { ...s.stageFarmingPlans, [stageId]: { dailyRuns: next } } });
        }),

      // ── Generic patch ──────────────────────────────────────────────────────
      update: (patch) => set((s) => both(s, patch)),

      setRaidDetailConfig: (id, config) =>
        set((s) => {
          const next = { ...s.raidDetailConfigs };
          if (config === null) delete next[id];
          else next[id] = config;
          return both(s, { raidDetailConfigs: next });
        }),

      // ── Purchase range setter ──────────────────────────────────────────────
      setPurchasesForRange: ({ gainItemKey, coinKey, shopItem, count, sourceType, rangeMin, rangeMax, refreshCost }) =>
        set((state) => {
          const { gainAmount, costPerBundle, monthlyLimit, dailyLimit } = shopItem;

          const kept = state.purchaseEvents.filter((e) => !(e.gainItemKey === gainItemKey && e.spendItemKey === coinKey && e.date >= rangeMin && e.date <= rangeMax));

          const toAdd: ResourcePlanEvent[] = [];

          const makeEvent = (date: string, units: number): ResourcePlanEvent => ({
            id: genId(),
            date,
            sourceType,
            label: `${coinKey} ×${units}`,
            gainItemKey,
            gainAmount: units * gainAmount,
            spendItemKey: coinKey,
            spendAmount: units * costPerBundle,
            purchaseUnits: units,
            refreshCost: refreshCost ?? undefined,
          });

          if (dailyLimit != null) {
            const capped = Math.min(count, dailyLimit);
            if (capped > 0) {
              let cur = rangeMin;
              while (cur <= rangeMax) {
                toAdd.push(makeEvent(cur, capped));
                cur = isoAddDays(cur, 1);
              }
            }
          } else if (monthlyLimit != null) {
            const targetDates: string[] = [rangeMin];
            const parts = rangeMin.split('-').map(Number);
            let year = parts[0];
            let month = parts[1];
            while (true) {
              month++;
              if (month > 12) {
                month = 1;
                year++;
              }
              const firstOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
              if (firstOfMonth > rangeMax) break;
              targetDates.push(firstOfMonth);
            }
            for (const targetDate of targetDates) {
              const ym = targetDate.slice(0, 7);
              const alreadyThisMonth = kept.filter((e) => e.gainItemKey === gainItemKey && e.spendItemKey === coinKey && e.date.startsWith(ym)).reduce((sum, e) => sum + (e.gainAmount ?? 0), 0);
              const remainingItems = monthlyLimit * gainAmount - alreadyThisMonth;
              if (remainingItems <= 0) continue;
              const capped = Math.min(count, Math.floor(remainingItems / gainAmount));
              if (capped > 0) toAdd.push(makeEvent(targetDate, capped));
            }
          }

          return both(state, { purchaseEvents: [...kept, ...toAdd] });
        }),

      resetAll: () => set({ ...defaults, kr: { ...defaults }, jp: { ...defaults } }),
    }),
    {
      name: 'resource-plan-v2',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
