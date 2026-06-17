// app/store/planner/useSettingsStore.ts
import { create } from 'zustand';
import type { SimulationResult as CardSimulationResult } from '~/components/planner/minigame/CardShopPlanner';
import type { FarmingTab } from '~/components/planner/FarmingPlanner';
import type { DiceRaceTab } from '~/components/planner/minigame/DiceRacePlanner';
import type { AvgPtDisplayMode, DreamMakerResult, DreamMakerSimResult, DreamMakerTab } from '~/components/planner/minigame/dreamMaker/type';
import type { CardMatchResult, CardMatchTab, CardMatchViewMode } from '~/components/planner/minigame/CardMatchPlanner';
import type { ClueSearchResult, ClueSearchTab } from '~/components/planner/minigame/ClueSearchPlanner';
import type { FieldEventResult, FieldEventTab } from '~/components/planner/minigame/FieldEventPlanner';

interface EventSettings {
  // FarmingPlanner.tsx
  showOneTimeRewards: boolean;
  farmingActiveTab: FarmingTab;
  minimizeRepeatableInfo: boolean;

  // ShopPlanner.tsx
  shopDisplayUnit: 'currency' | 'ap';
  shopActiveTab: string | null;

  // CardShopPlanner.tsx
  cardSimResult: CardSimulationResult | null;

  // TreasurePlanner.tsx
  treasureSimResult: Record<number, number> | null;

  // DiceRacePlanner.tsx
  diceRaceActiveTab: DiceRaceTab;
  diceRaceSimResult: {
    avgCost: Record<string, number>;
    avgRewards: Record<string, number>;
    avgRolls: number;
  } | null;

  // DreamMakerPlanner
  dreamMakerActiveTab: DreamMakerTab;
  dreamMakerSimResult: DreamMakerSimResult | null;
  dreamMakerResult: DreamMakerResult | null;
  dreamMakerInteractiveResult: DreamMakerSimResult | null; // Direct Play Results
  dreamMakerAvgPtDisplayMode: AvgPtDisplayMode;
  dreamMakerShowInteractiveSim: boolean;

  cardMatchActiveTab: CardMatchTab;
  cardMatchViewMode: CardMatchViewMode;
  cardMatchDisplayResult: CardMatchResult | null;

  // ClueSearchPlanner.tsx
  clueSearchActiveTab: ClueSearchTab;
  clueSearchDisplayResult: ClueSearchResult | null;

  // FieldEventPlanner.tsx
  fieldEventActiveTab: FieldEventTab;
  fieldEventDisplayResult: FieldEventResult | null;
}

// Store Status Type
interface SettingsState {
  // Map with eventId as key and event setting as value
  settings: Record<string, EventSettings>;

  // Defaults for State Initialization
  // Used during initialization by the component.
  getDefaultSettings: () => EventSettings;

  // Action
  // Functions that get or update the status of the eventId
  getSettings: (eventId: number) => EventSettings;

  // Status update (partial update)
  updateSettings: (eventId: number, partialState: Partial<EventSettings>) => void;

  setFarmingActiveTab: (eventId: number, tab: FarmingTab) => void;
  setShowOneTimeRewards: (eventId: number, show: boolean) => void;
  setMinimizeRepeatableInfo: (eventId: number, show: boolean) => void;

  // Regarding ShopPlanner
  setShopActiveTab: (eventId: number, tab: string | null) => void;
  setShopDisplayUnit: (eventId: number, displayUnit: 'currency' | 'ap') => void;

  // Regarding CardShopPlanner
  setCardSimResult: (eventId: number, result: CardSimulationResult | null) => void;

  // Regarding TreasurePlanner
  setTreasureSimResult: (eventId: number, result: Record<number, number> | null) => void;

  // Regarding DiceRacePlanner
  setDiceRaceActiveTab: (eventId: number, tab: DiceRaceTab) => void;
  setDiceRaceSimResult: (eventId: number, result: EventSettings['diceRaceSimResult']) => void;

  setDreamMakerActiveTab: (eventId: number, tab: DreamMakerTab) => void;
  setDreamMakerSimResult: (eventId: number, result: DreamMakerSimResult | null) => void;
  setDreamMakerResult: (eventId: number, result: DreamMakerResult | null) => void;
  setDreamMakerAvgPtDisplayMode: (eventId: number, mode: AvgPtDisplayMode) => void;
  setDreamMakerShowInteractiveSim: (eventId: number, show: boolean) => void;

