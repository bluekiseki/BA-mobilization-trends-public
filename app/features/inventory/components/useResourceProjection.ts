// app/components/planner/resources/useResourceProjection.ts
//
// Owns the entire "raw config + schedule data -> ResourceEvent[] -> timelines"
// pipeline that drives the resource-projection chart. Extracted from
// Resources.tsx + the old ResourcePanel.tsx so both planner/resources and
// planner/inventory can render the same <ResourceTimelinePanel>.
//
// Pure derivation: the consumer passes every store slice and the build-time
// schedule tracks; the hook does no fetching and reads no stores itself.
import { useCallback, useMemo, useDeferredValue } from 'react';
import { useExpectedIncome } from '~/hooks/useExpectedIncome';
import type { IncomeByKey } from '~/utils/itemOutlook';
import { useTranslation } from 'react-i18next';
import {
  buildResourceTimelines,
  buildResourcePlanningTimelines,
  buildAnnotations,
  type ResourceEvent,
  type ResourceBandPoint,
  type TimelineAnnotation,
} from '~/features/inventory/logic/resourceTimeline';
import {
  eventsFromPurchaseEvents,
  eventsFromDailySources,
  eventsFromContentYields,
  eventsFromGachaItems,
  eventsFromExpectedIncome,
  eventsFromEventEleph,
  eventsFromHardStage,
  eventsFromPvpIncome,
  eventsFromJfdCoins,
  eventsFromRaidRewards,
  eventsFromExpertPermit,
  mergeResourceEvents,
  MULTIFLOOR_WB_KEYS,
} from '~/features/inventory/logic/resourceEventAdapters';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import { getItemTitle, type I18nLike } from '~/utils/scheduleDisplay';
import { getItemName } from '~/utils/locale';
import { calcElephNeeded, calcEligmaCostForEleph, type PercentileBand } from '~/utils/elephEligmaCalc';
import { asSimMetricAccumulator, type GlobalAggregatedResult, type DistributionData } from '~/utils/gachaEngine';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventPlan } from '~/types/eventPlan';
import type { Student } from '~/types/data';
import type { Locale } from '~/utils/i18n/config';
import type { CampaignData, IconInfo, IconInfos } from '~/types/plannerData';
import type { ResourcePlanData, StudentTargetGoal } from '~/types/resourcePlan';
import { splitItemKey } from '~/utils/itemType';
import { todayISODate } from '~/features/inventory/logic/plannerDate';
import type { StudentGoalStatus, TacticalCoinStatus } from './GoalStatusSummary';

// ── Constants (moved from Resources.tsx) ─────────────────────────────────────

export const HORIZON_OPTIONS = [{ days: 31 }, { days: 92 }, { days: 122 }, { days: 183 }, { days: 365 }] as const;

const COIN_KEYS = ['Item_7', 'Item_8', 'Item_9', 'Item_60', 'Item_70', 'Item_71'] as const;

// ── Types ───────────────────────────────────────────────────────────────────

/** One resource whose balance timeline is tracked/selectable. */
export interface TrackingItem {
  key: string;
  iconInfo?: IconInfo;
  label?: string;
}

/** Resource-plan-store fields the pipeline consumes (income/goal config). */
type ResourcePlanSlice = Pick<
  ResourcePlanData,
  | 'gachaEligmaPercentile'
  | 'gachaEligmaUseMean'
  | 'purchaseEvents'
  | 'dailySourceAmounts'
  | 'contentEventYields'
  | 'targetGoals'
  | 'stageFarmingPlans'
  | 'pvpAverageRank'
  | 'pvpDailyDefenseWins'
  | 'pvpExtraWeeklyIncome'
  | 'raidGlobalConfig'
  | 'eraidGlobalConfig'
  | 'raidDetailConfigs'
  | 'jfdDefaultDailyCoins'
  | 'jfdPerPeriodCoins'
  | 'multifloorDefaultMaxFloor'
  | 'multifloorMaxFloors'
  | 'expertPermitMode'
  | 'expertPermitWeeklyMax'
  | 'expertPermitDailyAmounts'
>;

