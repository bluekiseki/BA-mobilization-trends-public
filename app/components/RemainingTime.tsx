import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RemainingTimeProps {
  targetDate: Date;
  isUpcoming?: boolean;
  compact?: boolean; // true = days only / hours only (home widget), false = "Nd Nh" (event page)
  className?: string;
}

// SSR/pre-hydration fallback: "M/D (GMT+9)"
function fallbackDateStr(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} (GMT+9)`;
}

export function RemainingTime({ targetDate, isUpcoming = false, compact = false, className }: RemainingTimeProps) {
  const { t } = useTranslation('common');
  const [str, setStr] = useState<string | null>(null);

  useEffect(() => {
    const compute = () => {
      const diffMs = targetDate.getTime() - Date.now();
      if (diffMs <= 0) {
        setStr('');
        return;
      }
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      // Less than 1 hour → Show minutes
      if (diffMs < 1000 * 60 * 60) {
        setStr(isUpcoming ? t('startsInMinutes', { min: diffMins }) : t('remainingMinutes', { min: diffMins }));
        return;
      }

      if (isUpcoming) {
        if (compact) {
          setStr(diffDays >= 1 ? t('startsInDays', { day: diffDays }) : t('startsInHours', { hour: diffHours }));
        } else if (diffDays > 0 && diffHours > 0) {
          setStr(t('startsIn', { day: diffDays, hour: diffHours }));
        } else if (diffDays > 0) {
          setStr(t('startsInDays', { day: diffDays }));
        } else {
          setStr(t('startsInHours', { hour: diffHours }));
        }
      } else {
        if (compact) {
          setStr(diffDays >= 1 ? t('remainingDays', { day: diffDays }) : t('remainingHours', { hour: diffHours }));
        } else if (diffDays > 0 && diffHours > 0) {
          setStr(t('remainingTime', { day: diffDays, hour: diffHours }));
        } else if (diffDays > 0) {
          setStr(t('remainingDays', { day: diffDays }));
        } else {
          setStr(t('remainingHours', { hour: diffHours }));
        }
      }
    };

    compute();
    const timer = setInterval(compute, 60000);
    return () => clearInterval(timer);
  }, [targetDate, isUpcoming, compact, t]);

  return <span className={className}>{str ?? fallbackDateStr(targetDate)}</span>;
}
