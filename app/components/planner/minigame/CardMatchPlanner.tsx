// src/components/event/CardMatchPlanner.tsx

import { useState, useCallback, useEffect, useMemo } from 'react';
import { ItemIcon } from '../common/Icon';
import type { EventData, IconData, ConcentrationReward } from '~/types/plannerData';
import { useTranslation } from 'react-i18next';
import { ChevronIcon } from '~/components/Icon';
import { getItemSortPriority } from '~/utils/itemSort';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { useEventSettings } from '~/store/planner/useSettingsStore';

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export type CardMatchTab = 'simulation' | 'info';
export type CardMatchViewMode = 'total' | 'average';

export type CardMatchResult = {
  totalCosts: Record<string, number>;
  totalRewards: Record<string, number>;
  avgFlipsPerRound: number;
  targetClears: number;
};


export type CardMatchSimConifg = {
  startRound: number;
  targetClears: number;
  simIterations: number;
}

export const defaultCardMatchSimConfig = {
  startRound: 1,
  targetClears: 10,
  simIterations: 2000
}

interface CardMatchPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  onCalculate: (result: CardMatchResult | null) => void;
  remainingCurrency: Record<number, number>;
}

// ----------------------------------------------------------------------
// Logic: Monte Carlo Simulation
// ----------------------------------------------------------------------

