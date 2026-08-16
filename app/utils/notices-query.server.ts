import { effectiveModifyDateSql } from '~/utils/notices.server';

export interface PostRow {
  post_id: string;
  region: string;
  category: string;
  type: string;
  thumbnail: string;
  url: string;
  first_crawled_at: string;
  title: string;
  api_modify_date: number;
  api_create_date: number;
}

export interface NoticesQueryParams {
  region: string;
  sort: string;
  type: string;
  page: number;
  limit: number;
  withTotal: boolean;
}

export interface NoticesQueryResult {
  data: PostRow[];
  total?: number;
  page: number;
  limit: number;
}

// Shared by the /api/notices client-fetch route and the /notices SSR loader, so both
// paths (widget polling and the indexable page) hit the same D1 query logic.
export async function queryNotices(db: D1Database, { region, sort, type, page, limit, withTotal }: NoticesQueryParams): Promise<NoticesQueryResult> {
  const offset = (page - 1) * limit;

  const conditions = [];
  const bindValues: string[] = [];

  if (region !== 'ALL') {
    conditions.push(`p.region = ?`);
    bindValues.push(region);
  }

  if (type === 'VIDEO') {
    conditions.push(`p.type = 'VIDEO'`);
  } else if (type === 'ETC') {
    conditions.push(`p.type != 'VIDEO'`);
  }

  const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
  const effectiveModifyDate = effectiveModifyDateSql('pv.');
  const orderBy = sort === 'new' ? 'pv.api_create_date' : effectiveModifyDate;

  const query = `
    SELECT
        p.post_id, p.region, p.category, p.type, p.thumbnail, p.url, p.first_crawled_at,
        pv.title, ${effectiveModifyDate} AS api_modify_date, pv.api_create_date
    FROM posts p
    JOIN post_versions pv ON p.post_id = pv.post_id
    WHERE pv.is_latest = 1
    ${whereClause}
    ORDER BY ${orderBy} DESC
    LIMIT ? OFFSET ?;
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM post_versions pv
    JOIN posts p ON p.post_id = pv.post_id
    WHERE pv.is_latest = 1 ${whereClause};
  `;

  if (!withTotal) {
    const dataResult = await db
      .prepare(query)
      .bind(...bindValues, limit, offset)
      .all<PostRow>();
    return { data: dataResult.results, page, limit };
  }

  const [dataResult, countResult] = await Promise.all([
    db
      .prepare(query)
      .bind(...bindValues, limit, offset)
      .all<PostRow>(),
    db
      .prepare(countQuery)
      .bind(...bindValues)
      .first<{ total: number }>(),
  ]);

  return { data: dataResult.results, total: countResult?.total ?? 0, page, limit };
}
