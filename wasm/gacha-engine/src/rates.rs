pub struct NormalRates {
    pub r3: f64,
    pub r2: f64,
    pub r1: f64,
    pub pickup: f64,
}

pub struct FesRates {
    pub r3: f64,
    pub r2: f64,
    pub r1: f64,
    pub pickup: f64,
    pub fes_spook: f64,
    pub normal_spook: f64,
}

pub const NORMAL: NormalRates = NormalRates {
    r3: 0.03,
    r2: 0.185,
    r1: 0.785,
    pickup: 0.007,
};

pub const FES: FesRates = FesRates {
    r3: 0.06,
    r2: 0.185,
    r1: 0.755,
    pickup: 0.007,
    fes_spook: 0.009,
    normal_spook: 0.044,
};
