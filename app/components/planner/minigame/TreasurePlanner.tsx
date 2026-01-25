// TreasurePlanner.tsx
import { useState, useCallback, useEffect } from 'react';
import { InteractiveSimulator } from './treasure/InteractiveSimulator';
import { ItemIcon } from '../common/Icon';
import type { EventData, IconData, TreasureReward, TreasureRound } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { ChevronIcon } from '~/components/Icon';
import { useTranslation } from 'react-i18next';

type Strategy = 'checkerboard' | 'hunt_biggest_wiki' | 'heuristic' | 'custom';
type Goal = 'clear_all' | 'biggest_only';
export type TreasureResult = {
  cost: { key: string; amount: number };
  rewards: Record<string, number>;
};

interface SimulationParams {
  roundData: TreasureRound;
  treasureRewards: Record<string, TreasureReward>;
  strategy: Strategy;
  goal: Goal;
  customPattern?: { x: number; y: number }[];
}

export interface TreasureSimConfig {
  strategy: Strategy;
  goal: Goal;
  simRuns: number;
}

export const DefaultTreasureSimConfig: TreasureSimConfig = {
  strategy: 'checkerboard',
  goal: 'clear_all',
  simRuns: 100,
};

export const placeTreasures = (roundData: TreasureRound, rewards: Record<string, TreasureReward>) => {
  const [width, height] = roundData.TreasureRoundSize;
  const board: (number | null)[][] = Array(height)
    .fill(null)
    .map(() => Array(width).fill(null));
  const treasuresToPlace: TreasureReward[] = [];

  roundData.RewardId.forEach((id, index) => {
    for (let i = 0; i < roundData.RewardAmount[index]; i++) {
      treasuresToPlace.push(rewards[id]);
    }
  });

  treasuresToPlace.sort((a, b) => b.CellUnderImageWidth * b.CellUnderImageHeight - a.CellUnderImageWidth * a.CellUnderImageHeight);

  const placedTreasures: {
    instanceId: string;
    treasureId: number;
    cells: { x: number; y: number }[];
    x: number;
    y: number;
    width: number;
    height: number;
  }[] = [];

  for (const [index, treasure] of treasuresToPlace.entries()) {
    let placed = false;
    for (let attempts = 0; attempts < 100; attempts++) {
      const rotates = Math.random() < 0.5;
      const tw = rotates ? treasure.CellUnderImageHeight : treasure.CellUnderImageWidth;
      const th = rotates ? treasure.CellUnderImageWidth : treasure.CellUnderImageHeight;

      if (width < tw || height < th) continue;

      const x = Math.floor(Math.random() * (width - tw + 1));
      const y = Math.floor(Math.random() * (height - th + 1));

      let collision = false;
      const treasureCells: { x: number; y: number }[] = [];
      for (let i = 0; i < tw; i++) {
        for (let j = 0; j < th; j++) {
          if (board[y + j][x + i] !== null) {
            collision = true;
            break;
          }
          treasureCells.push({ x: x + i, y: y + j });
        }
        if (collision) break;
      }

      if (!collision) {
        const instanceId = `${treasure.Id}_${index}`;
        treasureCells.forEach((cell) => {
          board[cell.y][cell.x] = treasure.Id;
        });
        placedTreasures.push({
          instanceId,
          treasureId: treasure.Id,
          cells: treasureCells,
          x,
          y,
          width: tw,
          height: th,
        });
        placed = true;
        break;
      }
    }
    if (!placed) return null;
  }
  return { placedTreasures, board };
};

