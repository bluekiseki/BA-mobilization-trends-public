import { useTranslation } from 'react-i18next';
import { ASSUMABLE_INCOME_SOURCES, DEFAULT_EVENT_INCOME_MODE, isIncomeAssumed, type EventIncomeMode, type IncomeAssumptions as Assumptions } from '~/utils/itemOutlook';

const EVENT_INCOME_MODES: readonly EventIncomeMode[] = ['planner', 'all'];

interface IncomeAssumptionsProps {
  assumptions: Assumptions | undefined;
  onChange: (next: Assumptions) => void;
  eventIncomeMode: EventIncomeMode | undefined;
  onEventIncomeModeChange: (mode: EventIncomeMode) => void;
}

/** Event income source (pick one) and the sources whose full reward can be assumed; applies to every item. */
export function IncomeAssumptions({ assumptions, onChange, eventIncomeMode, onEventIncomeModeChange }: IncomeAssumptionsProps) {
  const { t } = useTranslation('resources');
  const mode = eventIncomeMode ?? DEFAULT_EVENT_INCOME_MODE;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{t('assumeAll.eventTitle')}</span>
      {EVENT_INCOME_MODES.map((value) => (
        <label key={value} className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
          <input type="radio" name="event-income-mode" checked={mode === value} onChange={() => onEventIncomeModeChange(value)} />
          {t(`assumeAll.eventMode.${value}`)}
        </label>
      ))}
      <span className="pt-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">{t('assumeAll.title')}</span>
      {ASSUMABLE_INCOME_SOURCES.map(({ id }) => (
        <label key={id} className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
          <input type="checkbox" checked={isIncomeAssumed(assumptions, id)} onChange={(e) => onChange({ ...assumptions, [id]: e.target.checked })} />
          {t(`assumeAll.${id}`)}
        </label>
      ))}
    </div>
  );
}
