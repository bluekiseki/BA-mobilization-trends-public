import { lazy, Suspense } from 'react';

const StudentNetworkGraph = lazy(() => import('./StudentNetworkGraph.client').then((m) => ({ default: m.StudentNetworkGraph })));

type Props = React.ComponentProps<typeof StudentNetworkGraph>;

export function StudentNetworkGraphClient(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 text-sm text-neutral-400" style={{ height: props.height ?? '100%' }}>
          Loading...
        </div>
      }
    >
      <StudentNetworkGraph {...props} />
    </Suspense>
  );
}
