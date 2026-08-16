import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiExclamationTriangle } from 'react-icons/hi2';
import { RemainingTime } from '~/components/RemainingTime';

function getNextMonthlyResetDate(): Date {
  const kstOffset = 9 * 60 * 60 * 1000;
  const nowKst = new Date(Date.now() + kstOffset);
  const y = nowKst.getUTCFullYear();
  const m = nowKst.getUTCMonth();
  const isBeforeResetToday = nowKst.getUTCDate() === 1 && nowKst.getUTCHours() < 4;
  const resetKst = isBeforeResetToday ? new Date(Date.UTC(y, m, 1, 4, 0, 0, 0)) : new Date(Date.UTC(y, m + 1, 1, 4, 0, 0, 0));
  return new Date(resetKst.getTime() - kstOffset);
}

export function MonthEndResetBanner() {
  const { t } = useTranslation('common');
  const [resetDate, setResetDate] = useState<Date | null>(null);

  useEffect(() => {
    const date = getNextMonthlyResetDate();
    const msLeft = date.getTime() - Date.now();
    if (msLeft > 0 && msLeft <= 24 * 60 * 60 * 1000) {
      setResetDate(date);
    }
  }, []);

  return (
    <div className={`overflow-hidden transition-all duration-500 ease-in-out pt-px ${resetDate ? 'max-h-16 opacity-100 mb-2.5' : 'max-h-0 opacity-0'}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-sm border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-300">
        <HiExclamationTriangle className="shrink-0 text-amber-500 dark:text-amber-400" />
        <span>{t('home.monthEndReset')}</span>
        {resetDate && <RemainingTime targetDate={resetDate} className="font-semibold" />}
      </div>
    </div>
  );
}
