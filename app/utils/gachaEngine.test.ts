import { describe, it, expect, vi, afterEach } from 'vitest';
import { simulateSingleBannerCharge, rollSingle, runGlobalSimulation, createPoolForBanner, preprocessReleaseDates, type SimState, type GachaPools } from './gachaEngine';
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
  maxPull: 500,
  minPulls: 0,
  studentConfigs: {
    [PICKUP_ID]: { studentId: PICKUP_ID, mode: 'must', priority: 1, opportunisticThreshold: 50, intentionalSpark: false, intentionalSparkThreshold: 20 },
  },
  isFes: false,
  freePulls: 0,
  ...overrides,
});

describe('createPoolForBanner — launch-day students bypass first-pickup release gating', () => {
  const MAKI_ID = 10007; // launch-day, first pickup.csv row is a later spotlight, not her real debut
  const LATER_STUDENT_ID = 10200; // ordinary ★3, not launch-day — first pickup IS their real debut

  const makeStudentEntry = (id: number): Student => ({
    id,
    name: `student-${id}`,
    rarity: 3,
    isLimited: false,
    isFes: false,
    releaseDate: 0,
    isRerun: false,
  });

  it('KR: includes Maki in grade3 for a banner dated before her only recorded pickup', () => {
    const releaseDateMap = preprocessReleaseDates({
      spotlight: makeBanner({ id: 'spotlight', startTime: '2023-05-09 11:00', pickupStudents: [makeStudentEntry(MAKI_ID)] }),
    });

    const pools = createPoolForBanner([makeStudentEntry(MAKI_ID)], '2022-11-22 11:00', releaseDateMap, 'KR');

    expect(pools.grade3.some((s) => s.id === MAKI_ID)).toBe(true);
  });

  it('JP: includes Maki in grade3 for a banner dated before her only recorded pickup', () => {
    const releaseDateMap = preprocessReleaseDates({
      spotlight: makeBanner({ id: 'spotlight', startTime: '2022-11-09 11:00', pickupStudents: [makeStudentEntry(MAKI_ID)] }),
    });

    const pools = createPoolForBanner([makeStudentEntry(MAKI_ID)], '2021-06-30 12:30', releaseDateMap, 'JP');

    expect(pools.grade3.some((s) => s.id === MAKI_ID)).toBe(true);
  });

  it('still excludes a non-launch-day student from a pool dated before their real first pickup', () => {
    const releaseDateMap = preprocessReleaseDates({
      debut: makeBanner({ id: 'debut', startTime: '2023-05-09 11:00', pickupStudents: [makeStudentEntry(LATER_STUDENT_ID)] }),
    });

    const pools = createPoolForBanner([makeStudentEntry(LATER_STUDENT_ID)], '2022-11-22 11:00', releaseDateMap, 'KR');

    expect(pools.grade3.some((s) => s.id === LATER_STUDENT_ID)).toBe(false);
  });
});

