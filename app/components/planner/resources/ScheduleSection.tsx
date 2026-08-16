// components/planner/resources/ScheduleSection.tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import UnifiedPlanCalendar from '~/components/planner/shared/UnifiedPlanCalendar';
import type { CalendarSource, ScheduleBarItem } from '~/components/planner/shared/UnifiedPlanCalendar';
import StageFarmingPanel from '~/components/planner/resources/StageFarmingPanel';
import ItemPurchasePanel, { type PurchasePanelEntry } from '~/components/planner/resources/ItemPurchasePanel';
import type { CampaignData, CampaignStage, IconInfos } from '~/types/plannerData';
import type { StageFarmingPlan } from '~/types/resourcePlan';

interface ScheduleFilter {
  event: boolean;
  raid: boolean;
  multifloor: boolean;
  campaign: boolean;
}

interface ScheduleSectionProps {
  startDate: string;
  allCalendarSources: CalendarSource[];
  selectedCalendarKey: string;
  onCalendarSourceChange: (key: string) => void;
  filteredScheduleBarItems: ScheduleBarItem[];
  renderItemIcon: (itemKey: string, size: number, amount: number) => ReactNode;
  selectedRangeMin: string | null;
  selectedRangeMax: string | null;
  setSelectedRangeMin: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedRangeMax: React.Dispatch<React.SetStateAction<string | null>>;
  scheduleFilters: ScheduleFilter;
  onScheduleFilterChange: (key: keyof ScheduleFilter, value: boolean) => void;
  // Inline panel props
  selectedItemKey: string | null;
  availableStages: Array<{ stageId: string; stage: CampaignStage }>;
  panelEntryList: PurchasePanelEntry[];
  filteredPanelEntries: PurchasePanelEntry[];
  inlinePanelFilterTypes: Array<{ id: string; label: string }>;
  inlinePanelHiddenTypes: Set<string>;
  onTogglePanelType: (id: string) => void;
  showPurchasePanel: boolean;
  onClosePurchasePanel: () => void;
  selectedPurchaseDate: string | null;
  campaigns: { jp: CampaignData; kr: CampaignData } | null;
  server: 'kr' | 'jp';
  stageFarmingPlans: Record<string, StageFarmingPlan>;
  iconInfoData: IconInfos | null;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VISIBLE_MONTHS = 2;

function addMonthsToMonthStart(date: string, offset: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function formatMonthWindow(startDate: string, monthCount: number): string {
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(startDate + 'T00:00:00Z');
  end.setUTCMonth(end.getUTCMonth() + monthCount - 1);

  const startLabel = MONTH_LABELS[start.getUTCMonth()];
  const endLabel = MONTH_LABELS[end.getUTCMonth()];
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return startLabel === endLabel ? `${startLabel} ${start.getUTCFullYear()}` : `${startLabel}-${endLabel} ${start.getUTCFullYear()}`;
  }
  return `${startLabel} ${start.getUTCFullYear()}-${endLabel} ${end.getUTCFullYear()}`;
}

export function ScheduleSection({
  startDate,
  allCalendarSources,
  selectedCalendarKey,
  onCalendarSourceChange,
  filteredScheduleBarItems,
  renderItemIcon,
  selectedRangeMin,
  selectedRangeMax,
  setSelectedRangeMin,
  setSelectedRangeMax,
  scheduleFilters,
  onScheduleFilterChange,
  selectedItemKey,
  availableStages,
  panelEntryList,
  filteredPanelEntries,
  inlinePanelFilterTypes,
  inlinePanelHiddenTypes,
  onTogglePanelType,
  showPurchasePanel,
  onClosePurchasePanel,
  selectedPurchaseDate,
  campaigns,
  server,
  stageFarmingPlans,
  iconInfoData,
}: ScheduleSectionProps) {
  const { t: t_resources } = useTranslation('resources');
  const { t: t_common } = useTranslation();
  const hasPanelContent = selectedItemKey && (availableStages.length > 0 || panelEntryList.length > 0);
  const activeDateForPanel = selectedPurchaseDate ?? selectedRangeMin ?? selectedRangeMax ?? '';
  const visibleMonthCount = VISIBLE_MONTHS;
  const [visibleMonthOffset, setVisibleMonthOffset] = useState(0);
  const visibleStartDate = useMemo(() => addMonthsToMonthStart(startDate, visibleMonthOffset), [startDate, visibleMonthOffset]);
  const visibleWindowLabel = useMemo(() => formatMonthWindow(visibleStartDate, visibleMonthCount), [visibleStartDate, visibleMonthCount]);
  const filterItems = useMemo(
    () => [
      { key: 'campaign' as const, label: t_common('campaign') },
      { key: 'raid' as const, label: t_common('raidAndEraid') },
      { key: 'multifloor' as const, label: t_common('multifloor') },
      { key: 'event' as const, label: t_common('event') },
    ],
    [t_common],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      setVisibleMonthOffset((current) => (e.key === 'ArrowRight' ? current + 1 : Math.max(0, current - 1)));
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const inlinePanel = hasPanelContent ? (
    <div>
      {inlinePanelFilterTypes.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
          {inlinePanelFilterTypes.map(({ id, label }) => {
            const active = !inlinePanelHiddenTypes.has(id);
            return (
              <label
                key={id}
                title={label}
                className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[11px] font-semibold text-neutral-600 transition-colors hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => onTogglePanelType(id)}
                  className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-600"
                  style={{ accentColor: 'var(--color-ba-btn-blue)' }}
                />
                {label}
              </label>
            );
          })}
        </div>
      )}

      {!inlinePanelHiddenTypes.has('stages') && (selectedRangeMin || selectedRangeMax) && selectedItemKey && (
        <StageFarmingPanel
          selectedItemKey={selectedItemKey}
          campaigns={campaigns}
          server={server}
          stageFarmingPlans={stageFarmingPlans}
          rangeMin={selectedRangeMin ?? undefined}
          rangeMax={selectedRangeMax ?? undefined}
          renderItemIcon={renderItemIcon}
          iconInfoData={iconInfoData}
        />
      )}

      {showPurchasePanel && filteredPanelEntries.length > 0 && (selectedRangeMin || selectedRangeMax || selectedPurchaseDate) && (
        <ItemPurchasePanel
          date={activeDateForPanel}
          entries={filteredPanelEntries}
          onClose={onClosePurchasePanel}
          renderItemIcon={renderItemIcon}
          rangeMin={selectedRangeMin ?? undefined}
          rangeMax={selectedRangeMax ?? undefined}
        />
      )}
    </div>
  ) : undefined;

