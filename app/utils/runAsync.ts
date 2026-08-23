/* Defer sync fn to next tick (allows React loading state); migrates to Worker later */
export function runAsync<T>(fn: () => T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(fn()), 0));
}
