import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config'; // Adjust the path if needed

// Define the type for a single changelog entry based on JSON structure
interface ChangelogEntryData {
  date: string;
  changes: {
    // Use Partial to indicate not all languages might be present
    [key in Locale]?: string[];
  };
}

interface ChangelogProps {
  changelogData: ChangelogEntryData[];
}

export function Changelog({ changelogData }: ChangelogProps) {
  const { i18n, t } = useTranslation('common'); // Assuming keys are in 'home' namespace
  const locale = i18n.language as Locale;

  // Sort data by date descending (most recent first)
  const sortedData = useMemo(() => [...changelogData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [changelogData]);

  const hasRecentChanges = useMemo(() => {
    const sevenDaysAgo = new Date();
    // Based on exactly 7 days ago at midnight (00:00:00).
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Check only the latest date (first item) among sorted data.
    if (sortedData.length === 0) {
      return false;
    }

    const mostRecentDate = new Date(sortedData[0].date);
    return mostRecentDate >= sevenDaysAgo;
  }, [sortedData]);

  return (
    // Style similar to the Link cards but as a section
    <section className="bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 p-6">
      <h2 className="relative inline-block text-xl font-bold mb-4 text-neutral-800 dark:text-white">
        {t('changelog.title')}

        {hasRecentChanges && <div className="absolute -top-1 -right-2.5 w-1.5 h-1.5 bg-red-500 rounded-full" title={t('changelog.newUpdate')} />}
      </h2>

      {/* Add scrolling if the list becomes long */}
      <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
        {' '}
        {/* Added scrollbar styling class */}
        {sortedData.map((entry, index) => (
          <div key={index}>
            <p className="font-semibold text-sm text-neutral-600 dark:text-neutral-400 mb-1">
              <time dateTime={entry.date}>{entry.date}</time>
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-neutral-700 dark:text-neutral-300 pl-1">
              {/* Access the correct language array, provide fallback */}
              {(entry.changes[locale] || entry.changes['en'])?.map((change, idx) => <li key={idx}>{change}</li>) || <li>{t('changelog.noTranslation')}</li> /* Fallback message */}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
