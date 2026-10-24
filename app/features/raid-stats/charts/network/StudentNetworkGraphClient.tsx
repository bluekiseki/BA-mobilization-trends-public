import { lazy, Suspense } from 'react';
import { ClientOnly } from '~/components/common/ClientOnly';

const StudentNetworkGraph = lazy(() => import('./StudentNetworkGraph.client').then((m) => ({ default: m.StudentNetworkGraph })));

type Props = React.ComponentProps<typeof StudentNetworkGraph>;

export function StudentNetworkGraphClient(props: Props) {
  const fallback = (
    <div className="flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 text-sm text-neutral-400" style={{ height: props.height ?? '100%' }}>
      Loading...
    </div>
  );

  // ClientOnly keeps the lazy boundary from being evaluated during SSR,
  // where the .client module's export resolves to undefined.
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <StudentNetworkGraph {...props} />
      </Suspense>
    </ClientOnly>
  );
}
