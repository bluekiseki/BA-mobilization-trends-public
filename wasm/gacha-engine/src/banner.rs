use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BannerPoolData {
    pub is_fes: bool,
    pub is_recall: bool,
    pub free_pulls: u32,
    pub grade3: Vec<u32>,
    pub grade2: Vec<u32>,
    pub grade1: Vec<u32>,
    pub fes: Vec<u32>,
    pub banner_pickup_ids: Vec<u32>,
    pub fes_excluded_ids: Vec<u32>,
}
