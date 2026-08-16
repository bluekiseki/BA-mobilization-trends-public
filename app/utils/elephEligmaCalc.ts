import type { DistributionData } from '~/utils/gachaEngine';
import { eligmaExchangeCost, starGrowthCost, uwGrowthCost } from '~/data/growthData';

/**
 * Extract a percentile value from a DistributionData CDF array.
 * Returns the binEnd of the first bin whose CDF >= percentile.
 */
export function getPercentileFromDist(dist: DistributionData[], percentile: number): number {
  if (!dist.length) return 0;
  for (const bin of dist) {
    if (bin.cdf >= percentile) return bin.binEnd;
  }
  return dist[dist.length - 1].binEnd;
}

/**
 * Calculate how much eligma is needed to buy `elephCount` eleph,
 * starting from `alreadyBought` previous eleph purchases this month.
 */
export function calcEligmaCostForEleph(elephCount: number, alreadyBought: number): number {
  let cost = 0;
  let bought = alreadyBought;
  for (let i = 0; i < elephCount; i++) {
    const tier = eligmaExchangeCost.find((t) => bought < t.maxEleph);
    cost += tier?.costPer ?? 5;
    bought++;
  }
  return cost;
}

export interface PercentileBand {
  p10: number;
  p50: number;
  p90: number;
}

export function calcElephNeeded(currentStar: number, targetStar: number, currentUw: number, targetUw: number): number {
  let total = 0;
  for (let s = currentStar + 1; s <= targetStar; s++) total += starGrowthCost[s]?.eleph ?? 0;
  const uwStart = targetStar >= 5 ? currentUw : 0;
  const uwEnd = targetStar >= 5 ? targetUw : 0;
  for (let u = uwStart + 1; u <= uwEnd; u++) total += uwGrowthCost[u]?.eleph ?? 0;
  return total;
}
