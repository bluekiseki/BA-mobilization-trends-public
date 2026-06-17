use serde::Deserialize;

#[derive(Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TargetMode {
    Must,
    Opportunistic,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TargetConfig {
    pub student_id: u32,
    pub mode: TargetMode,
    pub opportunistic_threshold: u32,
    pub intentional_spark: bool,
    pub intentional_spark_threshold: u32,
}

/// Serialized form of BannerStrategy sent from JS worker.
/// targets must be sorted by priority (ascending) before serialization.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BannerStrategy {
    pub banner_id: String,
    pub max_sparks: u32,
    pub min_pulls: u32,
    pub targets: Vec<TargetConfig>,
}
