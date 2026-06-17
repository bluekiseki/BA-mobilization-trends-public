// app/components/gacha/APSchedulePanel.tsx
// Event schedule list with AP override dropdowns — extracted from IncomePlannerPanel.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCalendarAlt } from 'react-icons/fa';
import type { PlannerSchedule } from '~/utils/pyroxeneCalc';

interface Props {
  schedules: PlannerSchedule[];
  apOverrides: Record<string, number>;
  onApChange: (id: string, val: string) => void;
}

export default function APSchedulePanel({ schedules, apOverrides, onApChange }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'gacha.income.timeline' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sorted = useMemo(() => schedules.filter((s) => new Date(s.end) >= today).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()), [schedules]);

  const typeStyle = (type: string) => {
    switch (type) {
      case 'Event':
        return { label: t('types.evt'), color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' };
      case 'Raid':
        return { label: t('types.raid'), color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' };
      case 'Elimination':
        return { label: t('types.elim'), color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' };
      case 'Multifloor':
        return { label: t('types.towr'), color: 'bg-rose-100 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900' };
      case 'Campaign':
        return { label: t('types.camp'), color: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800' };
      default:
        return { label: t('types.etc'), color: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700' };
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm overflow-hidden">
      <div className="p-3 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 flex justify-between items-center">
        <h3 className="font-bold text-neutral-700 dark:text-neutral-200 flex items-center gap-2 text-sm">
          <FaCalendarAlt className="text-neutral-500 dark:text-neutral-400" /> {t('title')}
        </h3>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{t('total_count', { count: sorted.length })}</span>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-3 py-2 bg-neutral-50 dark:bg-neutral-800/30 border-b border-neutral-100 dark:border-neutral-800 text-[10px] font-bold text-neutral-500 dark:text-neutral-400">
        <div className="w-16">{t('headers.start')}</div>
        <div className="w-12 text-center">{t('headers.type')}</div>
        <div className="flex-1 px-2">{t('headers.name')}</div>
        <div className="w-14 text-right">{t('headers.ap')}</div>
      </div>

      <div className="max-h-96 overflow-y-auto custom-scrollbar">
        {sorted.map((item) => {
          const style = typeStyle(item.type);
          const isConfigurable = item.type === 'Event' || item.type === 'Campaign';
          const currentOverride = apOverrides[item.id] ?? -1;
          return (
            <div key={item.id} className="flex items-center px-3 py-2 border-b border-neutral-50 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
              <div className="w-16 text-xs text-neutral-500 dark:text-neutral-500 font-mono shrink-0">{item.start.slice(5).replace('-', '/')}</div>
              <div className="w-12 shrink-0 flex justify-center">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${style.color}`}>{style.label}</span>
              </div>
              <div className="flex-1 px-2 min-w-0">
                <div className="text-xs text-neutral-700 dark:text-neutral-300 truncate">{item.name}</div>
              </div>
              <div className="w-14 shrink-0 text-right h-6">
                {isConfigurable && (
                  <select
                    className={`w-full text-[10px] border rounded py-0.5 px-1 outline-none cursor-pointer transition-colors ${
                      currentOverride !== -1
                        ? 'bg-blue-600 dark:bg-blue-500 text-white border-blue-600'
                        : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700'
                    }`}
                    value={currentOverride}
                    onChange={(e) => onApChange(item.id, e.target.value)}
                  >
                    <option value={-1}>-</option>
                    {[0, 3, 6, 9, 12].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <div className="p-4 text-center text-xs text-neutral-400 dark:text-neutral-500">{t('empty')}</div>}
      </div>
    </div>
  );
}
