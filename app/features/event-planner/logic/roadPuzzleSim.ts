import type { EventData, RoadPuzzleRound, RoadPuzzleRewardItem, RoadPuzzleAdditionalRewardItem } from '~/types/plannerData';
import { solveRoadPuzzle } from '~/features/event-planner/logic/solveRoadPuzzle';
import { ROAD_PUZZLE_MAPS } from '~/data/roadPuzzleMaps';

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
export function buildRoundInfos(roadPuzzleData: NonNullable<EventData['minigame_road_puzzle']>): RoundInfo[] {
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
export interface MapStats {
  avg: number;
  min: number;
  max: number;
  stddev: number;
}
// Simulate draws until solvable. Memoized by inventory composition.
export function simulateRoadPuzzleMapDraws(mapName: string, pool: Record<number, number>, minTilesNeeded: number, trials: number): MapStats {
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
    const found = solveRoadPuzzle(mapData.grid, mapData.rowOffset, inv, mapData.goalEntry, mapData.startEntry).found;
    memo.set(key, found);
    return found;
  };

  const trialDraws: number[] = new Array<number>(trials);
  let total = 0;
  let minDraws = Infinity;
  let maxDraws = 0;

  for (let i = 0; i < trials; i++) {
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
    }
    trialDraws[i] = draws;
    total += draws;
    if (draws < minDraws) minDraws = draws;
    if (draws > maxDraws) maxDraws = draws;
  }

  const avg = total / trials;
  const variance = trialDraws.reduce((s, d) => s + (d - avg) ** 2, 0) / trials;
  return { avg, min: minDraws, max: maxDraws, stddev: Math.sqrt(variance) };
}
