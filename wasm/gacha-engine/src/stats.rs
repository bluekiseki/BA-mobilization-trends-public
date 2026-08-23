use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmStats {
    pub grade1: u32,
    pub grade2: u32,
    pub grade3: u32,
    pub pickup: u32,
    pub total: u32,
    pub charge: u32,
    student_counts: HashMap<u32, u32>,
}

#[wasm_bindgen]
impl WasmStats {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            grade1: 0,
            grade2: 0,
            grade3: 0,
            pickup: 0,
            total: 0,
            charge: 0,
            student_counts: HashMap::new(),
        }
    }

    pub fn student_counts_json(&self) -> String {
        let mut entries: Vec<String> = self
            .student_counts
            .iter()
            .map(|(id, count)| format!("\"{}\":{}", id, count))
            .collect();
        entries.sort(); // deterministic output
        format!("{{{}}}", entries.join(","))
    }
}

impl WasmStats {
    pub fn record(&mut self, id: u32, grade: u8, is_pickup: bool) {
        self.total += 1;
        match grade {
            3 => self.grade3 += 1,
            2 => self.grade2 += 1,
            _ => self.grade1 += 1,
        }
        if is_pickup {
            self.pickup += 1;
        }
        *self.student_counts.entry(id).or_insert(0) += 1;
    }
}
