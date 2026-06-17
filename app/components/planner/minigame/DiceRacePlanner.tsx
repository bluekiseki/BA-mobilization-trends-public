// app/components/planner/minigame/DiceRacePlanner.tsx
import { useState, useCallback, useEffect } from 'react';
import { ItemIcon } from '../common/Icon';
import { SimRunButton } from '../common/SimRunButton';
import type { EventData, IconData } from '~/types/plannerData';
import { useEventSettings } from '~/store/planner/useSettingsStore';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';

import { useTranslation } from 'react-i18next';
import { type DiceRaceSimConfig, DefaultDiceRaceSimConfig } from '~/types/minigame/diceRace';
import type { WithNonNullable } from '~/utils/WithNonNullable';
import { runAsync } from '~/utils/runAsync';

export type { DiceRaceSimConfig };
export { DefaultDiceRaceSimConfig };

// --- Type definitions ---
export type DiceRaceTab = 'overview' | 'calculator';

interface DiceRacePlannerProps {
  eventId: number;
  eventData: WithNonNullable<EventData, 'currency' | 'dice_race'>;
  iconData: IconData;
  onCalculate: (result: DiceRaceResult | null) => void;
  // remainingCurrency: Record<number, number>;
}

export type DiceRaceResult = {
  cost: Record<string, number>;
  rewards: Record<string, number>;
};

