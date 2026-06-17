import { lazy, Suspense } from 'react';
import { data, type LoaderFunctionArgs } from 'react-router';
import { getInstance } from '~/middleware/i18next';
import { ClientOnly } from '~/components/common/ClientOnly';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import type { Route } from './+types/ItemScanner';

const ItemScannerPage = lazy(() =>
  import('~/components/planner/ItemScanner/ItemScannerPage').then((m) => ({
    default: m.ItemScannerPage,
  })),
);

export function links() {
  return [...createLinkHreflang(`/planner/item-scanner`)];
}

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  return data({
    siteTitle: i18n.t('common:title'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(`Item Scanner | ${loaderData.siteTitle}`, 'Scan inventory screenshots to automatically update your material inventory.');
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
