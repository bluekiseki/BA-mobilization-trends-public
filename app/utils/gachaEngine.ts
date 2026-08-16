// app/utils/gachaEngine.ts
import type { BannerPeriod, BannerStrategy, Student } from '~/types/gacha';
import { canSpook, FES_EXCLUSIONS_BY_PICKUP_ID, ARCHIVE_STUDENT_IDS, getRecruitCountReward, getNextTicketThreshold } from './gachaRules';

// ==========================================
// 1. Constants and Type Definitions
// ==========================================

const RATES = {
  NORMAL: {
    R3: 0.03,
    R2: 0.185,
    R1: 0.785,
    PICKUP: 0.007,
  },
  FES: {
    R3: 0.06,
    R2: 0.185,
    R1: 0.755,
    PICKUP: 0.007,
    FES_SPOOK: 0.009,
    NORMAL_SPOOK: 0.044,
  },
};

export const REWARDS = {
  PICKUP_DUPE: { eligma: 50, eleph: 100 },
  SPOOK_DUPE: { eligma: 50, eleph: 30 },
  TWO_STAR_DUPE: { eligma: 10, eleph: 5 },
  ONE_STAR_DUPE: { eligma: 1, eleph: 1 },
  PICKUP_NEW_BONUS: { eligma: 0, eleph: 100 },
};

const ELIGMA_KEY = 'Item_23';

export function calcPullRewards(count: number, grade: 1 | 2 | 3, isPickup: boolean, studentId: number): Record<string, number> {
  const dupes = Math.max(0, count - 1);
  const items: Record<string, number> = {};
  const elephKey = `Item_${studentId}`;
  if (grade === 3) {
    const dupe = isPickup ? REWARDS.PICKUP_DUPE : REWARDS.SPOOK_DUPE;
    const eleph = (isPickup ? REWARDS.PICKUP_NEW_BONUS.eleph : 0) + dupes * dupe.eleph;
    if (eleph > 0) items[elephKey] = eleph;
    if (dupes > 0) items[ELIGMA_KEY] = dupes * dupe.eligma;
  } else {
    const dupe = grade === 2 ? REWARDS.TWO_STAR_DUPE : REWARDS.ONE_STAR_DUPE;
    if (dupes > 0) {
      items[elephKey] = dupes * dupe.eleph;
      items[ELIGMA_KEY] = dupes * dupe.eligma;
    }
  }
  return items;
}

export function calcDupeReward(grade: 1 | 2 | 3, isPickup: boolean, studentId: number): Record<string, number> {
  const dupe = grade === 3 ? (isPickup ? REWARDS.PICKUP_DUPE : REWARDS.SPOOK_DUPE) : grade === 2 ? REWARDS.TWO_STAR_DUPE : REWARDS.ONE_STAR_DUPE;
  return { [`Item_${studentId}`]: dupe.eleph, [ELIGMA_KEY]: dupe.eligma };
}

export interface DistributionData {
  binStart: number;
  binEnd: number;
  count: number;
  pdf: number; // Probability Density (Interval probability)
  cdf: number; // Cumulative Distribution (Cumulative probability)
}

export interface SimulationConfig {
  initialPyroxenes: number;
  simCount: number;
}

export interface StudentSimulationStat {
  studentId: number;
  name: string;
  isLimited: boolean;
  isFes: boolean;
  obtainRate: number;
  avgEleph: number;
  elephDistribution: { amount: number; probability: number }[];
}

export interface GlobalAggregatedResult {
  simCount: number;
  successRate: number;
  avgTotalPulls: number;
  avgTotalCost: number;
  avgTotalEligma: number;
  distPulls: DistributionData[];
  distCost: DistributionData[];
  distEligma: DistributionData[];
  /** Total eligma exact amount distribution across all banners. */
  distEligmaExact?: Array<{ amount: number; probability: number }>;
  // Cumulative cost distribution per banner (Key: BannerID)
  distCostMap: Record<string, DistributionData[]>;
  // Incremental eligma distribution per banner (Key: BannerID)
  distEligmaMap: Record<string, DistributionData[]>;
  /** bannerId → incremental eligma exact amount distribution for that banner */
  distEligmaExactMap?: Record<string, Array<{ amount: number; probability: number }>>;
  bannerStats: {
    bannerId: string;
    bannerLabel: string;
    startTime: string;
    avgPulls: number;
    avgCost: number;
  }[];
  studentStats: Record<number, StudentSimulationStat>;
  /** bannerId → studentId → incremental eleph distribution for that banner */
  distStudentElephMap: Record<string, Record<number, Array<{ amount: number; probability: number }>>>;
}

// For internal simulation state management
export interface SimState {
  owned: Set<number>;
  acquiredInSim: Set<number>;
  eleph: Map<number, number>;
  totalEligma: number;
  totalPulls: number;
  totalCost: number;
  // "Recruit charge" pity counters (new system, post Makoto (Swimsuit) patch).
  // Persist across every banner of the matching track — reset only on actually obtaining that track's pickup.
  chargeNormal: number;
  chargeLimited: number;
}

export interface GachaPools {
  grade3: Student[];
  grade2: Student[];
  grade1: Student[];
  fes: Student[];
}

interface AggregatedStudentData {
  acquiredCount: number;
  totalEleph: number;
  elephCounts: Map<number, number>;
}

// ==========================================
// 2. Utility Functions: Rarity determination and pool generation
// ==========================================

