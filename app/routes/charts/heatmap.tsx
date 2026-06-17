// app/page.tsx
import { useTranslation } from 'react-i18next';
import ClientHeatmapLoader from '~/components/heatmap/ClientHeatmapLoader';
import { PageHeader } from '~/components/common/PageHeader';

import type { Route } from './+types/heatmap';
import { useParams, type LoaderFunctionArgs } from 'react-router'; // useRouteLoaderData, type LoaderFunctionArgs,
import type { AppHandle } from '~/types/link';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';

import { GAMESERVER_LIST, type GameServer, type GameServerParams } from '~/types/data';
import { getInstance } from '~/middleware/i18next';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { useHelpKey } from '~/utils/usePageHelp';

export const links: Route.LinksFunction = () => {
  return [
    {
      rel: 'preload',
      href: cdn(`/w/students_portrait.json`),
      crossOrigin: 'anonymous',
      as: 'fetch',
    },
    {
      rel: 'preload',
      href: cdn(`/ew/icon_img.json`),
      as: 'fetch',
      crossOrigin: 'anonymous',
    },
    {
      rel: 'preload',
      href: cdn(`/ew/icon_info.json`),
      as: 'fetch',
      crossOrigin: 'anonymous',
    },
    {
      rel: 'preload',
      href: cdn(`/schaledb.com/student_favor_stories_parsed.json`),
      as: 'fetch',
      crossOrigin: 'anonymous',
    },
  ];
};

export function loader({ context, params }: LoaderFunctionArgs) {
  const { server } = params;
  if (!server || !GAMESERVER_LIST.includes(server as GameServer)) {
    throw new Response('Not Found', { status: 404 });
  }
  const g_server = server as GameServer;
  const i18n = getInstance(context);

  return {
    siteTitle: i18n.t('common:title'),
    title: i18n.t('common:navigation.heatmap'),
    description: i18n.t('charts:heatmap.description1'),
    server: g_server,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/2.webp');
}

export const handle: AppHandle = {
  preload: (data: unknown, routeMatch) => {
    // Create a link dynamically using the return value (data) of the root loader
    // const pathname = useLocation().pathname;
    const pathname = routeMatch?.pathname || '';
    const match = pathname.match(/\/charts\/([a-zA-Z]{2})\//);
    if (!match || !GAMESERVER_LIST.includes(match[1] as GameServer)) return [];
    const server = match[1] as GameServer;

    type DataType = { locale?: Locale };
    const typedData = data as DataType;
    const locale = typedData.locale;
    if (!locale) return [];

    return [
      {
        rel: 'preload',
        href: cdn(`/w/${getLocaleShortName(locale)}.students.bin`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/w/${server}/${getLocaleShortName(locale)}.raid_info.bin`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      ...createLinkHreflang(`/charts/${server}/heatmap`),
    ];
  },
};

export function headers({}: Route.HeadersArgs) {
  if (process.env.NODE_ENV === 'production')
    return {
      'Cache-Control': CACHE_CONTROL_CONFIG,
    };
}

export default function Home() {
  const { t } = useTranslation('charts', { keyPrefix: 'heatmap' });

  const { server } = useParams<GameServerParams>();
  if (!server) return <></>;

  // const {t} = useTranslation('charts.heatmap')

  useHelpKey('chart.heatmap');

  return (
    <div className="px-4 mx-auto py-6">
      <PageHeader title={`${t('title')} (${server.toUpperCase()})`} description={t('description1')} />
      {/* <Suspense fallback={<p className="text-center text-neutral-600">Loading...</p>}> */}
      <ClientHeatmapLoader server={server} />
      {/* </Suspense> */}
    </div>
  );
}