  setCardMatchActiveTab: (eventId: number, tab: CardMatchTab) => void;
  setCardMatchViewMode: (eventId: number, mode: CardMatchViewMode) => void;
  setCardMatchDisplayResult: (eventId: number, result: CardMatchResult | null) => void;

  setClueSearchActiveTab: (eventId: number, tab: ClueSearchTab) => void;
  setClueSearchDisplayResult: (eventId: number, result: ClueSearchResult | null) => void;

  setFieldEventActiveTab: (eventId: number, tab: FieldEventTab) => void;
  setFieldEventDisplayResult: (eventId: number, result: FieldEventResult | null) => void;
}

const initialSettings: EventSettings = {
  shopDisplayUnit: 'currency',
  showOneTimeRewards: true,
  minimizeRepeatableInfo: true,
  farmingActiveTab: 'repeatable',
  shopActiveTab: null,
  cardSimResult: null,
  treasureSimResult: null,
  diceRaceActiveTab: 'overview',
  diceRaceSimResult: null,
  // diceRaceFinalRolls: 0,
  dreamMakerActiveTab: 'overview',
  dreamMakerSimResult: null,
  dreamMakerResult: null,
  dreamMakerInteractiveResult: null,
  dreamMakerAvgPtDisplayMode: 'per_day',
  dreamMakerShowInteractiveSim: false,
  cardMatchActiveTab: 'simulation',
  cardMatchViewMode: 'total',
  cardMatchDisplayResult: null,
  clueSearchActiveTab: 'info',
  clueSearchDisplayResult: null,
  fieldEventActiveTab: 'quest',
  fieldEventDisplayResult: null,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},

  getDefaultSettings: () => initialSettings,

  getSettings: (eventId) => {
    // Returns default values if no settings are saved in the eventId
    return get().settings[eventId] || initialSettings;
  },

  updateSettings: (eventId, partialState) => {
    set((state) => ({
      settings: {
        ...state.settings,
        [eventId]: {
          // Merge Existing State + Default + Merge New Partial State
          ...initialSettings,
          ...state.settings[eventId],
          ...partialState,
        },
      },
    }));
  },

  // related FarmingPlanner
  setFarmingActiveTab: (eventId, tab) => {
    get().updateSettings(eventId, { farmingActiveTab: tab });
  },

  setShowOneTimeRewards: (eventId, show) => {
    get().updateSettings(eventId, { showOneTimeRewards: show });
  },
  setMinimizeRepeatableInfo: (eventId, show) => {
    get().updateSettings(eventId, { minimizeRepeatableInfo: show });
  },

  // related ShopPlanner
  setShopActiveTab: (eventId, tab) => {
    get().updateSettings(eventId, { shopActiveTab: tab });
  },

  setShopDisplayUnit: (eventId, displayUnit) => {
    get().updateSettings(eventId, { shopDisplayUnit: displayUnit });
  },

  // related CardShopPlanner
  setCardSimResult: (eventId, result) => {
    get().updateSettings(eventId, { cardSimResult: result });
  },

  // related TreasurePlanner
  setTreasureSimResult: (eventId, result) => {
    get().updateSettings(eventId, { treasureSimResult: result });
  },

  // related DiceRacePlanner
  setDiceRaceActiveTab: (eventId, tab) => {
    get().updateSettings(eventId, { diceRaceActiveTab: tab });
  },
  setDiceRaceSimResult: (eventId, result) => {
    get().updateSettings(eventId, { diceRaceSimResult: result });
  },

  setDreamMakerActiveTab: (eventId, tab) => get().updateSettings(eventId, { dreamMakerActiveTab: tab }),
  setDreamMakerSimResult: (eventId, result) => get().updateSettings(eventId, { dreamMakerSimResult: result }),
  setDreamMakerResult: (eventId, result) => get().updateSettings(eventId, { dreamMakerResult: result }),
  setDreamMakerAvgPtDisplayMode: (eventId, mode) => get().updateSettings(eventId, { dreamMakerAvgPtDisplayMode: mode }),
  setDreamMakerShowInteractiveSim: (eventId, show) => get().updateSettings(eventId, { dreamMakerShowInteractiveSim: show }),

  setCardMatchActiveTab: (eventId, tab) => get().updateSettings(eventId, { cardMatchActiveTab: tab }),
  setCardMatchViewMode: (eventId, mode) => get().updateSettings(eventId, { cardMatchViewMode: mode }),
  setCardMatchDisplayResult: (eventId, result) => get().updateSettings(eventId, { cardMatchDisplayResult: result }),

  setClueSearchActiveTab: (eventId, tab) => get().updateSettings(eventId, { clueSearchActiveTab: tab }),
  setClueSearchDisplayResult: (eventId, result) => get().updateSettings(eventId, { clueSearchDisplayResult: result }),

  setFieldEventActiveTab: (eventId, tab) => get().updateSettings(eventId, { fieldEventActiveTab: tab }),
  setFieldEventDisplayResult: (eventId, result) => get().updateSettings(eventId, { fieldEventDisplayResult: result }),
}));