const findBestHeuristicCell = (board: (number | null)[][], unopenedCells: Set<string>, remainingTreasures: TreasureReward[]) => {
  const [width, height] = [board[0].length, board.length];
  const probabilityMap = Array(height)
    .fill(0)
    .map(() => Array(width).fill(0));

  for (const treasure of remainingTreasures) {
    const orientations = [{ w: treasure.CellUnderImageWidth, h: treasure.CellUnderImageHeight }];
    if (treasure.CellUnderImageWidth !== treasure.CellUnderImageHeight) {
      orientations.push({
        w: treasure.CellUnderImageHeight,
        h: treasure.CellUnderImageWidth,
      });
    }

    for (const { w, h } of orientations) {
      if (width < w || height < h) continue;
      for (let y = 0; y <= height - h; y++) {
        for (let x = 0; x <= width - w; x++) {
          let isValidPlacement = true;
          const placementCells: { x: number; y: number }[] = [];
          for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
              // If board[y+j][x+i] is not null and is a different treasure (not part of the current one), placement is impossible
              if (board[y + j][x + i] !== null) {
                isValidPlacement = false;
                break;
              }
              placementCells.push({ x: x + i, y: y + j });
            }
            if (!isValidPlacement) break;
          }
          if (isValidPlacement) {
            placementCells.forEach((cell) => {
              if (unopenedCells.has(`${cell.x},${cell.y}`)) {
                probabilityMap[cell.y][cell.x]++;
              }
            });
          }
        }
      }
    }
  }

  let bestCell = { x: -1, y: -1, score: -1 };
  for (const cellStr of unopenedCells) {
    const [x, y] = cellStr.split(',').map(Number);
    if (probabilityMap[y][x] > bestCell.score) {
      bestCell = { x, y, score: probabilityMap[y][x] };
    }
  }
  return bestCell;
};

const WIKI_HUNT_PATTERNS: Record<number, { x: number; y: number }[]> = {
  6: [
    { x: 1, y: 1 },
    { x: 7, y: 3 },
    { x: 4, y: 1 },
    { x: 4, y: 3 },
    { x: 1, y: 3 },
    { x: 7, y: 1 },
  ],
  8: [
    { x: 1, y: 1 },
    { x: 7, y: 3 },
    { x: 4, y: 1 },
    { x: 4, y: 3 },
  ],
  9: [
    { x: 4, y: 2 },
    { x: 2, y: 2 },
    { x: 6, y: 2 },
  ],
};

const runSingleSimulation = ({
  roundData,
  treasureRewards,
  strategy,
  goal,
  customPattern = [],
}: SimulationParams & {
  customPattern?: { x: number; y: number }[];
}): number => {
  const placementResult = placeTreasures(roundData, treasureRewards);
  if (!placementResult) return roundData.TreasureRoundSize[0] * roundData.TreasureRoundSize[1];
  const { placedTreasures, board } = placementResult;

  const [width, height] = roundData.TreasureRoundSize;
  const openedCells = new Set<string>();
  const foundTreasureInstances = new Set<string>();

  const treasuresSortedBySize = [...placedTreasures].sort((a, b) => b.cells.length - a.cells.length);
  const biggestTreasure = treasuresSortedBySize[0];
  const allTreasureInstancesOnBoard = new Set(placedTreasures.map((t) => t.instanceId));

  const openCell = (x: number, y: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      openedCells.add(`${x},${y}`);
    }
  };

  // --- 1. Prepare initial strategy pattern ---
  let strategyPattern: { x: number; y: number }[] = [];
  let patternIndex = 0;

  if (strategy === 'custom') {
    strategyPattern = customPattern;
  } else if (strategy === 'checkerboard') {
    for (let y = 0; y < height; y++) {
      for (let x = y % 2; x < width; x += 2) {
        strategyPattern.push({ x, y });
      }
    }
  } else if (strategy === 'hunt_biggest_wiki') {
    const pattern = WIKI_HUNT_PATTERNS[biggestTreasure.cells.length];
    if (pattern) {
      strategyPattern = pattern;
    }
  }

  // --- 2. Main simulation loop ---
  while (true) {
    // Update currently found treasure instances
    for (const treasure of placedTreasures) {
      if (foundTreasureInstances.has(treasure.instanceId)) continue;
      const isFullyOpened = treasure.cells.every((c) => openedCells.has(`${c.x},${c.y}`));
      if (isFullyOpened) {
        foundTreasureInstances.add(treasure.instanceId);
      }
    }

    // End if goal is reached
    if (goal === 'biggest_only' && foundTreasureInstances.has(biggestTreasure.instanceId)) break;
    if (goal === 'clear_all' && foundTreasureInstances.size === allTreasureInstancesOnBoard.size) break;
    if (openedCells.size >= width * height) break;

    // Priority 1: Complete partially discovered treasures
    let madeProgress = false;
    for (const treasure of placedTreasures) {
      if (foundTreasureInstances.has(treasure.instanceId)) continue;

      const unopenedParts = treasure.cells.filter((c) => !openedCells.has(`${c.x},${c.y}`));
      const openedPartsCount = treasure.cells.length - unopenedParts.length;

      if (openedPartsCount > 0) {
        for (const cell of unopenedParts) {
          openCell(cell.x, cell.y);
        }
        madeProgress = true;
      }
    }

    // Priority 2: Explore new cells
    if (!madeProgress) {
      // Pattern-based strategy (checkerboard, wiki guide, custom)
      if (patternIndex < strategyPattern.length) {
        let cellToOpen = strategyPattern[patternIndex];
        // If cell is already open, skip to the next pattern
        while (openedCells.has(`${cellToOpen.x},${cellToOpen.y}`) && patternIndex < strategyPattern.length - 1) {
          patternIndex++;
          cellToOpen = strategyPattern[patternIndex];
        }
        openCell(cellToOpen.x, cellToOpen.y);
        patternIndex++;
        continue; // Next loop
      }

      // Heuristic strategy (or fallback after pattern exhaustion)
      const unopened = new Set<string>();
      for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) if (!openedCells.has(`${i},${j}`)) unopened.add(`${i},${j}`);

      if (unopened.size === 0) break;

      const remainingTreasureInstances = placedTreasures.filter((t) => !foundTreasureInstances.has(t.instanceId));
      const remainingTreasureData = remainingTreasureInstances.map((t) => treasureRewards[t.treasureId]);

      const currentBoardState = board.map((row, y) =>
        row.map((cellId, x) => {
          const foundInstance = placedTreasures.find((t) => t.treasureId === cellId && t.cells.some((c) => c.x === x && c.y === y));
          return foundInstance && foundTreasureInstances.has(foundInstance.instanceId) ? cellId : null;
        }),
      );

      const bestCell = findBestHeuristicCell(currentBoardState, unopened, remainingTreasureData);

      if (bestCell.x !== -1) {
        openCell(bestCell.x, bestCell.y);
      } else {
        // Fallback to random exploration if heuristic fails
        const randomCell = Array.from(unopened)[Math.floor(Math.random() * unopened.size)];
        const [rx, ry] = randomCell.split(',').map(Number);
        openCell(rx, ry);
      }
    }
  }
  return openedCells.size;
};

