// app/components/planner/Resources/ResourcePanel.tsx
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { buildResourceTimelines, buildAnnotations, buildResourcePlanningTimelines } from '~/utils/resourceTimeline';
import type { ResourceEvent, ResourcePlanEvent } from '~/utils/resourceTimeline';
import {
  eventsFromPurchaseEvents,
  eventsFromDailySources,
  eventsFromContentYields,
  mergeResourceEvents,
  eventsFromGachaItems,
  eventsFromEventEligma,
  eventsFromEventEleph,
} from '~/utils/resourceEventAdapters';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import { getItemTitle, type I18nLike } from '~/utils/scheduleDisplay';
import { meanFromDist, type GlobalAggregatedResult, type DistributionData } from '~/utils/gachaEngine';
import { getPercentileFromDist } from '~/utils/elephEligmaCalc';
import type { EventPlan } from '~/types/eventPlan';
import ResourceTimelineChart from './ResourceTimelineChart';
import { groupTimelineAnnotations, ResourceEventLogList } from './ResourceEventLog';
import { ItemIcon } from '~/components/planner/common/Icon';
import type { EventData, IconData, IconInfo, IconInfos } from '~/types/plannerData';
import { getLocalizeEtcName } from '~/components/planner/common/locale';
import type { Locale } from '~/utils/i18n/config';
import { getItemTypeFromKey } from '~/utils/itemType';

// ---------------------------------------------------------------------------
// Exported types (used by ResourcePlanner)
// ---------------------------------------------------------------------------

