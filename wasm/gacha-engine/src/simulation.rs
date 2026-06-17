use rustc_hash::{FxHashMap, FxHashSet};

use crate::banner::BannerPoolData;
use crate::pool::GachaPools;
use crate::roll::roll_single;
use crate::sim_result::SimChunkResult;
use crate::stats::WasmStats;
use crate::strategy::{BannerStrategy, TargetMode};

// ─── RNG ────────────────────────────────────────────────────────────────────

/// Simple xorshift64 RNG — fast, good enough for Monte Carlo simulation
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(if seed == 0 { 0xdeadbeef_cafebabe } else { seed })
    }

    #[inline(always)]
    pub fn next_f64(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        let bits = 0x3FF0_0000_0000_0000u64 | (self.0 >> 12);
        f64::from_bits(bits) - 1.0
    }
}

// ─── Raw pull chunk (existing) ───────────────────────────────────────────────

pub fn run_chunk(
    pools: &GachaPools,
    banner_pickup_ids: &[u32],
    fes_excluded_ids: &[u32],
    pickup_id: u32,
    is_fes: bool,
    pull_count: u32,
    rng: &mut Rng,
) -> WasmStats {
    let mut stats = WasmStats::new();
    let pulls_10 = pull_count / 10;
    let remainder = pull_count % 10;

    for _ in 0..pulls_10 {
        for i in 0..10u32 {
            let r1 = rng.next_f64();
            let r2 = rng.next_f64();
            let result = roll_single(
                r1,
                r2,
                i == 9,
                is_fes,
                pickup_id,
                pools,
                banner_pickup_ids,
                fes_excluded_ids,
            );
            stats.record(result.id, result.grade, result.is_pickup);
        }
    }

    for _ in 0..remainder {
        let r1 = rng.next_f64();
        let r2 = rng.next_f64();
        let result = roll_single(
            r1,
            r2,
            false,
            is_fes,
            pickup_id,
            pools,
            banner_pickup_ids,
            fes_excluded_ids,
        );
        stats.record(result.id, result.grade, result.is_pickup);
    }

    stats
}

// ─── Strategy simulation ─────────────────────────────────────────────────────

const PICKUP_DUPE_ELIGMA: u32 = 50;
const PICKUP_DUPE_ELEPH: u32 = 100;
const SPOOK_DUPE_ELIGMA: u32 = 50;
const SPOOK_DUPE_ELEPH: u32 = 30;
const TWO_STAR_DUPE_ELIGMA: u32 = 10;
const TWO_STAR_DUPE_ELEPH: u32 = 5;
const ONE_STAR_DUPE_ELIGMA: u32 = 1;
const ONE_STAR_DUPE_ELEPH: u32 = 1;
const PICKUP_NEW_ELEPH: u32 = 100;

#[derive(Clone, PartialEq)]
enum RecallFlag {
    None,
    NotAcquired,
    Acquired,
}

struct SimState {
    owned: FxHashSet<u32>,
    acquired_in_sim: FxHashSet<u32>,
    eleph: FxHashMap<u32, u32>,
    total_eligma: u32,
    total_pulls: u32,
    total_cost: u32,
}

impl SimState {
    fn new() -> Self {
        Self {
            owned: FxHashSet::with_capacity_and_hasher(16, Default::default()),
            acquired_in_sim: FxHashSet::with_capacity_and_hasher(16, Default::default()),
            eleph: FxHashMap::with_capacity_and_hasher(16, Default::default()),
            total_eligma: 0,
            total_pulls: 0,
            total_cost: 0,
        }
    }

    #[inline]
    fn clear(&mut self) {
        self.owned.clear();
        self.acquired_in_sim.clear();
        self.eleph.clear();
        self.total_eligma = 0;
        self.total_pulls = 0;
        self.total_cost = 0;
    }
}

