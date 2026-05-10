// app/components/planner/FarmingPlanner.tsx
import { useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventData, IconData, Mission, Stage } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { useEventSettings } from '~/store/planner/useSettingsStore';
import { solveOptimalRuns } from '~/utils/solveFarmingHeuristic';
import { CustomNumberInput } from '../CustomInput';
import { FaRedoAlt, FaRegStar } from 'react-icons/fa';
import type { IconType } from 'react-icons/lib';
import type { StagePrio, FarmingTab, FarmingResult } from './FarmingPlannerTypes';
import { RepeatableTab } from './RepeatableTab';
import { OnetimeTab } from './OnetimeTab';

export type { FarmingTab, FarmingResult };

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

  const { t } = useTranslation('planner');
  const { farmingActiveTab: activeTab, setFarmingActiveTab: setActiveTab, showOneTimeRewards, setShowOneTimeRewards, minimizeRepeatableInfo, setMinimizeRepeatableInfo } = useEventSettings(eventId);

  const missionsByStageId = useMemo(() => {
    const map = new Map<number | string, Mission[]>();
    if (!eventData.mission) return map;
    eventData.mission.forEach((mission) => {
      if (mission.Description.Kr.includes('초 이내 클리어')) {
        const stageIdParam = mission?.CompleteConditionParameter?.find((p) => Number(p) > 1000000);
        if (stageIdParam) {
          if (!map.has(stageIdParam)) map.set(stageIdParam, []);
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
        if (stage && runs > 0) ap += runs * stage.StageEnterCostAmount;
      }
    return ap;
  }, [runCounts, allStages]);

  const isApExceeded = totalApUsed > availableAp;

  useEffect(() => {
    if (stagePrio && Object.keys(stagePrio).length === 0) {
      const newPrios: Record<number, StagePrio> = {};
      farmingStages.forEach((stage, i) => {
        if (i < farmingStages.length - 4) newPrios[stage.Id] = 'exclude';
      });
      setStagePrio((prev) => ({ ...prev, ...newPrios }));
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
            const baseAmount = (runs * reward.RewardAmount * reward.RewardProb) / 10000;
            if (eventItemIds.includes(reward.RewardId) && stage.type == 'stage') {
              const bonusPercent = totalBonus[reward.RewardId] || 0;
              amount += baseAmount * (1 + bonusPercent / 10000);
              isBonusApplied = true;
            } else {
              amount += baseAmount;
            }
          }
        } else {
          if (isFirstClearedInCalc) amount += (reward.RewardAmount * reward.RewardProb) / 10000;
        }
        if (amount > 0) {
          totalItems[key] = {
            amount: (totalItems[key]?.amount || 0) + amount,
            isBonusApplied: totalItems[key]?.isBonusApplied || false || isBonusApplied,
          };
        }
      });
    });
    onCalculate({ totalItems, totalApUsed: Math.round(totalApUsed) });
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
      if (stage.type === 'stage' && isFirstClearedInCalc && runs === 0) totalApUsed += stage.StageEnterCostAmount;
      stage.EventContentStageReward.forEach((reward) => {
        const key = `${reward.RewardParcelTypeStr}_${reward.RewardId}`;
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

  useEffect(() => {
    onCalculate(farmingCalculationResult);
  }, [farmingCalculationResult, onCalculate]);

  const handleStagePrioChange = useCallback(
    (stageId: number) => {
      setStagePrio((prev) => {
        const currentPrio = prev[stageId] || 'include';
        const nextPrio: StagePrio = currentPrio === 'include' ? 'exclude' : 'include';
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
      alert('Option not selected');
      return;
    }
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
    if (!neededAmounts.some((amount) => amount > 0)) return;
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
    const additionalRunsArray = solveOptimalRuns({ dropMatrix, apCosts, neededAmounts, priorities });
    const additionalRunCounts: Record<number, number> = {};
    for (let i = 0; i < numStages; i++) {
      if (additionalRunsArray[i] > 0) additionalRunCounts[optimizableStages[i].Id] = Math.round(additionalRunsArray[i]);
    }
    const filtered = runCounts ? Object.fromEntries(Object.entries(runCounts).filter(([key]) => eventData.stage.stage.filter((v) => v.Id === Number(key)).length == 0)) : {};
    setRunCounts(() => ({ ...filtered, ...additionalRunCounts }));
  }, [neededItems, farmingStages, stagePrio, totalBonus, runCounts, setRunCounts]);

  const handleRunCountChange = useCallback(
    (stageId: number, value: number) => {
      setRunCounts((prev) => ({ ...prev, [stageId]: isNaN(value) ? 0 : Math.max(0, value) }));
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
    setFirstClears((prev) => {
      const nextState = { ...prev };
      farmingStages.forEach((s) => {
        nextState[s.Id] = shouldClearAll;
      });
      return nextState;
    });
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
      const maxRuns = Math.floor((availableAp - apUsedByOthers) / stage.StageEnterCostAmount);
      setRunCounts((prev) => ({ ...prev, [stageId]: Math.max(0, maxRuns) }));
    },
    [availableAp, allStages, runCounts],
  );

  const handleBatchTogglePrio = useCallback(
    (start: number, end: number) => {
      const targetStages = farmingStages.filter((s) => {
        const m = s.Name.match(/(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          return num >= start && num <= end;
        }
        return false;
      });
      if (targetStages.length === 0) return;
      const shouldExclude = targetStages.some((s) => (stagePrio?.[s.Id] || 'include') !== 'exclude');
      const newPrio: StagePrio = shouldExclude ? 'exclude' : 'include';
      const updates: Record<number, StagePrio> = {};
      targetStages.forEach((s) => {
        updates[s.Id] = newPrio;
      });
      setStagePrio((prev) => ({ ...prev, ...updates }));
    },
    [farmingStages, stagePrio, setStagePrio],
  );

  const tabs: { id: FarmingTab; name: string; icon: IconType }[] = [
    { id: 'repeatable', name: '' + t('label.repeatedFarming'), icon: FaRedoAlt },
    { id: 'onetime', name: '' + t('label.oneTimeClear'), icon: FaRegStar },
  ];

  const allFirstClearsState = useMemo(() => {
    if (!farmingStages || farmingStages.length === 0) return 'unchecked' as const;
    const checkedCount = farmingStages.filter((s) => firstClears?.[s.Id]).length;
    if (checkedCount === 0) return 'unchecked' as const;
    if (checkedCount === farmingStages.length) return 'checked' as const;
    return 'indeterminate' as const;
  }, [farmingStages, firstClears]);

  const allOneTimeRunsState = useMemo(() => {
    if (!oneTimeStages || oneTimeStages.length === 0) return 'unchecked' as const;
    const checkedCount = oneTimeStages.filter((s) => (runCounts?.[s.Id] || 0) > 0).length;
    if (checkedCount === 0) return 'unchecked' as const;
    if (checkedCount === oneTimeStages.length) return 'checked' as const;
    return 'indeterminate' as const;
  }, [oneTimeStages, runCounts]);

  if (!stagePrio || !firstClears || !runCounts) return null;

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
            className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 flex flex-row justify-center items-center ${
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
          <RepeatableTab
            farmingStages={farmingStages}
            stagePrio={stagePrio}
            runCounts={runCounts}
            firstClears={firstClears}
            missionsByStageId={missionsByStageId}
            totalBonus={totalBonus}
            minimizeRepeatableInfo={minimizeRepeatableInfo}
            setMinimizeRepeatableInfo={setMinimizeRepeatableInfo}
            showOneTimeRewards={showOneTimeRewards}
            setShowOneTimeRewards={setShowOneTimeRewards}
            handleStagePrioChange={handleStagePrioChange}
            handleRunCountChange={handleRunCountChange}
            handleFirstClearToggle={handleFirstClearToggle}
            handleToggleAllFirstClears={handleToggleAllFirstClears}
            handleSetMaxRuns={handleSetMaxRuns}
            handleBatchTogglePrio={handleBatchTogglePrio}
            allFirstClearsState={allFirstClearsState}
            eventData={eventData}
            iconData={iconData}
          />
        )}
        {activeTab === 'onetime' && (
          <OnetimeTab
            oneTimeStages={oneTimeStages}
            missionsByStageId={missionsByStageId}
            runCounts={runCounts}
            handleRunCountChange={handleRunCountChange}
            handleToggleAllOneTimeRuns={handleToggleAllOneTimeRuns}
            allOneTimeRunsState={allOneTimeRunsState}
            eventData={eventData}
            iconData={iconData}
          />
        )}
      </>
    </>
  );
};
