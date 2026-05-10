import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { FaExternalLinkAlt } from 'react-icons/fa';
import type { Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';

// Define the type for a single changelog entry based on JSON structure
interface ChangelogEntryData {
  date: string;
  changes: {
    // Use Partial to indicate not all languages might be present
    [key in Locale]?: string[];
  };
  to?: (string | null)[];
}

interface ChangelogProps {
  changelogData: ChangelogEntryData[];
}

export function Changelog({ changelogData }: ChangelogProps) {
  const { i18n, t } = useTranslation('common');
  const locale = i18n.language as Locale;

  // Sort data by date descending (most recent first)
  const sortedData = useMemo(() => [...changelogData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [changelogData]);

  const hasRecentChanges = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    if (sortedData.length === 0) {
      return false;
    }

    const mostRecentDate = new Date(sortedData[0].date);
    return mostRecentDate >= sevenDaysAgo;
  }, [sortedData]);

  return (
    <section className="bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 p-6 transition-colors">
      <h2 className="relative inline-block text-xl font-bold mb-4 text-neutral-800 dark:text-white">
        {t('changelog.title')}
        {hasRecentChanges && <div className="absolute -top-1 -right-2.5 w-1.5 h-1.5 bg-red-500 rounded-full" title={t('changelog.newUpdate')} />}
      </h2>

      <div className="space-y-6 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
        {sortedData.map((entry, index) => {
          // Retrieve changelog array for the current locale (fallback to English if missing)
          const currentChanges = entry.changes[locale] || entry.changes['en'];

          return (
            <div key={index}>
              <p className="font-semibold text-sm text-neutral-500 dark:text-neutral-400 mb-2">
                <time dateTime={entry.date}>{entry.date}</time>
              </p>
              {/* Remove default list-disc, maintain spacing using space-y only */}
              <ul className="space-y-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                {currentChanges ? (
                  currentChanges.map((change, idx) => {
                    const linkUrl = entry.to?.[idx];

                    return (
                      /* Use flex to clearly separate bullets from text */
                      <li key={idx} className="flex items-start gap-2">
                        {/* Custom bullet (Adjust mt to center with first line of text, fix size with shrink-0) */}
                        <span className="w-1.5 h-1.5 mt-[6px] shrink-0 rounded-full bg-neutral-400 dark:bg-neutral-500" />

                        <div className="leading-snug break-keep">
                          {linkUrl ? (
                            <Link to={localeLink(locale, linkUrl)} className="hover:underline hover:text-neutral-900 dark:hover:text-white transition-colors">
                              <span>{change}</span>
                              <FaExternalLinkAlt className="inline-block ml-1.5 text-[10px] opacity-70 -translate-y-px" />
                            </Link>
                          ) : (
                            <span>{change}</span>
                          )}
                        </div>
                      </li>
                    );
                  })
                ) : (
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 mt-[6px] shrink-0 rounded-full bg-neutral-400 dark:bg-neutral-500" />
                    <div className="leading-snug">{t('changelog.noTranslation')}</div>
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
