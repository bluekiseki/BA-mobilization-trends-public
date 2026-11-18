import { useEffect, useMemo, useRef, useState } from 'react';
import { getAllStages } from '../../../utils/missionDescription';
import { computeAcquiredItems } from '../logic/acquiredItems';
import { useTranslation } from 'react-i18next';
import type { EventData, IconData, StudentData } from '~/types/plannerData';
import { ApCalculator } from '~/features/event-planner/components/ApCalculator';
import { BonusSelector } from '~/features/event-planner/components/BonusSelector';
import type { TotalBonusMap } from '~/features/event-planner/types';
import { FloatingCurrencyStatus } from '~/features/event-planner/components/FloatingCurrencyStatus';
import { CurrencyStatus } from '~/features/event-planner/components/CurrencyStatus';
import ExportImportPanel from '~/components/common/ExportImportPanel';
import { FarmingPlanner } from '~/features/event-planner/components/FarmingPlanner';
import type { FarmingResult } from '~/features/event-planner/components/FarmingPlannerTypes';
import { BoxGachaPlanner } from '~/features/event-planner/minigames/BoxGachaPlanner';
import type { BoxGachaResult } from '~/types/minigame/boxGacha';
import { CardShopPlanner } from '~/features/event-planner/minigames/CardShopPlanner';
import type { CardShopRates } from '~/types/minigame/cardShop';
import { CustomGamePlanner } from '~/features/event-planner/minigames/CustomGamePlanner';
import type { CustomGameResult } from '~/types/minigame/customGame';
import { DiceRacePlanner } from '~/features/event-planner/minigames/DiceRacePlanner';
import type { DiceRaceResult } from '~/types/minigame/diceRace';
import { FortuneGachaPlanner } from '~/features/event-planner/minigames/FortuneGachaPlanner';
import type { FortuneGachaResult } from '~/types/minigame/fortuneGacha';
import { TreasurePlanner } from '~/features/event-planner/minigames/TreasurePlanner';
import type { TreasureResult } from '~/types/minigame/treasure';
import { MissionPlanner } from '~/features/event-planner/components/MissionPlanner';
import type { MissionResult } from '~/features/event-planner/types';
import { ShopPlanner } from '~/features/event-planner/components/ShopPlanner';
import type { ShopResult } from '~/features/event-planner/types';
import { StudentGrowthPlanner } from '~/features/event-planner/components/StudentGrowthPlanner';
import { TotalBonusDisplay } from '~/features/event-planner/components/TotalBonusDisplay';
import { TotalRewardPlanner } from '~/features/event-planner/components/TotalRewardPlanner';
import type { TotalRewardResult } from '~/features/event-planner/types';
import { DreamMakerPlanner } from '~/features/event-planner/minigames/MinigameDreamPlanner';
import type { DreamMakerResult } from '~/features/event-planner/minigames/dreamMaker/type';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { computeDailyAp } from '~/features/event-planner/logic/apDaily';
import { resolveApConfig } from '~/utils/ApCalculatorConfig';
import { CardMatchPlanner } from '~/features/event-planner/minigames/CardMatchPlanner';
import type { CardMatchResult } from '~/types/minigame/cardMatch';
import { MinigameCCGPlanner } from '../minigames/MinigameCCGPlanner';
import type { MinigameCCGResult } from '../../../types/minigame/ccg';
import { MinigameDefensePlanner } from '../minigames/MinigameDefensePlanner';
import type { MinigameDefenseResult } from '../../../types/minigame/defense';
import { ClueSearchPlanner } from '../minigames/ClueSearchPlanner';
import type { ClueSearchResult } from '~/types/minigame/clueSearch';
import { FieldEventPlanner } from '../minigames/FieldEventPlanner';
import type { FieldEventResult } from '~/types/minigame/fieldEvent';
import { InteractiveWorldRaidPlanner } from '../minigames/InteractiveWorldRaidPlanner';
import type { InteractiveWorldRaidResult } from '../../../types/minigame/interactiveWorldRaid';
import { RoadPuzzlePlanner } from '../minigames/RoadPuzzlePlanner';
import type { RoadPuzzleResult } from '../../../types/minigame/roadPuzzle';
import { MinigameJankenPlanner } from '../minigames/MinigameJankenPlanner';
import type { MinigameJankenResult } from '../../../types/minigame/janken';
import { MinigameTankPlanner } from '../minigames/MinigameTankPlanner';
import type { MinigameTankResult } from '../../../types/minigame/tank';
import { LocationPlanner } from '../minigames/LocationPlanner';
import { defaultLocationConfig, locationConfigSchema } from '~/types/minigame/location';
import { calculateLocation, getLocationSpendableCurrency } from '~/features/event-planner/logic/locationPlanner';
import type { WithNonNullable } from '~/utils/WithNonNullable';
import { calcTieredCost } from '~/features/event-planner/logic/shopTieredCost';
import { GrFormNextLink } from 'react-icons/gr';
import { ResourceEfficiencyPanel } from '~/features/event-planner/components/ResourceEfficiencyPanel';
import { hasAnySelectableResourceSource } from '~/features/event-planner/logic/resourceApCost';
import type { MainTabId } from './mainTab';

