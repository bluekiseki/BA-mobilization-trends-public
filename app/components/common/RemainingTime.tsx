import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface RemainingTimeProps {
  targetDate: Date;
  isUpcoming?: boolean;
  compact?: boolean; // true = days only / hours only (home widget), false = "Nd Nh" (event page)
  className?: string;
}

// Pre-translated templates with {d} / {h} / {m} placeholders
interface RemainingTemplates {
  dh: string;
  d: string;
  h: string;
  m: string;
}

// SSR/pre-hydration fallback: "M/D (GMT+9)"
function fallbackDateStr(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} (GMT+9)`;
}

// Must stay self-contained (no outer references): it is serialized into the inline
// pre-hydration script in root.tsx via Function.prototype.toString().
function formatRemaining(targetMs: number, nowMs: number, tpl: RemainingTemplates, compact: boolean): string {
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return '';
  const day = Math.floor(diffMs / 86400000);
  const hour = Math.floor((diffMs % 86400000) / 3600000);
  const min = Math.floor((diffMs % 3600000) / 60000);
  const fill = (s: string) => s.replace('{d}', String(day)).replace('{h}', String(hour)).replace('{m}', String(min));

  /* Less than 1 hour → Show minutes */
  if (diffMs < 3600000) return fill(tpl.m);
  if (compact) return fill(day >= 1 ? tpl.d : tpl.h);
  if (day > 0 && hour > 0) return fill(tpl.dh);
  return fill(day > 0 ? tpl.d : tpl.h);
}

// Inline script that fills every RemainingTime span with the client clock before hydration,
// so the date fallback is not shown while the JS bundle loads. Server time can't be used
// because SSR HTML is edge-cached for hours.
export const REMAINING_TIME_PREHYDRATE_SCRIPT = `try{var f=${formatRemaining.toString().replace(/\s+/g, ' ').trim()},n=Date.now();document.querySelectorAll('[data-rt]').forEach(function(e){e.textContent=f(+e.getAttribute('data-rt'),n,JSON.parse(e.getAttribute('data-rt-tpl')),e.hasAttribute('data-rt-compact'))})}catch(e){}`;

export function RemainingTime({ targetDate, isUpcoming = false, compact = false, className }: RemainingTimeProps) {
  const { t } = useTranslation('common');
  const [str, setStr] = useState<string | null>(null);

  const tpl: RemainingTemplates = isUpcoming
    ? {
        dh: t('startsIn', { day: '{d}', hour: '{h}' }),
        d: t('startsInDays', { day: '{d}' }),
        h: t('startsInHours', { hour: '{h}' }),
        m: t('startsInMinutes', { min: '{m}' }),
      }
    : {
        dh: t('remainingTime', { day: '{d}', hour: '{h}' }),
        d: t('remainingDays', { day: '{d}' }),
        h: t('remainingHours', { hour: '{h}' }),
        m: t('remainingMinutes', { min: '{m}' }),
      };
  const tplJson = JSON.stringify(tpl);
  const targetMs = targetDate.getTime();

  useEffect(() => {
    const parsed = JSON.parse(tplJson) as RemainingTemplates;
    const compute = () => setStr(formatRemaining(targetMs, Date.now(), parsed, compact));
    compute();
    const timer = setInterval(compute, 60000);
    return () => clearInterval(timer);
  }, [targetMs, tplJson, compact]);

  return (
    <span className={className} data-rt={targetMs} data-rt-tpl={tplJson} data-rt-compact={compact ? '' : undefined} suppressHydrationWarning>
      {str ?? fallbackDateStr(targetDate)}
    </span>
  );
}
