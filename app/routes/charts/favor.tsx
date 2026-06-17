import { data, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { EmblemCounter } from '~/components/emblem/EmblemCounter'; // Fix path
import { PageHeader } from '~/components/common/PageHeader';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';

import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import type { Route } from './+types/favor';
import { getInstance } from '~/middleware/i18next';
import type { AppHandle } from '~/types/link';
import { cdn } from '~/utils/cdn';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { useHelpKey } from '~/utils/usePageHelp';

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  return data({
    locale,
    siteTitle: i18n.t('common:title'),
    title: i18n.t('emblemCounter:title'),
    description: i18n.t('emblemCounter:description'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/f.webp');
}

export function headers({}: Route.HeadersArgs) {
  if (process.env.NODE_ENV === 'production')
    return {
      'Cache-Control': CACHE_CONTROL_CONFIG,
    };
}

export const handle: AppHandle = {
  preload: (data: unknown) => {
    type DataType = { locale?: Locale };
    const typedData = data as DataType;
    const locale = typedData?.locale ?? 'en';

    // const { eventId } = useLoaderData<typeof rootLorder>().params
    return [
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/w/students_portrait.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      ...createLinkHreflang(`/charts/favor`),
    ];
  },
};

export default function emblemCounter() {
  useHelpKey('chart.favor');
  const loaderData = useLoaderData<typeof loader>();
  return (
    <div className="px-4 mx-auto py-6">
      <PageHeader title={loaderData.title} description={loaderData.description} />
      <EmblemCounter />
    </div>
  );
}
