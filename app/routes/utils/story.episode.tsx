import { lazy, Suspense } from 'react';
import { ClientOnly } from '~/components/common/ClientOnly';
import { createMetaDescriptor } from '~/components/shell/head';

const EpisodePage = lazy(() => import('~/features/story/components/EpisodePage').then((m) => ({ default: m.EpisodePage })));

export function meta() {
  return [...createMetaDescriptor('Story Preview', 'Summaries and order of Blue Archive main, event and club stories.'), { name: 'robots', content: 'noindex, nofollow' }];
}

export default function StoryEpisodeRoute() {
  return (
    <ClientOnly>
      <Suspense fallback={null}>
        <EpisodePage />
      </Suspense>
    </ClientOnly>
  );
}