const getStudentGrade = (id: number): 1 | 2 | 3 | 0 => {
  const prefix = Math.floor(id / 1000);
  if (prefix === 10 || prefix === 20) return 3;
  if (prefix === 13 || prefix === 23) {
    if (id == 13004) return 0;
    return 2;
  }
  if (prefix === 16 || prefix === 26) {
    if (id >= 16005 && prefix === 16) return 0;
    if (id >= 26006 && prefix === 26) return 0;
    return 1;
  }
  return 0;
};

/**
 * Generates a map of students' release dates (initial pickup dates) based on banner history.
 * @param bannersMap List of all banners
 * @returns Record<studentId, timestamp>
 */
export const preprocessReleaseDates = (bannersMap: Record<string, BannerPeriod>): Record<number, number> => {
  const releaseMap: Record<number, number> = {};

  // 1. Sort banners chronologically (Past -> Future)
  const sortedBanners = Object.values(bannersMap).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  // 2. Iterate and record the time of first appearance
  sortedBanners.forEach((banner) => {
    const bannerTime = new Date(banner.startTime).getTime();
    banner.pickupStudents.forEach((student) => {
      // Record only students not yet recorded (as the first appearance is the release date)
      if (releaseMap[student.id] === undefined) {
        releaseMap[student.id] = bannerTime;
      }
    });
  });

  return releaseMap;
};

/**
 * Creates a recruitment pool for a specific point in time based on estimated release dates
 */
export const createPoolForBanner = (allStudents: Student[], bannerStartTime: string | Date, releaseDateMap: Record<number, number>): GachaPools => {
  const targetTime = new Date(bannerStartTime).getTime();

  // "Release date is earlier than or equal to banner start date" OR "Not in records, considered an original member (undefined)"
  const validStudents = allStudents.filter((s) => {
    const releaseTime = releaseDateMap[s.id];
    // If not in banner records (undefined), include as an initial character (or include if it is permanent pool data)
    // If 'unreleased characters' need to be strictly distinguished, the undefined handling must be modified
    if (releaseTime === undefined) return true;
    return releaseTime <= targetTime;
  });

  return {
    grade3: validStudents.filter((s) => getStudentGrade(s.id) === 3 && canSpook(s.id, s.isLimited, s.isFes)),
    grade2: validStudents.filter((s) => getStudentGrade(s.id) === 2),
    grade1: validStudents.filter((s) => getStudentGrade(s.id) === 1),
    fes: validStudents.filter((s) => s.isFes && !ARCHIVE_STUDENT_IDS.has(s.id)),
  };
};

// const initializePools = (allStudents: Student[]): GachaPools => {
//   return {
//     grade3: allStudents.filter((s) => getStudentGrade(s.id) === 3 && canSpook(s.id, s.isLimited, s.isFes)),
//     grade2: allStudents.filter((s) => getStudentGrade(s.id) === 2),
//     grade1: allStudents.filter((s) => getStudentGrade(s.id) === 1),
//     fes: allStudents.filter((s) => s.isFes),
//   };
// };

// ==========================================
// 3. Core Logic: Gacha execution and acquisition processing
// ==========================================

export const rollSingle = (
  is10th: boolean,
  isFes: boolean,
  pickupId: number,
  pools: GachaPools,
  bannerPickupIds: number[],
  // Used by the "recruit charge" system: 'pickup' forces the 200-count hard pity (and the 50% hit at
  // the 100-count soft pity); 'random3star' forces the ★3 guarantee for the other 50% at the 100-count soft pity.
  forcedOutcome?: 'pickup' | 'random3star',
): { id: number; grade: number; isPickup: boolean } => {
  const rates = isFes ? RATES.FES : RATES.NORMAL;

  if (forcedOutcome === 'pickup') return { id: pickupId, grade: 3, isPickup: true };

  if (forcedOutcome === 'random3star') {
    // The 100-count soft pity's ★3 table is independent from the normal-pull table, not a rescale of it:
    // each off-banner FES student keeps the same flat per-character rate as a normal pull (FES_SPOOK),
    // and only the leftover mass goes to the regular ★3 pool. Since the checkpoint's pickup/random3star
    // coin-flip is a 50/50 split, the FES share conditional on landing here is 2x the normal-pull constant.
    if (isFes && Math.random() < (RATES.FES.FES_SPOOK || 0) * 2) {
      const excludedIds = [...new Set(bannerPickupIds.flatMap((id) => FES_EXCLUSIONS_BY_PICKUP_ID[id] ?? []))];
      const fesPool = pools.fes.filter((s) => s.id !== pickupId && !excludedIds.includes(s.id));
      const target = fesPool[Math.floor(Math.random() * fesPool.length)];
      if (target) return { id: target.id, grade: 3, isPickup: false };
    }
    const validSpooks = isFes ? pools.grade3.map((v) => v.id).filter((id) => id !== pickupId) : [...new Set([...pools.grade3.map((v) => v.id), ...bannerPickupIds])].filter((id) => id !== pickupId);
    const targetId = validSpooks[Math.floor(Math.random() * validSpooks.length)];
    return { id: targetId || 0, grade: 3, isPickup: false };
  }

  const rng = Math.random();

  if (rng < rates.R3) {
    if (rng < rates.PICKUP) return { id: pickupId, grade: 3, isPickup: true };
    // FES banner: other pickup students belong only to the FES spook pool, not the normal pool.
    // Normal banner: other pickup students can appear as normal spooks. Dedupe — a co-pickup that isn't
    // flagged `limited` is already present in pools.grade3, and without this it would double-count there.
    const validSpooks = isFes ? pools.grade3.map((v) => v.id).filter((id) => id !== pickupId) : [...new Set([...pools.grade3.map((v) => v.id), ...bannerPickupIds])].filter((id) => id !== pickupId);
    if (isFes) {
      const fesSpookChance = rates.PICKUP + (RATES.FES.FES_SPOOK || 0);
      if (rng < fesSpookChance) {
        const excludedIds = [...new Set(bannerPickupIds.flatMap((id) => FES_EXCLUSIONS_BY_PICKUP_ID[id] ?? []))];
        const fesPool = pools.fes.filter((s) => s.id !== pickupId && !excludedIds.includes(s.id));
        const target = fesPool[Math.floor(Math.random() * fesPool.length)] || validSpooks[0];
        return { id: target.id, grade: 3, isPickup: false };
      }
    }
    const targetId = validSpooks[Math.floor(Math.random() * validSpooks.length)];
    return { id: targetId || 0, grade: 3, isPickup: false };
  }
  if (is10th || rng < rates.R3 + rates.R2) {
    const target = pools.grade2[Math.floor(Math.random() * pools.grade2.length)];
    return { id: target.id, grade: 2, isPickup: false };
  }
  const target = pools.grade1[Math.floor(Math.random() * pools.grade1.length)];
  return { id: target.id, grade: 1, isPickup: false };
};

