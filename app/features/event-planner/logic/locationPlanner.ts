import type { LocationConfig, LocationData } from '~/types/minigame/location';
import type { TransactionEntry, LocalizeEtc } from '~/types/plannerData';

export type LocationReward = {
  key: string;
  expected: number;
};

export type LocationRow = {
  key: string;
  rank: number;
  groupId: number;
  name: string;
  description: string;
  localizeEtc: LocalizeEtc | undefined;
  runs: number;
  countedRuns: number;
  status: 'valid' | 'excess' | 'locked' | 'blocked';
  rewards: LocationReward[];
  visitors: number;
  favorExp: number;
  eleph: number;
};

export type LocationRank = {
  rank: number;
  requiredRuns: number | null;
  carriedPoints: number;
  pointsToNextRank: number;
  cumulativeThreshold: number;
  requirementIncrease: number;
  plannedRuns: number;
  countedRuns: number;
  status: 'complete' | 'current' | 'underfilled' | 'excess' | 'blocked';
  rows: LocationRow[];
};

export type LocationResult = {
  ranks: LocationRank[];
  startRank: number | null;
  cost: Record<string, number>;
  rewards: Record<string, number>;
  runs: number;
  excludedRuns: number;
  visitors: number;
  favorExp: number;
  eleph: number;
  pointsPerRun: number;
  costPerRun: number;
  costKey: string;
};

export const locationRowKey = (rank: number, groupId: number) => `${rank}:${groupId}`;
// Location rank points gained per schedule are separate from the event-item cost.
export const LOCATION_POINTS_PER_SCHEDULE = 500;

const validRuns = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0);

export function getLocationRows(data: LocationData): LocationRank[] {
  const pointsPerRun = LOCATION_POINTS_PER_SCHEDULE;
  const zones = [...data.zone].sort((a, b) => a.LocationRank - b.LocationRank);
  let carriedPoints = 0;
  let cumulativeThreshold = 0;
  let previousRequirement = 0;
  const rewardsByGroup = new Map<number, LocationData['reward']>();
  for (const reward of data.reward) {
    const group = rewardsByGroup.get(reward.ScheduleGroupId) ?? [];
    group.push(reward);
    rewardsByGroup.set(reward.ScheduleGroupId, group);
  }
  for (const group of rewardsByGroup.values()) group.sort((a, b) => a.OrderInGroup - b.OrderInGroup);

  return zones.map((rankZone) => {
    const pointsToNextRank = rankZone.EventPointForLocationRank;
    const carriedIntoRank = carriedPoints;
    const requiredRuns = pointsToNextRank > 0 && pointsPerRun > 0 ? Math.ceil(Math.max(0, pointsToNextRank - carriedIntoRank) / pointsPerRun) : null;
    if (requiredRuns !== null) carriedPoints = carriedIntoRank + requiredRuns * pointsPerRun - pointsToNextRank;
    if (pointsToNextRank > 0) cumulativeThreshold += pointsToNextRank;
    const requirementIncrease = pointsToNextRank > 0 ? pointsToNextRank - previousRequirement : 0;
    if (pointsToNextRank > 0) previousRequirement = pointsToNextRank;
    return {
      rank: rankZone.LocationRank,
      requiredRuns,
      carriedPoints: carriedIntoRank,
      pointsToNextRank,
      cumulativeThreshold,
      requirementIncrease,
      plannedRuns: 0,
      countedRuns: 0,
      status: 'current',
      rows: zones
        .filter((zone) => zone.LocationRank <= rankZone.LocationRank)
        .map((zone) => {
          const reward = [...(rewardsByGroup.get(zone.RewardGroupId) ?? [])].filter((entry) => entry.LocationRank <= rankZone.LocationRank).at(-1);
          const grouped = new Map<string, LocationReward>();
          if (reward) {
            reward.ExtraRewardParcelId.forEach((id, index) => {
              const type = reward.ExtraRewardParcelTypeStr[index];
              const amount = reward.ExtraRewardAmount[index];
              const probability = reward.ExtraRewardProb[index];
              if (!type || !Number.isFinite(id) || !Number.isFinite(amount) || !Number.isFinite(probability)) return;
              const key = `${type}_${id}`;
              const item = grouped.get(key) ?? { key, expected: 0 };
              item.expected += (amount * probability) / 10000;
              grouped.set(key, item);
            });
          }
          const visitors = zone.StudentVisitProb.reduce((sum, chance) => sum + chance / 10000, 0);
          const localizeEtc = reward?.LocalizeEtc ?? zone.LocalizeEtc;
          return {
            key: locationRowKey(rankZone.LocationRank, zone.RewardGroupId),
            rank: rankZone.LocationRank,
            groupId: zone.RewardGroupId,
            name: localizeEtc.NameKr || String(zone.RewardGroupId),
            description: localizeEtc.DescriptionKr || '',
            localizeEtc,
            runs: 0,
            countedRuns: 0,
            status: 'valid' as const,
            rewards: [...grouped.values()],
            visitors,
            favorExp: visitors * ((reward?.FavorExp ?? 0) + ((reward?.ExtraFavorExp ?? 0) * (reward?.ExtraFavorExpProb ?? 0)) / 10000),
            eleph: (visitors * (reward?.SecretStoneAmount ?? 0) * (reward?.SecretStoneProb ?? 0)) / 10000,
          };
        }),
    };
  });
}

