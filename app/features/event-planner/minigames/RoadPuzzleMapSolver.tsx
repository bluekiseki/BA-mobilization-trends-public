import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiRotateCcw } from 'react-icons/fi';
import { NumberInput } from '~/components/common/NumberInput';
import type { MapData } from '~/data/roadPuzzleMaps';
import { solveRoadPuzzle, type SolveResult } from '~/features/event-planner/logic/solveRoadPuzzle';
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
  const { t: t_ui } = useTranslation('ui');
  const { isDark } = useIsDarkState();
  const [result, setResult] = useState<SolveResult | null>(null);
  const [inventory, setInventory] = useState<Record<number, number>>(gameInventory);
  const [autoSolve, setAutoSolve] = useState(false);

  useEffect(() => {
    if (!autoSolve) return;
    const r = solveRoadPuzzle(mapData.grid, mapData.rowOffset, inventory, mapData.goalEntry, mapData.startEntry);
    setResult(r);
  }, [autoSolve, inventory, mapData]);

  const hasInventory = tileTypes.some((type) => (inventory[type] ?? 0) > 0);

  function resetInventory() {
    setInventory(gameInventory);
  }

  function setByInventory(type: number, value: number) {
    const max = gameInventory[type] ?? 0;
    setInventory((prev) => ({ ...prev, [type]: Math.min(max, Math.max(0, value)) }));
  }

  function setByUndrawn(type: number, value: number) {
    const max = gameInventory[type] ?? 0;
    const undrawn = Math.min(max, Math.max(0, value));
    setInventory((prev) => ({ ...prev, [type]: max - undrawn }));
  }

  return (
    <div className="space-y-3">
      {/* Map visualization */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg p-2 overflow-x-auto">
        <RoadPuzzleMapView grid={mapData.grid} rowOffset={mapData.rowOffset} path={result?.found ? result.path : undefined} isDark={isDark === 'dark'} />
      </div>

      {/* Inventory inputs */}
      <div className="space-y-2">
        <div>
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{t('mapInventoryLabel')}</span>
            <button onClick={resetInventory} className="p-0.5 text-neutral-500 dark:text-neutral-400" aria-label={t_ui('reset')} title={t_ui('reset')}>
              <FiRotateCcw size={10} />
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {tileTypes.map((type) => (
              <div key={type}>
                <label className={`block text-xs font-semibold mb-0.5 ${TILE_TYPE_COLORS[type as 1]}`}>{tileTypeName(type)}</label>
                <div className="w-38 sm:w-36">
                  <NumberInput value={inventory[type] ?? 0} onChange={(value) => setByInventory(type, value)} min={0} max={gameInventory[type] ?? 0} narrowButtonType="all" fluidInput />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{t('mapPoolLabel')}</span>
            <button onClick={resetInventory} className="p-0.5 text-neutral-500 dark:text-neutral-400" aria-label={t_ui('reset')} title={t_ui('reset')}>
              <FiRotateCcw size={10} />
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {tileTypes.map((type) => (
              <div key={type}>
                <label className={`block text-xs font-semibold mb-0.5 ${TILE_TYPE_COLORS[type as 1]}`}>{tileTypeName(type)}</label>
                <div className="w-38 sm:w-36">
                  <NumberInput
                    value={(gameInventory[type] ?? 0) - (inventory[type] ?? 0)}
                    onChange={(value) => setByUndrawn(type, value)}
                    min={0}
                    max={gameInventory[type] ?? 0}
                    narrowButtonType="all"
                    fluidInput
                  />
                </div>
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
              <div className="font-bold text-neutral-800 dark:text-neutral-200">{t('minTiles', { count: result.minTiles })}</div>
              {/* Required count per tile type; "have/need" and the shortage are shown only when an inventory is entered */}
              <div className="grid grid-cols-3 gap-2">
                {tileTypes.map((type) => {
                  const need = result.tileCounts[type] ?? 0;
                  const have = inventory[type] ?? 0;
                  const shortage = need - have;
                  return (
                    <div key={type} className={`px-2 py-1 rounded ${TILE_TYPE_BG[type as 1]}`}>
                      <div className={`text-xs font-semibold ${TILE_TYPE_COLORS[type as 1]}`}>{tileTypeName(type)}</div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-lg font-bold leading-tight text-neutral-800 dark:text-neutral-100">{need}</span>
                        {hasInventory && <span className="text-xs text-neutral-500 dark:text-neutral-400">/ {have}</span>}
                        {hasInventory && shortage > 0 && <span className="text-xs font-bold text-red-600 dark:text-red-400">-{shortage}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
