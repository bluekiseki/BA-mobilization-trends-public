/**
 * `%mm:%ss.sss form`
 * @param seconds
 * @returns
 */
export function formatTimeToTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const milliseconds = Math.round(((Math.round(seconds * 30) % 30) * 100) / 3);
  const pad = (num: number, digits: number) => String(num).padStart(digits, '0');

  return `${pad(minutes, 2)}:${pad(remainingSeconds, 2)}.${pad(milliseconds, 3)}`;
}

import { DEFAULT_LOCALE, type Locale } from './i18n/config';

export function getRelativeTime(timestamp: number, locale: Locale = DEFAULT_LOCALE): string {
  // Convert to milliseconds if DB value is in seconds (Unix) (determined by digit count)
  const timeMs = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  const now = Date.now();
  const diff = now - timeMs;

  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (sec < 60) return rtf.format(0, 'second');
  if (min < 60) return rtf.format(-min, 'minute');
  if (hour < 24) return rtf.format(-hour, 'hour');
  if (day <= 7) return rtf.format(-day, 'day');

  return new Date(timeMs).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
