use rustc_hash::FxHashMap;
use serde::Serialize;

/// Compact, mergeable distribution data matching gachaEngine.ts's SimMetricBucket.
#[derive(Debug, PartialEq, Serialize, Default)]
pub struct SimMetricBucket {
    pub dist: FxHashMap<i64, u32>,
    pub sum: i64,
    pub count: u32,
}

/// Checkpoint-keyed metric accumulator matching gachaEngine.ts's SimMetricAccumulator.data.
#[derive(Debug, PartialEq, Serialize)]
pub struct SimMetricAccumulator {
    #[serde(skip)]
    bin: i64,
    #[serde(flatten)]
    pub data: FxHashMap<String, SimMetricBucket>,
}

impl SimMetricAccumulator {
    pub fn new(bin: i64) -> Self {
        Self {
            bin,
            data: FxHashMap::default(),
        }
    }

    #[cfg(test)]
    pub fn bucket(&self, checkpoint: &str) -> Option<&SimMetricBucket> {
        self.data.get(checkpoint)
    }
}

/// Hot-loop variant of SimMetricAccumulator. Checkpoint IDs are resolved to slots before simulation,
/// so recording a value needs no string allocation or hash lookup.
pub struct IndexedSimMetricAccumulator {
    bin: i64,
    buckets: Vec<SimMetricBucket>,
}

impl IndexedSimMetricAccumulator {
    pub fn new(bin: i64, checkpoint_count: usize) -> Self {
        Self {
            bin,
            buckets: (0..checkpoint_count)
                .map(|_| SimMetricBucket::default())
                .collect(),
        }
    }

    #[inline]
    pub fn push(&mut self, slot: usize, value: i64) {
        let bucket = &mut self.buckets[slot];
        bucket.count += 1;
        bucket.sum += value;
        *bucket.dist.entry(value / self.bin).or_insert(0) += 1;
    }

    pub fn into_serialized(self, checkpoint_ids: &[String]) -> SimMetricAccumulator {
        SimMetricAccumulator {
            bin: self.bin,
            data: checkpoint_ids
                .into_iter()
                .cloned()
                .zip(self.buckets)
                .collect(),
        }
    }
}

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BannerStatsSum {
    pub pulls: u64,
    pub cost: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimChunkResult {
    /// Checkpoint-keyed compact distributions, directly consumable by the web worker.
    pub cost: SimMetricAccumulator,
    pub cost_incremental: SimMetricAccumulator,
    pub cost_with_tickets: SimMetricAccumulator,
    pub cost_with_gacha_tickets: SimMetricAccumulator,
    pub cost_with_gacha_tickets_incremental: SimMetricAccumulator,
    pub pulls: SimMetricAccumulator,
    pub pulls_incremental: SimMetricAccumulator,
    pub eligma_cumulative: SimMetricAccumulator,
    pub eligma_incremental: SimMetricAccumulator,
    pub success_count: u32,
    pub banner_stats_sum: FxHashMap<String, BannerStatsSum>,
    /// studentId → number of simulations where the student was newly acquired
    pub student_acquired: FxHashMap<u32, u32>,
    /// studentId → sum of eleph fragments across all simulations
    pub student_eleph_total: FxHashMap<u32, u64>,
    /// studentId → { eleph_amount → count of simulations with that amount }
    pub student_eleph_dist: FxHashMap<u32, FxHashMap<u32, u32>>,
    /// bannerId → studentId → { incremental_eleph_amount → count of simulations }
    pub banner_student_eleph_dist: FxHashMap<String, FxHashMap<u32, FxHashMap<u32, u32>>>,
}

impl SimChunkResult {
    pub fn new() -> Self {
        Self {
            cost: SimMetricAccumulator::new(1200),
            cost_incremental: SimMetricAccumulator::new(1200),
            cost_with_tickets: SimMetricAccumulator::new(120),
            cost_with_gacha_tickets: SimMetricAccumulator::new(120),
            cost_with_gacha_tickets_incremental: SimMetricAccumulator::new(120),
            pulls: SimMetricAccumulator::new(10),
            pulls_incremental: SimMetricAccumulator::new(10),
            eligma_cumulative: SimMetricAccumulator::new(1),
            eligma_incremental: SimMetricAccumulator::new(1),
            success_count: 0,
            banner_stats_sum: FxHashMap::default(),
            student_acquired: FxHashMap::default(),
            student_eleph_total: FxHashMap::default(),
            student_eleph_dist: FxHashMap::default(),
            banner_student_eleph_dist: FxHashMap::default(),
        }
    }
}
