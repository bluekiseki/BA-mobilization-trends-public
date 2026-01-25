import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TreasureReward, TreasureRound } from '~/types/plannerData';

interface InteractiveSimulatorProps {
  roundData: TreasureRound;
  treasureRewards: Record<string, TreasureReward>;
  onComplete: (clicks: number) => void;
  onClose: () => void;
}

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

export const InteractiveSimulator = ({ roundData, treasureRewards, onComplete, onClose }: InteractiveSimulatorProps) => {
  const [openedCells, setOpenedCells] = useState(new Set<string>());
  const { t } = useTranslation('planner', { keyPrefix: 'treasure' });

  const { placedTreasures } = useMemo(() => {
    return (
      placeTreasures(roundData, treasureRewards) || {
        placedTreasures: [],
        board: [],
      }
    );
  }, [roundData, treasureRewards]);

  const handleCellClick = (x: number, y: number) => {
    if (openedCells.has(`${x},${y}`)) return;
    setOpenedCells((prev) => new Set(prev).add(`${x},${y}`));
  };

  const foundTreasureInstances = useMemo(() => {
    const found = new Set<string>();
    for (const treasure of placedTreasures) {
      if (treasure.cells.every((c) => openedCells.has(`${c.x},${c.y}`))) {
        found.add(treasure.instanceId);
      }
    }
    return found;
  }, [openedCells, placedTreasures]);

  // Pre-calculate the types and quantities of treasures within the round
  const uniqueTreasuresInRound = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const t of placedTreasures) {
      counts[t.treasureId] = (counts[t.treasureId] || 0) + 1;
    }
    return Object.entries(counts).map(([id, count]) => ({
      treasureId: Number(id),
      total: count,
    }));
  }, [placedTreasures]);

  // Calculate the count of found treasures by type
  const foundTreasureCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const t of placedTreasures) {
      if (foundTreasureInstances.has(t.instanceId)) {
        counts[t.treasureId] = (counts[t.treasureId] || 0) + 1;
      }
    }
    return counts;
  }, [placedTreasures, foundTreasureInstances]);

  const isGoalMet = uniqueTreasuresInRound.every((t) => (foundTreasureCounts[t.treasureId] || 0) === t.total);

  const treasureColors = useMemo(() => ['#60a5fa', '#4ade80', '#f87171', '#c084fc', '#f472b6', '#818cf8', '#2dd4bf', '#facc15'], []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-800 p-4 sm:p-6 rounded-lg shadow-xl w-full max-w-4xl flex flex-col md:flex-row gap-6 max-h-[90vh]">
        {/* Left: Game Board */}
        <div className="grow">
          <h3 className="text-lg font-bold mb-2 dark:text-gray-100">{t('playRound', { round: roundData.TreasureRound })}</h3>
          <p className="text-sm mb-2 dark:text-gray-300">
            {t('openedCells')} <span className="font-bold">{openedCells.size}</span>
          </p>

          <div className="relative bg-gray-800 dark:bg-neutral-900 p-1 rounded-md border-4 border-gray-600 dark:border-neutral-700">
            {/* 1. Background: Treasure location layer (hint) */}
            <div
              className="absolute inset-0"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${roundData.TreasureRoundSize[0]}, 1fr)`,
                gridTemplateRows: `repeat(${roundData.TreasureRoundSize[1]}, 1fr)`,
              }}
            >
              {placedTreasures.map((treasure) => (
                <div
                  key={treasure.instanceId}
                  style={{
                    gridColumn: `${treasure.x + 1} / span ${treasure.width}`,
                    gridRow: `${treasure.y + 1} / span ${treasure.height}`,
                  }}
                >
                  <div className="w-full h-full box-border p-1.5">
                    <div
                      className="w-full h-full rounded-sm opacity-70"
                      style={{
                        backgroundColor: treasureColors[treasure.treasureId % treasureColors.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* 2. Foreground: Clickable cell layer */}
            <div
              className="relative"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${roundData.TreasureRoundSize[0]}, 1fr)`,
              }}
            >
              {Array.from({ length: roundData.TreasureRoundSize[1] }).map((_, y) =>
                Array.from({ length: roundData.TreasureRoundSize[0] }).map((_, x) => {
                  const isOpen = openedCells.has(`${x},${y}`);
                  return (
                    <div
                      key={`${x}-${y}`}
                      onClick={() => handleCellClick(x, y)}
                      className={`aspect-square border border-gray-500 dark:border-neutral-600 transition-opacity duration-300 ${isOpen ? 'opacity-0 pointer-events-none' : 'bg-slate-200 dark:bg-slate-700 cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                    ></div>
                  );
                }),
              )}
            </div>
          </div>
        </div>

        {/* Right Info & Controls Panel */}
        <div className="w-full md:w-72 shrink-0 flex flex-col">
          <div>
            <h4 className="font-bold mb-2 dark:text-gray-200">{t('remainingTreasures')}</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 text-xs">
              {uniqueTreasuresInRound.map(({ treasureId, total }) => {
                const foundCount = foundTreasureCounts[treasureId] || 0;
                if (foundCount === total) return null;
                const treasureInfo = treasureRewards[treasureId];
                return (
                  <div key={treasureId} className="flex items-center p-1.5 bg-gray-100 dark:bg-neutral-700/50 rounded">
                    <div
                      style={{
                        backgroundColor: treasureColors[treasureId % treasureColors.length],
                      }}
                      className="w-4 h-4 rounded-sm mr-2 shrink-0"
                    />
                    <div className="grow truncate dark:text-gray-300" title={treasureInfo.LocalizeCodeId}>
                      {treasureInfo.LocalizeCodeId}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400 ml-2">
                      {treasureInfo.CellUnderImageWidth}x{treasureInfo.CellUnderImageHeight}
                    </div>
                    <div className="font-bold ml-2 dark:text-gray-200">
                      {foundCount} / {total}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <h4 className="font-bold mb-2 dark:text-gray-200">{t('foundTreasures')}</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 text-xs">
              {uniqueTreasuresInRound.map(({ treasureId, total }) => {
                const foundCount = foundTreasureCounts[treasureId] || 0;
                if (foundCount === 0) return null;
                const treasureInfo = treasureRewards[treasureId];
                const isCompleted = foundCount === total;
                return (
                  <div key={treasureId} className={`flex items-center p-1.5 rounded ${isCompleted ? 'bg-green-100 dark:bg-green-900/40' : 'bg-yellow-100 dark:bg-yellow-900/40'}`}>
                    <div
                      style={{
                        backgroundColor: treasureColors[treasureId % treasureColors.length],
                      }}
                      className="w-4 h-4 rounded-sm mr-2 shrink-0"
                    />
                    <div className={`grow truncate ${isCompleted ? 'line-through dark:text-gray-500' : 'dark:text-gray-300'}`} title={treasureInfo.LocalizeCodeId}>
                      {treasureInfo.LocalizeCodeId}
                    </div>
                    <div className="text-gray-500 dark:text-gray-400 ml-2">
                      {treasureInfo.CellUnderImageWidth}x{treasureInfo.CellUnderImageHeight}
                    </div>
                    <div className="font-bold ml-2 dark:text-gray-200">
                      {foundCount} / {total}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-auto pt-4">
            <button onClick={onClose} className="w-full bg-gray-300 dark:bg-neutral-600 dark:hover:bg-neutral-700 px-4 py-2 rounded-md text-sm mb-2">
              {t('cancel')}
            </button>
            <button
              onClick={() => onComplete(openedCells.size)}
              disabled={!isGoalMet}
              className="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm disabled:bg-gray-400 dark:disabled:bg-neutral-500"
            >
              {isGoalMet ? t('saveResult', { count: openedCells.size }) : t('goalFindAll')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
