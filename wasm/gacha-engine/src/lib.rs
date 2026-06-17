mod banner;
mod pool;
mod rates;
mod roll;
mod sim_result;
mod simulation;
mod stats;
mod strategy;

use pool::GachaPools;
use simulation::{run_chunk, run_strategies_chunk, Rng};
use wasm_bindgen::prelude::*;

use crate::stats::WasmStats;

/// Raw pull simulation for debug/testing (single banner, no strategy logic).
#[wasm_bindgen]
pub fn gacha_run_chunk(
    grade3_ids: &[u32],
    grade2_ids: &[u32],
    grade1_ids: &[u32],
    fes_ids: &[u32],
    fes_excluded_ids: &[u32],
    banner_pickup_ids: &[u32],
    pickup_id: u32,
    is_fes: bool,
    pull_count: u32,
    rng_seed: u64,
) -> WasmStats {
    let pools = GachaPools::new(grade3_ids, grade2_ids, grade1_ids, fes_ids);
    let mut rng = Rng::new(rng_seed);
    run_chunk(
        &pools,
        banner_pickup_ids,
        fes_excluded_ids,
        pickup_id,
        is_fes,
        pull_count,
        &mut rng,
    )
}

/// Full strategy simulation (multi-banner, spark, targeting).
/// strategies_json: JSON array of BannerStrategy (targets sorted by priority)
/// banner_pools_json: JSON object mapping bannerId → BannerPoolData
/// Returns SimChunkResult as JSON string.
#[wasm_bindgen]
pub fn simulate_strategies_chunk(
    strategies_json: &str,
    banner_pools_json: &str,
    sim_count: u32,
    rng_seed: u64,
) -> String {
    let strategies: Vec<strategy::BannerStrategy> = match serde_json::from_str(strategies_json) {
        Ok(v) => v,
        Err(e) => {
            return format!("{{\"error\":\"strategies parse error: {}\"}}", e);
        }
    };

    let banner_pools: rustc_hash::FxHashMap<String, banner::BannerPoolData> =
        match serde_json::from_str(banner_pools_json) {
            Ok(v) => v,
            Err(e) => {
                return format!("{{\"error\":\"banner_pools parse error: {}\"}}", e);
            }
        };

    let mut rng = Rng::new(rng_seed);
    let result = run_strategies_chunk(&strategies, &banner_pools, sim_count, &mut rng);

    match serde_json::to_string(&result) {
        Ok(s) => s,
        Err(e) => format!("{{\"error\":\"serialize error: {}\"}}", e),
    }
}
