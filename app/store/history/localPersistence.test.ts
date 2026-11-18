// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasPersistenceConflicts, hasPersistenceFailures, resolvePersistenceConflicts, retryLocalPersistence, safeLocalStorage, subscribePersistence } from './localPersistence';

beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
  resolvePersistenceConflicts('remote');
});

describe('local persistence', () => {
  it('does not access unavailable browser storage during SSR', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(safeLocalStorage.getItem('plan')).toBeNull();
    expect(() => safeLocalStorage.setItem('plan', '{}')).not.toThrow();
    expect(() => safeLocalStorage.removeItem('plan')).not.toThrow();
    expect(hasPersistenceFailures()).toBe(false);
  });

  it('notifies subscribers only when persistence failures change', () => {
    const listener = vi.fn();
    const stop = subscribePersistence(listener);
    try {
      safeLocalStorage.setItem('plan', '1');
      safeLocalStorage.setItem('plan', '2');
      expect(listener).not.toHaveBeenCalled();
      const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Quota');
      });
      safeLocalStorage.setItem('plan', '3');
      safeLocalStorage.setItem('plan', '4');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(safeLocalStorage.getItem('plan')).toBe('4');
      write.mockRestore();
      retryLocalPersistence();
      expect(listener).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem('plan')).toBe('4');
    } finally {
      stop();
    }
  });

  it('preserves a failed draft and blocks retries until the user chooses a version', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota');
    });
    safeLocalStorage.setItem('plan', 'old-local');
    write.mockRestore();
    localStorage.setItem('plan', 'new-remote');
    window.dispatchEvent(new StorageEvent('storage', { key: 'plan', newValue: 'new-remote', storageArea: localStorage }));
    expect(hasPersistenceFailures()).toBe(true);
    expect(hasPersistenceConflicts('plan')).toBe(true);
    retryLocalPersistence();
    expect(localStorage.getItem('plan')).toBe('new-remote');
    expect(safeLocalStorage.getItem('plan')).toBe('old-local');
    safeLocalStorage.setItem('plan', 'edited-local');
    expect(localStorage.getItem('plan')).toBe('new-remote');
    resolvePersistenceConflicts('local');
    expect(localStorage.getItem('plan')).toBe('edited-local');
    expect(hasPersistenceFailures()).toBe(false);
  });

  it('applies the other tab only after explicitly discarding the failed draft', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota');
    });
    safeLocalStorage.setItem('plan', 'old-local');
    write.mockRestore();
    localStorage.setItem('plan', 'new-remote');
    window.dispatchEvent(new StorageEvent('storage', { key: 'plan', storageArea: localStorage }));
    resolvePersistenceConflicts('remote');
    expect(safeLocalStorage.getItem('plan')).toBe('new-remote');
    expect(hasPersistenceFailures()).toBe(false);
  });

  it('detects external changes before retry even if the storage event has not arrived', () => {
    localStorage.setItem('plan', 'base');
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota');
    });
    safeLocalStorage.setItem('plan', 'local');
    write.mockRestore();
    localStorage.setItem('plan', 'remote');
    retryLocalPersistence();
    expect(hasPersistenceConflicts()).toBe(true);
    expect(localStorage.getItem('plan')).toBe('remote');
    expect(safeLocalStorage.getItem('plan')).toBe('local');
  });

  it('clears a failed write when another tab stores the same value', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota');
    });
    safeLocalStorage.setItem('plan', 'same');
    write.mockRestore();
    localStorage.setItem('plan', 'same');
    window.dispatchEvent(new StorageEvent('storage', { key: 'plan', storageArea: localStorage }));
    expect(hasPersistenceFailures()).toBe(false);
  });
});