const runSimulation = (
  diceRaceData: EventData['dice_race'],
  simConfig: DiceRaceSimConfig,
  eventData: WithNonNullable<EventData, 'currency' | 'dice_race'>, // currency data for checking fixed dice
): {
  avgCost: Record<string, number>;
  avgRewards: Record<string, number>;
  avgRolls: number;
} => {
  if (!diceRaceData || simConfig.simRuns <= 0) return { avgCost: {}, avgRewards: {}, avgRolls: 0 };

  const { simRuns, startLap, startPos, ownedFixedDice, endConditionType, targetLap, targetPos, targetItemId, targetItemAmount, fixedDicePriority } = simConfig;
  const { race_node, total_reward, info } = diceRaceData;
  const boardSize = race_node.length;
  const costInfo = info[0].DiceCostGoods;
  const costPerRoll = costInfo.ConsumeParcelAmount[0];
  const costKey = `${costInfo.ConsumeParcelTypeStr[0]}_${costInfo.ConsumeParcelId[0]}`;
  // Set for quick lookup of fixed dice item IDs
  const fixedDiceItemIds = new Set(eventData.currency.map((c) => c.ItemUniqueId));

  const totalSimCost: Record<string, number> = {};
  const totalSimRewards: Record<string, number> = {};
  let totalRolls = 0;

  for (let i = 0; i < simRuns; i++) {
    let currentLap = startLap;
    let currentPos = startPos;
    const currentFixedDice = { ...ownedFixedDice };
    const accumulatedRewards: Record<string, number> = {};
    let rollsInThisRun = 0;

    const movePlayer = (diceValue: number) => {
      let newPos = currentPos + diceValue;
      if (newPos >= boardSize) {
        currentLap++;
        newPos %= boardSize;
        const lapReward = total_reward.find((r) => r.RequiredLapFinishCount === currentLap);

        if (lapReward) {
          lapReward.RewardParcelId.forEach((id, index) => {
            const type = lapReward.RewardParcelTypeStr[index];
            const itemInfo = eventData.icons[type]?.[id];

            // Handle fixed die rewards from laps
            if (itemInfo && 'UsingResultParcelTypeStr' in itemInfo && itemInfo.UsingResultParcelTypeStr === 'GachaGroup' && fixedDiceItemIds.has(id)) {
              const randomDie = Math.floor(Math.random() * 6) + 1;
              currentFixedDice[randomDie as 1]++;
            } else {
              const key = `${type}_${id}`;
              accumulatedRewards[key] = (accumulatedRewards[key] || 0) + lapReward.RewardParcelAmount[index];
            }
          });
        }
      }
      currentPos = newPos;
      const landedNode = race_node[currentPos];
      if (landedNode.EventContentDiceRaceNodeType === 2) {
        movePlayer(landedNode.MoveForwardTypeArg ?? 0);
      } else if (landedNode.RewardParcelId) {
        landedNode.RewardParcelId.forEach((id, index) => {
          const type = landedNode.RewardParcelTypeStr[index];
          const itemInfo = eventData.icons[type]?.[id];

          // Handle fixed die rewards from nodes
          if (itemInfo && 'UsingResultParcelTypeStr' in itemInfo && itemInfo?.UsingResultParcelTypeStr === 'GachaGroup' && fixedDiceItemIds.has(id)) {
            const randomDie = Math.floor(Math.random() * 6) + 1;
            currentFixedDice[randomDie as 1]++;
          } else {
            const key = `${type}_${id}`;
            accumulatedRewards[key] = (accumulatedRewards[key] || 0) + (landedNode.RewardAmount?.[index] ?? 0);
          }
        });
      }
    };

    while (rollsInThisRun < 5000) {
      if (endConditionType === 'lap_pos' && (currentLap > targetLap || (currentLap === targetLap && currentPos >= targetPos))) break;
      if (endConditionType === 'item' && (accumulatedRewards[`Item_${targetItemId}`] || 0) >= targetItemAmount) break;

      let usedFixedDie = false;
      for (let die = 6; die >= 1; die--) {
        if (currentFixedDice[die as 1] > 0) {
          const landingPos = (currentPos + die) % boardSize;
          if (fixedDicePriority.includes(landingPos)) {
            currentFixedDice[die as 1]--;
            movePlayer(die);
            usedFixedDie = true;
            break;
          }
        }
      }
      if (usedFixedDie) continue;

      rollsInThisRun++;
      const roll = Math.floor(Math.random() * 6) + 1;
      movePlayer(roll);
    }

    totalRolls += rollsInThisRun;
    totalSimCost[costKey] = (totalSimCost[costKey] || 0) + rollsInThisRun * costPerRoll;
    for (const [key, amount] of Object.entries(accumulatedRewards)) {
      totalSimRewards[key] = (totalSimRewards[key] || 0) + amount;
    }
  }

  const avgCost: Record<string, number> = {};
  const avgRewards: Record<string, number> = {};
  for (const [key, amount] of Object.entries(totalSimCost)) {
    avgCost[key] = amount / simRuns;
  }
  for (const [key, amount] of Object.entries(totalSimRewards)) {
    avgRewards[key] = amount / simRuns;
  }

  const avgRolls = totalRolls / simConfig.simRuns;
  return { avgCost, avgRewards, avgRolls };
};

