// TreasurePlanner.tsx
import type { TreasureResult } from '~/types/minigame/treasure';
import { useState, useCallback, useEffect } from 'react';
import { InteractiveSimulator } from './treasure/InteractiveSimulator';
import { ProbabilityCalculator } from './treasure/ProbabilityCalculator';
import { ShapeGlyph } from './treasure/TreasureShape';
import { ItemIcon } from '../../../components/item/Icon';
import { SimRunButton } from '../components/SimRunButton';
import type { EventData, IconData, TreasureRound } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';

import { useTranslation } from 'react-i18next';
import { getItemSortPriority } from '~/features/event-planner/logic/itemSort';
import { type TreasureSimConfig, type TreasureStrategy, type TreasureGoal, DefaultTreasureSimConfig } from '~/types/minigame/treasure';
import { runAsync } from '~/utils/runAsync';
import { runSingleSimulation } from '~/features/event-planner/logic/treasureSimulation';

export type { TreasureSimConfig };
export { DefaultTreasureSimConfig };

type RoundSimStats = {
  avg: number;
  min: number;
  max: number;
  stdDev: number;
};

// --- React Component ---
interface TreasurePlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  onCalculate: (result: TreasureResult | null) => void;
  remainingCurrency: Record<number, number>;
}

export const TreasurePlanner = (props: TreasurePlannerProps) => {
  const data = props.eventData.treasure;
  return data ? <TreasurePlannerContent {...props} eventData={{ ...props.eventData, treasure: data }} /> : null;
};

