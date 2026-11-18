import { data, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { EmblemCounter } from '~/features/raid-stats/charts/emblem/EmblemCounter'; // Fix path
import { PageHeader } from '~/components/common/PageHeader';
import { createLinkHreflang, createMetaDescriptor } from '~/components/shell/head';

import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import type { Route } from './+types/favor';
import { getInstance } from '~/middleware/i18next';
import type { AppHandle } from '~/types/link';
import { cdn } from '~/utils/cdn';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { studentSheetPreloadLinks } from '~/utils/iconSheet';

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
      ...studentSheetPreloadLinks(),
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      ...createLinkHreflang(`/charts/favor`),
    ];
  },
};

export default function emblemCounter() {
  const loaderData = useLoaderData<typeof loader>();
  return (
    <div className="sm:px-4 px-0 mx-auto py-6">
      <PageHeader title={loaderData.title} description={loaderData.description} />
      <EmblemCounter />
    </div>
  );
}
