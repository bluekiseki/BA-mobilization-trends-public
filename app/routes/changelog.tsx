// app/routes/changelog.tsx
import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { useTranslation } from 'react-i18next';
import { getInstance } from '~/middleware/i18next';
import type { Locale } from '~/utils/i18n/config';
import { createLinkHreflang, createLocalizedUrl, createMetaDescriptor } from '~/components/shell/head';
import { PageHeader } from '~/components/common/PageHeader';
import { ChangelogEntries, ChangelogFeedback } from '~/features/notices/Changelog';
import { sortChangelog, type ChangelogEntryData } from '~/utils/changelog';
import changelogJson from '~/data/changelog.json';
import type { AppHandle } from '~/types/link';
import type { Route } from './+types/changelog';

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;

  // Group entries by month (YYYY-MM), most recent first
  const months: { month: string; entries: ChangelogEntryData[] }[] = [];
  for (const entry of sortChangelog(changelogJson)) {
    const month = entry.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.month === month) last.entries.push(entry);
    else months.push({ month, entries: [entry] });
  }

  return {
    locale,
    title: i18n.t('common:changelog.title'),
    description: i18n.t('common:changelog.description'),
    siteTitle: i18n.t('common:title'),
    canonicalUrl: createLocalizedUrl(locale, '/changelog'),
    months,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(`${loaderData.title} | ${loaderData.siteTitle}`, loaderData.description, '/img/1.webp', loaderData.canonicalUrl);
}

export const handle: AppHandle = {
  preload: (data: unknown) => {
    const d = data as Record<string, unknown> | undefined;
    const locale = d?.locale as Locale;
    return [{ rel: 'canonical', href: createLocalizedUrl(locale, '/changelog') }, ...createLinkHreflang('/changelog')];
  },
};

export default function ChangelogPage() {
  const { months, description } = useLoaderData<typeof loader>();
  const { t } = useTranslation('common');

  return (
    <div className="px-4 py-6">
      <PageHeader title={t('changelog.title')} description={description} />

      <div className="mt-6">
        {months.map(({ month, entries }, idx) => (
          <section key={month} className={idx > 0 ? 'mt-8 pt-8 border-t border-neutral-200 dark:border-neutral-700' : ''}>
            <h2 className="text-lg font-bold text-neutral-800 dark:text-white mb-4">{month}</h2>
            <ChangelogEntries entries={entries} />
          </section>
        ))}
      </div>

      <ChangelogFeedback className="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700" />
    </div>
  );
}
