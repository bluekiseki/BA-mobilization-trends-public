import { useState, useCallback, useEffect, useMemo } from 'react';
import { ItemIcon } from '../common/Icon';
import type { EventData, LocalizeEtc, MinigameDreamData, MinigameDreamParameter, MinigameDreamScheduleResult, MinigameMission } from '~/types/plannerData';
import { ChevronIcon } from '~/components/Icon';
import { useTranslation } from 'react-i18next';
import { DreamMakerInteractiveSimulator } from './dreamMaker/DreamMakerInteractiveSimulator';
import { SimulationResultDisplay } from './dreamMaker/SimulationResultDisplay';
import type { Locale } from '~/utils/i18n/config';
import { getlocaleMethond } from '../common/locale';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import {
  defaultDreamMakerConfig,
  type DreamMakerPlannerProps,
  type DreamMakerResult,
  type DreamMakerSimConfig,
  type DreamMakerSimResult,
  type DreamMakerStrategy,
  type DreamMakerTab,
} from './dreamMaker/type';
import { useEventSettings } from '~/store/planner/useSettingsStore';
import 'rc-tooltip/assets/bootstrap.css';
import Tooltip from 'rc-tooltip';
import { CustomNumberInput } from '~/components/CustomInput';

// --- Simulation Engine ---
const runSimulation = (dreamData: MinigameDreamData, simConfig: DreamMakerSimConfig, eventDataRef: EventData): DreamMakerSimResult => {
  if (!dreamData || simConfig.simRuns <= 0)
    return {
      avgCost: {},
      avgRewards: {},
      avgEventPoints: 0,
      avgFinalStats: {},
      avgSpecialEndings: 0,
      avgNormalEndings: 0,
      avgActions: 0,
      loopsDetail: {},
    };

  console.log('runSimulation', simConfig);
  const { simRuns, targetLoops, isFirstRun, clearedFirstRewards, initialStats, strategy } = simConfig;
  const {
    daily_point,
    ending,
    ending_reward,
    info: [gameInfo],
    parameter,
    schedule_result,
  } = dreamData;
  // const minigame_mission = eventDataRef.minigame_mission || []; // Use correct key

  const days = gameInfo.DreamMakerDays;
  const actionsPerDay = gameInfo.DreamMakerActionPoint;
  const carryoverRate = gameInfo.DreamMakerParameterTransfer / 10000;
  const costInfo = gameInfo.ScheduleCostGoods;
  const costPerAction = costInfo.ConsumeParcelAmount[0];
  const costKey = `${costInfo.ConsumeParcelTypeStr[0]}_${costInfo.ConsumeParcelId[0]}`;
  const eventPointKey = `${gameInfo.DreamMakerDailyPointParcelTypeStr}_${gameInfo.DreamMakerDailyPointId}`;

  const paramInfo = parameter.reduce(
    (acc, p) => {
      acc[p.ParameterType] = p;
      return acc;
    },
    {} as Record<number, MinigameDreamParameter>,
  );
  const scheduleResultsByGroup = schedule_result.reduce(
    (acc, res) => {
      if (!acc[res.DreamMakerScheduleGroup]) acc[res.DreamMakerScheduleGroup] = [];
      acc[res.DreamMakerScheduleGroup].push(res);
      return acc;
    },
    {} as Record<number, MinigameDreamScheduleResult[]>,
  );

  const scheduleIdMap: Record<string, number> = {};
  dreamData.schedule.forEach((s) => {
    const krName = s.LocalizeEtc?.Kr;
    if (krName === '악기연습') scheduleIdMap['perf'] = s.DreamMakerScheduleGroupId;
    else if (krName === '이론공부') scheduleIdMap['sense'] = s.DreamMakerScheduleGroupId;
    else if (krName === '협동훈련') scheduleIdMap['team'] = s.DreamMakerScheduleGroupId;
    else if (krName === '당분충전') scheduleIdMap['cond'] = s.DreamMakerScheduleGroupId;
  });

  const specialEnding = ending.find((e) => e.DreamMakerEndingType === 2)!;
  const normalEnding = ending.find((e) => e.DreamMakerEndingType === 1)!;

  let totalSimCost: Record<string, number> = {},
    totalSimRewards: Record<string, number> = {},
    totalSimEventPoints = 0;
  let totalSimFinalStats: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let totalSimSpecialEndings = 0,
    totalSimNormalEndings = 0,
    totalSimActions = 0;
  // Store sum of stats per loop across all simulations
  let totalLoopsDetail: Record<
    number,
    {
      startStats: Record<number, number>;
      endStats: Record<number, number>;
      eventPoints: number;
      specialEndingCount: number;
      count: number;
    }
  > = {};

  for (let i = 0; i < simRuns; i++) {
    let previousLoopFinalStats: Record<number, number> = !isFirstRun && initialStats ? { ...initialStats } : {};
    let simRunRewards: Record<string, number> = {},
      simRunEventPoints = 0,
      simRunCost = 0,
      simRunActions = 0;
    let firstEndingReachedThisSim: Record<number, boolean> = clearedFirstRewards ? { [specialEnding.EndingId]: true, [normalEnding.EndingId]: true } : {};
    let runSpecialEndings = 0,
      runNormalEndings = 0;
    let maxStatsAchieved: Record<number, boolean> = {
      1: false,
      2: false,
      3: false,
      4: false,
    }; // For mission strategy

    for (let loopIndex = 0; loopIndex < targetLoops; loopIndex++) {
      const currentLoopNumber = loopIndex + 1;
      let currentStats: Record<number, number> = {};
      let loopStartStats: Record<number, number> = {};

      parameter.forEach((p) => {
        const baseValue = p.ParameterBase;
        const carryoverBonus = (currentLoopNumber > 1 || !isFirstRun) && previousLoopFinalStats[p.ParameterType] ? Math.floor(previousLoopFinalStats[p.ParameterType] * carryoverRate) : 0;
        let initialStat = loopIndex === 0 && !isFirstRun && initialStats?.[p.ParameterType] ? initialStats[p.ParameterType] : baseValue + carryoverBonus;
        if (p.ParameterType === 4 && p.ParameterBaseMax > 0) initialStat = Math.min(baseValue + carryoverBonus, p.ParameterBaseMax);
        currentStats[p.ParameterType] = Math.max(p.ParameterMin, Math.min(p.ParameterMax, initialStat));
        loopStartStats[p.ParameterType] = currentStats[p.ParameterType];
      });

      if (!totalLoopsDetail[currentLoopNumber]) {
        totalLoopsDetail[currentLoopNumber] = {
          startStats: { 1: 0, 2: 0, 3: 0, 4: 0 },
          endStats: { 1: 0, 2: 0, 3: 0, 4: 0 },
          eventPoints: 0,
          specialEndingCount: 0,
          count: 0,
        };
      }
      for (const pType in loopStartStats) {
        totalLoopsDetail[currentLoopNumber].startStats[Number(pType)] += loopStartStats[Number(pType)];
      }
      totalLoopsDetail[currentLoopNumber].count++;

      let loopEventPoints = 0;
      let currentLoopStrategy = strategy; // Strategy can change mid-loop

      for (let day = 1; day <= days; day++) {
        for (let action = 1; action <= actionsPerDay; action++) {
          simRunCost += costPerAction;
          simRunActions++;
          let scheduleGroupId: number | undefined; // Use undefined to ensure strategy logic covers all cases

          // --- Strategy Implementation ---
          if (currentLoopStrategy === 'mission_priority') {
            // Check if all max stats achieved for this strategy

            parameter.forEach((p) => {
              if (currentStats[p.ParameterType] >= p.ParameterMax) maxStatsAchieved[p.ParameterType] = true;
            });
            const allMissionsDone = Object.values(maxStatsAchieved).every((v) => v);

            if (allMissionsDone) {
              currentLoopStrategy = 'pt_optimal'; // Switch to PT optimal after missions
            } else {
              let targetParamType = -1;
              // Priority: Cond -> Perf -> Sense -> Teamwork until maxed
              for (const pType of [4, 1, 2, 3]) {
                if (!maxStatsAchieved[pType]) {
                  targetParamType = pType;
                  break;
                }
              }
              if (targetParamType === 1) scheduleGroupId = scheduleIdMap['perf'];
              else if (targetParamType === 2) scheduleGroupId = scheduleIdMap['sense'];
              else if (targetParamType === 3) scheduleGroupId = scheduleIdMap['team'];
              else scheduleGroupId = scheduleIdMap['cond']; // targetParamType === 4
            }
          }

          // If strategy is pt_optimal or switched from mission_priority
          if (currentLoopStrategy === 'pt_optimal') {
            if (day < days && currentStats[4] < paramInfo[4].ParameterMin + 30) {
              // Slightly more lenient early condition boost
              scheduleGroupId = scheduleIdMap['cond'];
            } else if (day === days && currentStats[4] < 100) {
              // Final day boost for hidden ending
              scheduleGroupId = scheduleIdMap['cond'];
            } else {
              // Otherwise, boost lowest main stat needed for hidden ending, or just lowest overall
              let needsBoost: number[] = [];
              specialEnding.EndingCondition?.forEach((pt, idx) => {
                if (pt !== 4 && currentStats[pt] < specialEnding.EndingConditionValue![idx]) {
                  needsBoost.push(pt);
                }
              });
              if (needsBoost.length > 0) {
                needsBoost.sort((a, b) => currentStats[a] - currentStats[b]);
                const lowestNeededType = needsBoost[0];
                if (lowestNeededType === 1) scheduleGroupId = scheduleIdMap['perf'];
                else if (lowestNeededType === 2) scheduleGroupId = scheduleIdMap['sense'];
                else scheduleGroupId = scheduleIdMap['team'];
              } else {
                // All hidden reqs met or not applicable, boost lowest main stat
                const mainStats = [currentStats[1], currentStats[2], currentStats[3]];
                const minStatValue = Math.min(...mainStats);
                if (currentStats[1] === minStatValue) scheduleGroupId = scheduleIdMap['perf'];
                else if (currentStats[2] === minStatValue) scheduleGroupId = scheduleIdMap['sense'];
                else scheduleGroupId = scheduleIdMap['team'];
              }
            }
          }

          // Safety check if scheduleGroupId wasn't set (should not happen)
          if (scheduleGroupId === undefined) {
            scheduleGroupId = scheduleIdMap['perf']; // Default to Perf
          }

          // --- Execute Action ---
          const possibleResults = scheduleResultsByGroup[scheduleGroupId!];
          if (!possibleResults) continue;

          const randomProb = Math.random() * 10000;
          let cumulativeProb = 0;
          let outcome: MinigameDreamScheduleResult | null = null;
          for (const res of possibleResults) {
            cumulativeProb += res.Prob;
            if (randomProb < cumulativeProb) {
              outcome = res;
              break;
            }
          }
          if (!outcome) outcome = possibleResults[possibleResults.length - 1];

          outcome.RewardParameter.forEach((paramType, index) => {
            const amount = outcome!.RewardParameterAmount[index];
            const operation = outcome!.RewardParameterOperationTypeStr[index];
            let newVal = currentStats[paramType];
            if (operation.includes('GrowUp')) newVal += amount;
            else if (operation.includes('GrowDown')) newVal -= amount;
            currentStats[paramType] = Math.max(paramInfo[paramType].ParameterMin, Math.min(paramInfo[paramType].ParameterMax, newVal));
          });

          if (outcome.RewardParcelTypeStr && outcome.RewardParcelId && outcome.RewardParcelAmount) {
            const rewardKey = `${outcome.RewardParcelTypeStr}_${outcome.RewardParcelId}`;
            simRunRewards[rewardKey] = (simRunRewards[rewardKey] || 0) + outcome.RewardParcelAmount;
          }

          // --- Mission End Condition no longer applicable ---
        } // End actions

        // --- Calculate Daily Points ---
        const totalParamForDaily = (currentStats[1] || 0) + (currentStats[2] || 0) + (currentStats[3] || 0);
        const dailyRule = daily_point.find((r) => totalParamForDaily >= r.TotalParameterMin && totalParamForDaily < r.TotalParameterMax);
        if (dailyRule) {
          const points = Math.floor(totalParamForDaily * (dailyRule.DailyPointCoefficient / 10000) + dailyRule.DailyPointCorrectionValue);
          simRunEventPoints += points;
          loopEventPoints += points;
        }
      } // End days

      // --- Determine Ending and Rewards ---
      let reachedSpecial = specialEnding.EndingCondition ? specialEnding.EndingCondition.every((paramType, j) => currentStats[paramType] >= specialEnding.EndingConditionValue![j]) : false;
      const finalEnding = reachedSpecial ? specialEnding : normalEnding;

      if (reachedSpecial) {
        runSpecialEndings++;
        totalLoopsDetail[currentLoopNumber].specialEndingCount++; // Increment loop-specific count
      } else {
        runNormalEndings++;
      }

      const rewardType = firstEndingReachedThisSim[finalEnding.EndingId] ? 2 : 1;
      const endingReward = ending_reward.find((r) => r.EndingId === finalEnding.EndingId && r.DreamMakerEndingRewardType === rewardType);

      if (endingReward) {
        endingReward.RewardParcelId.forEach((id, index) => {
          const key = `${endingReward.RewardParcelTypeStr[index]}_${id}`;
          simRunRewards[key] = (simRunRewards[key] || 0) + endingReward.RewardParcelAmount[index];
        });
      }
      firstEndingReachedThisSim[finalEnding.EndingId] = true;
      previousLoopFinalStats = { ...currentStats };

      // Record end stats and points for this loop
      for (const pType in currentStats) {
        totalLoopsDetail[currentLoopNumber].endStats[Number(pType)] += currentStats[Number(pType)];
      }
      totalLoopsDetail[currentLoopNumber].eventPoints += loopEventPoints;
    } // End loops

    // Accumulate results
    totalSimCost[costKey] = (totalSimCost[costKey] || 0) + simRunCost;
    totalSimEventPoints += simRunEventPoints;
    for (const [key, amount] of Object.entries(simRunRewards)) {
      totalSimRewards[key] = (totalSimRewards[key] || 0) + amount;
    }
    // Accumulate final stats from the *last completed loop* of this sim run
    for (const paramTypeStr in previousLoopFinalStats) {
      const paramType = Number(paramTypeStr);
      totalSimFinalStats[paramType] = (totalSimFinalStats[paramType] || 0) + previousLoopFinalStats[paramType];
    }
    totalSimActions += simRunActions;
    totalSimSpecialEndings += runSpecialEndings;
    totalSimNormalEndings += runNormalEndings;
  } // End simulations

  // Calculate Averages
  const avgCost: Record<string, number> = {},
    avgRewards: Record<string, number> = {};
  for (const [key, amount] of Object.entries(totalSimCost)) {
    avgCost[key] = amount / simRuns;
  }
  for (const [key, amount] of Object.entries(totalSimRewards)) {
    avgRewards[key] = amount / simRuns;
  }
  const avgEventPoints = totalSimEventPoints / simRuns;
  const avgFinalStats: Record<number, number> = {};
  for (const paramTypeStr in totalSimFinalStats) {
    const paramType = Number(paramTypeStr);
    avgFinalStats[paramType] = totalSimFinalStats[paramType] / simRuns;
  }
  const avgSpecialEndingCount = totalSimSpecialEndings / simRuns;
  const avgNormalEndingCount = totalSimNormalEndings / simRuns;
  const avgActionsPerSim = totalSimActions / simRuns;
  if (avgEventPoints > 0 && eventPointKey) {
    avgRewards[eventPointKey] = (avgRewards[eventPointKey] || 0) + avgEventPoints;
  }

  const avgLoopsDetail: DreamMakerSimResult['loopsDetail'] = {};
  for (const loopNum in totalLoopsDetail) {
    const detail = totalLoopsDetail[loopNum];
    if (detail.count > 0) {
      avgLoopsDetail[loopNum] = {
        startStats: Object.keys(detail.startStats).reduce(
          (acc, key) => {
            acc[Number(key)] = detail.startStats[Number(key)] / detail.count;
            return acc;
          },
          {} as Record<number, number>,
        ),
        endStats: Object.keys(detail.endStats).reduce(
          (acc, key) => {
            acc[Number(key)] = detail.endStats[Number(key)] / detail.count;
            return acc;
          },
          {} as Record<number, number>,
        ),
        eventPoints: detail.eventPoints / detail.count,
        specialEndingRate: detail.specialEndingCount / detail.count, // Calculate rate per loop
      };
    }
  }

  return {
    avgCost,
    avgRewards,
    avgEventPoints,
    avgFinalStats,
    avgSpecialEndings: avgSpecialEndingCount,
    avgNormalEndings: avgNormalEndingCount,
    avgActions: avgActionsPerSim,
    loopsDetail: avgLoopsDetail,
  };
};

