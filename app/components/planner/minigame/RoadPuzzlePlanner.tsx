// app/components/planner/minigame/RoadPuzzlePlanner.tsx
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { ItemIcon } from '../common/Icon';
import type { EventData, IconData, RoadPuzzleRound, RoadPuzzleRewardItem, RoadPuzzleAdditionalRewardItem } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { defaultRoadPuzzleConfig, type RoadPuzzleConfig } from '~/types/minigame/roadPuzzle';
import { solveRoadPuzzle, type SolveResult } from '~/utils/solveRoadPuzzle';
import { ROAD_PUZZLE_MAPS, calculateMapRails } from '~/data/roadPuzzleMaps';
import { RoadPuzzleMapSolver } from './RoadPuzzleMapSolver';
import { SimRunButton } from '../common/SimRunButton';
import { runAsync } from '~/utils/runAsync';

export type RoadPuzzleResult = {
  cost: Record<string, number>;
  rewards: Record<string, number>;
};

interface RoadPuzzlePlannerProps {
  eventId: number;
  eventData: EventData;
  iconData: IconData;
  onCalculate: (result: RoadPuzzleResult | null) => void;
}

// Normalized reward item (always arrays, regardless of source type)
interface NormalizedReward {
  parcelId: number[];
  parcelAmount: number[];
  parcelTypeStr: string[];
}

interface RoundInfo {
  round: number;
  isLoop: boolean;
  uniqueId: number;
  maps: {
    uniqueId: number;
    name: string;
    toPlace: Record<number, number>; // tileType → count to place
    total: Record<number, number>; // tileType → total in map
  }[];
  avgToPlace: Record<number, number>; // average across maps (for loop rounds)
  reward?: NormalizedReward;
  additionalRewards: NormalizedReward[];
}

function normalizeReward(r: RoadPuzzleRewardItem): NormalizedReward {
  return { parcelId: r.RewardParcelId, parcelAmount: r.RewardParcelAmount, parcelTypeStr: r.RewardParcelTypeStr };
}

function normalizeAdditionalReward(r: RoadPuzzleAdditionalRewardItem): NormalizedReward {
  return {
    parcelId: [r.RewardParcelId],
    parcelAmount: [r.RewardParcelAmount],
    parcelTypeStr: [r.RewardParcelTypeStr],
  };
}

function buildRoundInfos(roadPuzzleData: NonNullable<EventData['minigame_road_puzzle']>): RoundInfo[] {
  const { road_round, map, rail_tile, reward, additional_reward } = roadPuzzleData;

  // Build tileId → RailTileType map
  const tileTypeMap: Record<number, number> = {};
  for (const tile of rail_tile) {
    tileTypeMap[tile.UniqueId] = tile.RailTileType;
  }

  // Build reward lookup maps
  const rewardMap: Record<number, RoadPuzzleRewardItem> = {};
  for (const r of reward ?? []) {
    rewardMap[r.UniqueId] = r;
  }
  const additionalRewardMap: Record<number, RoadPuzzleAdditionalRewardItem> = {};
  for (const r of additional_reward ?? []) {
    additionalRewardMap[r.UniqueId] = r;
  }

  // Group maps by MapGroupId
  const mapsByGroup: Record<number, typeof map> = {};
  for (const m of map) {
    if (!mapsByGroup[m.MapGroupId]) mapsByGroup[m.MapGroupId] = [];
    mapsByGroup[m.MapGroupId].push(m);
  }

  return road_round.map((rr: RoadPuzzleRound) => {
    const groupMaps = mapsByGroup[rr.MapGroupId] ?? [];

    const maps = groupMaps.map((m) => {
      const toPlace: Record<number, number> = {};
      const total: Record<number, number> = {};

      m.AvailableRailTile.forEach((tileId, idx) => {
        const tileType = tileTypeMap[tileId] ?? tileId;
        const available = m.AvailableRailTileAmount[idx] ?? 0;
        toPlace[tileType] = (toPlace[tileType] ?? 0) + available;
        total[tileType] = (total[tileType] ?? 0) + available;
      });

      return { uniqueId: m.UniqueId, name: m.Map, toPlace, total };
    });

    // Average toPlace across all maps in the group
    const avgToPlace: Record<number, number> = {};
    if (maps.length > 0) {
      const allTypes = new Set(maps.flatMap((m) => Object.keys(m.toPlace).map(Number)));
      for (const type of allTypes) {
        const sum = maps.reduce((acc, m) => acc + (m.toPlace[type] ?? 0), 0);
        avgToPlace[type] = sum / maps.length;
      }
    }

    const additionalRewardItems: NormalizedReward[] = (rr.AdditionalRewardId ?? [])
      .map((id) => additionalRewardMap[id])
      .filter(Boolean)
      .map(normalizeAdditionalReward);

    return {
      round: rr.Round,
      isLoop: rr.IsLoop,
      uniqueId: rr.UniqueId,
      maps,
      avgToPlace,
      reward: rr.RoundReward > 0 && rewardMap[rr.RoundReward] ? normalizeReward(rewardMap[rr.RoundReward]) : undefined,
      additionalRewards: additionalRewardItems,
    };
  });
}

