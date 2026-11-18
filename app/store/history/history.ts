import { eventPlanEditValue } from '~/utils/eventPlanValue';

export type Snapshot = { present: false } | { present: true; schemaVersion: number; json: string };
export interface HistoryChange {
  key: string;
  before: Snapshot;
  after: Snapshot;
}
export interface HistoryEntry {
  label: string;
  changes: HistoryChange[];
}
export const snapshot = (value: unknown, schemaVersion = 1): Snapshot => (value === undefined || value === null ? { present: false } : { present: true, schemaVersion, json: JSON.stringify(value) });
export const equalSnapshot = (a: Snapshot, b: Snapshot) => a.present === b.present && (!a.present || (b.present && a.json === b.json && a.schemaVersion === b.schemaVersion));
export const snapshotValue = (value: Snapshot): unknown => (value.present ? JSON.parse(value.json) : null);

// Derived event totals are recalculated after replay and must never create an edit.
export function eventEditSnapshot(value: unknown): Snapshot {
  return snapshot(eventPlanEditValue(value));
}

// Count shared snapshots once, and subtract evicted entries without rescanning the stack.
function measureHistory(entries: HistoryEntry[]) {
  const references = new Map<Snapshot, number>();
  let bytes = 0;
  const update = (entry: HistoryEntry, direction: 1 | -1) => {
    bytes += direction * (entry.label.length * 2 + 64);
    for (const change of entry.changes) {
      bytes += direction * (change.key.length * 2 + 64);
      for (const value of [change.before, change.after]) {
        const count = references.get(value) ?? 0;
        const next = count + direction;
        if (count === 0 || next === 0) bytes += direction * (value.present ? value.json.length * 2 + 32 : 16);
        if (next === 0) references.delete(value);
        else references.set(value, next);
      }
    }
  };
  entries.forEach((entry) => update(entry, 1));
  return {
    get bytes() {
      return bytes;
    },
    remove: (entry: HistoryEntry) => update(entry, -1),
  };
}

export class EditHistory {
  entries: HistoryEntry[] = [];
  cursor = 0;
  warning: 'changed' | 'tooLarge' | null = null;
  readonly current = new Map<string, Snapshot>();
  private pending = new Map<string, HistoryChange>();
  private label = '';
  private depth = 0;
  private suspended = 0;
  private replaying = false;
  private mergeTarget: unknown;
  private lastTarget: unknown;
  private listeners = new Set<() => void>();
  constructor(
    readonly maxSteps = 30,
    readonly maxBytes = 20 * 1024 * 1024,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    this.listeners.forEach((listener) => listener());
  }
  seed(key: string, value: Snapshot) {
    this.current.set(key, value);
  }
  clear() {
    this.warning = null;
    this.entries = [];
    this.cursor = 0;
    this.pending.clear();
    this.endGroup();
    this.emit();
  }
  endGroup() {
    this.commit();
    this.lastTarget = undefined;
    this.mergeTarget = undefined;
  }
  input(target: unknown) {
    if (target !== this.mergeTarget) this.endGroup();
    this.mergeTarget = target;
  }
  observe(key: string, value: Snapshot) {
    const previous = this.current.get(key) ?? { present: false };
    if (equalSnapshot(previous, value)) return;
    this.current.set(key, value);
    if (this.suspended || this.replaying) return;
    const existing = this.pending.get(key);
    this.pending.set(key, { key, before: existing?.before ?? previous, after: value });
    if (!this.depth) queueMicrotask(() => this.commit());
  }
  action<T>(label: string, action: () => T): T {
    if (!this.depth) {
      this.endGroup();
      this.label = label;
    }
    this.depth++;
    try {
      return action();
    } finally {
      if (!--this.depth) this.commit();
    }
  }
  external<T>(action: () => T): T {
    this.commit();
    const hadHistory = this.entries.length > 0;
    const before = new Map(this.current);
    this.suspended++;
    try {
      return action();
    } finally {
      this.suspended--;
      if (!this.replaying && [...this.current].some(([key, value]) => !equalSnapshot(value, before.get(key) ?? { present: false }))) {
        this.clear();
        if (hadHistory) {
          this.warning = 'changed';
          this.emit();
        }
      }
    }
  }
  get bytes() {
    return measureHistory(this.entries).bytes;
  }
  commit() {
    if (this.depth || !this.pending.size) return;
    const changes = [...this.pending.values()].filter((change) => !equalSnapshot(change.before, change.after));
    this.pending.clear();
    if (!changes.length) return;
    const merge = this.cursor === this.entries.length && this.mergeTarget !== undefined && this.mergeTarget === this.lastTarget;
    this.entries.splice(this.cursor);
    const previous = merge ? this.entries.pop() : undefined;
    const combined = new Map(previous?.changes.map((change) => [change.key, change]));
    for (const change of changes) combined.set(change.key, { ...change, before: combined.get(change.key)?.before ?? change.before });
    const finalChanges = [...combined.values()].filter((change) => !equalSnapshot(change.before, change.after));
    if (finalChanges.length) this.entries.push({ label: this.label || changes.map((change) => change.key).join(', '), changes: finalChanges });
    this.label = '';
    this.lastTarget = finalChanges.length ? this.mergeTarget : undefined;
    const size = measureHistory(this.entries);
    while (this.entries.length > this.maxSteps || (this.entries.length > 1 && size.bytes > this.maxBytes)) {
      const oldest = this.entries.shift();
      if (oldest) size.remove(oldest);
    }
    if (size.bytes > this.maxBytes) {
      this.entries = [];
      this.warning = 'tooLarge';
    }
    this.cursor = this.entries.length;
    this.emit();
  }
  replay(direction: 'undo' | 'redo', apply: (key: string, value: unknown) => void, sync: (key: string, value: unknown, schemaVersion: number) => void) {
    this.endGroup();
    const entry = this.entries[direction === 'undo' ? this.cursor - 1 : this.cursor];
    if (!entry) return;
    const target = direction === 'undo' ? 'before' : 'after';
    const source = direction === 'undo' ? 'after' : 'before';
    if (entry.changes.some((change) => !equalSnapshot(this.current.get(change.key) ?? { present: false }, change[source]))) {
      this.clear();
      this.warning = 'changed';
      this.emit();
      return;
    }
    const values = entry.changes.map((change) => ({ change, value: snapshotValue(change[target]), rollback: snapshotValue(change[source]) }));
    this.replaying = true;
    try {
      for (const { change, value } of values) apply(change.key, value);
    } catch (error) {
      for (const { change, rollback } of values) apply(change.key, rollback);
      throw error;
    } finally {
      this.replaying = false;
    }
    for (const { change, value } of values) {
      this.current.set(change.key, change[target]);
      const version = change[target].present ? change[target].schemaVersion : change[source].present ? change[source].schemaVersion : 1;
      sync(change.key, value, version);
    }
    this.cursor += direction === 'undo' ? -1 : 1;
    this.emit();
  }
}

export const editHistory = new EditHistory();
export const runHistoryAction = <T>(label: string, action: () => T) => editHistory.action(label, action);