// --- React Component ---
interface TreasurePlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  onCalculate: (result: TreasureResult | null) => void;
  remainingCurrency: Record<number, number>;
}

export const TreasurePlanner = ({ eventId, eventData, iconData, onCalculate, remainingCurrency }: TreasurePlannerProps) => {
  const [interactiveSimState, setInteractiveSimState] = useState<{
    show: boolean;
    roundData: TreasureRound | null;
  }>({ show: false, roundData: null });
  const [isCollapsed, setIsCollapsed] = useState(false);
  // const [config, setConfig] = useState({ strategy: 'checkerboard' as Strategy, goal: 'clear_all' as Goal, simRuns: 100 });
  const [simResult, setSimResult] = useState<Record<number, number> | null>(null);
  // const [startRound, setStartRound] = useState(1);
  // const [finalTotalRounds, setFinalTotalRounds] = useState(0);

  const { t } = useTranslation('planner');

  const { plan, setTreasureSimConfig: setConfig, setTreasureStartRound: setStartRound, setTreasureFinalTotalRounds: setFinalTotalRounds } = usePlanForEvent(eventId);

  const { treasureSimConfig: config, treasureStartRound: startRound, treasureFinalTotalRounds: finalTotalRounds } = plan;

  const treasureData = eventData.treasure!;
  const costPerCell = treasureData.round[0].CellCheckGoods.ConsumeParcelAmount[0];
  const costItemId = treasureData.round[0].CellCheckGoods.ConsumeParcelId[0];
  const costItemKey = `${treasureData.round[0].CellCheckGoods.ConsumeParcelTypeStr[0]}_${costItemId}`;

  if (!config || startRound === undefined || finalTotalRounds === undefined) {
    return null;
  }

  const handleRunSimulation = useCallback(() => {
    if (!treasureData) return;
    const results: Record<number, number> = {};
    const uniqueRounds = treasureData.round.filter((r) => r.TreasureRound < treasureData.info[0].LoopRound);
    const repeatingRound = treasureData.round.find((r) => r.TreasureRound === treasureData.info[0].LoopRound);
    if (repeatingRound) uniqueRounds.push(repeatingRound);

    for (const roundData of uniqueRounds) {
      let totalCost = 0;
      for (let i = 0; i < config.simRuns; i++) {
        totalCost += runSingleSimulation({
          roundData,
          treasureRewards: treasureData.reward,
          strategy: config.strategy,
          goal: config.goal,
        });
      }
      results[roundData.TreasureRound] = totalCost / config.simRuns;
    }
    setSimResult(results);
  }, [treasureData, config]);

  const handleResultChange = (round: number, value: string) => {
    const cost = parseFloat(value) || 0;
    setSimResult((prev) => ({ ...(prev || {}), [round]: cost }));
  };

  // 'Max' button logic
  const handleSetMaxRounds = () => {
    if (!simResult) return;

    const repeatingRoundNum = treasureData.info[0].LoopRound;
    const repeatingRoundData = treasureData.round.find((r) => r.TreasureRound === repeatingRoundNum);
    if (!repeatingRoundData) return;

    // Calculate average rewards for repeating rounds
    const avgRewardsPerRepeatingRound: Record<string, number> = {};
    const avgCells = simResult[repeatingRoundNum] || treasureData.round[0].TreasureRoundSize[0] * treasureData.round[0].TreasureRoundSize[1];

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
    const repeatingRoundData = treasureData.round.find((r) => r.TreasureRound === repeatingRoundNum)!;

    for (let i = startRound; i <= finalTotalRounds; i++) {
      // Determine the current round to calculate (considering repeating rounds)
      const roundNum = i < repeatingRoundNum ? i : repeatingRoundNum;
      const roundData = roundNum === repeatingRoundNum ? repeatingRoundData : treasureData.round.find((r) => r.TreasureRound === roundNum)!;
      const avgCells = simResult[roundNum] || 0;

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
    { id: 'checkerboard', name: t('treasure.strategyCheckerboard') },
    // { id: 'hunt_biggest_wiki', name: 'Strategy: Prioritize Biggest Treasure' },
    { id: 'heuristic', name: t('treasure.strategyHeuristic') },
    { id: 'custom', name: t('treasure.strategyCustom') },
  ];
  const goalOptions = [
    { id: 'clear_all', name: t('goalClearAll') },
    { id: 'biggest_only', name: t('treasure.goalBiggestOnly') },
  ];

  if (!treasureData || !costPerCell) return null;

  return (
    <>
      <div className="flex justify-between items-center cursor-pointer group" onClick={() => setIsCollapsed(!isCollapsed)}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('treasure.title')}</h2>
        <span className="text-2xl transition-transform duration-300 group-hover:scale-110">
          <ChevronIcon className={isCollapsed ? 'rotate-180' : ''} />
        </span>
      </div>
      {!isCollapsed && (
        <div className="mt-4 space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-neutral-800/50 rounded-lg space-y-3">
            <div>
              <label className="text-sm font-bold dark:text-gray-300">{t('treasure.selectStrategy')}</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {strategyOptions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setConfig((p) => ({ ...p, strategy: s.id as Strategy }))}
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
                  <label className="text-sm font-bold dark:text-gray-300">{t('treasure.selectGoal')}</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {goalOptions.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => setConfig((p) => ({ ...p, goal: g.id as Goal }))}
                        className={`${config.goal === g.id ? 'bg-blue-500 text-white' : 'bg-white dark:bg-neutral-700 dark:border-neutral-600 dark:hover:bg-neutral-600'} border rounded-md px-2 py-1 text-xs`}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-bold dark:text-gray-300">{t('treasure.simulationRuns')}</label>
                  <input
                    type="number"
                    value={config.simRuns}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        simRuns: parseInt(e.target.value) || 100,
                      }))
                    }
                    className="w-full p-2 mt-1 rounded border dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
                  />
                </div>
                <button onClick={handleRunSimulation} className="w-full bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white font-bold py-2 rounded-lg">
                  {t('treasure.runAvgCalc')}
                </button>
              </>
            ) : (
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{t('treasure.customStrategyDescription')}</p>
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

          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/40 rounded-lg">
            <h3 className="font-bold text-sm mb-2 dark:text-yellow-200">{t('treasure.planSettingsRoundRange')}</h3>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                className="w-full p-2 text-lg rounded border text-center dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
                value={startRound || ''}
                onChange={(e) => setStartRound(parseInt(e.target.value) || 1)}
              />
              <span className="shrink-0 dark:text-gray-300">{t('treasure.fromRound')}</span>
              <input
                type="number"
                min={startRound}
                className="w-full p-2 text-lg rounded border text-center dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
                value={finalTotalRounds || ''}
                onChange={(e) => setFinalTotalRounds(parseInt(e.target.value) || 0)}
              />
              <span className="shrink-0 dark:text-gray-300">{t('treasure.toRound')}</span>
              <button
                onClick={handleSetMaxRounds}
                className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-4 py-2 rounded-lg shrink-0 disabled:bg-gray-400 dark:disabled:bg-neutral-600"
                disabled={!simResult}
                title={!simResult ? t('treasure.runAvgCalcFirst') : t('treasure.setMaxRoundsTooltip')}
              >
                {t('treasure.setToMax')}
              </button>
            </div>
          </div>

          {simResult && (
            <div>
              <h3 className="font-bold dark:text-gray-200">{t('treasure.cellsNeededPerRound')}</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">{t('treasure.avgOrModifiedValue')}</p>
              <div className="mt-2 space-y-2 text-sm">
                {Object.entries(simResult)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([round, avgCost]) => (
                    <div key={round} className="grid grid-cols-3 items-center gap-2 p-1 bg-gray-100 dark:bg-neutral-700/50 rounded">
                      <span className="font-semibold dark:text-gray-300">{t('treasure.roundLabel', { round })}</span>
                      <input
                        type="number"
                        value={avgCost % 1 === 0 ? avgCost : avgCost.toFixed(1)}
                        onChange={(e) => handleResultChange(Number(round), e.target.value)}
                        className="w-full p-1.5 rounded border text-right dark:bg-neutral-700 dark:border-neutral-600 dark:text-gray-200"
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400 text-right">
                        {t('treasure.currencyCost', {
                          cost: Math.ceil(avgCost * costPerCell).toLocaleString(),
                        })}
                      </span>
                    </div>
                  ))}
              </div>

              {finalTotalRounds >= startRound &&
                (() => {
                  let totalCost = 0;
                  const totalRewards: Record<string, number> = {};
                  const repeatingRoundNum = treasureData.info[0].LoopRound;
                  const repeatingRoundData = treasureData.round.find((r) => r.TreasureRound === repeatingRoundNum)!;

                  for (let i = startRound; i <= finalTotalRounds; i++) {
                    // Change loop start point to startRound
                    const roundNum = i < repeatingRoundNum ? i : repeatingRoundNum;
                    const roundData = roundNum === repeatingRoundNum ? repeatingRoundData : treasureData.round.find((r) => r.TreasureRound === roundNum)!;
                    const avgCells = simResult[roundNum] || 0;

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

                  return (
                    <div className="mt-4">
                      <h3 className="font-bold dark:text-gray-200">
                        {t('treasure.planResultTitle', {
                          start: startRound,
                          end: finalTotalRounds,
                        })}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <div className="bg-red-50 dark:bg-red-900/40 p-3 rounded-lg">
                          <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('treasure.totalCost')}</h4>
                          <div className="space-y-1">
                            {(() => {
                              const [type, id] = costItemKey.split('_');
                              return <ItemIcon type={type} itemId={id} amount={Math.ceil(totalCost)} size={10} eventData={eventData} iconData={iconData} />;
                            })()}
                          </div>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/40 p-3 rounded-lg">
                          <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('treasure.totalExpectedRewards')}</h4>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(totalRewards)
                              .sort(([, a], [, b]) => b - a)
                              .map(([key, amount]) => {
                                const [type, id] = key.split('_');
                                return <ItemIcon key={key} type={type} itemId={id} amount={Math.round(amount)} size={10} eventData={eventData} iconData={iconData} />;
                              })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
            </div>
          )}
        </div>
      )}
      {interactiveSimState.show && interactiveSimState.roundData && (
        <InteractiveSimulator
          roundData={interactiveSimState.roundData}
          treasureRewards={treasureData.reward}
          onClose={() => setInteractiveSimState({ show: false, roundData: null })}
          onComplete={(clicks) => {
            handleResultChange(interactiveSimState.roundData!.TreasureRound, clicks.toString());
            setInteractiveSimState({ show: false, roundData: null });
          }}
        />
      )}
    </>
  );
};
