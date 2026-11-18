import { useEffect, useState } from 'react';
import type { EventData, IconData, StudentData } from '~/types/plannerData';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';

export interface PlannerAssets {
  allStudents: StudentData;
  iconData: IconData;
  iconInfo: EventData['icons'];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// The student catalog and item icons the growth plans are calculated and drawn with. `null` until loaded.
export function usePlannerAssets(locale: Locale, enabled = true): { assets: PlannerAssets | null; failed: boolean } {
  const [assets, setAssets] = useState<PlannerAssets | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    // Ignore a response that arrives after the locale changed or the page unmounted
    let cancelled = false;
    // Drop the previous locale's catalog so it is not shown while the new one loads
    setAssets(null);
    setFailed(false);
    void Promise.all([
      fetchJson<StudentData>(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)),
      fetchJson<IconData>(cdn('/ew/icon_img.json')),
      fetchJson<EventData['icons']>(cdn('/ew/icon_info.json')),
    ])
      .then(([allStudents, iconData, iconInfo]) => {
        if (!cancelled) setAssets({ allStudents, iconData, iconInfo });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [locale, enabled]);
  return { assets, failed };
}