// To handle recall pickups, returns true if it is the first acquisition.
const recordResult = (state: SimState, id: number, grade: number, isPickup: boolean, /*isSpark: boolean = false,*/ isRecall: false | 'ACQUIRED' | 'NOT_ACQUIRED' = false) => {
  // For recall pickups, since there is no PICKUP_NEW_BONUS, a duplicate effect is applied.
  const isDupe = state.owned.has(id);
  if (!isDupe) {
    state.owned.add(id);
    state.acquiredInSim.add(id);
    if (isPickup) {
      // Removed && !isSpark. Elephs are given on first acquisition even via spark. Removed && grade === 3. First acquisition bonuses exist even for non-3rd grade characters.
      const bonus = isRecall == 'ACQUIRED' ? { eligma: 0, eleph: 0 } : REWARDS.PICKUP_NEW_BONUS;
      state.eleph.set(id, (state.eleph.get(id) || 0) + bonus.eleph);
      return true;
    }
    return false;
  } else {
    let reward = { eligma: 0, eleph: 0 };
    if (grade === 3) reward = isPickup ? REWARDS.PICKUP_DUPE : REWARDS.SPOOK_DUPE;
    else if (grade === 2) reward = REWARDS.TWO_STAR_DUPE;
    else if (grade === 1) reward = REWARDS.ONE_STAR_DUPE;
    state.totalEligma += reward.eligma;
    state.eleph.set(id, (state.eleph.get(id) || 0) + reward.eleph);

    return false;
  }
};

// ==========================================
// 4. Banner Simulation Logic
// ==========================================

/**
 * New "recruit charge" pity system (post Makoto (Swimsuit) patch), used when banner.useChargeSystem is true.
 * Two counters are tracked and must not be confused:
 * - state.chargeNormal / state.chargeLimited (SimState, shared across every banner of that track): drives the
 *   100-count soft pity (guaranteed 3-star, 50% Pick-Up) and 200-count hard pity (guaranteed Pick-Up). Resets only on Pick-Up.
 * - pullsThisBanner (local to this call): the per-banner-strategy spending budget (strat.maxHalfCharges, in 100-pull units).
 * "Intentional Spark" (intentionalSpark) has no direct equivalent here—the new system's pity checkpoints are automatic,
 * not opt-in. The closest equivalent is `claimRecruitBonus`/`recruitBonusThreshold`: an opt-in that keeps pulling
 * past other stop conditions when the next "Recruitment Count Bonus" ticket milestone is within reach (see stage 2 below).
 */