export const useEventSettings = (eventId: number) => {
  // Get the entire store (not to follow Zustand's selector pattern)
  const store = useSettingsStore();

  // 1. Status: Gets the current setting status of the eventId (reflects the latest status on each rendering)
  const settings: EventSettings = useSettingsStore((state) => state.getSettings(eventId));

  // 2. Action: Create an easy-to-use action object in a component with eventId injected.
  //     can use use Callback or useMemo to prevent the regeneration of action objects.
  const actions = {
    // FarmingPlanner
    setFarmingActiveTab: (tab: FarmingTab) => {
      store.setFarmingActiveTab(eventId, tab);
    },
    setShowOneTimeRewards: (show: boolean) => {
      store.setShowOneTimeRewards(eventId, show);
    },
    setMinimizeRepeatableInfo: (show: boolean) => {
      store.setMinimizeRepeatableInfo(eventId, show);
    },

    // ShopPlanner
    setShopActiveTab: (tab: string | null) => {
      store.setShopActiveTab(eventId, tab);
    },

    setShopDisplayUnit: (displayUnit: 'currency' | 'ap') => {
      store.setShopDisplayUnit(eventId, displayUnit);
    },

    // CardShopPlanner
    setCardSimResult: (result: CardSimulationResult | null) => {
      store.setCardSimResult(eventId, result);
    },

    // TreasurePlanner
    setTreasureSimResult: (result: Record<number, number> | null) => {
      store.setTreasureSimResult(eventId, result);
    },

    // DiceRacePlanner
    setDiceRaceActiveTab: (tab: DiceRaceTab) => {
      store.setDiceRaceActiveTab(eventId, tab);
    },
    setDiceRaceSimResult: (result: EventSettings['diceRaceSimResult']) => {
      store.setDiceRaceSimResult(eventId, result);
    },

    setDreamMakerActiveTab: (tab: DreamMakerTab) => store.setDreamMakerActiveTab(eventId, tab),
    setDreamMakerSimResult: (result: DreamMakerSimResult | null) => store.setDreamMakerSimResult(eventId, result),
    setDreamMakerResult: (result: DreamMakerResult | null) => store.setDreamMakerResult(eventId, result),
    setDreamMakerAvgPtDisplayMode: (mode: AvgPtDisplayMode) => store.setDreamMakerAvgPtDisplayMode(eventId, mode),
    setDreamMakerShowInteractiveSim: (show: boolean) => store.setDreamMakerShowInteractiveSim(eventId, show),

    setCardMatchActiveTab: (tab: CardMatchTab) => store.setCardMatchActiveTab(eventId, tab),
    setCardMatchViewMode: (mode: CardMatchViewMode) => store.setCardMatchViewMode(eventId, mode),
    setCardMatchDisplayResult: (result: CardMatchResult | null) => store.setCardMatchDisplayResult(eventId, result),

    setClueSearchActiveTab: (tab: ClueSearchTab) => store.setClueSearchActiveTab(eventId, tab),
    setClueSearchDisplayResult: (result: ClueSearchResult | null) => store.setClueSearchDisplayResult(eventId, result),

    setFieldEventActiveTab: (tab: FieldEventTab) => store.setFieldEventActiveTab(eventId, tab),
    setFieldEventDisplayResult: (result: FieldEventResult | null) => store.setFieldEventDisplayResult(eventId, result),
  };

  return {
    ...settings, // Current status value (e.g: farmingActiveTab, showOneTimeRewards ...)
    ...actions, // Action function injected with eventId, (e.g: setFarmingActiveTab, setShopActiveTab ...)
  };
};
