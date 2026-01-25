// stores/useEventPlanStore.ts

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useMemo, useCallback } from 'react';
import type { CustomGameItem } from '~/components/planner/minigame/CustomGamePlanner';
import type { CardShopConfig } from '~/components/planner/minigame/CardShopPlanner';
import { DefaultDiceRaceSimConfig, type DiceRaceSimConfig } from '~/components/planner/minigame/DiceRacePlanner';
import type { FortuneGachaAvgRates } from '~/components/planner/minigame/FortuneGachaPlanner';
import { DefaultTreasureSimConfig, type TreasureSimConfig } from '~/components/planner/minigame/TreasurePlanner';
import { getDefaultApConfig, type ApCalculatorConfig } from '~/components/planner/ApCalculatorConfig';
import { defaultDreamMakerConfig, type DreamMakerSimConfig, type DreamMakerSimResult } from '~/components/planner/minigame/dreamMaker/type';
import { defaultCardMatchSimConfig, type CardMatchSimConifg } from '~/components/planner/minigame/CardMatchPlanner';
import type { CcgRunInput } from '~/components/planner/minigame/MinigameCCGPlanner';

type StagePrio = 'include' | 'exclude' | 'priority';

// All user input state for a single event
export interface EventPlan {
  // BonusSelector
  selectedStudents: string[];
  // CurrencyStatus
  ownedCurrency: Record<number, number>;
  // ShopPlanner
  purchaseCounts: Record<number, number>;
  alreadyPurchasedCounts: Record<number, number>;
  // FarmingPlanner
  runCounts: Record<number, number>;
  firstClears: Record<number, boolean>;
  stagePrio: Record<number, StagePrio>;
  // MissionPlanner
  completedMissions: number[]; // Store Set as array
  minigameMissionStatus: Record<number, boolean>;
  durationDays: number;
  // ApCalculator
  apConfig: ApCalculatorConfig;
  // Minigame Planners
  finalCardFlips: number;

  // TreasurePlanner
  treasureStartRound: number;
  treasureEndRound: number;
  treasureFinalTotalRounds: number; // New
  treasureSimConfig: TreasureSimConfig; // New

  // BoxGachaPlanner
  boxGachaStartBox: number;
  boxGachaEndBox: number;
  boxGachaFinalTotalBoxes: number; // New

  // CustomGamePlanner
  customGamePlays: number;
  customGameCost: CustomGameItem | null; // New
  customGameRewards: CustomGameItem[]; // New
  customGameOneTimeRewards: CustomGameItem[]; // New

  // CardShopPlanner
  cardShopConfig: CardShopConfig; // New

  // DiceRacePlanner (fixedDicePriority is number[] when stored)
  // diceRaceSimConfig: Omit<DiceRaceSimConfig, 'fixedDicePriority'> & { fixedDicePriority: number[] }; // New
  diceRaceSimConfig: DiceRaceSimConfig; // New

  // FortuneGachaPlanner
  fortuneGachaSimRuns: number; // New
  fortuneGachaFinalPulls: number; // New
  fortuneGachaAvgRates: FortuneGachaAvgRates | null; // New

  // DreamMakerPlanner properties
  dreamMakerSimConfig: DreamMakerSimConfig;
  dreamMakerClaimedMissions: number[];
  dreamMakerInteractiveResult: DreamMakerSimResult | null;

  // MinigameCCGPlanner
  minigameCCGConfig: CcgRunInput[]; // New

  cardMatchSimConfig: CardMatchSimConifg | null;

  // TotalRewardPlanner
  totalRewardCurrentAmount: number;
  totalRewardTargetAmount: number;
}

interface EventPlanStoreState {
  plans: Record<string, Partial<EventPlan>>; // eventId as key

  updatePlan: (eventId: number, newPlanData: Partial<EventPlan>) => void;

