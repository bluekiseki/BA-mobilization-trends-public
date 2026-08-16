import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Student } from '~/types/data';
import { StudentIcon } from '~/components/dashboard/studentIcon';
import type { Character } from '~/components/dashboard/common';

export interface StudentGoalStatus {
  studentId: number;
  studentName: string;
  date?: string;
  targetStar: number;
  targetUw: number;
  requiredEleph: number;
  naturalEleph: number;
  elephShortfall: number;
  eligmaCost: number;
  eligmaBalanceAfter?: number;
  status: 'on_track' | 'covered_by_eligma' | 'at_risk' | 'no_deadline';
}

export interface TacticalCoinStatus {
  firstShortageDate?: string;
  lowestBalance: number;
  totalApGain: number;
  purchaseDays: number;
}

interface GoalStatusSummaryProps {
  statuses: StudentGoalStatus[];
  tacticalCoinStatus?: TacticalCoinStatus;
  studentsRecord: Record<number, Student>;
  onOpenStudentGoals: () => void;
  onSelectResource: (key: string) => void;
}

function formatDate(date: string | undefined, noDeadlineLabel: string): string {
  if (!date) return noDeadlineLabel;
  return `${date.slice(5, 7)}/${date.slice(8, 10)}`;
}

function statusClassName(status: StudentGoalStatus['status']): string {
  if (status === 'at_risk') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300';
  if (status === 'covered_by_eligma') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300';
  if (status === 'no_deadline') return 'border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400';
  return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/20 dark:text-green-300';
}

export function GoalStatusSummary({ statuses, tacticalCoinStatus, studentsRecord, onOpenStudentGoals, onSelectResource }: GoalStatusSummaryProps) {
  const { t } = useTranslation('resources');
  const noDeadlineLabel = t('planStatus.noDeadlineDate');

  const portraitData = useMemo(() => {
    const result: Record<number, string> = {};
    for (const [id, s] of Object.entries(studentsRecord)) {
      if (s.Portrait) result[Number(id)] = s.Portrait;
    }
    return result;
  }, [studentsRecord]);

  const atRiskCount = statuses.filter((status) => status.status === 'at_risk').length;
  const coveredCount = statuses.filter((status) => status.status === 'covered_by_eligma').length;
  const onTrackCount = statuses.filter((status) => status.status === 'on_track').length;
  const noDeadlineCount = statuses.filter((status) => status.status === 'no_deadline').length;

  const statusLabel = (status: StudentGoalStatus['status']): string => {
    if (status === 'at_risk') return t('planStatus.statusAtRisk');
    if (status === 'covered_by_eligma') return t('planStatus.statusCovered');
    if (status === 'no_deadline') return t('planStatus.statusNoDeadline');
    return t('planStatus.statusOnTrack');
  };

  const tacticalStatusLabel = tacticalCoinStatus?.firstShortageDate ? t('planStatus.statusAtRisk') : t('planStatus.statusOnTrack');
  const tacticalStatusCls = tacticalCoinStatus?.firstShortageDate
    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300'
    : 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/20 dark:text-green-300';

  return (
    <section className="px-3 sm:px-4 xl:px-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t('planStatus.title')}</h2>
          {statuses.length > 0 && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {noDeadlineCount > 0
                ? t('planStatus.summaryWithDeadline', { atRisk: atRiskCount, covered: coveredCount, onTrack: onTrackCount, noDeadline: noDeadlineCount })
                : t('planStatus.summary', { atRisk: atRiskCount, covered: coveredCount, onTrack: onTrackCount })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenStudentGoals}
          className="shrink-0 rounded border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {t('planStatus.openButton')}
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t('planStatus.sectionTitle')}</h3>
        {statuses.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">{t('planStatus.emptyState')}</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {statuses.map((status) => {
              const balanceLabel =
                status.eligmaBalanceAfter === undefined
                  ? null
                  : status.eligmaBalanceAfter < 0
                    ? t('planStatus.eligmaShort', { amount: Math.abs(status.eligmaBalanceAfter).toLocaleString() })
                    : t('planStatus.eligmaLeft', { amount: status.eligmaBalanceAfter.toLocaleString() });
              const character: Character = {
                id: status.studentId,
                level: 0,
                star: status.targetStar,
                hasWeapon: status.targetUw > 0,
                weaponStar: status.targetUw,
                isAssist: false,
              };
              return (
                <button
                  key={`${status.studentId}-${status.date ?? 'no-deadline'}-${status.targetStar}-${status.targetUw}`}
                  type="button"
                  onClick={() => onSelectResource(`Item_${status.studentId}`)}
                  className="rounded border border-neutral-200 p-3 text-left transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/50"
                >
                  <div className="flex items-start gap-2">
                    <div className="w-10 shrink-0">
                      <StudentIcon character={character} student={studentsRecord[status.studentId]} portraitData={portraitData} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100" title={status.studentName}>
                          {status.studentName}
                        </h3>
                        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${statusClassName(status.status)}`}>{statusLabel(status.status)}</span>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{formatDate(status.date, noDeadlineLabel)}</p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1 text-xs">
                    {status.elephShortfall > 0 ? (
                      <>
                        <div className="flex justify-between gap-2">
                          <span className="text-neutral-500 dark:text-neutral-400">{t('planStatus.needsFromEligma')}</span>
                          <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-100">{Math.round(status.elephShortfall).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-neutral-500 dark:text-neutral-400">{t('planStatus.costsEligma')}</span>
                          <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-100">{status.eligmaCost.toLocaleString()}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between gap-2">
                        <span className="text-neutral-500 dark:text-neutral-400">{t('planStatus.naturalEleph')}</span>
                        <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-100">
                          {Math.round(status.naturalEleph).toLocaleString()} / {status.requiredEleph.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {balanceLabel && (
                      <p
                        className={`truncate ${status.eligmaBalanceAfter !== undefined && status.eligmaBalanceAfter < 0 ? 'text-red-600 dark:text-red-400' : 'text-neutral-400 dark:text-neutral-500'}`}
                      >
                        {balanceLabel}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {tacticalCoinStatus && (
        <div className="space-y-2 pt-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t('planStatus.resourceRisks')}</h3>
          <button
            type="button"
            onClick={() => onSelectResource('Item_8')}
            className="w-full rounded border border-neutral-200 p-3 text-left transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('planStatus.tacticalCoin')}</h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('planStatus.apPurchaseDays', { count: tacticalCoinStatus.purchaseDays })}</p>
              </div>
              <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${tacticalStatusCls}`}>{tacticalStatusLabel}</span>
            </div>

            <div className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-neutral-500 dark:text-neutral-400">{t('planStatus.apPlanGains')}</span>
                <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-100">{tacticalCoinStatus.totalApGain.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-neutral-500 dark:text-neutral-400">{t('planStatus.lowestBalance')}</span>
                <span className={`font-mono font-semibold ${tacticalCoinStatus.lowestBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-neutral-800 dark:text-neutral-100'}`}>
                  {tacticalCoinStatus.lowestBalance.toLocaleString()}
                </span>
              </div>
              {tacticalCoinStatus.firstShortageDate && (
                <p className="text-red-600 dark:text-red-400">{t('planStatus.shortOn', { date: formatDate(tacticalCoinStatus.firstShortageDate, noDeadlineLabel) })}</p>
              )}
            </div>
          </button>
        </div>
      )}
    </section>
  );
}