export function calculateLocation(data: LocationData, config: LocationConfig): LocationResult {
  const ranks = getLocationRows(data);
  const info = data.info[0];
  const costPerRun = info?.ScheduleEventPointCostParcelAmount || 0;
  const costKey = `${info?.ScheduleEventPointCostParcelTypeStr || 'Item'}_${info?.ScheduleEventPointCostParcelId || 0}`;
  const runs = config?.runs && typeof config.runs === 'object' ? config.runs : {};
  for (const rank of ranks) {
    for (const row of rank.rows) row.runs = validRuns(runs[row.key]);
    rank.plannedRuns = rank.rows.reduce((sum, row) => sum + row.runs, 0);
  }
  const startRank = ranks.find((rank) => rank.plannedRuns > 0)?.rank ?? null;
  let blocked = false;
  let totalRuns = 0;
  let excludedRuns = 0;
  let visitors = 0;
  let favorExp = 0;
  let eleph = 0;
  const rewards: Record<string, number> = {};
  for (const rank of ranks) {
    if (startRank === null || rank.rank < startRank) {
      rank.status = 'complete';
      continue;
    }
    let remaining = rank.requiredRuns ?? Infinity;
    if (blocked) {
      rank.status = 'blocked';
      for (const row of rank.rows) {
        if (row.runs > 0) row.status = 'blocked';
        excludedRuns += row.runs;
      }
      continue;
    }
    let excess = false;
    for (const row of rank.rows) {
      if (row.runs === 0) continue;
      if (excess || row.runs > remaining) {
        row.status = 'excess';
        excess = true;
        excludedRuns += row.runs;
        continue;
      }
      row.countedRuns = row.runs;
      rank.countedRuns += row.runs;
      remaining -= row.runs;
      totalRuns += row.runs;
      visitors += row.visitors * row.runs;
      favorExp += row.favorExp * row.runs;
      eleph += row.eleph * row.runs;
      for (const reward of row.rewards) rewards[reward.key] = (rewards[reward.key] || 0) + reward.expected * row.runs;
    }
    if (excess) {
      rank.status = 'excess';
      blocked = true;
    } else if (rank.requiredRuns !== null && remaining > 0) {
      rank.status = ranks.some((later) => later.rank > rank.rank && later.plannedRuns > 0) ? 'underfilled' : 'current';
      blocked = true;
    } else {
      rank.status = 'complete';
    }
  }
  return {
    ranks,
    startRank,
    cost: totalRuns > 0 ? { [costKey]: totalRuns * costPerRun } : {},
    rewards,
    runs: totalRuns,
    excludedRuns,
    visitors,
    favorExp,
    eleph,
    pointsPerRun: LOCATION_POINTS_PER_SCHEDULE,
    costPerRun,
    costKey,
  };
}

export function getLocationMaxRuns(result: LocationResult, rankNumber: number, rowKey: string, availableCurrency: number): number {
  const rank = result.ranks.find((entry) => entry.rank === rankNumber);
  const row = rank?.rows.find((entry) => entry.key === rowKey);
  if (!rank || !row || result.costPerRun <= 0) return 0;
  const otherRunsInRank = rank.rows.reduce((sum, entry) => sum + (entry.key === rowKey ? 0 : entry.runs), 0);
  const rankRoom = rank.requiredRuns === null ? Infinity : Math.max(0, rank.requiredRuns - otherRunsInRank);
  if (rank.requiredRuns !== null) return rankRoom;
  const otherRuns = result.ranks.reduce((sum, entry) => sum + entry.rows.reduce((rowSum, item) => rowSum + (item.key === rowKey ? 0 : item.runs), 0), 0);
  const currencyRoom = Math.max(0, Math.floor(availableCurrency / result.costPerRun) - otherRuns);
  return currencyRoom;
}

export function createLocationAutoConfig(result: LocationResult, config: LocationConfig): LocationConfig {
  const finiteRanks = result.ranks.filter((rank) => rank.requiredRuns !== null);
  const runs: Record<string, number> = Object.fromEntries(Object.entries(config.runs).filter(([key]) => !finiteRanks.some((rank) => key.startsWith(`${rank.rank}:`))));
  for (const rank of finiteRanks) {
    let remaining = rank.requiredRuns ?? 0;
    for (const row of rank.rows) {
      if (remaining === 0) break;
      runs[row.key] = 1;
      remaining -= 1;
    }
    const firstRow = rank.rows[0];
    if (remaining > 0 && firstRow) runs[firstRow.key] += remaining;
  }
  return { runs };
}

export function getLocationSpendableCurrency(ownedCurrency: Record<number, number>, transactions: TransactionEntry[], costKey: string): number {
  const itemId = Number(costKey.slice(costKey.lastIndexOf('_') + 1));
  let balance = ownedCurrency[itemId] || 0;
  for (const transaction of transactions) {
    if (transaction.source.startsWith('location_')) continue;
    const item = transaction.items[costKey];
    if (item && item.goalKind !== 'cumulative') balance += item.amount;
  }
  return balance;
}
