use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BannerPoolData {
    pub is_fes: bool,
    pub is_limited_banner: bool,
    pub is_recall: bool,
    pub use_charge_system: bool,
    pub free_pulls: u32,
    pub grade3: Vec<u32>,
    pub grade2: Vec<u32>,
    pub grade1: Vec<u32>,
    pub fes: Vec<u32>,
    pub banner_pickup_ids: Vec<u32>,
    pub fes_excluded_ids: Vec<u32>,
    /// Unix ms of this banner's start time — used only for the term-limited ticket pool (expiry checks
    /// and the "last eligible banner" determination). Not needed for anything else, since roll
    /// probabilities/pools are already precomputed per-banner on the JS side.
    pub start_time: i64,
    /// Precomputed expiry (Unix ms) for a "Recruitment Count Bonus" ticket earned while pulling on this
    /// banner (banner start + 40 days, 11:00). Computed once on the JS side (gachaRules.ts's
    /// getRecruitBonusTicketExpiry) so both engines agree exactly, rather than re-deriving date/timezone
    /// arithmetic independently in Rust.
    pub recruit_bonus_ticket_expiry: i64,
    /// Unix ms of this banner's end time. Used to drain expiring tickets only in the banner window
    /// containing their expiry, matching gachaEngine.ts.
    pub end_time: i64,
}
