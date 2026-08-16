import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { RemainingTime } from '~/components/RemainingTime';
import { localeLink } from '~/utils/localeLink';
import type { Locale } from '~/utils/i18n/config';

export type EventStatus = 'active' | 'upcoming';

export interface StatusEvent {
  id: number;
  name: string;
  status: EventStatus;
  dateIso: string; // end date if active, start date if upcoming
  planable?: boolean;
}

export type RaidStatus = 'live' | 'active' | 'upcoming';

export const STATUS_BADGE_CLS: Record<RaidStatus | EventStatus, string> = {
  live: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  upcoming: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

export function ServerBadge({ server }: { server: 'JP' | 'GL/KR' }) {
  const cls = server === 'JP' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  return <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${cls}`}>{server}</span>;
}

export function StatusBadge({ status }: { status: RaidStatus | EventStatus }) {
  const { t } = useTranslation('common');
  const label = status === 'upcoming' ? t('status.upcoming') : t('status.live');
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_BADGE_CLS[status]}`}>{label}</span>;
}

export function EventCard({ event, server, locale }: { event: StatusEvent | null; server: 'JP' | 'GL/KR'; locale: Locale }) {
  if (!event) return <EmptyEventCard server={server} />;

  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        <ServerBadge server={server} />
        <StatusBadge status={event.status} />
      </div>
      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 line-clamp-2 leading-snug grow" title={event.name}>
        {event.name}
      </p>
      <div className="flex items-center">
        <RemainingTime targetDate={new Date(event.dateIso)} isUpcoming={event.status === 'upcoming'} className="text-xs text-neutral-400 dark:text-neutral-500 ml-auto" />
      </div>
    </>
  );

  if (event.planable === false) {
    return (
      <div className="rounded-sm border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-800/70 backdrop-blur-sm p-3.5 flex flex-col gap-2 min-h-24 cursor-default">{inner}</div>
    );
  }

  return (
    <Link
      to={localeLink(locale, `/planner/event/${String(event.id).replace(/^\d00/, '')}`)}
      className="group rounded-sm border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-800/70 backdrop-blur-sm p-3.5 hover:border-blue-400 dark:hover:border-blue-500 flex flex-col gap-2 min-h-24"
    >
      {inner}
    </Link>
  );
}

export function EmptyEventCard({ server }: { server: 'JP' | 'GL/KR' }) {
  const { t } = useTranslation('common');
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-800/70 backdrop-blur-sm p-3.5 flex flex-col gap-2 min-h-24">
      <div className="flex items-center gap-1.5">
        <ServerBadge server={server} />
      </div>
      <p className="text-sm text-neutral-400 dark:text-neutral-500 grow flex items-center">{t('home.noEvent')}</p>
    </div>
  );
}
