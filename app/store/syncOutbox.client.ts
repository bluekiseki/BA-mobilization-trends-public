export interface PersistedSyncChange {
  userId: string;
  profileId: string;
  key: string;
  baseRevision: number;
  desiredValue: unknown;
  schemaVersion: number;
  generation: number;
  updatedAt: number;
}

const DATABASE_NAME = 'yuzu-sync';
const DATABASE_VERSION = 1;
const STORE_NAME = 'outbox';
const memoryFallback = new Map<string, PersistedSyncChange>();

function entryId(userId: string, profileId: string, key: string): string {
  return `${userId}\u0000${profileId}\u0000${key}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open sync outbox'));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Sync outbox transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Sync outbox transaction aborted'));
  });
}

export async function putSyncOutboxEntry(entry: PersistedSyncChange): Promise<void> {
  const id = entryId(entry.userId, entry.profileId, entry.key);
  const db = await openDatabase();
  if (!db) {
    memoryFallback.set(id, entry);
    return;
  }

  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).put(entry, id);
  await waitForTransaction(transaction);
  db.close();
}

export async function deleteSyncOutboxEntry(userId: string, profileId: string, key: string): Promise<void> {
  const id = entryId(userId, profileId, key);
  const db = await openDatabase();
  if (!db) {
    memoryFallback.delete(id);
    return;
  }

  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).delete(id);
  await waitForTransaction(transaction);
  db.close();
}

export async function getSyncOutboxEntries(userId: string, profileId: string): Promise<PersistedSyncChange[]> {
  const db = await openDatabase();
  if (!db) {
    return Array.from(memoryFallback.values()).filter((entry) => entry.userId === userId && entry.profileId === profileId);
  }

  const transaction = db.transaction(STORE_NAME, 'readonly');
  const request = transaction.objectStore(STORE_NAME).getAll();
  const entries = await new Promise<PersistedSyncChange[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as PersistedSyncChange[]);
    request.onerror = () => reject(request.error ?? new Error('Failed to read sync outbox'));
  });
  db.close();
  return entries.filter((entry) => entry.userId === userId && entry.profileId === profileId);
}