describe('createPoolForBanner — Archive Recruitment roster', () => {
  const AKANE_BUNNY_ID = 20019;
  const ASUNA_BUNNY_ID = 10028;
  const MIKU_ID = 20007;
  const students = [makeStudent(AKANE_BUNNY_ID), makeStudent(ASUNA_BUNNY_ID), { ...makeStudent(MIKU_ID), isLimited: true }];
  const regions = [
    { region: 'KR', archiveStart: '2025-09-23', akaneRelease: '2023-04-11 11:00', asunaRelease: '2022-05-17 12:00', mikuRelease: '2022-06-14 12:00' },
    { region: 'JP', archiveStart: '2025-07-22', akaneRelease: '2022-10-12 11:00', asunaRelease: '2021-10-12 12:30', mikuRelease: '2021-11-03 12:30' },
  ] as const;

  for (const { region, archiveStart, akaneRelease, asunaRelease, mikuRelease } of regions) {
    const releaseDates = {
      [AKANE_BUNNY_ID]: new Date(akaneRelease).getTime(),
      [ASUNA_BUNNY_ID]: new Date(asunaRelease).getTime(),
      [MIKU_ID]: new Date(mikuRelease).getTime(),
    };
    const archiveStartMs = new Date(archiveStart).getTime();

    it(`${region}: includes both permanent bunny students before Archive Recruitment, but excludes limited Miku`, () => {
      const pools = createPoolForBanner(students, new Date(archiveStartMs - 1), releaseDates, region);

      expect(pools.grade3.map((student) => student.id)).toEqual([AKANE_BUNNY_ID, ASUNA_BUNNY_ID]);
    });

    it(`${region}: keeps Akane (Bunny) and excludes archive Asuna (Bunny) and limited Miku from Archive Recruitment's start`, () => {
      const pools = createPoolForBanner(students, new Date(archiveStartMs), releaseDates, region);

      expect(pools.grade3.map((student) => student.id)).toEqual([AKANE_BUNNY_ID]);
    });

    it(`${region}: still excludes Akane (Bunny) before her original release`, () => {
      const pools = createPoolForBanner(students, new Date(releaseDates[AKANE_BUNNY_ID] - 1), releaseDates, region);

      expect(pools.grade3.some((student) => student.id === AKANE_BUNNY_ID)).toBe(false);
    });
  }
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

  it('stops pulling once the maxPull budget is exhausted, even without a lucky natural pickup', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // never a natural pickup; the 100-count coin-flip also always misses (0.9 >= 0.5)

    const state = makeState();
    const strat = makeStrategy({ maxPull: 100 }); // 100-pull budget
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.owned.has(PICKUP_ID)).toBe(false);
    expect(state.totalPulls).toBe(100);
    expect(state.chargeNormal).toBe(100);
  });

  it('does not treat a pre-owned target as found before it is pulled', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // never a natural pickup; the 100-count coin-flip also misses

    const state = makeState({ owned: new Set([PICKUP_ID]) });
    const strat = makeStrategy({ maxPull: 100 });
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

  it('caps free pulls at maxPull (a low budget is how a user avoids draining all 100 free pulls here)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // never a natural pickup; the 100-count coin-flip also misses

    const state = makeState();
    const strat = makeStrategy({
      maxPull: 90,
      studentConfigs: { [PICKUP_ID]: { studentId: PICKUP_ID, mode: 'skip', priority: 1, opportunisticThreshold: 50, intentionalSpark: false, intentionalSparkThreshold: 20 } },
    });
    const banner = makeBanner({ freePulls: 100 });
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.totalPulls).toBe(90); // stops at the budget, leaving 10 free pulls unused
    expect(state.totalCost).toBe(0); // all covered by free pulls
    expect(state.chargeNormal).toBe(90); // 90 charge carried forward instead of 100
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

describe('simulateSingleBannerCharge — concurrent normal + limited pickups', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const LIMITED_ID = PICKUP_ID - 1;
  // The data layer merges same-window pickups into one BannerPeriod and flags the whole thing
  // isLimitedBanner=true if any pickup is limited. Recruit charge must still accrue per pickup type.
  const mixedBanner = (overrides: Partial<BannerPeriod> = {}): BannerPeriod =>
    makeBanner({
      isLimitedBanner: true,
      pickupStudents: [makeStudent(PICKUP_ID), { ...makeStudent(LIMITED_ID), isLimited: true }],
      ...overrides,
    });
  const soloTarget = (studentId: number, mode: 'must' | 'opportunistic' = 'must', opportunisticThreshold = 50) => ({
    [studentId]: { studentId, mode, priority: 1, opportunisticThreshold, intentionalSpark: false, intentionalSparkThreshold: 20 },
  });

  it('routes a normal-recruitment pull to chargeNormal, leaving chargeLimited untouched', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const state = makeState({ chargeNormal: 199, chargeLimited: 77 });
    const strat = makeStrategy({ studentConfigs: soloTarget(PICKUP_ID) });
    simulateSingleBannerCharge(state, strat, mixedBanner(), makePools());

    expect(state.owned.has(PICKUP_ID)).toBe(true);
    expect(state.chargeNormal).toBe(9); // 199 -> 200 forced pickup + reset -> recount 1..9
    expect(state.chargeLimited).toBe(77); // the limited counter never advances on a normal-pickup pull
  });

  it('routes a limited-recruitment pull to chargeLimited, leaving chargeNormal untouched', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const state = makeState({ chargeNormal: 77, chargeLimited: 199 });
    const strat = makeStrategy({ studentConfigs: soloTarget(LIMITED_ID) });
    simulateSingleBannerCharge(state, strat, mixedBanner(), makePools());

    expect(state.owned.has(LIMITED_ID)).toBe(true);
    expect(state.chargeLimited).toBe(9); // 199 -> 200 forced pickup + reset -> recount 1..9
    expect(state.chargeNormal).toBe(77); // the normal counter never advances on a limited-pickup pull
  });

  it('shares the recruit-count-bonus tally across both pickups in the period', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // never a natural or forced pickup within this budget

    const state = makeState();
    const strat = makeStrategy({
      maxPull: 70,
      studentConfigs: {
        ...soloTarget(PICKUP_ID, 'opportunistic', 40),
        [LIMITED_ID]: { studentId: LIMITED_ID, mode: 'opportunistic', priority: 2, opportunisticThreshold: 40, intentionalSpark: false, intentionalSparkThreshold: 20 },
      },
    });
    simulateSingleBannerCharge(state, strat, mixedBanner(), makePools());

    // 40 pulls chasing the normal pickup + 30 chasing the limited pickup = cumulative count 70, which earns
    // one 10-pull ticket. A per-pickup tally would never reach 70 on either side.
    expect(state.totalPulls).toBe(70);
    expect(state.chargeNormal).toBe(40);
    expect(state.chargeLimited).toBe(30);
    expect(state.ticketPool).toEqual([{ pullUnits: 10, expiresAt: expect.any(Number) as number, availableFrom: expect.any(Number) as number, fromGacha: true }]);
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
    const strat = makeStrategy({ minPulls: 60, maxPull: 500 }); // claimRecruitBonus omitted -> defaults to false
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
    const strat = makeStrategy({ minPulls: 60, maxPull: 500, claimRecruitBonus: true, recruitBonusThreshold: 10 });
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.totalPulls).toBe(70); // one extra 10-pull call to land exactly on the 70 milestone
    // The ticket earned on the last batch is pooled, not spent — the extra batch (7 vs. the disabled
    // case's 6) is a real cost, recouped only once the pooled ticket is later spent.
    expect(state.totalCost).toBe(7 * 1200);
    expect(state.ticketPool).toEqual([{ pullUnits: 10, expiresAt: expect.any(Number) as number, availableFrom: expect.any(Number) as number, fromGacha: true }]);
  });

  it('budget cutoff (maxPull) wins even when a milestone is within reach, without overshooting', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const state = makeState();
    state.owned.add(PICKUP_ID);
    state.obtainedInSim.add(PICKUP_ID);
    // Threshold widened to 40 so the "near" range (starting pull 90) crosses the 100-pull budget boundary
    // before the 130 milestone — the default 10 never spans a 100-boundary.
    const strat = makeStrategy({ minPulls: 90, maxPull: 100, claimRecruitBonus: true, recruitBonusThreshold: 40 });
    const banner = makeBanner();
    simulateSingleBannerCharge(state, strat, banner, makePools());

    expect(state.totalPulls).toBe(100); // budget (maxPull = 100) cuts it off before the 130 milestone
    expect(state.totalCost).toBe(10 * 1200 - 1200); // 10 paid batches minus the ticket earned in passing at count 70
  });

  it('recruitBonusThreshold: 0 behaves as disabled (the gap to any milestone is always >= 10)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);

    const state = makeState();
    state.owned.add(PICKUP_ID);
    state.obtainedInSim.add(PICKUP_ID);
    const strat = makeStrategy({ minPulls: 60, maxPull: 500, claimRecruitBonus: true, recruitBonusThreshold: 0 });
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
    const strat = makeStrategy({ maxPull: 1000 });
    const bannersMap = { [banner.id]: banner };
    const allStudents = [makeStudent(PICKUP_ID), makeStudent(SPOOK_ID), makeStudent(GRADE2_ID), makeStudent(GRADE1_ID)];

    const result = runGlobalSimulation([strat], bannersMap, allStudents, { initialPyroxenes: 0, simCount: 200 });
    expect(result.successRate).toBeGreaterThan(99);
  });
});