export const DiceRacePlanner = ({ eventId, eventData, iconData, onCalculate /*remainingCurrency*/ }: DiceRacePlannerProps) => {
  const [isRunning, setIsRunning] = useState(false);
  const { setDiceRaceSimConfig: setSimConfig, diceRaceSimConfig: simConfig } = usePlanForEvent(eventId);

  // const [simResult, setSimResult] = useState<{ avgCost: Record<string, number>, avgRewards: Record<string, number>, avgRolls: number } | null>(null);
  const { diceRaceActiveTab: activeTab, setDiceRaceActiveTab: setActiveTab, diceRaceSimResult: simResult, setDiceRaceSimResult: setSimResult } = useEventSettings(eventId);

  const { t } = useTranslation('planner', { keyPrefix: 'dice_race' });

  const diceRaceData = eventData.dice_race;

  if (!simConfig) return null;

  const handleRunSimulation = useCallback(() => {
    if (!diceRaceData) return;
    setIsRunning(true);
    void runAsync(() => {
      const result = runSimulation(diceRaceData, simConfig, eventData);
      setSimResult(result);
    }).finally(() => setIsRunning(false));
  }, [simConfig, diceRaceData, eventData.currency]);

  useEffect(() => {
    if (simResult) {
      onCalculate({
        cost: simResult.avgCost,
        rewards: simResult.avgRewards,
      });
    } else {
      onCalculate(null);
    }
  }, [simResult, onCalculate]);

  const handlePriorityToggle = (nodeId: number) => {
    setSimConfig((prev) => {
      const newPrio = new Set(prev.fixedDicePriority);
      if (newPrio.has(nodeId)) {
        newPrio.delete(nodeId);
      } else {
        newPrio.add(nodeId);
      }
      return { ...prev, fixedDicePriority: [...newPrio] };
    });
  };

  if (!diceRaceData) return null;
  const tabs: { id: DiceRaceTab; name: string }[] = [
    { id: 'overview', name: t('tabOverview') },
    { id: 'calculator', name: t('tabCalculator') },
  ];

  return (
    <>
      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('title')}</h2>
      <div className="mt-4 space-y-4">
        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${activeTab === tab.id ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400' : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'}`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {/* 'Overview' Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h3 className="font-bold mb-2 dark:text-neutral-200">{t('rewardsPerNode')}</h3>
              <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-10 gap-3">
                {diceRaceData.race_node.map((node) => {
                  const nodeType = node.EventContentDiceRaceNodeType;
                  let titleText = t('nodeLabel', { id: node.NodeId });
                  let titleColor = 'text-blue-600 dark:text-blue-400';
                  let content;
                  switch (nodeType) {
                    case 0:
                      titleText = t('startFinishNode');
                      titleColor = 'text-green-600 dark:text-green-400';
                      content = node.RewardParcelId?.map((id, index) => (
                        <ItemIcon key={index} type={node.RewardParcelTypeStr[index]} itemId={String(id)} amount={node.RewardAmount[index]} size={8} eventData={eventData} iconData={iconData} />
                      ));
                      break;
                    case 1:
                      content = node.RewardParcelId?.map((id, index) => (
                        <ItemIcon key={index} type={node.RewardParcelTypeStr[index]} itemId={String(id)} amount={node.RewardAmount[index]} size={8} eventData={eventData} iconData={iconData} />
                      ));
                      break;
                    case 2:
                      titleColor = 'text-purple-600 dark:text-purple-400';
                      content = (
                        <div className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                          {t('moveForward', {
                            count: node.MoveForwardTypeArg,
                          })}
                        </div>
                      );
                      break;
                    case 3:
                      titleColor = 'text-amber-500 dark:text-amber-400';
                      content = node.RewardParcelId?.map((id, index) => (
                        <ItemIcon
                          key={index}
                          type={node.RewardParcelTypeStr?.[index] ?? ''}
                          itemId={String(id)}
                          amount={node.RewardAmount?.[index] ?? 0}
                          size={8}
                          eventData={eventData}
                          iconData={iconData}
                        />
                      ));
                      break;
                    default:
                      content = null;
                  }
                  return (
                    <div key={node.NodeId} className="bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded-lg">
                      <p className={`font-bold text-sm ${titleColor}`}>{titleText}</p>
                      <div className="flex flex-wrap gap-1 mt-1 min-h-[36px] items-center">{content}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="font-bold mb-2 dark:text-neutral-200">{t('lapRewards')}</h3>
              <div className="space-y-2">
                {diceRaceData.total_reward.map((reward) => (
                  <div key={reward.RequiredLapFinishCount} className="bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded-lg flex items-center justify-between">
                    <p className="font-bold text-sm text-purple-600 dark:text-purple-400">
                      {t('lapFinishCount', {
                        count: reward.RequiredLapFinishCount,
                      })}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {reward.RewardParcelId.map((id, index) => (
                        <ItemIcon
                          key={index}
                          type={reward.RewardParcelTypeStr[index]}
                          itemId={String(id)}
                          amount={reward.RewardParcelAmount[index]}
                          size={8}
                          eventData={eventData}
                          iconData={iconData}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 'Calculator' Tab Content */}
        {activeTab === 'calculator' && (
          <div className="p-4 rounded-b-lg bg-neutral-50 dark:bg-neutral-800/50 space-y-6 text-sm">
            <div className="space-y-4 border-b dark:border-neutral-700 pb-4">
              <h3 className="font-bold text-base dark:text-neutral-200">{t('simSettingsTitle')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="dark:text-neutral-300">{t('startLap')}</label>
                  <input
                    type="number"
                    min={1}
                    value={simConfig.startLap}
                    onChange={(e) => setSimConfig((p) => ({ ...p, startLap: parseInt(e.target.value) || 1 }))}
                    className="w-full p-1 border rounded mt-1 dark:bg-neutral-700 dark:border-neutral-600"
                  />
                </div>
                <div>
                  <label className="dark:text-neutral-300">{t('startPos')}</label>
                  <input
                    type="number"
                    min={0}
                    max={diceRaceData.race_node.length - 1}
                    value={simConfig.startPos}
                    onChange={(e) => setSimConfig((p) => ({ ...p, startPos: parseInt(e.target.value) || 0 }))}
                    className="w-full p-1 border rounded mt-1 dark:bg-neutral-700 dark:border-neutral-600"
                  />
                </div>
                <div>
                  <label className="dark:text-neutral-300">{t('simRuns')}</label>
                  <input
                    type="number"
                    min={1}
                    value={simConfig.simRuns}
                    onChange={(e) => setSimConfig((p) => ({ ...p, simRuns: parseInt(e.target.value) || 1 }))}
                    className="w-full p-1 border rounded mt-1 dark:bg-neutral-700 dark:border-neutral-600"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold dark:text-neutral-300">{t('ownedFixedDice')}</label>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-1">
                  {Object.keys(simConfig.ownedFixedDice).map((die) => (
                    <div key={die}>
                      <label className="dark:text-neutral-400">{die}</label>
                      <input
                        type="number"
                        min={0}
                        value={simConfig.ownedFixedDice[die]}
                        onChange={(e) =>
                          setSimConfig((p) => ({
                            ...p,
                            ownedFixedDice: { ...p.ownedFixedDice, [die]: parseInt(e.target.value) || 0 },
                          }))
                        }
                        className="w-full p-1 border rounded dark:bg-neutral-700 dark:border-neutral-600"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4 border-b dark:border-neutral-700 pb-4">
              <h3 className="font-bold text-base dark:text-neutral-200">{t('endConditionTitle')}</h3>
              <div className="flex gap-4 dark:text-neutral-300">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="end-cond"
                    value="lap_pos"
                    checked={simConfig.endConditionType === 'lap_pos'}
                    onChange={() => setSimConfig((p) => ({ ...p, endConditionType: 'lap_pos' }))}
                  />
                  {t('endConditionByLap')}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="end-cond" value="item" checked={simConfig.endConditionType === 'item'} onChange={() => setSimConfig((p) => ({ ...p, endConditionType: 'item' }))} />
                  {t('endConditionByItem')}
                </label>
              </div>
              {simConfig.endConditionType === 'lap_pos' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label>{t('targetLap')}</label>
                    <input
                      type="number"
                      min={1}
                      value={simConfig.targetLap}
                      onChange={(e) =>
                        setSimConfig((p) => ({
                          ...p,
                          targetLap: parseInt(e.target.value) || 1,
                        }))
                      }
                      className="w-full p-1 border rounded mt-1"
                    />
                  </div>
                  <div>
                    <label>{t('targetPos')}</label>
                    <input
                      type="number"
                      min={0}
                      max={diceRaceData.race_node.length - 1}
                      value={simConfig.targetPos}
                      onChange={(e) =>
                        setSimConfig((p) => ({
                          ...p,
                          targetPos: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="w-full p-1 border rounded mt-1"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label>{t('targetItem')}</label>
                    <input
                      type="number"
                      placeholder="Item ID"
                      value={simConfig.targetItemId || ''}
                      onChange={(e) =>
                        setSimConfig((p) => ({
                          ...p,
                          targetItemId: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="w-full p-1 border rounded mt-1"
                    />
                  </div>
                  <div>
                    <label>{t('targetAmount')}</label>
                    <input
                      type="number"
                      value={simConfig.targetItemAmount || ''}
                      onChange={(e) =>
                        setSimConfig((p) => ({
                          ...p,
                          targetItemAmount: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="w-full p-1 border rounded mt-1"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 border-b dark:border-neutral-700 pb-4">
              <h3 className="font-bold text-base dark:text-neutral-200">{t('strategyTitle')}</h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">{t('strategyDescription')}</p>
              <div className="flex flex-wrap gap-1.5">
                {diceRaceData.race_node.map((node) => {
                  const isPriority = simConfig.fixedDicePriority.includes(node.NodeId);
                  let content;
                  switch (node.EventContentDiceRaceNodeType) {
                    case 2:
                      content = <span className="text-xs font-bold text-purple-700">move +{node.MoveForwardTypeArg}</span>;
                      break;
                    case 0:
                    case 1:
                    case 3:
                      if (node.RewardParcelId && node.RewardParcelId.length > 0) {
                        const type = node.RewardParcelTypeStr?.[0] ?? '';
                        const id = node.RewardParcelId[0];
                        content = <img src={`data:image/webp;base64,${iconData[type]?.[String(id)]}`} className="w-5 h-5 object-cover" />;
                      }
                      break;
                    default:
                      content = null;
                  }
                  return (
                    <button
                      key={node.NodeId}
                      onClick={() => handlePriorityToggle(node.NodeId)}
                      className={`p-1 w-12 h-12 flex flex-col items-center justify-center rounded border text-center ${isPriority ? 'bg-purple-200 dark:bg-purple-900/50 border-purple-500' : 'bg-white dark:bg-neutral-700 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600'}`}
                    >
                      <span className={`font-bold text-xs ${isPriority ? 'text-purple-800 dark:text-purple-300' : 'text-neutral-600 dark:text-neutral-400'}`}>{node.NodeId}</span>
                      <div className="grow flex items-center justify-center">{content}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <SimRunButton
              isRunning={isRunning}
              onClick={handleRunSimulation}
              className="w-full bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white font-bold py-2 rounded-lg text-base"
            >
              {t('runSimulation')}
            </SimRunButton>

            {simResult && (
              <div className="pt-4 border-t dark:border-neutral-700">
                <h3 className="font-bold text-base dark:text-neutral-200">{t('simResultTitle')}</h3>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">{t('simResultDescription')}</p>

                <div className="mt-2 text-center bg-white dark:bg-neutral-800 p-2 rounded-lg">
                  <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">{t('avgRolls')}</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {simResult.avgRolls.toFixed(2)} {t('rollsUnit')}
                  </p>
                </div>

                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-red-50 dark:bg-red-900/40 p-3 rounded-lg">
                    <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('avgCost')}</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(simResult.avgCost).map(([key, amount]) => (
                        <ItemIcon key={key} type={key.split('_')[0]} itemId={key.split('_')[1]} amount={amount} size={12} eventData={eventData} iconData={iconData} />
                      ))}
                    </div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/40 p-3 rounded-lg">
                    <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('avgRewards')}</h4>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                      {Object.entries(simResult.avgRewards)
                        .sort(([, a], [, b]) => b - a)
                        .map(([key, amount]) => (
                          <ItemIcon key={key} type={key.split('_')[0]} itemId={key.split('_')[1]} amount={amount} size={12} eventData={eventData} iconData={iconData} />
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
