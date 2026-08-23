use rustc_hash::{FxHashMap, FxHashSet};
use serde::Deserialize;

use crate::banner::BannerPoolData;
use crate::pool::GachaPools;
use crate::roll::{roll_forced_3_star, roll_single};
use crate::sim_result::{BannerStatsSum, IndexedSimMetricAccumulator, SimChunkResult};
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

/// Raw recruit-charge simulation for the debug page.
pub fn run_charge_chunk(
    pools: &GachaPools,
    banner_pickup_ids: &[u32],
    fes_excluded_ids: &[u32],
    pickup_id: u32,
    is_fes: bool,
    pull_count: u32,
    initial_charge: u32,
    checkpoint_test_mode: bool,
    rng: &mut Rng,
) -> WasmStats {
    let mut stats = WasmStats::new();
    let mut charge = initial_charge;

    for pull_index in 0..pull_count {
        if checkpoint_test_mode {
            charge = 99;
        }
        charge += 1;
        let result = if charge == 200 {
            roll_forced_3_star(
                0.0,
                0.0,
                is_fes,
                pickup_id,
                pools,
                banner_pickup_ids,
                fes_excluded_ids,
                true,
            )
        } else if charge == 100 {
            let is_pickup = rng.next_f64() < 0.5;
            roll_forced_3_star(
                rng.next_f64(),
                rng.next_f64(),
                is_fes,
                pickup_id,
                pools,
                banner_pickup_ids,
                fes_excluded_ids,
                is_pickup,
            )
        } else {
            roll_single(
                rng.next_f64(),
                rng.next_f64(),
                pull_index % 10 == 9,
                is_fes,
                pickup_id,
                pools,
                banner_pickup_ids,
                fes_excluded_ids,
            )
        };
        if result.is_pickup {
            charge = 0;
        }
        stats.record(result.id, result.grade, result.is_pickup);
    }
    stats.charge = charge;
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
    owned: Vec<u8>,
    owned_touched: Vec<usize>,
    obtained_in_sim: Vec<u8>,
    obtained_touched: Vec<usize>,
    acquired_in_sim: Vec<usize>,
    eleph: Vec<u32>,
    eleph_present: Vec<u8>,
    eleph_touched: Vec<usize>,
    banner_eleph: Vec<u32>,
    banner_eleph_touched: Vec<usize>,
    total_eligma: u32,
    total_pulls: u32,
    total_cost: i32,
    charge_normal: u32,
    charge_limited: u32,
    /// Term-limited 10-pull ticket batches, spent before pyroxene. Persists across every banner in the
    /// strategy (processed in chronological order), seeded from `initial_ticket_batches` at the start of
    /// each run and topped up mid-run whenever a "Recruitment Count Bonus" ticket is earned.
    ticket_pool: Vec<TicketBatch>,
    /// Pyroxene-equivalent value of manually seeded tickets spent in this run. Expired unused tickets
    /// do not count, matching gachaEngine.ts's nonGachaTicketValueSpent.
    non_gacha_ticket_value_spent: u32,
}

impl SimState {
    fn new(student_count: usize) -> Self {
        Self {
            owned: vec![0; student_count],
            owned_touched: Vec::with_capacity(32),
            obtained_in_sim: vec![0; student_count],
            obtained_touched: Vec::with_capacity(32),
            acquired_in_sim: Vec::with_capacity(16),
            eleph: vec![0; student_count],
            eleph_present: vec![0; student_count],
            eleph_touched: Vec::with_capacity(32),
            banner_eleph: vec![0; student_count],
            banner_eleph_touched: Vec::with_capacity(16),
            total_eligma: 0,
            total_pulls: 0,
            total_cost: 0,
            charge_normal: 0,
            charge_limited: 0,
            ticket_pool: Vec::new(),
            non_gacha_ticket_value_spent: 0,
        }
    }

    #[inline]
    fn clear(&mut self) {
        for slot in self.owned_touched.drain(..) {
            self.owned[slot] = 0;
        }
        for slot in self.obtained_touched.drain(..) {
            self.obtained_in_sim[slot] = 0;
        }
        self.acquired_in_sim.clear();
        for slot in self.eleph_touched.drain(..) {
            self.eleph[slot] = 0;
            self.eleph_present[slot] = 0;
        }
        self.clear_banner_eleph();
        self.total_eligma = 0;
        self.total_pulls = 0;
        self.total_cost = 0;
        self.charge_normal = 0;
        self.charge_limited = 0;
        self.ticket_pool.clear();
        self.non_gacha_ticket_value_spent = 0;
    }

    #[inline(always)]
    fn mark_owned(&mut self, slot: usize) {
        if self.owned[slot] == 0 {
            self.owned[slot] = 1;
            self.owned_touched.push(slot);
        }
    }

    #[inline(always)]
    fn mark_obtained(&mut self, slot: usize) {
        if self.obtained_in_sim[slot] == 0 {
            self.obtained_in_sim[slot] = 1;
            self.obtained_touched.push(slot);
        }
    }

    #[inline(always)]
    fn add_eleph(&mut self, slot: usize, amount: u32) {
        if self.eleph_present[slot] == 0 {
            self.eleph_present[slot] = 1;
            self.eleph_touched.push(slot);
        }
        self.eleph[slot] += amount;
        if amount > 0 {
            if self.banner_eleph[slot] == 0 {
                self.banner_eleph_touched.push(slot);
            }
            self.banner_eleph[slot] += amount;
        }
    }

    #[inline]
    fn clear_banner_eleph(&mut self) {
        for slot in self.banner_eleph_touched.drain(..) {
            self.banner_eleph[slot] = 0;
        }
    }
}

struct StudentIndex {
    ids: Vec<u32>,
    slots: FxHashMap<u32, usize>,
    dense_slots: Option<Vec<u32>>,
}