export const simulateSingleBannerCharge = (state: SimState, strat: BannerStrategy, banner: BannerPeriod, pools: GachaPools) => {
  let pullsThisBanner = 0;
  let currentFreePulls = banner.freePulls || 0;
  const bannerPickupIds = banner.pickupStudents.map((s) => s.id);
  let recallFlag: false | 'ACQUIRED' | 'NOT_ACQUIRED' = banner.isRecall ? 'NOT_ACQUIRED' : false;
  const chargeKey: 'chargeNormal' | 'chargeLimited' = banner.isLimitedBanner ? 'chargeLimited' : 'chargeNormal';
  const maxHalfCharges = strat.maxHalfCharges ?? 2;
  const claimRecruitBonus = strat.claimRecruitBonus ?? false;
  const recruitBonusThreshold = strat.recruitBonusThreshold ?? 10;

  const targets = Object.values(strat.studentConfigs)
    .filter((c) => c.mode !== 'skip')
    .sort((a, b) => a.priority - b.priority);

  const pullTenWithCharge = (targetId: number) => {
    for (let i = 0; i < 10; i++) {
      state[chargeKey] += 1;
      const forced = state[chargeKey] === 200 ? 'pickup' : state[chargeKey] === 100 ? (Math.random() < 0.5 ? 'pickup' : 'random3star') : undefined;
      const result = rollSingle(i === 9, banner.isFes, targetId, pools, bannerPickupIds, forced);
      if (recordResult(state, result.id, result.grade, result.isPickup, recallFlag) && recallFlag === 'NOT_ACQUIRED') {
        recallFlag = 'ACQUIRED';
      }
      // Obtaining the pickup resets the charge immediately — remaining pulls in this 10-pull recount from 1.
      if (result.isPickup) state[chargeKey] = 0;
    }
  };

  // 1. Simulation per target
  for (const targetConfig of targets) {
    if (state.owned.has(targetConfig.studentId)) continue;

    const currentTargetId = targetConfig.studentId;
    // 'opportunistic' under the new system spends a dedicated pull budget on this target (opportunisticThreshold
    // pulls), rather than gating on distance to the shared charge counter's next checkpoint — that distance is no
    // longer a predictable per-banner quantity, since the counter persists indefinitely until any pickup lands.
    let pullsForThisTarget = 0;

    while (true) {
      const isObtained = state.owned.has(currentTargetId);
      const hasFree = currentFreePulls >= 10;
      if (!hasFree) {
        if (Math.floor(pullsThisBanner / 100) >= maxHalfCharges) break;
        if (targetConfig.mode === 'must' && isObtained) break;
        if (targetConfig.mode === 'opportunistic') {
          if (isObtained) break;
          if (pullsForThisTarget >= targetConfig.opportunisticThreshold) break;
        }
      }

      state.totalPulls += 10;
      pullsThisBanner += 10;
      pullsForThisTarget += 10;
      if (hasFree) currentFreePulls -= 10;
      else state.totalCost += 1200;

      // "Recruitment Count Bonus" — only the ticket/Eligma reward types are tracked; the earned
      // ticket directly offsets pyroxene cost, eligma folds straight into the existing totalEligma stat.
      const countReward = getRecruitCountReward(pullsThisBanner);
      if (countReward.ticket > 0) state.totalCost -= countReward.ticket * 1200;
      if (countReward.eligma > 0) state.totalEligma += countReward.eligma;

      pullTenWithCharge(currentTargetId);

      if (!hasFree && state.owned.has(currentTargetId)) break;
    }
  }

  // 2. Minimum pull guarantee + spend any remaining free pulls (even with no target set, so their charge
  // progress — which persists into later banners via state[chargeKey] — isn't wasted).
  const minPulls = strat.minPulls || 0;
  // Re-evaluated each iteration: goes false the instant a milestone is claimed (the next one is always
  // >= 20 pulls further, since consecutive entries in the reward table are never closer than 20 apart)
  // or once thresholds run out past 370. Bounded — no infinite loop is possible. A threshold of 0 can
  // never satisfy `next - pullsThisBanner <= 0` (the gap is always >= 10), so it behaves as disabled;
  // this needs no special case since any pull that lands exactly on a threshold already claims it for free.
  const isNearRecruitBonus = () => {
    if (!claimRecruitBonus) return false;
    const next = getNextTicketThreshold(pullsThisBanner);
    return next !== undefined && next - pullsThisBanner <= recruitBonusThreshold;
  };
  while ((pullsThisBanner < minPulls || currentFreePulls >= 10 || isNearRecruitBonus()) && Math.floor(pullsThisBanner / 100) < maxHalfCharges) {
    const hasFree = currentFreePulls >= 10;
    state.totalPulls += 10;
    pullsThisBanner += 10;
    if (hasFree) currentFreePulls -= 10;
    else state.totalCost += 1200;

    const countReward = getRecruitCountReward(pullsThisBanner);
    if (countReward.ticket > 0) state.totalCost -= countReward.ticket * 1200;
    if (countReward.eligma > 0) state.totalEligma += countReward.eligma;

    const fillerTargetId = bannerPickupIds[0] || (targets[0] ? targets[0].studentId : 0);
    pullTenWithCharge(fillerTargetId);
  }

  // 3. Spark exchange does not apply under the new system — the 200-count hard pity above already
  // guarantees the pickup automatically as a real roll, so there is nothing left to exchange.
};