export interface UseResourceProjectionOptions extends ResourcePlanSlice {
  /** Skip projection work while its detail UI is closed or its schedule is unavailable. */
  enabled?: boolean;
  /** Projection window start (YYYY-MM-DD). Defaults to today; pass a memoised value for stable identity. */
  startDate?: string;
  /** Projection horizon in days. */
  days: number;

  /** Currently selected server — picks which schedule tracks are live. */
  server: 'kr' | 'jp';
  krEvents: ScheduleItemV2[];
  jpEvents: ScheduleItemV2[];
  krRaid: ScheduleItemV2[];
  jpRaid: ScheduleItemV2[];
  krMultifloor: ScheduleItemV2[];
  jpMultifloor: ScheduleItemV2[];
  krCampaign: ScheduleItemV2[];
  jpCampaign: ScheduleItemV2[];
  krPickup: ScheduleItemV2[];
  jpPickup: ScheduleItemV2[];

  /** Client-fetched assets (consumer owns the fetch). */
  campaigns: { jp: CampaignData; kr: CampaignData } | null;
  /** Only `.Name` is read — widened key type so `Record<string, Student>` passes without a cast. */
  studentsRecord: Record<PropertyKey, Student>;
  itemIconInfo: IconInfos | null;

  /** Global-store slices. */
  growthPlans: GrowthPlan[];
  materialInventory: Record<string, number>;
  eventPlans: Record<string, Partial<EventPlan>>;
  gachaResult: GlobalAggregatedResult | null;

  /** Selected item key — drives student-eleph auto-tracking (Resources: selectedItemKey; Inventory: editingKey). */
  selectedItemKey: string | null;
  /** Extra keys pinned via the global search box (Resources only). */
  itemSearchExtraKeys?: Set<string>;

  locale: Locale;
}

export interface ResourceProjection {
  startDate: string;
  days: number;

  // Consumed by <ResourceTimelinePanel>
  trackingItems: TrackingItem[];
  allEvents: ResourceEvent[];
  timelines: Record<string, ResourceBandPoint[]>;
  annotations: Record<string, Record<string, TimelineAnnotation[]>>;
  planningTimelines: Record<string, ResourceBandPoint[]>;
  eventItemsByKey: Record<string, { name: string; date: string; amount: number }[]>;
  distEligma: DistributionData[];

  // Still referenced elsewhere in Resources.tsx
  eventScheduleMap: Record<number, { name: string; date: string }>;
  trackingStudentIds: number[];
  activePlans: Array<GrowthPlan & { studentId: number }>;
  growthSpendEvents: ResourceEvent[];
  extraCoinEvents: ResourceEvent[];

  /** Expected acquisitions per item, as consumed by the timeline. */
  expectedIncome: IncomeByKey;

