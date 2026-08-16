import { describe, it, expect, vi, afterEach } from 'vitest';
import { simulateSingleBannerCharge, rollSingle, runGlobalSimulation, type SimState, type GachaPools } from './gachaEngine';
import type { BannerPeriod, BannerStrategy, Student } from '~/types/gacha';

const PICKUP_ID = 20999;
const SPOOK_ID = 20111;
const GRADE2_ID = 13111;
const GRADE1_ID = 16001; // getStudentGrade excludes ids >= 16005 within the 16xxx prefix

const makeStudent = (id: number): Student => ({
  id,
  name: `student-${id}`,
  rarity: 3,
  isLimited: false,
  isFes: false,
  releaseDate: 0,
  isRerun: false,
});

const makePools = (): GachaPools => ({
  grade3: [makeStudent(SPOOK_ID)],
  grade2: [makeStudent(GRADE2_ID)],
  grade1: [makeStudent(GRADE1_ID)],
  fes: [],
});

const makeState = (overrides: Partial<SimState> = {}): SimState => ({
  owned: new Set(),
  acquiredInSim: new Set(),
  eleph: new Map(),
  totalEligma: 0,
  totalPulls: 0,
  totalCost: 0,
  chargeNormal: 0,
  chargeLimited: 0,
  ...overrides,
});

const makeBanner = (overrides: Partial<BannerPeriod> = {}): BannerPeriod => ({
  id: 'banner-1',
  startTime: '2026-08-01 00:00',
  endTime: '2026-08-14 00:00',
  isFes: false,
  isLimitedBanner: false,
  isRerunBanner: false,
  isRecall: false,
  freePulls: 0,
  excludedFesId: [],
  useChargeSystem: true,
  pickupStudents: [makeStudent(PICKUP_ID)],
  ...overrides,
});

const makeStrategy = (overrides: Partial<BannerStrategy> = {}): BannerStrategy => ({
  bannerId: 'banner-1',
  isActive: true,
  maxSparks: 1,
  maxHalfCharges: 5,
  minPulls: 0,
  studentConfigs: {
    [PICKUP_ID]: { studentId: PICKUP_ID, mode: 'must', priority: 1, opportunisticThreshold: 50, intentionalSpark: false, intentionalSparkThreshold: 20 },
  },
  maxPulls: 500,
  isFes: false,
  freePulls: 0,
  ...overrides,
});

