import { type LoaderFunctionArgs } from 'react-router';
import { env } from 'cloudflare:workers';
import { vaildClient } from '~/utils/vaildClient';
import { queryNotices } from '~/utils/notices-query.server';
import { NOTICES_CACHE_CONTROL } from '~/utils/cacheControl';

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
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 20);
  const page = Number(url.searchParams.get('page')) || 1;
  const withTotal = url.searchParams.get('with_total') === 'true';

  try {
    const result = await queryNotices(db, { region, sort, type, page, limit, withTotal });
    return Response.json(result, { headers: { 'Cache-Control': NOTICES_CACHE_CONTROL } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'DB Error' }, { status: 500 });
  }
}