const simulateSingleBanner = (state: SimState, strat: BannerStrategy, banner: BannerPeriod, pools: GachaPools) => {
  if (banner.useChargeSystem) {
    simulateSingleBannerCharge(state, strat, banner, pools);
    return;
  }
  let sparkPoints = 0;
  let currentFreePulls = banner.freePulls || 0;
  const bannerPickupIds = banner.pickupStudents.map((s) => s.id);
  let recallFlag: false | 'ACQUIRED' | 'NOT_ACQUIRED' = banner.isRecall ? 'NOT_ACQUIRED' : false;
  const pickuphistory = [];

  const targets = Object.values(strat.studentConfigs)
    .filter((c) => c.mode !== 'skip')
    .sort((a, b) => a.priority - b.priority);
  const allTargets = [...targets];

  // 1. Simulation per target
  for (const targetConfig of targets) {
    if (state.owned.has(targetConfig.studentId) && !targetConfig.intentionalSpark) continue;

    // Number of targets not yet acquired
    const remainTargetCnt = targets.filter((t) => !state.owned.has(t.studentId)).length;
    // If remaining targets can be exchanged with spark points, proceed to next
    if (Math.floor(sparkPoints / 200) >= remainTargetCnt) break;

    const currentTargetId = targetConfig.studentId;

    while (true) {
      const isObtained = state.owned.has(currentTargetId);
      const hasFree = currentFreePulls >= 10;
      if (!hasFree) {
        // Number of targets not yet acquired
        const remainTargetCnt = targets.filter((t) => !state.owned.has(t.studentId)).length;
        if (Math.floor(sparkPoints / 200) >= remainTargetCnt) break;

        if (Math.floor(sparkPoints / 200) >= strat.maxSparks) break;
        if (targetConfig.mode === 'must' && isObtained) break;
        if (targetConfig.mode === 'opportunistic') {
          if (isObtained) break;
          if (200 - (sparkPoints % 200) > targetConfig.opportunisticThreshold) break;
        }
        if (targetConfig.intentionalSpark && isObtained) {
          if (200 - (sparkPoints % 200) > (targetConfig.intentionalSparkThreshold || 20)) break;
        }
      }

      state.totalPulls += 10;
      sparkPoints += 10;
      if (hasFree) currentFreePulls -= 10;
      else state.totalCost += 1200;

      for (let i = 0; i < 10; i++) {
        const result = rollSingle(i == 9, banner.isFes, currentTargetId, pools, bannerPickupIds);
        pickuphistory.push({ currentTargetId, result });
        if (recordResult(state, result.id, result.grade, result.isPickup, recallFlag) && recallFlag == 'NOT_ACQUIRED') {
          recallFlag = 'ACQUIRED';
        }
        // if(currentTargetId==10021 && result.isPickup) console.log('result.isPickup', state.eleph.get(10021), result, )
      }

      if (!hasFree && state.owned.has(currentTargetId) && !targetConfig.intentionalSpark) break;
      // if (!hasFree && sparkPoints % 200 === 0 && !state.owned.has(currentTargetId)) break;
    }
  }

  // 2. Minimum pull guarantee
  const minPulls = strat.minPulls || 0;
  while (sparkPoints < minPulls && Math.floor(sparkPoints / 200) < strat.maxSparks) {
    const hasFree = currentFreePulls >= 10;
    state.totalPulls += 10;
    sparkPoints += 10;
    if (hasFree) currentFreePulls -= 10;
    else state.totalCost += 1200;

    const fillerTargetId = bannerPickupIds[0] || (targets[0] ? targets[0].studentId : 0);
    for (let i = 0; i < 10; i++) {
      const result = rollSingle(i === 9, banner.isFes, fillerTargetId, pools, bannerPickupIds);
      if (recordResult(state, result.id, result.grade, result.isPickup, recallFlag) && recallFlag == 'NOT_ACQUIRED') {
        recallFlag = 'ACQUIRED';
      }
    }
  }

  // 3. Spark exchange
  const availableSparks = Math.floor(sparkPoints / 200);
  for (let i = 0; i < availableSparks; i++) {
    const sparkTarget =
      allTargets.find((t) => t.mode === 'must' && !state.owned.has(t.studentId)) ||
      allTargets.find((t) => t.mode === 'opportunistic' && !state.owned.has(t.studentId)) ||
      allTargets.find((t) => t.intentionalSpark) ||
      allTargets.find((_t) => true);

    if (sparkTarget) {
      if (recordResult(state, sparkTarget.studentId, 3, true, recallFlag) && recallFlag == 'NOT_ACQUIRED') {
        recallFlag = 'ACQUIRED';
      }
    }
  }
};

// ==========================================
// 5. Distribution + Result Assembly (exported for worker use)
// ==========================================

export const createDistribution = (data: number[], binSize: number, total?: number): DistributionData[] => {
  const sortedData = [...data].sort((a, b) => a - b);
  if (sortedData.length === 0) return [];
  const n = total ?? sortedData.length;
  const maxVal = sortedData[sortedData.length - 1];
  const binCount = Math.floor(maxVal / binSize) + 2;
  const dist: DistributionData[] = [];
  let cumulativeCount = 0;
  let idx = 0;
  for (let i = 0; i < binCount; i++) {
    const end = (i + 1) * binSize;
    let count = 0;
    while (idx < sortedData.length && sortedData[idx] < end) {
      count++;
      idx++;
    }
    cumulativeCount += count;
    dist.push({ binStart: i * binSize, binEnd: end, count, pdf: (count / n) * 100, cdf: (cumulativeCount / n) * 100 });
  }
  return dist;
};

const createExactAmountDistribution = (data: number[], total: number): Array<{ amount: number; probability: number }> => {
  if (total <= 0) return [];
  const counts: Record<number, number> = {};
  for (const amount of data) counts[amount] = (counts[amount] ?? 0) + 1;
  const observed = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (observed < total) counts[0] = (counts[0] ?? 0) + (total - observed);
  return Object.entries(counts)
    .map(([amount, count]) => ({ amount: Number(amount), probability: (100 * count) / total }))
    .filter((entry) => entry.probability > 0)
    .sort((a, b) => a.amount - b.amount);
};

export interface SimRawAccumulator {
  resultsPulls: number[];
  resultsCost: number[];
  resultsEligma: number[];
  bannerCumulativeCosts: Record<string, number[]>;
  bannerCumulativeEligma: Record<string, number[]>;
  bannerStatsSum: Record<string, { pulls: number; cost: number }>;
  studentAcquired: Record<number, number>;
  studentElephTotal: Record<number, number>;
  studentElephDist: Record<number, Record<number, number>>;
  /** bannerId → studentId → incremental_eleph_amount → count of simulations */
  bannerStudentElephDist: Record<string, Record<number, Record<number, number>>>;
  totalEligmaSum: number;
  successCount: number;
}

export interface WasmPayload {
  strategiesJson: string;
  bannerPoolsJson: string;
  activeBannerIds: string[];
}

