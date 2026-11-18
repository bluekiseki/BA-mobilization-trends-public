// app/routes/planner/Inventory.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link, useLocation, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import { FaChevronLeft, FaTimes } from 'react-icons/fa';
import { localeLink } from '~/utils/localeLink';
import { getInstance } from '~/middleware/i18next';
import { createLinkHreflang, createMetaDescriptor } from '~/components/shell/head';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { PageHeader } from '~/components/common/PageHeader';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { useEventPlanStore } from '~/store/planner/useEventPlanStore';
import { useGachaResultStore } from '~/store/planner/useGachaResultStore';
import { useResourcePlanStore } from '~/store/planner/useResourcePlanStore';
import { todayISODate } from '~/features/inventory/logic/plannerDate';
import { useResourceProjection, HORIZON_OPTIONS } from '~/features/inventory/components/useResourceProjection';
import ResourceTimelinePanel from '~/features/inventory/components/ResourceTimelinePanel';
import { NON_BLUEPRINT_EQUIPMENT_KEYS } from '~/utils/groupMaterialNeeds';
import { equipmentId, UW_MATERIAL_SERIES } from '~/data/growthData';
import { BD_NOTE_GRADE_LABEL, BD_NOTE_SCHOOL_ORDER, getBdNoteItemKey, type BdNoteGrade } from '~/features/inventory/logic/bdNoteSchool';
import { getOpartItemKey, listOpartSeriesBases, OPART_TIERS, type OpartTier } from '~/features/inventory/logic/opartSeries';
import { buildResourceEntries, buildStudentResourceGroups, MATRIX_CAPABLE_TYPES, type DisplayMode, type SortKey } from '~/features/inventory/logic/inventoryDashboard';
import { splitItemKey, type ItemType } from '~/utils/itemType';
import { getItemDescription, getItemName } from '~/utils/locale';
import { ItemIcon } from '~/components/item/Icon';
import { useSearchMatcher } from '~/hooks/useSearchMatcher';
import type { CampaignData, ContentItem, EventData, IconData, IconInfos, Student, StudentData } from '~/types/plannerData';
import type { Route } from './+types/Inventory';
import { GroupedSections } from '~/components/common/GroupedSections';
import { StudentIcon } from '~/components/student/studentIcon';
import type { Character } from '~/types/raidReport';
import { InventoryFilterBar } from '~/features/inventory/components/InventoryFilterBar';
import { GoalSummaryRow } from '~/features/inventory/components/GoalSummaryRow';
import { MaterialItemTable } from '~/components/item/MaterialItemTable';
import { MaterialLevelToggle, type MaterialDetailLevel } from '~/components/item/MaterialLevelToggle';
import { buildMaterialRow } from '~/utils/materialTable';
import { ResourceGrid } from '~/features/inventory/components/ResourceGrid';
import { ResourceMatrix, type MatrixAxisEntry } from '~/features/inventory/components/ResourceMatrix';
import { QuantityEditSheet } from '~/features/inventory/components/QuantityEditSheet';
import { useResourceIconSize } from '~/features/inventory/components/ResourceIconButton';
import type { ScheduleItemV2 } from '~/utils/calender.data.v2';
import { getItemLabel, getItemTitle, type I18nLike } from '~/utils/scheduleDisplay';
import { TrackedItemsBar } from '~/features/inventory/components/TrackedItemsBar';
import { ItemIncomeSection } from '~/features/inventory/components/ItemIncomeSection';
import { findAutoBuyShops, ShopAutoBuyToggle } from '~/features/inventory/components/ShopAutoBuyToggle';
import { MultifloorFloorInput } from '~/features/inventory/components/MultifloorFloorInput';
import { MULTIFLOOR_WB_KEYS } from '~/features/inventory/logic/resourceEventAdapters';
import { useStaticData } from '~/hooks/useStaticData';
import { loadCoinShopMonthly, loadMultifloorRewards } from '~/utils/itemSourceData';
import { useEventDropSources } from '~/hooks/useEventDropSources';
import { ItemDropList } from '~/features/inventory/components/ItemDropList';
import { IncomeAssumptions } from '~/features/inventory/components/IncomeAssumptions';
import { StudentGoalsTab } from '~/features/inventory/components/StudentGoalsTab';
import { ScheduleSection } from '~/features/inventory/components/ScheduleSection';
import { GoalStatusSummary } from '~/features/inventory/components/GoalStatusSummary';
import { useCalendarSources } from '~/features/inventory/components/useCalendarSources';
import { COIN_SHOP_BY_COIN_KEY } from '~/data/elephSources';
import { buildNavigableKeys } from '~/features/inventory/logic/navigation';
import { buildInlinePanelFilterTypes, filterPanelEntries, buildScheduleBarItems, filterScheduleBarItems } from '~/features/inventory/logic/panelView';
import { buildSchoolOptions, buildShopCategoryOptions, buildTagOptions, buildRarityOptions, listFilteredEntries, type EntryFilterState } from '~/features/inventory/logic/entryFilters';
import {
  buildEditingGiftMap,
  listEditingGiftStudents,
  calcEditingPerStudentNeeds,
  listEditingAllUsers,
  studentsByNumericId,
  selectRaidConfigItems,
  selectJfdConfigItems,
} from '~/features/inventory/logic/editingItem';
import { buildDisplayInventory, calcNeeded, calcFungiblePoolData, calcFungibleOwnedByKey } from '~/features/inventory/logic/inventoryView';
import { buildFirstPickupByStudent, findAvailableStages, buildPanelEntryList } from '~/features/inventory/logic/purchasePanel';
import { type ProjectionSchedule, EQUIP_CATEGORIES, getProjectionSchedule, cachedProjectionSchedule } from '~/features/inventory/logic/inventoryPageLogic';
import { studentSheetPreloadLinks } from '~/utils/iconSheet';
import type { AppHandle } from '~/types/link';
const BD_NOTE_GRADES: BdNoteGrade[] = [0, 1, 2, 3];
const EMPTY_SCHEDULE_ITEMS: ScheduleItemV2[] = [];
const EMPTY_PROJECTION_SCHEDULE: ProjectionSchedule = {
  krEvents: EMPTY_SCHEDULE_ITEMS,
  jpEvents: EMPTY_SCHEDULE_ITEMS,
  krRaid: EMPTY_SCHEDULE_ITEMS,
  jpRaid: EMPTY_SCHEDULE_ITEMS,
  krMultifloor: EMPTY_SCHEDULE_ITEMS,
  jpMultifloor: EMPTY_SCHEDULE_ITEMS,
  krCampaign: EMPTY_SCHEDULE_ITEMS,
  jpCampaign: EMPTY_SCHEDULE_ITEMS,
  krPickup: EMPTY_SCHEDULE_ITEMS,
  jpPickup: EMPTY_SCHEDULE_ITEMS,
};

