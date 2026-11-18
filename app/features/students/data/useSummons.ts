import { useEffect, useState } from 'react';
import { z } from 'zod';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { summonDisplay, summonSchema, type PublicSummon } from './publicStudent';

const requests = new Map<string, Promise<PublicSummon[]>>();

/** Summon catalog of the locale, or null until it has loaded (or when it is unavailable). Shared by the planner and the raid stats card. */
export function useSummonCatalog(locale: Locale): PublicSummon[] | null {
  const [catalog, setCatalog] = useState<PublicSummon[] | null>(null);
  useEffect(() => {
    let alive = true;
    const key = getLocaleShortName(locale);
    let request = requests.get(key);
    if (!request) {
      request = fetch(cdn(`/schaledb.com/${key}.summons.min.json`))
        .then((res): Promise<unknown> => res.json())
        .then((json) => z.array(summonSchema).parse(json).map(summonDisplay));
      requests.set(key, request);
    }
    request.then(
      (loaded) => {
        if (alive) setCatalog(loaded);
      },
      () => {
        requests.delete(key);
      },
    );
    return () => {
      alive = false;
    };
  }, [locale]);
  return catalog;
}

/** The student's summons that have skill text, in the order of the student's skills. */
export function summonsOf(student: { Summons?: { Id: number }[] }, catalog: PublicSummon[] | null): PublicSummon[] {
  if (!catalog) return [];
  return (student.Summons ?? []).flatMap(({ Id }) => {
    const summon = catalog.find((entry) => entry.Id === Id);
    return summon && summon.skills.length ? [summon] : [];
  });
}