function shuffleArray(array: number[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

const simulateAverageFlips = (simCount: number, maxOpenCount: number): number => {
  let totalFlips = 0;

  for (let i = 0; i < simCount; i++) {
    // 1. Initialize deck (2 copies each of cards 0-5, total 12)
    const deck = new Array(12);
    for (let j = 0; j < 6; j++) {
      deck[j * 2] = j;
      deck[j * 2 + 1] = j;
    }
    shuffleArray(deck);

    // 2. State variables
    const knownLocations: Record<number, number> = {};
    const pendingMatches: number[] = [];
    let unknownPool = Array.from({ length: 12 }, (_, k) => k);

    let attempts = 0;
    let matchedPairs = 0;

    while (matchedPairs < 6 && attempts < maxOpenCount) {
      attempts++;

      // Guaranteed match (if pair is already known)
      if (pendingMatches.length > 0) {
        pendingMatches.pop();
        matchedPairs++;
        continue;
      }

      // Optimization strategy (when 4 cards remain)
      // Condition: 2 unknown cards, 2 known cards (halves of different pairs)
      // Explanation: If you flip the 2 unknowns, they are 100% different (since remaining are A, B).
      //      However, if you flip known(A) + unknown(A or B), there is a 50% chance of match.
      if (unknownPool.length === 2 && Object.keys(knownLocations).length === 2) {
        // 1. Select one known card (e.g., A)
        const knownValStr = Object.keys(knownLocations)[0];
        const knownVal = Number(knownValStr);

        // 2. Select one unknown card (e.g., A or B)
        const uIdxIndex = 0;
        const uIdx = unknownPool[uIdxIndex];
        unknownPool.splice(uIdxIndex, 1);
        const uVal = deck[uIdx];

        // 3. Compare (open simultaneously)
        if (knownVal === uVal) {
          // Match success (A == A)
          matchedPairs++;
          delete knownLocations[knownVal];
          // Remaining situation: Known B(1), Unknown B(1) -> Handled in next turn [Priority 3]
        } else {
          // Match failed (A != B)
          // We already knew the location of the other known card (B).
          // Since the flipped uVal is B, we found B's pair.
          pendingMatches.push(uVal);
          delete knownLocations[uVal]; // Move B to pending
          // A remains in knownLocations
        }
        continue;
      }

      // Handle last pair (1 known, 1 unknown)
      // Left with 2 cards after strategy success, or by luck
      if (unknownPool.length === 1 && pendingMatches.length === 0) {
        // The remaining one is definitely the pair of the known card
        unknownPool.pop();
        matchedPairs++;
        continue;
      }

      // General search (open 2 unknown cards simultaneously)
      if (unknownPool.length < 2) break; // Exception handling

      const idx1Index = Math.floor(Math.random() * unknownPool.length);
      const idx1 = unknownPool[idx1Index];
      unknownPool.splice(idx1Index, 1);
      const val1 = deck[idx1];

      const idx2Index = Math.floor(Math.random() * unknownPool.length);
      const idx2 = unknownPool[idx2Index];
      unknownPool.splice(idx2Index, 1);
      const val2 = deck[idx2];

      if (val1 === val2) {
        matchedPairs++;
      } else {
        // Update information
        if (knownLocations[val1] !== undefined) {
          pendingMatches.push(val1);
          delete knownLocations[val1];
        } else {
          knownLocations[val1] = idx1;
        }

        if (knownLocations[val2] !== undefined) {
          pendingMatches.push(val2);
          delete knownLocations[val2];
        } else {
          knownLocations[val2] = idx2;
        }
      }
    }
    totalFlips += attempts;
  }
  return totalFlips / simCount;
};

// ----------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------

export const CardMatchPlanner = ({
  eventId,
  eventData,
  iconData,
  onCalculate,
  remainingCurrency,
}: CardMatchPlannerProps) => {

  const { t } = useTranslation("planner", { keyPrefix: 'cardmatch' });

  // UI State
  const [isCollapsed, setIsCollapsed] = useState(false);
  // const [activeTab, setActiveTab] = useState<'simulation' | 'info'>('simulation');
  // const [viewMode, setViewMode] = useState<'total' | 'average'>('total');

  const {
    cardMatchActiveTab: activeTab,
    setCardMatchActiveTab: setActiveTab,
    cardMatchViewMode: viewMode,
    setCardMatchViewMode: setViewMode,
    cardMatchDisplayResult: displayResult,
    setCardMatchDisplayResult: setDisplayResult,
  } = useEventSettings(eventId);

  // Config State
  //  Set default Target Clears to 10
  // const [config, setConfig] = useState({ 
  //   startRound: 1, 
  //   targetClears: 10,
  //   simIterations: 2000
  // });

  // // Result State
  // const [displayResult, setDisplayResult] = useState<CardMatchResult | null>(null);

  let { cardMatchSimConfig: config, setCardMatchSimConfig: setConfig } = usePlanForEvent(eventId);
  if (!config) config = defaultCardMatchSimConfig

  const concentrationData = eventData.concentration;

  // ----------------------------------------------------------------------
  // Helpers: Data Processing
  // ----------------------------------------------------------------------

  const deckRarityCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    if (!concentrationData) return counts;

    concentrationData.card.forEach(card => {
      if (concentrationData.card.length <= 6) {
        counts[card.Rarity] = (counts[card.Rarity] || 0) + 1;
      } else {
        counts[card.Rarity] = (counts[card.Rarity] || 0) + 0.5;
      }
    });
    return counts;
  }, [concentrationData]);

  const { rewardsByRound, loopRewards, droppableItemIds } = useMemo(() => {
    const byRound: Record<number, ConcentrationReward[]> = {};
    const loop: ConcentrationReward[] = [];
    const itemIds = new Set<number>();

    if (concentrationData) {
      concentrationData.reward.forEach(r => {
        if (!byRound[r.Round]) byRound[r.Round] = [];
        byRound[r.Round].push(r);
        if (r.IsLoop) loop.push(r);

        // Collect all possible drops
        r.RewardParcelId.forEach(id => itemIds.add(id));
      });
    }
    return { rewardsByRound: byRound, loopRewards: loop, droppableItemIds: itemIds };
  }, [concentrationData]);

  const calculateRoundReward = useCallback((round: number, instantClearRound: number) => {
    const roundTotal: Record<string, number> = {};

    // 1. Calculate PairMatch rewards (defined in Round 0)
    // Rewards obtained whenever a pair is matched by flipping cards
    const matchRewards = rewardsByRound[0] || [];
    matchRewards.forEach(reward => {
      if (reward.ConcentrationRewardTypeStr === 'PairMatch') {
        // Check how many pairs of that Rarity are in the deck (e.g., if 3 SSR pairs, reward is tripled)
        const pairCount = deckRarityCounts[reward.Rarity] || 0;

        if (pairCount > 0) {
          reward.RewardParcelId.forEach((pid, idx) => {
            const key = `${reward.RewardParcelTypeStr[idx]}_${pid}`;
            const amount = reward.RewardParcelAmount[idx] * pairCount;
            roundTotal[key] = (roundTotal[key] || 0) + amount;
          });
        }
      }
    });

    // 2. Calculate RoundRenewal rewards (rewards for finishing specific rounds)
    const effectiveRound = round >= instantClearRound ? instantClearRound : round;
    let renewalRewards = rewardsByRound[effectiveRound];

    // If no data for that round (e.g., Loop section), use last clear round or Loop data
    if (!renewalRewards || renewalRewards.length === 0) {
      renewalRewards = rewardsByRound[instantClearRound] || loopRewards;
    }

    if (renewalRewards) {
      renewalRewards.forEach(reward => {
        if (reward.ConcentrationRewardTypeStr === 'RoundRenewal') {
          // Round completion reward is obtained only once
          reward.RewardParcelId.forEach((pid, idx) => {
            const key = `${reward.RewardParcelTypeStr[idx]}_${pid}`;
            const amount = reward.RewardParcelAmount[idx];
            roundTotal[key] = (roundTotal[key] || 0) + amount;
          });
        }
      });
    }

    return roundTotal;
  }, [rewardsByRound, loopRewards, deckRarityCounts]);

  // ----------------------------------------------------------------------
  // Main Logic: Simulation Run
  // ----------------------------------------------------------------------
  const runSimulation = useCallback((overrideTargetClears?: number) => {
    if (!concentrationData || !config) return;

    const targetClears = overrideTargetClears ?? config.targetClears;
    const info = concentrationData.info[0];
    const costId = info.CostGoods.ConsumeParcelId[0];
    const costAmount = info.CostGoods.ConsumeParcelAmount[0];
    const costKey = `Item_${costId}`;
    const instantClearRound = info.InstantClearRound || 10;

    const avgFlipsPerRound = simulateAverageFlips(config.simIterations, info.MaxCardOpenCount);
    const totalFlips = avgFlipsPerRound * targetClears;
    const totalCostAmount = totalFlips * costAmount;

    const totalCosts: Record<string, number> = {
      [costKey]: totalCostAmount
    };

    const totalRewards: Record<string, number> = {};

    for (let i = 0; i < targetClears; i++) {
      const currentRound = config.startRound + i;
      const roundRewards = calculateRoundReward(currentRound, instantClearRound);

      Object.entries(roundRewards).forEach(([key, amount]) => {
        totalRewards[key] = (totalRewards[key] || 0) + amount;
      });
    }

    const result: CardMatchResult = {
      totalCosts,
      totalRewards,
      avgFlipsPerRound,
      targetClears
    };

    setDisplayResult(result);
    onCalculate(result);

    if (overrideTargetClears !== undefined) {
      // setConfig(prev => ({ ...prev, targetClears: overrideTargetClears }));
      setConfig({ ...config, targetClears: overrideTargetClears });
    }

  }, [concentrationData, config.targetClears, config.startRound, config.simIterations, calculateRoundReward, onCalculate]);


  // ----------------------------------------------------------------------
  // Auto Calculators
  // ----------------------------------------------------------------------

  // 1. Consume all entry tickets (Cost Items)
  const handleSetMaxPlayable = () => {
    if (!concentrationData) return;

    const info = concentrationData.info[0];
    const costId = info.CostGoods.ConsumeParcelId[0];
    const costAmount = info.CostGoods.ConsumeParcelAmount[0];
    const costKey = `Item_${costId}`;

    const prevCost = displayResult?.totalCosts[costKey] || 0;
    const currentBalance = (remainingCurrency[costId] || 0) + prevCost;

    if (currentBalance <= 0) {
      runSimulation(0);
      return;
    }

    const avgFlips = simulateAverageFlips(500, info.MaxCardOpenCount);
    const costPerRound = avgFlips * costAmount;

    if (costPerRound <= 0) return;

    const maxRounds = Math.floor(currentBalance / costPerRound);
    runSimulation(maxRounds);
  };

  // 2. Fill in missing reward items (Reward Items)
  const handleSetTargetDeficit = () => {
    if (!concentrationData) return;
    const info = concentrationData.info[0];
    const instantClearRound = info.InstantClearRound || 10;

    // Filter only items dropped in this mini-game
    // Identify reward items (exclude cost item)
    const costId = info.CostGoods.ConsumeParcelId[0];
    const rewardItems = eventData.currency.filter(c =>
      c.ItemUniqueId !== costId && droppableItemIds.has(c.ItemUniqueId)
    );

    const deficits: Record<number, number> = {};
    let hasDeficit = false;

    rewardItems.forEach(item => {
      const key = `${item.EventContentItemType === 2 ? 'Currency' : 'Item'}_${item.ItemUniqueId}`;
      const prevReward = displayResult?.totalRewards[key] || 0;
      // Undo calculated simulation results to calculate net balance
      const baseBalance = (remainingCurrency[item.ItemUniqueId] || 0) - prevReward;

      if (baseBalance < 0) {
        deficits[item.ItemUniqueId] = -baseBalance; // Convert to positive number and save required amount
        hasDeficit = true;
      }
    });

    if (!hasDeficit) {
      runSimulation(0);
      return;
    }

    // console.log('deficits',deficits)
    // console.log('rewardItems',rewardItems)
    // console.log('remainingCurrency',remainingCurrency)

    let simulatedRounds = 0;
    const accumulatedRewards: Record<number, number> = {};
    const maxLimit = 500;

    while (simulatedRounds < maxLimit) {
      const unsatisfied = Object.entries(deficits).some(([idStr, needed]) => {
        const id = Number(idStr);
        return (accumulatedRewards[id] || 0) < needed;
      });

      // console.log('unsatisfied', simulatedRounds, unsatisfied, accumulatedRewards)

      if (!unsatisfied) break;

      const currentRound = config.startRound + simulatedRounds;
      const roundRewards = calculateRoundReward(currentRound, instantClearRound);

      Object.entries(roundRewards).forEach(([key, amount]) => {
        const id = Number(key.split('_')[1]);
        accumulatedRewards[id] = (accumulatedRewards[id] || 0) + amount;
      });

      simulatedRounds++;
    }

    console.log('simulatedRounds', simulatedRounds)
    runSimulation(simulatedRounds);
  };


  // ----------------------------------------------------------------------
  // Icon Lookups for Buttons
  // ----------------------------------------------------------------------
  const costItemInfo = useMemo(() => {
    if (!concentrationData) return null;
    const id = concentrationData.info[0].CostGoods.ConsumeParcelId[0];
    // Consumable items are usually type Item(4)
    return { type: 'Item', id };
  }, [concentrationData]);

  const mainRewardItemInfo = useMemo(() => {
    if (!concentrationData || !eventData) return null;
    const costId = concentrationData.info[0].CostGoods.ConsumeParcelId[0];

    // Find items among event currencies that are not cost items and exist in the drop list
    const targetCurrency = eventData.currency.find(c =>
      c.ItemUniqueId !== costId && droppableItemIds.has(c.ItemUniqueId)
    );

    console.log('targetCurrency', targetCurrency)
    if (targetCurrency) {
      return {
        type: targetCurrency.EventContentItemType === 2 ? 'Currency' : 'Item',
        id: targetCurrency.ItemUniqueId
      };
    }

    console.log('droppableItemIds', droppableItemIds)
    // Fallback: Any one of the drop IDs
    const firstDropId = Array.from(droppableItemIds)[0];
    return firstDropId ? { type: 'Item', id: firstDropId } : null;

  }, [concentrationData, eventData, droppableItemIds]);


  const rewardTable = useMemo(() => {
    if (!concentrationData) return null;
    const byRound: Record<number, ConcentrationReward[]> = {};
    concentrationData.reward.forEach(r => {
      if (!byRound[r.Round]) byRound[r.Round] = [];
      byRound[r.Round].push(r);
    });
    return byRound;
  }, [concentrationData]);

  // Initial run
  useEffect(() => {
    if (!displayResult) {
      runSimulation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const { matchRewards, roundRewards } = useMemo(() => {
    if (!concentrationData) return { matchRewards: [], roundRewards: {} };

    const matches: ConcentrationReward[] = [];
    const rounds: Record<number, ConcentrationReward[]> = {};

    concentrationData.reward.forEach(r => {
      if (r.ConcentrationRewardTypeStr === 'PairMatch') {
        matches.push(r);
      } else {
        // RoundRenewal and others
        if (!rounds[r.Round]) rounds[r.Round] = [];
        rounds[r.Round].push(r);
      }
    });

    // Sort matches by rarity (SSR -> N)
    matches.sort((a, b) => b.Rarity - a.Rarity);

    return { matchRewards: matches, roundRewards: rounds };
  }, [concentrationData]);


  if (!concentrationData) return null;

  return (
    <>
      <div className="flex justify-between items-center cursor-pointer group" onClick={() => setIsCollapsed(!isCollapsed)}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100"> {t('page.cardMatchSimulator', 'Card Match')}</h2>
        <span className="text-2xl transition-transform duration-300 group-hover:scale-110">
          <ChevronIcon className={isCollapsed ? "rotate-180" : ""} />
        </span>
      </div>

      {!isCollapsed && (
        <div className="mt-4 ">

          {/* Tabs */}
          <div className="flex border-b dark:border-neutral-700 mb-4">
            <button
              className={`px-4 py-2 font-bold border-b-2 transition-colors ${activeTab === 'simulation' ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
              onClick={() => setActiveTab('simulation')}
            >
              {t('tab.simulation', 'Simulator')}
            </button>
            <button
              className={`px-4 py-2 font-bold border-b-2 transition-colors ${activeTab === 'info' ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
              onClick={() => setActiveTab('info')}
            >
              {t('tab.rewardInfo', 'Reward Info')}
            </button>
          </div>

          {/* ---------------------------------------------------------------------- */}
          {/* Tab 1: Simulation & Planner */}
          {/* ---------------------------------------------------------------------- */}
          {activeTab === 'simulation' && (
            <div className="space-y-6 animate-fade-in">

              {/* Algorithm Info */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800/30">
                <div className="flex items-start gap-3">
                  <div>
                    <h4 className="font-bold text-blue-800 dark:text-blue-200 text-sm mb-1">
                      {t('cardMatch.algoTitle', 'Simulation Algorithm: Perfect Memory')}
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                      {t('cardMatch.algoDesc', 'This simulation assumes the player remembers every flipped card. If a pair location is known, it is matched immediately. This calculates the minimum expected cost for clearing the board.')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Settings */}
                <div className="space-y-4">
                  <h3 className="font-bold text-gray-800 dark:text-gray-200 border-b pb-2 dark:border-neutral-700">
                    {t('ui.settings', 'Settings')}
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
                        {t('label.startRound', 'Start Round')}
                      </label>
                      <input
                        type="number" min={1}
                        value={config.startRound}
                        //  onChange={e => setConfig(p => ({ ...p, startRound: Math.max(1, parseInt(e.target.value) || 1) }))} 
                        onChange={e => setConfig(({ ...config, startRound: Math.max(1, parseInt(e.target.value) || 1) }))}
                        className="w-full p-2 rounded bg-gray-50 border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
                        {t('label.simIterations', 'Sim Iterations')}
                      </label>
                      <input
                        type="number" step={100} min={100}
                        value={config.simIterations}
                        onChange={e => setConfig(({ ...config, simIterations: parseInt(e.target.value) || 1000 }))}
                        className="w-full p-2 rounded bg-gray-50 border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
                      {t('label.targetClears', 'Target Clears (Rounds)')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number" min={0}
                        value={config.targetClears}
                        onChange={e => setConfig(({ ...config, targetClears: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="grow p-2 rounded bg-gray-50 border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-100"
                      />
                      <button
                        onClick={() => runSimulation()}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 rounded shadow-sm transition-all active:scale-95"
                      >
                        {t('button.run', 'Run Sim')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right: Auto Calculators */}
                <div className="space-y-4">
                  <h3 className="font-bold text-gray-800 dark:text-gray-200 border-b pb-2 dark:border-neutral-700">
                    {t('ui.autoCalculate', 'Auto-Set Rounds')}
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {/* Button 1: Use All Cost Item */}
                    <button
                      onClick={handleSetMaxPlayable}
                      className="flex items-center justify-between p-3 rounded border border-gray-200 dark:border-neutral-600 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors text-left group"
                    >
                      <div>
                        <div className="font-bold text-sm text-gray-800 dark:text-gray-200">
                          {t('button.consumeAllCost', 'Use All Tickets')}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {t('desc.consumeAllCost', 'Set rounds to consume all owned cost items.')}
                        </div>
                      </div>
                      <div className="group-hover:scale-110 transition-transform">
                        {costItemInfo && (
                          // <ItemIcon 
                          //     type={costItemInfo.type} 
                          //     itemId={String(costItemInfo.id)} 
                          //     size={28}
                          //     eventData={eventData}
                          //     iconData={iconData}
                          // />

                          <img src={`data:image/webp;base64,${iconData.Item?.[costItemInfo.id]}`} className="inline w-14 h-14 ml-0.5 object-cover" />
                        )}
                      </div>
                    </button>

                    {/* Button 2: Fulfill Deficit (Main Currency) */}
                    <button
                      onClick={handleSetTargetDeficit}
                      className="flex items-center justify-between p-3 rounded border border-gray-200 dark:border-neutral-600 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors text-left group"
                    >
                      <div>
                        <div className="font-bold text-sm text-gray-800 dark:text-gray-200">
                          {t('button.fulfillDeficit', 'Fulfill Deficits')}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {t('desc.fulfillDeficit', 'Set rounds to acquire missing shop items.')}
                        </div>
                      </div>
                      <div className="group-hover:scale-110 transition-transform">
                        {mainRewardItemInfo && (
                          // <ItemIcon 
                          //     type={mainRewardItemInfo.type} 
                          //     itemId={String(mainRewardItemInfo.id)} 
                          //     size={28}
                          //     eventData={eventData}
                          //     iconData={iconData}
                          // />
                          <img src={`data:image/webp;base64,${iconData.Item?.[mainRewardItemInfo.id]}`} className="inline w-14 h-14 ml-0.5 object-cover" />
                        )}
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Results Display */}
              {displayResult && (
                <div className="mt-8 space-y-4 pt-4 border-t dark:border-neutral-700">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">
                      {t('ui.simulationResults', 'Simulation Results')}
                    </h3>

                    {/* View Mode Toggle */}
                    <div className="bg-gray-100 dark:bg-neutral-700 p-1 rounded-lg flex text-xs font-bold">
                      <button
                        onClick={() => setViewMode('total')}
                        className={`px-3 py-1.5 rounded-md transition-all ${viewMode === 'total' ? 'bg-white dark:bg-neutral-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}
                      >
                        {t('label.total', 'Total')}
                      </button>
                      <button
                        onClick={() => setViewMode('average')}
                        className={`px-3 py-1.5 rounded-md transition-all ${viewMode === 'average' ? 'bg-white dark:bg-neutral-600 shadow text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}
                      >
                        {t('label.average', 'Avg / Round')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Cost Display */}
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-900/30">
                      <div className="flex justify-between mb-3">
                        <span className="font-bold text-red-700 dark:text-red-300">
                          {t('label.estimatedCost', 'Estimated Cost')}
                        </span>
                        <span className="text-xs font-medium text-red-600/70 bg-red-100 dark:bg-red-900/50 px-2 py-0.5 rounded-full">
                          {t('label.avgFlips', 'Avg Flips')}: {displayResult.avgFlipsPerRound.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {Object.entries(displayResult.totalCosts).map(([key, total]) => {
                          const amount = viewMode === 'average' && displayResult.targetClears > 0
                            ? total / displayResult.targetClears
                            : total;
                          return (
                            <div key={key} className="flex flex-col items-center">
                              <ItemIcon
                                type={key.split('_')[0]}
                                itemId={key.split('_')[1]}
                                amount={amount}
                                size={11}
                                eventData={eventData}
                                iconData={iconData}
                              />
                              {/* <span className="text-xs font-bold text-red-600 mt-1">
                                            -{Math.round(amount).toLocaleString()}
                                        </span> */}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Reward Display */}
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-100 dark:border-green-900/30">
                      <div className="mb-3 font-bold text-green-700 dark:text-green-300">
                        {t('label.estimatedRewards', 'Estimated Rewards')}
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                        {Object.entries(displayResult.totalRewards)
                          .sort(([key_a, a], [key_b, b]) => getItemSortPriority(key_a, eventData) - getItemSortPriority(key_b, eventData))
                          .map(([key, total]) => {
                            if (total <= 0) return null;
                            const amount = viewMode === 'average' && displayResult.targetClears > 0
                              ? total / displayResult.targetClears
                              : total;

                            if (amount < 0.1) return null;

                            return (
                              <div key={key} className="flex flex-col items-center">
                                <ItemIcon
                                  type={key.split('_')[0]}
                                  itemId={key.split('_')[1]}
                                  amount={amount}
                                  size={11}
                                  eventData={eventData}
                                  iconData={iconData}
                                />
                                {/* <span className="text-xs font-bold text-green-600 mt-1">
                                                +{Math.round(amount).toLocaleString()}
                                            </span> */}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------------------- */}
          {/* Tab 2: Reward Info */}
          {/* ---------------------------------------------------------------------- */}
          {activeTab === 'info' && (
            <div className="space-y-8 animate-fade-in">

              {/* 1. Card Flip Rewards Table */}
              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-700">
                <div className="px-4 py-2 bg-gray-100 dark:bg-neutral-700/50 border-b dark:border-neutral-700 font-bold text-sm flex items-center gap-2">
                  <span></span> {t('cardMatch.flipRewardTitle', 'Card Match Rewards')}
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-auto">
                    * {t('cardMatch.flipRewardDesc', 'Obtained every time a pair is matched')}
                  </span>
                </div>
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-neutral-700 dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-3 w-1/3">{t('label.type')}</th>
                      <th className="px-4 py-3">{t('label.reward')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-neutral-700 bg-white dark:bg-neutral-800">
                    {matchRewards.map((reward) => (
                      <tr key={`match-${reward.UniqueId}`} className="hover:bg-gray-50 dark:hover:bg-neutral-700">
                        <td className="px-4 py-3 align-middle">
                          <span className={`font-bold text-xs px-2 py-1 rounded border ${reward.Rarity === 3 ? 'text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300' :
                            reward.Rarity === 2 ? 'text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300' :
                              reward.Rarity === 1 ? 'text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300' :
                                'text-gray-600 border-gray-200 bg-gray-50 dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-300'
                            }`}>
                            {reward.Rarity === 3 ? 'SSR' : reward.Rarity === 2 ? 'SR' : reward.Rarity === 1 ? 'R' : 'N'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {reward.RewardParcelId.map((pid, i) => (
                              <ItemIcon
                                key={i}
                                type={reward.RewardParcelTypeStr[i]}
                                itemId={String(pid)}
                                amount={reward.RewardParcelAmount[i]}
                                size={10}
                                eventData={eventData}
                                iconData={iconData}
                              />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 2. Round Clear Rewards Table */}
              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-700">
                <div className="px-4 py-2 bg-gray-100 dark:bg-neutral-700/50 border-b dark:border-neutral-700 font-bold text-sm flex items-center gap-2">
                  <span>🚩</span> {t('cardMatch.clearRewardTitle', 'Round Clear Rewards')}
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-auto">
                    * {t('cardMatch.clearRewardDesc', 'Obtained when clearing the board')}
                  </span>
                </div>
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-neutral-700 dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-3 w-24">{t('label.round')}</th>
                      <th className="px-4 py-3">{t('label.reward')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-neutral-700 bg-white dark:bg-neutral-800">
                    {Object.entries(roundRewards).map(([roundStr, rewards]) => {
                      const round = Number(roundStr);
                      // Loop round check logic (assuming last items are loops or explicit flag)
                      const isLoop = rewards.some(r => r.IsLoop);

                      return (
                        <tr key={`round-${round}`} className="hover:bg-gray-50 dark:hover:bg-neutral-700">
                          <td className="px-4 py-3 font-medium border-r dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-800/50">
                            {isLoop ? (
                              <span className="flex items-center gap-1">
                                {round}+ <span className="text-[10px] uppercase text-gray-400">(Loop)</span>
                              </span>
                            ) : (
                              <span>{round}</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-col gap-1">
                              {rewards.map((reward, rIdx) => (
                                <div key={rIdx} className="flex flex-wrap gap-1 items-center">
                                  {reward.RewardParcelId.map((pid, i) => (
                                    <ItemIcon
                                      key={`${rIdx}-${i}`}
                                      type={reward.RewardParcelTypeStr[i]}
                                      itemId={String(pid)}
                                      amount={reward.RewardParcelAmount[i]}
                                      size={10}
                                      eventData={eventData}
                                      iconData={iconData}
                                    />
                                  ))}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          )}
        </div>
      )}
    </>
  );
};