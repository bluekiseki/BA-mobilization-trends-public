import type { LoaderFunctionArgs, RouterContextProvider } from 'react-router';
import { getInstance } from '~/middleware/i18next';
import type { GameServer } from '~/types/data';
import { loadScheduleData, type ScheduleTrack } from '~/utils/calender.data';
import type { Locale } from '~/utils/i18n/config';
import { cacheHeader } from 'pretty-cache-header';
import { vaildClient } from '~/utils/vaildClient';

export async function loader({ request, context }: LoaderFunctionArgs) {
  // Security check (block unauthorized access)
  if (!vaildClient(request)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const server = url.searchParams.get('server');

  let i18n = getInstance(context);
  const locale = i18n.language as Locale;

  // 1. Map function to execute (all vs widget)
  let targetFunction: (ctx: Readonly<RouterContextProvider>, server: GameServer) => ReturnType<typeof loadScheduleData>;

  if (type === 'all') {
    targetFunction = (ctx, server) => loadScheduleData({ server, locale, i18n, tracksToLoad: 'all' });
  } else if (type === 'widget') {
    const widgetTracks: ScheduleTrack[] = ['raid', 'event', 'campaign', 'pickup'];
    targetFunction = (ctx, server) => loadScheduleData({ server, locale, i18n, tracksToLoad: widgetTracks });
  } else {
    return Response.json({ error: 'Bad Request: "type" parameter must be "all" or "widget"' }, { status: 400 });
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
      const singleData = await targetFunction(context, server);
      // Pass headers object along
      return Response.json({ data: singleData }, { headers });
    }

    const [dataJp, dataKr] = await Promise.all([targetFunction(context, 'jp'), targetFunction(context, 'kr')]);

    return Response.json(
      {
        data: {
          jp: dataJp,
          kr: dataKr,
        },
      },
      { headers },
    );
  } catch (error) {
    console.error(`[${type}] data load error:`, error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
