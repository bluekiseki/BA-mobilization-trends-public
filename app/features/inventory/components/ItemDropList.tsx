import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { EventDropEntry, EventDropSource } from '~/utils/itemOutlook';
import { localeLink } from '~/utils/localeLink';

const stageLabel = (entry: EventDropEntry, stageLabelText: string, challengeLabel: string) => [entry.g === 'challenge' ? challengeLabel : stageLabelText, entry.n].filter(Boolean).join(' ');

/** One line per upcoming event stage that drops the item; links to that event's planner. */
export function ItemDropList({ sources }: { sources: EventDropSource[] }) {
  const { t, i18n } = useTranslation('planner');
  return (
    <div className="flex flex-col gap-0.5 text-xs text-neutral-600 dark:text-neutral-300">
      <span className="font-semibold text-neutral-500 dark:text-neutral-400">{t('itemOutlook.dropSources')}</span>
      {sources.map((source) => (
        <Link key={source.eventId} to={localeLink(i18n.language, `/planner/event/${source.eventId}`)} className="flex items-baseline gap-2 hover:text-blue-500">
          <span className="min-w-0 flex-1 truncate" title={source.name}>
            {source.name}
          </span>
          <span className="shrink-0 tabular-nums">
            {stageLabel(source.stage, t('common.stage'), t('common.challenge'))} · {source.date.slice(5).replace('-', '/')}
          </span>
        </Link>
      ))}
    </div>
  );
}
