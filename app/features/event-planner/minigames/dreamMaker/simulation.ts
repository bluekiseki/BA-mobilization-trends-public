import type { MinigameDreamData, MinigameDreamParameter, MinigameDreamScheduleResult } from '~/types/plannerData';
import type { DreamMakerSimConfig, DreamMakerSimResult } from './type';

export const runSimulation = (dreamData: MinigameDreamData, simConfig: DreamMakerSimConfig): DreamMakerSimResult => {
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

  const days = gameInfo.DreamMakerDays;
  const actionsPerDay = gameInfo.DreamMakerActionPoint;
  const carryoverRate = gameInfo.DreamMakerParameterTransfer / 10000;
  const costInfo = gameInfo.ScheduleCostGoods;
  const costPerAction = costInfo.ConsumeParcelAmount[0];
  const costKey = `${costInfo.ConsumeParcelTypeStr[0]}_${costInfo.ConsumeParcelId[0]}`;
  const eventPointKey = `${gameInfo.DreamMakerDailyPointParcelTypeStr}_${gameInfo.DreamMakerDailyPointId}`;

  const paramInfo = parameter.reduce<Record<number, MinigameDreamParameter>>((acc, p) => {
    acc[p.ParameterType] = p;
    return acc;
  }, {});
  const scheduleResultsByGroup = schedule_result.reduce<Record<number, MinigameDreamScheduleResult[]>>((acc, res) => {
    if (!acc[res.DreamMakerScheduleGroup]) acc[res.DreamMakerScheduleGroup] = [];
    acc[res.DreamMakerScheduleGroup].push(res);
    return acc;
  }, {});

  const scheduleIdMap: Record<string, number> = {};
  dreamData.schedule.forEach((s) => {
    const krName = s.LocalizeEtc?.Kr;
    if (krName === '악기연습') scheduleIdMap['perf'] = s.DreamMakerScheduleGroupId;
    else if (krName === '이론공부') scheduleIdMap['sense'] = s.DreamMakerScheduleGroupId;
    else if (krName === '협동훈련') scheduleIdMap['team'] = s.DreamMakerScheduleGroupId;
    else if (krName === '당분충전') scheduleIdMap['cond'] = s.DreamMakerScheduleGroupId;
  });

  const specialEnding = ending.find((e) => e.DreamMakerEndingType === 2);
  const normalEnding = ending.find((e) => e.DreamMakerEndingType === 1);

  if (!specialEnding || !normalEnding) throw Error('noDreamMakerEndingType');

  const totalSimCost: Record<string, number> = {},
    totalSimRewards: Record<string, number> = {};
  let totalSimEventPoints = 0;
  const totalSimFinalStats: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let totalSimSpecialEndings = 0,
    totalSimNormalEndings = 0,
    totalSimActions = 0;
  const totalLoopsDetail: Record<
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
    const simRunRewards: Record<string, number> = {};
    let simRunEventPoints = 0,
      simRunCost = 0,
      simRunActions = 0;
    const firstEndingReachedThisSim: Record<number, boolean> = clearedFirstRewards ? { [specialEnding.EndingId]: true, [normalEnding.EndingId]: true } : {};
    let runSpecialEndings = 0,
      runNormalEndings = 0;
    const maxStatsAchieved: Record<number, boolean> = { 1: false, 2: false, 3: false, 4: false };

    for (let loopIndex = 0; loopIndex < targetLoops; loopIndex++) {
      const currentLoopNumber = loopIndex + 1;
      const currentStats: Record<number, number> = {};
      const loopStartStats: Record<number, number> = {};

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
      let currentLoopStrategy = strategy;

      for (let day = 1; day <= days; day++) {
        for (let action = 1; action <= actionsPerDay; action++) {
          simRunCost += costPerAction;
          simRunActions++;
          let scheduleGroupId: number | undefined;

          if (currentLoopStrategy === 'mission_priority') {
            parameter.forEach((p) => {
              if (currentStats[p.ParameterType] >= p.ParameterMax) maxStatsAchieved[p.ParameterType] = true;
            });
            const allMissionsDone = Object.values(maxStatsAchieved).every((v) => v);

            if (allMissionsDone) {
              currentLoopStrategy = 'pt_optimal';
            } else {
              let targetParamType = -1;
              for (const pType of [4, 1, 2, 3]) {
                if (!maxStatsAchieved[pType]) {
                  targetParamType = pType;
                  break;
                }
              }
              if (targetParamType === 1) scheduleGroupId = scheduleIdMap['perf'];
              else if (targetParamType === 2) scheduleGroupId = scheduleIdMap['sense'];
              else if (targetParamType === 3) scheduleGroupId = scheduleIdMap['team'];
              else scheduleGroupId = scheduleIdMap['cond'];
            }
          }

          if (currentLoopStrategy === 'pt_optimal') {
            if (day < days && currentStats[4] < paramInfo[4].ParameterMin + 30) {
              scheduleGroupId = scheduleIdMap['cond'];
            } else if (day === days && currentStats[4] < 100) {
              scheduleGroupId = scheduleIdMap['cond'];
            } else {
              const needsBoost: number[] = [];
              specialEnding.EndingCondition?.forEach((pt, idx) => {
                if (pt !== 4 && specialEnding.EndingConditionValue && currentStats[pt] < specialEnding.EndingConditionValue[idx]) {
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
                const mainStats = [currentStats[1], currentStats[2], currentStats[3]];
                const minStatValue = Math.min(...mainStats);
                if (currentStats[1] === minStatValue) scheduleGroupId = scheduleIdMap['perf'];
                else if (currentStats[2] === minStatValue) scheduleGroupId = scheduleIdMap['sense'];
                else scheduleGroupId = scheduleIdMap['team'];
              }
            }
          }

          if (scheduleGroupId === undefined) {
            scheduleGroupId = scheduleIdMap['perf'];
          }

          const possibleResults = scheduleResultsByGroup[scheduleGroupId];
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
            const amount = outcome.RewardParameterAmount[index];
            const operation = outcome.RewardParameterOperationTypeStr[index];
            let newVal = currentStats[paramType];
            if (operation.includes('GrowUp')) newVal += amount;
            else if (operation.includes('GrowDown')) newVal -= amount;
            currentStats[paramType] = Math.max(paramInfo[paramType].ParameterMin, Math.min(paramInfo[paramType].ParameterMax, newVal));
          });

          if (outcome.RewardParcelTypeStr && outcome.RewardParcelId && outcome.RewardParcelAmount) {
            const rewardKey = `${outcome.RewardParcelTypeStr}_${outcome.RewardParcelId}`;
            simRunRewards[rewardKey] = (simRunRewards[rewardKey] || 0) + outcome.RewardParcelAmount;
          }
        }

        const totalParamForDaily = (currentStats[1] || 0) + (currentStats[2] || 0) + (currentStats[3] || 0);
        const dailyRule = daily_point.find((r) => totalParamForDaily >= r.TotalParameterMin && totalParamForDaily < r.TotalParameterMax);
        if (dailyRule) {
          const points = Math.floor(totalParamForDaily * (dailyRule.DailyPointCoefficient / 10000) + dailyRule.DailyPointCorrectionValue);
          simRunEventPoints += points;
          loopEventPoints += points;
        }
      }

      const reachedSpecial = specialEnding.EndingCondition
        ? specialEnding.EndingCondition.every((paramType, j) => specialEnding.EndingConditionValue && currentStats[paramType] >= specialEnding.EndingConditionValue[j])
        : false;
      const finalEnding = reachedSpecial ? specialEnding : normalEnding;

      if (reachedSpecial) {
        runSpecialEndings++;
        totalLoopsDetail[currentLoopNumber].specialEndingCount++;
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

      for (const pType in currentStats) {
        totalLoopsDetail[currentLoopNumber].endStats[Number(pType)] += currentStats[Number(pType)];
      }
      totalLoopsDetail[currentLoopNumber].eventPoints += loopEventPoints;
    }

    totalSimCost[costKey] = (totalSimCost[costKey] || 0) + simRunCost;
    totalSimEventPoints += simRunEventPoints;
    for (const [key, amount] of Object.entries(simRunRewards)) {
      totalSimRewards[key] = (totalSimRewards[key] || 0) + amount;
    }
    for (const paramTypeStr in previousLoopFinalStats) {
      const paramType = Number(paramTypeStr);
      totalSimFinalStats[paramType] = (totalSimFinalStats[paramType] || 0) + previousLoopFinalStats[paramType];
    }
    totalSimActions += simRunActions;
    totalSimSpecialEndings += runSpecialEndings;
    totalSimNormalEndings += runNormalEndings;
  }

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
        startStats: Object.keys(detail.startStats).reduce<Record<number, number>>((acc, key) => {
          acc[Number(key)] = detail.startStats[Number(key)] / detail.count;
          return acc;
        }, {}),
        endStats: Object.keys(detail.endStats).reduce<Record<number, number>>((acc, key) => {
          acc[Number(key)] = detail.endStats[Number(key)] / detail.count;
          return acc;
        }, {}),
        eventPoints: detail.eventPoints / detail.count,
        specialEndingRate: detail.specialEndingCount / detail.count,
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