/// Port of gachaEngine.ts:recordResult()
/// Returns true if this is the first acquisition of the student.
fn record_result(
    state: &mut SimState,
    id: u32,
    grade: u8,
    is_pickup: bool,
    recall_flag: &RecallFlag,
) -> bool {
    let is_dupe = state.owned.contains(&id);
    if !is_dupe {
        state.owned.insert(id);
        state.acquired_in_sim.insert(id);
        if is_pickup {
            let bonus_eleph = if *recall_flag == RecallFlag::Acquired {
                0
            } else {
                PICKUP_NEW_ELEPH
            };
            *state.eleph.entry(id).or_insert(0) += bonus_eleph;
            return true;
        }
        return false;
    }

    let (eligma, eleph) = match grade {
        3 if is_pickup => (PICKUP_DUPE_ELIGMA, PICKUP_DUPE_ELEPH),
        3 => (SPOOK_DUPE_ELIGMA, SPOOK_DUPE_ELEPH),
        2 => (TWO_STAR_DUPE_ELIGMA, TWO_STAR_DUPE_ELEPH),
        _ => (ONE_STAR_DUPE_ELIGMA, ONE_STAR_DUPE_ELEPH),
    };
    state.total_eligma += eligma;
    *state.eleph.entry(id).or_insert(0) += eleph;
    false
}

/// Port of gachaEngine.ts:simulateSingleBanner()
fn simulate_single_banner(
    state: &mut SimState,
    strategy: &BannerStrategy,
    pool_data: &BannerPoolData,
    rng: &mut Rng,
) {
    let pools = GachaPools::new(
        &pool_data.grade3,
        &pool_data.grade2,
        &pool_data.grade1,
        &pool_data.fes,
    );
    let mut spark_points: u32 = 0;
    let mut current_free_pulls = pool_data.free_pulls;
    let mut recall_flag = if pool_data.is_recall {
        RecallFlag::NotAcquired
    } else {
        RecallFlag::None
    };

    let targets = &strategy.targets;

    // ── Phase 1: pull per target ──────────────────────────────────────────
    for target_config in targets {
        if state.owned.contains(&target_config.student_id) && !target_config.intentional_spark {
            continue;
        }

        let remain_target_cnt = targets
            .iter()
            .filter(|t| !state.owned.contains(&t.student_id))
            .count() as u32;
        if spark_points / 200 >= remain_target_cnt {
            break;
        }

        let current_target_id = target_config.student_id;

        loop {
            let is_obtained = state.owned.contains(&current_target_id);
            let has_free = current_free_pulls >= 10;

            if !has_free {
                let remain = targets
                    .iter()
                    .filter(|t| !state.owned.contains(&t.student_id))
                    .count() as u32;
                if spark_points / 200 >= remain {
                    break;
                }
                if spark_points / 200 >= strategy.max_sparks {
                    break;
                }

                match target_config.mode {
                    TargetMode::Must => {
                        if is_obtained {
                            break;
                        }
                    }
                    TargetMode::Opportunistic => {
                        if is_obtained {
                            break;
                        }
                        if 200u32.saturating_sub(spark_points % 200)
                            > target_config.opportunistic_threshold
                        {
                            break;
                        }
                    }
                }

                if target_config.intentional_spark && is_obtained {
                    let threshold = target_config.intentional_spark_threshold;
                    if 200u32.saturating_sub(spark_points % 200) > threshold {
                        break;
                    }
                }
            }

            // ── Execute 10-pull ──
            state.total_pulls += 10;
            spark_points += 10;
            if has_free {
                current_free_pulls -= 10;
            } else {
                state.total_cost += 1200;
            }

            for i in 0..10u32 {
                let r1 = rng.next_f64();
                let r2 = rng.next_f64();
                let result = roll_single(
                    r1,
                    r2,
                    i == 9,
                    pool_data.is_fes,
                    current_target_id,
                    &pools,
                    &pool_data.banner_pickup_ids,
                    &pool_data.fes_excluded_ids,
                );
                let first_acq = record_result(
                    state,
                    result.id,
                    result.grade,
                    result.is_pickup,
                    &recall_flag,
                );
                if first_acq && recall_flag == RecallFlag::NotAcquired {
                    recall_flag = RecallFlag::Acquired;
                }
            }

            if !has_free
                && state.owned.contains(&current_target_id)
                && !target_config.intentional_spark
            {
                break;
            }
        }
    }

    // ── Phase 2: minimum pull guarantee ──────────────────────────────────
    let min_pulls = strategy.min_pulls;
    while spark_points < min_pulls && spark_points / 200 < strategy.max_sparks {
        let has_free = current_free_pulls >= 10;
        state.total_pulls += 10;
        spark_points += 10;
        if has_free {
            current_free_pulls -= 10;
        } else {
            state.total_cost += 1200;
        }

        let filler_id = pool_data.banner_pickup_ids.first().copied().unwrap_or(0);
        for i in 0..10u32 {
            let r1 = rng.next_f64();
            let r2 = rng.next_f64();
            let result = roll_single(
                r1,
                r2,
                i == 9,
                pool_data.is_fes,
                filler_id,
                &pools,
                &pool_data.banner_pickup_ids,
                &pool_data.fes_excluded_ids,
            );
            let first_acq = record_result(
                state,
                result.id,
                result.grade,
                result.is_pickup,
                &recall_flag,
            );
            if first_acq && recall_flag == RecallFlag::NotAcquired {
                recall_flag = RecallFlag::Acquired;
            }
        }
    }

    // ── Phase 3: spark exchange ───────────────────────────────────────────
    let available_sparks = spark_points / 200;
    for _ in 0..available_sparks {
        let spark_target_id = targets
            .iter()
            .find(|t| t.mode == TargetMode::Must && !state.owned.contains(&t.student_id))
            .or_else(|| {
                targets.iter().find(|t| {
                    t.mode == TargetMode::Opportunistic && !state.owned.contains(&t.student_id)
                })
            })
            .or_else(|| targets.iter().find(|t| t.intentional_spark))
            .or_else(|| targets.first())
            .map(|t| t.student_id);

        if let Some(id) = spark_target_id {
            let first_acq = record_result(state, id, 3, true, &recall_flag);
            if first_acq && recall_flag == RecallFlag::NotAcquired {
                recall_flag = RecallFlag::Acquired;
            }
        }
    }
}