impl StudentIndex {
    fn new(
        strategies: &[BannerStrategy],
        banner_pools: &FxHashMap<String, BannerPoolData>,
        initial_owned_ids: &[u32],
    ) -> Self {
        let mut unique_ids = FxHashSet::default();
        unique_ids.insert(0);
        unique_ids.extend(initial_owned_ids.iter().copied());
        for pool in banner_pools.values() {
            unique_ids.extend(pool.grade3.iter().copied());
            unique_ids.extend(pool.grade2.iter().copied());
            unique_ids.extend(pool.grade1.iter().copied());
            unique_ids.extend(pool.fes.iter().copied());
            unique_ids.extend(pool.banner_pickup_ids.iter().copied());
            unique_ids.extend(pool.fes_excluded_ids.iter().copied());
        }
        for strategy in strategies {
            unique_ids.extend(strategy.targets.iter().map(|target| target.student_id));
        }
        let mut ids: Vec<u32> = unique_ids.into_iter().collect();
        ids.sort_unstable();
        let slots = ids
            .iter()
            .enumerate()
            .map(|(slot, &student_id)| (student_id, slot))
            .collect();
        let max_id = ids.last().copied().unwrap_or(0) as usize;
        let dense_slots = (max_id <= 1_000_000).then(|| {
            let mut lookup = vec![u32::MAX; max_id + 1];
            for (slot, &student_id) in ids.iter().enumerate() {
                lookup[student_id as usize] = slot as u32;
            }
            lookup
        });
        Self {
            ids,
            slots,
            dense_slots,
        }
    }

    #[inline(always)]
    fn slot(&self, student_id: u32) -> usize {
        if let Some(dense_slots) = &self.dense_slots {
            dense_slots[student_id as usize] as usize
        } else {
            self.slots[&student_id]
        }
    }
}

// ─── Term-limited ticket pool ────────────────────────────────────────────────

/// A ticket batch, either seeded at the start of a run (initial_ticket_batches, from eraid/manual
/// sources) or pushed mid-run when a "Recruitment Count Bonus" ticket is earned. Mirrors
/// TicketPoolEntry/TicketBatch in gachaEngine.ts.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TicketBatch {
    pub pull_units: u32,
    /// Unix ms the batch stops being usable, or None for a batch that never expires.
    pub expires_at: Option<i64>,
    /// Unix ms when the batch becomes usable (0 means already held).
    #[serde(default)]
    pub available_from: i64,
    /// True for Recruitment Count Bonus tickets earned while simulating.
    #[serde(default)]
    pub from_gacha: bool,
}

const PULL_UNITS_PER_10PULL: u32 = 10;
const PYROXENE_PER_PULL_UNIT: u32 = 120;

/// Whether `expires_at` is still usable for a 10-pull happening at `banner_start_time`. Infinite (None)
/// batches are always usable.
fn is_ticket_usable_at(batch: &TicketBatch, at_time: i64) -> bool {
    batch.available_from <= at_time
        && match batch.expires_at {
            None => true,
            Some(e) => e > at_time,
        }
}

fn held_pyroxene_value(ticket_pool: &[TicketBatch], at_time: i64, gacha_only: bool) -> i64 {
    ticket_pool
        .iter()
        .filter(|batch| is_ticket_usable_at(batch, at_time) && (!gacha_only || batch.from_gacha))
        .map(|batch| i64::from(batch.pull_units) * i64::from(PYROXENE_PER_PULL_UNIT))
        .sum()
}

/// Attempts to cover one 10-pull action (10 pull-units) from `state.ticket_pool` instead of pyroxene.
/// Spends from the batch expiring soonest first (infinite/None-expiry batches last). Returns true if
/// fully covered (and mutates the pool + ticket_value_consumed), false otherwise.
fn consume_ticket_or_pyroxene(state: &mut SimState, banner_start_time: i64) -> bool {
    let total_available: u32 = state
        .ticket_pool
        .iter()
        .filter(|b| b.pull_units > 0 && is_ticket_usable_at(b, banner_start_time))
        .map(|b| b.pull_units)
        .sum();
    if total_available < PULL_UNITS_PER_10PULL {
        return false;
    }

    let mut indices: Vec<usize> = (0..state.ticket_pool.len())
        .filter(|&i| {
            state.ticket_pool[i].pull_units > 0
                && is_ticket_usable_at(&state.ticket_pool[i], banner_start_time)
        })
        .collect();
    indices.sort_by(|&a, &b| {
        match (
            state.ticket_pool[a].expires_at,
            state.ticket_pool[b].expires_at,
        ) {
            (None, None) => std::cmp::Ordering::Equal,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (Some(_), None) => std::cmp::Ordering::Less,
            (Some(x), Some(y)) => x.cmp(&y),
        }
    });

    let mut remaining = PULL_UNITS_PER_10PULL;
    for i in indices {
        if remaining == 0 {
            break;
        }
        let take = remaining.min(state.ticket_pool[i].pull_units);
        state.ticket_pool[i].pull_units -= take;
        if !state.ticket_pool[i].from_gacha {
            state.non_gacha_ticket_value_spent += take * PYROXENE_PER_PULL_UNIT;
        }
        remaining -= take;
    }
    true
}

/// Whether any non-infinite batch is about to expire at this banner (its last eligible banner) and
/// still has a full 10-pull worth of units.
fn has_expiring_ticket_to_drain(
    state: &SimState,
    banner_start_time: i64,
    banner_end_time: i64,
) -> bool {
    state.ticket_pool.iter().any(|b| {
        b.pull_units >= PULL_UNITS_PER_10PULL
            && b.expires_at
                .is_some_and(|e| is_ticket_usable_at(b, banner_start_time) && e <= banner_end_time)
    })
}

/// Drops fully-spent (and expired-and-unrecoverable) entries so the pool doesn't grow unboundedly.
fn prune_ticket_pool(state: &mut SimState, banner_start_time: i64) {
    state.ticket_pool.retain(|b| {
        b.pull_units > 0
            && (b.available_from > banner_start_time || is_ticket_usable_at(b, banner_start_time))
    });
}

fn recruit_count_reward(count: u32) -> (u32, u32) {
    if count <= 390 {
        let ticket = matches!(count, 70 | 130 | 150 | 170 | 270 | 330 | 350 | 370) as u32;
        let eligma = match count {
            30 | 230 => 10,
            110 | 310 => 20,
            _ => 0,
        };
        return (ticket, eligma);
    }
    let relative = ((count - 391) % 200) + 1;
    (0, if matches!(relative, 100 | 200) { 10 } else { 0 })
}