const TreasurePlannerContent = ({
  eventId,
  eventData,
  iconData,
  onCalculate,
  remainingCurrency,
}: TreasurePlannerProps & { eventData: TreasurePlannerProps['eventData'] & { treasure: NonNullable<TreasurePlannerProps['eventData']['treasure']> } }) => {
  const [interactiveSimState, setInteractiveSimState] = useState<{
    show: boolean;
    roundData: TreasureRound | null;
  }>({ show: false, roundData: null });
  const [activeTab, setActiveTab] = useState<'info' | 'calculator' | 'probability'>('info');
  const [simResult, setSimResult] = useState<Record<number, RoundSimStats> | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const { t } = useTranslation('planner');
  const { t: t_ui } = useTranslation('ui');

  const {
    treasureSimConfig: config,
    treasureStartRound: startRound,
    treasureFinalTotalRounds: finalTotalRounds,
    setTreasureSimConfig: setConfig,
    setTreasureStartRound: setStartRound,
    setTreasureFinalTotalRounds: setFinalTotalRounds,
  } = usePlanForEvent(eventId);

  const treasureData = eventData.treasure;
  const costPerCell = treasureData.round[0].CellCheckGoods.ConsumeParcelAmount[0];
  const costItemId = treasureData.round[0].CellCheckGoods.ConsumeParcelId[0];
  const costItemKey = `${treasureData.round[0].CellCheckGoods.ConsumeParcelTypeStr[0]}_${costItemId}`;

  const handleRunSimulation = useCallback(() => {
    if (!treasureData) return;
    setIsSimulating(true);
    void runAsync(() => {
      const results: Record<number, RoundSimStats> = {};
      const uniqueRounds = treasureData.round.filter((r) => r.TreasureRound < treasureData.info[0].LoopRound);
      const repeatingRound = treasureData.round.find((r) => r.TreasureRound === treasureData.info[0].LoopRound);
      if (repeatingRound) uniqueRounds.push(repeatingRound);

      for (const roundData of uniqueRounds) {
        const costs: number[] = [];
        for (let i = 0; i < config.simRuns; i++) {
          costs.push(
            runSingleSimulation({
              roundData,
              treasureRewards: treasureData.reward,
              strategy: config.strategy,
              goal: config.goal,
            }),
          );
        }
        const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
        const min = Math.min(...costs);
        const max = Math.max(...costs);
        const stdDev = Math.sqrt(costs.reduce((a, b) => a + (b - avg) ** 2, 0) / costs.length);
        results[roundData.TreasureRound] = { avg, min, max, stdDev };
      }
      setSimResult(results);
    }).finally(() => setIsSimulating(false));
  }, [treasureData, config]);

  const handleResultChange = (round: number, value: string) => {
    const cost = parseFloat(value) || 0;
    setSimResult((prev) => ({
      ...(prev || {}),
      [round]: { ...(prev?.[round] ?? { avg: 0, min: 0, max: 0, stdDev: 0 }), avg: cost },
    }));
  };

  // 'Max' button logic
  const handleSetMaxRounds = () => {
    if (!simResult) return;

    const repeatingRoundNum = treasureData.info[0].LoopRound;
    const repeatingRoundData = treasureData.round.find((r) => r.TreasureRound === repeatingRoundNum);
    if (!repeatingRoundData) return;

    // Calculate average rewards for repeating rounds
    const avgRewardsPerRepeatingRound: Record<string, number> = {};
    const avgCells = simResult[repeatingRoundNum]?.avg ?? treasureData.round[0].TreasureRoundSize[0] * treasureData.round[0].TreasureRoundSize[1];

    // Base reward
    const cellReward = treasureData.cell_reward[repeatingRoundData.CellRewardId];
    const cellKey = `${cellReward.RewardParcelTypeStr[0]}_${cellReward.RewardParcelId[0]}`;
    avgRewardsPerRepeatingRound[cellKey] = (avgRewardsPerRepeatingRound[cellKey] || 0) + cellReward.RewardParcelAmount[0] * avgCells;

    // Treasure reward
    // ... (Sum treasure rewards, similar to previous progress prediction logic)

    let maxRequiredRounds = 0;
    for (const [itemIdStr, deficit] of Object.entries(remainingCurrency)) {
      if (deficit < 0) {
        const rewardKey = `Item_${itemIdStr}`;
        const avgReward = avgRewardsPerRepeatingRound[rewardKey];
        if (avgReward > 0) {
          const required = Math.ceil(-deficit / avgReward);
          if (required > maxRequiredRounds) {
            maxRequiredRounds = required;
          }
        }
      }
    }

    const nonRepeatingRounds = treasureData.round.filter((r) => r.TreasureRound < repeatingRoundNum).length;
    setFinalTotalRounds(nonRepeatingRounds + maxRequiredRounds);
  };

  useEffect(() => {
    if (!simResult || finalTotalRounds < startRound) {
      onCalculate(null);
      return;
    }

    let totalCost = 0;
    const totalRewards: Record<string, number> = {};
    const repeatingRoundNum = treasureData.info[0].LoopRound;
    const repeatingRoundData = treasureData.round.find((r) => r.TreasureRound === repeatingRoundNum);
    if (!repeatingRoundData) return;

    for (let i = startRound; i <= finalTotalRounds; i++) {
      // Determine the current round to calculate (considering repeating rounds)
      const roundNum = i < repeatingRoundNum ? i : repeatingRoundNum;
      const roundData = roundNum === repeatingRoundNum ? repeatingRoundData : treasureData.round.find((r) => r.TreasureRound === roundNum);
      const avgCells = simResult[roundNum]?.avg ?? 0;

      if (!roundData || avgCells === 0) continue;

      // 1. Calculate total cost
      totalCost += avgCells * costPerCell;

      // 2. Calculate total reward
      // 2-1. Cell base reward (reward for opening each cell)
      const cellReward = treasureData.cell_reward[roundData.CellRewardId];
      if (cellReward) {
        const cellKey = `${cellReward.RewardParcelTypeStr[0]}_${cellReward.RewardParcelId[0]}`;
        totalRewards[cellKey] = (totalRewards[cellKey] || 0) + cellReward.RewardParcelAmount[0] * avgCells;
      }

      // 2-2. Treasure discovery reward
      const treasuresInRound = roundData.RewardId.map((id) => treasureData.reward[id]);
      const biggestTreasure = [...treasuresInRound].sort((a, b) => b.CellUnderImageWidth * b.CellUnderImageHeight - a.CellUnderImageWidth * a.CellUnderImageHeight)[0];

      // Iterate over each treasure type (including quantity) in this round
      roundData.RewardId.forEach((treasureId, index) => {
        const treasure = treasureData.reward[treasureId];
        const quantityInRound = roundData.RewardAmount[index];

        // Decide whether to sum rewards based on the goal
        const shouldCalculateReward = config.goal === 'clear_all' || (config.goal === 'biggest_only' && treasure.Id === biggestTreasure.Id);

        if (shouldCalculateReward) {
          // A treasure might appear multiple times in a round, so repeat by &#39;quantity&#39;
          for (let q = 0; q < quantityInRound; q++) {
            treasure.RewardParcelId.forEach((id, rIndex) => {
              const key = `${treasure.RewardParcelTypeStr[rIndex]}_${id}`;
              totalRewards[key] = (totalRewards[key] || 0) + treasure.RewardParcelAmount[rIndex];
            });
          }
        }
      });
    }

    onCalculate({
      cost: { key: costItemKey, amount: totalCost },
      rewards: totalRewards,
    });
  }, [simResult, startRound, finalTotalRounds, onCalculate, treasureData, costPerCell, costItemKey, config.goal]);

  const strategyOptions = [
    { id: 'heuristic', name: t('treasure.strategyHeuristic') },
    { id: 'checkerboard', name: t('treasure.strategyCheckerboard') },
    // { id: 'hunt_biggest_wiki', name: 'Strategy: Prioritize Biggest Treasure' },
    { id: 'custom', name: t('treasure.strategyCustom') },
  ];
  const goalOptions = [
    { id: 'clear_all', name: t('treasure.goalClearAll') },
    { id: 'biggest_only', name: t('treasure.goalBiggestOnly') },
  ];

  if (!treasureData || !costPerCell) return null;

  const loopRoundNum = treasureData.info[0].LoopRound;
  const loopRound = treasureData.round.find((r) => r.TreasureRound === loopRoundNum);
  const uniqueRoundsForInfo = [...treasureData.round.filter((r) => r.TreasureRound < loopRoundNum), ...(loopRound ? [loopRound] : [])];

  const [costType, costId] = costItemKey.split('_');

  return (
    <>
      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('treasure.title')}</h2>

      <div className="mt-4 space-y-4">
        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-700">
          {(['info', 'calculator', 'probability'] as const).map((tab) => {
            const label = tab === 'info' ? t_ui('info') : tab === 'calculator' ? t_ui('calculator') : t('treasure.probCalc');
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${activeTab === tab ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400' : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Info Tab ── */}
        {activeTab === 'info' && (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {uniqueRoundsForInfo.map((r) => {
              const isLoop = r.TreasureRound === loopRoundNum;
              const cellReward = treasureData.cell_reward[r.CellRewardId];
              const goods = r.CellCheckGoods;
              return (
                <section key={r.TreasureRound} className="py-3 first:pt-0">
                  {/* Round header */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                    <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100">{t('treasure.roundLabel', { round: r.TreasureRound })}</span>
                    {isLoop && (
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">{t('dream_maker.overview.repeat')}</span>
                    )}
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                      {t('treasure.boardSize')} {r.TreasureRoundSize[0]}×{r.TreasureRoundSize[1]}
                    </span>
                    <div className="flex items-center gap-3 ml-auto">
                      {goods.ConsumeParcelId.map((pid, idx) => (
                        <div key={`cost-${idx}`} className="flex items-center gap-1">
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('treasure.costPerCell')}</span>
                          <ItemIcon type={goods.ConsumeParcelTypeStr[idx]} itemId={String(pid)} amount={0} size={7} eventData={eventData} iconData={iconData} />
                          <span className="text-sm font-semibold tabular-nums text-neutral-800 dark:text-neutral-200">×{goods.ConsumeParcelAmount[idx].toLocaleString()}</span>
                        </div>
                      ))}
                      {cellReward && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('treasure.cellBaseReward')}</span>
                          {cellReward.RewardParcelId.map((pid, idx) => (
                            <span key={idx} className="flex items-center gap-1">
                              <ItemIcon type={cellReward.RewardParcelTypeStr[idx]} itemId={String(pid)} amount={0} size={7} eventData={eventData} iconData={iconData} />
                              <span className="text-sm font-semibold tabular-nums text-neutral-800 dark:text-neutral-200">×{cellReward.RewardParcelAmount[idx].toLocaleString()}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Treasures */}
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {r.RewardId.map((rewardId, idx) => {
                      const treasure = treasureData.reward[rewardId];
                      if (!treasure) return null;
                      return (
                        <div key={`${rewardId}-${idx}`} className="flex items-center gap-3 py-1.5">
                          <div className="flex w-10 shrink-0 flex-col items-center gap-0.5">
                            <ShapeGlyph w={treasure.CellUnderImageWidth} h={treasure.CellUnderImageHeight} typeIndex={idx} />
                            <span className="text-[10px] leading-none tabular-nums text-neutral-400 dark:text-neutral-500">
                              {treasure.CellUnderImageWidth}×{treasure.CellUnderImageHeight}
                            </span>
                          </div>
                          <div className="w-8 shrink-0 text-sm font-bold tabular-nums text-neutral-900 dark:text-neutral-100">×{r.RewardAmount[idx]}</div>
                          <div className="flex flex-wrap gap-0.5">
                            {treasure.RewardParcelId.map((pid, ridx) => (
                              <ItemIcon
                                key={ridx}
                                type={treasure.RewardParcelTypeStr[ridx]}
                                itemId={String(pid)}
                                amount={treasure.RewardParcelAmount[ridx]}
                                size={9}
                                eventData={eventData}
                                iconData={iconData}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* ── Calculator Tab ── */}
        {activeTab === 'calculator' && (
          <div className="space-y-4">
            <div className="space-y-4">
              {/* Simulation Config */}
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg space-y-3">
                <div>
                  <label className="text-sm font-bold dark:text-neutral-300">{t('treasure.selectStrategy')}</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {strategyOptions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setConfig((p) => ({ ...p, strategy: s.id as TreasureStrategy }))}
                        className={`${config.strategy === s.id ? 'bg-blue-500 text-white' : 'bg-white dark:bg-neutral-700 dark:border-neutral-600 dark:hover:bg-neutral-600'} border rounded-md px-2 py-1 text-xs`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>

                {config.strategy !== 'custom' ? (
                  <>
                    <div>
                      <label className="text-sm font-bold dark:text-neutral-300">{t('treasure.selectGoal')}</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {goalOptions.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => setConfig((p) => ({ ...p, goal: g.id as TreasureGoal }))}
                            className={`${config.goal === g.id ? 'bg-blue-500 text-white' : 'bg-white dark:bg-neutral-700 dark:border-neutral-600 dark:hover:bg-neutral-600'} border rounded-md px-2 py-1 text-xs`}
                          >
                            {g.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-sm font-bold dark:text-neutral-300">{t('treasure.simulationRuns')}</label>
                        <input
                          type="number"
                          value={config.simRuns}
                          onChange={(e) => setConfig((p) => ({ ...p, simRuns: parseInt(e.target.value) || 100 }))}
                          className="w-full p-2 mt-1 rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
                        />
                      </div>
                      <SimRunButton
                        isRunning={isSimulating}
                        onClick={handleRunSimulation}
                        className="mt-6 bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shrink-0"
                      >
                        {t('treasure.runAvgCalc')}
                      </SimRunButton>
                    </div>
                  </>
                ) : (
                  <div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2">{t('treasure.customStrategyDescription')}</p>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {treasureData.round.map((r) => (
                        <button
                          key={r.TreasureRound}
                          onClick={() => setInteractiveSimState({ show: true, roundData: r })}
                          className="bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700 text-white border rounded-md px-2 py-1 text-xs"
                        >
                          {t('treasure.recordRound', { round: r.TreasureRound })}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Round Range */}
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/40 rounded-lg">
                <h3 className="font-bold text-sm mb-2 dark:text-yellow-200">{t('treasure.planSettingsRoundRange')}</h3>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    className="w-full p-2 text-lg rounded border text-center dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
                    value={startRound || ''}
                    onChange={(e) => setStartRound(parseInt(e.target.value) || 1)}
                  />
                  <span className="shrink-0 dark:text-neutral-300">{t('treasure.fromRound')}</span>
                  <input
                    type="number"
                    min={startRound}
                    className="w-full p-2 text-lg rounded border text-center dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
                    value={finalTotalRounds || ''}
                    onChange={(e) => setFinalTotalRounds(parseInt(e.target.value) || 0)}
                  />
                  <span className="shrink-0 dark:text-neutral-300">{t('treasure.toRound')}</span>
                  <button
                    onClick={handleSetMaxRounds}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg shrink-0 disabled:bg-neutral-400 dark:disabled:bg-neutral-600"
                    disabled={!simResult}
                    title={!simResult ? t('treasure.runAvgCalcFirst') : t('treasure.setMaxRoundsTooltip')}
                  >
                    {t('treasure.setToMax')}
                  </button>
                </div>
              </div>

              {/* Per-round sim results */}
              {simResult && (
                <div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <h3 className="font-bold dark:text-neutral-200">{t('treasure.cellsNeededPerRound')}</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('treasure.avgOrModifiedValue')}</p>
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(simResult)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([round, stats]) => (
                        <div key={round} className="flex items-center gap-2 p-2 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
                          <span className="font-semibold text-sm dark:text-neutral-300 w-20 shrink-0">{t('treasure.roundLabel', { round })}</span>
                          <input
                            type="number"
                            value={stats.avg % 1 === 0 ? stats.avg : stats.avg.toFixed(1)}
                            onChange={(e) => handleResultChange(Number(round), e.target.value)}
                            className="w-20 p-1.5 rounded border text-right text-sm tabular-nums dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200 shrink-0"
                          />
                          <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0">{t('treasure.digCells')}</span>
                          <div className="flex items-center gap-1.5 text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500 shrink-0">
                            <span>
                              {t('road_puzzle.mcMin')} {stats.min}
                            </span>
                            <span>
                              {t('road_puzzle.mcMax')} {stats.max}
                            </span>
                            <span>σ {stats.stdDev.toFixed(1)}</span>
                          </div>
                          <div className="ml-auto shrink-0">
                            <ItemIcon type={costType} itemId={costId} amount={Math.ceil(stats.avg * costPerCell)} size={9} eventData={eventData} iconData={iconData} />
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Plan Result */}
                  {finalTotalRounds >= startRound &&
                    (() => {
                      let totalCost = 0;
                      const totalRewards: Record<string, number> = {};
                      const repeatingRoundData = treasureData.round.find((r) => r.TreasureRound === loopRoundNum);
                      if (!repeatingRoundData) return null;

                      for (let i = startRound; i <= finalTotalRounds; i++) {
                        const roundNum = i < loopRoundNum ? i : loopRoundNum;
                        const roundData = roundNum === loopRoundNum ? repeatingRoundData : treasureData.round.find((r) => r.TreasureRound === roundNum);
                        const avgCells = simResult[roundNum]?.avg ?? 0;
                        if (!roundData || avgCells === 0) continue;

                        totalCost += avgCells * costPerCell;

                        const cellReward = treasureData.cell_reward[roundData.CellRewardId];
                        if (cellReward) {
                          const cellKey = `${cellReward.RewardParcelTypeStr[0]}_${cellReward.RewardParcelId[0]}`;
                          totalRewards[cellKey] = (totalRewards[cellKey] || 0) + cellReward.RewardParcelAmount[0] * avgCells;
                        }

                        const treasuresInRound = roundData.RewardId.map((id) => treasureData.reward[id]);
                        const biggestTreasure = [...treasuresInRound].sort((a, b) => b.CellUnderImageWidth * b.CellUnderImageHeight - a.CellUnderImageWidth * a.CellUnderImageHeight)[0];

                        roundData.RewardId.forEach((tid, index) => {
                          const treasure = treasureData.reward[tid];
                          const quantity = roundData.RewardAmount[index];
                          if (config.goal === 'clear_all' || (config.goal === 'biggest_only' && treasure.Id === biggestTreasure.Id)) {
                            for (let q = 0; q < quantity; q++) {
                              treasure.RewardParcelId.forEach((id, rIndex) => {
                                const key = `${treasure.RewardParcelTypeStr[rIndex]}_${id}`;
                                totalRewards[key] = (totalRewards[key] || 0) + treasure.RewardParcelAmount[rIndex];
                              });
                            }
                          }
                        });
                      }

                      const sortedRewards = Object.entries(totalRewards).sort(([ka], [kb]) => getItemSortPriority(ka, eventData) - getItemSortPriority(kb, eventData));

                      return (
                        <div className="mt-4">
                          <h3 className="font-bold dark:text-neutral-200 mb-2">{t('treasure.planResultTitle', { start: startRound, end: finalTotalRounds })}</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Cost */}
                            <div className="bg-red-50 dark:bg-red-900/40 rounded-lg overflow-hidden">
                              <div className="px-3 py-2 border-b border-red-100 dark:border-red-800/50">
                                <h4 className="font-semibold text-red-800 dark:text-red-300 text-sm">{t_ui('totalCost')}</h4>
                              </div>
                              <div className="p-3">
                                <ItemIcon type={costType} itemId={costId} amount={Math.ceil(totalCost)} size={10} eventData={eventData} iconData={iconData} />
                              </div>
                            </div>

                            {/* Rewards table */}
                            <div className="bg-green-50 dark:bg-green-900/40 rounded-lg overflow-hidden">
                              <div className="px-3 py-2 border-b border-green-100 dark:border-green-800/50">
                                <h4 className="font-semibold text-green-800 dark:text-green-300 text-sm">{t('treasure.totalExpectedRewards')}</h4>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="border-b border-green-100 dark:border-green-800/50">
                                      <th className="text-left py-1.5 px-3 font-semibold text-green-700 dark:text-green-400">{t_ui('item')}</th>
                                      <th className="text-right py-1.5 px-3 font-semibold text-green-700 dark:text-green-400">{t_ui('amount')}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-green-100/60 dark:divide-green-800/30">
                                    {sortedRewards.map(([key, amount]) => {
                                      const [type, id] = key.split('_');
                                      return (
                                        <tr key={key} className="hover:bg-green-100/40 dark:hover:bg-green-800/20 transition-colors">
                                          <td className="py-1.5 px-3">
                                            <ItemIcon type={type} itemId={id} amount={0} size={9} eventData={eventData} iconData={iconData} />
                                          </td>
                                          <td className="py-1.5 px-3 text-right font-semibold tabular-nums dark:text-neutral-200">{Math.round(amount).toLocaleString()}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Probability Tab ── */}
        {activeTab === 'probability' && <ProbabilityCalculator rounds={uniqueRoundsForInfo} rewards={treasureData.reward} loopRound={loopRoundNum} />}
      </div>

      {interactiveSimState.show && interactiveSimState.roundData && (
        <InteractiveSimulator
          roundData={interactiveSimState.roundData}
          treasureRewards={treasureData.reward}
          onClose={() => setInteractiveSimState({ show: false, roundData: null })}
          onComplete={(clicks) => {
            const roundData = interactiveSimState.roundData;
            if (roundData) {
              handleResultChange(roundData.TreasureRound, clicks.toString());
            }
            setInteractiveSimState({ show: false, roundData: null });
          }}
        />
      )}
    </>
  );
};
