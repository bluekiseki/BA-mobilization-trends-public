// Budget half the reported logical cores to reduce contention with the UI, decoding and other applications.
// Device memory is an optional, coarse browser hint; browsers without it use the CPU budget.
export function pickStudentThreadCount(): number {
  if (typeof crossOriginIsolated === 'undefined' || !crossOriginIsolated || typeof SharedArrayBuffer === 'undefined' || typeof navigator === 'undefined') return 1;
  const cores = navigator.hardwareConcurrency;
  if (!Number.isFinite(cores) || cores < 1) return 1;
  const threads = Math.max(1, Math.min(4, Math.ceil(cores / 2)));
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (memory !== undefined && Number.isFinite(memory) && memory > 0) {
    if (memory <= 2) return 1;
    if (memory <= 4) return Math.min(2, threads);
  }
  return threads;
}