  setSelectedStudents: (eventId: number, studentIds: string[]) => void;
  setOwnedCurrency: (eventId: number, currency: Record<number, number>) => void;
  setPurchaseCounts: (eventId: number, counts: Record<number, number>) => void;
  setAlreadyPurchasedCounts: (eventId: number, counts: Record<number, number>) => void;
  setRunCounts: (eventId: number, counts: Record<number, number>) => void;
  setFirstClears: (eventId: number, clears: Record<number, boolean>) => void;
  setStagePrio: (eventId: number, prio: Record<number, StagePrio>) => void;
  setCompletedMissions: (eventId: number, missions: Set<number>) => void;
  setDurationDays: (eventId: number, days: number) => void;
  setApConfig: (eventId: number, config: ApCalculatorConfig) => void;

  // --- Minigame Actions (Existing) ---
  setFinalCardFlips: (eventId: number, flips: number) => void;
  setTreasureStartRound: (eventId: number, round: number) => void;
  setTreasureEndRound: (eventId: number, round: number) => void;
  setBoxGachaStartBox: (eventId: number, box: number) => void;
  setBoxGachaEndBox: (eventId: number, box: number) => void;
  setCustomGamePlays: (eventId: number, plays: number) => void;

  // --- Minigame Actions (New) ---
  setBoxGachaFinalTotalBoxes: (eventId: number, boxes: number) => void;
  setCardShopConfig: (eventId: number, config: CardShopConfig) => void;
  setCustomGameCost: (eventId: number, cost: CustomGameItem | null) => void;
  setCustomGameRewards: (eventId: number, rewards: CustomGameItem[]) => void;
  setCustomGameOneTimeRewards: (eventId: number, rewards: CustomGameItem[]) => void;
  setDiceRaceSimConfig: (eventId: number, config: DiceRaceSimConfig) => void;
  setFortuneGachaSimRuns: (eventId: number, runs: number) => void;
  setFortuneGachaFinalPulls: (eventId: number, pulls: number) => void;
  setFortuneGachaAvgRates: (eventId: number, rates: FortuneGachaAvgRates | null) => void;
  setTreasureSimConfig: (eventId: number, config: TreasureSimConfig) => void;
  setTreasureFinalTotalRounds: (eventId: number, rounds: number) => void;
  setDreamMakerSimConfig: (eventId: number, config: DreamMakerSimConfig) => void;
  setDreamMakerClaimedMissions: (eventId: number, missions: number[]) => void;
  setDreamMakerInteractiveResult: (eventId: number, result: DreamMakerSimResult | null) => void;
  setMinigameCCGConfig: (eventId: number, config: CcgRunInput[]) => void;
  setMinigameMissionStatus: (eventId: number, status: Record<number, boolean>) => void;
  setCardMatchSimConfig: (eventId: number, result: CardMatchSimConifg | null) => void;

  setTotalRewardCurrentAmount: (eventId: number, amount: number) => void;
  setTotalRewardTargetAmount: (eventId: number, amount: number) => void;

  // Action to reset all plans (for data import/export)
  resetAllPlans: (allPlans: Record<string, EventPlan>) => void;
}

// --- Default Values ---

const defaultPlan: EventPlan = {
  selectedStudents: [],
  ownedCurrency: {},
  purchaseCounts: {},
  alreadyPurchasedCounts: {},
  runCounts: {},
  firstClears: {},
  stagePrio: {},
  completedMissions: [],
  durationDays: 15,
  apConfig: getDefaultApConfig('', ''),

  // Minigame Defaults
  finalCardFlips: 0,

  // TreasurePlanner
  treasureStartRound: 1,
  treasureEndRound: 0,
  treasureFinalTotalRounds: 0,
  treasureSimConfig: DefaultTreasureSimConfig,

  // BoxGachaPlanner
  boxGachaStartBox: 1,
  boxGachaEndBox: 0,
  boxGachaFinalTotalBoxes: 0,

  // CustomGamePlanner
  customGamePlays: 0,
  customGameCost: null,
  customGameRewards: [],
  customGameOneTimeRewards: [],

  // CardShopPlanner
  cardShopConfig: { rounds: 5000, strategy: 'sr-reset' },

  // DiceRacePlanner
  diceRaceSimConfig: DefaultDiceRaceSimConfig,

  // FortuneGachaPlanner
  fortuneGachaSimRuns: 10000,
  fortuneGachaFinalPulls: 0,
  fortuneGachaAvgRates: null,

  // DreamMakerPlanner defaults
  dreamMakerSimConfig: defaultDreamMakerConfig,
  dreamMakerClaimedMissions: [],
  dreamMakerInteractiveResult: null,

  // MinigameCCGPlanner Default
  minigameCCGConfig: [{ id: 'initial', stage: 21, count: 0 }],
  minigameMissionStatus: {},

  cardMatchSimConfig: defaultCardMatchSimConfig,

  // totalRewardPlanner
  totalRewardCurrentAmount: 0,
  totalRewardTargetAmount: 0,
};