  return (
    <>
      <div className="space-y-2 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">{t_resources('schedule.title')}</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={visibleMonthOffset === 0}
                onClick={() => setVisibleMonthOffset((current) => Math.max(0, current - 1))}
                className="inline-flex h-6 w-6 items-center justify-center text-neutral-500 transition-colors hover:text-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-100 dark:disabled:text-neutral-600"
                aria-label={t_resources('schedule.previousMonth')}
              >
                <FiChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setVisibleMonthOffset(0)}
                disabled={visibleMonthOffset === 0}
                className="min-w-[112px] text-center text-sm font-semibold text-neutral-800 disabled:cursor-default disabled:text-neutral-800 dark:text-neutral-100 dark:disabled:text-neutral-100"
                title={t_resources('schedule.returnToCurrentMonth')}
              >
                {visibleWindowLabel}
              </button>
              <button
                type="button"
                onClick={() => setVisibleMonthOffset((current) => current + 1)}
                className="inline-flex h-6 w-6 items-center justify-center text-neutral-500 transition-colors hover:text-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-100 dark:disabled:text-neutral-600"
                aria-label={t_resources('schedule.nextMonth')}
              >
                <FiChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {filterItems.map(({ key, label }) => {
              const active = scheduleFilters[key];
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-neutral-600 transition-colors hover:text-neutral-800 dark:text-neutral-300 dark:hover:text-neutral-100"
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => onScheduleFilterChange(key, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-600"
                    style={{ accentColor: 'var(--color-ba-btn-blue)' }}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {(showPurchasePanel || hasPanelContent) && (
          <p className="border-t border-neutral-200 pt-2 text-xs leading-5 text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <Trans
              i18nKey="resources:schedule.dragHint"
              components={{
                kbd: <kbd className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded text-[0.8em] font-mono" />,
                br: <br />,
              }}
            />
          </p>
        )}
      </div>

      <UnifiedPlanCalendar
        startDate={startDate}
        visibleStartDate={visibleStartDate}
        months={visibleMonthCount}
        sources={allCalendarSources}
        activeSourceKey={selectedCalendarKey}
        onActiveSourceChange={onCalendarSourceChange}
        scheduleItems={filteredScheduleBarItems}
        renderItemIcon={renderItemIcon}
        selStart={selectedRangeMin}
        setSelStart={setSelectedRangeMin}
        committedEnd={selectedRangeMax}
        setCommittedEnd={setSelectedRangeMax}
        inlinePanel={inlinePanel}
      />
    </>
  );
}
