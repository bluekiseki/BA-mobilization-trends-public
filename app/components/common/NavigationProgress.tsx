import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation } from 'react-router';

export function NavigationProgress() {
  const navigation = useNavigation();
  const { t } = useTranslation('ui', { useSuspense: false });
  const isNavigating = navigation.state !== 'idle';
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => {
        if (!isNavigating) {
          setProgress(null);
          return;
        }

        setProgress((current) => current ?? 15);
        interval = setInterval(() => {
          setProgress((current) => (current === null ? null : Math.min(90, current + Math.max(1, (90 - current) * 0.12))));
        }, 400);
      },
      isNavigating ? 150 : 200,
    );

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [isNavigating]);

  if (progress === null) return null;

  return (
    <div
      role={isNavigating ? 'progressbar' : undefined}
      aria-label={isNavigating ? t('loading') : undefined}
      aria-hidden={!isNavigating || undefined}
      data-pending={isNavigating}
      className="navigation-progress pointer-events-none fixed inset-x-0 top-0 z-[300] h-1"
    >
      <div className="navigation-progress-bar h-full origin-left bg-blue-600 dark:bg-blue-400" style={{ transform: `scaleX(${isNavigating ? progress / 100 : 1})` }} />
    </div>
  );
}
