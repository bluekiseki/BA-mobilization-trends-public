import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initSync, simulate_strategies_chunk } from '~/workers/gacha_engine_pkg.js';
import { buildWasmPayload, simulateSingleBannerCharge, rollSingle, runGlobalSimulation, meanFromDist, type SimState, type GachaPools } from './gachaEngine';
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
  obtainedInSim: new Set(),
  acquiredInSim: new Set(),
  eleph: new Map(),
  totalEligma: 0,
  totalPulls: 0,
  totalCost: 0,
  chargeNormal: 0,
  chargeLimited: 0,
  ticketPool: [],
  nonGachaTicketValueSpent: 0,
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
    // Each off-banner FES student's rate should stay flat at 2x its normal-pull rate (~0.2% for a 9-member pool), not rescaled to the random3star band.
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
    // GH issue #7: a co-pickup not flagged `limited` is already in pools.grade3, so appending bannerPickupIds without dedup doubled its roll rate.
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
    // Test pity reset: pulls 1-2 grade-1, pull 3 pickup (reset), pulls 4-10 grade-1 recount.
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

  it('does not treat a pre-owned target as found before it is pulled', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // never a natural pickup; the 100-count coin-flip also misses

    const state = makeState({ owned: new Set([PICKUP_ID]) });
    const strat = makeStrategy({ maxHalfCharges: 1 });
    simulateSingleBannerCharge(state, strat, makeBanner(), makePools());

    expect(state.obtainedInSim.has(PICKUP_ID)).toBe(false);
    expect(state.totalPulls).toBe(100);
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
    // Fully covered by free pulls, so no pyroxene is charged. A ticket is earned in passing at count 70
    // (the bonus threshold), but remaining free pulls mean it's never spent — it just sits in the pool.
    expect(state.totalCost).toBe(0);
    expect(state.ticketPool).toEqual([{ pullUnits: 10, expiresAt: expect.any(Number) as number, availableFrom: expect.any(Number) as number, fromGacha: true }]);
    expect(state.chargeNormal).toBe(100); // the free pulls still built charge progress
  });

  it('recruit count bonus: earning a ticket at count 70 pools it (unspent, since no further pulls happen this banner)', () => {
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
    // The ticket earned on the last batch has nothing left to cover, so all 7 batches are paid in
    // pyroxene and the ticket sits in the pool for a later banner.
    expect(state.totalCost).toBe(7 * 1200);
    expect(state.ticketPool).toEqual([{ pullUnits: 10, expiresAt: expect.any(Number) as number, availableFrom: expect.any(Number) as number, fromGacha: true }]);
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
    state.obtainedInSim.add(PICKUP_ID);
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
    state.obtainedInSim.add(PICKUP_ID);
    const strat = makeStrategy({ minPulls: 60, maxHalfCharges: 5, claimRecruitBonus: true, recruitBonusThreshold: 10 });
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.totalPulls).toBe(70); // one extra 10-pull call to land exactly on the 70 milestone
    // The ticket earned on the last batch is pooled, not spent — the extra batch (7 vs. the disabled
    // case's 6) is a real cost, recouped only once the pooled ticket is later spent.
    expect(state.totalCost).toBe(7 * 1200);
    expect(state.ticketPool).toEqual([{ pullUnits: 10, expiresAt: expect.any(Number) as number, availableFrom: expect.any(Number) as number, fromGacha: true }]);
  });

  it('budget cutoff (maxHalfCharges) wins even when a milestone is within reach, without overshooting', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const state = makeState();
    state.owned.add(PICKUP_ID);
    state.obtainedInSim.add(PICKUP_ID);
    // Threshold widened to 40 so the "near" range (starting pull 90) crosses the 100-pull budget boundary
    // before the 130 milestone — the default 10 never spans a 100-boundary.
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
    state.obtainedInSim.add(PICKUP_ID);
    const strat = makeStrategy({ minPulls: 60, maxHalfCharges: 5, claimRecruitBonus: true, recruitBonusThreshold: 0 });
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.totalPulls).toBe(60); // never satisfies `next - pullsThisBanner <= 0`
    expect(state.totalCost).toBe(6 * 1200);
  });
});

