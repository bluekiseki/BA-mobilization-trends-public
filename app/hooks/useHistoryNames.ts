import { useEffect, useState } from 'react';
import type { HistoryNames } from '~/utils/editHistoryDescription';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';

const cache = new Map<Locale, Promise<HistoryNames>>();
async function json<T>(path: string): Promise<T> {
  const response = await fetch(cdn(path));
  if (!response.ok) throw new Error(`History names: ${response.status}`);
  return response.json();
}

export function useHistoryNames(locale: Locale, enabled: boolean): HistoryNames | null {
  const [loaded, setLoaded] = useState<{ locale: Locale; names: HistoryNames } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let pending = cache.get(locale);
    if (!pending) {
      pending = Promise.all([
        json<HistoryNames['students']>(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`),
        json<HistoryNames['icons']>('/ew/icon_info.json'),
        import('~/data/jp/eventList.json'),
      ]).then(([students, icons, events]) => ({
        students: Object.fromEntries(Object.entries(students).map(([id, student]) => [id, { Name: student.Name }])),
        icons,
        events: events.default,
      }));
      cache.set(locale, pending);
    }
    void pending
      .then((names) => {
        if (active) setLoaded({ locale, names });
      })
      .catch(() => {
        cache.delete(locale);
      });
    return () => {
      active = false;
    };
  }, [locale, enabled]);
  return loaded?.locale === locale ? loaded.names : null;
}
