// app/components/planner/minigame/MinigameCCGPlanner.tsx
import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ItemIcon } from '../common/Icon';
import { CustomNumberInput } from '~/components/CustomInput';
import type { EventData, IconData } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { type CcgRunInput } from '~/types/minigame/ccg';

export type { CcgRunInput };

// Result Type Definition
export type MinigameCCGResult = {
  cost: Record<string, number>;
  rewards: Record<string, number>;
};

interface MinigameCCGPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  remainingCurrency: Record<number, number>;
  onCalculate?: (result: MinigameCCGResult) => void;
}

const getStageLabel = (minPoint: number) => {
  const area = Math.ceil(minPoint / 7);
  const stage = ((minPoint - 1) % 7) + 1;
  return `${area}-${stage}`;
};

export const MinigameCCGPlanner: React.FC<MinigameCCGPlannerProps> = ({ eventId, eventData, iconData, remainingCurrency, onCalculate }) => {
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'minigame_ccg' });
  const locale = i18n.language as Locale;

  const [activeTab, setActiveTab] = useState<'overview' | 'mission' | 'calc'>('overview');

  // --- Data Extraction ---
  const ccgData = eventData.minigame_ccg;
  const missions = eventData.minigame_mission || [];
  const gameInfo = ccgData?.info?.[0];
  const rewardItems = ccgData?.reward_item || [];

  const entryCost = gameInfo?.CostParcelAmount || 2000;
  const entryItemId = gameInfo?.CostParcelId || 80650;
  const entryItemTypeStr = gameInfo?.CostParcelTypeStr || 'Item';
  const currentCurrencyAmount = remainingCurrency[entryItemId] || 0;

  // --- Store State & Initialization ---
  const { plan, setMinigameMissionStatus, setMinigameCCGConfig } = usePlanForEvent(eventId);

  const { minigameCCGConfig, minigameMissionStatus } = plan;

  // Initialize state if undefined — must check plan.* directly since usePlanForEvent applies defaults
  useEffect(() => {
    if (plan.minigameMissionStatus === undefined) {
      setMinigameMissionStatus({});
    }
    if (plan.minigameCCGConfig === undefined) {
      setMinigameCCGConfig([{ id: 'initial', stage: 21, count: 0 }]);
    }
  }, [plan.minigameMissionStatus, plan.minigameCCGConfig]);

  const prevResultRef = useRef<string>('');

  const runInputs = minigameCCGConfig ?? [];
  const missionStatusSafe = minigameMissionStatus ?? {};

  // --- Reward Grouping for Overview Table ---
  const rewardsByStage = useMemo(() => {
    const grouped = new Map<number, typeof rewardItems>();

    rewardItems.forEach((item) => {
      const list = grouped.get(item.MinPoint) || [];
      list.push(item);
      grouped.set(item.MinPoint, list);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([minPoint, items]) => ({
        stageLabel: getStageLabel(minPoint),
        minPoint,
        items,
      }));
  }, [rewardItems]);

  // 1. Calculate Mission Rewards (Selected Only)
  const missionRewards = useMemo(() => {
    const rewards: Record<string, number> = {};
    missions.forEach((mission) => {
      if (missionStatusSafe[mission.Id]) {
        mission.MissionRewardParcelId.forEach((rid, idx) => {
          const type = mission.MissionRewardParcelTypeStr[idx];
          const amount = mission.MissionRewardAmount[idx];
          const key = `${type}_${rid}`;
          rewards[key] = (rewards[key] || 0) + amount;
        });
      }
    });
    return rewards;
  }, [missions, missionStatusSafe]);

  // 2. Calculate Simulation Rewards (Run Inputs Only) - For UI Display
  const calcRewards = useMemo(() => {
    const rewards: Record<string, number> = {};
    let totalRuns = 0;
    let totalCost = 0;

    runInputs.forEach((input) => {
      if (input.count <= 0) return;
      totalRuns += input.count;
      totalCost += input.count * entryCost;

      const stageRewards = rewardItems.filter((r) => r.MinPoint <= input.stage);
      stageRewards.forEach((r) => {
        const key = `${r.RewardParcelTypeStr}_${r.RewardParcelId}`;
        rewards[key] = (rewards[key] || 0) + r.RewardParcelAmount * input.count;
      });
    });

    return { rewards, totalRuns, totalCost };
  }, [runInputs, rewardItems, entryCost]);

  // 3. Emit Combined Results (Simulation + Missions) to Parent
  useEffect(() => {
    if (!onCalculate) return;

    const totalRewards = { ...calcRewards.rewards };
    Object.entries(missionRewards).forEach(([key, amount]) => {
      totalRewards[key] = (totalRewards[key] || 0) + amount;
    });

    const costKey = `${entryItemTypeStr}_${entryItemId}`;
    const result: MinigameCCGResult = {
      cost: { [costKey]: calcRewards.totalCost },
      rewards: totalRewards,
    };

    const resultStr = JSON.stringify(result);
    if (resultStr === prevResultRef.current) return;
    prevResultRef.current = resultStr;

    onCalculate(result);
  }, [calcRewards, missionRewards, entryItemTypeStr, entryItemId]);

  const stageOptions = useMemo(() => {
    const opts = [];
    for (let i = 1; i <= 21; i++) {
      opts.push({ value: i, label: getStageLabel(i) });
    }
    return opts.reverse();
  }, []);

  const formatMissionDesc = (mission: (typeof missions)[0]) => {
    let desc: string;
    if (locale === 'ko') desc = mission.DescriptionStr.Kr || mission.DescriptionStr.Jp || mission.DescriptionStr.En || '';
    else if (locale === 'ja') desc = mission.DescriptionStr.Jp || mission.DescriptionStr.Kr || mission.DescriptionStr.En || '';
    else if (locale === 'zh-Hant') desc = mission.DescriptionStr.Tw || mission.DescriptionStr.En || '';
    else desc = mission.DescriptionStr.En || mission.DescriptionStr.Jp || mission.DescriptionStr.Kr || '';
    return desc.replace('{0}', mission.CompleteConditionCount.toLocaleString());
  };

  const toggleMission = (missionId: number) => {
    const updated = { ...missionStatusSafe };
    updated[missionId] = !updated[missionId];
    setMinigameMissionStatus(updated);
  };

  const toggleAllMissions = (checked: boolean) => {
    const updated: Record<number, boolean> = {};
    missions.forEach((m) => {
      updated[m.Id] = checked;
    });
    setMinigameMissionStatus(updated);
  };

  const updateRunInput = (id: string, field: 'stage' | 'count', value: number) => {
    const updated = runInputs.map((input) => (input.id === id ? { ...input, [field]: value } : input));
    setMinigameCCGConfig(updated);
  };

  const setMaxRunCount = (id: string) => {
    const maxRuns = Math.floor(currentCurrencyAmount / entryCost);
    updateRunInput(id, 'count', maxRuns);
  };

  const removeRunInput = (id: string) => {
    const updated = runInputs.filter((input) => input.id !== id);
    setMinigameCCGConfig(updated);
  };

  const addRunInput = () => {
    const newId = `run-${Date.now()}`;
    const updated = [...runInputs, { id: newId, stage: 21, count: 0 }];
    setMinigameCCGConfig(updated);
  };

  // All hooks must be called before any conditional returns
  if (minigameMissionStatus === undefined || minigameCCGConfig === undefined) {
    return null;
  }

  if (!ccgData) return null;

  const tabs = [
    { id: 'overview' as const, name: t('overview', 'Overview') },
    { id: 'mission' as const, name: t('missions', 'Missions') },
    { id: 'calc' as const, name: t('calculator', 'Calculator') },
  ] as const;

  return (
    <div className="">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('title', "The Justice Task Force's Endless Summer Vacation")} (Beta)</h2>
      </div>

      <div className="space-y-4">
        <div className="flex border-b border-neutral-200 dark:border-neutral-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-neutral-500 hover:border-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-200'}`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-4 animate-fadeIn text-sm dark:text-neutral-300">
            {/* Rules */}
            <div className="bg-neutral-50 dark:bg-neutral-700/50 p-4 rounded-lg">
              <h3 className="font-bold mb-2 text-base dark:text-neutral-100">{t('game_rules', 'Game Rules')}</h3>
              <ul className="list-disc list-inside space-y-1 text-neutral-600 dark:text-neutral-300">
                <li>{t('desc_1', 'A roguelike deck-builder game.')}</li>
                <li>{t('desc_2', 'Clear Stage 3-7 to unlock Sweep.')}</li>
                <li>{t('desc_3', 'Collecting pamphlets upgrades permanent stats.')}</li>
              </ul>
            </div>

            {/* Cost Info */}
            <div className="flex items-center gap-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
              <span className="font-semibold text-sm text-blue-900 dark:text-blue-100">{t('entry_cost', 'Entry Cost')}:</span>
              <div className="flex items-center gap-2">
                <ItemIcon type={entryItemTypeStr} itemId={String(entryItemId)} amount={entryCost} size={12} eventData={eventData} iconData={iconData} />
              </div>
            </div>

            {/* Detailed Rewards Table */}
            <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
              <h3 className="font-bold p-3 bg-neutral-100 dark:bg-neutral-700 border-b border-neutral-200 dark:border-neutral-600 text-neutral-800 dark:text-neutral-100">
                {t('stage_rewards', 'Stage Rewards Drop Table')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 dark:bg-neutral-700/50 text-neutral-700 dark:text-neutral-300">
                    <tr>
                      <th className="px-4 py-2 border-b dark:border-neutral-600 w-[20%] whitespace-nowrap">{t('stage', 'Stage')}</th>
                      <th className="px-4 py-2 border-b dark:border-neutral-600">{t('rewards', 'Added Rewards')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                    {rewardsByStage.map((row) => (
                      <tr key={row.minPoint} className="hover:bg-neutral-50 dark:hover:bg-neutral-700/30">
                        <td className="px-4 py-2 font-medium text-neutral-900 dark:text-neutral-200 border-r dark:border-neutral-700">{row.stageLabel} ~</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-2">
                            {row.items.map((item, idx) => (
                              <ItemIcon
                                key={`${item.RewardParcelTypeStr}_${item.RewardParcelId}_${idx}`}
                                type={item.RewardParcelTypeStr}
                                itemId={String(item.RewardParcelId)}
                                amount={item.RewardParcelAmount}
                                size={11}
                                eventData={eventData}
                                iconData={iconData}
                              />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {rewardsByStage.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-4 py-4 text-center text-neutral-400">
                          No reward data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* MISSIONS */}
        {activeTab === 'mission' && (
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden animate-fadeIn">
            <div className="bg-neutral-50 dark:bg-neutral-900/50 p-2 flex justify-between items-center border-b border-neutral-200 dark:border-neutral-700">
              <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                {Object.keys(minigameMissionStatus).length} / {missions.length}
              </span>
              <div className="space-x-2">
                <button onClick={() => toggleAllMissions(true)} className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">
                  {t('select_all', 'Select All')}
                </button>
                <button onClick={() => toggleAllMissions(false)} className="text-xs bg-neutral-400 text-white px-2 py-1 rounded hover:bg-neutral-500">
                  {t('deselect_all', 'Deselect All')}
                </button>
              </div>
            </div>

            <div className="divide-y divide-neutral-100 dark:divide-neutral-700 max-h-125 overflow-y-auto">
              {missions.map((mission) => {
                const desc = formatMissionDesc(mission);
                const isChecked = minigameMissionStatus[mission.Id] ?? false;

                return (
                  <div
                    key={mission.Id}
                    onClick={() => toggleMission(mission.Id)}
                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors"
                  >
                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                      <input type="checkbox" checked={isChecked} readOnly className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500" />
                      <span className="font-medium text-sm text-neutral-700 dark:text-neutral-200 leading-snug">{desc}</span>
                    </label>
                    <div className="flex flex-wrap gap-1 ml-4 justify-end">
                      {mission.MissionRewardParcelId.map((rid, idx) => (
                        <div key={idx} className="shrink-0">
                          <ItemIcon type={mission.MissionRewardParcelTypeStr[idx]} itemId={String(rid)} amount={mission.MissionRewardAmount[idx]} size={12} eventData={eventData} iconData={iconData} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CALCULATOR */}
        {activeTab === 'calc' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded text-sm text-yellow-800 dark:text-yellow-200 mb-2 border border-yellow-100 dark:border-yellow-900/30">
              {t('calc_tip', 'Add rows to simulate runs. Stage 3-7 provides maximum rewards.')}
            </div>

            <div className="space-y-2">
              {runInputs.map((input) => (
                <div key={input.id} className="flex flex-row gap-2 items-end bg-neutral-50 dark:bg-neutral-700/50 p-2 rounded-lg border border-neutral-100 dark:border-neutral-600">
                  <div className="w-[30%] sm:w-auto min-w-20">
                    <label className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1 font-semibold">Stage</label>
                    <select
                      value={input.stage}
                      onChange={(e) => updateRunInput(input.id, 'stage', Number(e.target.value))}
                      className="w-full p-1.5 rounded bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-sm ios-compact-14 focus:ring-1 focus:ring-blue-500"
                    >
                      {stageOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 min-w-0">
                    <label className="text-xs text-neutral-500 dark:text-neutral-400 block mb-1 font-semibold">Runs</label>
                    <div className="flex items-center gap-1">
                      <CustomNumberInput
                        value={input.count}
                        onChange={(val) => updateRunInput(input.id, 'count', val || 0)}
                        min={0}
                        max={999}
                        className="w-full text-center rounded bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 py-1.5 text-sm"
                      />
                      <button
                        onClick={() => setMaxRunCount(input.id)}
                        className="h-8.5 px-2 text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 rounded dark:bg-blue-900 dark:text-blue-300 transition-colors shrink-0"
                        title="Use remaining currency"
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  <div className="shrink-0 pb-0.75">
                    <button
                      onClick={() => removeRunInput(input.id)}
                      className="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded dark:hover:bg-red-900/30 transition-colors"
                      title="Remove row"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={addRunInput}
                className="w-full py-2 border-2 border-dashed border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:border-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 rounded-lg transition-colors text-sm font-medium"
              >
                + {t('add_row', 'Add Row')}
              </button>
            </div>

            <div className="flex justify-between items-center text-sm font-medium pt-2 border-t border-neutral-200 dark:border-neutral-700">
              <span className="dark:text-neutral-200">Total Runs: {calcRewards.totalRuns}</span>
              <span className={`flex items-center gap-1 ${currentCurrencyAmount < calcRewards.totalCost ? 'text-red-500' : 'text-neutral-700 dark:text-neutral-300'}`}>
                Cost:
                <ItemIcon type={entryItemTypeStr} itemId={String(entryItemId)} amount="" size={12} eventData={eventData} iconData={iconData} />
                {calcRewards.totalCost.toLocaleString()}
                <span className="text-neutral-400 text-xs"> / {currentCurrencyAmount.toLocaleString()}</span>
              </span>
            </div>

            {/* Reward Summary (Display: Simulation Only) */}
            <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <h4 className="text-sm font-bold mb-3 text-neutral-800 dark:text-neutral-100">Total Estimated Rewards</h4>
              {Object.keys(calcRewards.rewards).length === 0 ? (
                <p className="text-sm text-neutral-400 italic text-center py-4 bg-neutral-50 dark:bg-neutral-700/30 rounded-lg">No rewards simulated</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {Object.entries(calcRewards.rewards).map(([key, amount]) => {
                    const [typeStr, idStr] = key.split('_');
                    return (
                      <div key={key} className="relative shrink-0">
                        <ItemIcon type={typeStr} itemId={idStr} amount={amount} size={12} eventData={eventData} iconData={iconData} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
