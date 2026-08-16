use rustc_hash::FxHashMap;
use serde::Serialize;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SimChunkResult {
    /// Total pyroxene cost per simulation run
    pub costs: Vec<u32>,
    /// Total pull count per simulation run
    pub pulls: Vec<u32>,
    /// Total eligma earned per simulation run
    pub eligma: Vec<u32>,
    pub success_count: u32,
    pub total_eligma_sum: u64,
    /// Cumulative cost up to end of each banner, per simulation run
    pub banner_costs: FxHashMap<String, Vec<u32>>,
    /// Cumulative eligma up to end of each banner, per simulation run
    pub banner_eligma: FxHashMap<String, Vec<u32>>,
    /// studentId → number of simulations where the student was newly acquired
    pub student_acquired: FxHashMap<u32, u32>,
    /// studentId → sum of eleph fragments across all simulations
    pub student_eleph_total: FxHashMap<u32, u64>,
    /// studentId → { eleph_amount → count of simulations with that amount }
    pub student_eleph_dist: FxHashMap<u32, FxHashMap<u32, u32>>,
    /// bannerId → studentId → { incremental_eleph_amount → count of simulations }
    pub banner_student_eleph_dist: FxHashMap<String, FxHashMap<u32, FxHashMap<u32, u32>>>,
}