interface MapStats {
  avg: number;
  min: number;
  max: number;
  stddev: number;
}

interface McResult {
  perMap: Record<string, MapStats>;
}

export const RoadPuzzlePlanner = ({ eventId, eventData, iconData, onCalculate }: RoadPuzzlePlannerProps) => {
  const { t } = useTranslation('planner', { keyPrefix: 'road_puzzle' });
  const [activeTab, setActiveTab] = useState<'overview' | 'calculator' | 'maps'>('overview');
  const [mapsRound, setMapsRound] = useState<number>(1);
  const [simCount, setSimCount] = useState(1000);
  const [mcResult, setMcResult] = useState<McResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const { roadPuzzleConfig, setRoadPuzzleConfig } = usePlanForEvent(eventId);
  const config: RoadPuzzleConfig = roadPuzzleConfig ?? defaultRoadPuzzleConfig;

  const roadPuzzleData = eventData.minigame_road_puzzle;
  if (!roadPuzzleData) return null;

  const tileTypes = useMemo(() => {
    const types = new Set<number>();
    for (const tile of roadPuzzleData.rail_tile) {
      if (tile.OriginalTile) types.add(tile.RailTileType);
    }
    return [...types].sort();
  }, [roadPuzzleData.rail_tile]);

  // Get cost goods info (consumed per rail placed)
  const costGoodsInfo = useMemo(() => {
    const info = roadPuzzleData.info?.[0];
    if (!info?.CostGoods) return null;
    return {
      parcelId: info.CostGoods.ConsumeParcelId[0],
      parcelAmount: info.CostGoods.ConsumeParcelAmount[0],
      parcelTypeStr: info.CostGoods.ConsumeParcelTypeStr[0],
    };
  }, [roadPuzzleData.info]);

  // Get rail set rewards
  const railSetRewards = useMemo(() => {
    const rewards: Record<string, number> = {};
    const railSetRewardIds = roadPuzzleData.info?.map((i) => i.RailSetRewardId) ?? [];
    const rewardItems = roadPuzzleData.rail_set_reward ?? [];

    for (const rewardId of railSetRewardIds) {
      const reward = rewardItems.find((r) => r.UniqueId === rewardId);
      if (reward) {
        reward.RewardParcelId.forEach((id, idx) => {
          const key = `${reward.RewardParcelTypeStr[idx]}_${id}`;
          rewards[key] = (rewards[key] ?? 0) + reward.RewardParcelAmount[idx];
        });
      }
    }
    return rewards;
  }, [roadPuzzleData.info, roadPuzzleData.rail_set_reward]);

  const roundInfos = useMemo(() => buildRoundInfos(roadPuzzleData), [roadPuzzleData]);

  // Solve all known maps after mount so initial render is not blocked
  const [autoSolveResults, setAutoSolveResults] = useState<Record<string, SolveResult>>({});
  useEffect(() => {
    const results: Record<string, SolveResult> = {};
    for (const roundInfo of roundInfos) {
      for (const m of roundInfo.maps) {
        const mapData = ROAD_PUZZLE_MAPS[m.name];
        if (mapData) {
          results[m.name] = solveRoadPuzzle(mapData.grid, mapData.rowOffset, undefined, mapData.goalEntry);
        }
      }
    }
    setAutoSolveResults(results);
  }, [roundInfos]);

  // Last non-loop round number (= first loop stage - 1 in the linear stage view)
  const lastNonLoopRound = useMemo(() => {
    const nonLoop = roundInfos.filter((r) => !r.isLoop);
    return nonLoop.length > 0 ? Math.max(...nonLoop.map((r) => r.round)) : roundInfos.length;
  }, [roundInfos]);

  const loopRound = useMemo(() => roundInfos.find((r) => r.isLoop) ?? null, [roundInfos]);

  // Stage view: stages 1..lastNonLoopRound = non-loop game rounds,
  // stages lastNonLoopRound+1.. = loop iterations.
  const startStage = Math.max(1, config.startStage ?? 1);
  const effectiveEndStage = (config.endStage ?? 0) <= 0 ? lastNonLoopRound : config.endStage;

  // Derived
  const loopCount = Math.max(0, effectiveEndStage - lastNonLoopRound);
  const includesLoop = loopRound != null && loopCount > 0;

  const selectedRounds = useMemo(() => {
    const nonLoop = roundInfos.filter((r) => !r.isLoop && r.round >= startStage && r.round <= Math.min(effectiveEndStage, lastNonLoopRound));
    return includesLoop && loopRound ? [...nonLoop, loopRound] : nonLoop;
  }, [roundInfos, startStage, effectiveEndStage, lastNonLoopRound, includesLoop, loopRound]);

  const handleRunMC = useCallback(() => {
    setIsSimulating(true);
    void runAsync(() => {
      const N = simCount;

      // Simulate drawing tiles without replacement from the map's card pool until solvable.
      // Skip solver checks until draws >= unconstrained minTiles (guaranteed lower bound).
      // Memoize by inventory composition to avoid redundant solver calls across trials.
      function simulateMap(mapName: string, pool: Record<number, number>, minTilesNeeded: number): MapStats {
        const mapData = ROAD_PUZZLE_MAPS[mapName];
        if (!mapData) return { avg: 0, min: 0, max: 0, stddev: 0 };

        const poolTypes = Object.keys(pool)
          .map(Number)
          .filter((t) => pool[t] > 0);
        const totalPoolSize = poolTypes.reduce((s, t) => s + pool[t], 0);
        if (totalPoolSize === 0) return { avg: 0, min: 0, max: 0, stddev: 0 };

        const memo = new Map<string, boolean>();
        const checkSolvable = (inv: Record<number, number>) => {
          const key = `${inv[1] ?? 0},${inv[2] ?? 0},${inv[3] ?? 0}`;
          if (memo.has(key)) return memo.get(key) ?? false;
          // console.log(`[checkSolvable] memo mapName=${mapName}`, memo, inv)
          const found = solveRoadPuzzle(mapData.grid, mapData.rowOffset, inv, mapData.goalEntry).found;
          memo.set(key, found);
          return found;
        };

        const trials: number[] = new Array<number>(N);
        let total = 0;
        let minDraws = Infinity;
        let maxDraws = 0;

        for (let i = 0; i < N; i++) {
          const inv: Record<number, number> = {};
          const remaining = { ...pool };
          let poolLeft = totalPoolSize;
          let draws = 0;

          while (poolLeft > 0) {
            let r = Math.random() * poolLeft;
            let chosenType = poolTypes[poolTypes.length - 1];
            for (const t of poolTypes) {
              r -= remaining[t];
              if (r < 0) {
                chosenType = t;
                break;
              }
            }
            remaining[chosenType]--;
            poolLeft--;
            inv[chosenType] = (inv[chosenType] ?? 0) + 1;
            draws++;
            if (draws >= minTilesNeeded && checkSolvable(inv)) break;

            // console.log('{inv, draws}', inv, {draws}, checkSolvable(inv))
            // if (checkSolvable(inv)) break;
          }
          trials[i] = draws;
          total += draws;
          if (draws < minDraws) minDraws = draws;
          if (draws > maxDraws) maxDraws = draws;
        }

        const avg = total / N;
        const variance = trials.reduce((s, d) => s + (d - avg) ** 2, 0) / N;
        return { avg, min: minDraws, max: maxDraws, stddev: Math.sqrt(variance) };
      }

      // Simulate ALL maps across all rounds — independent of the user's selected range.
      const perMap: Record<string, MapStats> = {};
      for (const roundInfo of roundInfos) {
        for (const m of roundInfo.maps) {
          // const start_0 = performance.now();
          if (perMap[m.name] !== undefined) continue;
          const solveResult = autoSolveResults[m.name];
          if (!solveResult?.found) continue;
          // const start = performance.now();
          perMap[m.name] = simulateMap(m.name, m.toPlace, solveResult.minTiles);
          // const end = performance.now();
          // console.log('m', m, `time: ${end - start} ms / ${start_0 - start}`, solveResult.minTiles);
        }
      }

      setMcResult({ perMap });
    }).finally(() => setIsSimulating(false));
  }, [roundInfos, autoSolveResults, simCount]);

  // Build result for onCalculate
  const buildResult = useCallback((): RoadPuzzleResult => {
    const cost: Record<string, number> = {};
    const rewards: Record<string, number> = {};

    // Calculate total tiles to determine cost
    let totalTiles = 0;
    for (const roundInfo of selectedRounds) {
      const mapsWithData = roundInfo.maps.filter((m) => autoSolveResults[m.name]?.found);
      if (mapsWithData.length === 0) continue;
      const plays = roundInfo.isLoop ? loopCount : 1;
      const avgPerPlay = mapsWithData.reduce((s, m) => s + (autoSolveResults[m.name]?.minTiles ?? 0), 0) / mapsWithData.length;
      totalTiles += avgPerPlay * plays;
    }

    // Add cost: totalTiles * costGoodsInfo
    if (costGoodsInfo && totalTiles > 0) {
      const costAmount = Math.ceil(totalTiles * costGoodsInfo.parcelAmount);
      const costKey = `${costGoodsInfo.parcelTypeStr}_${costGoodsInfo.parcelId}`;
      cost[costKey] = costAmount;
    }

    for (const roundInfo of selectedRounds) {
      const multiplier = roundInfo.isLoop ? loopCount : 1;

      // Main reward
      if (roundInfo.reward) {
        const reward = roundInfo.reward;
        reward.parcelId.forEach((id, idx) => {
          const key = `${reward.parcelTypeStr[idx]}_${id}`;
          rewards[key] = (rewards[key] ?? 0) + reward.parcelAmount[idx] * multiplier;
        });
      }

      // Additional rewards
      for (const addReward of roundInfo.additionalRewards) {
        addReward.parcelId.forEach((id, idx) => {
          const key = `${addReward.parcelTypeStr[idx]}_${id}`;
          rewards[key] = (rewards[key] ?? 0) + addReward.parcelAmount[idx] * multiplier;
        });
      }
    }

    // Add rail set rewards (one per round)
    for (const roundInfo of selectedRounds) {
      const multiplier = roundInfo.isLoop ? loopCount : 1;
      Object.entries(railSetRewards).forEach(([key, amount]) => {
        rewards[key] = (rewards[key] ?? 0) + amount * multiplier;
      });
    }

    return { cost, rewards };
  }, [selectedRounds, loopCount, autoSolveResults, costGoodsInfo, railSetRewards]);

  useEffect(() => {
    onCalculate(buildResult());
  }, [buildResult, onCalculate]);

  const tileTypeName = (type: number) => t(`tileType${type as 1}`);

  const getMapDisplayName = (round: number, mapIndex: number, mapName: string, totalMaps: number, toPlace?: Record<number, number>): string => {
    const rails = toPlace
      ? { straight: toPlace[1] ?? 0, longCurve: toPlace[2] ?? 0, shortCurve: toPlace[3] ?? 0 }
      : (() => {
          const mapData = ROAD_PUZZLE_MAPS[mapName];
          return mapData ? calculateMapRails(mapData) : null;
        })();
    if (totalMaps === 1) {
      return rails ? t('mapDisplaySingle', { round, straight: rails.straight, longCurve: rails.longCurve, shortCurve: rails.shortCurve }) : String(round);
    }
    return rails ? t('mapDisplay', { round, mapIndex, straight: rails.straight, longCurve: rails.longCurve, shortCurve: rails.shortCurve }) : t('mapDisplayNoData', { round, mapIndex });
  };

  return (
    <>
      <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('title')}</h2>

      <div className="mt-4 space-y-4">
        {/* Tab nav */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-700">
          {(['overview', 'calculator', 'maps'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${activeTab === tab ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400' : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600'}`}
            >
              {tab === 'overview' ? t('tabOverview') : tab === 'calculator' ? t('tabCalculator') : t('tabMaps')}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Round table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400">
                    <th className="text-left py-2 pr-3 font-semibold whitespace-nowrap">{t('round')}</th>
                    {tileTypes.map((type) => (
                      <th key={type} className="hidden sm:table-cell text-center py-2 px-2 font-semibold whitespace-nowrap">
                        {tileTypeName(type)}
                      </th>
                    ))}
                    <th className="text-left py-2 pl-3 font-semibold">{t('rewards')}</th>
                  </tr>
                </thead>
                <tbody>
                  {roundInfos.map((info) => {
                    const isSelected = info.isLoop ? includesLoop : info.round >= startStage && info.round <= Math.min(effectiveEndStage, lastNonLoopRound);
                    return (
                      <tr key={info.uniqueId} className={`border-b border-neutral-300 dark:border-neutral-600 ${isSelected ? '' : 'opacity-40'}`}>
                        <td className="py-2 pr-3 font-medium text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{info.isLoop ? t('roundLoop') : t('roundLabel', { round: info.round })}</td>
                        {tileTypes.map((type) => {
                          if (info.isLoop) {
                            const counts = info.maps.map((m) => m.toPlace[type] ?? 0).filter((c) => c > 0);
                            if (counts.length === 0) {
                              return (
                                <td key={type} className="hidden sm:table-cell text-center py-2 px-2">
                                  <span className="text-neutral-300 dark:text-neutral-600 text-xs">—</span>
                                </td>
                              );
                            }
                            const min = Math.min(...counts);
                            const max = Math.max(...counts);
                            const display = min === max ? String(min) : `${min}-${max}`;
                            return (
                              <td key={type} className="hidden sm:table-cell text-center py-2 px-2 text-neutral-800 dark:text-neutral-200">
                                {display}
                              </td>
                            );
                          } else {
                            const count = info.maps[0]?.toPlace[type] ?? 0;
                            return (
                              <td key={type} className="hidden sm:table-cell text-center py-2 px-2 text-neutral-800 dark:text-neutral-200">
                                {count > 0 ? String(count) : <span className="text-neutral-300 dark:text-neutral-600">—</span>}
                              </td>
                            );
                          }
                        })}
                        <td className="py-2 pl-3">
                          <div className="flex flex-wrap gap-1 items-center">
                            {info.reward?.parcelId.map((id, idx) => (
                              <ItemIcon
                                key={`r${idx}`}
                                type={info.reward?.parcelTypeStr[idx] ?? ''}
                                itemId={String(id)}
                                amount={info.reward?.parcelAmount[idx] ?? 0}
                                size={10}
                                eventData={eventData}
                                iconData={iconData}
                              />
                            ))}
                            {info.additionalRewards.flatMap((ar, ai) =>
                              ar.parcelId.map((id, idx) => (
                                <ItemIcon key={`ar${ai}_${idx}`} type={ar.parcelTypeStr[idx]} itemId={String(id)} amount={ar.parcelAmount[idx]} size={10} eventData={eventData} iconData={iconData} />
                              )),
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Maps tab */}
        {activeTab === 'maps' && (
          <div className="space-y-3">
            {/* Round selector */}
            <div className="flex flex-wrap gap-1.5">
              {roundInfos.map((info) => (
                <button
                  key={info.round}
                  onClick={() => setMapsRound(info.round)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${mapsRound === info.round ? 'bg-blue-500 dark:bg-blue-600 text-white border-blue-500 dark:border-blue-600' : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
                >
                  {info.isLoop ? `${info.round}+` : String(info.round)}
                </button>
              ))}
            </div>

            {/* Maps for selected round */}
            {roundInfos
              .filter((info) => info.round === mapsRound)
              .map((info) => (
                <div key={info.round} className="space-y-4">
                  {info.maps.map((m, mapIndex) => {
                    const mapData = ROAD_PUZZLE_MAPS[m.name];
                    // Build game inventory for this map (AvailableRailTileAmount by type)
                    const gameInv: Record<number, number> = {};
                    for (const type of tileTypes) {
                      gameInv[type] = m.toPlace[type] ?? 0;
                    }
                    const mapDisplayName = getMapDisplayName(info.round, mapIndex + 1, m.name, info.maps.length, m.toPlace);
                    return (
                      <div key={m.name} className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 space-y-2">
                        <div className="font-semibold text-sm text-neutral-700 dark:text-neutral-300">{mapDisplayName}</div>
                        {!mapData ? (
                          <div className="text-sm text-neutral-400 dark:text-neutral-500 italic">{t('mapDataMissing')}</div>
                        ) : (
                          <RoadPuzzleMapSolver mapName={m.name} mapData={mapData} tileTypes={tileTypes} tileTypeName={tileTypeName} gameInventory={gameInv} />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>
        )}

        {/* Calculator tab */}
        {activeTab === 'calculator' &&
          (() => {
            const STICKER_PER_TILE = 150;

            // Total expected tiles from MC results + current range selection
            const totalExpected = mcResult
              ? selectedRounds.reduce((sum, roundInfo) => {
                  const mapsWithData = roundInfo.maps.filter((m) => mcResult.perMap[m.name] !== undefined);
                  if (mapsWithData.length === 0) return sum;
                  const plays = roundInfo.isLoop ? loopCount : 1;
                  const avgPerPlay = mapsWithData.reduce((s, m) => s + (mcResult.perMap[m.name]?.avg ?? 0), 0) / mapsWithData.length;
                  return sum + avgPerPlay * plays;
                }, 0)
              : 0;

            return (
              <div className="space-y-5 p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg text-sm">
                {/* Simulation — runs for ALL maps, independent of range */}
                <div className="space-y-3 border-b dark:border-neutral-700 pb-4">
                  <h3 className="font-bold text-base dark:text-neutral-200">{t('mcTitle')}</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('mcDesc')}</p>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t('mcSimCount')}</label>
                      <input
                        type="number"
                        min={1}
                        max={100000}
                        step={1}
                        value={simCount}
                        onChange={(e) => {
                          setSimCount(Math.max(1, parseInt(e.target.value) || 1));
                          setMcResult(null);
                        }}
                        className="w-28 p-1.5 border rounded dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
                      />
                    </div>
                    <SimRunButton
                      isRunning={isSimulating}
                      onClick={handleRunMC}
                      className="px-4 py-1.5 text-sm font-semibold bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-lg"
                    >
                      {t('mcRun')}
                    </SimRunButton>
                  </div>

                  {mcResult && (
                    <div className="mt-2">
                      {roundInfos.map((roundInfo) => (
                        <div key={roundInfo.round}>
                          <div className="flex items-center gap-1.5 mt-2 mb-1">
                            <span className="text-sm font-bold text-neutral-700 dark:text-neutral-300">
                              {roundInfo.isLoop ? t('roundLoop', { round: roundInfo.round }) : t('roundLabel', { round: roundInfo.round })}
                            </span>
                            {roundInfo.isLoop && <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{t('loopRandomNote')}</span>}
                          </div>
                          {roundInfo.maps.map((m, mIdx) => {
                            const stats = mcResult.perMap[m.name];
                            return (
                              <div key={m.name} className="flex items-center gap-3 py-2 border-t border-neutral-200 dark:border-neutral-700">
                                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 flex-1 min-w-0">
                                  {getMapDisplayName(roundInfo.round, mIdx + 1, m.name, roundInfo.maps.length, m.toPlace)}
                                </span>
                                {stats !== undefined ? (
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">~{stats.avg.toFixed(1)}</span>
                                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                      {t('tilesUnit')}
                                      {roundInfo.isLoop ? ` ${t('perPlay')}` : ''}
                                    </span>
                                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                                      {t('mcMin')} {stats.min} / {t('mcMax')} {stats.max} / σ {stats.stddev.toFixed(2)}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500 italic">{t('mapDataMissingShort')}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Plan — range selection + total based on MC results */}
                <div className="space-y-3 border-b dark:border-neutral-700 pb-4">
                  <h3 className="font-bold text-base dark:text-neutral-200">{t('planTitle')}</h3>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t('startStage')}</label>
                      <input
                        type="number"
                        min={1}
                        value={startStage}
                        onChange={(e) => setRoadPuzzleConfig({ ...config, startStage: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-20 p-1.5 border rounded dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">{t('endStage')}</label>
                      <input
                        type="number"
                        min={1}
                        value={effectiveEndStage}
                        onChange={(e) => setRoadPuzzleConfig({ ...config, endStage: Math.max(1, parseInt(e.target.value) || lastNonLoopRound) })}
                        className="w-20 p-1.5 border rounded dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
                      />
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 pb-1.5">
                      {selectedRounds.filter((r) => !r.isLoop).length > 0 && (
                        <span>
                          {t('planSummaryRounds', {
                            rounds: selectedRounds
                              .filter((r) => !r.isLoop)
                              .map((r) => r.round)
                              .join(', '),
                          })}
                        </span>
                      )}
                      {includesLoop && <span className="ml-1">{t('planSummaryLoop', { count: loopCount })}</span>}
                    </div>
                  </div>
                  {mcResult ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">{t('total')}</span>
                        <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                          ~{totalExpected.toFixed(1)} {t('tilesUnit')}
                        </span>
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          / ~{Math.round(totalExpected * STICKER_PER_TILE).toLocaleString()} {t('stickers')}
                        </span>
                      </div>

                      {/* Cost and rewards breakdown */}
                      {(() => {
                        const result = buildResult();
                        const costEntries = Object.entries(result.cost);
                        const rewardEntries = Object.entries(result.rewards);

                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                            {/* Cost */}
                            {costEntries.length > 0 && (
                              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-100 dark:border-red-900/30">
                                <h4 className="font-semibold text-red-700 dark:text-red-300 mb-2 text-sm">{t('costTitle')}</h4>
                                <div className="flex flex-wrap gap-2">
                                  {costEntries.map(([key, amount]) => (
                                    <ItemIcon key={`cost-${key}`} type={key.split('_')[0]} itemId={key.split('_')[1]} amount={Math.ceil(amount)} size={10} eventData={eventData} iconData={iconData} />
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Rewards */}
                            {rewardEntries.length > 0 && (
                              <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-100 dark:border-green-900/30">
                                <h4 className="font-semibold text-green-700 dark:text-green-300 mb-2 text-sm">{t('rewardsTitle')}</h4>
                                <div className="max-h-40 overflow-y-auto pr-2">
                                  <div className="flex flex-wrap gap-2">
                                    {rewardEntries.map(
                                      ([key, amount]) =>
                                        amount > 0 && (
                                          <ItemIcon
                                            key={`reward-${key}`}
                                            type={key.split('_')[0]}
                                            itemId={key.split('_')[1]}
                                            amount={Math.round(amount)}
                                            size={10}
                                            eventData={eventData}
                                            iconData={iconData}
                                          />
                                        ),
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 italic">{t('mcRunFirst')}</p>
                  )}
                </div>
              </div>
            );
          })()}
      </div>
    </>
  );
};
