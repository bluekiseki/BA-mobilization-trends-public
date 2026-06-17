import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { MapData } from '~/data/roadPuzzleMaps';
import { solveRoadPuzzle, type SolveResult } from '~/utils/solveRoadPuzzle';
import { useIsDarkState } from '~/store/isDarkState';
import { RoadPuzzleMapView } from './RoadPuzzleMapView';

const TILE_TYPE_COLORS = {
  1: 'text-blue-600 dark:text-blue-400',
  2: 'text-amber-600 dark:text-amber-400',
  3: 'text-green-600 dark:text-green-400',
} as const;

const TILE_TYPE_BG = {
  1: 'bg-blue-100 dark:bg-blue-900/40',
  2: 'bg-amber-100 dark:bg-amber-900/40',
  3: 'bg-green-100 dark:bg-green-900/40',
} as const;

interface Props {
  mapName: string;
  mapData: MapData;
  tileTypes: number[];
  tileTypeName: (t: number) => string;
  gameInventory: Record<number, number>; // from AvailableRailTileAmount
}

export function RoadPuzzleMapSolver({ mapData, tileTypes, tileTypeName, gameInventory }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'road_puzzle' });
  const { isDark } = useIsDarkState();
  const [result, setResult] = useState<SolveResult | null>(null);
  const [inventory, setInventory] = useState<Record<number, number>>(gameInventory);
  const [autoSolve, setAutoSolve] = useState(false);

  useEffect(() => {
    if (!autoSolve) return;
    const r = solveRoadPuzzle(mapData.grid, mapData.rowOffset, inventory, mapData.goalEntry);
    setResult(r);
  }, [autoSolve, inventory, mapData]);

  function setByInventory(type: number, value: number) {
    const max = gameInventory[type] ?? 0;
    setInventory((prev) => ({ ...prev, [type]: Math.min(max, Math.max(0, value)) }));
  }

  function setByUndrawn(type: number, value: number) {
    const max = gameInventory[type] ?? 0;
    const undrawn = Math.min(max, Math.max(0, value));
    setInventory((prev) => ({ ...prev, [type]: max - undrawn }));
  }

  // const handleSolve = useCallback(() => {
  //   const r = solveRoadPuzzle(mapData.grid, mapData.rowOffset, inventory, mapData.goalEntry);
  //   setResult(r);
  // }, [mapData, inventory]);

  return (
    <div className="space-y-3">
      {/* Map visualization */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg p-2 overflow-x-auto">
        <RoadPuzzleMapView grid={mapData.grid} rowOffset={mapData.rowOffset} path={result?.found ? result.path : undefined} isDark={isDark === 'dark'} />
      </div>

      {/* Inventory inputs */}
      <div className="space-y-2">
        <div>
          <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1.5">{t('mapInventoryLabel')}</div>
          <div className="flex flex-wrap gap-3">
            {tileTypes.map((type) => (
              <div key={type}>
                <label className={`block text-xs font-semibold mb-0.5 ${TILE_TYPE_COLORS[type as 1]}`}>{tileTypeName(type)}</label>
                <input
                  type="number"
                  min={0}
                  max={gameInventory[type] ?? 0}
                  value={inventory[type] ?? 0}
                  onChange={(e) => setByInventory(type, parseInt(e.target.value) || 0)}
                  className="w-20 p-1 text-sm border rounded dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
                />
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1.5">{t('mapPoolLabel')}</div>
          <div className="flex flex-wrap gap-3">
            {tileTypes.map((type) => (
              <div key={type}>
                <label className={`block text-xs font-semibold mb-0.5 ${TILE_TYPE_COLORS[type as 1]}`}>{tileTypeName(type)}</label>
                <input
                  type="number"
                  min={0}
                  max={gameInventory[type] ?? 0}
                  value={(gameInventory[type] ?? 0) - (inventory[type] ?? 0)}
                  onChange={(e) => setByUndrawn(type, parseInt(e.target.value) || 0)}
                  className="w-20 p-1 text-sm border rounded dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Solve button */}
      <button
        onClick={() => setAutoSolve((prev) => !prev)}
        className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
          autoSolve
            ? 'bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white'
            : 'bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200'
        }`}
      >
        {autoSolve ? t('autoSolveOn') : t('autoSolveOff')}
      </button>

      {/* Result */}
      {result && (
        <div className="text-sm space-y-2">
          {!result.found ? (
            <div className="text-red-500 dark:text-red-400">{t('noPathFound')}</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="font-bold text-neutral-800 dark:text-neutral-200">{t('minTiles', { count: result.minTiles })}</span>
                {tileTypes.map((type) => {
                  const cnt = result.tileCounts[type] ?? 0;
                  if (!cnt) return null;
                  return (
                    <span key={type} className={`px-1.5 py-0.5 rounded text-xs font-bold ${TILE_TYPE_BG[type as 1]} ${TILE_TYPE_COLORS[type as 1]}`}>
                      {tileTypeName(type)}: {cnt}
                    </span>
                  );
                })}
              </div>

              {/* Inventory comparison */}
              {tileTypes.some((type) => (inventory[type] ?? 0) > 0) && (
                <div className="flex flex-wrap gap-2">
                  {tileTypes.map((type) => {
                    const have = inventory[type] ?? 0;
                    const need = result.tileCounts[type] ?? 0;
                    if (!need) return null;
                    const diff = have - need;
                    return (
                      <span
                        key={type}
                        className={`text-xs px-1.5 py-0.5 rounded font-bold ${diff >= 0 ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'}`}
                      >
                        {tileTypeName(type)}: {have}/{need} ({diff >= 0 ? `+${diff}` : diff})
                      </span>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