export const buildWasmPayload = (strategies: BannerStrategy[], bannersMap: Record<string, BannerPeriod>, allStudents: Student[]): WasmPayload => {
  const activeStrategies = strategies.filter((s) => s.isActive);
  const releaseDateMap = preprocessReleaseDates(bannersMap);

  const bannerPoolsForWasm: Record<
    string,
    {
      isFes: boolean;
      isRecall: boolean;
      freePulls: number;
      grade3: number[];
      grade2: number[];
      grade1: number[];
      fes: number[];
      bannerPickupIds: number[];
      fesExcludedIds: number[];
    }
  > = {};

  for (const strat of activeStrategies) {
    const banner = bannersMap[strat.bannerId];
    if (!banner) continue;
    const pools = createPoolForBanner(allStudents, banner.startTime, releaseDateMap);
    const pickupIds = banner.pickupStudents.map((s) => s.id);
    const fesExcludedIds = [...new Set(pickupIds.flatMap((id) => FES_EXCLUSIONS_BY_PICKUP_ID[id] ?? []))];
    bannerPoolsForWasm[strat.bannerId] = {
      isFes: banner.isFes,
      isRecall: banner.isRecall ?? false,
      freePulls: banner.freePulls ?? 0,
      grade3: pools.grade3.map((s) => s.id),
      grade2: pools.grade2.map((s) => s.id),
      grade1: pools.grade1.map((s) => s.id),
      fes: pools.fes.map((s) => s.id),
      bannerPickupIds: pickupIds,
      fesExcludedIds,
    };
  }

  const strategiesForWasm = activeStrategies.map((s) => ({
    bannerId: s.bannerId,
    maxSparks: s.maxSparks ?? 1,
    minPulls: s.minPulls ?? 0,
    targets: Object.values(s.studentConfigs)
      .filter((c) => c.mode !== 'skip')
      .sort((a, b) => a.priority - b.priority)
      .map((c) => ({
        studentId: c.studentId,
        mode: c.mode === 'must' ? 'must' : 'opportunistic',
        opportunisticThreshold: c.opportunisticThreshold ?? 50,
        intentionalSpark: c.intentionalSpark ?? false,
        intentionalSparkThreshold: c.intentionalSparkThreshold ?? 20,
      })),
  }));

  return {
    strategiesJson: JSON.stringify(strategiesForWasm),
    bannerPoolsJson: JSON.stringify(bannerPoolsForWasm),
    activeBannerIds: activeStrategies.map((s) => s.bannerId),
  };
};

export const mergeSimAccumulator = (base: SimRawAccumulator, other: SimRawAccumulator): void => {
  for (let i = 0; i < other.resultsCost.length; i++) base.resultsCost.push(other.resultsCost[i]);
  for (let i = 0; i < other.resultsPulls.length; i++) base.resultsPulls.push(other.resultsPulls[i]);
  if (other.resultsEligma) for (let i = 0; i < other.resultsEligma.length; i++) base.resultsEligma.push(other.resultsEligma[i]);
  base.successCount += other.successCount;
  base.totalEligmaSum += other.totalEligmaSum;
  for (const [bid, costs] of Object.entries(other.bannerCumulativeCosts)) {
    if (!base.bannerCumulativeCosts[bid]) base.bannerCumulativeCosts[bid] = [];
    for (let i = 0; i < costs.length; i++) base.bannerCumulativeCosts[bid].push(costs[i]);
  }
  for (const [bid, eligma] of Object.entries(other.bannerCumulativeEligma)) {
    if (!base.bannerCumulativeEligma[bid]) base.bannerCumulativeEligma[bid] = [];
    for (let i = 0; i < eligma.length; i++) base.bannerCumulativeEligma[bid].push(eligma[i]);
  }
  for (const [bid, s] of Object.entries(other.bannerStatsSum)) {
    if (base.bannerStatsSum[bid]) {
      base.bannerStatsSum[bid].pulls += s.pulls;
      base.bannerStatsSum[bid].cost += s.cost;
    } else {
      base.bannerStatsSum[bid] = { pulls: s.pulls, cost: s.cost };
    }
  }
  for (const [idStr, cnt] of Object.entries(other.studentAcquired)) {
    const id = Number(idStr);
    base.studentAcquired[id] = (base.studentAcquired[id] ?? 0) + cnt;
  }
  for (const [idStr, total] of Object.entries(other.studentElephTotal)) {
    const id = Number(idStr);
    base.studentElephTotal[id] = (base.studentElephTotal[id] ?? 0) + total;
  }
  for (const [idStr, dist] of Object.entries(other.studentElephDist)) {
    const id = Number(idStr);
    if (!base.studentElephDist[id]) base.studentElephDist[id] = {};
    for (const [amtStr, cnt] of Object.entries(dist)) {
      const amt = Number(amtStr);
      base.studentElephDist[id][amt] = (base.studentElephDist[id][amt] ?? 0) + cnt;
    }
  }
  for (const [bid, studentDists] of Object.entries(other.bannerStudentElephDist ?? {})) {
    if (!base.bannerStudentElephDist[bid]) base.bannerStudentElephDist[bid] = {};
    for (const [sidStr, dist] of Object.entries(studentDists)) {
      const sid = Number(sidStr);
      if (!base.bannerStudentElephDist[bid][sid]) base.bannerStudentElephDist[bid][sid] = {};
      for (const [amtStr, cnt] of Object.entries(dist)) {
        const amt = Number(amtStr);
        base.bannerStudentElephDist[bid][sid][amt] = (base.bannerStudentElephDist[bid][sid][amt] ?? 0) + cnt;
      }
    }
  }
};

