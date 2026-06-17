// app/components/planner/minigame/dreamMaker/DreamMakerInteractiveSimulator.tsx
import { useState, useEffect, useMemo } from 'react';
import type { EventData, IconData, MinigameDreamData, MinigameDreamParameter, MinigameDreamScheduleResult } from '~/types/plannerData';
import type { DreamMakerSimConfig, DreamMakerSimResult } from './type';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import { FiCheckCircle, FiChevronDown, FiChevronUp, FiTrendingDown, FiTrendingUp } from 'react-icons/fi';

interface InteractiveSimulatorProps {
  dreamData: MinigameDreamData;
  eventData: EventData;
  iconData: IconData;
  initialConfig: DreamMakerSimConfig;
  onComplete: (result: DreamMakerSimResult) => void;
  onClose: () => void;
}

export const DreamMakerInteractiveSimulator = ({ dreamData, /*eventData, iconData,*/ initialConfig, onComplete, onClose }: InteractiveSimulatorProps) => {
  // --- Data Setup ---
  const {
    daily_point,
    ending,
    ending_reward,
    info: [gameInfo],
    parameter,
    schedule_result,
    schedule,
  } = dreamData;
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'dream_maker' });
  const locale = i18n.language as Locale;

  // Helper to get localized string from LocalizeEtc
  const getLocaleString = (etc: { Kr?: string; Jp?: string; En?: string } | undefined): string => {
    // const langKey = (locale.charAt(0).toUpperCase() + locale.slice(1)) as keyof typeof etc; // 'kr' -> 'Kr'
    // return etc?.[langKey] || etc?.Kr || 'N/A';
    if (locale == 'ko') return etc?.Kr || 'N/A';
    if (locale == 'ja') return etc?.Jp || 'N/A';
    if (locale == 'en') return etc?.En || etc?.Jp || 'N/A';
    return etc?.Jp || 'N/A';
  };

  const days = gameInfo.DreamMakerDays;
  const actionsPerDay = gameInfo.DreamMakerActionPoint;
  const carryoverRate = gameInfo.DreamMakerParameterTransfer / 10000;
  const costInfo = gameInfo.ScheduleCostGoods;
  const costPerAction = costInfo.ConsumeParcelAmount[0];
  const costKey = `${costInfo.ConsumeParcelTypeStr[0]}_${costInfo.ConsumeParcelId[0]}`;
  const eventPointKey = `${gameInfo.DreamMakerDailyPointParcelTypeStr}_${gameInfo.DreamMakerDailyPointId}`;

  const paramInfo = useMemo(
    () =>
      parameter.reduce<Record<number, MinigameDreamParameter>>((acc, p) => {
        acc[p.ParameterType] = p;
        return acc;
      }, {}),
    [parameter],
  );
  const scheduleResultsByGroup = useMemo(
    () =>
      schedule_result.reduce<Record<number, MinigameDreamScheduleResult[]>>((acc, res) => {
        if (!acc[res.DreamMakerScheduleGroup]) acc[res.DreamMakerScheduleGroup] = [];
        acc[res.DreamMakerScheduleGroup].push(res);
        return acc;
      }, {}),
    [schedule_result],
  );
  const specialEnding = useMemo(() => ending.find((e) => e.DreamMakerEndingType === 2), [ending]);
  const normalEnding = useMemo(() => ending.find((e) => e.DreamMakerEndingType === 1), [ending]);

  if (!specialEnding || !normalEnding) throw Error('no ending of dream');

  // --- State ---
  const [currentLoop, setCurrentLoop] = useState(1);
  const [currentDay, setCurrentDay] = useState(1);
  const [actionsRemaining, setActionsRemaining] = useState(actionsPerDay);
  const [currentStats, setCurrentStats] = useState<Record<number, number>>({});
  const [previousLoopFinalStats, setPreviousLoopFinalStats] = useState<Record<number, number>>(initialConfig.isFirstRun ? {} : initialConfig.initialStats || {});
  const [history, setHistory] = useState<string[]>([]);
  const [lastOutcome, setLastOutcome] = useState<string | null>(null);
  const [totalCost, setTotalCost] = useState<Record<string, number>>({});
  const [totalRewards, setTotalRewards] = useState<Record<string, number>>({});
  const [firstEndingReached, setFirstEndingReached] = useState<Record<number, boolean>>(initialConfig.clearedFirstRewards ? { [specialEnding.EndingId]: true, [normalEnding.EndingId]: true } : {});
  const [isComplete, setIsComplete] = useState(false);
  const [endingHistory, setEndingHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // --- Core Logic (useEffect, handleAction, handleComplete) ---
  useEffect(() => {
    const initial: Record<number, number> = {};
    parameter.forEach((p) => {
      const baseValue = p.ParameterBase;
      let initialStat: number;

      if (currentLoop === 1 && !initialConfig.isFirstRun && initialConfig.initialStats) {
        initialStat = initialConfig.initialStats[p.ParameterType] ?? baseValue;
      } else if (currentLoop > 1) {
        const carryoverBonus = previousLoopFinalStats[p.ParameterType] ? Math.floor(previousLoopFinalStats[p.ParameterType] * carryoverRate) : 0;
        initialStat = baseValue + carryoverBonus;
      } else {
        initialStat = baseValue;
      }

      if (p.ParameterType === 4 && p.ParameterBaseMax > 0 && currentLoop > 1) {
        const carryoverBonus = previousLoopFinalStats[p.ParameterType] ? Math.floor(previousLoopFinalStats[p.ParameterType] * carryoverRate) : 0;
        initialStat = Math.min(baseValue + carryoverBonus, p.ParameterBaseMax);
      }

      initial[p.ParameterType] = Math.max(p.ParameterMin, Math.min(p.ParameterMax, initialStat));
    });

    setCurrentStats(initial);

    if (currentLoop > 1) {
      setCurrentDay(1);
      setActionsRemaining(actionsPerDay);
      setLastOutcome(null);
    }
  }, [currentLoop, parameter, initialConfig, previousLoopFinalStats, carryoverRate]); // No change in logic

  const handleAction = (scheduleGroupId: number) => {
    if (isComplete || actionsRemaining <= 0) return;

    // ... (Cost calculation) ...
    const newCost = { ...totalCost };
    newCost[costKey] = (newCost[costKey] || 0) + costPerAction;
    setTotalCost(newCost);

    // ... (Outcome selection) ...
    const possibleResults = scheduleResultsByGroup[scheduleGroupId];
    if (!possibleResults) return;
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

    // ... (Stat updates) ...
    const newStats = { ...currentStats };
    const statChangesLog: string[] = [];
    outcome.RewardParameter.forEach((paramType, index) => {
      const amount = outcome.RewardParameterAmount[index];
      const operation = outcome.RewardParameterOperationTypeStr[index];
      const oldVal = newStats[paramType];
      let newVal = oldVal;
      if (operation.includes('GrowUp')) newVal += amount;
      else if (operation.includes('GrowDown')) newVal -= amount;
      newVal = Math.max(paramInfo[paramType].ParameterMin, Math.min(paramInfo[paramType].ParameterMax, newVal));
      newStats[paramType] = newVal;
      if (newVal !== oldVal) statChangesLog.push(`${getLocaleString(paramInfo[paramType].LocalizeEtc)}: ${newVal > oldVal ? '+' : ''}${newVal - oldVal}`);
    });
    setCurrentStats(newStats);

    // ... (Reward updates) ...
    const newRewards = { ...totalRewards };
    if (outcome.RewardParcelTypeStr && outcome.RewardParcelId && outcome.RewardParcelAmount) {
      const rewardKey = `${outcome.RewardParcelTypeStr}_${outcome.RewardParcelId}`;
      newRewards[rewardKey] = (newRewards[rewardKey] || 0) + outcome.RewardParcelAmount;
    }

    // ... (History logging - updated to use locale) ...
    const scheduleName = getLocaleString(schedule.find((s) => s.DreamMakerScheduleGroupId === scheduleGroupId)?.LocalizeEtc) || t('sim.defaultScheduleName');
    const outcomeText = `${outcome.DreamMakerResultStr} (${statChangesLog.join(', ')})`; // Assuming outcome has LocalizeEtc
    setHistory((prev) => [`${t('sim.dayLabel')} ${currentDay}-${actionsPerDay - actionsRemaining + 1}: ${scheduleName} -> ${outcomeText}`, ...prev]);
    setLastOutcome(outcomeText);

    const newActionsRemaining = actionsRemaining - 1;
    setActionsRemaining(newActionsRemaining);

    // ... (End of day / End of loop logic) ...
    if (newActionsRemaining <= 0) {
      const totalParamForDaily = (newStats[1] || 0) + (newStats[2] || 0) + (newStats[3] || 0);
      const dailyRule = daily_point.find((r) => totalParamForDaily >= r.TotalParameterMin && totalParamForDaily < r.TotalParameterMax);
      if (dailyRule) {
        const pointsToday = Math.floor(totalParamForDaily * (dailyRule.DailyPointCoefficient / 10000) + dailyRule.DailyPointCorrectionValue);
        newRewards[eventPointKey] = (newRewards[eventPointKey] || 0) + pointsToday;
      }

      const nextDay = currentDay + 1;
      if (nextDay > days) {
        const reachedSpecial = specialEnding.EndingCondition ? specialEnding.EndingCondition.every((paramType, j) => newStats[paramType] >= (specialEnding.EndingConditionValue?.[j] || 0)) : false;
        const finalEnding = reachedSpecial ? specialEnding : normalEnding;
        setEndingHistory((prev) => [...prev, reachedSpecial ? 'Special' : 'Normal']);

        const rewardType = firstEndingReached[finalEnding.EndingId] ? 2 : 1;
        const endingReward = ending_reward.find((r) => r.EndingId === finalEnding.EndingId && r.DreamMakerEndingRewardType === rewardType);
        if (endingReward) {
          endingReward.RewardParcelId.forEach((id, index) => {
            const key = `${endingReward.RewardParcelTypeStr[index]}_${id}`;
            newRewards[key] = (newRewards[key] || 0) + endingReward.RewardParcelAmount[index];
          });
        }
        setFirstEndingReached((prev) => ({
          ...prev,
          [finalEnding.EndingId]: true,
        }));
        setPreviousLoopFinalStats(newStats);

        if (currentLoop >= initialConfig.targetLoops) {
          setIsComplete(true);
        } else {
          setCurrentLoop((prev) => prev + 1);
        }
      } else {
        setCurrentDay(nextDay);
        setActionsRemaining(actionsPerDay);
      }
    }
    setTotalRewards(newRewards);
  };

  const handleComplete = () => {
    const totalEventPoints = totalRewards[eventPointKey] || 0;
    const totalActions = days * actionsPerDay * initialConfig.targetLoops;

    const resultForCallback: DreamMakerSimResult = {
      avgCost: totalCost,
      avgRewards: totalRewards,
      avgEventPoints: totalEventPoints,
      avgFinalStats: currentStats,
      avgSpecialEndings: endingHistory.filter((e) => e === 'Special').length,
      avgNormalEndings: endingHistory.filter((e) => e === 'Normal').length,
      avgActions: totalActions,
      loopsDetail: {}, // Interactive mode doesn't produce averaged loop details
    };
    onComplete(resultForCallback);
  };

  const avgScheduleStatChanges = useMemo(() => {
    const changes: Record<number, { gains: Record<number, number>; losses: Record<number, number> }> = {};
    dreamData.schedule_result.forEach((res) => {
      const group = res.DreamMakerScheduleGroup;
      if (!changes[group]) changes[group] = { gains: {}, losses: {} };
      res.RewardParameter.forEach((pType, idx) => {
        const amount = res.RewardParameterAmount[idx] * (res.Prob / 10000);
        const op = res.RewardParameterOperationTypeStr[idx];
        if (op.includes('GrowUp')) {
          changes[group].gains[pType] = (changes[group].gains[pType] || 0) + amount;
        } else if (op.includes('GrowDown')) {
          changes[group].losses[pType] = (changes[group].losses[pType] || 0) + amount;
        }
      });
    });
    return changes;
  }, [dreamData.schedule_result]);

  return (
    //  Modal container
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-neutral-800 p-4 sm:p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/*  Header */}
        <div className="flex justify-between items-center mb-4 pb-4 border-b dark:border-neutral-700">
          <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('sim.title')}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-2xl leading-none">
            &times;
          </button>
        </div>

        {/*  Completion Screen */}
        {isComplete ? (
          <div className="text-center py-10 grow flex flex-col justify-center items-center">
            <FiCheckCircle className="text-green-500 text-5xl mb-4" />
            <p className="text-2xl font-bold mb-2 text-neutral-900 dark:text-neutral-100">{t('sim.completeTitle')}</p>
            <p className="text-neutral-700 dark:text-neutral-300">{t('sim.completeBody', { count: initialConfig.targetLoops })}</p>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              {t('sim.endingHistoryLabel')} {endingHistory.join(', ')}
            </p>
            <button onClick={handleComplete} className="mt-6 bg-blue-500 hover:bg-blue-600 text-white font-bold px-6 py-2 rounded-lg transition-colors">
              {t('sim.saveAndClose')}
            </button>
          </div>
        ) : (
          //  Main Simulation View
          <div className="grow overflow-y-auto space-y-4 pr-2 custom-scrollbar">
            {' '}
            {/* Added custom-scrollbar class */}
            {/* Status Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 p-3 bg-neutral-50 dark:bg-neutral-700/50 rounded-lg text-sm">
              <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                {t('sim.loopLabel')}:{' '}
                <span className="text-blue-600 dark:text-blue-400">
                  {currentLoop} / {initialConfig.targetLoops}
                </span>
              </div>
              <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                {t('sim.dayLabel')}:{' '}
                <span className="text-blue-600 dark:text-blue-400">
                  {currentDay} / {days}
                </span>
              </div>
              <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                {t('sim.actionsRemaining')}:{' '}
                <span className="text-blue-600 dark:text-blue-400">
                  {actionsRemaining} / {actionsPerDay}
                </span>
              </div>
            </div>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {parameter.map((p) => (
                <div key={p.ParameterType} className="bg-neutral-100 dark:bg-neutral-700 p-2 rounded-lg">
                  <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">{getLocaleString(p.LocalizeEtc)}</p>
                  <p className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{currentStats[p.ParameterType]?.toLocaleString() ?? '...'}</p>
                </div>
              ))}
            </div>
            {/* Action Buttons */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {dreamData.schedule.map((s) => {
                const changes = avgScheduleStatChanges[s.DreamMakerScheduleGroupId];
                return (
                  <button
                    key={s.DreamMakerScheduleGroupId}
                    onClick={() => handleAction(s.DreamMakerScheduleGroupId)}
                    className="cursor-pointer p-3 bg-white dark:bg-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-600 rounded-lg text-left transition-all shadow-sm border dark:border-neutral-600"
                  >
                    <p className="font-semibold text-sm text-blue-600 dark:text-blue-400 mb-1">{getLocaleString(s.LocalizeEtc)}</p>
                    <div className="text-xs space-y-0.5">
                      {changes &&
                        parameter.map((p) => {
                          const gain = changes.gains[p.ParameterType] || 0;
                          const loss = changes.losses[p.ParameterType] || 0;
                          if (gain === 0 && loss === 0) return null;
                          const netChange = gain - loss;
                          const color = netChange > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                          return (
                            <div key={p.ParameterType} className={`flex items-center justify-between ${color}`}>
                              <span className="text-neutral-600 dark:text-neutral-400">{getLocaleString(p.LocalizeEtc)}:</span>
                              <span className="font-medium flex items-center">
                                {netChange > 0 ? <FiTrendingUp size={12} className="mr-0.5" /> : <FiTrendingDown size={12} className="mr-0.5" />}
                                {netChange.toFixed(1)}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Outcome & History */}
            <div className="border-t dark:border-neutral-700 pt-3 mt-3 space-y-2">
              {/* Last Outcome */}
              <div className="text-sm text-neutral-700 dark:text-neutral-300 p-2 bg-neutral-50 dark:bg-neutral-700/50 rounded">
                {lastOutcome ? (
                  <>
                    <strong>{t('sim.outcomeLabel')}:</strong> {lastOutcome}
                  </>
                ) : (
                  <span className="text-neutral-400 dark:text-neutral-500">{t('sim.waiting')}</span>
                )}
              </div>

              {/* History Log */}
              <div className="text-xs">
                <button onClick={() => setShowHistory((prev) => !prev)} className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white">
                  {showHistory ? <FiChevronUp /> : <FiChevronDown />}
                  {t('sim.historyLog')}
                </button>
                {showHistory && (
                  <div className="mt-2 p-2 bg-neutral-900 dark:bg-black text-neutral-300 rounded max-h-40 overflow-y-auto font-mono text-[11px] leading-relaxed custom-scrollbar">
                    {history.length > 0 ? history.map((line, i) => <p key={i}>{line}</p>) : <p>{t('sim.noHistory')}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
