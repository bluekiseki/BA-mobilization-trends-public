pub struct GachaPools<'a> {
    pub grade3: &'a [u32],
    pub grade2: &'a [u32],
    pub grade1: &'a [u32],
    pub fes: &'a [u32],
}

impl<'a> GachaPools<'a> {
    pub fn new(grade3: &'a [u32], grade2: &'a [u32], grade1: &'a [u32], fes: &'a [u32]) -> Self {
        Self {
            grade3,
            grade2,
            grade1,
            fes,
        }
    }
}
