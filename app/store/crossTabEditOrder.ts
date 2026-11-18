// Logical ordering is independent of the device clock. Retain one ID per profile key,
// including after its pending server write completes, to reject delayed cache writes.
const latest = new Map<string, string>();
let clock = 0;
function sequence(id: string): number {
  const match = /^(\d+):/.exec(id);
  const value = match ? Number(match[1]) : 0;
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}
export function observeEditClock(edits: Record<string, string> = {}): void {
  for (const id of Object.values(edits)) clock = Math.max(clock, sequence(id));
}
export function currentEditIds(): Record<string, string> {
  return Object.fromEntries(latest);
}
export function clearEditOrder(): void {
  latest.clear();
}
export function acceptEditOrder(key: string, id: string): boolean {
  const current = latest.get(key);
  const incoming = sequence(id);
  clock = Math.max(clock, incoming);
  if (current === id) return false;
  if (current && incoming && sequence(current)) {
    const previous = sequence(current);
    if (incoming < previous || (incoming === previous && id < current)) return false;
  }
  latest.set(key, id);
  return true;
}
export function nextEditId(key: string): string {
  const id = `${++clock}:${crypto.randomUUID()}`;
  latest.set(key, id);
  return id;
}
