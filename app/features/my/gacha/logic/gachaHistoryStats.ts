import type { BannerPeriod } from '~/utils/gachaData';
import type { GachaHistoryEntry } from '~/types/gachaHistory';
import { createRng } from '~/utils/rng';

export interface ProbabilityPoint {
  value: number;
  probability: number;
}

export interface DistributionSummary {
  actual: number;
  actualPointValue: number;
  pointWidth: number;
  expected: number;
  median?: number;
  topPercentMin: number;
  topPercentMax: number;
  points: ProbabilityPoint[];
}

export interface GachaHistoryStats {
  threeStar: DistributionSummary | null;
  halfPity: DistributionSummary | null;
  goals: DistributionSummary | null;
  eligiblePulls: number;
  normalThreeStars: number;
  halfPityCount: number;
  halfPityPickupCount: number;
  goalCount: number;
}

export interface BannerGachaHistoryStats {
  bannerId: string;
  stats: GachaHistoryStats;
}

export type StudentRecruitmentScope = 'all' | 'normal';

export interface RecruitedStudentRankGroup {
  studentIds: number[];
  count: number;
}

export const DEFAULT_SIMULATION_COUNT = 10_000;
export const MIN_SIMULATION_COUNT = 100;
export const MAX_SIMULATION_COUNT = 100_000;

export function isValidGachaHistorySimulationCount(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_SIMULATION_COUNT && value <= MAX_SIMULATION_COUNT;
}

export function shouldAutoRunGachaHistorySimulation(value: number): boolean {
  return isValidGachaHistorySimulationCount(value) && value < DEFAULT_SIMULATION_COUNT;
}

export function calculateTopRecruitedStudentGroups(entries: GachaHistoryEntry[], scope: StudentRecruitmentScope): RecruitedStudentRankGroup[] {
  const counts = new Map<number, number>();
  for (const result of entries.flatMap((entry) => entry.results)) {
    if (scope === 'normal' && result.source !== 'normal') continue;
    counts.set(result.studentId, (counts.get(result.studentId) ?? 0) + 1);
  }

  const groups = new Map<number, number[]>();
  for (const [studentId, count] of counts) {
    if (count <= 1) continue;
    const studentIds = groups.get(count) ?? [];
    studentIds.push(studentId);
    groups.set(count, studentIds);
  }

  return [...groups.entries()]
    .map(([count, studentIds]) => ({ count, studentIds: studentIds.sort((left, right) => left - right) }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 3);
}

function clampPercent(value: number): number {
  return Math.max(0.1, Math.min(99.9, value * 100));
}

function normalPmf(mean: number, variance: number, actual: number): ProbabilityPoint[] {
  const deviation = Math.sqrt(Math.max(variance, 0.25));
  const min = Math.max(0, Math.floor(Math.min(mean - 4 * deviation, actual - 3 * deviation)));
  const max = Math.ceil(Math.max(mean + 4 * deviation, actual + 3 * deviation));
  const raw: ProbabilityPoint[] = [];
  let total = 0;
  for (let value = min; value <= max; value++) {
    const z = (value - mean) / deviation;
    const probability = Math.exp(-0.5 * z * z);
    raw.push({ value, probability });
    total += probability;
  }
  return raw.map((point) => ({ ...point, probability: point.probability / total }));
}

function binomialPmf(trials: number, probability: number): ProbabilityPoint[] {
  if (probability <= 0) return [{ value: 0, probability: 1 }];
  if (probability >= 1) return [{ value: trials, probability: 1 }];

  const mode = Math.floor((trials + 1) * probability);
  const weights = Array.from<number>({ length: trials + 1 }).fill(0);
  weights[mode] = 1;

  for (let value = mode; value > 0; value -= 1) {
    weights[value - 1] = weights[value] * (value / (trials - value + 1)) * ((1 - probability) / probability);
  }
  for (let value = mode; value < trials; value += 1) {
    weights[value + 1] = weights[value] * ((trials - value) / (value + 1)) * (probability / (1 - probability));
  }

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight, value) => ({ value, probability: weight / total }));
}

