// app/utils/gachaEngine.ts
import type { BannerPeriod, BannerStrategy, Student } from '~/types/gacha';
import { canSpook, FES_EXCLUSIONS_BY_PICKUP_ID, ARCHIVE_STUDENT_IDS, getRecruitCountReward, getNextTicketThreshold, getRecruitBonusTicketExpiry } from './gachaRules';
import type { TicketBatch } from './pyroxeneCalc';

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
  /** Cumulative net cost per checkpoint (bannerId or "inf") — query with .dist(checkpointId)/.avg(checkpointId), e.g. meanFromDist(result.cost.dist('inf')) for what used to be avgTotalCost. */
  cost: SimMetricAccumulator;
  /** Incremental (just-that-banner, not cumulative) net cost — real banners only, no "inf" checkpoint. */
  costIncremental: SimMetricAccumulator;
  /** Net cost crediting only gacha-earned ticket value — for the distribution chart's ticket-included cost view. Query via ticketCreditedDist(result.costWithGachaTickets, result.cost, checkpointId). */
  costWithGachaTickets: SimMetricAccumulator;
  /** Incremental version of costWithGachaTickets — real banners only. */
  costWithGachaTicketsIncremental: SimMetricAccumulator;
  /** Net cost crediting every held ticket regardless of source — for the timeline's balance-including-tickets lines. */
  costWithTickets: SimMetricAccumulator;
  /** Cumulative pull count per checkpoint (bannerId or "inf") — for the distribution chart's pull-count tab. */
  pulls: SimMetricAccumulator;
  /** Incremental pull count — real banners only. */
  pullsIncremental: SimMetricAccumulator;
  /** Cumulative eligma per checkpoint (bannerId or "inf") — for the distribution chart's eligma tab. */
  eligmaCumulative: SimMetricAccumulator;
  /** Incremental (not cumulative) eligma per banner — real banners only, never has an "inf" checkpoint. */
  eligmaIncremental: SimMetricAccumulator;
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

/** Returns a ticket-credited distribution when available, otherwise the matching net-cost distribution. */
export const ticketCreditedDist = (ticketMetric: SimMetricAccumulator, netMetric: SimMetricAccumulator, checkpointId: string): DistributionData[] => {
  const dist = ticketMetric.dist(checkpointId);
  return dist.length > 0 ? dist : netMetric.dist(checkpointId);
};

/** A live ticket batch inside a running simulation — pullUnits is mutated down as it gets spent. */
export interface TicketPoolEntry {
  pullUnits: number;
  /** Unix ms the batch stops being usable, or null for a batch that never expires. */
  expiresAt: number | null;
  /** Unix ms the batch starts being usable (0 = already held, usable from the very start). */
  availableFrom: number;
  /** Earned as a Recruitment Count Bonus reward (pulling), as opposed to an eraid/manual batch seeded before the run. Needed to tell "spent" from "expired unused" apart for eraid/manual batches specifically (see nonGachaTicketValueSpent) — a gacha-earned batch doesn't need that distinction, since either way it just stops being held. */
  fromGacha: boolean;
}