describe('term-limited ticket pool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a ticket earned in one banner carries over and covers a pull in a later banner', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // never a natural/forced pickup

    const state = makeState();
    const banner1 = makeBanner({ id: 'b1', startTime: '2026-08-01 00:00' });
    const strat1 = makeStrategy({ bannerId: 'b1', studentConfigs: {}, minPulls: 70 }); // no targets -> pure filler pulls to earn the count-70 ticket
    simulateSingleBannerCharge(state, strat1, banner1, makePools());
    expect(state.totalCost).toBe(7 * 1200);
    expect(state.ticketPool).toEqual([{ pullUnits: 10, expiresAt: expect.any(Number) as number, availableFrom: expect.any(Number) as number, fromGacha: true }]);

    // Well within the ticket's 40-day window (banner1 start + 40d).
    const banner2 = makeBanner({ id: 'b2', startTime: '2026-08-15 00:00' });
    const strat2 = makeStrategy({ bannerId: 'b2', studentConfigs: {}, minPulls: 10 });
    simulateSingleBannerCharge(state, strat2, banner2, makePools());

    expect(state.totalCost).toBe(7 * 1200); // banner2's one batch was fully covered by the pooled ticket
    expect(state.ticketPool).toEqual([]); // spent, and pruned
  });

  it('a ticket past its expiry by the time a later banner starts is not spendable there', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const state = makeState();
    const banner1 = makeBanner({ id: 'b1', startTime: '2026-08-01 00:00' });
    const strat1 = makeStrategy({ bannerId: 'b1', studentConfigs: {}, minPulls: 70 });
    simulateSingleBannerCharge(state, strat1, banner1, makePools());
    expect(state.ticketPool).toEqual([{ pullUnits: 10, expiresAt: expect.any(Number) as number, availableFrom: expect.any(Number) as number, fromGacha: true }]);

    // 50 days later -> past banner1_start + 40d, so the ticket has already lapsed.
    const banner2 = makeBanner({ id: 'b2', startTime: '2026-09-20 00:00' });
    const strat2 = makeStrategy({ bannerId: 'b2', studentConfigs: {}, minPulls: 10 });
    simulateSingleBannerCharge(state, strat2, banner2, makePools());

    expect(state.totalCost).toBe(7 * 1200 + 1 * 1200); // banner2's batch had to be paid in pyroxene
    expect(state.ticketPool).toEqual([]); // the lapsed batch is pruned away, not left as dead weight
  });

  it('an infinite (expiresAt: null) ticket batch is always spendable, regardless of how far away the banner is', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const state = makeState({ ticketPool: [{ pullUnits: 10, expiresAt: null, availableFrom: 0, fromGacha: false }] });
    const banner = makeBanner({ startTime: '2030-01-01 00:00' }); // arbitrarily far in the future
    const strat = makeStrategy({ studentConfigs: {}, minPulls: 10 });
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.totalCost).toBe(0); // fully covered by the infinite batch
    expect(state.ticketPool).toEqual([]);
  });

  it('consumeExpiringTickets policy: forces extra filler pulls to drain a batch in the banner its expiry actually falls within', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const banner1 = makeBanner({ id: 'b1', startTime: '2026-08-01 00:00' });
    const strat1 = makeStrategy({ bannerId: 'b1', studentConfigs: {}, minPulls: 70 });
    // The ticket earned in banner1 expires ~40d later, inside banner2's window (not banner1's) —
    // that's where the drain policy should act.
    const banner2 = makeBanner({ id: 'b2', startTime: '2026-09-05 00:00', endTime: '2026-09-15 00:00' });
    const strat2 = makeStrategy({ bannerId: 'b2', studentConfigs: {}, minPulls: 0 });

    const wasted = makeState();
    simulateSingleBannerCharge(wasted, strat1, banner1, makePools());
    simulateSingleBannerCharge(wasted, strat2, banner2, makePools(), { consumeExpiringTickets: false });
    expect(wasted.totalPulls).toBe(70);
    expect(wasted.totalCost).toBe(7 * 1200);
    expect(wasted.ticketPool).toEqual([{ pullUnits: 10, expiresAt: expect.any(Number) as number, availableFrom: expect.any(Number) as number, fromGacha: true }]); // earned but left to lapse

    const drained = makeState();
    simulateSingleBannerCharge(drained, strat1, banner1, makePools());
    simulateSingleBannerCharge(drained, strat2, banner2, makePools(), { consumeExpiringTickets: true });
    expect(drained.totalPulls).toBe(80); // one extra forced batch in banner2 to use up the about-to-expire ticket
    expect(drained.totalCost).toBe(7 * 1200); // same net pyroxene cost -- the 8th batch was covered by the ticket instead of wasted
    expect(drained.ticketPool).toEqual([]);
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

describe('JS and WASM recruit charge parity', () => {
  it('produces equivalent aggregate results over many charge-system simulations', () => {
    initSync(readFileSync(resolve(process.cwd(), 'wasm/gacha-engine/pkg/gacha_engine_bg.wasm')));

    const banner = makeBanner({ id: 'charge-normal', freePulls: 20 });
    const limitedBanner = makeBanner({
      id: 'charge-limited',
      isLimitedBanner: true,
      pickupStudents: [makeStudent(PICKUP_ID + 1)],
    });
    const normalStrategy = makeStrategy({
      bannerId: banner.id,
      maxHalfCharges: 4,
      minPulls: 60,
      claimRecruitBonus: true,
      recruitBonusThreshold: 10,
    });
    const limitedStrategy = makeStrategy({
      bannerId: limitedBanner.id,
      maxHalfCharges: 4,
      studentConfigs: {
        [PICKUP_ID + 1]: { studentId: PICKUP_ID + 1, mode: 'opportunistic', priority: 1, opportunisticThreshold: 70, intentionalSpark: false, intentionalSparkThreshold: 20 },
      },
    });
    const bannersMap = { [banner.id]: banner, [limitedBanner.id]: limitedBanner };
    const students = [makeStudent(PICKUP_ID), makeStudent(PICKUP_ID + 1), makeStudent(SPOOK_ID), makeStudent(GRADE2_ID), makeStudent(GRADE1_ID)];
    const simCount = 30_000;

    const js = runGlobalSimulation([normalStrategy, limitedStrategy], bannersMap, students, { initialPyroxenes: 0, simCount });
    const payload = buildWasmPayload([normalStrategy, limitedStrategy], bannersMap, students);
    const wasm = JSON.parse(
      simulate_strategies_chunk(
        payload.strategiesJson,
        payload.bannerPoolsJson,
        simCount,
        0x1234n,
        new Uint32Array(payload.initialOwnedIds),
        payload.ticketBatchesJson,
        payload.consumeExpiringTickets,
      ),
    ) as {
      cost: Record<string, { sum: number; count: number }>;
      pulls: Record<string, { sum: number; count: number }>;
      eligmaCumulative: Record<string, { sum: number; count: number }>;
      successCount: number;
    };
    const average = (metric: Record<string, { sum: number; count: number }>) => metric.inf.sum / metric.inf.count;

    expect(average(wasm.cost)).toBeCloseTo(meanFromDist(js.cost.dist('inf')), -2);
    expect(average(wasm.pulls)).toBeCloseTo(meanFromDist(js.pulls.dist('inf')), 0);
    expect(average(wasm.eligmaCumulative)).toBeCloseTo(meanFromDist(js.eligmaCumulative.dist('inf')), -1);
    expect((wasm.successCount / simCount) * 100).toBeCloseTo(js.successRate, 0);
  });
});

describe('initialOwnedIds — pre-owned students raise average eligma', () => {
  it('a populated owned pool raises avgTotalEligma vs an empty owned pool, in both the JS and WASM engines', () => {
    initSync(readFileSync(resolve(process.cwd(), 'wasm/gacha-engine/pkg/gacha_engine_bg.wasm')));

    // With an empty owned pool, early grade2 hits are new (0-eligma) acquisitions before dupes kick in;
    // with the pool pre-owned, every hit is a dupe from pull #1 — a large, low-variance eligma gap.
    // minPulls is set well past coupon-collector expectation to keep this non-flaky.
    const grade2Pool = Array.from({ length: 30 }, (_, i) => makeStudent(13101 + i));
    const banner = makeBanner({ freePulls: 0 });
    const strategy = makeStrategy({ minPulls: 5000, maxHalfCharges: 50, studentConfigs: {} });
    const bannersMap = { [banner.id]: banner };
    const students = [makeStudent(PICKUP_ID), makeStudent(SPOOK_ID), makeStudent(GRADE1_ID), ...grade2Pool];
    const simCount = 200;
    const ownedIds = grade2Pool.map((s) => s.id);

    const jsUnowned = runGlobalSimulation([strategy], bannersMap, students, { initialPyroxenes: 0, simCount }, []);
    const jsOwned = runGlobalSimulation([strategy], bannersMap, students, { initialPyroxenes: 0, simCount }, ownedIds);
    expect(meanFromDist(jsOwned.eligmaCumulative.dist('inf'))).toBeGreaterThan(meanFromDist(jsUnowned.eligmaCumulative.dist('inf')) + 100);

    const runWasm = (owned: number[]) => {
      const payload = buildWasmPayload([strategy], bannersMap, students, owned);
      const raw = JSON.parse(
        simulate_strategies_chunk(
          payload.strategiesJson,
          payload.bannerPoolsJson,
          simCount,
          0xabcdn,
          new Uint32Array(payload.initialOwnedIds),
          payload.ticketBatchesJson,
          payload.consumeExpiringTickets,
        ),
      ) as { eligmaCumulative: Record<string, { sum: number; count: number }> };
      return raw.eligmaCumulative.inf.sum / raw.eligmaCumulative.inf.count;
    };
    const wasmUnownedAvg = runWasm([]);
    const wasmOwnedAvg = runWasm(ownedIds);
    expect(wasmOwnedAvg).toBeGreaterThan(wasmUnownedAvg + 100);

    // Both engines should land on a similar owned-pool average (relative tolerance, not absolute —
    // the JS engine uses real Math.random() while WASM uses a fixed seed, so exact equality isn't expected).
    expect(Math.abs(meanFromDist(jsOwned.eligmaCumulative.dist('inf')) - wasmOwnedAvg) / wasmOwnedAvg).toBeLessThan(0.1);
  });
});
