import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { needsDocumentLoad } from '~/hooks/isolatedRoutes';
import { FaExternalLinkAlt } from 'react-icons/fa';
import type { Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import BugReportModal from '~/components/common/BugReportModal';
import { issuesURL } from '~/data/livedataServer.json';
import { sortChangelog, type ChangelogEntryData } from '~/utils/changelog';

// Renders a list of dated changelog entries (expects pre-sorted data)
export function ChangelogEntries({ entries }: { entries: ChangelogEntryData[] }) {
  const { i18n, t } = useTranslation('common');
  const locale = i18n.language as Locale;

  return (
    <div className="space-y-6">
      {entries.map((entry) => {
        // Retrieve changelog array for the current locale (fallback to English if missing)
        const currentChanges = entry.changes[locale] || entry.changes['en'];

        return (
          <div key={entry.date}>
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
                          <Link to={localeLink(locale, linkUrl)} reloadDocument={needsDocumentLoad(linkUrl)} className="hover:underline hover:text-neutral-900 dark:hover:text-white transition-colors">
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
  );
}

// Feedback prompt with bug report modal, shared by the home widget and the full changelog page
export function ChangelogFeedback({ className = '' }: { className?: string }) {
  const { t } = useTranslation('common');
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <p className={`text-sm text-neutral-600 dark:text-neutral-400 ${className}`}>
        {t('changelog.feedbackPrompt')}{' '}
        <button onClick={() => setIsModalOpen(true)} className="text-blue-600 dark:text-blue-400 hover:underline transition-colors font-medium">
          {t('changelog.sendFeedback')}
        </button>
      </p>
      {isModalOpen && <BugReportModal onClose={() => setIsModalOpen(false)} issuesURL={issuesURL} />}
    </>
  );
}

interface ChangelogProps {
  changelogData: ChangelogEntryData[];
  // Link to the full changelog page (locale prefix is added automatically)
  moreHref?: string;
}

export function Changelog({ changelogData, moreHref }: ChangelogProps) {
  const { i18n, t } = useTranslation('common');
  const locale = i18n.language as Locale;

  const sortedData = useMemo(() => sortChangelog(changelogData), [changelogData]);

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
    <section className="bg-white dark:bg-neutral-800 rounded-sm border border-neutral-200 dark:border-neutral-700 p-6 transition-colors">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="relative inline-block text-xl font-bold text-neutral-800 dark:text-white">
          {t('changelog.title')}
          {hasRecentChanges && <div className="absolute -top-1 -right-2.5 w-1.5 h-1.5 bg-red-500 rounded-full" title={t('changelog.newUpdate')} />}
        </h2>
        {moreHref && (
          <Link to={localeLink(locale, moreHref)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline shrink-0">
            {t('viewAll')}
          </Link>
        )}
      </div>

      <div className="max-h-60 overflow-y-auto pr-2 custom-scrollbar">
        <ChangelogEntries entries={sortedData} />
      </div>

      <ChangelogFeedback className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700" />
    </section>
  );
}
