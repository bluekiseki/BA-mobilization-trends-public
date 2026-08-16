// Races a promise against a timer so a stalled/hung operation (e.g. a WASM inference session
// that never settles) surfaces as a visible error instead of leaving the caller waiting forever.
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}
