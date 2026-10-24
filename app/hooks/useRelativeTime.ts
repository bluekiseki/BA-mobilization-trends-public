import { useEffect, useReducer } from 'react';
import { getRelativeTime } from '../utils/time';
import { DEFAULT_LOCALE, type Locale } from '../utils/i18n/config';

/**
 * React wrapper around the pure `getRelativeTime`. Re-renders on an interval so a
 * long-lived surface (e.g. an open menu) keeps its "3 minutes ago" text fresh.
 */
export function useRelativeTime(timestamp: number | null, locale: Locale = DEFAULT_LOCALE): string | null {
  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (timestamp == null) return;
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, [timestamp]);

  return timestamp == null ? null : getRelativeTime(timestamp, locale);
}

/**
 * True once `thresholdMs` has elapsed since `timestamp`. Re-checks on the same interval as
 * `useRelativeTime` so a long-lived surface (e.g. an open menu) keeps this reactive over time.
 */
export function useIsStale(timestamp: number | null, thresholdMs: number): boolean {
  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (timestamp == null) return;
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, [timestamp]);

  return timestamp != null && Date.now() - timestamp > thresholdMs;
}
