/* tslint:disable */

export class WasmStats {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  student_counts_json(): string;
  grade1: number;
  grade2: number;
  grade3: number;
  pickup: number;
  total: number;
}

/**
 * Raw pull simulation for debug/testing (single banner, no strategy logic).
 */
export function gacha_run_chunk(
  grade3_ids: Uint32Array,
  grade2_ids: Uint32Array,
  grade1_ids: Uint32Array,
  fes_ids: Uint32Array,
  fes_excluded_ids: Uint32Array,
  banner_pickup_ids: Uint32Array,
  pickup_id: number,
  is_fes: boolean,
  pull_count: number,
  rng_seed: bigint,
): WasmStats;

/**
 * Full strategy simulation (multi-banner, spark, targeting).
 * strategies_json: JSON array of BannerStrategy (targets sorted by priority)
 * banner_pools_json: JSON object mapping bannerId → BannerPoolData
 * Returns SimChunkResult as JSON string.
 */
export function simulate_strategies_chunk(strategies_json: string, banner_pools_json: string, sim_count: number, rng_seed: bigint): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly gacha_run_chunk: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
    m: number,
    n: number,
    o: number,
    p: bigint,
  ) => number;
  readonly simulate_strategies_chunk: (a: number, b: number, c: number, d: number, e: number, f: bigint) => [number, number];
  readonly __wbg_get_wasmstats_grade1: (a: number) => number;
  readonly __wbg_get_wasmstats_grade2: (a: number) => number;
  readonly __wbg_get_wasmstats_grade3: (a: number) => number;
  readonly __wbg_get_wasmstats_pickup: (a: number) => number;
  readonly __wbg_get_wasmstats_total: (a: number) => number;
  readonly __wbg_set_wasmstats_grade1: (a: number, b: number) => void;
  readonly __wbg_set_wasmstats_grade2: (a: number, b: number) => void;
  readonly __wbg_set_wasmstats_grade3: (a: number, b: number) => void;
  readonly __wbg_set_wasmstats_pickup: (a: number, b: number) => void;
  readonly __wbg_set_wasmstats_total: (a: number, b: number) => void;
  readonly __wbg_wasmstats_free: (a: number, b: number) => void;
  readonly wasmstats_new: () => number;
  readonly wasmstats_student_counts_json: (a: number) => [number, number];
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
