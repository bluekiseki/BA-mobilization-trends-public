import { type LoaderFunctionArgs } from 'react-router';
import { env } from 'cloudflare:workers';
import { vaildClient } from '~/utils/vaildClient';
import { queryNotices } from '~/features/notices/server/notices-query.server';
import { NOTICES_CACHE_CONTROL } from '~/utils/cacheControl';

// Missing param -> fallback; non-integer or out-of-range -> null (rejected). Negative LIMIT is unbounded in SQLite.
function parseBoundedInt(raw: string | null, fallback: number, min: number, max: number): number | null {
  if (raw === null || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (!vaildClient(request)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = env.DB;
  if (!db) {
    return Response.json({ error: 'D1 Binding Not Found' }, { status: 500 });
  }

  const url = new URL(request.url);
  const region = url.searchParams.get('region') || 'ALL';
  const sort = url.searchParams.get('sort') || 'new';
  const type = url.searchParams.get('type') || 'ALL';
  const limit = parseBoundedInt(url.searchParams.get('limit'), 20, 1, 20);
  const page = parseBoundedInt(url.searchParams.get('page'), 1, 1, 1000);
  if (limit === null || page === null) {
    return Response.json({ error: 'Invalid pagination' }, { status: 400 });
  }
  const withTotal = url.searchParams.get('with_total') === 'true';

  try {
    const result = await queryNotices(db, { region, sort, type, page, limit, withTotal });
    return Response.json(result, { headers: { 'Cache-Control': NOTICES_CACHE_CONTROL } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'DB Error' }, { status: 500 });
  }
}
