import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, data, redirect } from 'react-router';
import { useTranslation } from 'react-i18next';
import { StudentNetworkGraphClient } from '~/components/network/StudentNetworkGraphClient';
import { loadIndex, buildSeasonItems } from '~/components/network/useNetworkData';
import type { SeasonItem } from '~/components/network/types';
import type { Route } from './+types/network';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { getInstance } from '~/middleware/i18next';
import type { AppHandle } from '~/types/link';
import { GAMESERVER_LIST, type GameServer } from '~/types/data';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { localeLink } from '~/utils/localeLink';

export const links: Route.LinksFunction = () => {
  return [
    {
      rel: 'preload',
      href: cdn('/network-data/index.json'),
      as: 'fetch',
      crossOrigin: 'anonymous',
    },
    {
      rel: 'preload',
      href: cdn('/w/students_portrait.json'),
      as: 'fetch',
      crossOrigin: 'anonymous',
    },
  ];
};

export function loader({ context, params, request }: Route.LoaderArgs) {
  const { server, param } = params;
  if (!server || !GAMESERVER_LIST.includes(server as GameServer) || server === 'kr') {
    throw data(null, { status: 404 });
  }

  if (param) {
    const url = new URL(request.url);
    url.pathname = url.pathname.slice(0, url.pathname.lastIndexOf('/'));
    url.searchParams.set('raid', param);
    throw redirect(`${url.pathname}?${url.searchParams.toString()}`);
  }

  const i18n = getInstance(context);
  return {
    siteTitle: i18n.t('common:title'),
    title: i18n.t('network:title'),
    description: i18n.t('network:description'),
    server,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/2.webp');
}

export const handle: AppHandle = {
  preload: (data: unknown, routeMatch) => {
    const pathname = routeMatch?.pathname || '';
    const match = pathname.match(/\/charts\/([a-zA-Z]{2})\/network(\/[^/?#]+)?/);
    if (!match || !GAMESERVER_LIST.includes(match[1] as GameServer) || match[1] === 'kr') return [];

    type DataType = { locale?: Locale };
    const typedData = data as DataType;
    const locale = typedData.locale;
    if (!locale) return [];

    const server = match[1] as GameServer;
    const path = `/charts/${server}/network${match[2] ?? ''}`;

    return [
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      ...createLinkHreflang(path),
    ];
  },
};

export function headers({}: Route.HeadersArgs) {
  if (process.env.NODE_ENV === 'production')
    return {
      'Cache-Control': CACHE_CONTROL_CONFIG,
    };
}

export default function NetworkPage() {
  const { server } = useParams<{ server?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { i18n } = useTranslation('common');
  const currentLocale = i18n.language as Locale;

  const raidParam = searchParams.get('raid');
  const initialSeasonId = raidParam && /^[RE]\d/.test(raidParam) ? raidParam : undefined;

  const studentParam = searchParams.get('student');
  const parsedStudentId = studentParam ? Number(studentParam) : undefined;

  const [seasons, setSeasons] = useState<SeasonItem[]>([]);

  useEffect(() => {
    void loadIndex().then((index) => setSeasons(buildSeasonItems(index)));
  }, []);

  const handleStudentChange =
    parsedStudentId !== undefined
      ? () => {
          const nextSearch = new URLSearchParams(searchParams);
          nextSearch.delete('student');
          const search = nextSearch.toString();
          void navigate(localeLink(currentLocale, `/charts/${server}/network${search ? `?${search}` : ''}`), { replace: true });
        }
      : undefined;

  return (
    <div style={{ height: 'calc(100dvh - 4rem)' }}>
      <StudentNetworkGraphClient
        embedded={false}
        studentId={parsedStudentId}
        initialSeasonId={initialSeasonId}
        seasons={seasons}
        simplified={false}
        studentMode={!!parsedStudentId}
        onStudentChange={handleStudentChange}
        onRaidChange={(nextRaid) => {
          if (nextRaid === raidParam || (!nextRaid && !raidParam)) return;
          const nextSearch = new URLSearchParams(searchParams);
          if (nextRaid) nextSearch.set('raid', nextRaid);
          else nextSearch.delete('raid');
          const search = nextSearch.toString();
          void navigate(localeLink(currentLocale, `/charts/${server}/network${search ? `?${search}` : ''}`), { replace: true });
        }}
      />
    </div>
  );
}