// For internal simulation state management
export interface SimState {
  /** Students owned before the simulation or acquired while pulling, used only for duplicate rewards. */
  owned: Set<number>;
  /** Students that appeared in a pull or spark during this simulation, used for target completion. */
  obtainedInSim: Set<number>;
  acquiredInSim: Set<number>;
  eleph: Map<number, number>;
  totalEligma: number;
  totalPulls: number;
  totalCost: number;
  // "Recruit charge" pity counters (new system, post Makoto (Swimsuit) patch).
  // Persist across every banner of the matching track — reset only on actually obtaining that track's pickup.
  chargeNormal: number;
  chargeLimited: number;
  /** Term-limited 10-pull ticket batches, spent before pyroxene. Persists across every banner in the strategy (chronological order). */
  ticketPool: TicketPoolEntry[];
  /** Pyroxene-equivalent value of eraid/manual (non-gacha) tickets actually spent so far — NOT tickets that merely expired unused. Running total, only ever increases. */
  nonGachaTicketValueSpent: number;
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

// Old pool initializer, superseded by createPoolForBanner above (kept for reference).

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
    // FES soft-pity ★3 table: independent from normal-pull, FES rate is 2x due to 50/50 split.
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
    // FES: co-pickups in spook pool only. Normal: dedupe co-pickups that might double-count.
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
  // A pre-owned student is still a valid target result when pulled in this simulation.
  state.obtainedInSim.add(id);
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
// 3b. Term-limited ticket pool
// ==========================================

export const PULL_UNITS_PER_10PULL = 10;
export const PYROXENE_PER_10PULL = 1200;
export const PYROXENE_PER_PULL_UNIT = PYROXENE_PER_10PULL / PULL_UNITS_PER_10PULL;

// banner.startTime is the same string across every simulation run for a given banner, so parsing it with
// `new Date(...)` per run (hot: called once per run x per banner) is pure waste. Cached by string.
const bannerStartTimeMsCache = new Map<string, number>();
const getBannerStartTimeMs = (startTime: string): number => {
  let ms = bannerStartTimeMsCache.get(startTime);
  if (ms === undefined) {
    ms = new Date(startTime).getTime();
    bannerStartTimeMsCache.set(startTime, ms);
  }
  return ms;
};

/** Whether a batch is usable for a 10-pull happening at `bannerStartTime`: on/after its availableFrom, and (if it has an expiry) not yet past it. */
const isTicketUsableAt = (batch: { availableFrom: number; expiresAt: number | null }, bannerStartTime: number): boolean =>
  bannerStartTime >= batch.availableFrom && (batch.expiresAt === null || batch.expiresAt > bannerStartTime);

/* Consume from ticket pool (expiring soonest first) or return false for pyroxene fallback */
const consumeTicketOrPyroxene = (state: SimState, bannerStartTime: number): boolean => {
  if (state.ticketPool.length === 0) return false;
  const usable = state.ticketPool.filter((b) => b.pullUnits > 0 && isTicketUsableAt(b, bannerStartTime));
  const totalAvailable = usable.reduce((sum, b) => sum + b.pullUnits, 0);
  if (totalAvailable < PULL_UNITS_PER_10PULL) return false;

  usable.sort((a, b) => {
    if (a.expiresAt === null) return b.expiresAt === null ? 0 : 1;
    if (b.expiresAt === null) return -1;
    return a.expiresAt - b.expiresAt;
  });
  let remaining = PULL_UNITS_PER_10PULL;
  for (const batch of usable) {
    if (remaining <= 0) break;
    const take = Math.min(batch.pullUnits, remaining);
    batch.pullUnits -= take;
    remaining -= take;
    if (!batch.fromGacha) state.nonGachaTicketValueSpent += take * PYROXENE_PER_PULL_UNIT;
  }
  return true;
};

/** Pyroxene-equivalent value of the pool's currently-usable pull-units as of `atTime` — excludes batches not yet available (e.g. a future eraid ticket before its grant date) as well as expired ones. `gachaOnly` further restricts to Recruitment-Count-Bonus batches. */
const heldPyroxeneValue = (pool: TicketPoolEntry[], atTime: number, gachaOnly = false): number =>
  pool.reduce((sum, b) => (isTicketUsableAt(b, atTime) && (!gachaOnly || b.fromGacha) ? sum + b.pullUnits : sum), 0) * PYROXENE_PER_PULL_UNIT;

/** Whether any non-infinite batch expires within THIS banner's own window (start, end] and still has a full 10-pull worth of units — the simple "drain it in the banner its expiry actually falls in, or let it lapse" policy. */
const hasExpiringTicketToDrain = (state: SimState, bannerStartTime: number, bannerEndTime: number): boolean =>
  state.ticketPool.length > 0 && state.ticketPool.some((b) => b.pullUnits >= PULL_UNITS_PER_10PULL && b.expiresAt !== null && isTicketUsableAt(b, bannerStartTime) && b.expiresAt <= bannerEndTime);

/* Remove spent + expired tickets (but keep unavailable ones for future banners) */
const pruneTicketPool = (state: SimState, bannerStartTime: number): void => {
  state.ticketPool = state.ticketPool.filter((b) => b.pullUnits > 0 && (b.expiresAt === null || b.expiresAt > bannerStartTime));
};

/** Context shared across banners within one simulation run — static across every run of a given strategy set, only RNG outcomes differ. */
export interface TicketSimContext {
  consumeExpiringTickets: boolean;
}

const EMPTY_TICKET_CONTEXT: TicketSimContext = { consumeExpiringTickets: false };

// ==========================================
// 4. Banner Simulation Logic
// ==========================================

/* Recruit charge pity system: two counters (chargeNormal/chargeLimited) drive soft (100) and hard (200) pity */
export const simulateSingleBannerCharge = (state: SimState, strat: BannerStrategy, banner: BannerPeriod, pools: GachaPools, ticketCtx: TicketSimContext = EMPTY_TICKET_CONTEXT) => {
  let pullsThisBanner = 0;
  let currentFreePulls = banner.freePulls || 0;
  const bannerPickupIds = banner.pickupStudents.map((s) => s.id);
  let recallFlag: false | 'ACQUIRED' | 'NOT_ACQUIRED' = banner.isRecall ? 'NOT_ACQUIRED' : false;
  const chargeKey: 'chargeNormal' | 'chargeLimited' = banner.isLimitedBanner ? 'chargeLimited' : 'chargeNormal';
  const maxHalfCharges = strat.maxHalfCharges ?? 2;
  const claimRecruitBonus = strat.claimRecruitBonus ?? false;
  const recruitBonusThreshold = strat.recruitBonusThreshold ?? 10;
  const bannerStartTimeMs = getBannerStartTimeMs(banner.startTime);
  const bannerEndTimeMs = getBannerStartTimeMs(banner.endTime);
  const { consumeExpiringTickets } = ticketCtx;
  const spendOrCharge = () => {
    if (!consumeTicketOrPyroxene(state, bannerStartTimeMs)) state.totalCost += PYROXENE_PER_10PULL;
  };
  const earnRecruitBonusReward = () => {
    const countReward = getRecruitCountReward(pullsThisBanner);
    if (countReward.ticket > 0)
      state.ticketPool.push({ pullUnits: countReward.ticket * PULL_UNITS_PER_10PULL, expiresAt: getRecruitBonusTicketExpiry(banner.startTime), availableFrom: 0, fromGacha: true });
    if (countReward.eligma > 0) state.totalEligma += countReward.eligma;
  };

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
    if (state.obtainedInSim.has(targetConfig.studentId)) continue;

    const currentTargetId = targetConfig.studentId;
    // 'opportunistic': spends dedicated pull budget on target, not tied to shared charge counter's distance.
    let pullsForThisTarget = 0;

    while (true) {
      const isObtained = state.obtainedInSim.has(currentTargetId);
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
      else spendOrCharge();

      // "Recruitment Count Bonus": track ticket/Eligma rewards, pool tickets, fold eligma into total.
      earnRecruitBonusReward();

      pullTenWithCharge(currentTargetId);

      if (!hasFree && state.obtainedInSim.has(currentTargetId)) break;
    }
  }

