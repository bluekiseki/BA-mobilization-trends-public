// app/utils/gachaEngine.ts
import type { BannerPeriod, BannerStrategy, Student } from '~/types/gacha';
import { canSpook } from './gachaRules';

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

const REWARDS = {
  PICKUP_DUPE: { eligma: 50, eleph: 100 },
  SPOOK_DUPE: { eligma: 50, eleph: 30 },
  TWO_STAR_DUPE: { eligma: 10, eleph: 5 },
  ONE_STAR_DUPE: { eligma: 1, eleph: 1 },
  PICKUP_NEW_BONUS: { eligma: 0, eleph: 100 },
};

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
  // Cumulative cost distribution per banner (Key: BannerID)
  distCostMap: Record<string, DistributionData[]>;
  bannerStats: {
    bannerId: string;
    bannerLabel: string;
    avgPulls: number;
    avgCost: number;
  }[];
  studentStats: Record<number, StudentSimulationStat>;
}

// For internal simulation state management
interface SimState {
  owned: Set<number>;
  acquiredInSim: Set<number>;
  eleph: Map<number, number>;
  totalEligma: number;
  totalPulls: number;
  totalCost: number;
}

interface GachaPools {
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
const preprocessReleaseDates = (bannersMap: Record<string, BannerPeriod>): Record<number, number> => {
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
const createPoolForBanner = (allStudents: Student[], bannerStartTime: string | Date, releaseDateMap: Record<number, number>): GachaPools => {
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
    fes: validStudents.filter((s) => s.isFes),
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

const rollSingle = (is10th: boolean, isFes: boolean, pickupId: number, pools: GachaPools, bannerPickupIds: number[]): { id: number; grade: number; isPickup: boolean } => {
  const rng = Math.random();
  const rates = isFes ? RATES.FES : RATES.NORMAL;

  if (rng < rates.R3) {
    if (rng < rates.PICKUP) return { id: pickupId, grade: 3, isPickup: true };
    // In general cases, the permanent pool includes everyone except the current pickup student.
    // let validSpooks = pools.grade3.filter((s) => pickupId != s.id);
    let validSpooks = [...pools.grade3.map((v) => v.id), ...bannerPickupIds].filter((id) => pickupId != id);
    if (isFes) {
      // In FES cases, FES characters do not appear in the permanent pool.
      let validSpooks = pools.grade3.filter((s) => !bannerPickupIds.includes(s.id));
      const fesSpookChance = rates.PICKUP + (RATES.FES.FES_SPOOK || 0);
      if (rng < fesSpookChance) {
        const fesPool = pools.fes.filter((s) => s.id !== pickupId);
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
const recordResult = (state: SimState, id: number, grade: number, isPickup: boolean, isSpark: boolean = false, isRecall: false | 'ACQUIRED' | 'NOT_ACQUIRED' = false) => {
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

const simulateSingleBanner = (state: SimState, strat: BannerStrategy, banner: BannerPeriod, pools: GachaPools) => {
  let sparkPoints = 0;
  let currentFreePulls = banner.freePulls || 0;
  const bannerPickupIds = banner.pickupStudents.map((s) => s.id);
  let recallFlag: false | 'ACQUIRED' | 'NOT_ACQUIRED' = banner.isRecall ? 'NOT_ACQUIRED' : false;
  let pickuphistory = [];

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
        if (recordResult(state, result.id, result.grade, result.isPickup, false, recallFlag) && recallFlag == 'NOT_ACQUIRED') {
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
      if (recordResult(state, result.id, result.grade, result.isPickup, false, recallFlag) && recallFlag == 'NOT_ACQUIRED') {
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
      allTargets.find((t) => true);

    if (sparkTarget) {
      if (recordResult(state, sparkTarget.studentId, 3, true, true, recallFlag) && recallFlag == 'NOT_ACQUIRED') {
        recallFlag = 'ACQUIRED';
      }
    }
  }
};

// ==========================================
// 5. Main Entry Point (runGlobalSimulation)
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
  let totalEligmaSum = 0;
  let successCount = 0;

  // 2. For tracking cumulative data per banner
  // key: bannerId, value: array of cumulative costs per simulation
  const bannerCumulativeCosts: Record<string, number[]> = {};
  strategies.forEach((s) => {
    if (s.isActive) {
      bannerCumulativeCosts[s.bannerId] = [];
    }
  });

  const bannerStatsSum: Record<string, { pulls: number; cost: number }> = {};
  strategies.forEach((s) => {
    bannerStatsSum[s.bannerId] = { pulls: 0, cost: 0 };
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

      simulateSingleBanner(state, strat, banner, currentBannerPool);

      // Accumulate statistics
      if (bannerStatsSum[strat.bannerId]) {
        bannerStatsSum[strat.bannerId].pulls += state.totalPulls - prevPulls;
        bannerStatsSum[strat.bannerId].cost += state.totalCost - prevCost;
      }

      // Add cumulative cost up to this point to the relevant banner statistics
      // (Total Pyroxenes consumed at the end of this banner)
      if (bannerCumulativeCosts[strat.bannerId]) {
        bannerCumulativeCosts[strat.bannerId].push(state.totalCost);
      }
    }

    resultsPulls.push(state.totalPulls);
    resultsCost.push(state.totalCost);
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

  // ==========================================
  // 6. Result data processing (including distribution per banner)
  // ==========================================

  // Helper function for generating distributions
  const createDistribution = (data: number[], binSize: number): DistributionData[] => {
    const sortedData = [...data].sort((a, b) => a - b);
    if (sortedData.length === 0) return [];

    // Generate bins from 0 to max value
    const maxVal = sortedData[sortedData.length - 1];
    const binCount = Math.floor(maxVal / binSize) + 2;

    const dist: DistributionData[] = [];
    let cumulativeCount = 0;

    for (let i = 0; i < binCount; i++) {
      const start = i * binSize;
      const end = start + binSize;

      // Count of data points in the current interval
      // (For performance, index sweeping could replace filtering, but filter is fine since binCount is low)
      const count = sortedData.filter((p) => p >= start && p < end).length;
      cumulativeCount += count;

      dist.push({
        binStart: start,
        binEnd: end,
        count,
        pdf: (count / simCount) * 100,
        cdf: (cumulativeCount / simCount) * 100,
      });
    }
    return dist;
  };

  const distPulls = createDistribution(resultsPulls, 10);
  const distCost = createDistribution(resultsCost, 1200);

  // Generate cumulative cost distribution per banner
  const distCostMap: Record<string, DistributionData[]> = {};
  for (const [bannerId, costs] of Object.entries(bannerCumulativeCosts)) {
    // Generate distribution in units of 1200 Pyroxenes
    distCostMap[bannerId] = createDistribution(costs, 1200);
  }

  const bannerStats = Object.keys(bannerStatsSum)
    .map((bid) => {
      const banner = bannersMap[bid];
      if (!banner) return null;
      return {
        bannerId: bid,
        bannerLabel: banner.pickupStudents.map((s) => s.name).join('/'),
        avgPulls: bannerStatsSum[bid].pulls / simCount,
        avgCost: bannerStatsSum[bid].cost / simCount,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const studentStats: Record<number, StudentSimulationStat> = {};
  for (const [idStr, raw] of Object.entries(studentRawStats)) {
    const id = Number(idStr);
    // if (id==20050) console.log('idStr, raw', idStr, raw)
    const student = allStudents.find((s) => s.id === id);
    if (!student) continue;

    const elephDist = Array.from(raw.elephCounts.entries())
      .map(([amt, cnt]) => ({ amount: amt, probability: (100 * cnt) / simCount }))
      .sort((a, b) => a.amount - b.amount);

    // Add amt == 0 entry if it doesn't exist
    if (!raw.elephCounts.has(0)) elephDist.unshift({ amount: 0, probability: 0 });

    // Probability sum correction
    // const totalProbability = elephDist.reduce((sum, item) => sum + item.probability, 0);
    const totalCnt = Array.from(raw.elephCounts.values()).reduce((sum, cnt) => sum + cnt, 0);
    // if (id==20050)  console.log({ simCount, totalCnt }, elephDist[0].probability, (simCount - totalCnt) / simCount)
    elephDist[0].probability += (100 * (simCount - totalCnt)) / simCount;

    studentStats[id] = {
      studentId: id,
      name: student.name,
      isLimited: student.isLimited,
      isFes: student.isFes,
      obtainRate: (raw.acquiredCount / simCount) * 100,
      avgEleph: raw.totalEleph / simCount,
      elephDistribution: elephDist,
    };
  }

  return {
    simCount,
    successRate: (successCount / simCount) * 100,
    avgTotalPulls: resultsPulls.reduce((a, b) => a + b, 0) / simCount,
    avgTotalCost: resultsCost.reduce((a, b) => a + b, 0) / simCount,
    avgTotalEligma: totalEligmaSum / simCount,
    distPulls,
    distCost,
    distCostMap,
    bannerStats,
    studentStats,
  };
};
