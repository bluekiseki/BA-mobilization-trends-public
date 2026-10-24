import { lazy, Suspense } from 'react';
import { ClientOnly } from '~/components/common/ClientOnly';
import { createMetaDescriptor } from '~/components/shell/head';

const SeriesPage = lazy(() => import('~/features/story/components/SeriesPage').then((m) => ({ default: m.SeriesPage })));

export function meta() {
  return [...createMetaDescriptor('Story Preview', 'Summaries and order of Blue Archive main, event and club stories.'), { name: 'robots', content: 'noindex, nofollow' }];
}

export default function StorySeriesRoute() {
  return (
    <ClientOnly>
      <Suspense fallback={null}>
        <SeriesPage />
      </Suspense>
    </ClientOnly>
  );
}
