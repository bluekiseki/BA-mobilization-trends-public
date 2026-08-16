import { env } from 'cloudflare:workers';

const CONTRIBUTION_PREFIX = 'scanner-contributions/';

export async function loader() {
  let count = 0;
  let cursor: string | undefined;

  do {
    const page = await env.SCANNER_CONTRIBUTIONS.list({
      prefix: CONTRIBUTION_PREFIX,
      cursor,
      limit: 1000,
    });
    count += page.objects.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return Response.json(
    { count },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600',
      },
    },
  );
}
