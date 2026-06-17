/**
 * Runs a synchronous function asynchronously, deferring it to the next
 * event-loop tick so React can flush a loading state first.
 *
 * Worker migration path:
 *   Replace the setTimeout body with a Worker postMessage round-trip.
 *   All call sites stay the same — they always await a Promise<T>.
 *   Pre-condition: `fn` must be pure (no React state/refs), so its logic
 *   can eventually move into a worker module.
 */
export function runAsync<T>(fn: () => T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(fn()), 0));
}