fn next_ticket_threshold(count: u32) -> Option<u32> {
    [70, 130, 150, 170, 270, 330, 350, 370]
        .into_iter()
        .find(|&threshold| threshold > count)
}

/// Port of gachaEngine.ts:recordResult()
/// Returns true if this is the first acquisition of the student.
fn record_result(
    state: &mut SimState,
    student_index: &StudentIndex,
    id: u32,
    grade: u8,
    is_pickup: bool,
    recall_flag: &RecallFlag,
) -> bool {
    let slot = student_index.slot(id);
    // A pre-owned student still completes a target when it appears in this simulation.
    state.mark_obtained(slot);
    let is_dupe = state.owned[slot] != 0;
    if !is_dupe {
        state.mark_owned(slot);
        state.acquired_in_sim.push(slot);
        if is_pickup {
            let bonus_eleph = if *recall_flag == RecallFlag::Acquired {
                0
            } else {
                PICKUP_NEW_ELEPH
            };
            state.add_eleph(slot, bonus_eleph);
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
    state.add_eleph(slot, eleph);
    false
}

/// Port of gachaEngine.ts:simulateSingleBannerCharge().
fn simulate_single_banner_charge(
    state: &mut SimState,
    student_index: &StudentIndex,
    strategy: &BannerStrategy,
    pool_data: &BannerPoolData,
    rng: &mut Rng,
    consume_expiring_tickets: bool,
) {
    let pools = GachaPools::new(
        &pool_data.grade3,
        &pool_data.grade2,
        &pool_data.grade1,
        &pool_data.fes,
    );
    let mut pulls_this_banner = 0;
    let mut current_free_pulls = pool_data.free_pulls;
    let mut recall_flag = if pool_data.is_recall {
        RecallFlag::NotAcquired
    } else {
        RecallFlag::None
    };
    let targets = &strategy.targets;

    let pull_ten_with_charge =
        |target_id: u32, state: &mut SimState, recall_flag: &mut RecallFlag, rng: &mut Rng| {
            for i in 0..10u32 {
                let charge = if pool_data.is_limited_banner {
                    &mut state.charge_limited
                } else {
                    &mut state.charge_normal
                };
                *charge += 1;
                let result = if *charge == 200 {
                    roll_forced_3_star(
                        0.0,
                        0.0,
                        pool_data.is_fes,
                        target_id,
                        &pools,
                        &pool_data.banner_pickup_ids,
                        &pool_data.fes_excluded_ids,
                        true,
                    )
                } else if *charge == 100 {
                    let is_pickup = rng.next_f64() < 0.5;
                    roll_forced_3_star(
                        rng.next_f64(),
                        rng.next_f64(),
                        pool_data.is_fes,
                        target_id,
                        &pools,
                        &pool_data.banner_pickup_ids,
                        &pool_data.fes_excluded_ids,
                        is_pickup,
                    )
                } else {
                    roll_single(
                        rng.next_f64(),
                        rng.next_f64(),
                        i == 9,
                        pool_data.is_fes,
                        target_id,
                        &pools,
                        &pool_data.banner_pickup_ids,
                        &pool_data.fes_excluded_ids,
                    )
                };
                let first_acq = record_result(
                    state,
                    student_index,
                    result.id,
                    result.grade,
                    result.is_pickup,
                    recall_flag,
                );
                if first_acq && *recall_flag == RecallFlag::NotAcquired {
                    *recall_flag = RecallFlag::Acquired;
                }
                if result.is_pickup {
                    if pool_data.is_limited_banner {
                        state.charge_limited = 0;
                    } else {
                        state.charge_normal = 0;
                    }
                }
            }
        };

    for target_config in targets {
        if state.obtained_in_sim[student_index.slot(target_config.student_id)] != 0 {
            continue;
        }
        let mut pulls_for_target = 0;
        loop {
            let is_obtained =
                state.obtained_in_sim[student_index.slot(target_config.student_id)] != 0;
            let has_free = current_free_pulls >= 10;
            if !has_free {
                if pulls_this_banner / 100 >= strategy.max_half_charges {
                    break;
                }
                match target_config.mode {
                    TargetMode::Must if is_obtained => break,
                    TargetMode::Opportunistic
                        if is_obtained
                            || pulls_for_target >= target_config.opportunistic_threshold =>
                    {
                        break
                    }
                    _ => {}
                }
            }

            state.total_pulls += 10;
            pulls_this_banner += 10;
            pulls_for_target += 10;
            if has_free {
                current_free_pulls -= 10;
            } else if !consume_ticket_or_pyroxene(state, pool_data.start_time) {
                state.total_cost += 1200;
            }
            let (tickets, eligma) = recruit_count_reward(pulls_this_banner);
            if tickets > 0 {
                state.ticket_pool.push(TicketBatch {
                    pull_units: tickets * 10,
                    expires_at: Some(pool_data.recruit_bonus_ticket_expiry),
                    available_from: 0,
                    from_gacha: true,
                });
            }
            state.total_eligma += eligma;
            pull_ten_with_charge(target_config.student_id, state, &mut recall_flag, rng);

            if !has_free && state.obtained_in_sim[student_index.slot(target_config.student_id)] != 0
            {
                break;
            }
        }
    }

    let filler_id = pool_data
        .banner_pickup_ids
        .first()
        .copied()
        .or_else(|| targets.first().map(|target| target.student_id))
        .unwrap_or(0);
    let is_near_recruit_bonus = |pulls: u32| {
        strategy.claim_recruit_bonus
            && next_ticket_threshold(pulls)
                .is_some_and(|next| next - pulls <= strategy.recruit_bonus_threshold)
    };
    while (pulls_this_banner < strategy.min_pulls
        || current_free_pulls >= 10
        || is_near_recruit_bonus(pulls_this_banner)
        || (consume_expiring_tickets
            && has_expiring_ticket_to_drain(state, pool_data.start_time, pool_data.end_time)))
        && pulls_this_banner / 100 < strategy.max_half_charges
    {
        let has_free = current_free_pulls >= 10;
        state.total_pulls += 10;
        pulls_this_banner += 10;
        if has_free {
            current_free_pulls -= 10;
        } else if !consume_ticket_or_pyroxene(state, pool_data.start_time) {
            state.total_cost += 1200;
        }
        let (tickets, eligma) = recruit_count_reward(pulls_this_banner);
        if tickets > 0 {
            state.ticket_pool.push(TicketBatch {
                pull_units: tickets * 10,
                expires_at: Some(pool_data.recruit_bonus_ticket_expiry),
                available_from: 0,
                from_gacha: true,
            });
        }
        state.total_eligma += eligma;
        pull_ten_with_charge(filler_id, state, &mut recall_flag, rng);
    }

    prune_ticket_pool(state, pool_data.start_time);
}

/// Port of gachaEngine.ts:simulateSingleBanner()
fn simulate_single_banner(
    state: &mut SimState,
    student_index: &StudentIndex,
    strategy: &BannerStrategy,
    pool_data: &BannerPoolData,
    rng: &mut Rng,
    consume_expiring_tickets: bool,
) {
    if pool_data.use_charge_system {
        simulate_single_banner_charge(
            state,
            student_index,
            strategy,
            pool_data,
            rng,
            consume_expiring_tickets,
        );
        return;
    }
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
        if state.obtained_in_sim[student_index.slot(target_config.student_id)] != 0
            && !target_config.intentional_spark
        {
            continue;
        }

        let remain_target_cnt = targets
            .iter()
            .filter(|t| state.obtained_in_sim[student_index.slot(t.student_id)] == 0)
            .count() as u32;
        if spark_points / 200 >= remain_target_cnt {
            break;
        }

        let current_target_id = target_config.student_id;

        loop {
            let is_obtained = state.obtained_in_sim[student_index.slot(current_target_id)] != 0;
            let has_free = current_free_pulls >= 10;

            if !has_free {
                let remain = targets
                    .iter()
                    .filter(|t| state.obtained_in_sim[student_index.slot(t.student_id)] == 0)
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
            } else if !consume_ticket_or_pyroxene(state, pool_data.start_time) {
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
                    student_index,
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
                && state.obtained_in_sim[student_index.slot(current_target_id)] != 0
                && !target_config.intentional_spark
            {
                break;
            }
        }
    }

    // ── Phase 2: minimum pull guarantee (also drains an about-to-expire ticket batch here when the
    // global consume_expiring_tickets policy is on and this is that batch's last eligible banner). ──
    let min_pulls = strategy.min_pulls;
    while (spark_points < min_pulls
        || (consume_expiring_tickets
            && has_expiring_ticket_to_drain(state, pool_data.start_time, pool_data.end_time)))
        && spark_points / 200 < strategy.max_sparks
    {
        let has_free = current_free_pulls >= 10;
        state.total_pulls += 10;
        spark_points += 10;
        if has_free {
            current_free_pulls -= 10;
        } else if !consume_ticket_or_pyroxene(state, pool_data.start_time) {
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
                student_index,
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
            .find(|t| {
                t.mode == TargetMode::Must
                    && state.obtained_in_sim[student_index.slot(t.student_id)] == 0
            })
            .or_else(|| {
                targets.iter().find(|t| {
                    t.mode == TargetMode::Opportunistic
                        && state.obtained_in_sim[student_index.slot(t.student_id)] == 0
                })
            })
            .or_else(|| targets.iter().find(|t| t.intentional_spark))
            .or_else(|| targets.first())
            .map(|t| t.student_id);

        if let Some(id) = spark_target_id {
            let first_acq = record_result(state, student_index, id, 3, true, &recall_flag);
            if first_acq && recall_flag == RecallFlag::NotAcquired {
                recall_flag = RecallFlag::Acquired;
            }
        }
    }

    prune_ticket_pool(state, pool_data.start_time);
}

/// Port of gachaEngine.ts:runGlobalSimulation() inner loop.
/// Runs `sim_count` independent simulations across all banners in order.
pub fn run_strategies_chunk(
    strategies: &[BannerStrategy],
    banner_pools: &FxHashMap<String, BannerPoolData>,
    sim_count: u32,
    rng: &mut Rng,
    initial_owned_ids: &[u32],
    initial_ticket_batches: &[TicketBatch],
    consume_expiring_tickets: bool,
) -> SimChunkResult {
    let mut result = SimChunkResult::new();

    // Match the JS engine's non-banner ticket checkpoints. A ticket batch can become available or expire
    // between banners, so its held value is recorded under the latest prior banner without re-simulating.
    let mut active_banners: Vec<(String, i64)> = strategies
        .iter()
        .filter_map(|strategy| {
            banner_pools
                .get(&strategy.banner_id)
                .map(|pool| (strategy.banner_id.clone(), pool.start_time))
        })
        .collect();
    active_banners.sort_by_key(|(_, start_time)| *start_time);
    let mut ticket_checkpoint_dates = FxHashSet::default();
    for strategy in strategies {
        if let Some(pool) = banner_pools.get(&strategy.banner_id) {
            ticket_checkpoint_dates.insert(pool.recruit_bonus_ticket_expiry);
        }
    }
    for batch in initial_ticket_batches {
        if batch.available_from > 0 {
            ticket_checkpoint_dates.insert(batch.available_from);
        }
        if let Some(expires_at) = batch.expires_at {
            ticket_checkpoint_dates.insert(expires_at);
        }
    }
    let mut extra_checkpoints_by_banner: FxHashMap<String, Vec<i64>> = FxHashMap::default();
    for date in ticket_checkpoint_dates {
        let anchor = active_banners
            .iter()
            .take_while(|(_, start_time)| *start_time <= date)
            .last();
        if let Some((banner_id, start_time)) = anchor {
            if date != *start_time {
                extra_checkpoints_by_banner
                    .entry(banner_id.clone())
                    .or_default()
                    .push(date);
            }
        }
    }

    // Resolve every checkpoint to a compact numeric slot before the simulation loop. The string map
    // is only used during setup and when serializing the completed chunk.
    let mut checkpoint_ids = Vec::new();
    let mut checkpoint_slots = FxHashMap::default();
    let mut banner_slots = Vec::with_capacity(strategies.len());
    for strategy in strategies {
        let slot = if let Some(&slot) = checkpoint_slots.get(&strategy.banner_id) {
            slot
        } else {
            let slot = checkpoint_ids.len();
            checkpoint_slots.insert(strategy.banner_id.clone(), slot);
            checkpoint_ids.push(strategy.banner_id.clone());
            slot
        };
        banner_slots.push(slot);
    }
    let mut extra_checkpoint_slots: Vec<Vec<(i64, usize)>> = Vec::with_capacity(strategies.len());
    for strategy in strategies {
        let mut slots = Vec::new();
        for &date in extra_checkpoints_by_banner
            .get(&strategy.banner_id)
            .into_iter()
            .flatten()
        {
            let checkpoint = format!("ticket-{date}");
            let slot = if let Some(&slot) = checkpoint_slots.get(&checkpoint) {
                slot
            } else {
                let slot = checkpoint_ids.len();
                checkpoint_slots.insert(checkpoint.clone(), slot);
                checkpoint_ids.push(checkpoint);
                slot
            };
            slots.push((date, slot));
        }
        extra_checkpoint_slots.push(slots);
    }
    let inf_slot = checkpoint_ids.len();
    checkpoint_slots.insert("inf".to_string(), inf_slot);
    checkpoint_ids.push("inf".to_string());

    let checkpoint_count = checkpoint_ids.len();
    let mut cost = IndexedSimMetricAccumulator::new(1200, checkpoint_count);
    let mut cost_incremental = IndexedSimMetricAccumulator::new(1200, checkpoint_count);
    let mut cost_with_tickets = IndexedSimMetricAccumulator::new(120, checkpoint_count);
    let mut cost_with_gacha_tickets = IndexedSimMetricAccumulator::new(120, checkpoint_count);
    let mut cost_with_gacha_tickets_incremental =
        IndexedSimMetricAccumulator::new(120, checkpoint_count);
    let mut pulls = IndexedSimMetricAccumulator::new(10, checkpoint_count);
    let mut pulls_incremental = IndexedSimMetricAccumulator::new(10, checkpoint_count);
    let mut eligma_cumulative = IndexedSimMetricAccumulator::new(1, checkpoint_count);
    let mut eligma_incremental = IndexedSimMetricAccumulator::new(1, checkpoint_count);
    let mut banner_stats_sum = vec![BannerStatsSum::default(); strategies.len()];
    let mut banner_student_eleph_dist: Vec<FxHashMap<u32, FxHashMap<u32, u32>>> =
        vec![FxHashMap::default(); strategies.len()];

    let student_index = StudentIndex::new(strategies, banner_pools, initial_owned_ids);
    let student_count = student_index.ids.len();
    let initial_owned_slots: Vec<usize> = initial_owned_ids
        .iter()
        .map(|&student_id| student_index.slot(student_id))
        .collect();
    let mut student_acquired_by_slot = vec![0u32; student_count];
    let mut student_eleph_total_by_slot = vec![0u64; student_count];
    let mut student_eleph_dist_by_slot: Vec<FxHashMap<u32, u32>> =
        (0..student_count).map(|_| FxHashMap::default()).collect();

    let mut state = SimState::new(student_count);
    for _ in 0..sim_count {
        let mut prev_cost_with_gacha_tickets = 0i64;
        state.clear();
        for &slot in &initial_owned_slots {
            state.mark_owned(slot);
        }
        state.ticket_pool.extend_from_slice(initial_ticket_batches);

        for (strategy_index, strategy) in strategies.iter().enumerate() {
            let Some(pool_data) = banner_pools.get(&strategy.banner_id) else {
                continue;
            };
            let banner_slot = banner_slots[strategy_index];
            let prev_pulls = state.total_pulls;
            let prev_cost = state.total_cost;
            let prev_eligma = state.total_eligma;
            state.clear_banner_eleph();

            simulate_single_banner(
                &mut state,
                &student_index,
                strategy,
                pool_data,
                rng,
                consume_expiring_tickets,
            );

            let start_time = pool_data.start_time;
            let cost_with_gacha_tickets_value = i64::from(state.total_cost)
                + i64::from(state.non_gacha_ticket_value_spent)
                - held_pyroxene_value(&state.ticket_pool, start_time, true);
            cost.push(banner_slot, i64::from(state.total_cost));
            cost_incremental.push(banner_slot, i64::from(state.total_cost - prev_cost));
            cost_with_tickets.push(
                banner_slot,
                i64::from(state.total_cost)
                    - held_pyroxene_value(&state.ticket_pool, start_time, false),
            );
            cost_with_gacha_tickets.push(banner_slot, cost_with_gacha_tickets_value);
            cost_with_gacha_tickets_incremental.push(
                banner_slot,
                cost_with_gacha_tickets_value - prev_cost_with_gacha_tickets,
            );
            pulls.push(banner_slot, i64::from(state.total_pulls));
            pulls_incremental.push(banner_slot, i64::from(state.total_pulls - prev_pulls));
            eligma_cumulative.push(banner_slot, i64::from(state.total_eligma));
            eligma_incremental.push(banner_slot, i64::from(state.total_eligma - prev_eligma));
            prev_cost_with_gacha_tickets = cost_with_gacha_tickets_value;
            let banner_stats = &mut banner_stats_sum[strategy_index];
            banner_stats.pulls += u64::from(state.total_pulls - prev_pulls);
            banner_stats.cost += i64::from(state.total_cost - prev_cost);

            for &(date, checkpoint_slot) in &extra_checkpoint_slots[strategy_index] {
                cost.push(checkpoint_slot, i64::from(state.total_cost));
                cost_with_tickets.push(
                    checkpoint_slot,
                    i64::from(state.total_cost)
                        - held_pyroxene_value(&state.ticket_pool, date, false),
                );
                cost_with_gacha_tickets.push(
                    checkpoint_slot,
                    i64::from(state.total_cost) + i64::from(state.non_gacha_ticket_value_spent)
                        - held_pyroxene_value(&state.ticket_pool, date, true),
                );
            }

            let banner_dist = &mut banner_student_eleph_dist[strategy_index];
            for &slot in &state.banner_eleph_touched {
                let student_id = student_index.ids[slot];
                let incr = state.banner_eleph[slot];
                *banner_dist
                    .entry(student_id)
                    .or_default()
                    .entry(incr)
                    .or_insert(0) += 1;
            }
        }

        cost.push(inf_slot, i64::from(state.total_cost));
        cost_with_tickets.push(
            inf_slot,
            i64::from(state.total_cost) - held_pyroxene_value(&state.ticket_pool, i64::MAX, false),
        );
        cost_with_gacha_tickets.push(
            inf_slot,
            i64::from(state.total_cost) + i64::from(state.non_gacha_ticket_value_spent)
                - held_pyroxene_value(&state.ticket_pool, i64::MAX, true),
        );
        pulls.push(inf_slot, i64::from(state.total_pulls));
        eligma_cumulative.push(inf_slot, i64::from(state.total_eligma));

        let success = strategies.iter().all(|s| {
            s.targets.iter().all(|t| {
                t.mode != TargetMode::Must
                    || state.obtained_in_sim[student_index.slot(t.student_id)] != 0
            })
        });
        if success {
            result.success_count += 1;
        }

        for &slot in &state.acquired_in_sim {
            student_acquired_by_slot[slot] += 1;
        }
        for &slot in &state.eleph_touched {
            let eleph = state.eleph[slot];
            student_eleph_total_by_slot[slot] += eleph as u64;
            *student_eleph_dist_by_slot[slot].entry(eleph).or_insert(0) += 1;
        }
    }

    result.cost = cost.into_serialized(&checkpoint_ids);
    result.cost_incremental = cost_incremental.into_serialized(&checkpoint_ids);
    result.cost_with_tickets = cost_with_tickets.into_serialized(&checkpoint_ids);
    result.cost_with_gacha_tickets = cost_with_gacha_tickets.into_serialized(&checkpoint_ids);
    result.cost_with_gacha_tickets_incremental =
        cost_with_gacha_tickets_incremental.into_serialized(&checkpoint_ids);
    result.pulls = pulls.into_serialized(&checkpoint_ids);
    result.pulls_incremental = pulls_incremental.into_serialized(&checkpoint_ids);
    result.eligma_cumulative = eligma_cumulative.into_serialized(&checkpoint_ids);
    result.eligma_incremental = eligma_incremental.into_serialized(&checkpoint_ids);
    for (strategy, stats) in strategies.iter().zip(banner_stats_sum) {
        let total = result
            .banner_stats_sum
            .entry(strategy.banner_id.clone())
            .or_default();
        total.pulls += stats.pulls;
        total.cost += stats.cost;
    }
    for (strategy, student_dists) in strategies.iter().zip(banner_student_eleph_dist) {
        let banner_dist = result
            .banner_student_eleph_dist
            .entry(strategy.banner_id.clone())
            .or_default();
        for (student_id, amounts) in student_dists {
            let student_dist = banner_dist.entry(student_id).or_default();
            for (amount, count) in amounts {
                *student_dist.entry(amount).or_insert(0) += count;
            }
        }
    }
    for (slot, &student_id) in student_index.ids.iter().enumerate() {
        let acquired = student_acquired_by_slot[slot];
        if acquired > 0 {
            result.student_acquired.insert(student_id, acquired);
        }
        let eleph_total = student_eleph_total_by_slot[slot];
        if eleph_total > 0 {
            result.student_eleph_total.insert(student_id, eleph_total);
        }
        let eleph_dist = std::mem::take(&mut student_eleph_dist_by_slot[slot]);
        if !eleph_dist.is_empty() {
            result.student_eleph_dist.insert(student_id, eleph_dist);
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
            is_limited_banner: false,
            is_recall: false,
            use_charge_system: false,
            free_pulls: 0,
            grade3: (10001u32..10050).collect(), // 49 students, pickup = 10001
            grade2: (13001u32..13020).collect(),
            grade1: (16001u32..16100).collect(),
            fes: vec![],
            banner_pickup_ids: vec![10001],
            fes_excluded_ids: vec![],
            start_time: 0,
            recruit_bonus_ticket_expiry: i64::MAX, // effectively unreachable in these tests unless explicitly overridden
            end_time: i64::MAX,
        }
    }

    fn must_strat(banner_id: &str, student_id: u32, max_sparks: u32) -> BannerStrategy {
        BannerStrategy {
            banner_id: banner_id.to_string(),
            max_sparks,
            max_half_charges: 2,
            claim_recruit_bonus: false,
            recruit_bonus_threshold: 10,
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

    /// Regression test: when banner_pickup_ids overlap with grade3 (e.g. a multi-pickup
    /// banner where some other pickups are already-released ★3 students in the normal
    /// pool), those overlapping ids must NOT get double the spook rate of everyone else.
    #[test]
    fn spook_pool_dedup_overlapping_banner_pickup_ids() {
        let pool = BannerPoolData {
            is_fes: false,
            is_limited_banner: false,
            is_recall: false,
            use_charge_system: false,
            free_pulls: 0,
            grade3: (10001u32..10050).collect(), // 49 students, main pickup = 10001
            grade2: (13001u32..13020).collect(),
            grade1: (16001u32..16100).collect(),
            fes: vec![],
            // 10002 and 10003 are also banner pickups AND already in grade3 (already released) —
            // they must not be double-counted in the spook pool.
            banner_pickup_ids: vec![10001, 10002, 10003],
            fes_excluded_ids: vec![],
            start_time: 0,
            recruit_bonus_ticket_expiry: i64::MAX,
            end_time: i64::MAX,
        };
        let pools = GachaPools::new(&pool.grade3, &pool.grade2, &pool.grade1, &pool.fes);
        let mut counts: FxHashMap<u32, u32> = FxHashMap::default();
        let mut rng = Rng::new(0xf00d);
        let n = 200_000u32;
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
        // grade3 (49) - pickup (10001) = 48 students should be uniformly distributed,
        // including 10002/10003 which also appear in banner_pickup_ids.
        let expected = n / 48;
        for (&id, &cnt) in &counts {
            let diff = (cnt as i32 - expected as i32).abs();
            assert!(
                diff < (expected / 4) as i32,
                "id {id} cnt {cnt} expected ~{expected} (overlap dedup failed if ~2x)"
            );
        }
    }

    // ── SimState Initialization Verification ─────────────────────────────────────

    #[test]
    fn simstate_clear_resets_all_fields() {
        let mut s = SimState::new(2);
        s.mark_owned(0);
        s.mark_owned(1);
        s.mark_obtained(0);
        s.acquired_in_sim.push(0);
        s.add_eleph(0, 200);
        s.total_cost = 120000;
        s.total_pulls = 1000;
        s.total_eligma = 300;
        s.clear();
        assert!(s.owned.iter().all(|&value| value == 0));
        assert!(s.obtained_in_sim.iter().all(|&value| value == 0));
        assert!(s.acquired_in_sim.is_empty());
        assert!(s.eleph.iter().all(|&value| value == 0));
        assert!(s.eleph_touched.is_empty());
        assert_eq!(s.total_cost, 0);
        assert_eq!(s.total_pulls, 0);
        assert_eq!(s.total_eligma, 0);
        assert_eq!(s.charge_normal, 0);
        assert_eq!(s.charge_limited, 0);
    }

    #[test]
    fn recruit_count_bonus_repeats_eligma_after_390_pulls() {
        assert_eq!(recruit_count_reward(30), (0, 10));
        assert_eq!(recruit_count_reward(370), (1, 0));
        assert_eq!(recruit_count_reward(490), (0, 10));
        assert_eq!(recruit_count_reward(590), (0, 10));
    }

    #[test]
    fn charge_system_respects_half_charge_budget_and_ticket_refund() {
        let mut pool = normal_pool();
        pool.use_charge_system = true;
        let mut strat = must_strat("b", 10001, 1);
        strat.max_half_charges = 1;
        strat.min_pulls = 100;
        strat.targets.clear();
        let result = run_strategies_chunk(
            &[strat],
            &pools_map("b", pool),
            100,
            &mut Rng::new(77),
            &[],
            &[],
            false,
        );

        assert_eq!(
            result.pulls.bucket("inf").unwrap().dist.get(&10),
            Some(&100)
        );
        assert_eq!(result.cost.bucket("inf").unwrap().dist.get(&9), Some(&100));
    }

    // ── Term-limited ticket pool ──────────────────────────────────────────────

    const MS_PER_DAY: i64 = 86_400_000;

    fn ticket_pool_banner(start_time: i64) -> BannerPoolData {
        let mut pool = normal_pool();
        pool.use_charge_system = true;
        pool.start_time = start_time;
        pool.recruit_bonus_ticket_expiry = start_time + 40 * MS_PER_DAY;
        pool
    }

    /// A charge-system strategy with no targets, so every pull is a pure min_pulls filler (deterministic
    /// pull count regardless of RNG outcome, since nothing ever gates on "obtained").
    fn filler_strat(banner_id: &str, min_pulls: u32) -> BannerStrategy {
        let mut s = must_strat(banner_id, 10001, 2);
        s.targets.clear();
        s.min_pulls = min_pulls;
        s
    }

    #[test]
    fn ticket_earned_in_one_banner_carries_over_to_a_later_banner() {
        let mut pools = FxHashMap::default();
        pools.insert("b1".to_string(), ticket_pool_banner(0));
        pools.insert("b2".to_string(), ticket_pool_banner(14 * MS_PER_DAY)); // well within b1's 40-day window
        let strategies = [filler_strat("b1", 70), filler_strat("b2", 10)];

        let result =
            run_strategies_chunk(&strategies, &pools, 1, &mut Rng::new(1), &[], &[], false);

        // 7 paid batches in b1 (earning a ticket on the 7th) + b2's one batch fully covered by that
        // pooled ticket -> total cost is still just those 7 batches worth of pyroxene.
        assert_eq!(result.pulls.bucket("inf").unwrap().sum, 80);
        assert_eq!(result.cost.bucket("inf").unwrap().sum, 7 * 1200);
    }

    #[test]
    fn ticket_already_expired_by_a_later_banner_is_not_spendable_there() {
        let mut pools = FxHashMap::default();
        pools.insert("b1".to_string(), ticket_pool_banner(0));
        pools.insert("b2".to_string(), ticket_pool_banner(50 * MS_PER_DAY)); // past b1's 40-day expiry
        let strategies = [filler_strat("b1", 70), filler_strat("b2", 10)];

        let result =
            run_strategies_chunk(&strategies, &pools, 1, &mut Rng::new(1), &[], &[], false);

        assert_eq!(result.pulls.bucket("inf").unwrap().sum, 80);
        assert_eq!(result.cost.bucket("inf").unwrap().sum, 7 * 1200 + 1 * 1200);
        // b2's batch had to be paid in pyroxene
    }

    #[test]
    fn infinite_ticket_batch_is_always_spendable_regardless_of_how_far_away_the_banner_is() {
        let mut pools = FxHashMap::default();
        pools.insert("b".to_string(), ticket_pool_banner(3_000_000_000_000)); // arbitrarily far in the future
        let strategies = [filler_strat("b", 10)];
        let infinite_batch = [TicketBatch {
            pull_units: 10,
            expires_at: None,
            available_from: 0,
            from_gacha: false,
        }];

        let result = run_strategies_chunk(
            &strategies,
            &pools,
            1,
            &mut Rng::new(1),
            &[],
            &infinite_batch,
            false,
        );

        assert_eq!(result.cost.bucket("inf").unwrap().sum, 0);
    }

    #[test]
    fn consume_expiring_tickets_policy_drains_a_batch_at_its_last_eligible_banner_instead_of_wasting_it(
    ) {
        let mut pools = FxHashMap::default();
        pools.insert("b1".to_string(), ticket_pool_banner(0));
        // b2 starts well past b1's ticket-earn expiry (b1_start + 40d), so b1 is that ticket's own last
        // eligible banner the moment it's earned. b2 itself contributes no pulls (min_pulls: 0, no targets).
        pools.insert("b2".to_string(), ticket_pool_banner(90 * MS_PER_DAY));
        let strategies = [filler_strat("b1", 70), filler_strat("b2", 0)];

        let wasted =
            run_strategies_chunk(&strategies, &pools, 1, &mut Rng::new(1), &[], &[], false);
        assert_eq!(wasted.pulls.bucket("inf").unwrap().sum, 70);
        assert_eq!(wasted.cost.bucket("inf").unwrap().sum, 7 * 1200); // ticket earned but left to lapse unused

        let drained =
            run_strategies_chunk(&strategies, &pools, 1, &mut Rng::new(1), &[], &[], true);
        assert_eq!(drained.pulls.bucket("inf").unwrap().sum, 80); // one extra forced batch to use up the about-to-expire ticket
        assert_eq!(drained.cost.bucket("inf").unwrap().sum, 7 * 1200); // same net pyroxene cost -- the 8th batch was covered by the ticket
    }

    // ── Strategy Simulation Accuracy ─────────────────────────────────────────────

    #[test]
    fn must_target_always_acquired() {
        // must + max_sparks=1 -> Must be acquired within 200 pulls
        let pools = pools_map("b", normal_pool());
        let strat = must_strat("b", 10001, 1);
        let mut rng = Rng::new(42);
        let r = run_strategies_chunk(&[strat], &pools, 2000, &mut rng, &[], &[], false);
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
        let r = run_strategies_chunk(&[strat], &pools, 500, &mut rng, &[], &[], false);
        let cost = r.cost.bucket("inf").unwrap();
        let pulls = r.pulls.bucket("inf").unwrap();
        assert_eq!(cost.sum, pulls.sum * 120);
    }

    #[test]
    fn spark_cost_at_most_240000() {
        // 1 spark = 200 pulls × 1200 = 240,000
        let pools = pools_map("b", normal_pool());
        let strat = must_strat("b", 10001, 1);
        let mut rng = Rng::new(99);
        let r = run_strategies_chunk(&[strat], &pools, 500, &mut rng, &[], &[], false);
        assert!(r
            .cost
            .bucket("inf")
            .unwrap()
            .dist
            .keys()
            .all(|bin| bin * 1200 <= 240_000));
    }

    #[test]
    fn same_seed_same_result() {
        // Same seed -> Same result (deterministic + no state leaks)
        let strat = || must_strat("b", 10001, 1);
        let pool = || pools_map("b", normal_pool());
        let r1 = run_strategies_chunk(
            &[strat()],
            &pool(),
            300,
            &mut Rng::new(1234),
            &[],
            &[],
            false,
        );
        let r2 = run_strategies_chunk(
            &[strat()],
            &pool(),
            300,
            &mut Rng::new(1234),
            &[],
            &[],
            false,
        );
        assert_eq!(r1.cost, r2.cost, "same seed should produce identical costs");
        assert_eq!(
            r1.pulls, r2.pulls,
            "same seed should produce identical pulls"
        );
    }

    #[test]
    fn empty_strategies_zero_cost() {
        let pools: FxHashMap<String, BannerPoolData> = FxHashMap::default();
        let r = run_strategies_chunk(&[], &pools, 100, &mut Rng::new(0), &[], &[], false);
        assert_eq!(r.cost.bucket("inf").unwrap().dist.get(&0), Some(&100));
        assert_eq!(r.pulls.bucket("inf").unwrap().dist.get(&0), Some(&100));
    }

    // ── Initial owned-id seeding (mirrors gachaEngine.ts's `initialOwnedIds`) ────

    /// `run_strategies_chunk`'s `initial_owned_ids` seeds `state.owned` at the start of every
    /// simulation via compact owned slots; this exercises `record_result` — the function
    /// that actually consults `state.owned` — directly to confirm a pre-owned id is treated as
    /// an immediate dupe (matches gachaEngine.ts's REWARDS.PICKUP_DUPE).
    #[test]
    fn record_result_treats_preowned_id_as_immediate_dupe() {
        let student_index = StudentIndex {
            ids: vec![10001],
            slots: [(10001, 0)].into_iter().collect(),
            dense_slots: None,
        };
        let mut state = SimState::new(1);
        state.mark_owned(0);
        let recall = RecallFlag::None;

        let is_new = record_result(&mut state, &student_index, 10001, 3, true, &recall);

        assert!(
            !is_new,
            "a pre-owned id must be recorded as a dupe, not a new acquisition"
        );
        assert_eq!(state.total_eligma, PICKUP_DUPE_ELIGMA);
        assert_eq!(state.eleph[0], PICKUP_DUPE_ELEPH);
    }

    #[test]
    fn preowned_target_is_not_considered_found_before_a_pull() {
        let mut strategy = must_strat("b", 10001, 1);
        strategy.max_half_charges = 1;
        let result = run_strategies_chunk(
            &[strategy],
            &pools_map("b", normal_pool()),
            1,
            &mut Rng::new(1234),
            &[10001],
            &[],
            false,
        );

        assert!(
            result.pulls.bucket("inf").unwrap().sum > 0,
            "a pre-owned target must still trigger pulls"
        );
    }

    #[test]
    fn owned_pool_raises_average_eligma() {
        // Force lots of rerolls via min_pulls so the filler pulls have many chances to hit
        // grade1/grade2 pool members; with a large pre-owned pool, most of those pulls land on
        // an already-owned id and pay out dupe eligma instead of 0.
        let make_pool = || {
            let mut pool = normal_pool();
            pool.grade1 = (16001u32..16021).collect(); // small pool so hits are frequent
            pool.grade2 = (13001u32..13006).collect();
            pool
        };
        let make_strat = || {
            let mut strat = must_strat("b", 10001, 1);
            strat.min_pulls = 2000;
            strat.targets.clear();
            strat
        };

        let without_owned = run_strategies_chunk(
            &[make_strat()],
            &pools_map("b", make_pool()),
            50,
            &mut Rng::new(555),
            &[],
            &[],
            false,
        );
        let owned_ids: Vec<u32> = (16001u32..16021).chain(13001u32..13006).collect();
        let with_owned = run_strategies_chunk(
            &[make_strat()],
            &pools_map("b", make_pool()),
            50,
            &mut Rng::new(555),
            &owned_ids,
            &[],
            false,
        );

        let avg = |r: &SimChunkResult| {
            let bucket = r.eligma_cumulative.bucket("inf").unwrap();
            bucket.sum as f64 / bucket.count as f64
        };
        assert!(
            avg(&with_owned) > avg(&without_owned),
            "avg eligma with pre-owned pool ({}) should exceed avg eligma with no owned students ({})",
            avg(&with_owned),
            avg(&without_owned)
        );
    }
}
