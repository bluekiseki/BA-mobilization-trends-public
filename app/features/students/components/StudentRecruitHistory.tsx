import { SegmentedToggle } from '~/components/common/SegmentedToggle';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { serverLabel } from '../logic/serverLabel';
import { recruitStatus, type EventRewardEntry, type RecruitHistoryEntry, type RecruitServer, type RecruitStatus } from '../data/recruitHistory';

const statusClass: Record<RecruitStatus, string> = {
  ongoing: 'text-green-700 dark:text-green-400',
  upcoming: 'text-blue-700 dark:text-blue-400',
  predicted: 'text-amber-700 dark:text-amber-400',
  ended: 'text-neutral-500 dark:text-neutral-400',
};

export function StudentRecruitHistory({ history, events, locale }: { history: Record<RecruitServer, RecruitHistoryEntry[]>; events: Record<RecruitServer, EventRewardEntry[]>; locale: string }) {
  const { t } = useTranslation(['students', 'game']);
  // Korean defaults to GL, everything else to JP
  const [server, setServer] = useState<RecruitServer>(locale === 'ko' ? 'gl' : 'jp');
  // Status depends on the current time, so it is only computed after mount to keep SSR and hydration identical
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => setNowMs(Date.now()), []);
  // A student handed out by events has no banners; list those events instead
  const byEvent = history.gl.length + history.jp.length === 0 && events.gl.length + events.jp.length > 0;
  const rows = byEvent ? [] : history[server];
  const eventRows = byEvent ? events[server] : [];
  return (
    <section id="recruit" className="scroll-mt-24 space-y-3 border-t border-neutral-200 py-6 dark:border-neutral-700">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">{t(byEvent ? 'game:event' : 'recruit')}</h2>
        <SegmentedToggle
          options={(['gl', 'jp'] as const).map((value) => ({ value, label: `${serverLabel(value)} (${(byEvent ? events : history)[value].length})` }))}
          value={server}
          onChange={setServer}
        />
      </div>
      {byEvent ? (
        eventRows.length ? (
          <ul className="text-sm">
            {eventRows.map((row) => {
              const status = nowMs === null ? null : recruitStatus({ ...row, limited: false, fest: false, bannerType: '' }, nowMs);
              return (
                <li key={row.eventId} className="flex flex-wrap items-baseline gap-x-3 border-t border-neutral-200 py-2 dark:border-neutral-700">
                  <span className="tabular-nums">
                    {row.startTime.slice(0, 10)} ~ {row.endTime.slice(0, 10)}
                  </span>
                  <span className="font-medium">{row.name}</span>
                  {status && status !== 'ended' && <span className={`text-xs font-semibold ${statusClass[status]}`}>{t(`recruitStatus.${status}`)}</span>}
                  {row.rerun && <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('recruitRerun')}</span>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('recruitEventNone', { server: serverLabel(server) })}</p>
        )
      ) : rows.length ? (
        <ul className="text-sm">
          {rows.map((row) => {
            const status = nowMs === null ? null : recruitStatus(row, nowMs);
            const tags = [row.limited && t('recruitLimited'), row.fest && t('recruitFest'), row.rerun && t('recruitRerun'), row.bannerType].filter(Boolean);
            return (
              <li key={`${row.startTime}|${row.endTime}`} className="flex flex-wrap items-baseline gap-x-3 border-t border-neutral-200 py-2 dark:border-neutral-700">
                <span className="tabular-nums">
                  {row.startTime.slice(0, 10)} ~ {row.endTime.slice(0, 10)}
                </span>
                {status && status !== 'ended' && <span className={`text-xs font-semibold ${statusClass[status]}`}>{t(`recruitStatus.${status}`)}</span>}
                {!!tags.length && <span className="text-xs text-neutral-500 dark:text-neutral-400">{tags.join(' · ')}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('recruitNone', { server: serverLabel(server) })}</p>
      )}
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{t(byEvent ? 'recruitEventNote' : 'recruitNote')}</p>
    </section>
  );
}