export interface TrackingItem {
  key: string;
  iconInfo?: IconInfo;
  label?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ITEM_WEEKLY_LIMITS: Record<string, number> = {
  Currency_18: 12000,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  trackingItems: TrackingItem[];
  /** Keys selected via global search — ensures their timelines are built */
  extraKeys?: Set<string>;

  /** Controlled selected item key (global state from ResourcePlanner) */
  selectedKey: string | null;

  /** Rendered inside the Resources container when the selected item is a student eleph */
  studentPlansSection?: React.ReactNode;

  inventory: Record<string, number>;
  onUpdateInventory: (key: string, value: number) => void;

  distEligma: DistributionData[];
  gachaEligmaPercentile: number;
  gachaEligmaUseMean: boolean;
  onSetPercentile: (v: number) => void;
  onSetUseMean: (v: boolean) => void;

  purchaseEvents: ResourcePlanEvent[];

  eventItemsByKey: Record<string, { name: string; date: string; amount: number }[]>;

  startDate: string;
  days: number;
  dailySourceAmounts: Record<string, Record<string, number>>;
  contentEventYields: Record<string, number>;
  contentSchedule: ScheduleItemV2[];
  growthSpendEvents?: ResourceEvent[];
  extraEvents?: ResourceEvent[];
  gachaResult?: GlobalAggregatedResult | null;
  studentIds?: number[];
  eventPlans?: Record<string, Partial<EventPlan>>;
  eventScheduleMap?: Record<number, { date: string }>;

  iconInfos: IconInfos | null;
  iconData: IconData | null;
  locale: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ResourcePanel({
  trackingItems,
  extraKeys,
  selectedKey,
  inventory,
  onUpdateInventory,
  distEligma,
  gachaEligmaPercentile,
  gachaEligmaUseMean,
  onSetPercentile,
  onSetUseMean,
  purchaseEvents,
  eventItemsByKey,
  startDate,
  days,
  dailySourceAmounts,
  contentEventYields,
  contentSchedule,
  growthSpendEvents,
  extraEvents,
  gachaResult,
  studentIds,
  eventPlans,
  eventScheduleMap,
  iconInfos,
  iconData,
  locale,
  studentPlansSection,
}: Props) {
  const { t, i18n } = useTranslation('resources');
  const { t: t_ui } = useTranslation('ui');
  const getScheduleTitle = useCallback((item: ScheduleItemV2) => getItemTitle(item, i18n.language as Locale, i18n as I18nLike), [i18n]);

  const alwaysIncludeKeys = useMemo(() => new Set([...trackingItems.map((t) => t.key), ...(extraKeys ?? [])]), [trackingItems, extraKeys]);

  // Derived from eventItemsByKey for the eligma timeline event adapter
  const eligmaEventItems = useMemo(() => (eventItemsByKey['Item_23'] ?? []).map((i) => ({ date: i.date, eligma: i.amount })), [eventItemsByKey]);

  // All resource events — separated so planningTimelines can reuse without rebuilding
  const allEvents = useMemo(
    () =>
      mergeResourceEvents(
        eventsFromPurchaseEvents(purchaseEvents, startDate),
        eventsFromDailySources(dailySourceAmounts, startDate, days),
        eventsFromContentYields(contentEventYields, contentSchedule, startDate, getScheduleTitle),
        growthSpendEvents ?? [],
        extraEvents ?? [],
        eventsFromGachaItems(gachaResult, startDate, studentIds ?? []),
        eligmaEventItems.length ? eventsFromEventEligma(eligmaEventItems) : [],
        eventPlans && eventScheduleMap && studentIds?.length ? eventsFromEventEleph(eventPlans, eventScheduleMap, studentIds) : [],
      ),
    [
      purchaseEvents,
      startDate,
      dailySourceAmounts,
      days,
      contentEventYields,
      contentSchedule,
      growthSpendEvents,
      extraEvents,
      gachaResult,
      studentIds,
      eligmaEventItems,
      eventPlans,
      eventScheduleMap,
      getScheduleTitle,
    ],
  );

  // Build timelines + annotations
  const { timelines, annotations } = useMemo(
    () => ({
      timelines: buildResourceTimelines(startDate, days, inventory, allEvents, alwaysIncludeKeys),
      annotations: buildAnnotations(allEvents),
    }),
    [startDate, days, inventory, allEvents, alwaysIncludeKeys],
  );

  // Planning timelines at the selected percentile — recomputed only when percentile changes
  const planningTimelines = useMemo(
    () => buildResourcePlanningTimelines(startDate, days, inventory, allEvents, gachaEligmaUseMean ? { type: 'mean' } : { type: 'percentile', percentile: gachaEligmaPercentile }, alwaysIncludeKeys),
    [startDate, days, inventory, allEvents, gachaEligmaPercentile, gachaEligmaUseMean, alwaysIncludeKeys],
  );

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const eventData = useMemo(() => ({ icons: iconInfos ?? {} }) as unknown as EventData, [iconInfos]);

  const getLabelForKey = (key: string): string => {
    const ti = trackingItems.find((t) => t.key === key);
    if (ti) {
      const loc = getLocalizeEtcName(ti.iconInfo?.LocalizeEtc, i18n.language as Locale);
      if (loc) return loc;
      if (ti.label) return ti.label;
    }
    const idx = key.lastIndexOf('_');
    if (idx >= 0) {
      const type = key.slice(0, idx);
      const id = key.slice(idx + 1);
      const rec = iconInfos?.[type as keyof typeof iconInfos] as Record<string, IconInfo> | undefined;
      const loc = getLocalizeEtcName(rec?.[id]?.LocalizeEtc, i18n.language as Locale);
      if (loc) return loc;
    }
    return key;
  };

  const renderIcon = (key: string, twSize: 'sm' | 'md') => {
    if (!iconData) return null;
    const i = key.lastIndexOf('_');
    if (i < 0) return null;
    return <ItemIcon type={key.slice(0, i)} itemId={key.slice(i + 1)} amount={0} size={twSize === 'sm' ? 4 : 6} eventData={eventData} iconData={iconData} />;
  };

  const effectiveKey = selectedKey && timelines[selectedKey] ? selectedKey : (trackingItems[0]?.key ?? null);

  // ---------------------------------------------------------------------------
  // Selected item details
  // ---------------------------------------------------------------------------

  const isEligma = effectiveKey === 'Item_23';
  const isStudentEleph = !isEligma && getItemTypeFromKey(effectiveKey ?? '', iconInfos) === 'SecretStone';
  const eventIncomeItems = eventItemsByKey[effectiveKey ?? ''] ?? [];
  const eventIncomeTotal = eventIncomeItems.reduce((s, e) => s + e.amount, 0);

  const hasGachaData = distEligma.length > 0;
  const getGachaEligmaPercentile = (pct: number) => getPercentileFromDist(distEligma, pct);
  const gachaP10 = hasGachaData ? getGachaEligmaPercentile(10) : null;
  const gachaP50 = hasGachaData ? getGachaEligmaPercentile(50) : null;
  const gachaP90 = hasGachaData ? getGachaEligmaPercentile(90) : null;
  const gachaAvg = hasGachaData ? Math.round(meanFromDist(distEligma)) : null;

  const groupedEventLog = useMemo(() => {
    if (!effectiveKey) return [];
    return groupTimelineAnnotations(annotations[effectiveKey] ?? {});
  }, [effectiveKey, annotations]);

  const selectedTimeline = effectiveKey ? timelines[effectiveKey] : undefined;
  const hasBand = selectedTimeline ? selectedTimeline.some((p) => p.probabilistic || p.p10 !== p.p90) : false;
  // When band data exists, show the planning-percentile value; otherwise fall back to p50
  const lastPlanningValue = effectiveKey ? (hasBand ? planningTimelines[effectiveKey]?.at(-1)?.p50 : timelines[effectiveKey]?.at(-1)?.p50) : undefined;
  const planningLabel = gachaEligmaUseMean ? t_ui('avg') : `P${gachaEligmaPercentile}`;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const inputCls =
    'px-2 py-1 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400';
  const sectionLabelCls = 'text-xs font-semibold text-neutral-500 dark:text-neutral-400';
  const noteCls = 'text-xs text-neutral-400 dark:text-neutral-500 italic';

  return (
    <>
      <div className="px-4 py-3 space-y-4">
        <h2 className="text-xs font-bold uppercase text-neutral-400 dark:text-neutral-500">{t('panel.title')}</h2>

        {studentPlansSection && <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3">{studentPlansSection}</div>}

        {/* Selected item */}
        {effectiveKey && timelines[effectiveKey] && (
          <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3 space-y-4">
            {/* Header: icon + label + final balance */}
            <div className="flex items-center gap-2">
              {renderIcon(effectiveKey, 'md')}
              <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{getLabelForKey(effectiveKey)}</span>
              {lastPlanningValue !== undefined && (
                <span className="ml-auto font-mono text-xs text-neutral-400 dark:text-neutral-500 tabular-nums">
                  {hasBand && <span className="mr-0.5 text-neutral-300 dark:text-neutral-600">{planningLabel}</span>}
                  {lastPlanningValue.toLocaleString()}
                </span>
              )}
            </div>

            {/* Starting inventory */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-1">{t('panel.startingInventory')}</span>
              <input
                type="number"
                className={`${inputCls} w-28 text-right`}
                value={inventory[effectiveKey] ?? 0}
                min={0}
                onChange={(e) => onUpdateInventory(effectiveKey, Number(e.target.value) || 0)}
              />
            </div>

            {/* Eligma: gacha simulation stats */}
            {isEligma && (
              <div className="space-y-2.5">
                <span className={sectionLabelCls}>{t('panel.gachaSimulation')}</span>
                {hasGachaData ? (
                  <div className="flex gap-6">
                    {[
                      { l: 'P10', v: gachaP10 },
                      { l: 'P50', v: gachaP50 },
                      { l: 'P90', v: gachaP90 },
                      { l: t_ui('avg'), v: gachaAvg },
                    ].map(({ l, v }) => (
                      <div key={l} className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{l}</span>
                        <span className="font-mono text-sm font-semibold text-neutral-700 dark:text-neutral-200">{v?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={noteCls}>
                    {t('panel.noSimDataPre')}{' '}
                    <Link to={`/${locale}/planner/gacha`} className="text-blue-500 hover:underline not-italic">
                      {t_ui('simulation')}
                    </Link>
                    {t('panel.noSimDataPost')}
                  </p>
                )}
              </div>
            )}

            {/* Planning percentile — shown for any item with probabilistic band data */}
            {hasBand && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">{t('panel.planAt')}</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">P</span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    step={5}
                    value={gachaEligmaPercentile}
                    disabled={gachaEligmaUseMean}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(99, Number(e.target.value)));
                      if (!Number.isNaN(v)) onSetPercentile(v);
                    }}
                    className="w-14 px-2 py-0.5 text-xs font-bold rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400 text-right tabular-nums disabled:opacity-50"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 cursor-pointer">
                  <input type="checkbox" checked={gachaEligmaUseMean} onChange={(e) => onSetUseMean(e.target.checked)} className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-600" />
                  {t_ui('avg')}
                </label>
              </div>
            )}

            {/* Event income */}
            {(isEligma || isStudentEleph) && eventIncomeItems.length === 0 && (
              <p className={noteCls}>
                {t('panel.noEventDataPre')}{' '}
                <Link to={`/${locale}/planner/event`} className="text-blue-500 hover:underline not-italic">
                  {t('panel.goToEventPlanner')}
                </Link>
                {t('panel.noEventDataPost')}
              </p>
            )}
            {eventIncomeItems.length > 0 && (
              <div className="space-y-2">
                <span className={sectionLabelCls}>{t('panel.eventIncome')}</span>
                <div className="space-y-0.5">
                  {eventIncomeItems.map((ev, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-xs">
                      <span className="flex-1 text-neutral-600 dark:text-neutral-300 truncate min-w-0" title={ev.name}>
                        {ev.name}
                      </span>
                      <span className="text-neutral-400 dark:text-neutral-500 shrink-0 font-mono">{ev.date || '—'}</span>
                      <span className="font-mono font-semibold text-neutral-700 dark:text-neutral-200 shrink-0">+{ev.amount}</span>
                    </div>
                  ))}
                  <div className="border-t border-neutral-100 dark:border-neutral-800 pt-1 flex justify-between text-xs text-neutral-400 dark:text-neutral-500">
                    <span>{t_ui('total')}</span>
                    <span className="font-mono font-semibold">{eventIncomeTotal}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Contextual notes */}
            {effectiveKey.startsWith('Item_') && Number(effectiveKey.slice(5)) >= 10000 && <p className={noteCls}>{t('panel.coinShopNote')}</p>}

            {/* Timeline chart — full-bleed (breaks out of px-4 via -mx-4) */}
            <div className="-mx-4">
              <ResourceTimelineChart
                label={getLabelForKey(effectiveKey)}
                data={timelines[effectiveKey]}
                weeklySpendLimit={ITEM_WEEKLY_LIMITS[effectiveKey]}
                annotations={annotations[effectiveKey]}
                planningLine={hasBand ? planningTimelines[effectiveKey] : undefined}
                planningLabel={hasBand ? planningLabel : undefined}
                resolveItemLabel={getLabelForKey}
              />
            </div>
          </div>
        )}
      </div>

      {/* Event log */}
      {groupedEventLog.length > 0 && (
        <div className="px-4 pb-3 pt-1 space-y-1.5 border-t border-neutral-100 dark:border-neutral-800">
          <ResourceEventLogList rows={groupedEventLog} resolveItemLabel={getLabelForKey} />
        </div>
      )}
    </>
  );
}
