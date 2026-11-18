import { useEffect, useRef, useState } from 'react';
import { hasPersistenceConflicts, PROFILE_STORAGE_EVENT, safeLocalStorage, writeProfileStorage } from '~/store/history/localPersistence';

function parseStoredValue<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return (typeof fallback === 'string' && typeof parsed !== 'string' ? raw : parsed) as T;
  } catch {
    return typeof fallback === 'string' ? (raw as T) : fallback;
  }
}

export function useLocalStorage<T>(key: string, initialValue: T) {
  const initial = useRef(initialValue);
  initial.current = initialValue;
  const read = () => {
    const raw = safeLocalStorage.getItem(key);
    return { key, raw, value: parseStoredValue(raw, initialValue) };
  };
  const [stored, setStored] = useState(read);
  let state = stored;
  // Reset during render so consumers never receive the previous key's value.
  if (state.key !== key) {
    state = read();
    setStored(state);
  }
  const current = useRef(state);
  current.current = state;
  useEffect(() => {
    const update = (raw: string | null) => {
      if (current.current.key !== key || current.current.raw === raw) return;
      const next = { key, raw, value: parseStoredValue(raw, initial.current) };
      current.current = next;
      setStored(next);
    };
    update(safeLocalStorage.getItem(key));
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: string | null }>).detail;
      if (detail.key !== key) return;
      update(detail.value);
    };
    const onStorage = (event: StorageEvent) => {
      if ((event.storageArea && event.storageArea !== localStorage) || (event.key !== null && event.key !== key) || hasPersistenceConflicts(key)) return;
      update(safeLocalStorage.getItem(key));
    };
    window.addEventListener(PROFILE_STORAGE_EVENT, listener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PROFILE_STORAGE_EVENT, listener);
      window.removeEventListener('storage', onStorage);
    };
  }, [key]);
  const setValue = (value: T | ((val: T) => T)) => {
    const nextValue = value instanceof Function ? value(current.current.value) : value;
    const next = { key, raw: JSON.stringify(nextValue), value: nextValue };
    current.current = next;
    setStored(next);
    writeProfileStorage(key, next.raw, 'local');
  };
  return [state.value, setValue] as const;
}
