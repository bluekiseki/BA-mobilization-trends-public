import { useState, useCallback, useEffect, useMemo } from 'react';
import { ItemIcon } from '../common/Icon';
import type { LocalizeEtc, MinigameMission } from '~/types/plannerData';
import { runSimulation } from './dreamMaker/simulation';

import { useTranslation } from 'react-i18next';
import { DreamMakerInteractiveSimulator } from './dreamMaker/DreamMakerInteractiveSimulator';
import { SimulationResultDisplay } from './dreamMaker/SimulationResultDisplay';
import type { Locale } from '~/utils/i18n/config';
import { getlocaleMethond } from '../common/locale';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { defaultDreamMakerConfig, type DreamMakerPlannerProps, type DreamMakerResult, type DreamMakerStrategy, type DreamMakerTab } from './dreamMaker/type';
import { useEventSettings } from '~/store/planner/useSettingsStore';
import 'rc-tooltip/assets/bootstrap.css';
import Tooltip from 'rc-tooltip';
import { CustomNumberInput } from '~/components/CustomInput';
import { applyRepeatableEventBonus } from '~/utils/eventBonus';

// --- React Component ---
export const DreamMakerPlanner = ({ eventId, eventData, iconData, onCalculate, remainingCurrency, totalBonus }: DreamMakerPlannerProps) => {
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'dream_maker' });
  const { t: t_ui } = useTranslation('ui');
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
    const allStages = eventData.stage?.stage;
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
      const effectiveDropAmount = applyRepeatableEventBonus(baseDropAmount, bonusPercent); // Effective amount per run including bonus

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
    const result = runSimulation(dreamData, simConfig /*,eventData*/);
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
      const finalCost = { ...simResult.avgCost };
      const finalRewards = { ...simResult.avgRewards }; // Start with sim rewards

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
        // If conversion is disabled, force this item's count to 0 (may override a manual
        // value set elsewhere — a dedicated state slice for auto-purchases would be safer).

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
    { id: 'overview', name: t_ui('overview') },
    { id: 'missions', name: t_ui('mission') },
    { id: 'calculator', name: t_ui('calculator') },
  ];
  // const eventPointItemId = dreamData.info[0].DreamMakerDailyPointId;
  // const eventPointItemType = dreamData.info[0].DreamMakerDailyPointParcelTypeStr;
  // const eventPointKey = `${eventPointItemType}_${eventPointItemId}`;

  const formatMissionDesc = (mission: MinigameMission): string => {
    let desc = mission.DescriptionStr[locale_key];
    const count = String(mission.CompleteConditionCount);
    const targetId = mission.CompleteConditionParameter[1];
    const descKey = mission.Description;

    try {
      if (descKey === 115001602) {
        const paramName = dreamData.parameter.find((p) => p.Id === targetId)?.LocalizeEtc?.[locale_key] || `Parameter ${targetId}`;
        desc = desc.replace('{0}', paramName).replace('{1}', count);
      } else if (descKey === 2390087899) {
        const scheduleName = dreamData.schedule.find((s) => s.DreamMakerScheduleGroupId === targetId)?.LocalizeEtc?.[locale_key] || `Schedule ${targetId}`;
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
  const validResult = interactiveResult || simResult;

  return (
    <div className="">
      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('title')} (BETA)</h2>
      <div className="mt-4 space-y-4">
        <div className="flex border-b border-neutral-200 dark:border-neutral-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-neutral-500 hover:border-neutral-300'}`}
            >
              {tab.name}
            </button>
          ))}
        </div>
        {activeTab === 'overview' && (
          <div className="space-y-6 text-sm dark:text-neutral-300">
            <div>
              <h3 className="font-bold mb-2 text-base dark:text-neutral-100">{t('overview.parameters')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {dreamData.parameter.map((p) => (
                  <div key={p.Id} className="flex flex-col items-center p-2 bg-neutral-50 dark:bg-neutral-700/50 rounded-lg">
                    <span className="font-semibold">{p.LocalizeEtc?.[locale_key]}</span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      ({p.ParameterMin}~{p.ParameterMax})
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-bold mb-2 text-base dark:text-neutral-100">{t('overview.schedules')}</h3>
              <div className="space-y-4">
                {dreamData.schedule.map((s) => {
                  const resultsForSchedule = dreamData.schedule_result.filter((res) => res.DreamMakerScheduleGroup === s.DreamMakerScheduleGroupId);
                  return (
                    <div key={s.DreamMakerScheduleGroupId} className="p-3 overflow-x-scroll">
                      <p className="font-semibold text-center mb-2 text-base">{s.LocalizeEtc?.[locale_key]}</p>
                      <table className="w-full min-w-75 text-xs text-center border-collapse">
                        <thead>
                          <tr className="bg-neutral-200 dark:bg-neutral-600">
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
                            <tr key={res.Id} className="odd:bg-white dark:odd:bg-neutral-700 even:bg-neutral-100 dark:even:bg-neutral-600/50">
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
                                let textColor = 'text-neutral-500 dark:text-neutral-400';
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
              <h3 className="font-bold mb-2 text-base dark:text-neutral-100">{t('overview.endingRewards')}</h3>
              <div className="space-y-3">
                {dreamData.ending_reward.map((reward, index) => (
                  <div key={index} className="p-3 bg-neutral-50 dark:bg-neutral-700/50 rounded-lg">
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
          <div className="p-4 rounded-b-lg bg-neutral-50 dark:bg-neutral-700/50 space-y-2">
            <div className="flex justify-end gap-2 mb-2">
              <button onClick={handleSelectAllMissions} className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">
                {t_ui('selectAll')}
              </button>
              <button onClick={handleDeselectAllMissions} className="text-xs bg-neutral-400 text-white px-2 py-1 rounded hover:bg-neutral-500">
                {t_ui('deselectAll')}
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
              <h3 className="font-bold text-base dark:text-neutral-100">{t('calculator.settingsTitle')}</h3>
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
                    className="input-basic mt-1 w-full rounded bg-neutral-100 dark:bg-neutral-700 text-center border dark:border-neutral-600 dark:text-neutral-200 py-2"
                  />
                </div>

                <div className="flex flex-col">
                  <label>{t('calculator.targetLoops')}</label>

                  <div className="flex items-center justify-between mt-1 w-full rounded bg-neutral-100 dark:bg-neutral-700 border dark:border-neutral-600 overflow-hidden">
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
                      className="grow bg-transparent text-center dark:text-neutral-200 focus:outline-none py-2"
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
                  <label htmlFor={`dream-convert-ep-${eventId}`} className={`cursor-pointer ${!conversionTargetInfo ? 'text-neutral-400' : ''}`}>
                    {t('calculator.convertLeftoverEp')}
                    {!conversionTargetInfo && ` (${t('calculator.noConversionTarget')})`}
                  </label>
                </div>
                {useLeftoverEpConversion && conversionTargetInfo && <p className="text-xs text-neutral-500 dark:text-neutral-400 pl-6"></p>}
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
                        <p className="text-neutral-500 dark:text-neutral-400">{opt.description}</p>
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

            {validResult && (
              <>
                <SimulationResultDisplay
                  result={validResult}
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
                  <div className="text-center text-xs text-neutral-600 dark:text-neutral-400 pt-3 border-t dark:border-neutral-600">
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
                    <p className="text-[10px] text-neutral-400 mt-1">
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
    </div>
  );
};