describe('rollSingle — forcedOutcome', () => {
  it("forcedOutcome 'pickup' always returns the pickup id at grade 3", () => {
    const pools = makePools();
    for (let i = 0; i < 20; i++) {
      const result = rollSingle(false, false, PICKUP_ID, pools, [PICKUP_ID], 'pickup');
      expect(result).toEqual({ id: PICKUP_ID, grade: 3, isPickup: true });
    }
  });

  it("forcedOutcome 'random3star' always returns a non-pickup grade-3 student", () => {
    const pools = makePools();
    for (let i = 0; i < 200; i++) {
      const result = rollSingle(false, false, PICKUP_ID, pools, [PICKUP_ID], 'random3star');
      expect(result.grade).toBe(3);
      expect(result.isPickup).toBe(false);
      expect(result.id).not.toBe(PICKUP_ID);
    }
  });

  it("forcedOutcome 'random3star' on a FES banner keeps each off-banner FES student's rate flat at the normal-pull rate (0.1%), not rescaled to the off-rate ★3 band", () => {
    // Official 100-count table: 50% pickup / 0.1% per off-banner FES / remainder split across regular ★3.
    // Conditional on landing in the random3star half (the other 50%), each FES student's share is
    // 2x its normal-pull rate (FES_SPOOK / fesPool.length), i.e. ~0.2% here for a 9-member pool.
    const FES_STUDENT_ID = 30001;
    const fesPool = Array.from({ length: 9 }, (_, i) => makeStudent(FES_STUDENT_ID + i));
    const pools: GachaPools = { grade3: [makeStudent(SPOOK_ID)], grade2: [makeStudent(GRADE2_ID)], grade1: [makeStudent(GRADE1_ID)], fes: fesPool };

    const N = 200000;
    let fesHits = 0;
    let singleStudentHits = 0;
    for (let i = 0; i < N; i++) {
      const result = rollSingle(false, true, PICKUP_ID, pools, [PICKUP_ID], 'random3star');
      expect(result.isPickup).toBe(false);
      if (fesPool.some((s) => s.id === result.id)) {
        fesHits++;
        if (result.id === FES_STUDENT_ID) singleStudentHits++;
      }
    }

    const fesRate = fesHits / N;
    const perStudentRate = singleStudentHits / N;

    // Expected ~1.8% total (2 * FES_SPOOK), split across 9 -> ~0.2% per student. Old (buggy) behavior
    // gave ~16.98% total (FES_SPOOK / (R3 - PICKUP)) -> ~1.89% per student, well outside this tolerance.
    expect(fesRate).toBeGreaterThan(0.012);
    expect(fesRate).toBeLessThan(0.024);
    expect(perStudentRate).toBeGreaterThan(0.001);
    expect(perStudentRate).toBeLessThan(0.003);
  });

  it('does not double-count a co-pickup student who is also a non-limited member of the regular ★3 pool', () => {
    // Multi-pickup non-FES banner (e.g. Seia/S.Asuna/S.Akane/B.Toki, GH issue #7): a co-pickup that isn't
    // flagged `limited` (S.Akane, B.Toki) is already present in pools.grade3, so appending bannerPickupIds
    // without dedup made it appear twice in validSpooks and roll ~2x as often as an ordinary off-rate student.
    const SPOOK_ID_2 = 20222;
    const pools: GachaPools = { grade3: [makeStudent(SPOOK_ID), makeStudent(SPOOK_ID_2)], grade2: [makeStudent(GRADE2_ID)], grade1: [makeStudent(GRADE1_ID)], fes: [] };
    const bannerPickupIds = [PICKUP_ID, SPOOK_ID]; // SPOOK_ID is a co-pickup that's also in pools.grade3

    const N = 100000;
    let spookIdHits = 0;
    let spookId2Hits = 0;
    for (let i = 0; i < N; i++) {
      const result = rollSingle(false, false, PICKUP_ID, pools, bannerPickupIds, 'random3star');
      if (result.id === SPOOK_ID) spookIdHits++;
      if (result.id === SPOOK_ID_2) spookId2Hits++;
    }

    // Should split ~50/50. Pre-fix this was ~2:1 in favor of SPOOK_ID (duplicated in validSpooks).
    const ratio = spookIdHits / spookId2Hits;
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });
});

