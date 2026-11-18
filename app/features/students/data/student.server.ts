import { getCombatStyleGroupRosterIds } from '~/utils/combatStyle';
import { z } from 'zod';
import { cdn } from '~/data/livedataServer.json';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { publicStudentSchema, studentSummary, studentSummarySchema, summonDisplay, summonSchema, type StudentSummary } from './publicStudent';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
// The catalog is kept as it was read: checking every student against the schema costs more CPU than a request may use,
// so only the students a page shows are checked.
const cache = new Map<string, { expires: number; value: Promise<Record<string, unknown>> }>();
const summaryCache = new Map<string, { expires: number; value: Promise<StudentSummary[]> }>();

const assetCache = new Map<string, { expires: number; value: Promise<unknown> }>();

// Reads through the CDN_BUCKET binding, which skips the public CDN domain's uncached round trip; null when the object is unavailable.
async function readFromBucket(path: string): Promise<unknown> {
  try {
    const { env } = await import('cloudflare:workers');
    const object = await env.CDN_BUCKET?.get(`assets${path}`);
    return object ? await object.json() : null;
  } catch {
    return null;
  }
}

export async function fetchStudentJson(request: Request, path: string): Promise<unknown> {
  const url = import.meta.env.DEV ? new URL(path, request.url).href : `https://${cdn}/assets${path}`;
  const cached = assetCache.get(url);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = (import.meta.env.DEV ? Promise.resolve(null) : readFromBucket(path))
    .then(async (fromBucket): Promise<unknown> => {
      if (fromBucket !== null) return fromBucket;
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), cf: { cacheEverything: true, cacheTtl: 300 } });
      if (!response.ok) throw new Response('Student data unavailable', { status: 503 });
      return response.json();
    })
    .catch(() => {
      assetCache.delete(url);
      throw new Response('Student data unavailable', { status: 503 });
    });
  assetCache.set(url, { expires: Date.now() + 300000, value });
  return value;
}

export function loadStudentCatalog(request: Request, locale: Locale) {
  const key = `${new URL(request.url).origin}:${locale}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = fetchStudentJson(request, `/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)
    .then((json) => {
      if (!isRecord(json)) throw new Response('Student data unavailable', { status: 503 });
      return json;
    })
    .catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });
  cache.set(key, { expires: Date.now() + 300000, value });
  return value;
}

/** The listing fields of every student, read once per cache period. */
export function loadStudentSummaries(request: Request, locale: Locale) {
  const key = `${new URL(request.url).origin}:${locale}`;
  const cached = summaryCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = loadStudentCatalog(request, locale)
    .then((catalog) => Object.values(catalog).flatMap((raw) => studentSummarySchema.safeParse(raw).data ?? []))
    .catch((error: unknown) => {
      summaryCache.delete(key);
      throw error;
    });
  summaryCache.set(key, { expires: Date.now() + 300000, value });
  return value;
}

export async function loadStudentDetail(request: Request, locale: Locale, id: string | undefined) {
  if (!id || !/^[1-9]\d*$/.test(id)) throw new Response('Student not found', { status: 404 });
  // The catalog and the small enrichment files are independent, so they are fetched together instead of one after the other.
  // Optional enrichment must not prevent the public profile from loading. The large ones (stories, jukebox, item icons) are
  // read in the browser, see studentExtras.ts.
  const [catalog, [posterIndex, fullArtIndex, summonCatalog]] = await Promise.all([
    loadStudentCatalog(request, locale),
    Promise.allSettled([
      fetchStudentJson(request, '/schaledb.com/poster/index.json').then((json) =>
        z
          .record(z.string(), z.array(z.object({ lang: z.enum(['kr', 'en', 'jp']), file: z.string(), thumb: z.string().optional(), date: z.string().nullable(), w: z.number(), h: z.number() })))
          .parse(json),
      ),
      fetchStudentJson(request, '/schaledb.com/img/student/full/index.json').then((json) => z.record(z.string(), z.object({ w: z.number(), h: z.number(), anim: z.boolean() })).parse(json)),
      fetchStudentJson(request, `/schaledb.com/${getLocaleShortName(locale)}.summons.min.json`).then((json) => z.array(summonSchema).parse(json)),
    ]),
  ]);
  if (!(id in catalog)) throw new Response('Student not found', { status: 404 });
  const parsed = publicStudentSchema.safeParse(catalog[id]);
  if (!parsed.success) throw new Response('Student data unavailable', { status: 503 });
  const student = parsed.data;
  // Only the students this page shows are read from the catalog
  const read = (studentId: number) => publicStudentSchema.safeParse(catalog[studentId]).data;
  // Only some students have a full-body render; the page shows none for the rest
  const fullArt = fullArtIndex.status === 'fulfilled' ? (fullArtIndex.value[id] ?? null) : null;
  const posters = posterIndex.status === 'fulfilled' ? (posterIndex.value[id] ?? []) : [];
  // Summons keep the order of the student's skills; obstacles and plain attackers without skill text are left out
  const summons =
    summonCatalog.status === 'fulfilled'
      ? student.Summons.flatMap(({ Id }) => {
          const found = summonCatalog.value.find((summon) => summon.Id === Id);
          const summon = found ? summonDisplay(found) : null;
          return summon && summon.skills.length ? [summon] : [];
        })
      : [];
  const styleIds = getCombatStyleGroupRosterIds(student.Id);
  return {
    student,
    summons,
    // The other combat style of a student the game shows as one (the student themself included, in group order)
    styles: styleIds.length > 1 ? styleIds.flatMap((styleId) => studentSummaryOf(read(styleId))) : [],
    related: student.FavorAlts.flatMap((alt) => {
      const outfit = read(alt);
      return outfit ? [{ ...studentSummary(outfit), FavorStatType: outfit.FavorStatType, FavorStatValue: outfit.FavorStatValue }] : [];
    }),
    posters,
    fullArt,
  };
}

const studentSummaryOf = (student: z.infer<typeof publicStudentSchema> | undefined) => (student ? [studentSummary(student)] : []);
