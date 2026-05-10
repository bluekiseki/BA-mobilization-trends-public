import { type LoaderFunctionArgs } from 'react-router';
import { env } from 'cloudflare:workers';
import { vaildClient } from '~/utils/vaildClient';

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
  const typeParam = url.searchParams.get('type') || 'ALL';

  const limit = Number(url.searchParams.get('limit')) || 20;
  const page = Number(url.searchParams.get('page')) || 1;
  const offset = (page - 1) * limit;

  // 1. Prepare arrays to separate dynamic filter conditions and binding values
  const conditions = [];
  const bindValues: any[] = []; // Values to be mapped to '?'

  // 2. Parameter binding processing (SQL Injection protection)
  if (region !== 'ALL') {
    conditions.push(`p.region = ?`);
    bindValues.push(region);
  }

  // typeParam is compared with hardcoded values in code and is safe, but handled as a condition for consistency
  if (typeParam === 'VIDEO') {
    conditions.push(`p.type = 'VIDEO'`);
  } else if (typeParam === 'ETC') {
    conditions.push(`p.type != 'VIDEO'`);
  }

  const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

  // Sort criteria is a conditional string set by us, not external input, so there is no injection risk
  const orderBy = sort === 'new' ? 'pv.api_create_date' : 'pv.api_modify_date';

  const query = `
    SELECT 
        p.post_id, p.region, p.category, p.type, p.thumbnail, p.url, p.first_crawled_at,
        pv.title, pv.api_modify_date, pv.api_create_date
    FROM posts p
    JOIN post_versions pv ON p.post_id = pv.post_id
    WHERE pv.version_id IN (
        SELECT MAX(version_id) FROM post_versions GROUP BY post_id
    )
    ${whereClause}
    ORDER BY ${orderBy} DESC
    LIMIT ? OFFSET ?;
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM posts p
    WHERE 1=1 ${whereClause};
  `;

  try {
    // 3. Bind values from bindValues array along with limit and offset in order using the spread operator (...)
    const [dataResult, countResult] = await Promise.all([
      db
        .prepare(query)
        .bind(...bindValues, limit, offset)
        .all(),
      db
        .prepare(countQuery)
        .bind(...bindValues)
        .first(),
    ]);

    return Response.json({
      data: dataResult.results,
      total: countResult?.total || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'DB Error' }, { status: 500 });
  }
}