describe('simulateSingleBannerCharge — recruit charge pity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resets mid-10-pull and recounts from 1 (official example: 58 -> 61 -> reset -> 7)', () => {
    // pulls 1-2 of the batch: natural roll, forced to land in the grade-1 band (rng=0.9, pool length 1 -> index 0).
    // pull 3: natural roll forced into the pickup band (rng=0.001 < PICKUP rate) -> obtained, charge resets to 0.
    // pulls 4-10: natural, forced back into the grade-1 band again -> recount 1..7.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.9) // pull1 threshold
      .mockReturnValueOnce(0.9) // pull1 grade1 pool index
      .mockReturnValueOnce(0.9) // pull2 threshold
      .mockReturnValueOnce(0.9) // pull2 grade1 pool index
      .mockReturnValueOnce(0.001) // pull3 threshold -> pickup, no further draw
      .mockReturnValue(0.9); // pulls 4-10 fallback

    const state = makeState({ chargeNormal: 58 });
    const strat = makeStrategy();
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.owned.has(PICKUP_ID)).toBe(true);
    expect(state.chargeNormal).toBe(7);
    expect(state.totalPulls).toBe(10);
  });

  it('forces a guaranteed pickup the pull the charge reaches 200 (hard pity)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // any subsequent natural rolls resolve to grade1, never a natural pickup

    const state = makeState({ chargeNormal: 199 });
    const strat = makeStrategy();
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.owned.has(PICKUP_ID)).toBe(true);
    // charge199 -> 200 (forced pickup, reset) -> 1..9 for the remaining 9 pulls of the same 10-pull
    expect(state.chargeNormal).toBe(9);
    expect(state.totalPulls).toBe(10);
  });

  it('forces a guaranteed grade-3 at charge 100, and honors the 50% pickup coin-flip', () => {
    // First Math.random call is the 50% coin-flip at charge=100; making it <0.5 selects the pickup outcome,
    // which (like 'pickup' forcedOutcome) consumes no further random draws.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValue(0.9);

    const state = makeState({ chargeNormal: 99 });
    const strat = makeStrategy();
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.owned.has(PICKUP_ID)).toBe(true);
    expect(state.chargeNormal).toBe(9);
    expect(state.totalPulls).toBe(10);
  });

  it('tracks the normal and limited charge tracks independently', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const state = makeState({ chargeNormal: 199, chargeLimited: 50 });
    const strat = makeStrategy();
    const normalBanner = makeBanner({ isLimitedBanner: false });
    simulateSingleBannerCharge(state, strat, normalBanner, makePools());

    expect(state.owned.has(PICKUP_ID)).toBe(true);
    expect(state.chargeNormal).toBe(9); // consumed by the normal-track pull-to-200
    expect(state.chargeLimited).toBe(50); // untouched by a normal-track banner
  });

  it('stops pulling once maxHalfCharges budget is exhausted, even without a lucky natural pickup', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // never a natural pickup; the 100-count coin-flip also always misses (0.9 >= 0.5)

    const state = makeState();
    const strat = makeStrategy({ maxHalfCharges: 1 }); // 100-pull budget
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.owned.has(PICKUP_ID)).toBe(false);
    expect(state.totalPulls).toBe(100);
    expect(state.chargeNormal).toBe(100);
  });

  it("'opportunistic' spends a dedicated pull budget (opportunisticThreshold) regardless of the shared charge counter's position", () => {
    // Charge starts far from any checkpoint (0), so under the old "distance to ceiling" gate this target would
    // never even attempt a pull. Under the new dedicated-budget semantics it should still try up to the threshold.
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // never a natural pickup; 100-count coin-flip always misses

    const state = makeState({ chargeNormal: 0 });
    const strat = makeStrategy({
      studentConfigs: {
        [PICKUP_ID]: { studentId: PICKUP_ID, mode: 'opportunistic', priority: 1, opportunisticThreshold: 20, intentionalSpark: false, intentionalSparkThreshold: 20 },
      },
    });
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.owned.has(PICKUP_ID)).toBe(false);
    expect(state.totalPulls).toBe(20); // exactly 2 batches (the dedicated budget), not gated by distance to 100/200
  });

  it('spends free pulls (building charge) even when every target is skipped, so they are never wasted', () => {
    // Charge already persists into later banners via state.chargeNormal/chargeLimited — the fix here is just
    // making sure a banner with free pulls and no target actually spends them instead of doing nothing.
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // never a natural pickup; the 100-count coin-flip also misses

    const state = makeState();
    const strat = makeStrategy({
      studentConfigs: { [PICKUP_ID]: { studentId: PICKUP_ID, mode: 'skip', priority: 1, opportunisticThreshold: 50, intentionalSpark: false, intentionalSparkThreshold: 20 } },
    });
    const banner = makeBanner({ freePulls: 100 });
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.totalPulls).toBe(100);
    // Fully covered by free pulls, EXCEPT this 100-pull run passes through count 70 (recruit count bonus
    // ticket threshold), which credits back 1200 regardless of whether the pulls were already free — an
    // accepted tradeoff of the simpler "always credit on earn" reward model.
    expect(state.totalCost).toBe(-1200);
    expect(state.chargeNormal).toBe(100); // the free pulls still built charge progress
  });

  it('recruit count bonus: earning a ticket at count 70 credits back 1200 pyroxene', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // never a natural/forced pickup within 70 pulls

    const state = makeState();
    const strat = makeStrategy({
      studentConfigs: {
        [PICKUP_ID]: { studentId: PICKUP_ID, mode: 'opportunistic', priority: 1, opportunisticThreshold: 70, intentionalSpark: false, intentionalSparkThreshold: 20 },
      },
    });
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.totalPulls).toBe(70);
    expect(state.totalCost).toBe(7 * 1200 - 1200); // 7 paid batches minus the ticket earned at count 70
  });

  it('recruit count bonus: earning eligma at count 30 adds it on top of natural dupe eligma', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // pulls 1-9 of each batch land grade1, pull 10 lands grade2

    const state = makeState();
    const strat = makeStrategy({
      studentConfigs: {
        [PICKUP_ID]: { studentId: PICKUP_ID, mode: 'opportunistic', priority: 1, opportunisticThreshold: 30, intentionalSpark: false, intentionalSparkThreshold: 20 },
      },
    });
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.totalPulls).toBe(30);
    // 27 grade1 pulls (1 new + 26 dupes x 1 eligma) + 3 grade2 pulls (1 new + 2 dupes x 10 eligma) + 10 reward eligma at count 30
    expect(state.totalEligma).toBe(26 * 1 + 2 * 10 + 10);
  });
});

