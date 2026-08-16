import { lazy, Suspense } from 'react';
import { data, type LoaderFunctionArgs } from 'react-router';
import { getInstance } from '~/middleware/i18next';
import { ClientOnly } from '~/components/common/ClientOnly';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import type { Route } from './+types/StudentScanner';

const StudentScannerPage = lazy(() =>
  import('~/components/scanner/StudentScanner/StudentScannerPage').then((m) => ({
    default: m.StudentScannerPage,
  })),
);

export function links() {
  return [...createLinkHreflang(`/scanner/student`)];
}

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  return data({
    siteTitle: i18n.t('common:title'),
    title: i18n.t('planner:page.studentScanner'),
    description: i18n.t('planner:page.description.studentScanner'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(`${loaderData.title} | ${loaderData.siteTitle}`, loaderData.description, '/img/student-scanner.webp');
}

export default function StudentScannerRoute() {
  return (
    <ClientOnly>
      <Suspense fallback={null}>
        <StudentScannerPage />
      </Suspense>
    </ClientOnly>
  );
}