  // 2. Minimum pull guarantee + spend any remaining free pulls (even with no target set, so their charge
  // progress — which persists into later banners via state[chargeKey] — isn't wasted).
  const minPulls = strat.minPulls || 0;
  // Re-evaluated each iteration: check if near next recruitment bonus milestone (bounded, no infinite loop).
  const isNearRecruitBonus = () => {
    if (!claimRecruitBonus) return false;
    const next = getNextTicketThreshold(pullsThisBanner);
    return next !== undefined && next - pullsThisBanner <= recruitBonusThreshold;
  };
  // Drain expiring tickets within this banner's window via extra filler pulls when consumeExpiringTickets is on.
  while (
    (pullsThisBanner < minPulls || currentFreePulls >= 10 || isNearRecruitBonus() || (consumeExpiringTickets && hasExpiringTicketToDrain(state, bannerStartTimeMs, bannerEndTimeMs))) &&
    Math.floor(pullsThisBanner / 100) < maxHalfCharges
  ) {
    const hasFree = currentFreePulls >= 10;
    state.totalPulls += 10;
    pullsThisBanner += 10;
    if (hasFree) currentFreePulls -= 10;
    else spendOrCharge();

    earnRecruitBonusReward();

    const fillerTargetId = bannerPickupIds[0] || (targets[0] ? targets[0].studentId : 0);
    pullTenWithCharge(fillerTargetId);
  }

  // 3. Spark exchange does not apply under the new system — the 200-count hard pity above already
  // guarantees the pickup automatically as a real roll, so there is nothing left to exchange.

  pruneTicketPool(state, bannerStartTimeMs);
};