  // Overview-tab derivations
  studentGoalStatuses: StudentGoalStatus[];
  tacticalCoinStatus: TacticalCoinStatus | undefined;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useResourceProjection(options: UseResourceProjectionOptions): ResourceProjection {
  const {
    enabled = true,
    days,
    server,
    krEvents,
    jpEvents,
    krRaid,
    jpRaid,
    krMultifloor,
    jpMultifloor,
    krCampaign,
    jpCampaign,
    campaigns,
    studentsRecord,
    itemIconInfo,
    growthPlans,
    materialInventory,
    eventPlans,
    gachaResult,
    selectedItemKey,
    itemSearchExtraKeys,
    locale,
    gachaEligmaPercentile,
    gachaEligmaUseMean,
    purchaseEvents,
    dailySourceAmounts,
    contentEventYields,
    targetGoals,
    stageFarmingPlans,
    pvpAverageRank,
    pvpDailyDefenseWins,
    pvpExtraWeeklyIncome,
    raidGlobalConfig,
    eraidGlobalConfig,
    raidDetailConfigs,
    jfdDefaultDailyCoins,
    jfdPerPeriodCoins,
    multifloorDefaultMaxFloor,
    multifloorMaxFloors,
    expertPermitMode,
    expertPermitWeeklyMax,
    expertPermitDailyAmounts,
  } = options;

  const deferredMaterialInventory = useDeferredValue(materialInventory);

  const { i18n } = useTranslation();
  const getScheduleTitle = useCallback((item: ScheduleItemV2) => getItemTitle(item, locale, i18n as I18nLike), [locale, i18n]);

  const fallbackStart = useMemo(() => todayISODate(), []);
  const startDate = options.startDate ?? fallbackStart;

  // ── Schedule selection ────────────────────────────────────────────────────
  const raidSchedule = useMemo(() => (server === 'kr' ? krRaid : jpRaid), [server, krRaid, jpRaid]);
  const mfSchedule = useMemo(() => (server === 'kr' ? krMultifloor : jpMultifloor), [server, krMultifloor, jpMultifloor]);
  const allScheduleItems = useMemo(() => [...raidSchedule, ...mfSchedule], [raidSchedule, mfSchedule]);

  const selectedStudentId = useMemo(() => {
    if (!selectedItemKey?.startsWith('Item_')) return null;
    const n = Number(selectedItemKey.slice(5));
    return n >= 10000 ? n : null;
  }, [selectedItemKey]);

  // ── Event schedule map ───────────────────────────────────────────────────
  const eventScheduleMap = useMemo(() => {
    if (!enabled) return {};
    const events = server === 'kr' ? krEvents : jpEvents;
    const map: Record<number, { name: string; date: string }> = {};
    for (const item of events) {
      const rawId = parseInt(item.id.replace('event-', ''));
      if (isNaN(rawId)) continue;
      map[rawId % 100000] = { name: getScheduleTitle(item), date: item.startTime.slice(0, 10) };
    }
    return map;
  }, [enabled, server, krEvents, jpEvents, getScheduleTitle]);

  const eventItemsByKey = useMemo((): Record<string, { name: string; date: string; amount: number }[]> => {
    if (!enabled) return {};
    const result: Record<string, { name: string; date: string; amount: number }[]> = {};
    for (const [idStr, plan] of Object.entries(eventPlans)) {
      const gained = plan.cachedTotalItems?.gained;
      if (!gained) continue;
      const schedInfo = eventScheduleMap[Number(idStr)];
      if (!schedInfo) continue;
      for (const [key, val] of Object.entries(gained)) {
        const amount = val.amount ?? 0;
        if (amount <= 0) continue;
        if (!result[key]) result[key] = [];
        result[key].push({ name: schedInfo.name, date: schedInfo.date, amount });
      }
    }
    for (const arr of Object.values(result)) arr.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }, [enabled, eventPlans, eventScheduleMap]);

  // ── Goal resolution ──────────────────────────────────────────────────────
  const resolvedGoalsByStudent = useMemo((): Record<number, Array<StudentTargetGoal & { resolvedDate: string | undefined }>> => {
    if (!enabled) return {};
    const result: Record<number, Array<StudentTargetGoal & { resolvedDate: string | undefined }>> = {};
    const resolveDate = (g: { date?: string; contentRef?: { id: string; timing?: 'start' | 'end' } }): string | null => {
      if (g.contentRef) {
        const sched = allScheduleItems.find((i) => i.id === g.contentRef?.id);
        if (!sched) return null;
        const useEnd = g.contentRef.timing === 'end';
        const isoStr = useEnd ? (sched.endTime ?? sched.startTime) : sched.startTime;
        return isoStr.slice(0, 10);
      }
      return g.date ?? null;
    };
    for (const [idStr, goals] of Object.entries(targetGoals)) {
      const resolved = goals.flatMap((g) => {
        const date = resolveDate(g);
        if (date !== null && date <= startDate) return []; // dated goal in the past
        return [{ ...g, resolvedDate: date ?? undefined }];
      });
      if (resolved.length > 0) result[Number(idStr)] = resolved;
    }
    for (const id of Object.keys(result)) {
      result[Number(id)].sort((a, b) => {
        if (!a.resolvedDate && !b.resolvedDate) return 0;
        if (!a.resolvedDate) return 1;
        if (!b.resolvedDate) return -1;
        return a.resolvedDate.localeCompare(b.resolvedDate);
      });
    }
    return result;
  }, [enabled, targetGoals, allScheduleItems, startDate]);

  const activePlans = useMemo(
    () =>
      (enabled ? growthPlans : []).filter((p): p is GrowthPlan & { studentId: number } => {
        if (!p.studentId) return false;
        const goals = resolvedGoalsByStudent[p.studentId] ?? [];
        return goals.some((g) => calcElephNeeded(p.current.star, g.targetStar, p.current.uw, g.targetUw) > 0);
      }),
    [enabled, growthPlans, resolvedGoalsByStudent],
  );

  const trackingStudentIds = useMemo(() => {
    if (!enabled) return [];
    const isStudentKey = (k: string) => k.startsWith('Item_') && Number(k.slice(5)) >= 10000;
    const ids = new Set(activePlans.map((p) => p.studentId));
    if (selectedStudentId !== null) ids.add(selectedStudentId);
    for (const k of Object.keys(deferredMaterialInventory)) if (isStudentKey(k) && (deferredMaterialInventory[k] ?? 0) > 0) ids.add(Number(k.slice(5)));
    for (const k of itemSearchExtraKeys ?? []) if (isStudentKey(k)) ids.add(Number(k.slice(5)));
    if (selectedItemKey && isStudentKey(selectedItemKey)) ids.add(Number(selectedItemKey.slice(5)));
    return [...ids];
  }, [enabled, activePlans, selectedStudentId, deferredMaterialInventory, itemSearchExtraKeys, selectedItemKey]);

  // ── Growth plan deductions ───────────────────────────────────────────────
  const growthPlanDeductions = useMemo((): {
    elephEventsByStudent: Record<number, Array<{ date: string; spend: number }>>;
    eligmaByDate: Record<string, PercentileBand>;
    studentGoalSummaries: Array<Omit<StudentGoalStatus, 'eligmaBalanceAfter' | 'status'>>;
  } => {
    const elephEventsByStudent: Record<number, Array<{ date: string; spend: number }>> = {};
    const eligmaByDate: Record<string, PercentileBand> = {};
    const studentGoalSummaries: Array<Omit<StudentGoalStatus, 'eligmaBalanceAfter' | 'status'>> = [];
    if (!enabled) return { elephEventsByStudent, eligmaByDate, studentGoalSummaries };

    // Each income source below is queried once for ALL active-plan students (grouped by itemKey)
    // instead of once per plan — `eventsFromGachaItems` in particular scans every simulated
    // banner internally, so calling it per-plan made this whole memo O(activePlans * banners).
    const groupByItemKey = (events: ResourceEvent[]): Map<string, ResourceEvent[]> => {
      const map = new Map<string, ResourceEvent[]>();
      for (const ev of events) {
        const arr = map.get(ev.itemKey);
        if (arr) arr.push(ev);
        else map.set(ev.itemKey, [ev]);
      }
      return map;
    };
    const allTrackedStudentIds = activePlans.map((p) => p.studentId);
    const purchaseEventsByItemKey = groupByItemKey(
      purchaseEvents
        .filter((e): e is typeof e & { gainItemKey: string } => !!e.gainItemKey && (e.gainAmount ?? 0) > 0 && e.date >= startDate)
        .map((e): ResourceEvent => ({ itemKey: e.gainItemKey, delta: e.gainAmount ?? 0, date: e.date, source: 'purchase' })),
    );
    const gachaEventsByItemKey = groupByItemKey(eventsFromGachaItems(gachaResult, startDate, allTrackedStudentIds, { includeEligma: false }));
    const eventElephByItemKey =
      Object.keys(eventScheduleMap).length > 0 ? groupByItemKey(eventsFromEventEleph(eventPlans, eventScheduleMap, allTrackedStudentIds)) : new Map<string, ResourceEvent[]>();

    for (const plan of activePlans) {
      const studentId = plan.studentId;
      const goals = resolvedGoalsByStudent[studentId] ?? [];
      if (goals.length === 0) continue;
      const studentElephKey = `Item_${studentId}`;
      const currEleph = deferredMaterialInventory[studentElephKey] ?? plan.current.eleph ?? 0;
      const alreadyBought = Math.max(0, (plan.eligmaInfo.price - 1) * 20 + (20 - plan.eligmaInfo.stock));

      const elephIncomeEvents: ResourceEvent[] = [
        ...(purchaseEventsByItemKey.get(studentElephKey) ?? []),
        ...(gachaEventsByItemKey.get(studentElephKey) ?? []),
        ...(eventElephByItemKey.get(studentElephKey) ?? []),
      ];

      let cumulativeSpend = 0;
      let prevStar = plan.current.star;
      let prevUw = plan.current.uw;

      // Every goal for this student shares the same starting balance and income events —
      // only `daysToGoal` differs — so build the eleph balance timeline once, up to the
      // furthest goal, instead of re-simulating from day 0 for every goal.
      const maxDaysToGoal = goals.reduce((max, g) => {
        if (!g.resolvedDate) return max;
        const days = Math.ceil((new Date(g.resolvedDate).getTime() - new Date(startDate).getTime()) / 86400000);
        return Math.max(max, days);
      }, 0);
      const fullTimeline =
        maxDaysToGoal > 0 ? (buildResourceTimelines(startDate, maxDaysToGoal + 1, { [studentElephKey]: currEleph }, elephIncomeEvents, new Set([studentElephKey]))[studentElephKey] ?? []) : [];

      for (const goal of goals) {
        const elephNeeded = calcElephNeeded(prevStar, goal.targetStar, prevUw, goal.targetUw);
        prevStar = goal.targetStar;
        prevUw = goal.targetUw;
        if (elephNeeded <= 0) continue;

        if (!goal.resolvedDate) {
          studentGoalSummaries.push({
            studentId,
            studentName: studentsRecord[studentId]?.Name ?? `#${studentId}`,
            date: undefined,
            targetStar: goal.targetStar,
            targetUw: goal.targetUw,
            requiredEleph: elephNeeded,
            naturalEleph: 0,
            elephShortfall: elephNeeded,
            eligmaCost: calcEligmaCostForEleph(elephNeeded, alreadyBought),
          });
          continue;
        }

        const daysToGoal = Math.ceil((new Date(goal.resolvedDate).getTime() - new Date(startDate).getTime()) / 86400000);
        if (daysToGoal <= 0) continue;

        const atGoal = fullTimeline[daysToGoal];
        if (!atGoal) continue;

        const elephSpend = Math.min(elephNeeded, Math.max(0, atGoal.p50 - cumulativeSpend));
        const elephShortfall = Math.max(0, elephNeeded - elephSpend);
        const eligmaCost = calcEligmaCostForEleph(elephShortfall, alreadyBought);
        if (!elephEventsByStudent[studentId]) elephEventsByStudent[studentId] = [];
        elephEventsByStudent[studentId].push({ date: goal.resolvedDate, spend: elephSpend });
        studentGoalSummaries.push({
          studentId,
          studentName: studentsRecord[studentId]?.Name ?? `#${studentId}`,
          date: goal.resolvedDate,
          targetStar: goal.targetStar,
          targetUw: goal.targetUw,
          requiredEleph: elephNeeded,
          naturalEleph: elephSpend,
          elephShortfall,
          eligmaCost,
        });
        cumulativeSpend += elephSpend;

        const existing = eligmaByDate[goal.resolvedDate] ?? { p10: 0, p50: 0, p90: 0 };
        existing.p10 -= calcEligmaCostForEleph(Math.max(0, elephNeeded - Math.max(0, atGoal.p10 - cumulativeSpend + elephSpend)), alreadyBought);
        existing.p50 -= calcEligmaCostForEleph(Math.max(0, elephNeeded - Math.max(0, atGoal.p50 - cumulativeSpend + elephSpend)), alreadyBought);
        existing.p90 -= calcEligmaCostForEleph(Math.max(0, elephNeeded - Math.max(0, atGoal.p90 - cumulativeSpend + elephSpend)), alreadyBought);
        eligmaByDate[goal.resolvedDate] = existing;
      }
    }
    return { elephEventsByStudent, eligmaByDate, studentGoalSummaries };
  }, [enabled, activePlans, resolvedGoalsByStudent, deferredMaterialInventory, purchaseEvents, gachaResult, eventPlans, eventScheduleMap, startDate, studentsRecord]);

  const growthSpendEvents = useMemo((): ResourceEvent[] => {
    if (!enabled) return [];
    const events: ResourceEvent[] = [];
    const byDate: Record<string, string[]> = {};
    for (const { date, eligmaCost, studentName } of growthPlanDeductions.studentGoalSummaries) if (date && eligmaCost > 0) (byDate[date] ??= []).push(studentName);
    const eligmaName = getItemName('Item_23', itemIconInfo, locale);
    for (const [date, band] of Object.entries(growthPlanDeductions.eligmaByDate)) {
      const studentNames = byDate[date];
      if (studentNames?.length) {
        events.push({
          itemKey: 'Item_23',
          band,
          date,
          source: 'growth_spend',
          labelKey: 'resources:eventLabels.growthSpendStudent',
          labelParams: { students: studentNames.join(', '), item: eligmaName },
        });
      } else {
        events.push({ itemKey: 'Item_23', band, date, source: 'growth_spend', labelKey: 'resources:eventLabels.growthSpendDefault' });
      }
    }
    for (const [idStr, goalEvents] of Object.entries(growthPlanDeductions.elephEventsByStudent)) {
      const elephName = getItemName(`Item_${idStr}`, itemIconInfo, locale);
      for (const { date, spend } of goalEvents)
        if (spend > 0) events.push({ itemKey: `Item_${idStr}`, delta: -spend, date, source: 'growth_spend', labelKey: 'resources:eventLabels.growthSpendEleph', labelParams: { item: elephName } });
    }
    if (campaigns && Object.keys(stageFarmingPlans).length > 0) events.push(...eventsFromHardStage(stageFarmingPlans, campaigns, startDate, { kr: krCampaign, jp: jpCampaign }));
    return events;
  }, [enabled, growthPlanDeductions, startDate, stageFarmingPlans, campaigns, itemIconInfo, locale, krCampaign, jpCampaign]);

  const extraCoinEvents = useMemo(
    (): ResourceEvent[] =>
      enabled
        ? mergeResourceEvents(
            eventsFromPvpIncome(pvpAverageRank, pvpDailyDefenseWins, pvpExtraWeeklyIncome, startDate, days),
            eventsFromJfdCoins(
              raidSchedule.filter((i) => i.id.startsWith('jfd-')),
              jfdDefaultDailyCoins,
              jfdPerPeriodCoins,
              startDate,
            ),
            eventsFromRaidRewards(raidSchedule, raidGlobalConfig, eraidGlobalConfig, raidDetailConfigs, startDate, getScheduleTitle),
            eventsFromExpertPermit(expertPermitMode, expertPermitWeeklyMax, expertPermitDailyAmounts, startDate, days),
          )
        : [],
    [
      enabled,
      pvpAverageRank,
      pvpDailyDefenseWins,
      pvpExtraWeeklyIncome,
      jfdDefaultDailyCoins,
      jfdPerPeriodCoins,
      raidSchedule,
      raidGlobalConfig,
      eraidGlobalConfig,
      raidDetailConfigs,
      expertPermitMode,
      expertPermitWeeklyMax,
      expertPermitDailyAmounts,
      mfSchedule,
      multifloorDefaultMaxFloor,
      multifloorMaxFloors,
      days,
      startDate,
      getScheduleTitle,
    ],
  );

  // ── Expected income (event plans + assumed shop/raid/multifloor rewards) ──
  // Items an adapter above already models are skipped so the same reward is not counted twice.
  const modeledItemKeys = useMemo(() => new Set(extraCoinEvents.map((event) => event.itemKey)), [extraCoinEvents]);
  const expectedIncome = useExpectedIncome({
    server,
    events: server === 'kr' ? krEvents : jpEvents,
    raidItems: raidSchedule,
    multifloorItems: mfSchedule,
    today: startDate,
    getTitle: getScheduleTitle,
    skipKeys: modeledItemKeys,
  });
  const expectedIncomeEvents = useMemo(() => eventsFromExpectedIncome(expectedIncome), [expectedIncome]);

  // ── Tracking items ───────────────────────────────────────────────────────
  const trackingItems = useMemo(
    (): TrackingItem[] =>
      !enabled
        ? []
        : [
            { key: 'Item_23', iconInfo: itemIconInfo?.Item['23'] },
            ...trackingStudentIds.map((id) => ({ key: `Item_${id}`, iconInfo: itemIconInfo?.Item[String(id)] })),
            { key: 'Item_8', iconInfo: itemIconInfo?.Item['8'] },
            ...(purchaseEvents.some((e) => e.gainItemKey === 'Currency_5') ? [{ key: 'Currency_5', iconInfo: itemIconInfo?.Currency['5'] }] : []),
            ...COIN_KEYS.filter((k) => (deferredMaterialInventory[k] ?? 0) > 0).map((k) => ({ key: k, iconInfo: itemIconInfo?.Item[splitItemKey(k)?.[1] ?? ''] })),
            ...MULTIFLOOR_WB_KEYS.filter((k) => (deferredMaterialInventory[k] ?? 0) > 0 || Object.keys(multifloorMaxFloors).length > 0).map((k) => ({
              key: k,
              iconInfo: itemIconInfo?.Item[splitItemKey(k)?.[1] ?? ''],
            })),
          ],
    [enabled, trackingStudentIds, deferredMaterialInventory, itemIconInfo, multifloorMaxFloors, purchaseEvents],
  );

  // ── Event merge + timelines ──────────────────────────────────────────────
  const timelineKeys = useMemo(() => {
    if (!enabled) return new Set<string>();
    const keys = new Set(itemSearchExtraKeys ?? []);
    if (selectedItemKey && (trackingItems.some((item) => item.key === selectedItemKey) || expectedIncome[selectedItemKey]?.length)) keys.add(selectedItemKey);
    return keys;
  }, [enabled, selectedItemKey, itemSearchExtraKeys, trackingItems, expectedIncome]);

  const allEvents = useMemo(
    () =>
      timelineKeys.size === 0
        ? []
        : mergeResourceEvents(
            eventsFromPurchaseEvents(purchaseEvents, startDate),
            eventsFromDailySources(dailySourceAmounts, startDate, days),
            eventsFromContentYields(contentEventYields, allScheduleItems, startDate, getScheduleTitle),
            growthSpendEvents,
            extraCoinEvents,
            eventsFromGachaItems(gachaResult, startDate, trackingStudentIds),
            expectedIncomeEvents,
          ),
    [
      purchaseEvents,
      startDate,
      dailySourceAmounts,
      days,
      contentEventYields,
      allScheduleItems,
      getScheduleTitle,
      growthSpendEvents,
      extraCoinEvents,
      gachaResult,
      trackingStudentIds,
      expectedIncomeEvents,
      timelineKeys,
    ],
  );

  const timelineEvents = useMemo(() => allEvents.filter((event) => timelineKeys.has(event.itemKey)), [allEvents, timelineKeys]);
  const timelineInventory = useMemo(() => {
    const inventory: Record<string, number> = {};
    for (const key of timelineKeys) inventory[key] = deferredMaterialInventory[key] ?? 0;
    return inventory;
  }, [deferredMaterialInventory, timelineKeys]);

  const { timelines, annotations } = useMemo(
    () => ({
      timelines: timelineKeys.size > 0 ? buildResourceTimelines(startDate, days, timelineInventory, timelineEvents, timelineKeys) : {},
      annotations: buildAnnotations(timelineEvents),
    }),
    [startDate, days, timelineInventory, timelineEvents, timelineKeys],
  );

  const planningTimelines = useMemo(
    () =>
      timelineKeys.size > 0
        ? buildResourcePlanningTimelines(
            startDate,
            days,
            timelineInventory,
            timelineEvents,
            gachaEligmaUseMean ? { type: 'mean' } : { type: 'percentile', percentile: gachaEligmaPercentile },
            timelineKeys,
          )
        : {},
    [startDate, days, timelineInventory, timelineEvents, gachaEligmaPercentile, gachaEligmaUseMean, timelineKeys],
  );

  const distEligma = useMemo(() => (enabled && gachaResult ? asSimMetricAccumulator(gachaResult.eligmaCumulative).dist('inf') : []), [enabled, gachaResult]);

  // ── Overview-tab derivations ─────────────────────────────────────────────
  // Kept computing exactly as they did in Resources.tsx (their own tiny merges)
  // so the overview tab stays byte-for-byte identical after the extraction.
  const eligmaTimeline = useMemo(() => {
    if (!enabled) return [];
    // Only `studentGoalStatuses` below reads this, and only for goals with a resolved deadline —
    // building the full eligma balance timeline (a real convolution over every gacha/income event
    // in the horizon) is one of the most expensive things this hook does, so skip it entirely
    // when there's nothing to check it against (e.g. no active growth-plan goals at all).
    if (!growthPlanDeductions.studentGoalSummaries.some((s) => s.date)) return [];
    const events = mergeResourceEvents(
      eventsFromPurchaseEvents(purchaseEvents, startDate),
      eventsFromDailySources(dailySourceAmounts, startDate, days),
      eventsFromContentYields(contentEventYields, allScheduleItems, startDate, getScheduleTitle),
      growthSpendEvents,
      extraCoinEvents,
      eventsFromGachaItems(gachaResult, startDate, [], { includeEligma: true }),
      expectedIncomeEvents,
    );
    return (
      buildResourceTimelines(
        startDate,
        days,
        { Item_23: deferredMaterialInventory.Item_23 ?? 0 },
        events.filter((event) => event.itemKey === 'Item_23'),
        new Set(['Item_23']),
      ).Item_23 ?? []
    );
  }, [
    enabled,
    growthPlanDeductions.studentGoalSummaries,
    purchaseEvents,
    startDate,
    dailySourceAmounts,
    days,
    contentEventYields,
    allScheduleItems,
    growthSpendEvents,
    extraCoinEvents,
    gachaResult,
    expectedIncomeEvents,
    deferredMaterialInventory,
    getScheduleTitle,
  ]);

  const studentGoalStatuses = useMemo((): StudentGoalStatus[] => {
    const pointByDate = new Map(eligmaTimeline.map((point) => [point.date, point.p50]));
    return growthPlanDeductions.studentGoalSummaries
      .map((summary) => {
        if (!summary.date) return { ...summary, status: 'no_deadline' as const };
        const eligmaBalanceAfter = pointByDate.get(summary.date);
        const status: StudentGoalStatus['status'] = summary.elephShortfall <= 0 ? 'on_track' : eligmaBalanceAfter !== undefined && eligmaBalanceAfter < 0 ? 'at_risk' : 'covered_by_eligma';
        return { ...summary, eligmaBalanceAfter, status };
      })
      .sort((a, b) => {
        const statusOrder: Record<StudentGoalStatus['status'], number> = { at_risk: 0, covered_by_eligma: 1, on_track: 2, no_deadline: 3 };
        return statusOrder[a.status] - statusOrder[b.status] || (a.date ?? '').localeCompare(b.date ?? '') || a.studentName.localeCompare(b.studentName);
      });
  }, [growthPlanDeductions.studentGoalSummaries, eligmaTimeline]);

  const tacticalCoinStatus = useMemo((): TacticalCoinStatus | undefined => {
    if (!enabled) return undefined;
    const apPurchaseEvents = purchaseEvents.filter((event) => event.spendItemKey === 'Item_8' && event.gainItemKey === 'Currency_5' && (event.gainAmount ?? 0) > 0);
    if (apPurchaseEvents.length === 0) return undefined;

    const events = mergeResourceEvents(eventsFromPurchaseEvents(purchaseEvents, startDate), eventsFromDailySources(dailySourceAmounts, startDate, days), extraCoinEvents);
    const timeline =
      buildResourceTimelines(
        startDate,
        days,
        { Item_8: deferredMaterialInventory.Item_8 ?? 0 },
        events.filter((event) => event.itemKey === 'Item_8'),
        new Set(['Item_8']),
      ).Item_8 ?? [];
    const firstShortage = timeline.find((point) => point.p50 < 0);
    const lowestBalance = timeline.reduce((lowest, point) => Math.min(lowest, point.p50), timeline[0]?.p50 ?? 0);
    const purchaseDays = new Set(apPurchaseEvents.map((event) => event.date)).size;
    const totalApGain = apPurchaseEvents.reduce((sum, event) => sum + (event.gainAmount ?? 0), 0);

    return {
      firstShortageDate: firstShortage?.date,
      lowestBalance,
      totalApGain,
      purchaseDays,
    };
  }, [enabled, purchaseEvents, startDate, dailySourceAmounts, days, extraCoinEvents, deferredMaterialInventory]);

  return {
    startDate,
    days,
    trackingItems,
    allEvents,
    timelines,
    annotations,
    planningTimelines,
    eventItemsByKey,
    distEligma,
    eventScheduleMap,
    trackingStudentIds,
    activePlans,
    growthSpendEvents,
    extraCoinEvents,
    expectedIncome,
    studentGoalStatuses,
    tacticalCoinStatus,
  };
}