// --- React Component ---
export const DreamMakerPlanner = ({ eventId, eventData, iconData, onCalculate, remainingCurrency, totalBonus }: DreamMakerPlannerProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'dream_maker' });
  const locale = i18n.language as Locale;
  const locale_key = getlocaleMethond('', 'Jp', locale) as 'Jp' | 'Kr' | 'En';

  const {
    dreamMakerActiveTab: activeTab,
    setDreamMakerActiveTab: setActiveTab,
    dreamMakerSimResult: simResult,
    setDreamMakerSimResult: setSimResult,
    dreamMakerResult,
    setDreamMakerResult,
    dreamMakerAvgPtDisplayMode: avgPtDisplayMode,
    setDreamMakerAvgPtDisplayMode: setAvgPtDisplayMode,
    dreamMakerShowInteractiveSim: showInteractiveSim,
    setDreamMakerShowInteractiveSim: setShowInteractiveSim,
  } = useEventSettings(eventId);

  const {
    dreamMakerSimConfig: simConfig,
    setDreamMakerSimConfig: setSimConfig,
    dreamMakerClaimedMissions: claimedMissions,
    setDreamMakerClaimedMissions: setClaimedMissions,
    dreamMakerInteractiveResult: interactiveResult,
    setDreamMakerInteractiveResult: setInteractiveResult,
    purchaseCounts,
    setPurchaseCounts,
  } = usePlanForEvent(eventId);
  const [needsToRunSimulationAfterUpdate, setNeedsToRunSimulationAfterUpdate] = useState(false);
  const [useLeftoverEpConversion, setUseLeftoverEpConversion] = useState(true); // State for conversion checkbox
  const [conversionTargetInfo, setConversionTargetInfo] = useState<{
    id: number;
    cost: number;
    amount: number;
    targetItemId: number;
    targetItemType: string;
    efficiency: number;
  } | null>(null);

  const dreamData = eventData.minigame_dream;
  const costInfo = dreamData?.info[0]?.ScheduleCostGoods;
  const costKey = costInfo ? `${costInfo.ConsumeParcelTypeStr[0]}_${costInfo.ConsumeParcelId[0]}` : undefined;
  const minigameEntryCurrencyId = costInfo?.ConsumeParcelId[0];
  const gameMissions = useMemo(() => eventData.minigame_mission || [], [eventData.minigame_mission]);

  // Find EP exchange target item information
  useEffect(() => {
    if (!dreamData) return;
    const shopData = eventData.shop;
    const eventPointItemId = dreamData.info[0]?.DreamMakerDailyPointId;
    if (!shopData || !eventPointItemId) {
      setConversionTargetInfo(null);
      return;
    }
    let target = null;
    for (const categoryId in shopData) {
      const item = shopData[categoryId].find((i) => i.PurchaseCountLimit === 0 && i.Goods?.[0]?.ConsumeParcelId[0] === eventPointItemId);
      if (item && item.Goods?.[0]) {
        const goods = item.Goods[0];
        target = {
          id: item.Id,
          cost: goods.ConsumeParcelAmount[0],
          amount: goods.ParcelAmount[0],
          targetItemId: goods.ParcelId[0],
          targetItemType: goods.ParcelTypeStr[0],
          efficiency: goods.ParcelAmount[0] / goods.ConsumeParcelAmount[0],
        };
        break;
      }
    }
    setConversionTargetInfo(target);
  }, [dreamData, eventData.shop]);

  const entryCurrencyApCost = useMemo(() => {
    const allStages = eventData.stage.stage;
    if (!allStages || !eventData || !minigameEntryCurrencyId || !totalBonus) return Infinity;

    let bestApPerItem = Infinity;
    const stagesThatDropThis = allStages.filter(
      (s) =>
        s.StageEnterCostAmount > 0 && // Filter out stages with 0 AP cost if any
        s.EventContentStageReward.some((r) => r.RewardId === minigameEntryCurrencyId),
    );

    for (const stage of stagesThatDropThis) {
      const rewardInfo = stage.EventContentStageReward.find((r) => r.RewardId === minigameEntryCurrencyId && r.RewardTagStr == 'Event');

      if (!rewardInfo) continue;

      const baseDropAmount = rewardInfo.RewardAmount * (rewardInfo.RewardProb / 10000); // Base amount per run
      const bonusPercent = totalBonus[minigameEntryCurrencyId] || 0;
      const effectiveDropAmount = baseDropAmount * (1 + bonusPercent / 10000); // Effective amount per run including bonus

      if (effectiveDropAmount > 0) {
        const apPerItem = stage.StageEnterCostAmount / effectiveDropAmount; // AP cost per 1 item
        if (apPerItem < bestApPerItem) {
          bestApPerItem = apPerItem;
        }
      }
    }
    return bestApPerItem === Infinity ? Infinity : bestApPerItem; // Return Infinity if not found
  }, [eventData, minigameEntryCurrencyId, totalBonus]);

  const handleCalculate = (result: DreamMakerResult | null) => {
    // console.log('[handleCalculate] ', result)
    setDreamMakerResult(result);
    onCalculate(result);
  };

  const handleMaximizeLoops = useCallback(() => {
    if (!simResult || !conversionTargetInfo || !dreamData || !simConfig) return;

    // 1. Check the lack of repetition of repetitions
    const targetItemDeficit = remainingCurrency[conversionTargetInfo.targetItemId] || 0;
    if (targetItemDeficit >= 0) {
      alert(t('calculator.noLoopsNeeded', 'no Loops Needed'));
      return;
    }

    // const totalLoopsRunInSim = simConfig.targetLoops > 0 ? simConfig.targetLoops : 1;
    const avgEpPointsPerLoop = simResult.avgEventPoints / simConfig.targetLoops;

    if (avgEpPointsPerLoop <= 0) {
      alert(t('calculator.errorNetEpLoss', 'error Net Ep Loss'));
      return;
    }

    // 5 ->The amount of secret stones earned at every ending
    const loop_ending_reward = dreamData.ending_reward.filter((v) => v.DreamMakerEndingRewardTypeStr == 'LoopEndingReward' && v.DreamMakerEndingTypeStr == 'Special')[0];
    const targetIndex = loop_ending_reward.RewardParcelId.indexOf(conversionTargetInfo.targetItemId);
    const targetLoopAmount = loop_ending_reward.RewardParcelAmount[targetIndex];

    // Calculate the amount of target goods acquired per round
    const getTargetAmountPerLoop = targetLoopAmount + avgEpPointsPerLoop * conversionTargetInfo.efficiency;

    console.log(`${targetLoopAmount} + ${avgEpPointsPerLoop} * ${conversionTargetInfo.efficiency} [${simConfig.targetLoops}]`);

    // // 2. EP calculation required to fill the shortfall

    // 3. Calculate additional rounds to obtain the required EP
    const additionalLoopsNeeded = Math.ceil(-targetItemDeficit / getTargetAmountPerLoop);

    if (additionalLoopsNeeded > 0) {
      const newTargetLoops = simConfig.targetLoops + additionalLoopsNeeded;
      console.log('newTargetLoops', { newTargetLoops, additionalLoopsNeeded });
      setSimConfig((simConfig) => ({
        ...simConfig,
        targetLoops: newTargetLoops,
      }));
      alert(t('calculator.loopsMaximized', { newLoops: newTargetLoops }));
      console.log('simConfig', simConfig);
      setNeedsToRunSimulationAfterUpdate(true);
      // handleRunSimulation()
    } else {
      alert(t('calculator.noLoopsNeeded', 'no Loops Needed'));
    }
  }, [simResult, simConfig, conversionTargetInfo, dreamData, remainingCurrency, setSimConfig, t]);

  const handleRunSimulation = useCallback(() => {
    if (!dreamData || !simConfig) return;
    const result = runSimulation(dreamData, simConfig, eventData);
    setSimResult(result);
  }, [simConfig, dreamData, eventData]);

  // This effect runs whenever simConfig changes
  useEffect(() => {
    // Check if the flag is set, indicating we need to run the simulation
    if (needsToRunSimulationAfterUpdate) {
      console.log('Running simulation triggered by config update:', simConfig); // Now simConfig has the updated value
      handleRunSimulation(); // Call the simulation function
      setNeedsToRunSimulationAfterUpdate(false); // Reset the flag immediately after triggering
    }
  }, [simConfig, needsToRunSimulationAfterUpdate, handleRunSimulation]); // Dependencies

  useEffect(() => {
    let shopAdjustmentCount = 0; // Track count for store update

    if (simResult) {
      let finalCost = { ...simResult.avgCost };
      let finalRewards = { ...simResult.avgRewards }; // Start with sim rewards

      // --- Apply Conversion Logic (for store update, not direct reward addition) ---
      if (useLeftoverEpConversion && conversionTargetInfo && dreamData) {
        const minigameEpCostId = dreamData.info[0]?.DreamMakerDailyPointId;
        const epCostKey = `Item_${minigameEpCostId}`;
        const initialEp = remainingCurrency[minigameEpCostId] || 0;
        // Calculate EP used JUST by the simulation itself
        const epCostFromSimOnly = dreamMakerResult?.rewards[epCostKey] || 0;

        // Calculate leftover based on initial + rewards - sim cost
        const epRewardFromSim = simResult.avgEventPoints || 0;
        const leftoverEp = initialEp - epCostFromSimOnly + epRewardFromSim; // - epCostFromSimOnly;
        // console.log(`leftoverEp = ${leftoverEp} = ${initialEp} - ${epCostFromSimOnly} + ${epRewardFromSim}`)

        if (leftoverEp > 0) {
          const numberOfPurchases = Math.floor(leftoverEp / conversionTargetInfo.cost) + ((purchaseCounts && purchaseCounts[conversionTargetInfo.id]) || 0);
          if (numberOfPurchases > 0) {
            shopAdjustmentCount = numberOfPurchases;
            // Don't add to finalRewards here, let the store update handle it
          }
        }
      }

      // --- Update Shop Plan in Store ---

      if (conversionTargetInfo && useLeftoverEpConversion) {
        // Update the purchase count for the specific infinite item
        // This assumes the shop planner reads from this state

        setPurchaseCounts((prev) => ({
          ...prev,
          [conversionTargetInfo.id]: shopAdjustmentCount, // + (prev[conversionTargetInfo.id] || 0)
        }));
      } else if (conversionTargetInfo && !useLeftoverEpConversion) {
        // If conversion is disabled, ensure the count for this item is 0
        // unless the user manually set it elsewhere (which this might override - potential issue)
        // A safer approach might involve a dedicated state slice for auto-purchases.

        setPurchaseCounts((prev) => {
          const current = { ...prev };
          // Only reset if it was potentially set by this component before
          if (current[conversionTargetInfo.id] !== undefined) {
            current[conversionTargetInfo.id] = 0 + (prev[conversionTargetInfo.id] || 0);
          }
          return current;
        });
      }

      // --- Add Mission Rewards ---
      if (claimedMissions)
        for (const missionId of claimedMissions) {
          const mission = gameMissions.find((m) => m.Id === missionId);
          if (mission) {
            mission.MissionRewardParcelId.forEach((id, index) => {
              const key = `${mission.MissionRewardParcelTypeStr[index]}_${id}`;
              finalRewards[key] = (finalRewards[key] || 0) + mission.MissionRewardAmount[index];
            });
          }
        }

      // --- Pass Calculation Up ---
      // Pass only the simulation cost/rewards. The shop adjustment happens via store.
      handleCalculate({ cost: finalCost, rewards: finalRewards });
    } else {
      handleCalculate(null); // No simulation result
      // Reset shop count if simulation is cleared and conversion was active
      if (conversionTargetInfo && useLeftoverEpConversion) {
        setPurchaseCounts((prev) => {
          const current = { ...prev };
          if (current[conversionTargetInfo.id] !== undefined) {
            current[conversionTargetInfo.id] = 0 + (prev[conversionTargetInfo.id] || 0);
          }
          return current;
        });
      }
    }
  }, [
    simResult,
    claimedMissions,
    gameMissions,
    onCalculate,
    dreamData,
    useLeftoverEpConversion,
    conversionTargetInfo, //remainingCurrency,
    //setPurchaseCounts // Add store action as dependency
  ]);

  if (!dreamData) return null;

  const tabs: { id: DreamMakerTab; name: string }[] = [
    { id: 'overview', name: t('tabs.overview') },
    { id: 'missions', name: t('tabs.missions') },
    { id: 'calculator', name: t('tabs.calculator') },
  ];
  // const eventPointItemId = dreamData.info[0].DreamMakerDailyPointId;
  // const eventPointItemType = dreamData.info[0].DreamMakerDailyPointParcelTypeStr;
  // const eventPointKey = `${eventPointItemType}_${eventPointItemId}`;

  const formatMissionDesc = (mission: MinigameMission): string => {
    let desc = mission.DescriptionStr[locale_key];
    const count = String(mission.CompleteConditionCount);
    const targetId = mission.CompleteConditionParameter[1];
    const descKey = (mission as any).Description;

    try {
      if (descKey === 115001602) {
        const paramName = dreamData.parameter.find((p) => p.Id === targetId)?.LocalizeEtc?.[locale_key] || `파라미터 ${targetId}`;
        desc = desc.replace('{0}', paramName).replace('{1}', count);
      } else if (descKey === 2390087899) {
        const scheduleName = dreamData.schedule.find((s) => s.DreamMakerScheduleGroupId === targetId)?.LocalizeEtc?.[locale_key] || `스케쥴 ${targetId}`;
        desc = desc.replace('{0}', scheduleName).replace('{1}', count);
      } else if ([2565582995, 555526893, 1605045948, 907976610, 1410794155].includes(descKey)) {
        desc = desc.replace('{0}', count);
      } else {
        // Fallback for safety
        desc = desc.replace('{1}', count).replace('{0}', '');
      }
    } catch (e) {
      console.error('Error formatting mission description:', mission, e);
    }
    return desc;
  };

  const handleInitialStatChange = (paramType: number, value: number) => {
    const paramMeta = dreamData.parameter.find((p) => p.ParameterType === paramType);
    if (!paramMeta) return;
    let numValue = value; //parseInt(value, 10);
    if (isNaN(numValue)) {
      const newStats = { ...((simConfig && simConfig.initialStats) || {}) };
      delete newStats[paramType];
      setSimConfig((simConfig) => ({ ...simConfig, initialStats: newStats }));
    } else {
      numValue = Math.max(paramMeta.ParameterMin, Math.min(paramMeta.ParameterMax, numValue));
      setSimConfig((simConfig) => ({
        ...simConfig,
        initialStats: {
          ...(simConfig.initialStats || {}),
          [paramType]: numValue,
        },
      }));
    }
  };

  const strategyOptions = [
    {
      id: 'pt_optimal',
      name: t('calculator.strategyPt'),
      description: t('calculator.strategyPtDesc'),
    },
    {
      id: 'mission_priority',
      name: t('calculator.strategyMission'),
      description: t('calculator.strategyMissionDesc'),
    },
  ];

  // Calculate average stat changes for overview tab

  const handleSelectAllMissions = () => setClaimedMissions(Array.from(new Set(gameMissions.map((m) => m.Id))));
  const handleDeselectAllMissions = () => setClaimedMissions([]);

  return (
    <div className="bg-white dark:bg-neutral-800 p-4 rounded-lg shadow-sm">
      <div className="flex justify-between items-center cursor-pointer group" onClick={() => setIsCollapsed(!isCollapsed)}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('title')} (BETA)</h2>
        <span className="text-2xl transition-transform duration-300 group-hover:scale-110">
          <ChevronIcon className={isCollapsed ? 'rotate-180' : ''} />
        </span>
      </div>
      {!isCollapsed && (
        <div className="mt-4 space-y-4">
          <div className="flex border-b border-gray-200 dark:border-neutral-700">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300'}`}
              >
                {tab.name}
              </button>
            ))}
          </div>
          {activeTab === 'overview' && (
            <div className="space-y-6 text-sm dark:text-gray-300">
              <div>
                <h3 className="font-bold mb-2 text-base dark:text-gray-100">{t('overview.parameters')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {dreamData.parameter.map((p) => (
                    <div key={p.Id} className="flex flex-col items-center p-2 bg-gray-50 dark:bg-neutral-700/50 rounded-lg">
                      <span className="font-semibold">{p.LocalizeEtc?.[locale_key]}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({p.ParameterMin}~{p.ParameterMax})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-bold mb-2 text-base dark:text-gray-100">{t('overview.schedules')}</h3>
                <div className="space-y-4">
                  {dreamData.schedule.map((s) => {
                    const resultsForSchedule = dreamData.schedule_result.filter((res) => res.DreamMakerScheduleGroup === s.DreamMakerScheduleGroupId);
                    return (
                      <div key={s.DreamMakerScheduleGroupId} className="p-3 overflow-x-scroll">
                        <p className="font-semibold text-center mb-2 text-base">{s.LocalizeEtc?.[locale_key]}</p>
                        <table className="w-full min-w-[300px] text-xs text-center border-collapse">
                          <thead>
                            <tr className="bg-gray-200 dark:bg-neutral-600">
                              <th className="p-1 border dark:border-neutral-500">{t('overview.scheduleResult')}</th>
                              <th className="p-1 border dark:border-neutral-500">{t('overview.probability')}</th>

                              {dreamData.parameter.map((p) => (
                                <th key={p.ParameterType} className="p-1 border dark:border-neutral-500">
                                  {p.LocalizeEtc?.[locale_key]}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {resultsForSchedule.map((res) => (
                              <tr key={res.Id} className="odd:bg-white dark:odd:bg-neutral-700 even:bg-gray-100 dark:even:bg-neutral-600/50">
                                {/* (Perfect, Success, Fail) */}
                                <td
                                  className={`p-1 border dark:border-neutral-500 font-medium ${res.DreamMakerResult === 3 ? 'text-yellow-500' : res.DreamMakerResult === 2 ? 'text-green-600' : 'text-red-600'}`}
                                >
                                  {res.DreamMakerResultStr}
                                </td>
                                {/* Probability */}
                                <td className="p-1 border dark:border-neutral-500">{res.Prob / 100}%</td>
                                {/* Variation by parameter */}
                                {dreamData.parameter.map((p) => {
                                  const paramIndex = res.RewardParameter.indexOf(p.ParameterType);
                                  let changeText = '-';
                                  let textColor = 'text-gray-500 dark:text-gray-400';
                                  if (paramIndex !== -1) {
                                    const amount = res.RewardParameterAmount[paramIndex];
                                    const op = res.RewardParameterOperationTypeStr[paramIndex];
                                    if (op.includes('GrowUp')) {
                                      changeText = `+${amount}`;
                                      textColor = 'text-green-600 font-semibold';
                                    } else if (op.includes('GrowDown')) {
                                      changeText = `-${amount}`;
                                      textColor = 'text-red-600 font-semibold';
                                    }
                                  }
                                  return (
                                    <td key={p.ParameterType} className={`p-1 border dark:border-neutral-500 ${textColor}`}>
                                      {changeText}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <h3 className="font-bold mb-2 text-base dark:text-gray-100">{t('overview.endingRewards')}</h3>
                <div className="space-y-3">
                  {dreamData.ending_reward.map((reward, index) => (
                    <div key={index} className="p-3 bg-gray-50 dark:bg-neutral-700/50 rounded-lg">
                      <p className="font-semibold">
                        {reward.LocalizeEtc?.[locale_key]} ({reward.DreamMakerEndingRewardTypeStr === 'FirstEndingReward' ? t('overview.firstTime') : t('overview.repeat')})
                      </p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {reward.RewardParcelId.map((id, idx) => (
                          <ItemIcon key={idx} type={reward.RewardParcelTypeStr[idx]} itemId={String(id)} amount={reward.RewardParcelAmount[idx]} size={12} eventData={eventData} iconData={iconData} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'missions' && (
            <div className="p-4 rounded-b-lg bg-gray-50 dark:bg-neutral-700/50 space-y-2">
              <div className="flex justify-end gap-2 mb-2">
                <button onClick={handleSelectAllMissions} className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">
                  {t('missions.selectAll')}
                </button>
                <button onClick={handleDeselectAllMissions} className="text-xs bg-gray-400 text-white px-2 py-1 rounded hover:bg-gray-500">
                  {t('missions.deselectAll')}
                </button>
              </div>
              {gameMissions.map((mission) => (
                <div key={mission.Id} className="p-2 rounded-lg flex items-center justify-between bg-white dark:bg-neutral-800 shadow-sm">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={claimedMissions?.includes(mission.Id)}
                      onChange={() =>
                        setClaimedMissions(
                          ((prev) => {
                            if (!prev) return [];
                            const ns = new Set(prev);
                            if (ns.has(mission.Id)) ns.delete(mission.Id);
                            // else ns.add(mission.Id); return ;
                            else prev.push(mission.Id);
                            return prev;
                          })(claimedMissions),
                        )
                      }
                      className="h-4 w-4 rounded"
                    />
                    <span className="font-semibold text-sm">{formatMissionDesc(mission)}</span>
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {mission.MissionRewardParcelId.map((id, index) => (
                      <ItemIcon
                        key={index}
                        type={mission.MissionRewardParcelTypeStr[index]}
                        itemId={String(id)}
                        amount={mission.MissionRewardAmount[index]}
                        size={10}
                        eventData={eventData}
                        iconData={iconData}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {activeTab === 'calculator' && (
            <>
              <div className="space-y-4 border-b dark:border-neutral-600 pb-4">
                <h3 className="font-bold text-base dark:text-gray-100">{t('calculator.settingsTitle')}</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col">
                    <label>{t('calculator.simRuns')}</label>
                    <CustomNumberInput
                      value={(simConfig && simConfig.simRuns) || null}
                      onChange={(e) =>
                        setSimConfig((simConfig) => ({
                          ...simConfig,
                          simRuns: e || 1000,
                        }))
                      }
                      min={10}
                      max={10000}
                      className="input-basic mt-1 w-full rounded bg-gray-100 dark:bg-neutral-700 text-center border dark:border-neutral-600 dark:text-gray-200 py-2"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label>{t('calculator.targetLoops')}</label>

                    <div className="flex items-center justify-between mt-1 w-full rounded bg-gray-100 dark:bg-neutral-700 border dark:border-neutral-600 overflow-hidden">
                      <CustomNumberInput
                        // type="number"
                        value={(simConfig && simConfig.targetLoops) || null}
                        onChange={(e) =>
                          setSimConfig((simConfig) => ({
                            ...simConfig,
                            targetLoops: e || 1,
                          }))
                        }
                        min={1}
                        max={99}
                        className="grow bg-transparent text-center dark:text-gray-200 focus:outline-none py-2"
                      />

                      {(() => {
                        const isMaximizeDisabled = !simResult || !conversionTargetInfo || (remainingCurrency[conversionTargetInfo?.targetItemId || 0] || 0) >= 0;
                        const maximizeTooltipText = isMaximizeDisabled
                          ? !conversionTargetInfo
                            ? t('calculator.maximizeTooltipNoTarget')
                            : (remainingCurrency[conversionTargetInfo?.targetItemId || 0] || 0) >= 0
                              ? t('calculator.maximizeTooltipNoDeficit')
                              : t('calculator.runSimFirst')
                          : t('calculator.maximizeTooltip');
                        return (
                          <Tooltip placement="top" overlay={<span>{maximizeTooltipText}</span>} trigger={['hover']} mouseEnterDelay={0.1}>
                            <div className={`shrink-0 ${isMaximizeDisabled ? 'cursor-not-allowed' : ''}`}>
                              <button
                                onClick={handleMaximizeLoops}
                                disabled={isMaximizeDisabled}
                                className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 text-base disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {t('calculator.maximizeButtonShort')}
                              </button>
                            </div>
                          </Tooltip>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simConfig && !simConfig.isFirstRun}
                      onChange={(e) =>
                        setSimConfig((simConfig) => ({
                          ...simConfig,
                          isFirstRun: !e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded"
                    />
                    {t('calculator.isNotFirstRun')}
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simConfig && simConfig.clearedFirstRewards}
                      onChange={(e) =>
                        setSimConfig((simConfig) => ({
                          ...simConfig,
                          clearedFirstRewards: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded"
                    />
                    {t('calculator.clearedFirstRewards')}
                  </label>
                </div>
                <div className="flex items-center gap-4 pt-2">
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id={`dream-convert-ep-${eventId}`}
                      checked={useLeftoverEpConversion}
                      onChange={(e) => setUseLeftoverEpConversion(e.target.checked)}
                      disabled={!conversionTargetInfo}
                      className="h-4 w-4 rounded"
                    />
                    <label htmlFor={`dream-convert-ep-${eventId}`} className={`cursor-pointer ${!conversionTargetInfo ? 'text-gray-400' : ''}`}>
                      {t('calculator.convertLeftoverEp')}
                      {!conversionTargetInfo && ` (${t('calculator.noConversionTarget')})`}
                    </label>
                  </div>
                  {useLeftoverEpConversion && conversionTargetInfo && <p className="text-xs text-gray-500 dark:text-gray-400 pl-6"></p>}
                </div>

                {simConfig && !simConfig.isFirstRun && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">{t('calculator.initialStats')}</label>
                    <div className="grid grid-cols-4 gap-2">
                      {dreamData.parameter.map((p) => (
                        <div key={p.ParameterType}>
                          {' '}
                          <label className="text-[10px]">{p.LocalizeEtc?.[locale_key]}</label>
                          <CustomNumberInput
                            min={p.ParameterMin}
                            max={p.ParameterMax}
                            placeholder={`${p.ParameterMin}-${p.ParameterMax}`}
                            value={simConfig && (simConfig.initialStats?.[p.ParameterType] ?? null)}
                            onChange={(e) => handleInitialStatChange(p.ParameterType, e || NaN)}
                            className="input-basic text-xs p-0.5"
                          />{' '}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="font-semibold">{t('calculator.strategy')}</label>
                  <div className="space-y-1 mt-1">
                    {strategyOptions.map((opt) => (
                      <label key={opt.id} className="flex items-start gap-2 text-xs p-2 rounded-md has-checked:bg-blue-50 dark:has-checked:bg-blue-900/30 cursor-pointer">
                        <input
                          type="radio"
                          name="dreamMakerStrategy"
                          value={opt.id}
                          checked={simConfig && simConfig.strategy === opt.id}
                          onChange={(e) =>
                            setSimConfig((simConfig) => ({
                              ...simConfig,
                              strategy: e.target.value as DreamMakerStrategy,
                            }))
                          }
                        />
                        <div>
                          <span className="font-bold">{opt.name}</span>
                          <p className="text-gray-500 dark:text-gray-400">{opt.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              {/* END CONDITION REMOVED */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={handleRunSimulation} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 rounded-lg text-base">
                  {t('calculator.runButton')}
                </button>
                <button onClick={() => setShowInteractiveSim(true)} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 rounded-lg text-base">
                  {t('calculator.runInteractiveButton')}
                </button>
              </div>

              {(interactiveResult || simResult) && (
                <>
                  <SimulationResultDisplay
                    result={interactiveResult || simResult!}
                    title={interactiveResult ? t('calculator.interactiveResultTitle') : t('calculator.resultsTitle')}
                    description={
                      interactiveResult
                        ? 'This is the result of the direct play.'
                        : t('calculator.resultsDescLoops', {
                            loops: simConfig && simConfig.targetLoops,
                          })
                    }
                    eventData={eventData}
                    iconData={iconData}
                    avgPtDisplayMode={avgPtDisplayMode}
                    setAvgPtDisplayMode={setAvgPtDisplayMode}
                  />

                  {/* AP Efficiency Display */}
                  {conversionTargetInfo && simResult && entryCurrencyApCost !== Infinity && simResult.avgActions > 0 && (
                    <div className="text-center text-xs text-gray-600 dark:text-gray-400 pt-3 border-t dark:border-neutral-600">
                      <h4 className="font-semibold mb-1">{t('calculator.apEfficiencyTitle')}</h4>
                      {(() => {
                        const rfiId = conversionTargetInfo.targetItemId;
                        const rfiKey = `${conversionTargetInfo.targetItemType}_${rfiId}`;
                        const avgRfiFromDrops = simResult.avgRewards[rfiKey] || 0;
                        const avgRfiFromEp = useLeftoverEpConversion ? simResult.avgEventPoints * conversionTargetInfo.efficiency : 0;
                        const totalAvgRfiGained = avgRfiFromDrops + avgRfiFromEp;

                        const totalAvgApCost = (simResult.avgCost[costKey || ''] || 0) * entryCurrencyApCost;

                        if (totalAvgRfiGained > 0 && totalAvgApCost > 0) {
                          const apPerRfi = totalAvgApCost / totalAvgRfiGained;
                          const rfiItemName = eventData?.icons?.Item?.[rfiId]?.LocalizeEtc?.[('Name' + locale_key) as keyof LocalizeEtc] || `Item ${rfiId}`;
                          return (
                            <p>
                              {t('calculator.apEfficiencyResult', {
                                efficiency: apPerRfi.toFixed(2),
                                itemName: rfiItemName,
                              })}
                            </p>
                          );
                        } else {
                          return <p className="text-red-500">{t('calculator.apEfficiencyError')}</p>;
                        }
                      })()}
                      <p className="text-[10px] text-gray-400 mt-1">
                        {t('calculator.apEfficiencyNote', {
                          apCost: entryCurrencyApCost.toFixed(2),
                        })}
                      </p>
                    </div>
                  )}
                </>
              )}

              {showInteractiveSim && dreamData && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <DreamMakerInteractiveSimulator
                    dreamData={dreamData}
                    eventData={eventData}
                    iconData={iconData}
                    initialConfig={simConfig || defaultDreamMakerConfig} // Pass current config as starting point
                    onComplete={(result) => {
                      setInteractiveResult(result);
                      setShowInteractiveSim(false); // Close after completion
                    }}
                    onClose={() => setShowInteractiveSim(false)} // Button to close manually
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