describe('claimRecruitBonus / recruitBonusThreshold', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disabled (default): stops at minPulls, does not reach the next ticket milestone', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // never a natural/forced pickup

    const state = makeState();
    state.owned.add(PICKUP_ID); // "must" target already obtained -> stage 1 contributes 0 pulls
    const strat = makeStrategy({ minPulls: 60, maxHalfCharges: 5 }); // claimRecruitBonus omitted -> defaults to false
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.totalPulls).toBe(60); // stops exactly at minPulls, 10 short of the 70 milestone
    expect(state.totalCost).toBe(6 * 1200);
  });

  it('enabled: keeps pulling past minPulls to claim a milestone 10 pulls away, then stops', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const state = makeState();
    state.owned.add(PICKUP_ID);
    const strat = makeStrategy({ minPulls: 60, maxHalfCharges: 5, claimRecruitBonus: true, recruitBonusThreshold: 10 });
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.totalPulls).toBe(70); // one extra 10-pull call to land exactly on the 70 milestone
    // 7 paid batches minus the ticket earned at 70 -> same net cost as the disabled case's 6 paid batches,
    // illustrating the "not much of a loss" property the option is designed around.
    expect(state.totalCost).toBe(6 * 1200);
  });

  it('budget cutoff (maxHalfCharges) wins even when a milestone is within reach, without overshooting', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const state = makeState();
    state.owned.add(PICKUP_ID);
    // recruitBonusThreshold is widened to 40 (rather than the default 10) so the "near" range starts at pull 90,
    // crossing the 100-pull budget boundary before reaching the 130 milestone -- the default threshold of 10
    // never spans a 100-boundary, since every milestone's "10-before" position sits in the same hundred.
    const strat = makeStrategy({ minPulls: 90, maxHalfCharges: 1, claimRecruitBonus: true, recruitBonusThreshold: 40 });
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.totalPulls).toBe(100); // budget (1 half-charge = 100 pulls) cuts it off before the 130 milestone
    expect(state.totalCost).toBe(10 * 1200 - 1200); // 10 paid batches minus the ticket earned in passing at count 70
  });

  it('recruitBonusThreshold: 0 behaves as disabled (the gap to any milestone is always >= 10)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const state = makeState();
    state.owned.add(PICKUP_ID);
    const strat = makeStrategy({ minPulls: 60, maxHalfCharges: 5, claimRecruitBonus: true, recruitBonusThreshold: 0 });
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.totalPulls).toBe(60); // never satisfies `next - pullsThisBanner <= 0`
    expect(state.totalCost).toBe(6 * 1200);
  });
});

describe('runGlobalSimulation — legacy spark-point system regression', () => {
  it('still reliably acquires a "must" target on a legacy (useChargeSystem: false) banner', () => {
    const banner = makeBanner({ useChargeSystem: false });
    const strat = makeStrategy({ maxSparks: 5 });
    const bannersMap = { [banner.id]: banner };
    const allStudents = [makeStudent(PICKUP_ID), makeStudent(SPOOK_ID), makeStudent(GRADE2_ID), makeStudent(GRADE1_ID)];

    const result = runGlobalSimulation([strat], bannersMap, allStudents, { initialPyroxenes: 0, simCount: 200 });
    expect(result.successRate).toBeGreaterThan(99);
  });
});
