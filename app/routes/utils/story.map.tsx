import { lazy, Suspense } from 'react';
import { ClientOnly } from '~/components/common/ClientOnly';
import { createMetaDescriptor } from '~/components/shell/head';

// Unlisted while in development: no nav link, not in the sitemap, and noindex.
const StoryMapPage = lazy(() => import('~/features/story/components/StoryMapPage').then((m) => ({ default: m.StoryMapPage })));

export function meta() {
  return [...createMetaDescriptor('Story Preview', 'Summaries and order of Blue Archive main, event and club stories.'), { name: 'robots', content: 'noindex, nofollow' }];
}

export default function StoryMapRoute() {
  return (
    <ClientOnly>
      <Suspense fallback={null}>
        <StoryMapPage />
      </Suspense>
    </ClientOnly>
  );
}