function binomialSummary(trials: number, probability: number, actual: number): DistributionSummary | null {
  if (trials <= 0) return null;
  const expected = trials * probability;
  const points = binomialPmf(trials, probability);
  const strictBetter = points.filter((point) => point.value > actual).reduce((sum, point) => sum + point.probability, 0);
  const equalOrBetter = points.filter((point) => point.value >= actual).reduce((sum, point) => sum + point.probability, 0);
  return { actual, actualPointValue: actual, pointWidth: 1, expected, topPercentMin: clampPercent(strictBetter), topPercentMax: clampPercent(equalOrBetter), points };
}

function buildHistogram(samples: number[], actual: number, lowerIsBetter: boolean): DistributionSummary | null {
  if (samples.length === 0) return null;
  const expected = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  const sortedSamples = samples.slice().sort((left, right) => left - right);
  const middle = Math.floor(sortedSamples.length / 2);
  const median = sortedSamples.length % 2 === 0 ? (sortedSamples[middle - 1] + sortedSamples[middle]) / 2 : sortedSamples[middle];
  const width = 10;
  const counts = new Map<number, number>();
  for (const sample of samples) {
    const bucket = Math.floor(sample / width) * width;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const actualPointValue = Math.floor(actual / width) * width;
  if (!counts.has(actualPointValue)) counts.set(actualPointValue, 0);
  const points = [...counts.entries()].sort(([left], [right]) => left - right).map(([value, count]) => ({ value, probability: count / samples.length }));
  const strictBetter = samples.filter((sample) => (lowerIsBetter ? sample < actual : sample > actual)).length / samples.length;
  const equalOrBetter = samples.filter((sample) => (lowerIsBetter ? sample <= actual : sample >= actual)).length / samples.length;
  return { actual, actualPointValue, pointWidth: width, expected, median, topPercentMin: clampPercent(strictBetter), topPercentMax: clampPercent(equalOrBetter), points };
}

const PICKUP_RATE = 0.007;
const MAX_GOAL_SIM_PULLS = 20_000;

/** Recruit-charge goal sim for one counter (normal or limited): pulls until `targetCount` pickups land. */
function simulateChargeGoal(targetCount: number, initialCharge: number, rng: () => number): number {
  if (targetCount === 0) return 0;
  let pulls = 0;
  let acquired = 0;
  let charge = initialCharge;
  while (acquired < targetCount && pulls < MAX_GOAL_SIM_PULLS) {
    pulls += 1;
    charge += 1;
    if (charge === 200 || (charge === 100 && rng() < 0.5)) {
      acquired += 1;
      charge = 0;
      continue;
    }
    if (rng() < PICKUP_RATE) {
      acquired += 1;
      charge = 0;
    }
  }
  return pulls;
}

/** Legacy spark-point goal sim: a guaranteed pickup every 200 pulls, plus natural pickups. */
function simulatePointGoal(targetCount: number, rng: () => number): number {
  if (targetCount === 0) return 0;
  let pulls = 0;
  let acquired = 0;
  while (acquired < targetCount && pulls < MAX_GOAL_SIM_PULLS) {
    pulls += 1;
    if (pulls % 200 === 0) {
      acquired += 1;
      continue;
    }
    if (rng() < PICKUP_RATE) acquired += 1;
  }
  return pulls;
}

function simulateGoalPulls(entry: GachaHistoryEntry, banner: BannerPeriod, goalIds: number[], rng: () => number): number {
  if (goalIds.length === 0) return 0;
  if (!banner.useChargeSystem) return simulatePointGoal(goalIds.length, rng);

  // On a banner running a normal and a limited pickup concurrently, each pickup's "recruit charge" is a
  // separate counter — simulate the two sides independently from their own starting charge.
  const limitedPickupIds = new Set(banner.pickupStudents.filter((s) => s.isLimited).map((s) => s.id));
  const hasNormalPickup = banner.pickupStudents.some((s) => !s.isLimited);
  const normalGoalCount = goalIds.filter((id) => !limitedPickupIds.has(id)).length;
  const limitedGoalCount = goalIds.length - normalGoalCount;

  // When the banner has no normal-recruitment pickup, the single initialCharge field is the limited counter.
  const normalInitial = hasNormalPickup ? (entry.initialCharge ?? 0) : 0;
  const limitedInitial = hasNormalPickup ? (entry.initialChargeLimited ?? 0) : (entry.initialCharge ?? 0);

  return simulateChargeGoal(normalGoalCount, normalInitial, rng) + simulateChargeGoal(limitedGoalCount, limitedInitial, rng);
}

export function calculateGachaHistoryStats(entries: GachaHistoryEntry[], banners: Map<string, BannerPeriod>, simulationCount = DEFAULT_SIMULATION_COUNT): GachaHistoryStats {
  let eligiblePulls = 0;
  let normalThreeStars = 0;
  let normalMean = 0;
  let normalVariance = 0;
  let halfPityCount = 0;
  let halfPityPickupCount = 0;
  let actualGoalPulls = 0;
  let goalCount = 0;
  const goalEntries: Array<{ entry: GachaHistoryEntry; banner: BannerPeriod; goalIds: number[] }> = [];

  for (const entry of entries) {
    const banner = banners.get(entry.bannerId);
    if (!banner) continue;
    const guaranteedResults = entry.results.filter((result) => result.source === 'half_pity' || result.source === 'hard_pity').length;
    const normalResults = entry.results.filter((result) => result.source === 'normal');
    const validPulls = Math.max(0, entry.pullCount - guaranteedResults);
    const threeRate = banner.isFes ? 0.06 : 0.03;
    eligiblePulls += validPulls;
    normalThreeStars += normalResults.length;
    normalMean += validPulls * threeRate;
    normalVariance += validPulls * threeRate * (1 - threeRate);
    const halfPityResults = entry.results.filter((result) => result.source === 'half_pity');
    halfPityCount += halfPityResults.length;
    halfPityPickupCount += halfPityResults.filter((result) => result.isPickup).length;

    const goals = new Set(entry.results.filter((result) => result.countTowardGoal).map((result) => result.studentId));
    if (goals.size > 0) {
      actualGoalPulls += entry.pullCount;
      goalCount += goals.size;
      goalEntries.push({ entry, banner, goalIds: [...goals] });
    }
  }

  const threeStar =
    eligiblePulls > 0
      ? (() => {
          const points = normalPmf(normalMean, normalVariance, normalThreeStars);
          const strictBetter = points.filter((point) => point.value > normalThreeStars).reduce((sum, point) => sum + point.probability, 0);
          const equalOrBetter = points.filter((point) => point.value >= normalThreeStars).reduce((sum, point) => sum + point.probability, 0);
          return {
            actual: normalThreeStars,
            actualPointValue: normalThreeStars,
            pointWidth: 1,
            expected: normalMean,
            topPercentMin: clampPercent(strictBetter),
            topPercentMax: clampPercent(equalOrBetter),
            points,
          };
        })()
      : null;

  const goalSamples: number[] = [];
  if (goalEntries.length > 0) {
    for (let sampleIndex = 0; sampleIndex < simulationCount; sampleIndex++) {
      const rng = createRng(0x9e3779b9 ^ sampleIndex);
      goalSamples.push(goalEntries.reduce((sum, item) => sum + simulateGoalPulls(item.entry, item.banner, item.goalIds, rng), 0));
    }
  }

  return {
    threeStar,
    halfPity: binomialSummary(halfPityCount, 0.5, halfPityPickupCount),
    goals: buildHistogram(goalSamples, actualGoalPulls, true),
    eligiblePulls,
    normalThreeStars,
    halfPityCount,
    halfPityPickupCount,
    goalCount,
  };
}

export function calculateGachaHistoryStatsByBanner(entries: GachaHistoryEntry[], banners: Map<string, BannerPeriod>, simulationCount = DEFAULT_SIMULATION_COUNT): BannerGachaHistoryStats[] {
  const entriesByBanner = new Map<string, GachaHistoryEntry[]>();
  for (const entry of entries) {
    if (!banners.has(entry.bannerId)) continue;
    const groupedEntries = entriesByBanner.get(entry.bannerId);
    if (groupedEntries) groupedEntries.push(entry);
    else entriesByBanner.set(entry.bannerId, [entry]);
  }

  return [...entriesByBanner.entries()]
    .sort(([leftId], [rightId]) => {
      const left = banners.get(leftId);
      const right = banners.get(rightId);
      const startOrder = (left?.startTime ?? '').localeCompare(right?.startTime ?? '');
      return startOrder || leftId.localeCompare(rightId);
    })
    .map(([bannerId, groupedEntries]) => ({
      bannerId,
      stats: calculateGachaHistoryStats(groupedEntries, banners, simulationCount),
    }));
}
