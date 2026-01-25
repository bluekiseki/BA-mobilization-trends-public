// app/page.tsx
import { useTranslation } from 'react-i18next';
import ClientHeatmapLoader from '~/components/heatmap/ClientHeatmapLoader';

import type { Route } from './+types/heatmap';
import { useLocation, useParams, type LoaderFunctionArgs } from 'react-router'; // useRouteLoaderData, type LoaderFunctionArgs,
import type { AppHandle } from '~/types/link';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';

import { GAMESERVER_LIST, type GameServer, type GameServerParams } from '~/types/data';
import { getInstance } from '~/middleware/i18next';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName } from '~/utils/i18n/config';

export const links: Route.LinksFunction = () => {
  return [
    {
      rel: 'preload',
      href: cdn(`/w/students_portrait.json`),
      crossOrigin: 'anonymous',
      as: 'fetch',
    },
  ];
};

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const { server } = params;
  if (!server || !GAMESERVER_LIST.includes(server as GameServer)) {
    throw new Response('Not Found', { status: 404 });
  }
  const g_server = server as GameServer;
  let i18n = getInstance(context);

  return {
    siteTitle: i18n.t('home:title'),
    title: i18n.t('navigation:heatmap'),
    description: i18n.t('charts:heatmap.description1'),
    server: g_server,
  };
}

// export const meta: MetaFunction<typeof rootLorder, {
//   "root": typeof rootLorder,
// }> = ({matches}) => {
//   matches.find(m => m.id)
//   const rootMatch = matches.find(m => m.id === "root");
//   const locale_data = rootMatch ? rootMatch.loaderData : null;
//   const locale = locale_data ? locale_data.locale : DEFAULT_LOCALE;

//   // let { t } = useTranslation(undefined, { keyPrefix: 'home' });
//   // let { t:t_nav } = useTranslation(undefined, { keyPrefix: 'layout-nav' });
//   // let { t:t_ranking } = useTranslation(undefined, { keyPrefix: 'charts.heatmap' });
//   const t = i18n.getFixedT("home");
//   const t_nav = i18n.getFixedT("navigation");
//   const t_heatmap = i18n.getFixedT(locale, undefined, 'charts.heatmap');
export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/2.webp');
}

export const handle: AppHandle = {
  preload: (data) => {
    // Create a link dynamically using the return value (data) of the root loader
    const pathname = useLocation().pathname;
    const match = pathname.match(/\/charts\/([a-zA-Z]{2})\//);
    if (!match || !GAMESERVER_LIST.includes(match[1] as GameServer)) return [];
    const server = match[1] as GameServer;
    if (!data?.locale) return [];

    return [
      {
        rel: 'preload',
        href: cdn(`/w/${getLocaleShortName(data?.locale)}.students.bin`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/w/${server}/${getLocaleShortName(data?.locale)}.raid_info.bin`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },

      ...createLinkHreflang(`/charts/${server}/heatmap`),
    ];
  },
};

export default function Home() {
  const { t } = useTranslation('charts', { keyPrefix: 'heatmap' });

  const { server } = useParams<GameServerParams>();
  if (!server) return <></>;

  // const {t} = useTranslation('charts.heatmap')

  return (
    <div className="px-4 mx-auto py-6">
      <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
        {t('title')} ({server.toUpperCase()})
      </h1>
      <p className="text-sm text-neutral-600 mt-1">{t('description1')}</p>
      {/* <p className="text-sm text-neutral-600 mt-1">
        {t('description2')}
      </p> */}

      {/* <Suspense fallback={<p className="text-center text-neutral-600">Loading...</p>}> */}
      <ClientHeatmapLoader server={server} />
      {/* </Suspense> */}
    </div>
  );
}
