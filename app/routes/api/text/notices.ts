import type { LoaderFunctionArgs } from 'react-router';
import { env } from 'cloudflare:workers';
import { queryNotices } from '~/features/notices/server/notices-query.server';
import { NOTICES_CACHE_CONTROL } from '~/utils/cacheControl';
import { formatNotices } from '~/utils/textFeeds';
import { textResponse } from '~/utils/textResponse';
import { productionUrl } from '~/data/livedataServer.json';

// Public plain-text notices feed. Rate limiting and region validation happen in
// workers/textFeedGuard.ts before this loader runs.
export async function loader({ request }: LoaderFunctionArgs) {
  const db = env.DB;
  if (!db) return textResponse('D1 Binding Not Found\n', { status: 500 });

  const region = new URL(request.url).searchParams.get('region') ?? 'ALL';
  try {
    const { data } = await queryNotices(db, { region, sort: 'new', type: 'ALL', page: 1, limit: 20, withTotal: false });
    return textResponse(formatNotices(data, region, { baseUrl: productionUrl, generatedAt: new Date() }), { cacheControl: NOTICES_CACHE_CONTROL });
  } catch (error) {
    console.error(error);
    return textResponse('DB Error\n', { status: 500 });
  }
}