const simulateSingleBanner = (state: SimState, strat: BannerStrategy, banner: BannerPeriod, pools: GachaPools, ticketCtx: TicketSimContext = EMPTY_TICKET_CONTEXT) => {
  if (banner.useChargeSystem) {
    simulateSingleBannerCharge(state, strat, banner, pools, ticketCtx);
    return;
  }
  let sparkPoints = 0;
  let currentFreePulls = banner.freePulls || 0;
  const bannerPickupIds = banner.pickupStudents.map((s) => s.id);
  let recallFlag: false | 'ACQUIRED' | 'NOT_ACQUIRED' = banner.isRecall ? 'NOT_ACQUIRED' : false;
  const pickuphistory = [];
  const bannerStartTimeMs = getBannerStartTimeMs(banner.startTime);
  const bannerEndTimeMs = getBannerStartTimeMs(banner.endTime);
  const spendOrCharge = () => {
    if (!consumeTicketOrPyroxene(state, bannerStartTimeMs)) state.totalCost += PYROXENE_PER_10PULL;
  };

  const targets = Object.values(strat.studentConfigs)
    .filter((c) => c.mode !== 'skip')
    .sort((a, b) => a.priority - b.priority);
  const allTargets = [...targets];

  // 1. Simulation per target
  for (const targetConfig of targets) {
    if (state.obtainedInSim.has(targetConfig.studentId) && !targetConfig.intentionalSpark) continue;

    // Number of targets not yet acquired
    const remainTargetCnt = targets.filter((t) => !state.obtainedInSim.has(t.studentId)).length;
    // If remaining targets can be exchanged with spark points, proceed to next
    if (Math.floor(sparkPoints / 200) >= remainTargetCnt) break;

    const currentTargetId = targetConfig.studentId;

    while (true) {
      const isObtained = state.obtainedInSim.has(currentTargetId);
      const hasFree = currentFreePulls >= 10;
      if (!hasFree) {
        // Number of targets not yet acquired
        const remainTargetCnt = targets.filter((t) => !state.obtainedInSim.has(t.studentId)).length;
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
      else spendOrCharge();

      for (let i = 0; i < 10; i++) {
        const result = rollSingle(i == 9, banner.isFes, currentTargetId, pools, bannerPickupIds);
        pickuphistory.push({ currentTargetId, result });
        if (recordResult(state, result.id, result.grade, result.isPickup, recallFlag) && recallFlag == 'NOT_ACQUIRED') {
          recallFlag = 'ACQUIRED';
        }
        // if(currentTargetId==10021 && result.isPickup) console.log('result.isPickup', state.eleph.get(10021), result, )
      }

      if (!hasFree && state.obtainedInSim.has(currentTargetId) && !targetConfig.intentionalSpark) break;
      // if (!hasFree && sparkPoints % 200 === 0 && !state.owned.has(currentTargetId)) break;
    }
  }

  // 2. Minimum pull guarantee; also drain expiring tickets when consumeExpiringTickets is on.
  const minPulls = strat.minPulls || 0;
  while ((sparkPoints < minPulls || (ticketCtx.consumeExpiringTickets && hasExpiringTicketToDrain(state, bannerStartTimeMs, bannerEndTimeMs))) && Math.floor(sparkPoints / 200) < strat.maxSparks) {
    const hasFree = currentFreePulls >= 10;
    state.totalPulls += 10;
    sparkPoints += 10;
    if (hasFree) currentFreePulls -= 10;
    else spendOrCharge();

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
      allTargets.find((t) => t.mode === 'must' && !state.obtainedInSim.has(t.studentId)) ||
      allTargets.find((t) => t.mode === 'opportunistic' && !state.obtainedInSim.has(t.studentId)) ||
      allTargets.find((t) => t.intentionalSpark) ||
      allTargets.find((_t) => true);

    if (sparkTarget) {
      if (recordResult(state, sparkTarget.studentId, 3, true, recallFlag) && recallFlag == 'NOT_ACQUIRED') {
        recallFlag = 'ACQUIRED';
      }
    }
  }

  pruneTicketPool(state, bannerStartTimeMs);
};

// ==========================================
// 5. Distribution + Result Assembly (exported for worker use)
// ==========================================

/** One checkpoint's running stats within a SimMetricAccumulator — plain data (no methods), so it survives postMessage structured clone as-is. dist maps a bin index (value / bin, always exact — see SimMetricAccumulator) to how many pushes landed there. */
export interface SimMetricBucket {
  dist: Record<number, number>;
  sum: number;
  count: number;
}

/* Tracks random variables across checkpoints with exact binning (no rounding loss) */
export class SimMetricAccumulator {
  readonly bin: number;
  readonly data = new Map<string, SimMetricBucket>();

  constructor(bin: number) {
    this.bin = bin;
  }

  private bucket(key: string): SimMetricBucket {
    let b = this.data.get(key);
    if (!b) {
      b = { dist: {}, sum: 0, count: 0 };
      this.data.set(key, b);
    }
    return b;
  }

  push(key: string, value: number): void {
    const b = this.bucket(key);
    b.count++;
    b.sum += value;
    const binIdx = value / this.bin;
    b.dist[binIdx] = (b.dist[binIdx] ?? 0) + 1;
  }

  count(key: string): number {
    return this.data.get(key)?.count ?? 0;
  }

  avg(key: string): number {
    const b = this.data.get(key);
    return b && b.count > 0 ? b.sum / b.count : 0;
  }

  /** Dense, chart-ready distribution for one checkpoint — bins normally start at 0, only extending leftward when values actually go negative. */
  dist(key: string): DistributionData[] {
    const b = this.data.get(key);
    if (!b || b.count === 0) return [];
    const indices = Object.keys(b.dist).map(Number);
    const minIdx = Math.min(0, ...indices);
    const maxIdx = Math.max(...indices);
    const result: DistributionData[] = [];
    let cumulativeCount = 0;
    for (let i = minIdx; i <= maxIdx; i++) {
      const count = b.dist[i] ?? 0;
      cumulativeCount += count;
      result.push({ binStart: i * this.bin, binEnd: (i + 1) * this.bin, count, pdf: (count / b.count) * 100, cdf: (cumulativeCount / b.count) * 100 });
    }
    return result;
  }

  /** Which checkpoints have at least one pushed value. */
  keys(): string[] {
    return [...this.data.keys()];
  }

  /** Folds another accumulator's (or a transmitted plain Map of) bucket data into this one. */
  merge(other: SimMetricAccumulator | Map<string, SimMetricBucket>): void {
    const otherData = other instanceof SimMetricAccumulator ? other.data : other;
    for (const [key, incoming] of otherData) {
      const b = this.bucket(key);
      b.count += incoming.count;
      b.sum += incoming.sum;
      for (const [binIdxStr, c] of Object.entries(incoming.dist)) {
        const binIdx = Number(binIdxStr);
        b.dist[binIdx] = (b.dist[binIdx] ?? 0) + c;
      }
    }
  }
}

/** Exact mean of an already-built distribution — see SimMetricAccumulator.avg for the same computation off a live accumulator. */
export const meanFromDist = (dist: DistributionData[]): number => dist.reduce((sum, d) => sum + d.binStart * (d.pdf / 100), 0);

/** Live accumulator, one SimMetricAccumulator per tracked variable — the JS engine pushes into these directly as it runs; a WASM worker's transmitted bucket data (SimChunkAcc, plain Maps) gets folded in via mergeSimAccumulator. costWithTickets/costWithGachaTickets use PYROXENE_PER_PULL_UNIT (120) as their bin, not PYROXENE_PER_10PULL (1200), because held ticket value can be a partial pull-unit even though net cost itself always lands on full-10-pull multiples. */
export interface SimRawAccumulator {
  cost: SimMetricAccumulator;
  /** Incremental (not cumulative) net cost for just that banner — real banners only, no 'inf' entry. */
  costIncremental: SimMetricAccumulator;
  /** Net cost crediting only gacha-earned (Recruitment Count Bonus) ticket value — for the distribution chart's "how much did my gacha cost" metric. */
  costWithGachaTickets: SimMetricAccumulator;
  /** Incremental version of costWithGachaTickets — real banners only. */
  costWithGachaTicketsIncremental: SimMetricAccumulator;
  /** Same idea but crediting every held ticket regardless of source — for the timeline's balance-including-tickets lines. */
  costWithTickets: SimMetricAccumulator;
  pulls: SimMetricAccumulator;
  /** Incremental pull count for just that banner — real banners only. */
  pullsIncremental: SimMetricAccumulator;
  eligmaCumulative: SimMetricAccumulator;
  /** Incremental (not cumulative) eligma gained during just that banner — source for distEligmaMap/distEligmaExactMap. Real banners only, no 'inf' entry. */
  eligmaIncremental: SimMetricAccumulator;
  bannerStatsSum: Record<string, { pulls: number; cost: number }>;
  studentAcquired: Record<number, number>;
  studentElephTotal: Record<number, number>;
  studentElephDist: Record<number, Record<number, number>>;
  /** bannerId → studentId → incremental_eleph_amount → count of simulations */
  bannerStudentElephDist: Record<string, Record<number, Record<number, number>>>;
  successCount: number;
}

/** Wire-format shape of one compact WASM chunk. Rust bins each metric before serializing; the worker only turns JSON objects into Maps so structured clone can carry them, and mergeSimAccumulator folds them into the live accumulators. */
export interface SimChunkAcc {
  cost: Map<string, SimMetricBucket>;
  costIncremental: Map<string, SimMetricBucket>;
  costWithTickets?: Map<string, SimMetricBucket>;
  costWithGachaTickets?: Map<string, SimMetricBucket>;
  costWithGachaTicketsIncremental?: Map<string, SimMetricBucket>;
  pulls: Map<string, SimMetricBucket>;
  pullsIncremental?: Map<string, SimMetricBucket>;
  eligmaCumulative: Map<string, SimMetricBucket>;
  eligmaIncremental: Map<string, SimMetricBucket>;
  bannerStatsSum: Record<string, { pulls: number; cost: number }>;
  studentAcquired: Record<number, number>;
  studentElephTotal: Record<number, number>;
  studentElephDist: Record<number, Record<number, number>>;
  bannerStudentElephDist: Record<string, Record<number, Record<number, number>>>;
  successCount: number;
}

export interface WasmPayload {
  strategiesJson: string;
  bannerPoolsJson: string;
  activeBannerIds: string[];
  initialOwnedIds: number[];
  ticketBatchesJson: string;
  consumeExpiringTickets: boolean;
}

export const buildWasmPayload = (
  strategies: BannerStrategy[],
  bannersMap: Record<string, BannerPeriod>,
  allStudents: Student[],
  initialOwnedIds: number[] = [],
  initialTicketBatches: TicketBatch[] = [],
  consumeExpiringTickets: boolean = true,
): WasmPayload => {
  const activeStrategies = strategies.filter((s) => s.isActive);
  const releaseDateMap = preprocessReleaseDates(bannersMap);

  const bannerPoolsForWasm: Record<
    string,
    {
      isFes: boolean;
      isLimitedBanner: boolean;
      isRecall: boolean;
      useChargeSystem: boolean;
      freePulls: number;
      grade3: number[];
      grade2: number[];
      grade1: number[];
      fes: number[];
      bannerPickupIds: number[];
      fesExcludedIds: number[];
      startTime: number;
      endTime: number;
      recruitBonusTicketExpiry: number;
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
      isLimitedBanner: banner.isLimitedBanner,
      isRecall: banner.isRecall ?? false,
      useChargeSystem: banner.useChargeSystem,
      freePulls: banner.freePulls ?? 0,
      grade3: pools.grade3.map((s) => s.id),
      grade2: pools.grade2.map((s) => s.id),
      grade1: pools.grade1.map((s) => s.id),
      fes: pools.fes.map((s) => s.id),
      bannerPickupIds: pickupIds,
      fesExcludedIds,
      startTime: new Date(banner.startTime).getTime(),
      endTime: new Date(banner.endTime).getTime(),
      recruitBonusTicketExpiry: getRecruitBonusTicketExpiry(banner.startTime),
    };
  }

  const strategiesForWasm = activeStrategies.map((s) => ({
    bannerId: s.bannerId,
    maxSparks: s.maxSparks ?? 1,
    maxHalfCharges: s.maxHalfCharges ?? 2,
    claimRecruitBonus: s.claimRecruitBonus ?? false,
    recruitBonusThreshold: s.recruitBonusThreshold ?? 10,
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
    initialOwnedIds,
    ticketBatchesJson: JSON.stringify(
      initialTicketBatches.map((b) => ({
        pullUnits: b.pullUnits,
        expiresAt: b.expiresAt,
        availableFrom: b.availableFrom,
        fromGacha: false,
      })),
    ),
    consumeExpiringTickets,
  };
};

/* Fold WASM worker chunk (already binned) into live main-thread accumulator */
export const mergeSimAccumulator = (base: SimRawAccumulator, chunk: SimChunkAcc): void => {
  base.cost.merge(chunk.cost);
  base.costIncremental.merge(chunk.costIncremental);
  if (chunk.costWithTickets) base.costWithTickets.merge(chunk.costWithTickets);
  if (chunk.costWithGachaTickets) base.costWithGachaTickets.merge(chunk.costWithGachaTickets);
  if (chunk.costWithGachaTicketsIncremental) base.costWithGachaTicketsIncremental.merge(chunk.costWithGachaTicketsIncremental);
  base.pulls.merge(chunk.pulls);
  if (chunk.pullsIncremental) base.pullsIncremental.merge(chunk.pullsIncremental);
  base.eligmaCumulative.merge(chunk.eligmaCumulative);
  base.eligmaIncremental.merge(chunk.eligmaIncremental);
  base.successCount += chunk.successCount;

  for (const [bid, s] of Object.entries(chunk.bannerStatsSum)) {
    if (base.bannerStatsSum[bid]) {
      base.bannerStatsSum[bid].pulls += s.pulls;
      base.bannerStatsSum[bid].cost += s.cost;
    } else {
      base.bannerStatsSum[bid] = { pulls: s.pulls, cost: s.cost };
    }
  }
  for (const [idStr, cnt] of Object.entries(chunk.studentAcquired)) {
    const id = Number(idStr);
    base.studentAcquired[id] = (base.studentAcquired[id] ?? 0) + cnt;
  }
  for (const [idStr, total] of Object.entries(chunk.studentElephTotal)) {
    const id = Number(idStr);
    base.studentElephTotal[id] = (base.studentElephTotal[id] ?? 0) + total;
  }
  for (const [idStr, dist] of Object.entries(chunk.studentElephDist)) {
    const id = Number(idStr);
    if (!base.studentElephDist[id]) base.studentElephDist[id] = {};
    for (const [amtStr, cnt] of Object.entries(dist)) {
      const amt = Number(amtStr);
      base.studentElephDist[id][amt] = (base.studentElephDist[id][amt] ?? 0) + cnt;
    }
  }
  for (const [bid, studentDists] of Object.entries(chunk.bannerStudentElephDist ?? {})) {
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
    cost: acc.cost,
    costIncremental: acc.costIncremental,
    costWithGachaTickets: acc.costWithGachaTickets,
    costWithGachaTicketsIncremental: acc.costWithGachaTicketsIncremental,
    costWithTickets: acc.costWithTickets,
    pulls: acc.pulls,
    pullsIncremental: acc.pullsIncremental,
    eligmaCumulative: acc.eligmaCumulative,
    eligmaIncremental: acc.eligmaIncremental,
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
  initialTicketBatches: TicketBatch[] = [],
  consumeExpiringTickets: boolean = true,
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

  // Active banners, sorted (static per strategy set, only RNG differs); used for ticket-checkpoint anchoring.
  const activeBannersSorted = strategies
    .filter((s) => s.isActive && bannersMap[s.bannerId])
    .map((s) => ({ id: s.bannerId, startTime: getBannerStartTimeMs(bannersMap[s.bannerId].startTime) }))
    .sort((a, b) => a.startTime - b.startTime);
  const ticketCtx: TicketSimContext = { consumeExpiringTickets };

  // Dates where held ticket value can change with no banner running: a Recruitment Count Bonus ticket's
  // Group ticket checkpoint dates under latest banner at or before; extra snapshots filter by date, no re-sim needed.
  const extraCheckpointsByBanner: Record<string, number[]> = {};
  const ticketCheckpointDates = new Set<number>();
  for (const s of strategies) {
    if (s.isActive && bannersMap[s.bannerId]) ticketCheckpointDates.add(getRecruitBonusTicketExpiry(bannersMap[s.bannerId].startTime));
  }
  for (const batch of initialTicketBatches) {
    if (batch.availableFrom > 0) ticketCheckpointDates.add(batch.availableFrom);
    if (batch.expiresAt !== null) ticketCheckpointDates.add(batch.expiresAt);
  }
  for (const date of ticketCheckpointDates) {
    let anchor: { id: string; startTime: number } | null = null;
    for (const b of activeBannersSorted) {
      if (b.startTime <= date) anchor = b;
      else break;
    }
    if (!anchor || date === anchor.startTime) continue; // before the first banner, or coincides with one — no extra checkpoint needed
    (extraCheckpointsByBanner[anchor.id] ??= []).push(date);
  }

  // Per-checkpoint accumulators, one SimMetricAccumulator per tracked variable — checkpoints (banner ids,
  // "ticket-<date>", "inf") are created lazily on first push, no upfront initialization needed.
  const cost = new SimMetricAccumulator(PYROXENE_PER_10PULL);
  const costIncremental = new SimMetricAccumulator(PYROXENE_PER_10PULL);
  const costWithTickets = new SimMetricAccumulator(PYROXENE_PER_PULL_UNIT);
  const costWithGachaTickets = new SimMetricAccumulator(PYROXENE_PER_PULL_UNIT);
  const costWithGachaTicketsIncremental = new SimMetricAccumulator(PYROXENE_PER_PULL_UNIT);
  const pulls = new SimMetricAccumulator(PULL_UNITS_PER_10PULL);
  const pullsIncremental = new SimMetricAccumulator(PULL_UNITS_PER_10PULL);
  const eligmaCumulative = new SimMetricAccumulator(1);
  const eligmaIncremental = new SimMetricAccumulator(1);
  let successCount = 0;

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
    // Running total for this run only — costWithGachaTickets isn't tracked on `state` itself (it's computed
    // from state + held ticket value at push time), so the incremental delta needs its own previous-value.
    let prevCostWithGachaTicketsValue = 0;
    const state: SimState = {
      owned: new Set(initialOwnedIds),
      obtainedInSim: new Set(),
      acquiredInSim: new Set(),
      eleph: new Map(),
      totalEligma: 0,
      totalPulls: 0,
      totalCost: 0,
      chargeNormal: 0,
      chargeLimited: 0,
      // Deep-copied per sim run since consumeTicketOrPyroxene mutates pullUnits in place.
      ticketPool: initialTicketBatches.map((b) => ({ pullUnits: b.pullUnits, expiresAt: b.expiresAt, availableFrom: b.availableFrom, fromGacha: false })),
      nonGachaTicketValueSpent: 0,
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
      const prevEligma = state.totalEligma;

      simulateSingleBanner(state, strat, banner, currentBannerPool, ticketCtx);

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

      // Push cumulative cost/pulls/eligma up to this point, plus the incremental (just-this-banner) values,
      // to this banner's checkpoint.
      const atTime = getBannerStartTimeMs(banner.startTime);
      cost.push(strat.bannerId, state.totalCost);
      costIncremental.push(strat.bannerId, state.totalCost - prevCost);
      costWithTickets.push(strat.bannerId, state.totalCost - heldPyroxeneValue(state.ticketPool, atTime));
      const costWithGachaTicketsValue = state.totalCost + state.nonGachaTicketValueSpent - heldPyroxeneValue(state.ticketPool, atTime, true);
      costWithGachaTickets.push(strat.bannerId, costWithGachaTicketsValue);
      costWithGachaTicketsIncremental.push(strat.bannerId, costWithGachaTicketsValue - prevCostWithGachaTicketsValue);
      prevCostWithGachaTicketsValue = costWithGachaTicketsValue;
      pulls.push(strat.bannerId, state.totalPulls);
      pullsIncremental.push(strat.bannerId, state.totalPulls - prevPulls);
      eligmaCumulative.push(strat.bannerId, state.totalEligma);
      eligmaIncremental.push(strat.bannerId, state.totalEligma - prevEligma);
      // Extra ticket-event checkpoints anchored to this banner: net cost is unchanged, but held ticket
      // value is re-evaluated at each date so expiry/grant events still show up.
      for (const date of extraCheckpointsByBanner[strat.bannerId] ?? []) {
        const id = `ticket-${date}`;
        cost.push(id, state.totalCost);
        costWithTickets.push(id, state.totalCost - heldPyroxeneValue(state.ticketPool, date));
        costWithGachaTickets.push(id, state.totalCost + state.nonGachaTicketValueSpent - heldPyroxeneValue(state.ticketPool, date, true));
      }
    }

    // "inf" checkpoint: final state at time=Infinity; only unlimited batches (expiresAt: null) count as held.
    cost.push('inf', state.totalCost);
    costWithTickets.push('inf', state.totalCost - heldPyroxeneValue(state.ticketPool, Infinity));
    costWithGachaTickets.push('inf', state.totalCost + state.nonGachaTicketValueSpent - heldPyroxeneValue(state.ticketPool, Infinity, true));
    pulls.push('inf', state.totalPulls);
    eligmaCumulative.push('inf', state.totalEligma);

    let isSuccess = true;
    for (const strat of strategies) {
      if (!strat.isActive) continue;
      for (const conf of Object.values(strat.studentConfigs)) {
        if (conf.mode === 'must' && !state.obtainedInSim.has(conf.studentId)) {
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
      cost,
      costIncremental,
      costWithTickets,
      costWithGachaTickets,
      costWithGachaTicketsIncremental,
      pulls,
      pullsIncremental,
      eligmaCumulative,
      eligmaIncremental,
      bannerStatsSum,
      studentAcquired: Object.fromEntries(Object.entries(studentRawStats).map(([id, r]) => [Number(id), r.acquiredCount])),
      studentElephTotal: Object.fromEntries(Object.entries(studentRawStats).map(([id, r]) => [Number(id), r.totalEleph])),
      studentElephDist: Object.fromEntries(Object.entries(studentRawStats).map(([id, r]) => [Number(id), Object.fromEntries(r.elephCounts)])),
      bannerStudentElephDist,
      successCount,
    },
    simCount,
    allStudents,
    bannersMap,
  );
};
