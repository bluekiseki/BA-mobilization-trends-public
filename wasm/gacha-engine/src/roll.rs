use crate::pool::GachaPools;
use crate::rates::{FES, NORMAL};

pub struct RollResult {
    pub id: u32,
    pub grade: u8,
    pub is_pickup: bool,
}

/// Pick a uniform random element from `items` excluding `exclude`.
/// Two-pass (count, then walk to index) — correct uniform distribution, no allocation.
#[inline]
fn pick_excluding(items: &[u32], exclude: u32, rng: f64) -> Option<u32> {
    let count = items.iter().filter(|&&id| id != exclude).count();
    if count == 0 {
        return None;
    }
    let target = ((rng * count as f64) as usize).min(count - 1);
    items
        .iter()
        .copied()
        .filter(|&id| id != exclude)
        .nth(target)
}

/// Pick from `fes` excluding `pickup_id` and every id in `exclude_list`.
#[inline]
fn pick_fes_spook(fes: &[u32], pickup_id: u32, exclude_list: &[u32], rng: f64) -> Option<u32> {
    let count = fes
        .iter()
        .filter(|&&id| id != pickup_id && !exclude_list.contains(&id))
        .count();
    if count == 0 {
        return None;
    }
    let target = ((rng * count as f64) as usize).min(count - 1);
    fes.iter()
        .copied()
        .filter(|&id| id != pickup_id && !exclude_list.contains(&id))
        .nth(target)
}

/// Pick from the combined normal-spook pool: grade3 + banner_pickup_ids, excluding pickup_id.
/// Mirrors JS: `[...pools.grade3, ...bannerPickupIds].filter(id => id !== pickupId)`
#[inline]
fn pick_normal_spook(
    grade3: &[u32],
    banner_pickup_ids: &[u32],
    pickup_id: u32,
    rng: f64,
) -> Option<u32> {
    let cnt_a = grade3.iter().filter(|&&id| id != pickup_id).count();
    let cnt_b = banner_pickup_ids
        .iter()
        .filter(|&&id| id != pickup_id)
        .count();
    let total = cnt_a + cnt_b;
    if total == 0 {
        return None;
    }
    let target = ((rng * total as f64) as usize).min(total - 1);
    if target < cnt_a {
        grade3
            .iter()
            .copied()
            .filter(|&id| id != pickup_id)
            .nth(target)
    } else {
        banner_pickup_ids
            .iter()
            .copied()
            .filter(|&id| id != pickup_id)
            .nth(target - cnt_a)
    }
}

// Port of gachaEngine.ts:rollSingle()
// rng must be in [0, 1)
pub fn roll_single(
    rng: f64,
    rng2: f64,
    is_10th: bool,
    is_fes: bool,
    pickup_id: u32,
    pools: &GachaPools,
    banner_pickup_ids: &[u32],
    fes_excluded_ids: &[u32],
) -> RollResult {
    let r3_threshold = if is_fes { FES.r3 } else { NORMAL.r3 };
    let r2_threshold = if is_fes { FES.r2 } else { NORMAL.r2 };
    let pickup_threshold = if is_fes { FES.pickup } else { NORMAL.pickup };

    if rng < r3_threshold {
        if rng < pickup_threshold {
            return RollResult {
                id: pickup_id,
                grade: 3,
                is_pickup: true,
            };
        }

        if is_fes {
            let fes_spook_threshold = pickup_threshold + FES.fes_spook;
            if rng < fes_spook_threshold {
                if let Some(id) = pick_fes_spook(pools.fes, pickup_id, fes_excluded_ids, rng2) {
                    return RollResult {
                        id,
                        grade: 3,
                        is_pickup: false,
                    };
                }
            }
            if let Some(id) = pick_excluding(pools.grade3, pickup_id, rng2) {
                return RollResult {
                    id,
                    grade: 3,
                    is_pickup: false,
                };
            }
        } else if let Some(id) = pick_normal_spook(pools.grade3, banner_pickup_ids, pickup_id, rng2)
        {
            return RollResult {
                id,
                grade: 3,
                is_pickup: false,
            };
        }

        return RollResult {
            id: pickup_id,
            grade: 3,
            is_pickup: false,
        };
    }

    if is_10th || rng < r3_threshold + r2_threshold {
        if !pools.grade2.is_empty() {
            let idx = (rng2 * pools.grade2.len() as f64) as usize;
            return RollResult {
                id: pools.grade2[idx.min(pools.grade2.len() - 1)],
                grade: 2,
                is_pickup: false,
            };
        }
    }

    if !pools.grade1.is_empty() {
        let idx = (rng2 * pools.grade1.len() as f64) as usize;
        return RollResult {
            id: pools.grade1[idx.min(pools.grade1.len() - 1)],
            grade: 1,
            is_pickup: false,
        };
    }

    RollResult {
        id: 0,
        grade: 1,
        is_pickup: false,
    }
}