// ─── Income-section helpers (moved from the old planner/resources route) ─────

// ─── Loader ────────────────────────────────────────────────────────────────

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  return data({
    locale,
    siteTitle: i18n.t('common:title'),
    title: i18n.t('planner:inventory.title'),
    description: i18n.t('planner:inventory.description'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/p.webp');
}

export function links() {
  return [...createLinkHreflang('/planner/inventory')];
}

export function headers({}: Route.HeadersArgs) {
  if (process.env.NODE_ENV === 'production') return { 'Cache-Control': CACHE_CONTROL_CONFIG };
}

export default function InventoryPage({ loaderData }: Route.ComponentProps) {
  const { locale } = loaderData;
  const [schedule, setSchedule] = useState<ProjectionSchedule | null>(cachedProjectionSchedule);
  const { t: t_club } = useTranslation('club', { keyPrefix: 'short' });
  const { t: t_game } = useTranslation('game');
  const { t: t_ui } = useTranslation('ui');
  const { t: t_planner } = useTranslation('planner');
  const { t: t_resources } = useTranslation('resources');
  const { i18n } = useTranslation();
  useTranslation('calendar');
  const iconSize = useResourceIconSize();
  const matcher = useSearchMatcher(locale);
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const returnToRaw = searchParams.get('returnTo');
  const returnTo = returnToRaw && returnToRaw.startsWith('/') && !returnToRaw.startsWith('//') ? returnToRaw : null;

  const returnToSelf = `${location.pathname}${location.search}${location.hash}`;
  const itemScannerLink = `${localeLink(locale, '/scanner/item')}?returnTo=${encodeURIComponent(returnToSelf)}`;

  const [students, setStudents] = useState<StudentData>({});
  const [iconData, setIconData] = useState<IconData>({});
  const [iconInfos, setIconInfos] = useState<IconInfos | null>(null);
  const [campaigns, setCampaigns] = useState<{ jp: CampaignData; kr: CampaignData } | null>(null);
  const [loading, setLoading] = useState(true);

  // Only assets required by the catalog block its first render.
  useEffect(() => {
    const fetchCriticalData = async () => {
      try {
        const [studentsRes, iconImgRes, iconInfoRes] = await Promise.all([
          fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)),
          fetch(cdn('/ew/icon_img.json')),
          fetch(cdn('/ew/icon_info.json')),
        ]);
        const [studentData, imageData, infoData] = (await Promise.all([studentsRes.json(), iconImgRes.json(), iconInfoRes.json()])) as [StudentData, IconData, IconInfos];
        setStudents(studentData);
        setIconData(imageData);
        setIconInfos(infoData);
      } catch (error) {
        console.error('Failed to fetch inventory data:', error);
      } finally {
        setLoading(false);
      }
    };
    void fetchCriticalData();
  }, [locale]);

  const { growthPlans, materialInventory, updateMaterialInventory, ownedGifts, updateOwnedGifts, togglePlanSelection, selectAllPlans } = useGlobalStore();
  const { plans: eventPlans } = useEventPlanStore();
  const { result: gachaResult } = useGachaResultStore();
  const {
    server,
    setServer,
    gachaEligmaPercentile,
    gachaEligmaUseMean,
    setGachaEligmaPercentile,
    setGachaEligmaUseMean,
    purchaseEvents,
    dailySourceAmounts,
    contentEventYields,
    targetGoals,
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
    assumeAllIncome,
    eventIncomeMode,
    autoBuyShopItems,
    update: updatePlanStore,
  } = useResourcePlanStore();

  const [planDays, setPlanDays] = useState(183);
  const startDate = useMemo(() => todayISODate(), []);

  const [selectedTypes, setSelectedTypes] = useState<Set<ItemType>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>('type');
  const [showTarget, setShowTarget] = useState(true);
  const [onlyNonZero, setOnlyNonZero] = useState(false);
  const [carryUp, setCarryUp] = useState(true);
  const [showMatrix, setShowMatrix] = useState(false);
  const [groupByStudent, setGroupByStudent] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [tableLevel, setTableLevel] = useState<MaterialDetailLevel>('split');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('owned');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [selectedSchools, setSelectedSchools] = useState<Set<string>>(new Set());
  const [selectedRoles, setSelectedRoles] = useState<Set<Student['TacticRole']>>(new Set());
  const [selectedSquads, setSelectedSquads] = useState<Set<Student['SquadType']>>(new Set());
  const [selectedShopCategories, setSelectedShopCategories] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedRarities, setSelectedRarities] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const [draftInventory, setDraftInventory] = useState<Record<string, number>>({});

  // Wide overlay state — income/schedule setup (tied to the currently edited item) and the
  // student-goals browser (standalone, not tied to a single catalog item).
  const [expandedOpen, setExpandedOpen] = useState(false);
  const [showStudentGoals, setShowStudentGoals] = useState(false);
  // The material table lists expected income per item, which needs the schedule and projection as well.
  const detailOpen = editingKey !== null || expandedOpen || showStudentGoals || (showTable && showTarget);
  const { krEvents, jpEvents, krRaid, jpRaid, krMultifloor, jpMultifloor, krCampaign, jpCampaign, krPickup, jpPickup } = schedule ?? EMPTY_PROJECTION_SCHEDULE;

  useEffect(() => {
    if (!detailOpen || schedule) return;
    let cancelled = false;
    void getProjectionSchedule()
      .then((value) => {
        if (!cancelled) setSchedule(value);
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error('Failed to load inventory schedule:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [detailOpen, schedule]);

  useEffect(() => {
    if (!editingKey || campaigns) return;
    let cancelled = false;
    void Promise.all([fetch(cdn('/w/jp/campaigns.json')), fetch(cdn('/w/kr/campaigns.json'))])
      .then(async ([jp, kr]) => ({ jp: await jp.json<CampaignData>(), kr: await kr.json<CampaignData>() }))
      .then((value) => {
        if (!cancelled) setCampaigns(value);
      })
      .catch((error: unknown) => console.error('Failed to fetch campaign data:', error));
    return () => {
      cancelled = true;
    };
  }, [editingKey, campaigns]);

  // Resources-only UI state, used only while the expanded overlay is open.
  const [itemSearchExtraKeys, setItemSearchExtraKeys] = useState<Set<string>>(new Set());
  const [selectedCalendarKey, setSelectedCalendarKey] = useState('');
  const [selectedPurchaseDate, setSelectedPurchaseDate] = useState<string | null>(null);
  const [selectedRangeMin, setSelectedRangeMin] = useState<string | null>(null);
  const [selectedRangeMax, setSelectedRangeMax] = useState<string | null>(null);
  const [showPurchasePanel, setShowPurchasePanel] = useState(true);
  const [scheduleFilters, setScheduleFilters] = useState({ event: true, raid: true, multifloor: true, campaign: true });
  const [inlinePanelHiddenTypes, setInlinePanelHiddenTypes] = useState<Set<string>>(new Set());

  // Per-key debounce timers and pending values — multiple keys can be mid-edit at once
  // (the main QuantityEditSheet field and the ResourceTimelinePanel "starting inventory"
  // field can target different items), so these must not share a single slot.
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingCommitsRef = useRef<Map<string, number>>(new Map());

  // Apply `?item=`/`?showTarget=1` deep-link params once (e.g. arriving from the Student planner
  // or an old `/planner/resources?item=...` link redirected here).
  const appliedDeepLinkRef = useRef(false);
  useEffect(() => {
    if (appliedDeepLinkRef.current) return;
    appliedDeepLinkRef.current = true;
    const itemParam = searchParams.get('item');
    if (itemParam) setEditingKey(itemParam);
    if (searchParams.get('showTarget') === '1') setShowTarget(true);
  }, [searchParams]);

  // Commits one key's pending edit to the store and clears its draft, so `materialInventory`
  // becomes the source of truth again (otherwise a stale draft would shadow it forever, e.g.
  // if the value later changes from cross-device sync).
  const commitInventoryKey = useCallback(
    (key: string) => {
      const timer = debounceTimersRef.current.get(key);
      if (timer) {
        clearTimeout(timer);
        debounceTimersRef.current.delete(key);
      }
      const value = pendingCommitsRef.current.get(key);
      if (value === undefined) return;
      pendingCommitsRef.current.delete(key);
      const parts = splitItemKey(key);
      const isGift = parts?.[0] === 'Item' && iconInfos?.Item?.[parts[1]]?.ItemCategory === 6;
      if (isGift && parts) {
        updateOwnedGifts(parts[1], value);
      } else {
        updateMaterialInventory(key, value);
      }
      setDraftInventory((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [updateMaterialInventory, updateOwnedGifts, iconInfos],
  );

  const scheduleInventoryCommit = useCallback(
    (key: string, value: number) => {
      setDraftInventory((prev) => ({ ...prev, [key]: value }));
      pendingCommitsRef.current.set(key, value);
      const existingTimer = debounceTimersRef.current.get(key);
      if (existingTimer) clearTimeout(existingTimer);
      debounceTimersRef.current.set(
        key,
        setTimeout(() => commitInventoryKey(key), 350),
      );
    },
    [commitInventoryKey],
  );

  const flushAllPendingInventoryCommits = useCallback(() => {
    for (const key of [...pendingCommitsRef.current.keys()]) commitInventoryKey(key);
  }, [commitInventoryKey]);

  useEffect(() => {
    return () => {
      for (const timer of debounceTimersRef.current.values()) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (editingKey) {
      return () => flushAllPendingInventoryCommits();
    }
  }, [editingKey, flushAllPendingInventoryCommits]);

  const handleToggleShowTarget = (v: boolean) => {
    setShowTarget(v);
    if (!v) {
      setDisplayMode('owned'); // needed/diff/deficit modes are meaningless without target data
      setGroupByStudent(false); // grouping needs per-student target data too
    }
  };
  // Grouped and matrix are alternate views of the same filtered list — mutually exclusive.
  const handleToggleGroupByStudent = () => {
    setGroupByStudent((v) => !v);
    setShowMatrix(false);
  };
  const handleToggleMatrix = () => {
    setShowMatrix((v) => !v);
    setGroupByStudent(false);
  };
  // Narrowing the type filter to a single matrix-capable type switches to the table view
  // automatically; widening the selection again drops back to the flat list.
  const handleChangeTypes = (types: Set<ItemType>) => {
    setSelectedTypes(types);
    const onlyMatrixType = types.size === 1 ? [...types].find((t) => MATRIX_CAPABLE_TYPES.has(t)) : undefined;
    if (onlyMatrixType !== undefined) {
      setShowMatrix(true);
      setGroupByStudent(false);
    } else {
      setShowMatrix(false);
    }
  };

  const EQUIP_LABELS: Record<(typeof EQUIP_CATEGORIES)[number], string> = {
    Hat: t_game('equipments.hat'),
    Gloves: t_game('equipments.gloves'),
    Shoes: t_game('equipments.shoes'),
    Bag: t_game('equipments.bag'),
    Badge: t_game('equipments.badge'),
    Hairpin: t_game('equipments.hairpin'),
    Charm: t_game('equipments.charm'),
    Watch: t_game('equipments.watch'),
    Necklace: t_game('equipments.necklace'),
  };

  // Matrix view only makes sense when narrowed to exactly one matrix-capable type.
  const singleMatrixType = selectedTypes.size === 1 ? [...selectedTypes].find((t) => MATRIX_CAPABLE_TYPES.has(t)) : undefined;

  const horizonLabels: Record<number, string> = {
    31: t_resources('horizon.oneMonth'),
    92: t_resources('horizon.threeMonths'),
    122: t_resources('horizon.fourMonths'),
    183: t_resources('horizon.sixMonths'),
    365: t_resources('horizon.oneYear'),
  };

  // Overlays in-flight (not-yet-debounced) edits on top of the committed store value, so both
  // numeric inputs display what was typed instantly without waiting for the store commit.
  // Gift items (ItemCategory 6) are tracked in the separate `ownedGifts` slice (shared with the
  // Affection tab's gift calculator), not `materialInventory` — overlay it here so this page reads
  // the same numbers.
  const displayInventory = useMemo(() => buildDisplayInventory({ materialInventory, ownedGifts, draftInventory, iconInfos }), [materialInventory, ownedGifts, draftInventory, iconInfos]);

  // Balance-projection timeline. Only items the pipeline actually models (eligma, per-student
  // eleph, AP, coins, WB) produce a meaningful chart, so the panel is gated on `isModeledKey`.
  const projection = useResourceProjection({
    enabled: detailOpen && schedule !== null,
    startDate,
    days: planDays,
    server,
    krEvents,
    jpEvents,
    krRaid,
    jpRaid,
    krMultifloor,
    jpMultifloor,
    krCampaign,
    jpCampaign,
    krPickup,
    jpPickup,
    campaigns,
    studentsRecord: students,
    itemIconInfo: iconInfos,
    growthPlans,
    // Gifts and unsaved edits live outside `materialInventory`; the projection must start from what this page shows.
    materialInventory: displayInventory,
    eventPlans,
    gachaResult,
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
    gachaEligmaPercentile,
    gachaEligmaUseMean,
    selectedItemKey: editingKey,
    itemSearchExtraKeys,
    locale,
  });

  const coinShopMonthly = useStaticData(loadCoinShopMonthly, null);
  const multifloorRewards = useStaticData(loadMultifloorRewards, null);
  const isMultifloorKey = editingKey !== null && (MULTIFLOOR_WB_KEYS as readonly string[]).includes(editingKey);
  const multifloorFloorCap = Math.max(97, ...Object.values(multifloorRewards ?? {}).flatMap((floors) => Object.keys(floors).map(Number)));
  const autoBuyShops = editingKey ? findAutoBuyShops(coinShopMonthly, editingKey) : [];
  const isModeledKey = editingKey != null && (projection.trackingItems.some((it) => it.key === editingKey) || !!projection.timelines[editingKey]);

  const needed = useMemo(() => calcNeeded({ showTarget, growthPlans, students }), [showTarget, growthPlans, students]);

  // Fungible-pool accounting shared by the goal-comparison summary row, the individual item
  // grid's deficit/diff numbers + status dot, and the "show 1 or more" pool-visibility filter.
  // Computed once here so all three always agree with each other.
  const fungiblePoolData = useMemo(() => calcFungiblePoolData({ showTarget, displayInventory, needed, growthPlans, students }), [showTarget, displayInventory, needed, growthPlans, students]);
  const { fungibleDeficitByKey, fungibleDiffByKey, poolVisibleKeys, goalSummaryPools } = fungiblePoolData;

  // Carry-up: every fungible pool's owned count, re-expressed as the fewest
  // highest-denomination items — same greedy allocation as FinalResultsDisplay's carry-up toggle
  // and the always-on carry-up in the Student page's NeedsGrid. A pure display transform of the
  // shared inventory (independent of any growth-plan target), so this applies uniformly whether
  // or not goal comparison is on, and is shared as-is across the main grid, every per-student
  // grid, and the matrix's supplementary grid.
  const fungibleOwnedByKey = useMemo(() => calcFungibleOwnedByKey(displayInventory), [displayInventory]);

  const entries = useMemo(() => {
    if (!iconInfos) return [];
    return buildResourceEntries(iconInfos, displayInventory, needed, students, locale);
  }, [iconInfos, displayInventory, needed, students, locale]);

  // Applies every active filter except `exclude`, so each filter's option list only hides
  // zero-match values under the *other* filters, not its own selection.
  const filterState: EntryFilterState = {
    selectedTypes,
    selectedSchools,
    selectedRoles,
    selectedSquads,
    selectedShopCategories,
    selectedTags,
    selectedRarities,
    onlyNonZero,
    displayMode,
    searchQuery,
    matcher,
    poolVisibleKeys,
  };

  const filterDeps = [
    entries,
    selectedTypes,
    selectedSchools,
    selectedRoles,
    selectedSquads,
    selectedShopCategories,
    selectedTags,
    selectedRarities,
    onlyNonZero,
    displayMode,
    searchQuery,
    matcher,
    poolVisibleKeys,
  ] as const;

  const schoolOptions = useMemo(() => buildSchoolOptions(entries, filterState, t_club), filterDeps);

  // Only show ShopCategory/Tag/rarity values that actually appear under the other active
  // filters — no fixed option list exists to fall back to.
  const shopCategoryOptions = useMemo(() => buildShopCategoryOptions(entries, filterState), filterDeps);

  const tagOptions = useMemo(() => buildTagOptions(entries, filterState), filterDeps);

  // Rarity is 0-based here (item/equipment rarity tier, distinct from the 1-5 student star scale).
  const rarityOptions = useMemo(() => buildRarityOptions(entries, filterState), filterDeps);

  const filteredEntries = useMemo(() => listFilteredEntries(entries, filterState, sortBy, fungibleDeficitByKey), [...filterDeps, sortBy, fungibleDeficitByKey]);

  const gridKey = [
    sortBy,
    displayMode,
    onlyNonZero,
    searchQuery,
    [...selectedTypes].sort().join(','),
    [...selectedSchools].sort().join(','),
    [...selectedRoles].sort().join(','),
    [...selectedSquads].sort().join(','),
    [...selectedShopCategories].sort().join(','),
    [...selectedTags].sort().join(','),
    [...selectedRarities].sort().join(','),
  ].join('|');

  // Same filtered list, split into one section per student — only meaningful with target data,
  // and scoped to the plans checked so it matches the aggregate `needed` above.
  const studentGroups = useMemo(() => {
    if (!showTarget || !groupByStudent) return [];
    const selectedPlans = growthPlans.filter((p) => p.isSelected);
    return buildStudentResourceGroups(selectedPlans, students, filteredEntries, displayInventory);
  }, [showTarget, groupByStudent, growthPlans, students, filteredEntries, displayInventory]);

  const eventData: EventData | null = useMemo(() => {
    if (!iconInfos) return null;
    return {
      season: { Name: '', EventContentOpenTime: '', EventContentCloseTime: '', ExtensionTime: '', EventContentTypeStr: [] },
      icons: iconInfos,
    };
  }, [iconInfos]);

  interface MatrixConfig {
    rows: MatrixAxisEntry[];
    cols: MatrixAxisEntry[];
    getItemKey: (rowKey: string, colKey: string) => string | null;
  }

  const getMatrixConfig = (itemType: ItemType): MatrixConfig | null => {
    if (itemType === 'Equipment') {
      const tiers = Array.from({ length: 10 }, (_, i) => i + 1);
      return {
        rows: EQUIP_CATEGORIES.map((cat) => ({ key: cat, label: EQUIP_LABELS[cat] })),
        cols: tiers.map((tier) => ({ key: String(tier), label: `T${tier}` })),
        getItemKey: (rowKey, colKey) => {
          const ids = equipmentId[rowKey as keyof typeof equipmentId];
          const id = ids?.[Number(colKey) - 1];
          return id ? `Equipment_${id}` : null;
        },
      };
    }
    if (itemType === 'TacticalBD' || itemType === 'TechNote') {
      const base = itemType === 'TacticalBD' ? 3000 : 4000;
      return {
        rows: BD_NOTE_SCHOOL_ORDER.map((school, i) => ({ key: String(i), label: t_club(school) })),
        cols: BD_NOTE_GRADES.map((grade) => ({ key: String(grade), label: BD_NOTE_GRADE_LABEL[grade] })),
        getItemKey: (rowKey, colKey) => getBdNoteItemKey(base, Number(rowKey), Number(colKey) as BdNoteGrade),
      };
    }
    if (itemType === 'Opart') {
      const opartEntries = entries.filter((e) => e.itemType === 'Opart');
      const entryByKey = new Map(opartEntries.map((e) => [e.key, e]));
      const bases = listOpartSeriesBases(opartEntries.map((e) => Number(e.id)));
      return {
        // Label each series by its top-tier item name (falls back to the lowest tier).
        rows: bases.map((base) => ({ key: String(base), label: (entryByKey.get(getOpartItemKey(base, 3)) ?? entryByKey.get(getOpartItemKey(base, 0)))?.name ?? String(base) })),
        cols: OPART_TIERS.map((tier) => ({ key: String(tier), label: `T${tier + 1}` })),
        getItemKey: (rowKey, colKey) => {
          const key = getOpartItemKey(Number(rowKey), Number(colKey) as OpartTier);
          return entryByKey.has(key) ? key : null;
        },
      };
    }
    return null;
  };

  const renderMatrix = (itemType: ItemType) => {
    if (!eventData) return null;
    const config = getMatrixConfig(itemType);
    if (!config) return null;
    return (
      <ResourceMatrix
        rows={config.rows}
        cols={config.cols}
        getItemKey={config.getItemKey}
        inventory={displayInventory}
        needed={needed}
        deficitByKey={fungibleDeficitByKey}
        diffByKey={fungibleDiffByKey}
        eventData={eventData}
        iconData={iconData}
        locale={locale}
        showTarget={showTarget}
        displayMode={displayMode}
        activeKey={editingKey}
        onEditItem={setEditingKey}
      />
    );
  };

  // The list currently being browsed — Tab / prev-next buttons cycle through this, whichever view
  // is active (matrix cells in row-major order, or the flat sorted/filtered grid).
  const navigableKeys = useMemo(
    () => buildNavigableKeys({ groupByStudent, studentGroups, showMatrix, singleMatrixType, filteredEntries, getMatrixConfig }),
    [groupByStudent, studentGroups, showMatrix, singleMatrixType, filteredEntries, entries, t_club],
  );

  const navigate = (direction: 1 | -1) => {
    if (!editingKey) return;
    const idx = navigableKeys.indexOf(editingKey);
    if (idx === -1) return;
    const nextIdx = (idx + direction + navigableKeys.length) % navigableKeys.length;
    setEditingKey(navigableKeys[nextIdx]);
    setExpandedOpen(false);
  };

  // Gift affection lookup only needs the full item catalog (see giftAffectionList.ts) — our
  // `eventData` already carries that, so this reuses the exact same logic as the rest of the app.
  const giftToStudentsMap = useMemo(() => buildEditingGiftMap({ editingKey, students, eventData }), [editingKey, students, eventData]);

  // undefined when the item isn't a gift at all — distinct from an empty array (a gift nobody likes)
  const editingGiftStudents = useMemo(() => listEditingGiftStudents({ editingKey, eventData, giftToStudentsMap }), [editingKey, eventData, giftToStudentsMap]);

  const editingPerStudentNeeds = useMemo(() => calcEditingPerStudentNeeds({ editingKey, editingGiftStudents, growthPlans, students }), [editingKey, editingGiftStudents, growthPlans, students]);

  // ALL students who use this material, regardless of active growth plan — only shown for Opart
  // and Eleph (deterministic 1:1 mapping). undefined = not applicable, hides the section.
  const editingAllUsers = useMemo(() => listEditingAllUsers({ editingKey, editingGiftStudents, entries, students }), [editingKey, editingGiftStudents, entries, students]);

  // ─── Merged for the pieces migrated from planner/resources ────────────────
  // Those components (data.ts `Student`) expect numeric keys; the catalog logic above keeps
  // using the raw `students` state untouched.
  const studentsById = useMemo(() => studentsByNumericId({ detailOpen, students }), [detailOpen, students]);

  const raidSchedule = useMemo(() => (server === 'kr' ? krRaid : jpRaid), [server, krRaid, jpRaid]);
  const mfSchedule = useMemo(() => (server === 'kr' ? krMultifloor : jpMultifloor), [server, krMultifloor, jpMultifloor]);
  const allScheduleItems = useMemo(() => [...raidSchedule, ...mfSchedule], [raidSchedule, mfSchedule]);
  const getScheduleTitle = useCallback((item: ScheduleItemV2) => getItemTitle(item, locale, i18n as I18nLike), [locale, i18n]);
  const dropSources = useEventDropSources(editingKey, server === 'kr' ? krEvents : jpEvents, startDate, getScheduleTitle);

  const raidConfigItems = useMemo(() => selectRaidConfigItems(raidSchedule, startDate), [raidSchedule, startDate]);

  const jfdConfigItems = useMemo(() => selectJfdConfigItems(raidSchedule, startDate), [raidSchedule, startDate]);

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

  const firstPickupByStudent = useMemo(() => buildFirstPickupByStudent({ server, krPickup, jpPickup }), [server, krPickup, jpPickup]);

  const renderItemIcon = useCallback(
    (itemKey: string, size: number, amount: number) => {
      if (!iconData || !eventData) return null;
      const i = itemKey.lastIndexOf('_');
      if (i < 0) return null;
      return <ItemIcon type={itemKey.slice(0, i)} itemId={itemKey.slice(i + 1)} amount={amount} size={size} eventData={eventData} iconData={iconData} />;
    },
    [iconData, eventData],
  );

  const { allCalendarSources } = useCalendarSources({
    trackingItems: projection.trackingItems,
    purchaseEvents,
    stageFarmingPlans,
    campaigns,
    server,
    selectedItemKey: editingKey,
    itemIconInfo: iconInfos,
    locale,
    setStageFarmingRunsRange,
    removeStageFarmingPlan,
    setSelectedPurchaseDate,
  });

  const handleSelectItem = useCallback(
    (key: string) => {
      setEditingKey(key);
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
      if (src?.itemKey) setEditingKey(src.itemKey);
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

  const panelEntryList = useMemo(
    () => buildPanelEntryList({ editingKey, studentsById, growthPlans, firstPickupByStudent, iconInfos, locale, targetGoals, materialInventory, trackingItems: projection.trackingItems }),
    [editingKey, studentsById, growthPlans, firstPickupByStudent, iconInfos, locale, targetGoals, materialInventory, projection.trackingItems],
  );

  const availableStages = useMemo(() => findAvailableStages({ editingKey, campaigns, server }), [editingKey, campaigns, server]);

  const inlinePanelFilterTypes = useMemo(() => buildInlinePanelFilterTypes({ availableStages, panelEntryList, iconInfos, t_planner }), [availableStages, panelEntryList, iconInfos, t_planner]);

  const filteredPanelEntries = useMemo(() => filterPanelEntries(panelEntryList, inlinePanelHiddenTypes, iconInfos), [panelEntryList, inlinePanelHiddenTypes, iconInfos]);

  const scheduleBarItems = useMemo(
    () => buildScheduleBarItems({ server, krEvents, jpEvents, raidSchedule, mfSchedule, krCampaign, jpCampaign, startDate, getScheduleTitle }),
    [server, krEvents, jpEvents, raidSchedule, mfSchedule, krCampaign, jpCampaign, startDate, getScheduleTitle],
  );

  const filteredScheduleBarItems = useMemo(() => filterScheduleBarItems(scheduleBarItems, scheduleFilters), [scheduleBarItems, scheduleFilters]);

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
    selectedItemKey: editingKey,
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
    iconInfoData: iconInfos,
  };

  useEffect(() => {
    setInlinePanelHiddenTypes(new Set());
  }, [editingKey]);
  useEffect(() => {
    setShowPurchasePanel(true);
  }, [selectedRangeMin, selectedRangeMax]);

  const canExpandIncome = availableStages.length > 0 || panelEntryList.length > 0;

  const openExpanded = () => {
    if (!editingKey) setEditingKey('Item_23');
    setExpandedOpen(true);
  };

  return (
    <div className="p-2 sm:p-4">
      {returnTo && (
        <Link to={returnTo} className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 mb-2">
          <FaChevronLeft size={10} /> {t_planner('itemScanner.backButton')}
        </Link>
      )}
      <PageHeader title={t_planner('inventory.title')} badge="BETA" description={t_planner('inventory.description')} />

      <div className="flex items-center gap-2 flex-wrap mb-3">
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
        <button
          onClick={openExpanded}
          className="px-2.5 py-1.5 text-xs font-semibold rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
        >
          {t_resources('tabs.income')}
        </button>
        <button
          onClick={() => setShowStudentGoals(true)}
          className="px-2.5 py-1.5 text-xs font-semibold rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
        >
          {t_resources('tabs.students')}
        </button>
      </div>

      {loading || !eventData ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 py-10 text-center">{t_ui('loading')}</p>
      ) : (
        <>
          <InventoryFilterBar
            searchQuery={searchQuery}
            onChangeSearchQuery={setSearchQuery}
            selectedTypes={selectedTypes}
            onChangeTypes={handleChangeTypes}
            scannerLink={itemScannerLink}
            sortBy={sortBy}
            onChangeSortBy={setSortBy}
            showTarget={showTarget}
            onToggleShowTarget={handleToggleShowTarget}
            onlyNonZero={onlyNonZero}
            onToggleOnlyNonZero={setOnlyNonZero}
            carryUp={carryUp}
            onToggleCarryUp={setCarryUp}
            displayMode={displayMode}
            onChangeDisplayMode={setDisplayMode}
            growthPlans={growthPlans}
            students={students}
            onTogglePlan={togglePlanSelection}
            onSelectAllPlans={selectAllPlans}
            matrixAvailable={singleMatrixType !== undefined}
            showMatrix={showMatrix && singleMatrixType !== undefined}
            onToggleMatrix={handleToggleMatrix}
            groupByStudent={groupByStudent}
            onToggleGroupByStudent={handleToggleGroupByStudent}
            showTable={showTable}
            onToggleTable={() => setShowTable((v) => !v)}
            schoolOptions={schoolOptions}
            selectedSchools={selectedSchools}
            onChangeSchools={setSelectedSchools}
            selectedRoles={selectedRoles}
            onChangeRoles={setSelectedRoles}
            selectedSquads={selectedSquads}
            onChangeSquads={setSelectedSquads}
            shopCategoryOptions={shopCategoryOptions}
            selectedShopCategories={selectedShopCategories}
            onChangeShopCategories={setSelectedShopCategories}
            tagOptions={tagOptions}
            selectedTags={selectedTags}
            onChangeTags={setSelectedTags}
            rarityOptions={rarityOptions}
            selectedRarities={selectedRarities}
            onChangeRarities={setSelectedRarities}
          />

          <GoalSummaryRow pools={goalSummaryPools} iconData={iconData} />

          {showTable && showTarget ? (
            <div className="space-y-2">
              <MaterialLevelToggle value={tableLevel} onChange={setTableLevel} className="ml-auto w-fit" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {filteredEntries
                  .filter((entry) => entry.needed > 0)
                  .map((entry) => (
                    <MaterialItemTable
                      key={entry.key}
                      row={buildMaterialRow(entry.key, entry.needed, entry.owned, projection.expectedIncome[entry.key])}
                      eventData={eventData}
                      iconData={iconData}
                      locale={locale}
                      level={tableLevel}
                      onOpenItem={setEditingKey}
                    />
                  ))}
              </div>
            </div>
          ) : groupByStudent ? (
            <GroupedSections
              emptyMessage={t_planner('inventory.emptyMessage')}
              sections={studentGroups.map((group) => ({
                key: String(group.studentId),
                header: (
                  <>
                    <div className="w-10 shrink-0">
                      <StudentIcon character={{ id: group.studentId } as Character} student={students[group.studentId]} />
                    </div>
                    <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">{group.name}</span>
                  </>
                ),
                content: (
                  <div className="space-y-1.5">
                    {group.uwDemand && (
                      // Shared uwGrowth materials aren't repeated per student (see buildStudentResourceGroups) —
                      // just the XP demand and which material series (by its icon) would grant this student's bonus.
                      <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                        <ItemIcon type="Equipment" itemId={String(UW_MATERIAL_SERIES[group.uwDemand.series].baseId)} amount={0} size={16} eventData={eventData} iconData={iconData} />
                        <span className="tabular-nums">{Math.ceil(group.uwDemand.requiredXp).toLocaleString()} XP</span>
                      </div>
                    )}
                    <ResourceGrid
                      entries={group.entries}
                      eventData={eventData}
                      iconData={iconData}
                      locale={locale}
                      showTarget={showTarget}
                      displayMode={displayMode}
                      activeKey={editingKey}
                      onEditItem={setEditingKey}
                      fungibleDeficitByKey={group.fungibleDeficitByKey}
                      fungibleDiffByKey={group.fungibleDiffByKey}
                      fungibleOwnedByKey={carryUp ? fungibleOwnedByKey : undefined}
                    />
                  </div>
                ),
              }))}
            />
          ) : showMatrix && singleMatrixType !== undefined ? (
            <>
              {renderMatrix(singleMatrixType)}
              {singleMatrixType === 'Equipment' && (
                // Show non-blueprint materials separately because they have no slot/tier coordinates.
                <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 mt-3">
                  <ResourceGrid
                    entries={filteredEntries.filter((e) => NON_BLUEPRINT_EQUIPMENT_KEYS.has(e.key))}
                    eventData={eventData}
                    iconData={iconData}
                    locale={locale}
                    showTarget={showTarget}
                    displayMode={displayMode}
                    activeKey={editingKey}
                    onEditItem={setEditingKey}
                    fungibleDeficitByKey={fungibleDeficitByKey}
                    fungibleDiffByKey={fungibleDiffByKey}
                    fungibleOwnedByKey={carryUp ? fungibleOwnedByKey : undefined}
                  />
                </div>
              )}
            </>
          ) : (
            <ResourceGrid
              key={gridKey}
              entries={filteredEntries}
              eventData={eventData}
              iconData={iconData}
              locale={locale}
              showTarget={showTarget}
              displayMode={displayMode}
              activeKey={editingKey}
              onEditItem={setEditingKey}
              fungibleDeficitByKey={fungibleDeficitByKey}
              fungibleDiffByKey={fungibleDiffByKey}
              fungibleOwnedByKey={carryUp ? fungibleOwnedByKey : undefined}
            />
          )}

          {editingKey &&
            (() => {
              const parts = splitItemKey(editingKey);
              if (!parts) return null;
              const [category, id] = parts;
              return (
                <QuantityEditSheet
                  itemKey={editingKey}
                  label={getItemName(editingKey, eventData.icons, locale)}
                  description={getItemDescription(editingKey, eventData.icons, locale) ?? undefined}
                  helperText={showTarget && (needed[editingKey] ?? 0) > 0 ? t_planner('affectionTab.item.need', { counts: (needed[editingKey] ?? 0).toLocaleString() }) : undefined}
                  icon={<ItemIcon type={category} itemId={id} amount={''} size={iconSize} eventData={eventData} iconData={iconData} />}
                  value={displayInventory[editingKey] ?? 0}
                  onChange={(v) => scheduleInventoryCommit(editingKey, v)}
                  onClose={() => {
                    flushAllPendingInventoryCommits();
                    setEditingKey(null);
                    setExpandedOpen(false);
                  }}
                  onPrev={
                    navigableKeys.length > 1
                      ? () => {
                          flushAllPendingInventoryCommits();
                          navigate(-1);
                        }
                      : undefined
                  }
                  onNext={() => {
                    flushAllPendingInventoryCommits();
                    navigate(1);
                  }}
                  perStudentNeeds={editingPerStudentNeeds}
                  allUsers={editingAllUsers}
                  giftStudents={editingGiftStudents}
                  projectionSection={
                    dropSources.length > 0 || autoBuyShops.length > 0 || isMultifloorKey || (isModeledKey && iconInfos) ? (
                      <>
                        {dropSources.length > 0 && (
                          <div className="px-4 pt-3">
                            <ItemDropList sources={dropSources} />
                          </div>
                        )}
                        {isMultifloorKey && (
                          <div className="px-4 pt-3">
                            <MultifloorFloorInput value={multifloorDefaultMaxFloor} max={multifloorFloorCap} onChange={(floor) => updatePlanStore({ multifloorDefaultMaxFloor: floor })} />
                          </div>
                        )}
                        {editingKey && autoBuyShops.length > 0 && (
                          <div className="px-4 pt-3">
                            <ShopAutoBuyToggle
                              checked={!!autoBuyShopItems?.[editingKey]}
                              onChange={(checked) => updatePlanStore({ autoBuyShopItems: { ...autoBuyShopItems, [editingKey]: checked } })}
                            />
                          </div>
                        )}
                        {isModeledKey && iconInfos && (
                          <>
                            <div className="px-4 pt-3">
                              <IncomeAssumptions
                                assumptions={assumeAllIncome}
                                onChange={(next) => updatePlanStore({ assumeAllIncome: next })}
                                eventIncomeMode={eventIncomeMode}
                                onEventIncomeModeChange={(mode) => updatePlanStore({ eventIncomeMode: mode })}
                              />
                            </div>
                            <ResourceTimelinePanel
                              projection={projection}
                              selectedKey={editingKey}
                              gachaEligmaPercentile={gachaEligmaPercentile}
                              gachaEligmaUseMean={gachaEligmaUseMean}
                              onSetPercentile={setGachaEligmaPercentile}
                              onSetUseMean={setGachaEligmaUseMean}
                              iconInfos={iconInfos}
                              iconData={iconData}
                              locale={locale}
                            />
                          </>
                        )}
                      </>
                    ) : undefined
                  }
                  expandedLabel={t_resources('tabs.income')}
                  expanded={expandedOpen}
                  onExpandChange={setExpandedOpen}
                  expandedContent={
                    canExpandIncome ? (
                      <div className="space-y-4 py-4">
                        {iconInfos && (
                          <div className="px-4">
                            <TrackedItemsBar
                              trackingItems={projection.trackingItems}
                              selectedItemKey={editingKey}
                              iconInfos={iconInfos}
                              studentsRecord={studentsById}
                              locale={locale}
                              onSelectSearchResult={handleSelectSearchResult}
                              onSelectItem={handleSelectItem}
                              renderItemIcon={renderItemIcon}
                            />
                          </div>
                        )}
                        <div className="px-4">
                          <ItemIncomeSection
                            selectedItemKey={editingKey}
                            pvp={{ pvpAverageRank, pvpDailyDefenseWins, pvpExtraWeeklyIncome, onUpdate: (p) => updatePlanStore(p) }}
                            jfd={{ jfdDefaultDailyCoins, jfdPerPeriodCoins, jfdConfigItems, onUpdate: (p) => updatePlanStore(p) }}
                            raid={{
                              isRaid: editingKey === 'Item_7' || editingKey === 'Item_9',
                              raidGlobalConfig,
                              eraidGlobalConfig,
                              raidDetailConfigs,
                              raidConfigItems,
                              setRaidDetailConfig,
                              onUpdate: (p) => updatePlanStore(p),
                            }}
                            expertPermit={{ expertPermitMode, expertPermitWeeklyMax, onUpdate: (p) => updatePlanStore(p) }}
                            wb={{ multifloorDefaultMaxFloor, multifloorMaxFloors, mfSchedule, rewards: multifloorRewards, server, onUpdate: (p) => updatePlanStore(p) }}
                          />
                        </div>
                        <ScheduleSection {...scheduleSectionProps} />
                      </div>
                    ) : undefined
                  }
                />
              );
            })()}

          {showStudentGoals && (
            <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-0 sm:p-4" onClick={() => setShowStudentGoals(false)}>
              <div
                className="relative w-full sm:max-w-5xl h-[95vh] sm:h-[85vh] bg-white dark:bg-neutral-900 border-t sm:border border-neutral-200 dark:border-neutral-700 rounded-t-xl sm:rounded-lg flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 p-4 pb-3 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
                  <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{t_resources('tabs.students')}</h2>
                  <button onClick={() => setShowStudentGoals(false)} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200" aria-label={t_ui('close')}>
                    <FaTimes size={14} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
                  <div className="border-b border-neutral-200 dark:border-neutral-700 pb-4 mb-4">
                    <GoalStatusSummary
                      statuses={projection.studentGoalStatuses}
                      tacticalCoinStatus={projection.tacticalCoinStatus}
                      studentsRecord={studentsById}
                      onSelectResource={(key) => {
                        setEditingKey(key);
                        setShowStudentGoals(false);
                      }}
                    />
                  </div>
                  <StudentGoalsTab
                    selectedItemKey={editingKey}
                    activePlans={projection.activePlans}
                    allGrowthPlans={growthPlans}
                    studentsRecord={studentsById}
                    targetGoals={targetGoals}
                    contentItems={contentItems}
                    gachaStudentStats={gachaResult?.studentStats}
                    onSelectItem={(key) => {
                      setEditingKey(key);
                      setShowStudentGoals(false);
                    }}
                    onAddGoal={addTargetGoal}
                    onUpdateGoal={updateTargetGoal}
                    onRemoveGoal={removeTargetGoal}
                    onClearStudent={() => {
                      setEditingKey(null);
                      setSelectedCalendarKey('');
                      setSelectedPurchaseDate(null);
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const handle: AppHandle = {
  preload: () => studentSheetPreloadLinks(),
};
