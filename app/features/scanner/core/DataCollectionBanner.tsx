import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  allowDataCollection: boolean;
  onToggle: (allow: boolean) => void;
  translationKeyPrefix?: 'itemScanner' | 'studentScanner';
  detailsLabel?: string;
}

export function DataCollectionBanner({ allowDataCollection, onToggle, translationKeyPrefix = 'itemScanner', detailsLabel }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: translationKeyPrefix });
  const [showDetails, setShowDetails] = useState(false);
  const [contributionCount, setContributionCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch('/api/scanner/contribution-count', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const result: unknown = await response.json();
        if (typeof result === 'object' && result !== null && 'count' in result && typeof result.count === 'number') {
          setContributionCount(result.count);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Failed to load scanner contribution count:', error);
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2 mb-3 space-y-2">
      {contributionCount !== null && (
        <p aria-live="polite" className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
          {t('dataCollectionCount', { count: contributionCount.toLocaleString() })}
        </p>
      )}
      <div className="flex gap-3 items-start">
        <label className="flex items-start gap-2 flex-1 cursor-pointer">
          <input type="checkbox" checked={allowDataCollection} onChange={(e) => onToggle(e.target.checked)} className="rounded mt-0.5 shrink-0" />
          <span className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">{t('dataCollectionOptIn')}</span>
        </label>
        <button onClick={() => setShowDetails(!showDetails)} className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-400 underline whitespace-nowrap shrink-0">
          {detailsLabel ?? t('dataCollectionDetails')}
        </button>
      </div>
      {showDetails && <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">{t('dataCollectionPrivacy')}</p>}
    </div>
  );
}
