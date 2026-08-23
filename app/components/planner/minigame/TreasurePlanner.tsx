// TreasurePlanner.tsx
import { useState, useCallback, useEffect } from 'react';
import { InteractiveSimulator } from './treasure/InteractiveSimulator';
import { ItemIcon } from '../common/Icon';
import { SimRunButton } from '../common/SimRunButton';
import type { EventData, IconData, TreasureReward, TreasureRound } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';

import { useTranslation } from 'react-i18next';
import { getItemSortPriority } from '~/utils/itemSort';
import { type TreasureSimConfig, type TreasureStrategy, type TreasureGoal, DefaultTreasureSimConfig } from '~/types/minigame/treasure';
import { runAsync } from '~/utils/runAsync';

export type { TreasureSimConfig };
export { DefaultTreasureSimConfig };

export type TreasureResult = {
  cost: { key: string; amount: number };
  rewards: Record<string, number>;
};

type RoundSimStats = {
  avg: number;
  min: number;
  max: number;
  stdDev: number;
};

interface SimulationParams {
  roundData: TreasureRound;
  treasureRewards: Record<string, TreasureReward>;
  strategy: TreasureStrategy;
  goal: TreasureGoal;
  customPattern?: { x: number; y: number }[];
}

export const placeTreasures = (roundData: TreasureRound, rewards: Record<string, TreasureReward>) => {
  const [width, height] = roundData.TreasureRoundSize;
  const board: (number | null)[][] = Array.from({ length: height }, () => Array<number | null>(width).fill(null));
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
  const probabilityMap: number[][] = Array.from({ length: height }, () => Array<number>(width).fill(0));

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

export const runSingleSimulation = ({
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
    const minDim = roundData.RewardId.reduce((acc, id) => {
      const t = treasureRewards[id];
      return Math.min(acc, t.CellUnderImageWidth, t.CellUnderImageHeight);
    }, Infinity);

    if (isFinite(minDim) && minDim >= 2) {
      // 2D grid pattern: x ≡ oX (mod S), y ≡ oY (mod S)
      // Guarantee condition: min(w,h) ≥ S → Guaranteed hit on all placements
      // Coverage: 1/S² (Rows are skipped every S cells → more efficient than diagonal 1/(2S-1))
      //
      // Ex: 2x2 treasure, S=2, 9x5 board, oX=1, oY=1
      // y=0: .  .  .  .  .  .  .  .  .  (skipped)
      // y=1: .  ●  .  ●  .  ●  .  ●  .  (x=1,3,5,7)
      // y=2: .  .  .  .  .  .  .  .  .  (skipped)
      // y=3: .  ●  .  ●  .  ●  .  ●  .  (x=1,3,5,7)
      // y=4: .  .  .  .  .  .  .  .  .  (skipped)
      // → 8 cells (15 cells if oX=0, oY=0)
      const S = minDim;
      let bestOX = 0,
        bestOY = 0,
        minCells = Infinity;
      for (let oY = 0; oY < S; oY++) {
        const rowCount = oY < height ? Math.floor((height - oY - 1) / S) + 1 : 0;
        for (let oX = 0; oX < S; oX++) {
          const colCount = oX < width ? Math.floor((width - oX - 1) / S) + 1 : 0;
          if (rowCount * colCount < minCells) {
            minCells = rowCount * colCount;
            bestOX = oX;
            bestOY = oY;
          }
        }
      }
      for (let y = bestOY; y < height; y += S) {
        for (let x = bestOX; x < width; x += S) {
          strategyPattern.push({ x, y });
        }
      }
    } else {
      // Shifting checkerboard pattern: x ≡ y+oX (mod S), visits all rows
      // Guarantee condition: tw+th-1 ≥ S → Valid for 1xN treasures where min(w,h)=1
      // 2D grid requires searching all cells as S'=1, but this pattern only searches 1/S
      // Total cell count varies when W is not a multiple of S because row start x differs by oX → Select the minimum value
      //
      // Ex: 1x3 treasure, S=3, 10x5 board, bestOX=1
      // y=0: .  ●  .  .  ●  .  .  ●  .  .  (x=1,4,7)   start=(0+1)%3=1
      // y=1: .  .  ●  .  .  ●  .  .  ●  .  (x=2,5,8)   start=(1+1)%3=2
      // y=2: ●  .  .  ●  .  .  ●  .  .  ●  (x=0,3,6,9) start=(2+1)%3=0
      // y=3: .  ●  .  .  ●  .  .  ●  .  .  (x=1,4,7)   start=(3+1)%3=1
      // y=4: .  .  ●  .  .  ●  .  .  ●  .  (x=2,5,8)   start=(4+1)%3=2
      // → 16 cells (17 cells if oX=0)
      const rawStride = roundData.RewardId.reduce((acc, id) => {
        const t = treasureRewards[id];
        return Math.min(acc, t.CellUnderImageWidth + t.CellUnderImageHeight - 1);
      }, Infinity);
      const S = isFinite(rawStride) ? Math.max(1, rawStride) : 2;
      let bestOX = 0,
        minCells = Infinity;
      for (let oX = 0; oX < S; oX++) {
        let count = 0;
        for (let y = 0; y < height; y++) {
          const startX = (y + oX) % S;
          count += startX < width ? Math.floor((width - startX - 1) / S) + 1 : 0;
        }
        if (count < minCells) {
          minCells = count;
          bestOX = oX;
        }
      }
      for (let y = 0; y < height; y++) {
        for (let x = (y + bestOX) % S; x < width; x += S) {
          strategyPattern.push({ x, y });
        }
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
          if (!openedCells.has(`${x},${y}`)) return null; // Unopened: Potential placement space
          return cellId !== null ? cellId : -1; // Opened: Cannot be placed regardless of content
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
  const [activeTab, setActiveTab] = useState<'info' | 'calculator'>('info');
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

  if (!eventData.treasure) return null;
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
    { id: 'checkerboard', name: t('treasure.strategyCheckerboard') },
    // { id: 'hunt_biggest_wiki', name: 'Strategy: Prioritize Biggest Treasure' },
    { id: 'heuristic', name: t('treasure.strategyHeuristic') },
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
          {(['info', 'calculator'] as const).map((tab) => {
            const tabKey = tab === 'info' ? 'treasure.tabInfo' : 'treasure.tabCalculator';
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${activeTab === tab ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400' : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'}`}
              >
                {tabKey == 'treasure.tabCalculator' ? t_ui('calculator') : t(tabKey)}
              </button>
            );
          })}
        </div>

        {/* ── Info Tab ── */}
        {activeTab === 'info' && (
          <div className="space-y-2">
            {uniqueRoundsForInfo.map((r) => {
              const isLoop = r.TreasureRound === loopRoundNum;
              const cellReward = treasureData.cell_reward[r.CellRewardId];
              return (
                <div key={r.TreasureRound} className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-3">
                  {/* Round header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`font-bold text-xs px-2 py-0.5 rounded ${isLoop ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'}`}
                    >
                      {t('treasure.roundLabel', { round: r.TreasureRound })}
                      {isLoop && ' ↻'}
                    </span>
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">
                      {r.TreasureRoundSize[0]}×{r.TreasureRoundSize[1]}
                    </span>
                    {cellReward && (
                      <div className="flex items-center gap-1 ml-auto">
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{t('treasure.cellBaseReward')}</span>
                        {cellReward.RewardParcelId.map((pid, idx) => (
                          <ItemIcon
                            key={idx}
                            type={cellReward.RewardParcelTypeStr[idx]}
                            itemId={String(pid)}
                            amount={cellReward.RewardParcelAmount[idx]}
                            size={6}
                            eventData={eventData}
                            iconData={iconData}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Treasures */}
                  <div className="flex flex-wrap gap-2">
                    {r.RewardId.map((rewardId, idx) => {
                      const treasure = treasureData.reward[rewardId];
                      if (!treasure) return null;
                      return (
                        <div key={`${rewardId}-${idx}`} className="flex items-center gap-1.5 bg-white dark:bg-neutral-700 rounded-lg px-2 py-1.5 border border-neutral-100 dark:border-neutral-600">
                          <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 shrink-0 tabular-nums">
                            {treasure.CellUnderImageWidth}×{treasure.CellUnderImageHeight} ×{r.RewardAmount[idx]}
                          </span>
                          <div className="flex gap-0.5">
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
                </div>
              );
            })}
          </div>
        )}

        {/* ── Calculator Tab ── */}
        {activeTab === 'calculator' && (
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
                              <h4 className="font-semibold text-red-800 dark:text-red-300 text-sm">{t('treasure.totalCost')}</h4>
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
                                    <th className="text-left py-1.5 px-3 font-semibold text-green-700 dark:text-green-400">{t('treasure.rewardItem')}</th>
                                    <th className="text-right py-1.5 px-3 font-semibold text-green-700 dark:text-green-400">{t('treasure.rewardAmount')}</th>
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
        )}
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
