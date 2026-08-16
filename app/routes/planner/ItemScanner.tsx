import { lazy, Suspense } from 'react';
import { data, type LoaderFunctionArgs } from 'react-router';
import { getInstance } from '~/middleware/i18next';
import { ClientOnly } from '~/components/common/ClientOnly';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import type { Route } from './+types/ItemScanner';

const ItemScannerPage = lazy(() =>
  import('~/components/scanner/ItemScanner/ItemScannerPage').then((m) => ({
    default: m.ItemScannerPage,
  })),
);

export function links() {
  return [...createLinkHreflang(`/scanner/item`)];
}

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  return data({
    siteTitle: i18n.t('common:title'),
    title: i18n.t('planner:page.itemScanner'),
    description: i18n.t('planner:page.description.itemScanner'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(`${loaderData.title} | ${loaderData.siteTitle}`, loaderData.description, '/img/scanner.webp');
}

export default function ItemScannerRoute() {
  return (
    <ClientOnly>
      <Suspense fallback={null}>
        <ItemScannerPage />
      </Suspense>
    </ClientOnly>
  );
}
