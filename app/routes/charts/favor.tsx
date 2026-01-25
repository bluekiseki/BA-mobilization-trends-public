import { data, type LoaderFunctionArgs } from 'react-router';
import { EmblemCounter } from '~/components/emblem/EmblemCounter'; // Fix path
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';

import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import type { Route } from './+types/favor';
import { getInstance } from '~/middleware/i18next';
import type { AppHandle } from '~/types/link';
import { cdn } from '~/utils/cdn';

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  let i18n = getInstance(context);
  const locale = i18n.language as Locale;
  return data({
    locale,
    siteTitle: i18n.t('home:title'),
    title: i18n.t('emblemCounter:title'),
    description: i18n.t('emblemCounter:description'),
  });
}

// export const meta: MetaFunction<typeof rootLorder, {
//   "root": typeof rootLorder,
// }> = ({ matches, params }) => {
//   matches.find(m => m.id)
//   const rootMatch = matches.find(m => m.id === "root");
//   const locale_data = rootMatch ? rootMatch.loaderData : null;
//   const locale = locale_data ? locale_data.locale : DEFAULT_LOCALE;

//   const t = i18n.getFixedT(locale, undefined, 'home');
//   const t_ranking = i18n.getFixedT(locale, undefined, 'emblemCounter');
//   const t_c = i18n.getFixedT(locale, undefined, 'common');

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/f.webp');
}

export const handle: AppHandle = {
  preload: (data) => {
    // const { eventId } = useLoaderData<typeof rootLorder>().params
    return [
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(data?.locale)}.students.min.json`),
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
  return (
    <>
      <div className="mt-0">
        <EmblemCounter />
      </div>
    </>
  );
}