/// Port of gachaEngine.ts:runGlobalSimulation() inner loop.
/// Runs `sim_count` independent simulations across all banners in order.
pub fn run_strategies_chunk(
    strategies: &[BannerStrategy],
    banner_pools: &FxHashMap<String, BannerPoolData>,
    sim_count: u32,
    rng: &mut Rng,
) -> SimChunkResult {
    let mut result = SimChunkResult::default();
    result.costs.reserve(sim_count as usize);
    result.pulls.reserve(sim_count as usize);

    // Pre-initialize banner_costs keys
    for s in strategies {
        result
            .banner_costs
            .entry(s.banner_id.clone())
            .or_insert_with(|| {
                let mut v = Vec::new();
                v.reserve(sim_count as usize);
                v
            });
    }

    let mut state = SimState::new();
    for _ in 0..sim_count {
        state.clear();

        for strategy in strategies {
            let Some(pool_data) = banner_pools.get(&strategy.banner_id) else {
                continue;
            };
            let prev_cost = state.total_cost;
            simulate_single_banner(&mut state, strategy, pool_data, rng);

            result
                .banner_costs
                .get_mut(&strategy.banner_id)
                .unwrap()
                .push(state.total_cost);

            let _ = prev_cost; // cumulative cost at end of this banner
        }

        result.costs.push(state.total_cost);
        result.pulls.push(state.total_pulls);
        result.total_eligma_sum += state.total_eligma as u64;

        // Success: all "must" targets acquired
        let success = strategies.iter().all(|s| {
            s.targets
                .iter()
                .all(|t| t.mode != TargetMode::Must || state.owned.contains(&t.student_id))
        });
        if success {
            result.success_count += 1;
        }

        // Aggregate student stats
        for id in &state.acquired_in_sim {
            *result.student_acquired.entry(*id).or_insert(0) += 1;
        }
        for (id, eleph) in &state.eleph {
            *result.student_eleph_total.entry(*id).or_insert(0) += *eleph as u64;
            *result
                .student_eleph_dist
                .entry(*id)
                .or_default()
                .entry(*eleph)
                .or_insert(0) += 1;
        }
    }

    result
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::banner::BannerPoolData;
    use crate::pool::GachaPools;
    use crate::roll::roll_single;
    use crate::strategy::{BannerStrategy, TargetConfig, TargetMode};

    fn normal_pool() -> BannerPoolData {
        BannerPoolData {
            is_fes: false,
            is_recall: false,
            free_pulls: 0,
            grade3: (10001u32..10050).collect(), // 49 students, pickup = 10001
            grade2: (13001u32..13020).collect(),
            grade1: (16001u32..16100).collect(),
            fes: vec![],
            banner_pickup_ids: vec![10001],
            fes_excluded_ids: vec![],
        }
    }

    fn must_strat(banner_id: &str, student_id: u32, max_sparks: u32) -> BannerStrategy {
        BannerStrategy {
            banner_id: banner_id.to_string(),
            max_sparks,
            min_pulls: 0,
            targets: vec![TargetConfig {
                student_id,
                mode: TargetMode::Must,
                opportunistic_threshold: 50,
                intentional_spark: false,
                intentional_spark_threshold: 20,
            }],
        }
    }

    fn pools_map(banner_id: &str, pool: BannerPoolData) -> FxHashMap<String, BannerPoolData> {
        let mut m = FxHashMap::default();
        m.insert(banner_id.to_string(), pool);
        m
    }

    // ── Probability Verification ──────────────────────────────────────────────────

    #[test]
    fn grade_distribution_normal() {
        let pool = normal_pool();
        let pools = GachaPools::new(&pool.grade3, &pool.grade2, &pool.grade1, &pool.fes);
        let mut rng = Rng::new(0xdeadbeef);
        let n = 200_000u32;
        let (mut g3, mut g2, mut pickup) = (0u32, 0u32, 0u32);
        for _ in 0..n {
            let r = roll_single(
                rng.next_f64(),
                rng.next_f64(),
                false,
                false,
                10001,
                &pools,
                &pool.banner_pickup_ids,
                &pool.fes_excluded_ids,
            );
            match r.grade {
                3 => {
                    g3 += 1;
                    if r.is_pickup {
                        pickup += 1;
                    }
                }
                2 => g2 += 1,
                _ => {}
            }
        }
        let pct = |x: u32| x as f64 / n as f64;
        assert!(
            (pct(g3) - 0.03).abs() < 0.002,
            "grade3 {:.4} ≠ 0.03",
            pct(g3)
        );
        assert!(
            (pct(g2) - 0.185).abs() < 0.003,
            "grade2 {:.4} ≠ 0.185",
            pct(g2)
        );
        assert!(
            (pct(pickup) - 0.007).abs() < 0.001,
            "pickup {:.4} ≠ 0.007",
            pct(pickup)
        );
    }

    #[test]
    fn grade_distribution_fes() {
        let mut pool = normal_pool();
        pool.is_fes = true;
        pool.fes = (20001u32..20010).collect();
        let pools = GachaPools::new(&pool.grade3, &pool.grade2, &pool.grade1, &pool.fes);
        let mut rng = Rng::new(0xcafe);
        let n = 200_000u32;
        let mut g3 = 0u32;
        for _ in 0..n {
            let r = roll_single(
                rng.next_f64(),
                rng.next_f64(),
                false,
                true,
                10001,
                &pools,
                &pool.banner_pickup_ids,
                &pool.fes_excluded_ids,
            );
            if r.grade == 3 {
                g3 += 1;
            }
        }
        let rate = g3 as f64 / n as f64;
        assert!((rate - 0.06).abs() < 0.003, "FES grade3 {:.4} ≠ 0.06", rate);
    }

    // ── Spook Pool Uniformity ───────────────────────────────────────────────────

    #[test]
    fn spook_pool_uniform() {
        // Force RNG into grade3-spook range (0.007~0.03) to extract only spooks
        let pool = normal_pool();
        let pools = GachaPools::new(&pool.grade3, &pool.grade2, &pool.grade1, &pool.fes);
        let mut counts: FxHashMap<u32, u32> = FxHashMap::default();
        let mut rng = Rng::new(0xbabe);
        let n = 100_000u32;
        for _ in 0..n {
            let r1 = 0.007 + rng.next_f64() * (0.03 - 0.007); // Always spook range
            let r2 = rng.next_f64();
            let res = roll_single(
                r1,
                r2,
                false,
                false,
                10001,
                &pools,
                &pool.banner_pickup_ids,
                &pool.fes_excluded_ids,
            );
            assert_eq!(res.grade, 3);
            assert!(!res.is_pickup);
            *counts.entry(res.id).or_insert(0) += 1;
        }
        // grade3 (49 students) - pickup (10001) = 48 students should be uniformly distributed
        let expected = n / 48;
        for (&id, &cnt) in &counts {
            let diff = (cnt as i32 - expected as i32).abs();
            assert!(
                diff < (expected / 4) as i32,
                "id {id} cnt {cnt} expected ~{expected}"
            );
        }
    }

    // ── SimState Initialization Verification ─────────────────────────────────────

    #[test]
    fn simstate_clear_resets_all_fields() {
        let mut s = SimState::new();
        s.owned.insert(10001);
        s.owned.insert(10002);
        s.acquired_in_sim.insert(10001);
        s.eleph.insert(10001, 200);
        s.total_cost = 120000;
        s.total_pulls = 1000;
        s.total_eligma = 300;
        s.clear();
        assert!(s.owned.is_empty());
        assert!(s.acquired_in_sim.is_empty());
        assert!(s.eleph.is_empty());
        assert_eq!(s.total_cost, 0);
        assert_eq!(s.total_pulls, 0);
        assert_eq!(s.total_eligma, 0);
    }

    // ── Strategy Simulation Accuracy ─────────────────────────────────────────────

    #[test]
    fn must_target_always_acquired() {
        // must + max_sparks=1 -> Must be acquired within 200 pulls
        let pools = pools_map("b", normal_pool());
        let strat = must_strat("b", 10001, 1);
        let mut rng = Rng::new(42);
        let r = run_strategies_chunk(&[strat], &pools, 2000, &mut rng);
        assert_eq!(
            r.success_count, 2000,
            "must target with spark: {}/2000 success",
            r.success_count
        );
    }

    #[test]
    fn cost_equals_pulls_over_10_times_1200() {
        // Since free_pulls=0, cost must equal (pulls/10) * 1200
        let pools = pools_map("b", normal_pool());
        let strat = must_strat("b", 10001, 1);
        let mut rng = Rng::new(7);
        let r = run_strategies_chunk(&[strat], &pools, 500, &mut rng);
        for i in 0..r.costs.len() {
            let expected = (r.pulls[i] / 10) * 1200;
            assert_eq!(
                r.costs[i], expected,
                "sim {i}: cost {} ≠ pulls {}/10*1200={}",
                r.costs[i], r.pulls[i], expected
            );
        }
    }

    #[test]
    fn spark_cost_at_most_240000() {
        // 1 spark = 200 pulls × 1200 = 240,000
        let pools = pools_map("b", normal_pool());
        let strat = must_strat("b", 10001, 1);
        let mut rng = Rng::new(99);
        let r = run_strategies_chunk(&[strat], &pools, 500, &mut rng);
        for &c in &r.costs {
            assert!(c <= 240_000, "cost {c} > max 240,000");
        }
    }

    #[test]
    fn same_seed_same_result() {
        // Same seed -> Same result (deterministic + no state leaks)
        let strat = || must_strat("b", 10001, 1);
        let pool = || pools_map("b", normal_pool());
        let r1 = run_strategies_chunk(&[strat()], &pool(), 300, &mut Rng::new(1234));
        let r2 = run_strategies_chunk(&[strat()], &pool(), 300, &mut Rng::new(1234));
        assert_eq!(
            r1.costs, r2.costs,
            "same seed should produce identical costs"
        );
        assert_eq!(
            r1.pulls, r2.pulls,
            "same seed should produce identical pulls"
        );
    }

    #[test]
    fn empty_strategies_zero_cost() {
        let pools: FxHashMap<String, BannerPoolData> = FxHashMap::default();
        let r = run_strategies_chunk(&[], &pools, 100, &mut Rng::new(0));
        assert!(r.costs.iter().all(|&c| c == 0));
        assert!(r.pulls.iter().all(|&p| p == 0));
    }
}
