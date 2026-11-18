import type { StateStorage } from 'zustand/middleware';

export interface PersistenceContext {
  userId: string | null;
  profileId: string | null;
  external: boolean;
  edits?: Record<string, string>;
}
const plannerStorageKeys = new Set(['global-growth-plans-v2', 'equipment-plan-storage', 'resource-plan-v2', 'event-plans-v2', 'raid-history-v1', 'gacha-history-v1']);
let readContext: (() => PersistenceContext) | undefined;
export function setPersistenceContextReader(reader: () => PersistenceContext) {
  readContext = reader;
}
export function getPersistenceContext(raw: string | null): PersistenceContext | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('syncContext' in parsed)) return null;
    const context = parsed.syncContext;
    if (!context || typeof context !== 'object' || !('userId' in context) || !('profileId' in context) || !('external' in context)) return null;
    return (context.userId === null || typeof context.userId === 'string') && (context.profileId === null || typeof context.profileId === 'string') && typeof context.external === 'boolean'
      ? {
          userId: context.userId,
          profileId: context.profileId,
          external: context.external,
          edits:
            'edits' in context && context.edits && typeof context.edits === 'object'
              ? Object.fromEntries(Object.entries(context.edits).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
              : undefined,
        }
      : null;
  } catch {
    return null;
  }
}
function contextualValue(key: string, value: string): string {
  // Zustand ignores extra envelope fields. Keep identity/origin alongside the existing value.
  if (!readContext || !plannerStorageKeys.has(key) || !value.endsWith('}')) return value;
  return `${value.slice(0, -1)},"syncContext":${JSON.stringify(readContext())}}`;
}

const failed = new Map<string, { value: string | null; base: string | null | undefined; conflict: boolean }>();
const readFailures = new Map<string, () => void>();
const listeners = new Set<() => void>();
let revision = 0;
let suspendedWrites = 0;
let listening = false;

/** Reset in-memory stores without publishing an intermediate empty state to other tabs. */
export function withoutLocalPersistence<T>(action: () => T): T {
  suspendedWrites++;
  try {
    return action();
  } finally {
    suspendedWrites--;
  }
}
export const subscribePersistence = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const persistenceRevision = () => revision;
export const hasPersistenceFailures = () => failed.size > 0 || readFailures.size > 0;
export const hasPersistenceConflicts = (key?: string) => (key === undefined ? [...failed.values()].some((entry) => entry.conflict) : failed.get(key)?.conflict === true);
export const getPersistenceConflicts = () => [...failed].filter(([, entry]) => entry.conflict).map(([key, entry]) => ({ key, localValue: entry.value, remoteValue: readDisk(key) }));
export const hasPersistenceReadFailures = () => readFailures.size > 0;
export const PERSISTENCE_RESOLVED_EVENT = 'local-persistence-resolved';
function notify() {
  revision++;
  listeners.forEach((listener) => listener());
}
export function setPersistenceReadFailure(key: string, retry?: () => void) {
  const size = readFailures.size;
  if (retry) readFailures.set(key, retry);
  else readFailures.delete(key);
  if (size !== readFailures.size) notify();
}
function readDisk(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return undefined;
  }
}
function listenForExternalWrites() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener(
    'storage',
    (event) => {
      if (event.storageArea && event.storageArea !== localStorage) return;
      let changed = false;
      for (const [key, entry] of failed) {
        if (event.key !== null && event.key !== key) continue;
        const value = readDisk(key);
        if (value === entry.value) {
          failed.delete(key);
          changed = true;
        } else if (value !== entry.base || entry.conflict) {
          entry.conflict = true;
          changed = true;
        }
      }
      if (changed) notify();
    },
    true,
  );
}
function save(key: string, value: string | null, force = false) {
  if (suspendedWrites || typeof localStorage === 'undefined') return;
  const size = failed.size;
  const previous = failed.get(key);
  const base = previous ? previous.base : readDisk(key);
  if (previous && !force && (previous.conflict || readDisk(key) !== base)) {
    if (readDisk(key) === value) {
      failed.delete(key);
      notify();
    } else {
      failed.set(key, { value, base, conflict: true });
      if (!previous.conflict || previous.value !== value) notify();
    }
    return;
  }
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    failed.delete(key);
  } catch {
    failed.set(key, { value, base, conflict: previous?.conflict ?? false });
    listenForExternalWrites();
  }
  if (size !== failed.size) notify();
}
export const safeLocalStorage = {
  getItem: (key) => {
    if (typeof localStorage === 'undefined') return null;
    if (failed.has(key)) return failed.get(key)?.value ?? null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => save(key, contextualValue(key, value)),
  removeItem: (key) => save(key, null),
} satisfies StateStorage;
export function retryLocalPersistence() {
  for (const retry of readFailures.values()) retry();
  for (const [key, entry] of failed) save(key, entry.value);
}
export function resolvePersistenceConflicts(source: 'local' | 'remote', targetKey?: string, expectedRemote?: string | null) {
  for (const [key, entry] of failed) {
    if (!entry.conflict || (targetKey !== undefined && key !== targetKey)) continue;
    // Refresh the comparison if another tab changed it after the user viewed it.
    if (expectedRemote !== undefined && readDisk(key) !== expectedRemote) {
      notify();
      continue;
    }
    if (source === 'local') save(key, entry.value, true);
    else {
      const value = readDisk(key);
      if (value === undefined) continue;
      failed.delete(key);
      // An explicit selection is a user edit, including replacement of pending server writes.
      window.dispatchEvent(new CustomEvent(PROFILE_STORAGE_EVENT, { detail: { key, value, origin: 'local' } }));
      window.dispatchEvent(new CustomEvent(PERSISTENCE_RESOLVED_EVENT, { detail: { key } }));
      notify();
    }
  }
}
export const PROFILE_STORAGE_EVENT = 'profile-storage-change';
export function writeProfileStorage(key: string, value: string | null, origin: 'local' | 'external' = 'external') {
  if (typeof window === 'undefined') return;
  if (value === null) safeLocalStorage.removeItem(key);
  else safeLocalStorage.setItem(key, value);
  window.dispatchEvent(new CustomEvent(PROFILE_STORAGE_EVENT, { detail: { key, value, origin } }));
}
