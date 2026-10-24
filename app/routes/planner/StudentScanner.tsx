import { lazy, Suspense } from 'react';
import { data, type LoaderFunctionArgs } from 'react-router';
import { getInstance } from '~/middleware/i18next';
import { ClientOnly } from '~/components/common/ClientOnly';
import { createLinkHreflang, createMetaDescriptor } from '~/components/shell/head';
import type { Route } from './+types/StudentScanner';

const StudentScannerPage = lazy(() =>
  import('~/features/scanner/student/StudentScannerPage').then((m) => ({
    default: m.StudentScannerPage,
  })),
);

// SharedArrayBuffer enables the adaptive WASM thread pool for this document.
export function headers() {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
  };
}

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
