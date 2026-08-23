// app/routes/planner/Resources.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLoaderData, data, type LoaderFunctionArgs } from 'react-router';
import { getInstance } from '~/middleware/i18next';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import type { Route } from './+types/Resources';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { loadScheduleDataV2, type ScheduleItemV2 } from '~/utils/calender.data.v2';
import { getItemLabel, getItemTitle, type I18nLike } from '~/utils/scheduleDisplay';
import { cdn } from '~/utils/cdn';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import { useEventPlanStore } from '~/store/planner/useEventPlanStore';
import { useGachaResultStore } from '~/store/planner/useGachaResultStore';
import { useResourcePlanStore } from '~/store/planner/useResourcePlanStore';
import type { StudentTargetGoal } from '~/types/resourcePlan';
import type { Student } from '~/types/data';
import ResourcePanel from '~/components/planner/resources/ResourcePanel';
import type { TrackingItem } from '~/components/planner/resources/ResourcePanel';
import type { PurchasePanelEntry } from '~/components/planner/resources/ItemPurchasePanel';
import { TrackedItemsBar } from '~/components/planner/resources/TrackedItemsBar';
import { ItemIncomeSection } from '~/components/planner/resources/ItemIncomeSection';
import { StudentGoalsTab } from '~/components/planner/resources/StudentGoalsTab';
import { ScheduleSection } from '~/components/planner/resources/ScheduleSection';
import { GoalStatusSummary, type StudentGoalStatus, type TacticalCoinStatus } from '~/components/planner/resources/GoalStatusSummary';
import { useCalendarSources } from '~/components/planner/resources/useCalendarSources';
import { calcElephNeeded, calcEligmaCostForEleph, type PercentileBand } from '~/utils/elephEligmaCalc';
import { buildResourceTimelines } from '~/utils/resourceTimeline';
import type { ResourceEvent } from '~/utils/resourceTimeline';
import {
  eventsFromPurchaseEvents,
  eventsFromDailySources,
  eventsFromContentYields,
  eventsFromGachaItems,
  eventsFromEventEligma,
  eventsFromEventEleph,
  eventsFromHardStage,
  eventsFromPvpIncome,
  eventsFromJfdCoins,
  eventsFromRaidRewards,
  eventsFromExpertPermit,
  eventsFromMultifloorWBs,
  mergeResourceEvents,
  MULTIFLOOR_WB_KEYS,
} from '~/utils/resourceEventAdapters';
import {
  EXPERT_PERMIT_SHOP_EXCLUDED_IDS,
  EXPERT_PERMIT_ELEPH_COST,
  EXPERT_PERMIT_ELIGMA,
  COIN_SHOP_BY_COIN_KEY,
  COIN_SHOP_DEFS,
  GAIN_ITEM_TO_COIN_KEY,
  type ExpertPermitStudentType,
} from '~/data/elephSources';
import type { CampaignData, CampaignStage, ContentItem, IconInfos } from '~/types/plannerData';
import { ItemIcon } from '~/components/planner/common/Icon';
import { PageHeader } from '~/components/common/PageHeader';
import { getItemName } from '~/components/planner/common/locale';
import { getShopItemType, splitItemKey, type ItemType } from '~/utils/itemType';
import { normalizeBluprintToEquipment } from '~/utils/blueprintUtils';
import type { ScheduleBarItem } from '~/components/planner/shared/UnifiedPlanCalendar';
import { GAME_DAY_OFFSET_MS } from '~/components/planner/shared/UnifiedPlanCalendar';

// ─── Re-export for consumers ──────────────────────────────────────────────────
export type { ContentItem };

// ─── Constants ────────────────────────────────────────────────────────────────

const HORIZON_OPTIONS = [{ days: 31 }, { days: 92 }, { days: 122 }, { days: 183 }, { days: 365 }] as const;

const COIN_KEYS = ['Item_7', 'Item_8', 'Item_9', 'Item_60', 'Item_70', 'Item_71'] as const;

const FILTER_TYPE_META: Partial<Record<ItemType, string>> = {
  SecretStone: 'item.eleph',
  TacticalBD: 'label.tacticalBD',
  TechNote: 'label.techNote',
  AP: 'common.ap',
  Credit: 'label.credits',
  ExpGrowth: 'common.normalReport',
};

type TabId = 'overview' | 'resources' | 'income' | 'students';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStarValue(star: number, uw: number): number {
  return uw > 0 ? 5 + uw : star;
}

function isElephGoalReached(plan: GrowthPlan, studentId: number, targetGoals: Record<number, StudentTargetGoal[]>, materialInventory: Record<string, number>): boolean {
  const finalGoal = targetGoals[studentId]?.find((g) => g.id === 'final');
  const configuredGoals = targetGoals[studentId] ?? [];
  const target = configuredGoals.reduce((best, goal) => (toStarValue(goal.targetStar, goal.targetUw) > toStarValue(best.star, best.uw) ? { star: goal.targetStar, uw: goal.targetUw } : best), {
    star: finalGoal?.targetStar ?? plan.target.star,
    uw: finalGoal?.targetUw ?? plan.target.uw,
  });
  const requiredEleph = calcElephNeeded(plan.current.star, target.star, plan.current.uw, target.uw);
  const currentEleph = materialInventory[`Item_${studentId}`] ?? plan.current.eleph ?? 0;
  return requiredEleph <= currentEleph;
}

