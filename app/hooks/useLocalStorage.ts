import { useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  // 1. Use Lazy Initialization to read localStorage only during the initial render.
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue; // Prevent errors in SSR (Server Side Rendering) environments
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (_error) {
      // console.warn(`LocalStorage read error (key: "${key}"):`, error);
      return initialValue;
    }
  });

  // 2. Wraps the useState setter function to immediately save to local storage when the state changes.
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;

      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (_error) {
      // console.warn(`LocalStorage save error (key: "${key}"):`, error);
    }
  };

  // Returns [state, setter] like standard useState (uses 'as const' for type inference)
  return [storedValue, setValue] as const;
}