export const useEventPlanStore = create<EventPlanStoreState>()(
  persist(
    (set, get) => {
      const updatePlanForEvent = (eventId: number, newPlanData: Partial<EventPlan>) => {
        const currentPlans = get().plans;
        const currentEventPlan = currentPlans[eventId] || defaultPlan;
        set({
          plans: {
            ...currentPlans,
            [eventId]: { ...currentEventPlan, ...newPlanData },
          },
        });
      };

      return {
        plans: {},
        updatePlan: updatePlanForEvent,

        setSelectedStudents: (eventId, studentIds) => updatePlanForEvent(eventId, { selectedStudents: studentIds }),
        setOwnedCurrency: (eventId, currency) => updatePlanForEvent(eventId, { ownedCurrency: currency }),
        setPurchaseCounts: (eventId, counts) => updatePlanForEvent(eventId, { purchaseCounts: counts }),
        setAlreadyPurchasedCounts: (eventId, counts) => updatePlanForEvent(eventId, { alreadyPurchasedCounts: counts }),
        setRunCounts: (eventId, counts) => updatePlanForEvent(eventId, { runCounts: counts }),
        setFirstClears: (eventId, clears) => updatePlanForEvent(eventId, { firstClears: clears }),
        setStagePrio: (eventId, prio) => updatePlanForEvent(eventId, { stagePrio: prio }),
        setCompletedMissions: (eventId, missions) =>
          updatePlanForEvent(eventId, {
            completedMissions: Array.from(missions),
          }),
        setDurationDays: (eventId, days) => updatePlanForEvent(eventId, { durationDays: days }),
        setApConfig: (eventId, config) => updatePlanForEvent(eventId, { apConfig: config }),
        setFinalCardFlips: (eventId, flips) => updatePlanForEvent(eventId, { finalCardFlips: flips }),

        setTreasureStartRound: (eventId, round) => updatePlanForEvent(eventId, { treasureStartRound: round }),
        setTreasureEndRound: (eventId, round) => updatePlanForEvent(eventId, { treasureEndRound: round }),
        setBoxGachaStartBox: (eventId, box) => updatePlanForEvent(eventId, { boxGachaStartBox: box }),
        setBoxGachaEndBox: (eventId, box) => updatePlanForEvent(eventId, { boxGachaEndBox: box }),
        setCustomGamePlays: (eventId, plays) => updatePlanForEvent(eventId, { customGamePlays: plays }),

        // --- Minigame Actions (New) ---
        setBoxGachaFinalTotalBoxes: (eventId, boxes) => updatePlanForEvent(eventId, { boxGachaFinalTotalBoxes: boxes }),
        setCardShopConfig: (eventId, config) => updatePlanForEvent(eventId, { cardShopConfig: config }),
        setCustomGameCost: (eventId, cost) => updatePlanForEvent(eventId, { customGameCost: cost }),
        setCustomGameRewards: (eventId, rewards) => updatePlanForEvent(eventId, { customGameRewards: rewards }),
        setCustomGameOneTimeRewards: (eventId, rewards) => updatePlanForEvent(eventId, { customGameOneTimeRewards: rewards }),
        setDiceRaceSimConfig: (eventId, config) => updatePlanForEvent(eventId, { diceRaceSimConfig: config }),
        setFortuneGachaSimRuns: (eventId, runs) => updatePlanForEvent(eventId, { fortuneGachaSimRuns: runs }),
        setFortuneGachaFinalPulls: (eventId, pulls) => updatePlanForEvent(eventId, { fortuneGachaFinalPulls: pulls }),
        setFortuneGachaAvgRates: (eventId, rates) => updatePlanForEvent(eventId, { fortuneGachaAvgRates: rates }),
        setTreasureSimConfig: (eventId, config) => updatePlanForEvent(eventId, { treasureSimConfig: config }),
        setTreasureFinalTotalRounds: (eventId, rounds) => updatePlanForEvent(eventId, { treasureFinalTotalRounds: rounds }),
        setDreamMakerSimConfig: (eventId, config) => updatePlanForEvent(eventId, { dreamMakerSimConfig: config }),
        setDreamMakerClaimedMissions: (eventId, missions) => updatePlanForEvent(eventId, { dreamMakerClaimedMissions: missions }),
        setDreamMakerInteractiveResult: (eventId, result) => updatePlanForEvent(eventId, { dreamMakerInteractiveResult: result }),
        setCardMatchSimConfig: (eventId, result) => updatePlanForEvent(eventId, { cardMatchSimConfig: result }),
        setTotalRewardCurrentAmount: (eventId, amount) => updatePlanForEvent(eventId, { totalRewardCurrentAmount: amount }),
        setTotalRewardTargetAmount: (eventId, amount) => updatePlanForEvent(eventId, { totalRewardTargetAmount: amount }),
        setMinigameCCGConfig: (eventId, config) => updatePlanForEvent(eventId, { minigameCCGConfig: config }),
        setMinigameMissionStatus: (eventId, status) => updatePlanForEvent(eventId, { minigameMissionStatus: status }),

        resetAllPlans: (allPlans) => set({ plans: allPlans }),
      };
    },
    {
      name: 'event-plans-v2',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// Custom hooks for easy use of eventId's plans
export const usePlanForEvent = (eventId: number) => {
  const plan = useEventPlanStore((state) => state.plans[eventId || ''] || defaultPlan);

  const actions = useEventPlanStore((state) => state);

  const completedMissionsSet = useMemo(() => new Set(plan.completedMissions || []), [plan.completedMissions]);
  const setCompletedMissions = useCallback(
    (missions: Set<number>) => {
      if (eventId) actions.setCompletedMissions(eventId, missions);
    },
    [actions, eventId],
  );

  const setters = {
    setSelectedStudents: (data: string[]) => eventId && actions.setSelectedStudents(eventId, data),
    setOwnedCurrency: (updater: (prev: Record<number, number>) => Record<number, number>) => {
      if (eventId) actions.setOwnedCurrency(eventId, updater(plan.ownedCurrency || {}));
    },
    setPurchaseCounts: (updater: (prev: Record<number, number>) => Record<number, number>) => {
      if (eventId) actions.setPurchaseCounts(eventId, updater(plan.purchaseCounts || {}));
    },
    setAlreadyPurchasedCounts: (updater: (prev: Record<number, number>) => Record<number, number>) => {
      if (eventId) actions.setAlreadyPurchasedCounts(eventId, updater(plan.alreadyPurchasedCounts || {}));
    },
    setRunCounts: (updater: (prev: Record<number, number>) => Record<number, number>) => {
      if (eventId) actions.setRunCounts(eventId, updater(plan.runCounts || {}));
    },
    setFirstClears: (updater: (prev: Record<number, boolean>) => Record<number, boolean>) => {
      if (eventId) actions.setFirstClears(eventId, updater(plan.firstClears || {}));
    },
    setStagePrio: (updater: (prev: Record<number, StagePrio>) => Record<number, StagePrio>) => {
      if (eventId) actions.setStagePrio(eventId, updater(plan.stagePrio || {}));
    },
    setDurationDays: (days: number) => eventId && actions.setDurationDays(eventId, days),
    setApConfig: (config: ApCalculatorConfig) => eventId && actions.setApConfig(eventId, config),
    setFinalCardFlips: (flips: number) => eventId && actions.setFinalCardFlips(eventId, flips),
    setTreasureStartRound: (round: number) => eventId && actions.setTreasureStartRound(eventId, round),
    setTreasureEndRound: (round: number) => eventId && actions.setTreasureEndRound(eventId, round),
    setBoxGachaStartBox: (box: number) => eventId && actions.setBoxGachaStartBox(eventId, box),
    setBoxGachaEndBox: (box: number) => eventId && actions.setBoxGachaEndBox(eventId, box),
    setCustomGamePlays: (plays: number) => eventId && actions.setCustomGamePlays(eventId, plays),

    // Minigame Setters (New)
    setBoxGachaFinalTotalBoxes: (boxes: number) => eventId && actions.setBoxGachaFinalTotalBoxes(eventId, boxes),
    setCardShopConfig: (config: CardShopConfig) => eventId && actions.setCardShopConfig(eventId, config),
    setCustomGameCost: (cost: CustomGameItem | null) => eventId && actions.setCustomGameCost(eventId, cost),
    setCustomGameRewards: (rewards: CustomGameItem[]) => eventId && actions.setCustomGameRewards(eventId, rewards),
    setCustomGameOneTimeRewards: (rewards: CustomGameItem[]) => eventId && actions.setCustomGameOneTimeRewards(eventId, rewards),
    //  setDiceRaceSimConfig: (config: DiceRaceSimConfig) => eventId && actions.setDiceRaceSimConfig(eventId, config), // simplified setter
    setDiceRaceSimConfig: (updater: (prev: DiceRaceSimConfig) => DiceRaceSimConfig) => {
      if (eventId) actions.setDiceRaceSimConfig(eventId, updater(plan.diceRaceSimConfig || DefaultDiceRaceSimConfig));
    },
    setFortuneGachaSimRuns: (runs: number) => eventId && actions.setFortuneGachaSimRuns(eventId, runs),
    setFortuneGachaFinalPulls: (pulls: number) => eventId && actions.setFortuneGachaFinalPulls(eventId, pulls),
    setFortuneGachaAvgRates: (rates: FortuneGachaAvgRates | null) => eventId && actions.setFortuneGachaAvgRates(eventId, rates),
    // setTreasureSimConfig: (config: TreasureSimConfig) => eventId && actions.setTreasureSimConfig(eventId, config),
    setTreasureSimConfig: (updater: (prev: TreasureSimConfig) => TreasureSimConfig) => {
      if (eventId) actions.setTreasureSimConfig(eventId, updater(plan.treasureSimConfig || DefaultTreasureSimConfig));
    },
    setTreasureFinalTotalRounds: (rounds: number) => eventId && actions.setTreasureFinalTotalRounds(eventId, rounds),
    setDreamMakerSimConfig: (updater: (prev: DreamMakerSimConfig) => DreamMakerSimConfig) => {
      if (eventId) actions.setDreamMakerSimConfig(eventId, updater(plan.dreamMakerSimConfig || defaultDreamMakerConfig));
    },
    setDreamMakerInteractiveResult: (result: DreamMakerSimResult | null) => {
      if (eventId) actions.setDreamMakerInteractiveResult(eventId, result);
    },
    setDreamMakerClaimedMissions: (missions: number[]) => {
      if (eventId) actions.setDreamMakerClaimedMissions(eventId, missions);
    },
    setCardMatchSimConfig: (result: CardMatchSimConifg | null) => {
      if (eventId) actions.setCardMatchSimConfig(eventId, result);
    },
    setTotalRewardCurrentAmount: (amount: number) => eventId && actions.setTotalRewardCurrentAmount(eventId, amount),
    setTotalRewardTargetAmount: (amount: number) => eventId && actions.setTotalRewardTargetAmount(eventId, amount),
    // setMinigameCCGConfig: (updater: (prev: CcgRunInput[]) => CcgRunInput[]) => {
    //   if (eventId) actions.setMinigameCCGConfig(eventId, updater(plan.minigameCCGConfig || defaultPlan.minigameCCGConfig));
    // },
    setMinigameCCGConfig: (config: CcgRunInput[]) => {
      if (eventId) actions.setMinigameCCGConfig(eventId, config);
    },
    setMinigameMissionStatus: (status: Record<number, boolean>) => {
      if (eventId) actions.setMinigameMissionStatus(eventId, status);
    },
  };

  return {
    plan,
    ...plan,
    ...setters,
    completedMissionsSet,
    setCompletedMissions,
  };
};
