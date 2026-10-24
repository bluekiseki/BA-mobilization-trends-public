import { lazy, Suspense } from 'react';
import { ClientOnly } from '~/components/common/ClientOnly';
import { createMetaDescriptor } from '~/components/shell/head';

// Unlisted while in development: no nav link, not in the sitemap, and noindex.
const ArenaPage = lazy(() => import('~/features/my/arena/components/ArenaPage').then((m) => ({ default: m.ArenaPage })));

export function meta() {
  return [...createMetaDescriptor('My Tactical Challenge Records', 'Save Tactical Challenge matches from Combat Report screenshots.'), { name: 'robots', content: 'noindex, nofollow' }];
}

export default function ArenaRoute() {
  return (
    <ClientOnly>
      <Suspense fallback={null}>
        <ArenaPage />
      </Suspense>
    </ClientOnly>
  );
}