function todayISODate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function expertPermitShopAvailableYearMonth(firstPickup: string, type: ExpertPermitStudentType): string {
  const d = new Date(firstPickup + 'T00:00:00Z');
  if (type === 'pass_limited') {
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
  } else {
    d.setUTCFullYear(d.getUTCFullYear() + 1, d.getUTCMonth(), 1);
  }
  return d.toISOString().slice(0, 7);
}

function buildExpertPermitEntries(
  studentsRecord: Record<number, Student>,
  growthPlans: GrowthPlan[],
  itemIconInfo: IconInfos | null,
  locale: Locale,
  targetGoals: Record<number, StudentTargetGoal[]>,
  materialInventory: Record<string, number>,
): PurchasePanelEntry[] {
  const entries: PurchasePanelEntry[] = [];
  entries.push({
    gainItemKey: 'Item_23',
    label: getItemName('Item_23', itemIconInfo, locale),
    shopItem: {
      gainItemKey: 'Item_23',
      gainAmount: 5,
      costPerBundle: EXPERT_PERMIT_ELIGMA.expertPermitPer5,
      monthlyLimit: EXPERT_PERMIT_ELIGMA.monthlyMax,
    },
    coinKey: 'Currency_18',
    sourceType: 'expert_permit_exchange',
    isAtMax: false,
  });
  for (const [idStr, meta] of Object.entries(studentsRecord)) {
    const studentId = Number(idStr);
    if (EXPERT_PERMIT_SHOP_EXCLUDED_IDS.has(studentId)) continue;
    const il = meta?.IsLimited?.[1];
    if (il !== 1 && il !== 2 && il !== 3) continue;
    const expertPermitType: ExpertPermitStudentType = il === 3 ? 'pass_limited' : il === 1 ? 'limited' : 'distributed';
    const permitInfo = EXPERT_PERMIT_ELEPH_COST[expertPermitType];
    if (!permitInfo) continue;
    const plan = growthPlans.find((p) => p.studentId === studentId);
    const isAtMax = plan != null && isElephGoalReached(plan, studentId, targetGoals, materialInventory);
    const gainItemKey = `Item_${studentId}`;
    entries.push({
      gainItemKey,
      label: getItemName(gainItemKey, itemIconInfo, locale),
      shopItem: {
        gainItemKey,
        gainAmount: 5,
        costPerBundle: permitInfo.expertPermitPer5Eleph,
        monthlyLimit: permitInfo.monthlyMaxPurchases,
      },
      coinKey: 'Currency_18',
      sourceType: 'expert_permit_shop',
      isAtMax,
    });
  }
  return entries;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  const krData = loadScheduleDataV2({ server: 'kr', tracksToLoad: ['event', 'raid', 'multifloor', 'campaign', 'pickup'] });
  const jpData = loadScheduleDataV2({ server: 'jp', tracksToLoad: ['event', 'raid', 'multifloor', 'campaign', 'pickup'] });
  return data({
    locale,
    krEvents: krData.tracks.event,
    jpEvents: jpData.tracks.event,
    krRaid: krData.tracks.raid,
    jpRaid: jpData.tracks.raid,
    krMultifloor: krData.tracks.multifloor,
    jpMultifloor: jpData.tracks.multifloor,
    krCampaign: krData.tracks.campaign,
    jpCampaign: jpData.tracks.campaign,
    krPickup: krData.tracks.pickup,
    jpPickup: jpData.tracks.pickup,
    siteTitle: i18n.t('common:title'),
    title: i18n.t('resources:header.title'),
    description: i18n.t('resources:header.description'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/p.webp');
}

export function links() {
  return [...createLinkHreflang('/planner/resources')];
}

export function headers({}: Route.HeadersArgs) {
  if (process.env.NODE_ENV === 'production') return { 'Cache-Control': CACHE_CONTROL_CONFIG };
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function ResourcePlanner() {
  const { locale, krEvents, jpEvents, krRaid, jpRaid, krMultifloor, jpMultifloor, krCampaign, jpCampaign, krPickup, jpPickup } = useLoaderData<typeof loader>();
  const { t } = useTranslation('resources');
  const { t: t_ui } = useTranslation('ui');
  const { i18n } = useTranslation();
  const { t: t_planner } = useTranslation('planner');
  useTranslation('calendar');

  const tabs = useMemo(
    () =>
      [
        { id: 'overview', label: t_ui('overview'), shortLabel: t_ui('overview') },
        { id: 'resources', label: t('tabs.resources'), shortLabel: t('tabs.resources') },
        { id: 'income', label: t('tabs.income'), shortLabel: t_ui('settings') },
        { id: 'students', label: t('tabs.students'), shortLabel: t('tabs.studentsShort') },
      ] as const satisfies Array<{ id: TabId; label: string; shortLabel: string }>,
    [t],
  );

  const horizonLabels = useMemo(
    () => ({
      31: t('horizon.oneMonth'),
      92: t('horizon.threeMonths'),
      122: t('horizon.fourMonths'),
      183: t('horizon.sixMonths'),
      365: t('horizon.oneYear'),
    }),
    [t],
  );

  // ── Global stores ─────────────────────────────────────────────────────────
  const { growthPlans, materialInventory, updateMaterialInventory } = useGlobalStore();
  const { plans: eventPlans } = useEventPlanStore();
  const { result: gachaResult } = useGachaResultStore();
  const {
    server,
    setServer,
    gachaEligmaPercentile,
    gachaEligmaUseMean,
    purchaseEvents,
    dailySourceAmounts,
    contentEventYields,
    targetGoals,
    setGachaEligmaPercentile,
    setGachaEligmaUseMean,
    addTargetGoal,
    updateTargetGoal,
    removeTargetGoal,
    stageFarmingPlans,
    removeStageFarmingPlan,
    setStageFarmingRunsRange,
    pvpAverageRank,
    pvpDailyDefenseWins,
    pvpExtraWeeklyIncome,
    raidGlobalConfig,
    eraidGlobalConfig,
    raidDetailConfigs,
    setRaidDetailConfig,
    jfdDefaultDailyCoins,
    jfdPerPeriodCoins,
    multifloorDefaultMaxFloor,
    multifloorMaxFloors,
    expertPermitMode,
    expertPermitWeeklyMax,
    expertPermitDailyAmounts,
    update: updatePlanStore,
  } = useResourcePlanStore();

  // ── Local UI state ────────────────────────────────────────────────────────
  const [studentsRecord, setStudentsRecord] = useState<Record<number, Student>>({});
  const [itemSearchExtraKeys, setItemSearchExtraKeys] = useState<Set<string>>(new Set());
  const [planDays, setPlanDays] = useState(183);
  const [campaigns, setCampaigns] = useState<{ jp: CampaignData; kr: CampaignData } | null>(null);
  const [selectedCalendarKey, setSelectedCalendarKey] = useState('');
  const [selectedPurchaseDate, setSelectedPurchaseDate] = useState<string | null>(null);
  const [selectedRangeMin, setSelectedRangeMin] = useState<string | null>(null);
  const [selectedRangeMax, setSelectedRangeMax] = useState<string | null>(null);
  const [showPurchasePanel, setShowPurchasePanel] = useState(true);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [scheduleFilters, setScheduleFilters] = useState({
    event: true,
    raid: true,
    multifloor: true,
    campaign: true,
  });
  const [inlinePanelHiddenTypes, setInlinePanelHiddenTypes] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [itemIconImg, setItemIconImg] = useState<Record<string, Record<string, string>> | null>(null);
  const [itemIconInfo, setItemIconInfo] = useState<IconInfos | null>(null);

  const startDate = useMemo(() => todayISODate(), []);

  const selectedStudentId = useMemo(() => {
    if (!selectedItemKey?.startsWith('Item_')) return null;
    const n = Number(selectedItemKey.slice(5));
    return n >= 10000 ? n : null;
  }, [selectedItemKey]);

  // ── Data fetching ─────────────────────────────────────────────────────────
  useEffect(() => {
    const shortLocale = getLocaleShortName(locale);
    Promise.all([
      fetch(cdn(`/schaledb.com/${shortLocale}.students.min.json`)).then((r): Promise<Student[] | Record<string, Student>> => r.json()),
      fetch(cdn('/w/students_portrait.json')).then((r): Promise<Record<number, string>> => r.json()),
    ])
      .then(([rawStudents, portraits]) => {
        const arr = Array.isArray(rawStudents) ? rawStudents : Object.values(rawStudents);
        const rec: Record<number, Student> = {};
        for (const s of arr) rec[s.Id] = { ...s, Portrait: portraits[s.Id] ?? s.Portrait };
        setStudentsRecord(rec);
      })
      .catch(console.error);
  }, [locale]);

  useEffect(() => {
    Promise.all([fetch(cdn('/w/jp/campaigns.json')).then((r): Promise<CampaignData> => r.json()), fetch(cdn('/w/kr/campaigns.json')).then((r): Promise<CampaignData> => r.json())])
      .then(([jp, kr]) => setCampaigns({ jp, kr }))
      .catch(console.error);
  }, []);

  useEffect(() => {
    Promise.all([fetch(cdn('/ew/icon_img.json')).then((r): Promise<Record<string, Record<string, string>>> => r.json()), fetch(cdn('/ew/icon_info.json')).then((r): Promise<IconInfos> => r.json())])
      .then(([img, info]) => {
        setItemIconImg(img);
        setItemIconInfo(info);
      })
      .catch(console.error);
  }, []);

  // ── Side effects ──────────────────────────────────────────────────────────
  useEffect(() => {
    setInlinePanelHiddenTypes(new Set());
  }, [selectedItemKey]);
  useEffect(() => {
    setShowPurchasePanel(true);
  }, [selectedRangeMin, selectedRangeMax]);

  // ── Schedule data ─────────────────────────────────────────────────────────
  const raidSchedule = useMemo(() => (server === 'kr' ? krRaid : jpRaid), [server, krRaid, jpRaid]);
  const mfSchedule = useMemo(() => (server === 'kr' ? krMultifloor : jpMultifloor), [server, krMultifloor, jpMultifloor]);
  const allScheduleItems = useMemo(() => [...raidSchedule, ...mfSchedule], [raidSchedule, mfSchedule]);
  const getScheduleTitle = useCallback((item: ScheduleItemV2) => getItemTitle(item, locale, i18n as I18nLike), [locale, i18n]);

  const raidConfigItems = useMemo(
    () => raidSchedule.filter((item) => (item.endTime ?? item.startTime).slice(0, 10) >= startDate).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [raidSchedule, startDate],
  );

  const jfdConfigItems = useMemo(
    () => raidSchedule.filter((item) => item.id.startsWith('jfd-') && (item.endTime ?? item.startTime).slice(0, 10) >= startDate).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [raidSchedule, startDate],
  );

  const contentItems = useMemo((): ContentItem[] => {
    const items: ContentItem[] = [];
    for (const item of allScheduleItems) {
      const date = item.startTime.slice(0, 10);
      if (date < startDate) continue;
      const idParts = item.id.split('-');
      const type = idParts[0] as 'raid' | 'eraid' | 'multifloor';
      const season = parseInt(idParts[1]);
      const prefix = type === 'raid' ? 'R' : type === 'eraid' ? 'E' : 'S';
      const endDate = item.endTime ? item.endTime.slice(0, 10) : undefined;
      items.push({ id: item.id, type, prefix, season, typeLabel: getItemLabel(item, i18n) ?? type, bossTitle: getScheduleTitle(item), date, endDate });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [allScheduleItems, startDate, getScheduleTitle, i18n]);

  const firstPickupByStudent = useMemo((): Record<number, string> => {
    const map: Record<number, string> = {};
    for (const item of server === 'kr' ? krPickup : jpPickup) {
      for (const s of item.details?.students ?? []) {
        if (s.rerun) continue;
        const date = item.startTime.slice(0, 10);
        if (!(s.id in map) || date < map[s.id]) map[s.id] = date;
      }
    }
    return map;
  }, [server, krPickup, jpPickup]);

  const eventScheduleMap = useMemo(() => {
    const events = server === 'kr' ? krEvents : jpEvents;
    const map: Record<number, { name: string; date: string }> = {};
    for (const item of events) {
      const rawId = parseInt(item.id.replace('event-', ''));
      if (isNaN(rawId)) continue;
      map[rawId % 100000] = { name: getScheduleTitle(item), date: item.startTime.slice(0, 10) };
    }
    return map;
  }, [server, krEvents, jpEvents, getScheduleTitle]);

  const eventItemsByKey = useMemo((): Record<string, { name: string; date: string; amount: number }[]> => {
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
  }, [eventPlans, eventScheduleMap]);

  // ── Goal resolution ───────────────────────────────────────────────────────
  const resolvedGoalsByStudent = useMemo((): Record<number, Array<StudentTargetGoal & { resolvedDate: string | undefined }>> => {
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
  }, [targetGoals, allScheduleItems, startDate]);

  const activePlans = useMemo(
    () =>
      growthPlans.filter((p): p is GrowthPlan & { studentId: number } => {
        if (!p.studentId) return false;
        const goals = resolvedGoalsByStudent[p.studentId] ?? [];
        return goals.some((g) => calcElephNeeded(p.current.star, g.targetStar, p.current.uw, g.targetUw) > 0);
      }),
    [growthPlans, resolvedGoalsByStudent],
  );

  const trackingStudentIds = useMemo(() => {
    const isStudentKey = (k: string) => k.startsWith('Item_') && Number(k.slice(5)) >= 10000;
    const ids = new Set(activePlans.map((p) => p.studentId));
    if (selectedStudentId !== null) ids.add(selectedStudentId);
    for (const k of Object.keys(materialInventory)) if (isStudentKey(k) && (materialInventory[k] ?? 0) > 0) ids.add(Number(k.slice(5)));
    for (const k of itemSearchExtraKeys) if (isStudentKey(k)) ids.add(Number(k.slice(5)));
    if (selectedItemKey && isStudentKey(selectedItemKey)) ids.add(Number(selectedItemKey.slice(5)));
    return [...ids];
  }, [activePlans, selectedStudentId, materialInventory, itemSearchExtraKeys, selectedItemKey]);

  // ── Growth plan deductions ────────────────────────────────────────────────
  const growthPlanDeductions = useMemo((): {
    elephEventsByStudent: Record<number, Array<{ date: string; spend: number }>>;
    eligmaByDate: Record<string, PercentileBand>;
    studentGoalSummaries: Array<Omit<StudentGoalStatus, 'eligmaBalanceAfter' | 'status'>>;
  } => {
    const elephEventsByStudent: Record<number, Array<{ date: string; spend: number }>> = {};
    const eligmaByDate: Record<string, PercentileBand> = {};
    const studentGoalSummaries: Array<Omit<StudentGoalStatus, 'eligmaBalanceAfter' | 'status'>> = [];

    for (const plan of activePlans) {
      const studentId = plan.studentId;
      const goals = resolvedGoalsByStudent[studentId] ?? [];
      if (goals.length === 0) continue;
      const studentElephKey = `Item_${studentId}`;
      const currEleph = materialInventory[studentElephKey] ?? plan.current.eleph ?? 0;
      const alreadyBought = Math.max(0, (plan.eligmaInfo.price - 1) * 20 + (20 - plan.eligmaInfo.stock));

      const elephIncomeEvents: ResourceEvent[] = [
        ...purchaseEvents
          .filter((e) => e.gainItemKey === studentElephKey && (e.gainAmount ?? 0) > 0 && e.date >= startDate)
          .map((e): ResourceEvent => ({ itemKey: studentElephKey, delta: e.gainAmount ?? 0, date: e.date, source: 'purchase' })),
        ...eventsFromGachaItems(gachaResult, startDate, [studentId], { includeEligma: false }),
        ...(Object.keys(eventScheduleMap).length > 0 ? eventsFromEventEleph(eventPlans, eventScheduleMap, [studentId]) : []),
      ];

      let cumulativeSpend = 0;
      let prevStar = plan.current.star;
      let prevUw = plan.current.uw;

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

        const timeline = buildResourceTimelines(startDate, daysToGoal + 1, { [studentElephKey]: currEleph }, elephIncomeEvents, new Set([studentElephKey]));
        const atGoal = (timeline[studentElephKey] ?? [])[daysToGoal];
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
  }, [activePlans, resolvedGoalsByStudent, materialInventory, purchaseEvents, gachaResult, eventPlans, eventScheduleMap, startDate, studentsRecord]);

  const growthSpendEvents = useMemo((): ResourceEvent[] => {
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
  }, [growthPlanDeductions, startDate, stageFarmingPlans, campaigns, itemIconInfo, locale]);

  const extraCoinEvents = useMemo(
    (): ResourceEvent[] =>
      mergeResourceEvents(
        eventsFromPvpIncome(pvpAverageRank, pvpDailyDefenseWins, pvpExtraWeeklyIncome, startDate, planDays),
        eventsFromJfdCoins(
          raidSchedule.filter((i) => i.id.startsWith('jfd-')),
          jfdDefaultDailyCoins,
          jfdPerPeriodCoins,
          startDate,
        ),
        eventsFromRaidRewards(raidSchedule, raidGlobalConfig, eraidGlobalConfig, raidDetailConfigs, startDate, getScheduleTitle),
        eventsFromExpertPermit(expertPermitMode, expertPermitWeeklyMax, expertPermitDailyAmounts, startDate, planDays),
        eventsFromMultifloorWBs(mfSchedule, multifloorMaxFloors, startDate, getScheduleTitle, multifloorDefaultMaxFloor),
      ),
    [
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
      planDays,
      startDate,
      getScheduleTitle,
    ],
  );

  const eligmaTimeline = useMemo(() => {
    const eventEligmaItems = (eventItemsByKey['Item_23'] ?? []).map((item) => ({ date: item.date, eligma: item.amount }));
    const events = mergeResourceEvents(
      eventsFromPurchaseEvents(purchaseEvents, startDate),
      eventsFromDailySources(dailySourceAmounts, startDate, planDays),
      eventsFromContentYields(contentEventYields, allScheduleItems, startDate, getScheduleTitle),
      growthSpendEvents,
      extraCoinEvents,
      eventsFromGachaItems(gachaResult, startDate, [], { includeEligma: true }),
      eventEligmaItems.length > 0 ? eventsFromEventEligma(eventEligmaItems) : [],
    );
    return buildResourceTimelines(startDate, planDays, materialInventory, events, new Set(['Item_23']))['Item_23'] ?? [];
  }, [
    purchaseEvents,
    startDate,
    dailySourceAmounts,
    planDays,
    contentEventYields,
    allScheduleItems,
    growthSpendEvents,
    extraCoinEvents,
    gachaResult,
    eventItemsByKey,
    materialInventory,
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
    const apPurchaseEvents = purchaseEvents.filter((event) => event.spendItemKey === 'Item_8' && event.gainItemKey === 'Currency_5' && (event.gainAmount ?? 0) > 0);
    if (apPurchaseEvents.length === 0) return undefined;

    const events = mergeResourceEvents(eventsFromPurchaseEvents(purchaseEvents, startDate), eventsFromDailySources(dailySourceAmounts, startDate, planDays), extraCoinEvents);
    const timeline = buildResourceTimelines(startDate, planDays, materialInventory, events, new Set(['Item_8']))['Item_8'] ?? [];
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
  }, [purchaseEvents, startDate, dailySourceAmounts, planDays, extraCoinEvents, materialInventory]);

  // ── Tracking items ────────────────────────────────────────────────────────
  const trackingItems = useMemo(
    (): TrackingItem[] => [
      { key: 'Item_23', iconInfo: itemIconInfo?.Item['23'] },
      ...trackingStudentIds.map((id) => ({ key: `Item_${id}`, iconInfo: itemIconInfo?.Item[String(id)] })),
      { key: 'Item_8', iconInfo: itemIconInfo?.Item['8'] },
      ...(purchaseEvents.some((e) => e.gainItemKey === 'Currency_5') ? [{ key: 'Currency_5', iconInfo: itemIconInfo?.Currency['5'] }] : []),
      ...COIN_KEYS.filter((k) => (materialInventory[k] ?? 0) > 0).map((k) => ({ key: k, iconInfo: itemIconInfo?.Item[splitItemKey(k)?.[1] ?? ''] })),
      ...MULTIFLOOR_WB_KEYS.filter((k) => (materialInventory[k] ?? 0) > 0 || Object.keys(multifloorMaxFloors).length > 0).map((k) => ({
        key: k,
        iconInfo: itemIconInfo?.Item[splitItemKey(k)?.[1] ?? ''],
      })),
    ],
    [trackingStudentIds, materialInventory, itemIconInfo, multifloorMaxFloors, purchaseEvents],
  );

  // ── Icon renderer ─────────────────────────────────────────────────────────
  const iconEventData = useMemo(() => ({ icons: itemIconInfo ?? {} }) as unknown as import('~/types/plannerData').EventData, [itemIconInfo]);

  const renderItemIcon = useCallback(
    (itemKey: string, size: number, amount: number) => {
      if (!itemIconImg) return null;
      const i = itemKey.lastIndexOf('_');
      if (i < 0) return null;
      return <ItemIcon type={itemKey.slice(0, i)} itemId={itemKey.slice(i + 1)} amount={amount} size={size} eventData={iconEventData} iconData={itemIconImg} />;
    },
    [iconEventData, itemIconImg],
  );

  // ── Calendar sources (via hook) ───────────────────────────────────────────
  const { allCalendarSources } = useCalendarSources({
    trackingItems,
    purchaseEvents,
    stageFarmingPlans,
    campaigns,
    server,
    selectedItemKey,
    itemIconInfo,
    locale,
    setStageFarmingRunsRange,
    removeStageFarmingPlan,
    setSelectedPurchaseDate,
  });

  // ── Item selection ────────────────────────────────────────────────────────
  const handleSelectItem = useCallback(
    (key: string) => {
      setSelectedItemKey(key);
      if (key in COIN_SHOP_BY_COIN_KEY) {
        setSelectedCalendarKey(`coin_panel_${key}`);
        return;
      }
      const first = allCalendarSources.find((s) => s.itemKey === key);
      if (first) setSelectedCalendarKey(first.key);
    },
    [allCalendarSources],
  );

  const handleCalendarSourceChange = useCallback(
    (key: string) => {
      setSelectedCalendarKey(key);
      const src = allCalendarSources.find((s) => s.key === key);
      if (src?.itemKey) setSelectedItemKey(src.itemKey);
    },
    [allCalendarSources],
  );

  const handleSelectSearchResult = useCallback(
    (key: string) => {
      setItemSearchExtraKeys((prev) => new Set([...prev, key]));
      handleSelectItem(key);
    },
    [handleSelectItem],
  );

  const handleSelectItemWithTabSwitch = useCallback(
    (key: string) => {
      handleSelectItem(key);
      const n = Number(key.replace('Item_', ''));
      if (key.startsWith('Item_') && n >= 10000) setActiveTab('students');
    },
    [handleSelectItem],
  );

  const handleSelectResourceWithTabSwitch = useCallback(
    (key: string) => {
      handleSelectItem(key);
      setActiveTab('resources');
    },
    [handleSelectItem],
  );

  // ── Panel entries ─────────────────────────────────────────────────────────
  const panelEntryList = useMemo((): PurchasePanelEntry[] => {
    if (!selectedItemKey) return [];
    const trackedKeys = new Set(trackingItems.map((t) => t.key));
    const entries: PurchasePanelEntry[] = [];

    const shopDefKey = GAIN_ITEM_TO_COIN_KEY[selectedItemKey] ?? selectedItemKey;
    const shopDef = COIN_SHOP_BY_COIN_KEY[shopDefKey];
    if (shopDef) {
      if (selectedItemKey === 'Currency_18') {
        const result = buildExpertPermitEntries(studentsRecord, growthPlans, itemIconInfo, locale, targetGoals, materialInventory);
        entries.push(...result);
      } else {
        for (const item of shopDef.items) {
          const sid = item.gainItemKey.startsWith('Item_') ? Number(item.gainItemKey.slice(5)) : NaN;
          const plan = sid >= 10000 ? growthPlans.find((p) => p.studentId === sid) : undefined;
          const isAtMax = plan != null && isElephGoalReached(plan, sid, targetGoals, materialInventory);
          entries.push({
            gainItemKey: item.gainItemKey,
            label: getItemName(item.gainItemKey, itemIconInfo, locale),
            shopItem: item,
            coinKey: shopDef.coinKey,
            isAtMax,
          });
        }
      }
      return entries.sort((a, b) => {
        const pa = trackedKeys.has(a.gainItemKey) ? (a.isAtMax ? 1 : 0) : 2;
        const pb = trackedKeys.has(b.gainItemKey) ? (b.isAtMax ? 1 : 0) : 2;
        return pa - pb;
      });
    }

    if (selectedItemKey.startsWith('Item_')) {
      const studentId = Number(selectedItemKey.slice(5));
      if (!isNaN(studentId) && studentId >= 10000) {
        const meta = studentsRecord[studentId];
        const plan = growthPlans.find((p) => p.studentId === studentId);
        const isAtMax = plan != null && isElephGoalReached(plan, studentId, targetGoals, materialInventory);
        for (const def of COIN_SHOP_DEFS) {
          const item = def.items.find((i) => i.gainItemKey === selectedItemKey);
          if (!item) continue;
          entries.push({
            gainItemKey: selectedItemKey,
            label: getItemName(selectedItemKey, itemIconInfo, locale),
            shopItem: item,
            coinKey: def.coinKey,
            isAtMax,
          });
        }
        if (!EXPERT_PERMIT_SHOP_EXCLUDED_IDS.has(studentId)) {
          const il = meta?.IsLimited?.[1];
          if (il === 1 || il === 2 || il === 3) {
            const expertPermitType: ExpertPermitStudentType = il === 3 ? 'pass_limited' : il === 1 ? 'limited' : 'distributed';
            const permitInfo = EXPERT_PERMIT_ELEPH_COST[expertPermitType];
            if (permitInfo) {
              const availableFrom =
                expertPermitType !== 'distributed'
                  ? (() => {
                      const first = firstPickupByStudent[studentId];
                      return first ? expertPermitShopAvailableYearMonth(first, expertPermitType) : null;
                    })()
                  : null;
              entries.push({
                gainItemKey: selectedItemKey,
                label: getItemName(selectedItemKey, itemIconInfo, locale),
                shopItem: {
                  gainItemKey: selectedItemKey,
                  gainAmount: 5,
                  costPerBundle: permitInfo.expertPermitPer5Eleph,
                  monthlyLimit: permitInfo.monthlyMaxPurchases,
                },
                coinKey: 'Currency_18',
                sourceType: 'expert_permit_shop',
                availableFrom: availableFrom ?? undefined,
                isAtMax,
              });
            }
          }
        }
      }
    }
    return entries;
  }, [selectedItemKey, studentsRecord, growthPlans, firstPickupByStudent, itemIconInfo, locale, targetGoals, materialInventory, trackingItems]);

  const availableStages = useMemo((): Array<{ stageId: string; stage: CampaignStage }> => {
    if (!campaigns || !selectedItemKey) return [];
    const stages: Array<{ stageId: string; stage: CampaignStage }> = [];
    for (const [stageId, stage] of Object.entries(campaigns[server])) {
      const reward = stage.Reward.map((v) => (v.StageRewardParcelTypeStr === 'Equipment' ? { ...v, StageRewardId: normalizeBluprintToEquipment(v.StageRewardId) } : { ...v })).find(
        (r) => `${r.StageRewardParcelTypeStr}_${r.StageRewardId}` === selectedItemKey,
      );
      if (!reward) continue;
      stages.push({ stageId, stage });
    }
    return stages.sort((a, b) => Number(a.stageId) - Number(b.stageId));
  }, [selectedItemKey, campaigns, server]);

  const inlinePanelFilterTypes = useMemo((): Array<{ id: string; label: string }> => {
    const types: Array<{ id: string; label: string }> = [];
    if (availableStages.length > 0) types.push({ id: 'stages', label: t_planner('equipment.tabStages') });
    const seenTypes = new Set<string>();
    for (const entry of panelEntryList) {
      const parts = splitItemKey(entry.gainItemKey);
      if (!parts) continue;
      const [type, idStr] = parts;
      const info = itemIconInfo?.[type as keyof IconInfos]?.[idStr];
      const itemType = getShopItemType(type, Number(idStr), info ?? undefined);
      if (!itemType || seenTypes.has(itemType)) continue;
      seenTypes.add(itemType);
      const labelKey = FILTER_TYPE_META[itemType];
      if (!labelKey) continue;
      types.push({ id: itemType, label: t_planner(labelKey as never) });
    }
    return types;
  }, [availableStages, panelEntryList, itemIconInfo, t_planner]);

  const filteredPanelEntries = useMemo(
    () =>
      inlinePanelHiddenTypes.size === 0
        ? panelEntryList
        : panelEntryList.filter((e) => {
            const parts = splitItemKey(e.gainItemKey);
            if (!parts) return true;
            const [type, idStr] = parts;
            const info = itemIconInfo?.[type as keyof IconInfos]?.[idStr];
            const itemType = getShopItemType(type, Number(idStr), info ?? undefined);
            return !itemType || !inlinePanelHiddenTypes.has(itemType);
          }),
    [panelEntryList, inlinePanelHiddenTypes, itemIconInfo],
  );

  const scheduleBarItems = useMemo((): ScheduleBarItem[] => {
    const events = server === 'kr' ? krEvents : jpEvents;
    const campaignItems = server === 'kr' ? krCampaign : jpCampaign;
    const toItem =
      (defaultType: ScheduleBarItem['type']) =>
      (e: ScheduleItemV2): ScheduleBarItem => ({
        name: getScheduleTitle(e),
        type: e.id.startsWith('eraid-') ? 'eraid' : defaultType,
        startMs: new Date(e.startTime).getTime(),
        endMs: e.endTime ? new Date(e.endTime).getTime() : new Date(e.startTime).getTime() + 86_400_000,
      });
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const todayGameStart = Date.UTC(sy, sm - 1, sd) - GAME_DAY_OFFSET_MS;
    return [...events.map(toItem('event')), ...raidSchedule.map(toItem('raid')), ...mfSchedule.map(toItem('multifloor')), ...campaignItems.map(toItem('campaign'))].filter(
      (it) => it.endMs > todayGameStart,
    );
  }, [server, krEvents, jpEvents, raidSchedule, mfSchedule, krCampaign, jpCampaign, startDate, getScheduleTitle]);

  const filteredScheduleBarItems = useMemo(
    () =>
      scheduleBarItems.filter((item) => {
        if (item.type === 'event') return scheduleFilters.event;
        if (item.type === 'raid' || item.type === 'eraid') return scheduleFilters.raid;
        if (item.type === 'multifloor') return scheduleFilters.multifloor;
        if (item.type === 'campaign') return scheduleFilters.campaign;
        return true;
      }),
    [scheduleBarItems, scheduleFilters],
  );

  // ─── Shared schedule section props ────────────────────────────────────────
  const scheduleSectionProps = {
    startDate,
    allCalendarSources,
    selectedCalendarKey,
    onCalendarSourceChange: handleCalendarSourceChange,
    filteredScheduleBarItems,
    renderItemIcon,
    selectedRangeMin,
    selectedRangeMax,
    setSelectedRangeMin,
    setSelectedRangeMax,
    scheduleFilters,
    onScheduleFilterChange: (key: keyof typeof scheduleFilters, value: boolean) => setScheduleFilters((prev) => ({ ...prev, [key]: value })),
    selectedItemKey,
    availableStages,
    panelEntryList,
    filteredPanelEntries,
    inlinePanelFilterTypes,
    inlinePanelHiddenTypes,
    onTogglePanelType: (id: string) =>
      setInlinePanelHiddenTypes((prev) => {
        const next = new Set(prev);
        if (prev.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    showPurchasePanel,
    onClosePurchasePanel: () => setShowPurchasePanel(false),
    selectedPurchaseDate,
    campaigns,
    server,
    stageFarmingPlans,
    iconInfoData: itemIconInfo,
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 py-4">
      {/* Header */}
      <PageHeader title={t('header.title')} description={t('header.description')} badge="BETA" />

      <div className="flex items-center gap-3 flex-wrap px-3 sm:px-4 xl:px-0">
        <div className="flex rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          {(['kr', 'jp'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setServer(s)}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                server === s ? 'bg-blue-600 text-white dark:bg-blue-500' : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
        <select
          value={planDays}
          onChange={(e) => setPlanDays(Number(e.target.value))}
          className="px-2 py-1 text-sm ios-compact-12 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:border-blue-400"
        >
          {HORIZON_OPTIONS.map((o) => (
            <option key={o.days} value={o.days}>
              {horizonLabels[o.days]}
            </option>
          ))}
        </select>
      </div>

      {/* Tracked items bar */}
      {itemIconInfo && (
        <TrackedItemsBar
          trackingItems={trackingItems}
          selectedItemKey={selectedItemKey}
          iconInfos={itemIconInfo}
          studentsRecord={studentsRecord}
          locale={locale}
          onSelectSearchResult={handleSelectSearchResult}
          onSelectItem={handleSelectItem}
          renderItemIcon={renderItemIcon}
        />
      )}

      {/* Tab bar */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 px-3 sm:px-4 xl:px-0">
        <div className="flex overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={`shrink-0 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
            >
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Overview ─────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <GoalStatusSummary
          statuses={studentGoalStatuses}
          tacticalCoinStatus={tacticalCoinStatus}
          studentsRecord={studentsRecord}
          onOpenStudentGoals={() => setActiveTab('students')}
          onSelectResource={handleSelectResourceWithTabSwitch}
        />
      )}

      {/* ── Tab: Resources ────────────────────────────────────────────────── */}
      {activeTab === 'resources' && (
        <>
          <ResourcePanel
            trackingItems={trackingItems}
            extraKeys={itemSearchExtraKeys}
            selectedKey={selectedItemKey}
            inventory={materialInventory}
            studentPlansSection={undefined}
            onUpdateInventory={updateMaterialInventory}
            distEligma={gachaResult?.eligmaCumulative.dist('inf') ?? []}
            gachaEligmaPercentile={gachaEligmaPercentile}
            gachaEligmaUseMean={gachaEligmaUseMean}
            onSetPercentile={setGachaEligmaPercentile}
            onSetUseMean={setGachaEligmaUseMean}
            purchaseEvents={purchaseEvents}
            eventItemsByKey={eventItemsByKey}
            startDate={startDate}
            days={planDays}
            dailySourceAmounts={dailySourceAmounts}
            contentEventYields={contentEventYields}
            contentSchedule={allScheduleItems}
            growthSpendEvents={growthSpendEvents}
            extraEvents={extraCoinEvents}
            gachaResult={gachaResult}
            studentIds={trackingStudentIds}
            eventPlans={eventPlans}
            eventScheduleMap={eventScheduleMap}
            iconInfos={itemIconInfo}
            iconData={itemIconImg}
            locale={locale}
          />
        </>
      )}

      {/* ── Tab: Income Setup ─────────────────────────────────────────────── */}
      {activeTab === 'income' && (
        <>
          {!selectedItemKey && (
            <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 p-6 text-center">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('incomeTabHint')}</p>
            </div>
          )}
          <ItemIncomeSection
            selectedItemKey={selectedItemKey}
            pvp={{ pvpAverageRank, pvpDailyDefenseWins, pvpExtraWeeklyIncome, onUpdate: (p) => updatePlanStore(p) }}
            jfd={{ jfdDefaultDailyCoins, jfdPerPeriodCoins, jfdConfigItems, onUpdate: (p) => updatePlanStore(p) }}
            raid={{
              isRaid: selectedItemKey === 'Item_7' || selectedItemKey === 'Item_9',
              raidGlobalConfig,
              eraidGlobalConfig,
              raidDetailConfigs,
              raidConfigItems,
              setRaidDetailConfig,
              onUpdate: (p) => updatePlanStore(p),
            }}
            expertPermit={{ expertPermitMode, expertPermitWeeklyMax, onUpdate: (p) => updatePlanStore(p) }}
            wb={{ multifloorDefaultMaxFloor, multifloorMaxFloors, mfSchedule, onUpdate: (p) => updatePlanStore(p) }}
          />
          {selectedItemKey && <ScheduleSection {...scheduleSectionProps} />}
        </>
      )}

      {/* ── Tab: Student Goals ────────────────────────────────────────────── */}
      {activeTab === 'students' && (
        <div className="px-3 sm:px-4 xl:px-0">
          <StudentGoalsTab
            selectedItemKey={selectedItemKey}
            activePlans={activePlans}
            allGrowthPlans={growthPlans}
            studentsRecord={studentsRecord}
            targetGoals={targetGoals}
            contentItems={contentItems}
            gachaStudentStats={gachaResult?.studentStats}
            onSelectItem={handleSelectItemWithTabSwitch}
            onAddGoal={addTargetGoal}
            onUpdateGoal={updateTargetGoal}
            onRemoveGoal={removeTargetGoal}
            onClearStudent={() => {
              setSelectedItemKey(null);
              setSelectedCalendarKey('');
              setSelectedPurchaseDate(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
