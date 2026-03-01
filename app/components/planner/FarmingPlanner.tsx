// src/components/FarmingPlanner.tsx
import { useMemo, useCallback, useEffect } from 'react';
import { ItemIcon } from './common/Icon';
import type { EventData, IconData, Mission, Stage } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { useEventSettings } from '~/store/planner/useSettingsStore';
import { solveOptimalRuns } from '~/utils/solveFarmingHeuristic';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { CustomNumberInput } from '../CustomInput';
import { FaRedoAlt, FaRegStar } from 'react-icons/fa';
import type { IconType } from 'react-icons/lib';

// Defining Stage Priority Type
type StagePrio = 'include' | 'exclude' | 'priority';
export type FarmingTab = 'repeatable' | 'onetime';

// Suppose EventPage uses an extended EventData type
export type FarmingResult = {
  totalItems: Record<string, { amount: number; isBonusApplied: boolean }>;
  totalApUsed: number;
};

interface FarmingPlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  allStages: (Stage & { type: 'stage' | 'story' | 'challenge' })[];
  availableAp: number;
  setAvailableAp: (ap: number) => void;
  neededItems: Record<number, number>;
  totalBonus: Record<number, number>;
  onCalculate: (result: FarmingResult | null) => void;
}

export const FarmingPlanner = ({ eventId, eventData, iconData, allStages, availableAp, setAvailableAp, neededItems, totalBonus, onCalculate }: FarmingPlannerProps) => {
  const { runCounts, firstClears, stagePrio, setRunCounts, setFirstClears, setStagePrio } = usePlanForEvent(eventId);
  const farmingStages = useMemo(() => allStages.filter((s) => s.type === 'stage'), [allStages]);
  const oneTimeStages = useMemo(() => allStages.filter((s) => s.type === 'story' || s.type === 'challenge'), [allStages]);

  const { t, i18n } = useTranslation('planner');
  const { t: t_c } = useTranslation('common');
  const locale = i18n.language as Locale;

  const { farmingActiveTab: activeTab, setFarmingActiveTab: setActiveTab, showOneTimeRewards, setShowOneTimeRewards, minimizeRepeatableInfo, setMinimizeRepeatableInfo } = useEventSettings(eventId);

  const missionsByStageId = useMemo(() => {
    const map = new Map<number | string, Mission[]>();
    if (!eventData.mission) return map;

    eventData.mission.forEach((mission) => {
      // Filter only the 'Clear within N seconds' mission
      if (mission.Description.Kr.includes('초 이내 클리어')) {
        // Found the stage ID in the mission parameter (usually over 8500000)
        const stageIdParam = mission?.CompleteConditionParameter?.find((p) => Number(p) > 1000000);
        if (stageIdParam) {
          if (!map.has(stageIdParam)) {
            map.set(stageIdParam, []);
          }
          map.get(stageIdParam)!.push(mission);
        }
      }
    });
    return map;
  }, [eventData.mission]);

  const totalApUsed = useMemo(() => {
    let ap = 0;
    if (runCounts)
      for (const [stageId, runs] of Object.entries(runCounts)) {
        const stage = allStages.find((s) => s.Id === Number(stageId));
        if (stage && runs > 0) {
          ap += runs * stage.StageEnterCostAmount;
        }
      }
    return ap;
  }, [runCounts, allStages]);

  const isApExceeded = totalApUsed > availableAp;

  useEffect(() => {
    if (stagePrio && Object.keys(stagePrio).length === 0) {
      const newPrios: Record<number, StagePrio> = {};

      farmingStages.forEach((stage, i) => {
        // Set the rest to 'exclude' except for the last four stages
        if (i < farmingStages.length - 4) {
          newPrios[stage.Id] = 'exclude';
        }
      });
      setStagePrio((prev) => ({
        ...prev,
        ...newPrios,
      }));
    }
  }, [eventId, farmingStages, setStagePrio, stagePrio]);

  useEffect(() => {
    if (!eventData) {
      onCalculate(null);
      return;
    }

    const totalItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
    let totalApUsed = 0;
    const eventItemIds = eventData.currency.map((c) => c.ItemUniqueId);

    allStages.forEach((stage) => {
      const runs = runCounts?.[stage.Id] || 0;
      const isFirstClearedInCalc = firstClears?.[stage.Id];
      if (runs > 0) totalApUsed += runs * stage.StageEnterCostAmount;

      stage.EventContentStageReward.forEach((reward) => {
        const key = `${reward.RewardParcelTypeStr}_${reward.RewardId}`;
        let amount = 0;
        let isBonusApplied = false;

        if (['Event', 'Default', 'Rare'].includes(reward.RewardTagStr)) {
          if (runs > 0) {
            let baseAmount = (runs * reward.RewardAmount * reward.RewardProb) / 10000;
            if (eventItemIds.includes(reward.RewardId) && stage.type == 'stage') {
              const bonusPercent = totalBonus[reward.RewardId] || 0;
              amount += baseAmount * (1 + bonusPercent / 10000);
              isBonusApplied = true;
            } else {
              amount += baseAmount;
            }
          }
        } else {
          // one-time reward
          if (isFirstClearedInCalc) {
            amount += (reward.RewardAmount * reward.RewardProb) / 10000;
          }
        }

        if (amount > 0) {
          totalItems[key] = {
            amount: (totalItems[key]?.amount || 0) + amount,
            isBonusApplied: totalItems[key]?.isBonusApplied || false || isBonusApplied,
          };
        }
      });
    });

    onCalculate({ totalItems, totalApUsed });
  }, [runCounts, firstClears, allStages, totalBonus, eventData, onCalculate]);

  const farmingCalculationResult = useMemo(() => {
    const totalItems: Record<string, { amount: number; isBonusApplied: boolean }> = {};
    let totalApUsed = 0;
    if (!eventData) return { totalItems, totalApUsed };

    const eventItemIds = eventData.currency.map((c) => c.ItemUniqueId);

    allStages.forEach((stage) => {
      const runs = runCounts?.[stage.Id] || 0;
      const isFirstClearedInCalc = firstClears?.[stage.Id];
      if (runs > 0) totalApUsed += runs * stage.StageEnterCostAmount;
      if (stage.type === 'stage' && isFirstClearedInCalc && runs === 0) {
        totalApUsed += stage.StageEnterCostAmount;
      }

      stage.EventContentStageReward.forEach((reward) => {
        const rewardType = reward.RewardParcelTypeStr;
        // const key = `${reward.RewardTagStr}_${rewardType}_${reward.RewardId}`;
        const key = `${rewardType}_${reward.RewardId}`;
        let amount = 0;
        let isBonusApplied = false;

        const baseAmount = runs * reward.RewardAmount * (reward.RewardProb / 10000);

        if (['Event', 'Default', 'Rare'].includes(reward.RewardTagStr) && runs > 0) {
          if (eventItemIds.includes(reward.RewardId) && stage.type == 'stage') {
            const bonusPercent = totalBonus[reward.RewardId] || 0;
            amount += Math.ceil(baseAmount * (1 + bonusPercent / 10000));
            isBonusApplied = true;
          } else {
            amount += baseAmount;
          }
        }

        if (!['Event', 'Default', 'Rare'].includes(reward.RewardTagStr)) {
          if ((stage.type === 'stage' && isFirstClearedInCalc) || (stage.type !== 'stage' && runs > 0)) {
            amount += reward.RewardAmount * (reward.RewardProb / 10000);
          }
        }

        if (amount > 0) {
          totalItems[key] = {
            amount: (totalItems[key]?.amount || 0) + amount,
            isBonusApplied: totalItems[key]?.isBonusApplied || false || isBonusApplied,
          };
        }
      });
    });

    return { totalItems, totalApUsed: Math.round(totalApUsed) };
  }, [runCounts, firstClears, allStages, totalBonus, eventData]);

  // Pass the calculation results to parents whenever they change
  useEffect(() => {
    onCalculate(farmingCalculationResult);
  }, [farmingCalculationResult, onCalculate]);

  // Handlers to change the stage priority
  const handleStagePrioChange = useCallback(
    (stageId: number) => {
      setStagePrio((prev) => {
        const currentPrio = prev[stageId] || 'include';
        let nextPrio: StagePrio;
        if (currentPrio === 'include') nextPrio = 'exclude';
        else nextPrio = 'include';
        return { ...prev, [stageId]: nextPrio };
      });
    },
    [setStagePrio],
  );

  const farmingItem = useMemo(() => {
    const farmingItems = new Set<number>();
    for (const stage of eventData.stage.stage) {
      for (const r of stage.EventContentStageReward) {
        if (['GachaGroup', 'Currency'].includes(r.RewardParcelTypeStr)) continue;
        if (r.RewardTagStr != 'Event') continue;
        farmingItems.add(r.RewardId);
      }
    }
    return farmingItems;
  }, [eventData.stage]);

  const handleAutoCalculateRuns = useCallback(() => {
    const initialNeeded: Record<number, number> = {};
    for (const [id, amount] of Object.entries(neededItems)) {
      const c = eventData.currency.filter((v) => v.ItemUniqueId == Number(id));
      if (!c || c.length > 1) return;

      if (!farmingItem.has(Number(id))) continue;

      initialNeeded[Number(id)] = -amount;
    }

    const optimizableStages = farmingStages.filter((s) => (stagePrio?.[s.Id] || 'include') !== 'exclude');

    if (optimizableStages.length === 0 || Object.keys(initialNeeded).length === 0) {
      // Do nothing if you don't need to calculate
      alert('Option not selected');
      return;
    }

    // Calculate the amount of goods already produced by runCounts
    const farmedByCurrentRuns: Record<number, number> = {};
    if (runCounts)
      for (const [stageIdStr, runs] of Object.entries(runCounts)) {
        const stage = optimizableStages.find((s) => s.Id === Number(stageIdStr));
        if (!stage) continue;

        for (const reward of stage.EventContentStageReward) {
          if (initialNeeded[reward.RewardId] !== undefined && (reward.RewardTagStr === 'Event' || reward.RewardTagStr === 'Default')) {
            const bonus = totalBonus[reward.RewardId] || 0;
            const effectiveDrop = reward.RewardAmount * (reward.RewardProb / 10000) * (1 + bonus / 10000);
            farmedByCurrentRuns[reward.RewardId] = (farmedByCurrentRuns[reward.RewardId] || 0) + effectiveDrop * runs;
          }
        }
      }

    const neededItemIds = Object.keys(initialNeeded).map(Number);

    const neededAmounts = neededItemIds.map((id) => Math.max(0, (initialNeeded[id] || 0) + (farmedByCurrentRuns[id] || 0)));

    // If no additional goods are needed, exit the function
    if (!neededAmounts.some((amount) => amount > 0)) {
      return;
    }

    // --- 2. Create a matrix to pass to the solver ---
    // const stageMap = new Map(optimizableStages.map((s, i) => [s.Id, i]));
    const itemMap = new Map(neededItemIds.map((id, i) => [id, i]));

    const numStages = optimizableStages.length;
    const numItems = neededItemIds.length;

    const dropMatrix = Array(numStages)
      .fill(0)
      .map(() => Array(numItems).fill(0));
    const apCosts = Array(numStages).fill(0);
    const priorities = Array(numStages).fill(false);

    for (let i = 0; i < numStages; i++) {
      const stage = optimizableStages[i];
      apCosts[i] = stage.StageEnterCostAmount;
      priorities[i] = stagePrio?.[stage.Id] === 'priority';

      for (const reward of stage.EventContentStageReward) {
        if (itemMap.has(reward.RewardId) && (reward.RewardTagStr === 'Event' || reward.RewardTagStr === 'Default')) {
          const itemIndex = itemMap.get(reward.RewardId)!;
          const bonus = totalBonus[reward.RewardId] || 0;
          dropMatrix[i][itemIndex] += ((reward.RewardAmount * reward.RewardProb) / 10000) * (1 + bonus / 10000);
        }
      }
    }

    // --- 3. universal solver call ---
    const additionalRunsArray = solveOptimalRuns({
      dropMatrix,
      apCosts,
      neededAmounts,
      priorities,
    });

    // --- 4. Update result conversion and status 'add' ---
    const additionalRunCounts: Record<number, number> = {};
    for (let i = 0; i < numStages; i++) {
      if (additionalRunsArray[i] > 0) {
        const stageId = optimizableStages[i].Id;
        additionalRunCounts[stageId] = Math.round(additionalRunsArray[i]);
      }
    }

    const filtered = runCounts ? Object.fromEntries(Object.entries(runCounts).filter(([key]) => eventData.stage.stage.filter((v) => v.Id === Number(key)).length == 0)) : {};

    setRunCounts(() => ({ ...filtered, ...additionalRunCounts }));
  }, [neededItems, farmingStages, stagePrio, totalBonus, runCounts, setRunCounts]);

  const handleRunCountChange = useCallback(
    (stageId: number, value: number) => {
      const count = value;
      setRunCounts((prev) => ({
        ...prev,
        [stageId]: isNaN(count) ? 0 : Math.max(0, count),
      }));
    },
    [setRunCounts],
  );

  const handleFirstClearToggle = useCallback(
    (stageId: number) => {
      setFirstClears((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
    },
    [setFirstClears],
  );

  const handleToggleAllFirstClears = useCallback(() => {
    const shouldClearAll = farmingStages.some((s) => !firstClears?.[s.Id]);
    const newClears: Record<number, boolean> = {};
    if (shouldClearAll) {
      farmingStages.forEach((s) => {
        newClears[s.Id] = true;
      });
    }
    setFirstClears(() => newClears);
  }, [farmingStages, firstClears, setFirstClears]);

  const handleToggleAllOneTimeRuns = useCallback(() => {
    const shouldClearAll = oneTimeStages.some((s) => !((runCounts?.[s.Id] || 0) > 0));
    setRunCounts((prev) => {
      const newCounts = { ...prev };
      oneTimeStages.forEach((s) => {
        newCounts[s.Id] = shouldClearAll ? 1 : 0;
      });
      return newCounts;
    });
  }, [oneTimeStages, runCounts, setRunCounts]);

  const handleSetMaxRuns = useCallback(
    (stageId: number) => {
      const stage = allStages.find((s) => s.Id === stageId);
      if (!stage || stage.StageEnterCostAmount <= 0) return;

      let apUsedByOthers = 0;
      if (runCounts)
        for (const [sId, runs] of Object.entries(runCounts)) {
          if (Number(sId) !== stageId) {
            const otherStage = allStages.find((s) => s.Id === Number(sId));
            if (otherStage) apUsedByOthers += (runs || 0) * otherStage.StageEnterCostAmount;
          }
        }
      const remainingAp = availableAp - apUsedByOthers;
      const maxRuns = Math.floor(remainingAp / stage.StageEnterCostAmount);

      setRunCounts((prev) => ({ ...prev, [stageId]: Math.max(0, maxRuns) }));
    },
    [availableAp, allStages, runCounts],
  );

  const handleBatchTogglePrio = useCallback(
    (start: number, end: number) => {
      const targetStages = farmingStages.filter((s) => {
        const stageNumMatch = s.Name.match(/(\d+)$/);
        if (stageNumMatch) {
          const num = parseInt(stageNumMatch[1], 10);
          return num >= start && num <= end;
        }
        return false;
      });

      if (targetStages.length === 0) return;

      // If one of the target stages is not in the "Excluded" state, -> All of them are "Excluded"
      // If everyone's in an "excluded" state -> Everyone's in an "included" state
      const shouldExclude = targetStages.some((s) => (stagePrio?.[s.Id] || 'include') !== 'exclude');
      const newPrio = shouldExclude ? 'exclude' : 'include';

      const updates: Record<number, StagePrio> = {};
      targetStages.forEach((s) => {
        updates[s.Id] = newPrio;
      });

      setStagePrio((prev) => ({ ...prev, ...updates }));
    },
    [farmingStages, stagePrio, setStagePrio],
  );

  const prioButtonInfo: Record<StagePrio, { text: string; className: string }> = {
    include: {
      text: t('common.include'),
      className: 'bg-green-500 hover:bg-green-600',
    },
    priority: {
      text: t('common.priority'),
      className: 'bg-blue-500 hover:bg-blue-600',
    },
    exclude: {
      text: t('common.exclude'),
      className: 'bg-gray-400 hover:bg-gray-500',
    },
  };

  const tabs: { id: FarmingTab; name: string; icon: IconType }[] = [
    {
      id: 'repeatable',
      name: '' + t('label.repeatedFarming'),
      icon: FaRedoAlt,
    },
    { id: 'onetime', name: '' + t('label.oneTimeClear'), icon: FaRegStar },
  ];

  if (!stagePrio || !firstClears || !runCounts) {
    return null;
  }

  return (
    <>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('page.eventPlanner')}</h2>

      <label htmlFor="ap-input" className="inline-flex text-lg font-bold text-gray-800 dark:text-gray-200 mb-2">
        <>
          <img src={`data:image/webp;base64,${iconData.Currency?.['5']}`} className="w-6 h-6 ml-0.5 object-cover rounded-full" />
          {t('ui.totalAp')}
        </>
      </label>
      <CustomNumberInput
        id="ap-input"
        value={availableAp}
        onChange={(e) => setAvailableAp(e != null ? e : 0)}
        className="w-full p-2 text-lg rounded border dark:border-neutral-600 bg-transparent dark:text-gray-200 focus:ring-2 focus:ring-sky-500"
      />
      <div className={`text-right mt-2 font-semibold ${isApExceeded ? 'text-red-500 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
        {t('ui.usedAp')} {totalApUsed.toLocaleString()} / {availableAp.toLocaleString()}
      </div>
      <button
        data-component-name="FarmingPlanner_run"
        onClick={handleAutoCalculateRuns}
        className="w-full mt-4 bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
      >
        {t('button.runAutoFarmCalc')}
      </button>

      <div data-component-name="FarmingPlanner_tab" className="flex border-b border-gray-200 dark:border-neutral-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 flex flex-row  justify-center items-center ${
              activeTab === tab.id
                ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-neutral-600'
            }`}
          >
            <tab.icon className="mr-2" /> {tab.name}
          </button>
        ))}
      </div>

      <>
        {activeTab === 'repeatable' && (
          <>
            <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
              <div className="flex items-center gap-4">
                <button onClick={() => setShowOneTimeRewards(!showOneTimeRewards)} className="text-sm font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                  {showOneTimeRewards ? t('button.hideOneTimeRewards') : t('button.showOneTimeRewards')}
                </button>
                <button
                  onClick={() => setMinimizeRepeatableInfo(!minimizeRepeatableInfo)}
                  className="text-sm font-semibold text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                >
                  {minimizeRepeatableInfo ? t_c('viewMore') : t_c('viewSimple')}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 justify-end">
                <div className="flex items-center gap-2" role="group">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mr-1">{t('button.quickExclude')}</span>
                  <button
                    onClick={() => handleBatchTogglePrio(1, 4)}
                    className="bg-gray-500 hover:bg-gray-600 dark:bg-neutral-600 dark:hover:bg-neutral-700 text-white font-bold py-1 px-2 rounded-md text-xs"
                  >
                    1-4
                  </button>
                  <button
                    onClick={() => handleBatchTogglePrio(5, 8)}
                    className="bg-gray-500 hover:bg-gray-600 dark:bg-neutral-600 dark:hover:bg-neutral-700 text-white font-bold py-1 px-2 rounded-md text-xs"
                  >
                    5-8
                  </button>
                  <button
                    onClick={() => handleBatchTogglePrio(9, 12)}
                    className="bg-gray-500 hover:bg-gray-600 dark:bg-neutral-600 dark:hover:bg-neutral-700 text-white font-bold py-1 px-2 rounded-md text-xs"
                  >
                    9-12
                  </button>
                </div>
                <div className="h-5 border-l border-gray-300 dark:border-neutral-600 mx-2"></div>
                <button
                  data-component-name="FarmingPlanner_f1"
                  onClick={handleToggleAllFirstClears}
                  className="bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700 text-white font-bold py-1 px-3 rounded-md text-sm"
                >
                  {t('button.setAllFirstClear')}
                </button>
              </div>
            </div>

            <div className="divide-y dark:divide-neutral-600">
              {farmingStages.map((s) => {
                // const totalEventItems = s.EventContentStageReward.filter(r => (['Event', 'Default', 'Rare'].includes(r.RewardTagStr)) && eventData.currency.some(c => c.ItemUniqueId === r.RewardId)).reduce((sum, r) => sum + r.RewardAmount * r.RewardProb / 10000, 0);
                // const efficiency = s.StageEnterCostAmount > 0 ? totalEventItems / s.StageEnterCostAmount : 0;
                const currentPrio = stagePrio[s.Id] || 'include';
                const btnInfo = prioButtonInfo[currentPrio];

                // const firstClearRewards = s.EventContentStageReward.filter(r => !['Event', 'Default', 'Rare'].includes(r.RewardTagStr));
                const repeatableRewards = s.EventContentStageReward.filter(
                  (r) => ['Event', 'Default', 'Rare'].includes(r.RewardTagStr),
                  // && r.RewardParcelTypeStr !== 'GachaGroup'
                );
                const associatedMissions = missionsByStageId.get(s.Id);

                const bonusRewards = repeatableRewards
                  .map((r) => {
                    const bonusPercent = totalBonus[r.RewardId];
                    // Calculate only if there is a bonus percentage and it is greater than zero
                    if (bonusPercent && bonusPercent > 0) {
                      return {
                        id: r.RewardId,
                        type: r.RewardParcelTypeStr,
                        amount: Math.ceil((((r.RewardAmount * r.RewardProb) / 10000) * bonusPercent) / 10_000),
                      };
                    }
                    return null;
                  })
                  .filter((item): item is { id: number; type: string; amount: number } => item !== null);

                if (minimizeRepeatableInfo) {
                  const stageNumMatch = s.Name.match(/(\d+)$/);
                  const stageNum = stageNumMatch ? stageNumMatch[1] : s.Name.split('_').pop();

                  const eventCurrencyIds = eventData.currency.map((c) => c.ItemUniqueId);
                  const eventRewards = s.EventContentStageReward.filter(
                    (r) => eventCurrencyIds.includes(r.RewardId) && ['Event', 'Default', 'Rare'].includes(r.RewardTagStr),
                    //  && r.RewardParcelTypeStr !== 'GachaGroup'
                  );

                  return (
                    <div key={s.Id} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2 shrink-0 ">
                        <span className={`${firstClears[s.Id] ? 'underline' : ''} font-bold text-sky-600 dark:text-sky-400 w-8 text-left`}>{stageNum}</span>
                      </div>

                      {/* 2. Event Rewards */}
                      <div className="flex-1 flex items-center gap-2 overflow-x-auto min-w-0">
                        {eventRewards.map((r, i) => {
                          const baseAmount = (r.RewardAmount * r.RewardProb) / 10000;
                          const bonusPercent = totalBonus[r.RewardId] || 0;
                          let amountString = `${baseAmount}+${0}`;

                          if (bonusPercent > 0) {
                            const bonusPart = Math.ceil((baseAmount * bonusPercent) / 10000);
                            amountString = `${baseAmount}+${bonusPart}`;
                          }

                          return (
                            <div key={`min-reward-${i}-${r.RewardId}`} className="flex items-center gap-1 shrink-0" title={`${amountString} per run`}>
                              <ItemIcon
                                type={r.RewardParcelTypeStr}
                                itemId={r.RewardId.toString()}
                                size={12} // Smaller icon
                                amount={amountString}
                                eventData={eventData}
                                iconData={iconData}
                              />
                              {/* <span className="text-xs text-gray-700 dark:text-gray-300 font-mono whitespace-nowrap">{amountString}</span> */}
                            </div>
                          );
                        })}
                      </div>

                      {/* 3. Controls */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => handleStagePrioChange(s.Id)} className={`w-12 text-white font-bold py-1 rounded-md text-xs ${btnInfo.className}`}>
                          {btnInfo.text}
                        </button>

                        <CustomNumberInput
                          min={0}
                          value={runCounts[s.Id] || 0}
                          onChange={(e) => handleRunCountChange(s.Id, e || 0)}
                          placeholder={t('common.count')}
                          className="w-14 py-1 text-base scale-[0.75] rounded bg-gray-100 dark:bg-neutral-700 text-center border dark:border-neutral-600 dark:text-gray-200"
                        />
                        <button onClick={() => handleSetMaxRuns(s.Id)} className="bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700 text-white font-bold px-2 py-1 rounded-md text-xs">
                          M
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={s.Id} className="p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      {/* 1: Stage information */}
                      <div className="w-full sm:w-55 sm:shrink-0">
                        <h4 className="font-bold text-base text-sky-600 dark:text-sky-400 truncate">
                          {s.Name.split('_')
                            .pop()
                            ?.replace('Stage', t('common.stage') + ' ')}
                        </h4>
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          <span className="shrink-0">{s.StageEnterCostAmount}AP</span>
                          <span className="shrink-0">Lv.{s.RecommandLevel}</span>
                          <span className="shrink-0">
                            {s.BattleDuration / 1000}
                            {t('common.seconds')}
                          </span>
                          {s.StageHintStr && (
                            <Tooltip
                              placement="top"
                              trigger={['hover']}
                              styles={{ root: { maxWidth: '20rem' } }}
                              overlay={<span>{locale === 'ko' ? s.StageHintStr.DescriptionKr : s.StageHintStr.DescriptionJp}</span>}
                            >
                              <span className="font-bold text-blue-500 dark:text-blue-400 cursor-help shrink-0">💡 {t('common.hint')}</span>
                            </Tooltip>
                          )}

                          {associatedMissions && (
                            <Tooltip
                              placement="top"
                              trigger={['hover']}
                              overlay={
                                <div>
                                  {associatedMissions.map((m) => (
                                    <div key={m.Id}>{t('mission.clearWithinSeconds').replace('{seconds}', String(m.CompleteConditionCount))}</div>
                                  ))}
                                </div>
                              }
                            >
                              <span className="font-bold text-yellow-600 dark:text-yellow-500 cursor-help shrink-0">🏆 {t('common.mission')}</span>
                            </Tooltip>
                          )}
                          <label
                            className="flex items-center space-x-1.5 cursor-pointer p-1 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 shrink-0 sm:w-full"
                            title={t('button.includeOneTimeRewards')}
                          >
                            <input
                              type="checkbox"
                              checked={!!firstClears[s.Id]}
                              onChange={() => handleFirstClearToggle(s.Id)}
                              className="h-4 w-4 rounded border-gray-300 dark:border-neutral-600 bg-transparent"
                            />
                            <span className="text-gray-700 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">{t('button.includeOneTimeRewards')}</span>
                          </label>
                        </div>
                      </div>

                      {/* Rewards Information */}
                      <div className="w-full sm:flex-1 min-w-0">
                        <div className="flex overflow-x-auto gap-1.5">
                          <div className="flex overflow-x-auto gap-1.5 mt-1 pb-2">
                            {s.EventContentStageReward
                              // .filter(r => r.RewardParcelTypeStr !== 'GachaGroup')
                              .map((r, i) => {
                                const isOneTimeReward = ['FirstClear', 'ThreeStar'].includes(r.RewardTagStr);
                                let label: string | null = null;
                                let labelColor = 'bg-gray-700';

                                if (isOneTimeReward && !showOneTimeRewards) return null;

                                switch (r.RewardTagStr) {
                                  case 'Rare':
                                    label = 'Rare';
                                    labelColor = 'bg-[#2f4e73]';
                                    break;
                                  case 'FirstClear':
                                    label = 'First';
                                    labelColor = 'bg-yellow-500';
                                    break;
                                  case 'ThreeStar':
                                    label = '３★';
                                    labelColor = 'bg-amber-400';
                                    break;
                                }

                                return (
                                  <div key={`reward-${i}-${r.RewardId}`}>
                                    <ItemIcon
                                      type={r.RewardParcelTypeStr}
                                      itemId={r.RewardId.toString()}
                                      amount={(r.RewardAmount * r.RewardProb) / 10000}
                                      size={10}
                                      eventData={eventData}
                                      iconData={iconData}
                                      label={label}
                                      labelColor={labelColor}
                                    />
                                  </div>
                                );
                              })}

                            {/* 2. Rendering Student Bonus Reward Icon */}
                            {bonusRewards.map((br, i) => (
                              <div key={`reward-${i}-${br.id}`}>
                                <ItemIcon
                                  key={`bonus-${i}-${br.id}`}
                                  type={br.type}
                                  itemId={br.id.toString()}
                                  amount={br.amount}
                                  size={10}
                                  eventData={eventData}
                                  iconData={iconData}
                                  label="Bonus"
                                  labelColor="bg-[#ea5691]"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Control button */}
                      <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-48 justify-end">
                        <button onClick={() => handleStagePrioChange(s.Id)} className={`w-12 text-white font-bold py-1 rounded-md text-xs ${btnInfo.className}`}>
                          {btnInfo.text}
                        </button>
                        <CustomNumberInput
                          min={0}
                          value={runCounts[s.Id] || 0}
                          onChange={(e) => handleRunCountChange(s.Id, e || 0)}
                          placeholder={t('common.count')}
                          className="grow sm:grow-0 w-14 py-1 text-base scale-[0.75] rounded bg-gray-100 dark:bg-neutral-700 text-center border dark:border-neutral-600 dark:text-gray-200"
                        />
                        <button
                          onClick={() => handleSetMaxRuns(s.Id)}
                          className="bg-sky-500 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-700 text-white font-bold px-2.5 py-1 rounded-md text-xs"
                        >
                          MAX
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* )} */}
          </>
        )}

        {activeTab === 'onetime' && (
          <>
            {/* --- Top Control Area --- */}
            <div className="text-right mb-4">
              <button
                data-component-name="FarmingPlanner_f2"
                onClick={handleToggleAllOneTimeRuns}
                className="bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-bold py-1 px-3 rounded-md text-sm"
              >
                {t('button.setAllOneTime')}
              </button>
            </div>

            {/* --- List of stages --- */}
            <div className="divide-y dark:divide-neutral-600">
              {oneTimeStages.map((s) => {
                const associatedMissions = missionsByStageId.get(s.Id);
                return (
                  <div key={s.Id} className="p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex flex-row justify-between items-center sm:contents sm:flex-1">
                        <div className="grow sm:shrink-0 min-w-0">
                          <h4 className="font-bold text-base text-indigo-600 dark:text-indigo-400 truncate">
                            {(s.type === 'story' ? t('common.story') + ' ' : t('common.challenge') + ' ') + s.Name.split('_').pop()?.replace('Stage', ' ')}
                          </h4>
                          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            <span>{s.StageEnterCostAmount}AP</span>
                            <span>Lv.{s.RecommandLevel}</span>
                            <span>
                              {s.BattleDuration / 1000}
                              {t('common.seconds')}
                            </span>

                            {associatedMissions && (
                              <Tooltip
                                placement="top"
                                trigger={['hover']}
                                overlay={
                                  <div>
                                    {associatedMissions.map((m) => (
                                      <div key={m.Id}>{t('mission.clearWithinSeconds').replace('{seconds}', String(m.CompleteConditionCount))}</div>
                                    ))}
                                  </div>
                                }
                              >
                                <span className="font-bold text-yellow-600 dark:text-yellow-500 cursor-help shrink-0">🏆 {t('common.mission')}</span>
                              </Tooltip>
                            )}

                            {s.StageHintStr && (
                              <Tooltip
                                placement="top"
                                trigger={['hover']}
                                styles={{ root: { maxWidth: '20rem' } }}
                                overlay={<span>{locale === 'ko' ? s.StageHintStr.DescriptionKr : s.StageHintStr.DescriptionJp}</span>}
                              >
                                <span className="font-bold text-blue-500 dark:text-blue-400 cursor-help shrink-0">💡 {t('common.hint')}</span>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                        <div className="sm:hidden flex items-center gap-2 shrink-0 justify-end">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">{t('common.count')}</label>
                          <CustomNumberInput
                            min={0}
                            max={1}
                            value={runCounts[s.Id] || 0}
                            onChange={(e) => handleRunCountChange(s.Id, e || 0)}
                            className="w-12 px-0 text-base scale-[0.75] p-1 text-center rounded bg-gray-100 dark:bg-neutral-700 border dark:border-neutral-600 dark:text-gray-200"
                          />
                        </div>
                      </div>

                      {/* Cell 2: Compensation information (wide area in the middle) */}
                      <div className="w-full sm:flex sm:justify-end min-w-0">
                        {s.EventContentStageReward.length > 0 && (
                          <div className="flex overflow-x-auto gap-1.5 pb-2">
                            {s.EventContentStageReward.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {s.EventContentStageReward
                                  // .filter(r => r.RewardParcelTypeStr !== 'GachaGroup')
                                  .map((r, i) => {
                                    const type = r.RewardParcelTypeStr; // RewardParcelTypeStr is an array, so use the first element
                                    const amount = (r.RewardAmount * r.RewardProb) / 10000;
                                    let label: string | null = null;
                                    let labelColor = 'bg-gray-700';

                                    switch (r.RewardTagStr) {
                                      case 'Rare':
                                        label = 'Rare';
                                        labelColor = 'bg-[#2f4e73]';
                                        break;
                                      case 'FirstClear':
                                        label = 'First';
                                        labelColor = 'bg-yellow-500';
                                        break;
                                      case 'ThreeStar':
                                        label = '３★';
                                        labelColor = 'bg-amber-400';
                                        break;
                                    }

                                    return (
                                      <ItemIcon
                                        key={`1t-${i}-${r.RewardId}`}
                                        type={type}
                                        itemId={r.RewardId.toString()}
                                        amount={amount}
                                        size={10}
                                        eventData={eventData}
                                        iconData={iconData}
                                        label={label}
                                        labelColor={labelColor}
                                      />
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {}
                      <div className="hidden sm:flex items-center gap-2 shrink-0 w-full sm:w-24 justify-end">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('common.count')}</label>
                        <CustomNumberInput
                          min={0}
                          max={1}
                          value={runCounts[s.Id] || 0}
                          onChange={(e) => handleRunCountChange(s.Id, e || 0)}
                          className="w-12 px-0 text-base scale-[0.75] p-1 text-center rounded bg-gray-100 dark:bg-neutral-700 border dark:border-neutral-600 dark:text-gray-200"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </>
    </>
  );
};
