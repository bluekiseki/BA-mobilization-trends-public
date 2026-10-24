import type { TreasureReward, TreasureRound } from '~/types/plannerData';
import { type TreasureStrategy, type TreasureGoal } from '~/types/minigame/treasure';
import { placeTreasures } from '~/features/event-planner/logic/treasureSim';

interface SimulationParams {
  roundData: TreasureRound;
  treasureRewards: Record<string, TreasureReward>;
  strategy: TreasureStrategy;
  goal: TreasureGoal;
  customPattern?: { x: number; y: number }[];
}
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
