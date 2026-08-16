import type { LoaderFunctionArgs } from 'react-router';
import { cacheHeader } from '~/utils/cacheControl';
import { loadScheduleDataV2 } from '~/utils/calender.data.v2';
import type { ScheduleTrack } from '~/utils/calender.data';
import { vaildClient } from '~/utils/vaildClient';

export function loader({ request }: LoaderFunctionArgs) {
  if (!vaildClient(request)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const server = url.searchParams.get('server');
  const startParam = url.searchParams.get('start');
  const endParam = url.searchParams.get('end');

  if (type !== 'all' && type !== 'widget') {
    return Response.json({ error: 'Bad Request: "type" parameter must be "all" or "widget"' }, { status: 400 });
  }

  const tracksToLoad: 'all' | ScheduleTrack[] = type === 'widget' ? ['raid', 'event', 'campaign', 'pickup'] : 'all';

  let dateRangeMs: { start: number; end: number } | undefined;
  if (startParam && endParam) {
    const start = Number(startParam);
    const end = Number(endParam);
    if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
      dateRangeMs = { start, end };
    } else {
      return Response.json({ error: 'Bad Request: "start"/"end" must be valid epoch ms timestamps' }, { status: 400 });
    }
  }

  const headers = new Headers();
  if (process.env.NODE_ENV === 'production') {
    headers.set(
      'Cache-Control',
      cacheHeader({
        maxAge: '10m',
        sMaxage: '2h',
        staleWhileRevalidate: '4h',
        staleIfError: '7d',
      }),
    );
  }

  try {
    if (server === 'jp' || server === 'kr') {
      return Response.json({ data: loadScheduleDataV2({ server, tracksToLoad, dateRangeMs }) }, { headers });
    }

    return Response.json(
      {
        data: {
          jp: loadScheduleDataV2({ server: 'jp', tracksToLoad, dateRangeMs }),
          kr: loadScheduleDataV2({ server: 'kr', tracksToLoad, dateRangeMs }),
        },
      },
      { headers },
    );
  } catch (error) {
    console.error(`[calendar/v2 ${type}] error:`, error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