export const buildGlobalResultFromRaw = (acc: SimRawAccumulator, simCount: number, allStudents: Student[], bannersMap: Record<string, BannerPeriod>): GlobalAggregatedResult => {
  const distPulls = createDistribution(acc.resultsPulls, 10, simCount);
  const distCost = createDistribution(acc.resultsCost, 1200, simCount);
  const distEligma = acc.resultsEligma?.length ? createDistribution(acc.resultsEligma, 10, simCount) : [];
  const distEligmaExact = acc.resultsEligma?.length ? createExactAmountDistribution(acc.resultsEligma, simCount) : [];

  const distCostMap: Record<string, DistributionData[]> = {};
  for (const [bannerId, costs] of Object.entries(acc.bannerCumulativeCosts)) {
    distCostMap[bannerId] = createDistribution(costs, 1200, simCount);
  }

  // Per-banner incremental eligma distributions (sorted by date for correct subtraction)
  const distEligmaMap: Record<string, DistributionData[]> = {};
  const distEligmaExactMap: Record<string, Array<{ amount: number; probability: number }>> = {};
  const sortedBannerIds = Object.keys(acc.bannerCumulativeEligma).sort((a, b) => {
    const ta = new Date(bannersMap[a]?.startTime ?? 0).getTime();
    const tb = new Date(bannersMap[b]?.startTime ?? 0).getTime();
    return ta - tb;
  });
  let prevCumEligma: number[] = [];
  for (const bid of sortedBannerIds) {
    const cumulative = acc.bannerCumulativeEligma[bid] ?? [];
    const incremental = cumulative.map((v, i) => v - (prevCumEligma[i] ?? 0));
    distEligmaMap[bid] = createDistribution(incremental, 10, simCount);
    distEligmaExactMap[bid] = createExactAmountDistribution(incremental, simCount);
    prevCumEligma = cumulative;
  }

  const bannerStats = Object.keys(acc.bannerStatsSum)
    .map((bid) => {
      const banner = bannersMap[bid];
      if (!banner) return null;
      return {
        bannerId: bid,
        bannerLabel: banner.pickupStudents.map((s) => s.name).join('/'),
        startTime: banner.startTime,
        avgPulls: simCount > 0 ? acc.bannerStatsSum[bid].pulls / simCount : 0,
        avgCost: simCount > 0 ? acc.bannerStatsSum[bid].cost / simCount : 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const studentStats: Record<number, StudentSimulationStat> = {};
  for (const student of allStudents) {
    const id = student.id;
    const acquiredCount = acc.studentAcquired[id] ?? 0;
    const totalEleph = acc.studentElephTotal[id] ?? 0;
    const elephCountsRaw = acc.studentElephDist[id] ?? {};

    const elephDist = Object.entries(elephCountsRaw)
      .map(([amt, cnt]) => ({ amount: Number(amt), probability: (100 * cnt) / simCount }))
      .sort((a, b) => a.amount - b.amount);

    if (!elephCountsRaw[0]) elephDist.unshift({ amount: 0, probability: 0 });

    const totalCnt = Object.values(elephCountsRaw).reduce((s, c) => s + c, 0);
    elephDist[0].probability += (100 * (simCount - totalCnt)) / simCount;

    studentStats[id] = {
      studentId: id,
      name: student.name,
      isLimited: student.isLimited,
      isFes: student.isFes,
      obtainRate: simCount > 0 ? (acquiredCount / simCount) * 100 : 0,
      avgEleph: simCount > 0 ? totalEleph / simCount : 0,
      elephDistribution: elephDist,
    };
  }

  // Per-banner per-student incremental eleph distributions
  const distStudentElephMap: Record<string, Record<number, Array<{ amount: number; probability: number }>>> = {};
  for (const [bannerId, studentDists] of Object.entries(acc.bannerStudentElephDist ?? {})) {
    distStudentElephMap[bannerId] = {};
    for (const [sidStr, elephCounts] of Object.entries(studentDists)) {
      const sid = Number(sidStr);
      const nonZeroCnt = Object.values(elephCounts).reduce((s, c) => s + c, 0);
      const dist: Array<{ amount: number; probability: number }> = [
        { amount: 0, probability: (100 * (simCount - nonZeroCnt)) / simCount },
        ...Object.entries(elephCounts).map(([amt, cnt]) => ({
          amount: Number(amt),
          probability: (100 * cnt) / simCount,
        })),
      ];
      dist.sort((a, b) => a.amount - b.amount);
      if (dist.some((e) => e.amount > 0 && e.probability > 0)) {
        distStudentElephMap[bannerId][sid] = dist;
      }
    }
  }

  return {
    simCount,
    successRate: simCount > 0 ? (acc.successCount / simCount) * 100 : 0,
    avgTotalPulls: simCount > 0 ? acc.resultsPulls.reduce((a, b) => a + b, 0) / simCount : 0,
    avgTotalCost: simCount > 0 ? acc.resultsCost.reduce((a, b) => a + b, 0) / simCount : 0,
    avgTotalEligma: simCount > 0 ? acc.totalEligmaSum / simCount : 0,
    distPulls,
    distCost,
    distEligma,
    distEligmaExact,
    distCostMap,
    distEligmaMap,
    distEligmaExactMap,
    bannerStats,
    studentStats,
    distStudentElephMap,
  };
};

// ==========================================
// 6. Main Entry Point (runGlobalSimulation)
// ==========================================

export const runGlobalSimulation = (
  strategies: BannerStrategy[],
  bannersMap: Record<string, BannerPeriod>,
  allStudents: Student[],
  config: SimulationConfig,
  initialOwnedIds: number[] = [],
): GlobalAggregatedResult => {
  const { simCount } = config;
  // const pools = initializePools(allStudents);
  const releaseDateMap = preprocessReleaseDates(bannersMap);
  const bannerPoolsMap: Record<string, GachaPools> = {};

  strategies.forEach((strat) => {
    if (!strat.isActive) return;
    const banner = bannersMap[strat.bannerId];
    if (banner) {
      // Generate pool based on the start time of the relevant banner
      bannerPoolsMap[strat.bannerId] = createPoolForBanner(allStudents, banner.startTime, releaseDateMap);
    }
  });

  // 1. Variables for aggregating overall statistics
  const resultsPulls: number[] = [];
  const resultsCost: number[] = [];
  const resultsEligma: number[] = [];
  let totalEligmaSum = 0;
  let successCount = 0;

  // 2. For tracking cumulative data per banner
  // key: bannerId, value: array of cumulative costs per simulation
  const bannerCumulativeCosts: Record<string, number[]> = {};
  const bannerCumulativeEligma: Record<string, number[]> = {};
  strategies.forEach((s) => {
    if (s.isActive) {
      bannerCumulativeCosts[s.bannerId] = [];
      bannerCumulativeEligma[s.bannerId] = [];
    }
  });

  const bannerStatsSum: Record<string, { pulls: number; cost: number }> = {};
  strategies.forEach((s) => {
    bannerStatsSum[s.bannerId] = { pulls: 0, cost: 0 };
  });

  const bannerStudentElephDist: Record<string, Record<number, Record<number, number>>> = {};
  strategies.forEach((s) => {
    if (s.isActive) bannerStudentElephDist[s.bannerId] = {};
  });

  const studentRawStats: Record<number, AggregatedStudentData> = {};
  allStudents.forEach((s) => {
    studentRawStats[s.id] = { acquiredCount: 0, totalEleph: 0, elephCounts: new Map() };
  });

  // ==========================
  // Simulation loop (N times)
  // ==========================
  for (let i = 0; i < simCount; i++) {
    const state: SimState = {
      owned: new Set(initialOwnedIds),
      acquiredInSim: new Set(),
      eleph: new Map(),
      totalEligma: 0,
      totalPulls: 0,
      totalCost: 0,
      chargeNormal: 0,
      chargeLimited: 0,
    };

    // Execution by strategy
    for (const strat of strategies) {
      if (!strat.isActive) continue;
      const banner = bannersMap[strat.bannerId];
      if (!banner) continue;

      const currentBannerPool = bannerPoolsMap[strat.bannerId];

      // If pool data is missing (exception), fallback to all students or handle error
      if (!currentBannerPool) {
        console.error(`Pool not found for banner ${strat.bannerId}`);
        continue;
      }

      const prevPulls = state.totalPulls;
      const prevCost = state.totalCost;
      const prevEleph = new Map(state.eleph);

      simulateSingleBanner(state, strat, banner, currentBannerPool);

      // Accumulate statistics
      if (bannerStatsSum[strat.bannerId]) {
        bannerStatsSum[strat.bannerId].pulls += state.totalPulls - prevPulls;
        bannerStatsSum[strat.bannerId].cost += state.totalCost - prevCost;
      }

      // Per-banner per-student incremental eleph tracking
      const bannerElephDist = bannerStudentElephDist[strat.bannerId];
      if (bannerElephDist) {
        for (const [id, curr] of state.eleph) {
          const prev = prevEleph.get(id) ?? 0;
          const incr = curr - prev;
          if (incr > 0) {
            if (!bannerElephDist[id]) bannerElephDist[id] = {};
            bannerElephDist[id][incr] = (bannerElephDist[id][incr] ?? 0) + 1;
          }
        }
      }

      // Add cumulative cost and eligma up to this point to the relevant banner statistics
      if (bannerCumulativeCosts[strat.bannerId]) {
        bannerCumulativeCosts[strat.bannerId].push(state.totalCost);
      }
      if (bannerCumulativeEligma[strat.bannerId]) {
        bannerCumulativeEligma[strat.bannerId].push(state.totalEligma);
      }
    }

    resultsPulls.push(state.totalPulls);
    resultsCost.push(state.totalCost);
    resultsEligma.push(state.totalEligma);
    totalEligmaSum += state.totalEligma;

    let isSuccess = true;
    for (const strat of strategies) {
      if (!strat.isActive) continue;
      for (const conf of Object.values(strat.studentConfigs)) {
        if (conf.mode === 'must' && !state.owned.has(conf.studentId)) {
          isSuccess = false;
          break;
        }
      }
      if (!isSuccess) break;
    }
    if (isSuccess) successCount++;

    state.acquiredInSim.forEach((id) => {
      if (studentRawStats[id]) studentRawStats[id].acquiredCount++;
    });
    state.eleph.forEach((amount, id) => {
      if (studentRawStats[id]) {
        studentRawStats[id].totalEleph += amount;
        const currentCount = studentRawStats[id].elephCounts.get(amount) || 0;
        studentRawStats[id].elephCounts.set(amount, currentCount + 1);
      }
    });
  }

  return buildGlobalResultFromRaw(
    {
      resultsPulls,
      resultsCost,
      resultsEligma,
      bannerCumulativeCosts,
      bannerCumulativeEligma,
      bannerStatsSum,
      studentAcquired: Object.fromEntries(Object.entries(studentRawStats).map(([id, r]) => [Number(id), r.acquiredCount])),
      studentElephTotal: Object.fromEntries(Object.entries(studentRawStats).map(([id, r]) => [Number(id), r.totalEleph])),
      studentElephDist: Object.fromEntries(Object.entries(studentRawStats).map(([id, r]) => [Number(id), Object.fromEntries(r.elephCounts)])),
      bannerStudentElephDist,
      totalEligmaSum,
      successCount,
    },
    simCount,
    allStudents,
    bannersMap,
  );
};