// --- Type definitions ---
type SubTabId =
  | 'shop'
  | 'growth'
  | 'mission'
  | 'stages'
  | 'custom'
  | 'box'
  | 'card'
  | 'treasure'
  | 'fortune'
  | 'total_reward'
  | 'dice_race'
  | 'minigame_dream'
  | 'minigame_ccg'
  | 'card_match'
  | 'minigame_defence'
  | 'clue_search'
  | 'field_event'
  | 'road_puzzle'
  | 'minigame_janken'
  | 'minigame_tank'
  | 'minigame_location'
  | 'ap_calc'
  | 'currency_input';

// Desktop: Adjust left/right padding since there is a right sidebar
const mainContentClasses = 'flex-1 min-w-0 px-4 sm:px-6 pb-32 pt-6 space-y-8 w-full';

export interface EventPlannerProp {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  allStudents: StudentData;
}

export const EventPlanner = ({ eventId, eventData, iconData, allStudents }: EventPlannerProp) => {
  const { t } = useTranslation(['planner', 'game']);
  const tabNavRef = useRef<HTMLDivElement | null>(null);

  // Farming plan related state
  const [availableAp, setAvailableAp] = useState(0);
  const [farmingResult, setFarmingResult] = useState<FarmingResult | null>(null);

  // Shop plan related state (Moved to EventPage for central management)
  const [shopResult, setShopResult] = useState<ShopResult | null>(null);

  // Card shop flip count state
  const [cardShopRates, setCardShopRates] = useState<CardShopRates | null>(null);
  const [finalCardFlips, setFinalCardFlips] = useState(0);

  // State to store currently owned materials
  const [ownedCurrency, setOwnedCurrency] = useState<Record<number, number>>({});

  // State to store treasure hunt results
  const [treasureResult, setTreasureResult] = useState<TreasureResult | null>(null);

  // state to store FortuneGachaPlanner results
  const [fortuneGachaResult, setFortuneGachaResult] = useState<FortuneGachaResult | null>(null);

  const [diceRaceResult, setDiceRaceResult] = useState<DiceRaceResult | null>(null);

  const [cardMatchResult, setCardMatchResult] = useState<CardMatchResult | null>(null);
  const [clueSearchResult, setClueSearchResult] = useState<ClueSearchResult | null>(null);
  const [fieldEventResult, setFieldEventResult] = useState<FieldEventResult | null>(null);

  const [boxGachaResult, setBoxGachaResult] = useState<BoxGachaResult | null>(null);
  const [customGameResult, setCustomGameResult] = useState<CustomGameResult | null>(null);
  const [dreamMakerResult, setDreamMakerResult] = useState<DreamMakerResult | null>(null);
  const [minigameCCGResult, setMinigameCCGResult] = useState<MinigameCCGResult | null>(null);
  const [minigameDefenseResult, setMinigameDefenseResult] = useState<MinigameDefenseResult | null>(null);
  const [interactiveWorldRaidResult, setInteractiveWorldRaidResult] = useState<InteractiveWorldRaidResult | null>(null);
  const [roadPuzzleResult, setRoadPuzzleResult] = useState<RoadPuzzleResult | null>(null);
  const [minigameJankenResult, setMinigameJankenResult] = useState<MinigameJankenResult | null>(null);
  const [minigameTankResult, setMinigameTankResult] = useState<MinigameTankResult | null>(null);

  const [totalRewardResult, setTotalRewardResult] = useState<TotalRewardResult | null>(null);
  const [totalBonus, setTotalBonus] = useState<TotalBonusMap>({});

  // State to receive results from MissionPlanner
  const [missionResult, setMissionResult] = useState<MissionResult | null>(null);

  const [studentGrowthNeeds, setStudentGrowthNeeds] = useState<Record<string, number>>({}); // Student growth requirement state
  // tab

  // Misc
  const { plan: shopPlan, setCachedTotalItems, setLocationConfig } = usePlanForEvent(eventId);
  // Owned AP follows the saved AP calculator settings, so it is known without opening the AP tab.
  useEffect(() => {
    const config = resolveApConfig(shopPlan.apConfig, eventData.season.EventContentOpenTime, eventData.season.EventContentCloseTime || eventData.season.ExtensionTime);
    setAvailableAp(computeDailyAp(config).total);
  }, [shopPlan.apConfig, eventData.season]);
  const locationState = useMemo(() => {
    if (!eventData.location) return null;
    const parsed = locationConfigSchema.safeParse(shopPlan.locationConfig);
    const config = parsed.success ? parsed.data : defaultLocationConfig;
    return { config, result: calculateLocation(eventData.location, config) };
  }, [eventData.location, shopPlan.locationConfig]);
  const { purchaseCounts, alreadyPurchasedCounts } = shopPlan;

  const TABS: {
    id: MainTabId;
    name: string;
    subTabs?: { id: SubTabId; name: string }[];
  }[] = useMemo(() => {
    const allTabs: {
      id: MainTabId;
      name: string;
      subTabs?: { id: SubTabId; name: string }[];
    }[] = [];
    let n = 1;

    if (eventData.bonus) {
      allTabs.push({ id: 'bonus', name: `${n++}. ${t('ui.studentBonus')}` });
    }

    const goalsSubTabs: { id: SubTabId; name: string }[] = [];
    if (eventData.shop) goalsSubTabs.push({ id: 'shop', name: t('common.shop') });
    goalsSubTabs.push({ id: 'growth', name: t('page.studentGrowth') });
    if (eventData.mission) goalsSubTabs.push({ id: 'mission', name: t('page.missionList') });
    if (eventData.total_reward) goalsSubTabs.push({ id: 'total_reward', name: t('label.cumulativeRewards') });
    allTabs.push({ id: 'goals', name: `${n++}. ${t('ui.targetSettings')}`, subTabs: goalsSubTabs });

    if (eventData.interactive_world_raid) {
      allTabs.push({ id: 'interactive_world_raid', name: `${n++}. ${t('interactive_world_raid.title')}` });
    }

    // --- Create sub-tabs by filtering only existing minigames ---
    const minigameSubTabs: { id: SubTabId; name: string }[] = [];
    if (eventData.box_gacha) {
      minigameSubTabs.push({ id: 'box', name: t('box_gacha.title') });
    }
    if (eventData.season.EventContentTypeStr.includes('Treasure')) {
      minigameSubTabs.push({ id: 'treasure', name: t('minigame.treasureHunt') });
    }
    if (eventData.season.EventContentTypeStr.includes('CardShop')) {
      minigameSubTabs.push({ id: 'card', name: t('placeholder.cardGacha') });
    }
    if (eventData.season.EventContentTypeStr.includes('FortuneGachaShop')) {
      minigameSubTabs.push({ id: 'fortune', name: t('minigame.omikuji') });
    }
    if (eventData.dice_race) {
      minigameSubTabs.push({ id: 'dice_race', name: t('minigame.diceRace') });
    }
    if (eventData.minigame_dream) {
      minigameSubTabs.push({ id: 'minigame_dream', name: t('dream_maker.title') });
    }
    if (eventData.minigame_ccg) {
      minigameSubTabs.push({ id: 'minigame_ccg', name: t('minigame.minigame_ccg') });
    }
    if (eventData.concentration) {
      minigameSubTabs.push({ id: 'card_match', name: t('minigame.card_match') });
    }
    if (eventData.minigame_defense) {
      minigameSubTabs.push({ id: 'minigame_defence', name: t('minigame.minigame_defense') });
    }
    if (eventData.clue) {
      minigameSubTabs.push({ id: 'clue_search', name: t('minigame.clue_search') });
    }
    if (eventData.field) {
      minigameSubTabs.push({ id: 'field_event', name: t('field_event.title') });
    }
    if (eventData.minigame_road_puzzle) {
      minigameSubTabs.push({ id: 'road_puzzle', name: t('road_puzzle.title') });
    }
    if (eventData.minigame_janken) {
      minigameSubTabs.push({ id: 'minigame_janken', name: t('minigame_janken.title') });
    }
    if (eventData.minigame_tank) {
      minigameSubTabs.push({ id: 'minigame_tank', name: t('minigame.minigame_tank') });
    }
    if (eventData.location) {
      minigameSubTabs.push({ id: 'minigame_location', name: t('minigame.minigame_location') });
    }
    minigameSubTabs.push({ id: 'custom', name: t('placeholder.customExchange') });

    if (minigameSubTabs.length > 0) {
      allTabs.push({ id: 'minigame', name: `${n++}. ${t('ui.minigame')}`, subTabs: minigameSubTabs });
    }

    allTabs.push({
      id: 'ap',
      name: `${n++}. ${t('ui.apAndCurrencySupply')}`,
      subTabs: [
        { id: 'ap_calc', name: t('ui.apSupply') },
        { id: 'currency_input', name: t('ui.currencyInitialInput') },
      ],
    });

    if (eventData.stage?.stage) {
      allTabs.push({ id: 'farming', name: `${n++}. ${t('ui.farmingRun')}`, subTabs: [{ id: 'stages', name: t('ui.stageFarming') }] });
    }

    // Cheap presence check only — not listSelectableResourceKeys, which runs the full (Monte-Carlo)
    // extraction. Actual computation is deferred to ResourceEfficiencyPanel once the tab opens.
    if (hasAnySelectableResourceSource(eventData)) {
      allTabs.push({ id: 'resource_efficiency', name: `${n++}. ${t('ui.resourceEfficiency')}` });
    }

    return allTabs;
  }, [eventData]);

  const [activeMainTab, setActiveMainTab] = useState<MainTabId>(
    // 'bonus'
    TABS[0].id,
  );
  // const [activeSubTab, setActiveSubTab] = useState<SubTabId | null>(null);
  const [activeSubTabs, setActiveSubTabs] = useState<Partial<Record<MainTabId, SubTabId | null>>>({
    goals: eventData.shop ? 'shop' : 'growth',
    ap: 'ap_calc',
    minigame: null,
    farming: 'stages',
  });

  const mainTabFind = TABS.filter((v) => v.id == activeMainTab)[0];
  const activeSubTab = activeSubTabs[activeMainTab] || mainTabFind.subTabs?.[0]?.id;

  const currentTabIndex = TABS.findIndex((tab) => tab.id === activeMainTab);
  const isLastTab = currentTabIndex === -1 || currentTabIndex === TABS.length - 1;
  let nextTab: { id: MainTabId; name: string } | null = null;
  let nextTabName = '';

  if (!isLastTab) {
    nextTab = TABS[currentTabIndex + 1];
    nextTabName = nextTab.name.replace(/^\d+\.\s*/, ''); // Remove numeric prefixes like "1. ", "2. "
  }

  const allStages = useMemo(() => getAllStages(eventData), [eventData]);

  useEffect(() => {
    const costs: Record<string, number> = {};
    const rewards: Record<string, number> = {};

    if (!purchaseCounts) return;
    const onCalculate = setShopResult;

    Object.entries(purchaseCounts).forEach(([itemIdStr, count]) => {
      if (count <= 0) return;
      if (!eventData.shop) return;
      const itemId = Number(itemIdStr);
      const allItems = Object.values(eventData.shop).flat();
      const itemInfo = allItems.find((i) => i.Id === itemId);

      if (itemInfo && itemInfo.Goods && itemInfo.Goods.length > 0) {
        const goods = itemInfo.Goods[0];
        // Calculate cost (tiered pricing if ConsumeExtraStep/Amount present)
        const alreadyPurchased = alreadyPurchasedCounts?.[itemId] ?? 0;
        const extraStep = goods.ConsumeExtraStep ?? [];
        const extraAmount = goods.ConsumeExtraAmount ?? [];
        const totalCost = calcTieredCost(alreadyPurchased, count, extraStep, extraAmount, goods.ConsumeParcelAmount[0]);
        const costKey = `${goods.ConsumeParcelTypeStr[0]}_${goods.ConsumeParcelId[0]}`;
        costs[costKey] = (costs[costKey] || 0) + totalCost;

        // Calculate reward
        const rewardKey = `${goods.ParcelTypeStr[0]}_${goods.ParcelId[0]}`;
        rewards[rewardKey] = (rewards[rewardKey] || 0) + goods.ParcelAmount[0] * count;
      }
    });

    onCalculate({ costs, rewards });
  }, [purchaseCounts, alreadyPurchasedCounts, eventData, setShopResult]);

  const acquiredItemsResult = useMemo(
    () =>
      computeAcquiredItems({
        finalCardFlips,
        cardShopRates,
        treasureResult,
        boxGachaResult,
        customGameResult,
        farmingResult,
        fortuneGachaResult,
        shopResult,
        totalRewardResult,
        missionResult,
        diceRaceResult,
        dreamMakerResult,
        minigameCCGResult,
        cardMatchResult,
        minigameDefenseResult,
        studentGrowthNeeds,
        clueSearchResult,
        fieldEventResult,
        interactiveWorldRaidResult,
        roadPuzzleResult,
        minigameJankenResult,
        minigameTankResult,
        locationState,
      }),
    [
      finalCardFlips,
      cardShopRates,
      treasureResult,
      boxGachaResult,
      customGameResult,
      farmingResult,
      fortuneGachaResult,
      shopResult,
      totalRewardResult,
      missionResult,
      diceRaceResult,
      dreamMakerResult,
      minigameCCGResult,
      cardMatchResult,
      minigameDefenseResult,
      studentGrowthNeeds,
      clueSearchResult,
      fieldEventResult,
      interactiveWorldRaidResult,
      roadPuzzleResult,
      minigameJankenResult,
      minigameTankResult,
      locationState,
    ],
  );

  const locationAvailableCurrency = useMemo(() => {
    if (!locationState) return 0;
    return getLocationSpendableCurrency(ownedCurrency, acquiredItemsResult.transactions, locationState.result.costKey);
  }, [locationState, ownedCurrency, acquiredItemsResult.transactions]);

  const finalCurrencyBalance = useMemo(() => {
    const balance: Record<string, number> = {};

    // 1. Start with current owned quantity
    for (const [id, amount] of Object.entries(ownedCurrency)) {
      balance[Number(id)] = (balance[Number(id)] || 0) + amount;
    }

    // 2. Sum all acquisition/consumption results
    for (const [key, data] of Object.entries(acquiredItemsResult.totalItems)) {
      const [type, idStr] = key.split('_');
      // Include only materials (Item, Currency) in the balance
      if (type === 'Item' || type === 'Currency') {
        // const id = `${type}_${Number(idStr)}`;
        const id = Number(idStr);
        balance[id] = (balance[id] || 0) + data.amount;
      }
    }
    return balance;
  }, [ownedCurrency, acquiredItemsResult]);

  useEffect(() => {
    const { totalItems } = acquiredItemsResult;
    const gained: Record<string, { amount: number; isBonusApplied: boolean }> = {};
    const spent: Record<string, { amount: number; isBonusApplied: boolean }> = {};
    for (const [key, data] of Object.entries(totalItems)) {
      if (data.amount > 0) gained[key] = data;
      else if (data.amount < 0) spent[key] = { ...data, amount: -data.amount };
    }
    if (Object.keys(gained).length > 0 || Object.keys(spent).length > 0 || availableAp > 0) {
      setCachedTotalItems({ savedAt: Date.now(), gained, spent, availableAp });
    }
  }, [acquiredItemsResult, availableAp]);

  // Mirror the tab selection into the URL hash (#main or #main/sub) without adding history entries
  const writeTabHash = (mainId: MainTabId, subId?: SubTabId | null) => {
    const hash = subId ? `#${mainId}/${subId}` : `#${mainId}`;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
  };

  const handleMainTabClick = (tabId: MainTabId) => {
    setActiveMainTab(tabId);
    const tab = TABS.find((t) => t.id === tabId);
    writeTabHash(tabId, activeSubTabs[tabId] || tab?.subTabs?.[0]?.id);
  };

  const handleSubTabClick = (subId: SubTabId) => {
    setActiveSubTabs((prev) => ({ ...prev, [activeMainTab]: subId }));
    writeTabHash(activeMainTab, subId);
  };

  // Restore the tab from the URL hash after mount (kept out of the initial state to avoid hydration mismatch)
  useEffect(() => {
    const [mainId, subId] = window.location.hash.slice(1).split('/');
    const tab = TABS.find((t) => t.id === mainId);
    if (!tab) return;
    setActiveMainTab(tab.id);
    const sub = tab.subTabs?.find((s) => s.id === subId);
    if (sub) setActiveSubTabs((prev) => ({ ...prev, [tab.id]: sub.id }));
  }, [TABS]);

  return (
    <>
      <div data-component-name="EventPlanner" className="max-w-7xl mx-auto flex flex-col lg:flex-row items-start">
        {/* Mobile Navigation (< lg) */}
        <div ref={tabNavRef} className="lg:hidden z-30 w-full bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 shadow-sm">
          {/* Level 1: Main Tabs (Grid Layout - No Scroll) */}
          <div className="p-2">
            <div data-component-name="EventPlanner_Tab" className="grid grid-cols-3 gap-1">
              {TABS.map((tab) => {
                const isActive = activeMainTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleMainTabClick(tab.id)}
                    className={`
                            py-2 px-1 text-xs font-bold rounded-md transition-all duration-200 border
                            ${isActive ? 'bg-white border-blue-200 text-blue-600 shadow-sm dark:bg-neutral-800 dark:border-blue-900 dark:text-blue-400' : 'bg-transparent border-transparent text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'}
                          `}
                  >
                    {tab.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Level 2: Sub Tabs (Pill wrap) - Only show if exists */}
          {TABS.find((t) => t.id === activeMainTab)?.subTabs && (
            <div className="flex flex-wrap justify-center gap-2 px-4 pb-3 pt-1 bg-neutral-50/50 dark:bg-neutral-800/30 border-t border-neutral-100 dark:border-neutral-800">
              {TABS.find((t) => t.id === activeMainTab)?.subTabs?.map((subTab) => {
                const isActive = activeSubTab === subTab.id;
                return (
                  <button
                    key={subTab.id}
                    onClick={() => handleSubTabClick(subTab.id)}
                    className={`
                            px-3 text-[11px] font-bold transition-all
                            ${isActive ? ' border-b-2 border-blue-200 text-blue-700 dark:text-blue-300' : ' border-neutral-200 text-neutral-500 dark:text-neutral-400'}
                          `}
                  >
                    {subTab.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Main Content Area */}

        <main className={mainContentClasses}>
          <div key={activeMainTab} className="animate-fade-in">
            {/* BONUS TAB */}
            {activeMainTab === 'bonus' && eventData.bonus && eventData.currency && (
              <div className="space-y-8">
                <TotalBonusDisplay eventData={eventData as WithNonNullable<EventData, 'currency' | 'bonus'>} iconData={iconData} totalBonus={totalBonus} allStudents={allStudents} />
                <BonusSelector
                  eventId={eventId}
                  eventData={eventData as WithNonNullable<EventData, 'currency' | 'bonus'>}
                  iconData={iconData}
                  allStudents={allStudents}
                  onBonusCalculate={setTotalBonus}
                />
              </div>
            )}

            {/* GOALS TAB */}
            {activeMainTab === 'goals' && (
              <div className="space-y-8">
                {activeSubTab === 'shop' && eventData.shop && (
                  <ShopPlanner
                    eventId={eventId}
                    eventData={eventData}
                    shop={eventData.shop}
                    iconData={iconData}
                    // onCalculate={setShopResult}
                    allStages={allStages}
                    totalBonus={totalBonus}
                    allStudents={allStudents}
                  />
                )}
                {activeSubTab === 'growth' && <StudentGrowthPlanner eventId={eventId} eventData={eventData} iconData={iconData} allStudents={allStudents} onCalculate={setStudentGrowthNeeds} />}
                {activeSubTab === 'mission' && <MissionPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setMissionResult} />}
                {eventData.total_reward && activeSubTab === 'total_reward' && <TotalRewardPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setTotalRewardResult} />}
              </div>
            )}

            {/* MINIGAME TAB */}
            {activeMainTab === 'minigame' && (
              <div className="space-y-8">
                {activeSubTab === 'treasure' && eventData.season.EventContentTypeStr.includes('Treasure') && (
                  <TreasurePlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setTreasureResult} remainingCurrency={finalCurrencyBalance} />
                )}
                {activeSubTab === 'card' && eventData.season.EventContentTypeStr.includes('CardShop') && (
                  <CardShopPlanner
                    eventId={eventId}
                    eventData={eventData}
                    iconData={iconData}
                    onRatesCalculated={setCardShopRates}
                    rates={cardShopRates}
                    finalCardFlips={finalCardFlips}
                    setFinalCardFlips={setFinalCardFlips}
                    remainingCurrency={finalCurrencyBalance}
                  />
                )}
                {activeSubTab === 'box' && eventData.box_gacha && (
                  <BoxGachaPlanner
                    eventId={eventId}
                    eventData={eventData as WithNonNullable<EventData, 'box_gacha'>}
                    iconData={iconData}
                    onCalculate={setBoxGachaResult}
                    remainingCurrency={finalCurrencyBalance}
                  />
                )}
                {activeSubTab === 'fortune' && eventData.fortune_gacha && (
                  <FortuneGachaPlanner
                    eventId={eventId}
                    eventData={eventData as WithNonNullable<EventData, 'fortune_gacha'>}
                    iconData={iconData}
                    onCalculate={setFortuneGachaResult}
                    remainingCurrency={finalCurrencyBalance}
                  />
                )}
                {activeSubTab === 'dice_race' && eventData.dice_race && eventData.currency && (
                  <DiceRacePlanner
                    eventId={eventId}
                    eventData={eventData as WithNonNullable<EventData, 'currency' | 'dice_race'>}
                    iconData={iconData}
                    onCalculate={setDiceRaceResult} /*remainingCurrency={finalCurrencyBalance}*/
                  />
                )}
                {activeSubTab === 'minigame_dream' && eventData.minigame_dream && (
                  <DreamMakerPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setDreamMakerResult} remainingCurrency={finalCurrencyBalance} totalBonus={totalBonus} />
                )}
                {activeSubTab === 'minigame_ccg' && eventData.minigame_ccg && (
                  <MinigameCCGPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setMinigameCCGResult} remainingCurrency={finalCurrencyBalance} />
                )}
                {activeSubTab === 'minigame_defence' && eventData.minigame_defense && (
                  <MinigameDefensePlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setMinigameDefenseResult} remainingCurrency={finalCurrencyBalance} />
                )}
                {activeSubTab === 'card_match' && eventData.concentration && eventData.currency && (
                  <CardMatchPlanner
                    eventId={eventId}
                    eventData={eventData as WithNonNullable<EventData, 'concentration' | 'currency'>}
                    iconData={iconData}
                    onCalculate={setCardMatchResult}
                    remainingCurrency={finalCurrencyBalance}
                  />
                )}
                {activeSubTab === 'clue_search' && eventData.clue && (
                  <ClueSearchPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setClueSearchResult} remainingCurrency={finalCurrencyBalance} />
                )}
                {activeSubTab === 'field_event' && eventData.currency && eventData.field && (
                  <FieldEventPlanner
                    eventId={eventId}
                    eventData={eventData as WithNonNullable<EventData, 'currency' | 'field'>}
                    iconData={iconData}
                    onCalculate={setFieldEventResult}
                    remainingCurrency={finalCurrencyBalance}
                  />
                )}
                {activeSubTab === 'road_puzzle' && eventData.minigame_road_puzzle && (
                  <RoadPuzzlePlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setRoadPuzzleResult} />
                )}
                {activeSubTab === 'minigame_janken' && eventData.minigame_janken && (
                  <MinigameJankenPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setMinigameJankenResult} remainingCurrency={finalCurrencyBalance} />
                )}
                {activeSubTab === 'minigame_tank' && eventData.minigame_tank && (
                  <MinigameTankPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setMinigameTankResult} remainingCurrency={finalCurrencyBalance} />
                )}
                {activeSubTab === 'minigame_location' && locationState && (
                  <LocationPlanner
                    eventData={eventData}
                    iconData={iconData}
                    config={locationState.config}
                    result={locationState.result}
                    availableCurrency={locationAvailableCurrency}
                    onChange={setLocationConfig}
                  />
                )}
                {activeSubTab === 'custom' && (
                  <CustomGamePlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setCustomGameResult} remainingCurrency={finalCurrencyBalance} />
                )}
              </div>
            )}

            {/* INTERACTIVE WORLD RAID TAB */}
            {activeMainTab === 'interactive_world_raid' && eventData.interactive_world_raid && (
              <InteractiveWorldRaidPlanner eventId={eventId} eventData={eventData} iconData={iconData} onCalculate={setInteractiveWorldRaidResult} remainingCurrency={finalCurrencyBalance} />
            )}

            {/* AP TAB */}
            {activeMainTab === 'ap' && activeSubTab === 'ap_calc' && (
              <ApCalculator
                eventId={eventId}
                startTime={eventData.season.EventContentOpenTime}
                endTime={eventData.season.EventContentCloseTime || eventData.season.ExtensionTime}
                onCalculate={setAvailableAp}
                totalApUsed={acquiredItemsResult.totalApUsed}
                iconData={iconData}
              />
            )}
            {activeMainTab === 'ap' && activeSubTab === 'currency_input' && eventData.currency && (
              <CurrencyStatus
                eventData={eventData as WithNonNullable<EventData, 'currency'>}
                iconData={iconData}
                ownedCurrency={ownedCurrency}
                setOwnedCurrency={setOwnedCurrency}
                remainingCurrency={finalCurrencyBalance}
                defaultEditing={true}
              />
            )}

            {/* FARMING TAB */}
            {activeMainTab === 'farming' && activeSubTab === 'stages' && eventData.currency && eventData.stage && (
              <FarmingPlanner
                eventId={eventId}
                eventData={eventData as WithNonNullable<EventData, 'currency' | 'stage'>}
                iconData={iconData}
                allStages={allStages}
                availableAp={availableAp}
                setAvailableAp={setAvailableAp}
                neededItems={finalCurrencyBalance}
                totalBonus={totalBonus}
                onCalculate={setFarmingResult}
              />
            )}

            {/* RESOURCE EFFICIENCY TAB */}
            {activeMainTab === 'resource_efficiency' && (
              <ResourceEfficiencyPanel
                eventId={eventId}
                eventData={eventData}
                allStages={allStages}
                iconData={iconData}
                allStudents={allStudents}
                availableAp={availableAp}
                totalBonus={totalBonus}
                onNavigateToTab={handleMainTabClick}
              />
            )}

            {/* Next Step Navigation (Bottom) */}
            {!isLastTab && nextTab && (
              <div className="mt-12 flex justify-end">
                <button
                  onClick={() => {
                    const offset = window.innerWidth < 1024 ? 0 : 0;
                    window.scrollTo({ top: offset, behavior: 'smooth' });
                    handleMainTabClick(nextTab.id);
                  }}
                  // group flex items-center gap-2 px-6 py-3
                  //           bg-blue-600 text-white text-sm font-bold rounded-xl shadow-md
                  //           hover:bg-blue-700 active:scale-95 transition-all
                  className="
                            flex items-center justify-center gap-1 py-2.5 text-sm font-bold text-neutral-600 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400 border-t border-neutral-100 dark:border-neutral-700 transition-colors group
                          "
                >
                  <span>{t('ui.continueTo', { tabName: nextTabName })}</span>
                  <span className="group-hover:translate-x-1 transition-transform">
                    <GrFormNextLink />
                  </span>
                </button>
              </div>
            )}

            {/* Export/Import */}
            <div className="mt-8 border-t border-neutral-200">
              <ExportImportPanel />
            </div>
          </div>
        </main>

        {/* Desktop Sidebar Navigation (>= lg) */}

        <div className="hidden lg:block w-64 shrink-0 sticky top-4 self-start pr-4 mt-6 ml-6">
          <nav className="p-4 bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="mb-4 px-2 text-xs font-bold text-neutral-400 uppercase tracking-wider">Menu</div>
            <div data-component-name="EventPlanner_Tab" className="space-y-1">
              {TABS.map((tab) => {
                const isActiveMain = activeMainTab === tab.id;
                return (
                  <div key={tab.id} className="mb-2">
                    {/* Main Tab Button */}
                    <button
                      onClick={() => handleMainTabClick(tab.id)}
                      className={`
                          w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-all flex justify-between items-center
                          ${isActiveMain ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shadow-sm ring-1 ring-blue-100 dark:ring-blue-800' : 'text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-700'}
                        `}
                    >
                      <span>{tab.name}</span>
                      {/* Arrow Icon */}
                      {tab.subTabs && <span className={`text-[10px] transition-transform duration-200 ${isActiveMain ? 'rotate-90 text-blue-500' : 'text-neutral-400'}`}>▶</span>}
                    </button>

                    {/* Sub Tabs List (Expanded if Main is active) */}
                    {isActiveMain && tab.subTabs && (
                      <div className="mt-1 ml-3 pl-3 border-l-2 border-neutral-100 dark:border-neutral-700 space-y-0.5 animate-fade-in">
                        {tab.subTabs.map((subTab) => {
                          const isActiveSub = activeSubTab === subTab.id;
                          return (
                            <button
                              key={subTab.id}
                              onClick={() => handleSubTabClick(subTab.id)}
                              className={`
                                  w-full text-left px-3 py-2 rounded-md text-xs font-medium transition-colors
                                  ${isActiveSub ? 'text-blue-600 bg-blue-50/50 dark:text-blue-400 dark:bg-blue-900/10' : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-300'}
                                `}
                            >
                              {subTab.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>
        </div>
      </div>

      {/* Floating Status Bar (Fixed at Bottom) */}
      {eventData.currency && (
        <FloatingCurrencyStatus
          eventId={eventId}
          eventData={eventData as WithNonNullable<EventData, 'currency'>}
          iconData={iconData}
          ownedCurrency={ownedCurrency}
          setOwnedCurrency={setOwnedCurrency}
          remainingCurrency={finalCurrencyBalance}
          acquiredItemsResult={acquiredItemsResult}
          allStudents={allStudents}
        />
      )}
    </>
  );
};
