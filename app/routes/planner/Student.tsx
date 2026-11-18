import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCompressArrowsAlt, FaExpandArrowsAlt, FaSearch, FaPlus, FaArrowLeft, FaSortAmountDown, FaSortAmountUp, FaTable, FaTh, FaList } from 'react-icons/fa';
import { data, Link, useLoaderData, useLocation, type LoaderFunctionArgs } from 'react-router';

// Utils & Stores
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { calculatedGrowthNeeds } from '~/utils/calculatedGrowthNeeds';
import { buildUwDemandFromPlans, calcUwMaterialXp } from '~/utils/uwMaterialXp';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import { cdn } from '~/utils/cdn';
import { getInstance } from '~/middleware/i18next';

// Components
import { MaterialNeedsSection } from '~/components/student/MaterialNeedsSection';
import { StudentGrowthPlanCard } from '~/components/student/StudentGrowthPlanCard';
import { createLinkHreflang, createMetaDescriptor } from '~/components/shell/head';
import { PageHeader } from '~/components/common/PageHeader';
import { StudentGridCard } from '~/components/student/StudentGridCard';
import { FaCopy, FaFilter, FaRegSquareCheck } from 'react-icons/fa6';

// Types
import type { ContentItem, EventData, IconData, Student as PlannerStudent, StudentData } from '~/types/plannerData';
import type { Student } from '~/types/data';
import type { GrowthPlan } from '~/types/growthPlan';
import type { Route } from './+types/Student';
import { StudentSpreadsheetView } from '~/features/students/spreadsheet/StudentSpreadsheetView';
import { SpreadsheetCsvTools } from '~/features/students/spreadsheet/SpreadsheetCsvTools';
import ExportImportPanel from '~/components/common/ExportImportPanel';
import { useSearchMatcher } from '~/hooks/useSearchMatcher';
import ContentGroupedStudentView from '~/components/student/ContentGroupedStudentView';
import { loadScheduleDataV2 } from '~/utils/calender.data.v2';
import { getItemLabel, getItemTitle } from '~/utils/scheduleDisplay';
import { isUnrecruited } from '~/utils/student/recruitState';
import { useExpectedIncome } from '~/hooks/useExpectedIncome';
import { addSkillOptionCounts, countActiveSkillFilterGroups, createSkillFilter, createSkillOptionCounts, matchesSkillFilter } from '~/features/students/skillFilter/skillFilter';
import { StudentAdvancedFilterModal, type StudentAdvancedFilters } from '~/features/students/components/StudentAdvancedFilterModal';
import { CombatStylePortrait } from '~/components/student/CombatStylePortrait';
import { getCombatStyleGroupRosterIds, getCombatStylePlanGroupId, getCombatStyleRepresentativeId, isCombatStyleFormOne } from '~/utils/combatStyle';
import { filterAndSortPlans, getBaseUnplannedStudents, listUnplannedStudents, type StudentSortOrder } from '~/features/students/logic/studentList';
import { PROGRESS_FILTER_FIELDS, type ProgressFilterKey, STATIC_FILTER_FIELDS, type FilterableStudent, type StaticFilterKey, hasGrowthGoal } from '~/features/students/logic/studentFilterFields';
import { studentSheetPreloadLinks } from '~/utils/iconSheet';
import type { AppHandle } from '~/types/link';

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const krData = loadScheduleDataV2({ server: 'kr', tracksToLoad: ['raid', 'multifloor', 'event'] });
  return data({
    siteTitle: i18n.t('common:title'),
    title: i18n.t('ui:studentGrowthPlanner'),
    description: i18n.t('planner:page.description.studentGrowthPlanner'),
    krRaid: krData.tracks.raid,
    krMultifloor: krData.tracks.multifloor,
    krEvents: krData.tracks.event,
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/equipment.webp');
}

export function links() {
  return [...createLinkHreflang('/planner/students')];
}

export const StudentPlannerPage = () => {
  const [allStudents, setAllStudents] = useState<StudentData>({});
  const [iconData, setIconData] = useState<IconData>({});
  const [iconInfoData, setIconInfoData] = useState<EventData['icons'] | null>(null);
  const [loading, setLoading] = useState(true);

  // UI State
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [selectedPlanUuid, setSelectedPlanUuid] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<StudentAdvancedFilters>({
    goalsOnly: false,
    unrecruitedOnly: false,
    schools: new Set(),
    attackTypes: new Set(),
    defenseTypes: new Set(),
    squadTypes: new Set(),
    tacticRoles: new Set(),
    recruitTypes: new Set(),
    starGrades: new Set(),
    levelRanges: new Set(),
    affectionRanges: new Set(),
    skill: createSkillFilter(),
  });

  const [sortOrder, setSortOrder] = useState<StudentSortOrder>('date');
  const [sortReversed, setSortReversed] = useState(false);
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const location = useLocation();
  // Deep-linked via Link `state={{ view: 'table' }}` (e.g. gacha planner's shortcut) to land on the table view.
  const [viewMode, setViewMode] = useState<'card' | 'table' | 'content'>(() => ((location.state as { view?: string } | null)?.view === 'table' ? 'table' : 'card'));

  const { t, i18n } = useTranslation('planner');
  // const { t: t_c } = useTranslation('common');
  const { t: t_ui } = useTranslation('ui');
  const { t: t_students } = useTranslation('students');
  const locale = i18n.language as Locale;
  const { growthPlans, addPlan, addPlanForStudent, selectAllPlans, setGrowthPlans, materialInventory } = useGlobalStore();
  const matcher = useSearchMatcher(locale);
  const { krRaid, krMultifloor, krEvents } = useLoaderData<typeof loader>();
  const today = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);
  const contentItems = useMemo((): ContentItem[] => {
    const items: ContentItem[] = [];
    for (const item of [...krRaid, ...krMultifloor]) {
      const date = item.startTime.slice(0, 10);
      if (date < today) continue;
      const idParts = item.id.split('-');
      const type = idParts[0] as 'raid' | 'eraid' | 'multifloor';
      const season = parseInt(idParts[1]);
      const prefix = type === 'raid' ? 'R' : type === 'eraid' ? 'E' : 'S';
      items.push({ id: item.id, type, prefix, season, typeLabel: getItemLabel(item, i18n) ?? type, bossTitle: getItemTitle(item, locale, i18n), date });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [krRaid, krMultifloor, today, locale, i18n]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [studentsRes, iconImgRes, iconInfoRes] = await Promise.all([
          fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)),
          fetch(cdn(`/ew/icon_img.json`)),
          fetch(cdn(`/ew/icon_info.json`)),
        ]);
        const students: StudentData = await studentsRes.json();
        setAllStudents(students);
        setIconData(await iconImgRes.json());
        setIconInfoData(await iconInfoRes.json());
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, [locale]);

  // Expected income of saved event plans and assumed raid/shop rewards; read-only, nothing is written back.
  const getTitle = useCallback((item: (typeof krEvents)[number]) => getItemTitle(item, locale, i18n), [locale, i18n]);
  const incomeByKey = useExpectedIncome({ server: 'kr', events: krEvents, raidItems: krRaid, multifloorItems: krMultifloor, today, getTitle });

  const selectedPlansCount = useMemo(() => growthPlans.filter((p) => p.isSelected).length, [growthPlans]);

  const totalNeeds = useMemo(() => {
    const activePlans = growthPlans.filter((p) => p.isSelected);
    return calculatedGrowthNeeds(activePlans, allStudents);
  }, [growthPlans, allStudents]);

  const unrecruitedPlans = useMemo(() => growthPlans.filter((p) => isUnrecruited(p)), [growthPlans]);

  // Weapon-type-bonus-aware unique weapon material coverage for the selected students, so the
  // uwGrowth badge below agrees with the inventory page's goal-comparison summary.
  const totalUwSummary = useMemo(() => {
    const activePlans = growthPlans.filter((p) => p.isSelected);
    const demand = buildUwDemandFromPlans(activePlans, allStudents);
    return calcUwMaterialXp(materialInventory, demand);
  }, [growthPlans, allStudents, materialInventory]);

  const studentOptions = useMemo(
    () =>
      Object.entries(allStudents)
        .filter(([id]) => !isCombatStyleFormOne(Number(id)))
        .sort(([, a], [, b]) => a.Name?.localeCompare(b.Name)),
    [allStudents],
  );
  const schoolOptions = useMemo(
    () =>
      [
        ...new Set(
          Object.values(allStudents)
            .map((student) => student.School)
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [allStudents],
  );
  const activeAdvancedFilterCount = useMemo(
    () =>
      Number(advancedFilters.goalsOnly) +
      Number(advancedFilters.unrecruitedOnly) +
      countActiveSkillFilterGroups(advancedFilters.skill) +
      Object.values(advancedFilters).filter((values) => values instanceof Set && values.size > 0).length,
    [advancedFilters],
  );
  // `exceptKey` skips one field's own constraint — used by the facet-count computation below to
  // ask "how many would match if only this field's filter were lifted" (all other filters still apply).
  const matchesAdvancedFilters = useMemo(
    () => (student: Student | undefined, exceptKey?: StaticFilterKey | 'skill') => {
      if (!student) return false;
      const filterStudent = student as FilterableStudent;
      for (const { key, value } of STATIC_FILTER_FIELDS) {
        if (key === exceptKey) continue;
        const set = advancedFilters[key] as ReadonlySet<string>;
        if (set.size > 0 && !set.has(value(filterStudent))) return false;
      }
      return exceptKey === 'skill' || matchesSkillFilter(filterStudent.Skills, advancedFilters.skill);
    },
    [advancedFilters],
  );

  // Combat-style pairs (e.g. Hoshino Battle) are separate roster ids with different skills and roles,
  // but the unplanned list shows only the canonical id, so a student matches if any of their styles does.
  const matchesAnyStyle = useMemo(
    () => (student: Student | undefined, exceptKey?: StaticFilterKey | 'skill') =>
      student !== undefined &&
      getCombatStyleGroupRosterIds(student.Id).some((id) => {
        const style = id === student.Id ? student : allStudents[id];
        return style !== undefined && matchesAdvancedFilters(style, exceptKey);
      }),
    [allStudents, matchesAdvancedFilters],
  );

  // Level/star-grade(incl. UW)/affection reflect the user's current progress on a plan, not a
  // static Student attribute, so they need GrowthPlan.current and can't be answered by
  // matchesAdvancedFilters. Students without a plan have no progress data, so they never match.
  const hasProgressFilters = useMemo(
    () => advancedFilters.starGrades.size > 0 || advancedFilters.levelRanges.size > 0 || advancedFilters.affectionRanges.size > 0,
    [advancedFilters.starGrades, advancedFilters.levelRanges, advancedFilters.affectionRanges],
  );
  const matchesProgressFilters = useMemo(
    () => (plan: GrowthPlan, exceptKey?: ProgressFilterKey) => {
      for (const { key, value } of PROGRESS_FILTER_FIELDS) {
        if (key === exceptKey) continue;
        const set = advancedFilters[key] as ReadonlySet<string>;
        if (set.size > 0) {
          const v = value(plan);
          if (!v || !set.has(v)) return false;
        }
      }
      return true;
    },
    [advancedFilters],
  );

  const selectedPlan = useMemo(() => growthPlans.find((p) => p.uuid === selectedPlanUuid), [growthPlans, selectedPlanUuid]);

  const filteredAndSortedPlans = useMemo(
    () =>
      filterAndSortPlans({
        growthPlans,
        searchTerm,
        sortOrder,
        sortReversed,
        allStudents,
        showOnlySelected,
        goalsOnly: advancedFilters.goalsOnly,
        unrecruitedOnly: advancedFilters.unrecruitedOnly,
        activeAdvancedFilterCount,
        matchesAdvancedFilters,
        hasProgressFilters,
        matchesProgressFilters,
        matcher,
      }),
    [
      growthPlans,
      searchTerm,
      sortOrder,
      sortReversed,
      allStudents,
      showOnlySelected,
      advancedFilters.goalsOnly,
      advancedFilters.unrecruitedOnly,
      activeAdvancedFilterCount,
      matchesAdvancedFilters,
      hasProgressFilters,
      matchesProgressFilters,
    ],
  );

  // The dedup-only base list (no filters/search applied yet) — reused by the facet-count
  // computation below so counts can be derived without re-deriving this from scratch.
  const baseUnplannedStudents = useMemo(() => getBaseUnplannedStudents(allStudents, growthPlans), [allStudents, growthPlans]);

  const unplannedStudents = useMemo(
    () =>
      listUnplannedStudents({
        allStudents,
        baseUnplannedStudents,
        matcher,
        matchesAdvancedFilters: matchesAnyStyle,
        searchTerm,
        sortOrder,
        sortReversed,
        showOnlySelected,
        goalsOnly: advancedFilters.goalsOnly,
        unrecruitedOnly: advancedFilters.unrecruitedOnly,
        hasProgressFilters,
      }),
    [
      allStudents,
      baseUnplannedStudents,
      matcher,
      matchesAnyStyle,
      searchTerm,
      sortOrder,
      sortReversed,
      showOnlySelected,
      advancedFilters.goalsOnly,
      advancedFilters.unrecruitedOnly,
      hasProgressFilters,
    ],
  );

  // One row per plan (student may be undefined for a blank plan with no studentId yet) plus one
  // row per still-unplanned student, so facet counts can be computed over the same universe the
  // page actually renders from (filteredAndSortedPlans + unplannedStudents), without duplicating
  // their sort/render logic.
  const filterRows = useMemo(
    () => [
      ...growthPlans.map((plan) => ({ student: plan.studentId ? allStudents[plan.studentId] : undefined, plan })),
      ...baseUnplannedStudents.map((student) => ({ student, plan: undefined as GrowthPlan | undefined })),
    ],
    [growthPlans, allStudents, baseUnplannedStudents],
  );

  // Per-option "how many would still match" counts for the advanced filter modal. For each
  // dimension, a row is counted under its own value there once every OTHER active filter passes —
  // mirroring exactly how filteredAndSortedPlans/unplannedStudents are filtered above, so the
  // counts shown always agree with what toggling that checkbox would actually produce.
  const filterOptionCounts = useMemo(() => {
    const counts: Record<StaticFilterKey | ProgressFilterKey, Record<string, number>> = {
      schools: {},
      attackTypes: {},
      defenseTypes: {},
      squadTypes: {},
      tacticRoles: {},
      recruitTypes: {},
      starGrades: {},
      levelRanges: {},
      affectionRanges: {},
    };
    const skillCounts = createSkillOptionCounts();
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch = (student: PlannerStudent | undefined) => {
      if (!term) return true;
      if (!student) return false;
      return matcher(student.Name, term) || matcher(student.PathName, term) || student.SearchTags.some((v) => matcher(v, term));
    };

    for (const row of filterRows) {
      if (showOnlySelected && !row.plan?.isSelected) continue;
      if (advancedFilters.goalsOnly && !(row.plan && row.plan.studentId !== null && hasGrowthGoal(row.plan))) continue;
      if (advancedFilters.unrecruitedOnly && !(row.plan && isUnrecruited(row.plan))) continue;
      if (!matchesSearch(row.student)) continue;

      if (row.student) {
        const matchesRow = row.plan ? matchesAdvancedFilters : matchesAnyStyle;
        for (const { key, value } of STATIC_FILTER_FIELDS) {
          if (!matchesRow(row.student, key)) continue;
          if (hasProgressFilters && !(row.plan && matchesProgressFilters(row.plan))) continue;
          const v = value(row.student);
          counts[key][v] = (counts[key][v] ?? 0) + 1;
        }
        if (matchesRow(row.student, 'skill') && !(hasProgressFilters && !(row.plan && matchesProgressFilters(row.plan)))) {
          const styles = row.plan ? [row.student] : getCombatStyleGroupRosterIds(row.student.Id).map((id) => allStudents[id]);
          addSkillOptionCounts(
            skillCounts,
            styles.map((style) => (style as FilterableStudent | undefined)?.Skills),
            advancedFilters.skill,
          );
        }
      }

      if (row.plan) {
        for (const { key, value } of PROGRESS_FILTER_FIELDS) {
          if (!matchesProgressFilters(row.plan, key)) continue;
          if (activeAdvancedFilterCount > 0 && !matchesAdvancedFilters(row.student)) continue;
          const v = value(row.plan);
          if (!v) continue;
          counts[key][v] = (counts[key][v] ?? 0) + 1;
        }
      }
    }
    return { counts, skillCounts };
  }, [filterRows, allStudents, advancedFilters, matchesAdvancedFilters, matchesAnyStyle, matchesProgressFilters, hasProgressFilters, activeAdvancedFilterCount, searchTerm, showOnlySelected, matcher]);

  if (selectedPlanUuid && selectedPlan) {
    return (
      <div className="bg-neutral-100 dark:bg-neutral-900 min-h-screen p-2 md:p-4">
        <div>
          <button onClick={() => setSelectedPlanUuid(null)} className="flex items-center gap-2 mb-4 text-neutral-600 dark:text-neutral-300 hover:text-blue-500 transition-colors font-medium">
            <FaArrowLeft size={14} />
            {t('ui.backToPlanner')}
          </button>

          <StudentGrowthPlanCard
            plan={selectedPlan}
            allStudents={allStudents}
            studentOptions={studentOptions}
            iconData={iconData}
            eventData={{ icons: iconInfoData } as EventData}
            contentItems={contentItems}
            onClose={() => setSelectedPlanUuid(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 top-14">
        <div className="px-4 py-3">
          <div className="flex flex-col gap-3">
            <PageHeader title={t_ui('studentGrowthPlanner')} description={t('page.description.studentGrowthPlanner')} className="mb-0" />
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <Link to={localeLink(locale, '/students')} className="font-semibold underline">
                {t('ui.studentsPageMoved')}
              </Link>
            </p>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[140px] max-w-xs">
                  <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs" />
                  <input
                    type="text"
                    placeholder={t_ui('searchStudents')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white dark:bg-neutral-800 dark:border-neutral-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setIsAdvancedFilterOpen(true)}
                  aria-label={t_ui('filter')}
                  title={t_ui('filter')}
                  className={`shrink-0 rounded-lg border p-2 text-xs transition-colors ${activeAdvancedFilterCount > 0 ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200' : 'border-neutral-200 bg-white text-neutral-600 hover:border-blue-400 hover:text-blue-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-blue-500 dark:hover:text-blue-400'}`}
                >
                  <span className="relative block">
                    <FaFilter size={13} />
                    {activeAdvancedFilterCount > 0 && (
                      <span className="absolute -right-2 -top-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-600 px-0.5 text-[9px] font-bold text-white">
                        {activeAdvancedFilterCount}
                      </span>
                    )}
                  </span>
                </button>

                <div className="flex items-center bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden divide-x divide-neutral-200 dark:divide-neutral-700 shrink-0">
                  <button
                    onClick={() => selectAllPlans(true)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1.5 transition-colors"
                    title={t_ui('selectAll')}
                    aria-label={t_ui('selectAll')}
                  >
                    <span className="sm:hidden">{t_ui('all')}</span>
                    <span className="hidden sm:inline">{t_ui('selectAll')}</span>
                  </button>
                  <button
                    onClick={() => selectAllPlans(false)}
                    className="text-xs font-bold text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 px-2 py-1.5 transition-colors"
                    title={t_ui('deselectAll')}
                    aria-label={t_ui('deselectAll')}
                  >
                    <span className="sm:hidden">{t_ui('none')}</span>
                    <span className="hidden sm:inline">{t_ui('deselectAll')}</span>
                  </button>
                  <label className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={showOnlySelected}
                      onChange={(e) => setShowOnlySelected(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3 cursor-pointer"
                    />
                    <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 whitespace-nowrap">{t('ui.showSelectedOnly', 'Focus students only')}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setSortReversed((prev) => !prev)}
                    className="px-2 py-1.5 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
                    title={sortReversed ? t('ui.sortOrderDesc') : t('ui.sortOrderAsc')}
                    aria-label={sortReversed ? t('ui.sortOrderDesc') : t('ui.sortOrderAsc')}
                  >
                    {sortReversed ? <FaSortAmountUp className="text-xs" /> : <FaSortAmountDown className="text-xs" />}
                  </button>
                  <div className="flex items-center px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors">
                    <select
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value as StudentSortOrder)}
                      className="w-24 text-xs ios-compact-12 font-medium bg-transparent border-none focus:ring-0 cursor-pointer text-neutral-700 dark:text-neutral-200 pr-5 pl-0 truncate"
                      aria-label={t('ui.sortCriteria')}
                    >
                      <option value="date">{t('ui.sortByDate')}</option>
                      <option value="acquired">{t('ui.sortByAcquired')}</option>
                      <option value="name">{t_ui('name')}</option>
                      <option value="currentLevel">{t('ui.sortByCurrentLevel')}</option>
                      <option value="level">{t('ui.sortByLevel')}</option>
                      <option value="affection">{t('ui.sortByAffection')}</option>
                      <option value="currentStar">{t('ui.sortByCurrentStar', { defaultValue: 'Current Rank' })}</option>
                      <option value="targetStar">{t('ui.sortByTargetStar', { defaultValue: 'Target Rank' })}</option>
                      <option value="id">{t('ui.sortById', 'By Id')}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 justify-between">
                <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                  <span>{t('ui.totalStudentsCount', { count: studentOptions.length })}</span>
                  <span>·</span>
                  <span>{t('ui.registeredPlansCount', { count: growthPlans.length })}</span>
                  {unrecruitedPlans.length > 0 && (
                    <>
                      <span>·</span>
                      <span>{t('ui.unrecruitedCount', { count: unrecruitedPlans.length })}</span>
                    </>
                  )}
                  {(searchTerm.trim() !== '' || showOnlySelected || activeAdvancedFilterCount > 0) && (
                    <>
                      <span>·</span>
                      <span>{t('ui.filteredResultsCount', { count: filteredAndSortedPlans.length })}</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="flex items-center bg-neutral-100 dark:bg-neutral-700 rounded overflow-hidden divide-x divide-neutral-200 dark:divide-neutral-600">
                    {(
                      [
                        ['card', <FaTh size={12} />, t_students('planViews.cards')],
                        ['table', <FaTable size={12} />, t_ui('table')],
                        ['content', <FaList size={12} />, t_students('planViews.content')],
                      ] as const
                    ).map(([mode, icon, label]) => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 transition-colors whitespace-nowrap ${viewMode === mode ? 'bg-blue-600 dark:bg-blue-500 text-white' : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-600'}`}
                      >
                        {icon}
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                    className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 px-2.5 py-1.5 rounded transition-colors whitespace-nowrap"
                  >
                    {isSummaryExpanded ? <FaCompressArrowsAlt size={13} /> : <FaExpandArrowsAlt size={13} />}
                    {isSummaryExpanded ? t_ui('close') : `${t('ui.totalNeededTitle')} (${selectedPlansCount})`}
                  </button>
                  <Link
                    to={localeLink(locale, '/planner/equipment')}
                    className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 px-2.5 py-1.5 rounded transition-colors whitespace-nowrap"
                  >
                    <FaCopy size={13} />
                    {t('equipment.goToPlanner')}
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isSummaryExpanded ? 'max-h-[60vh] opacity-100 mt-4 pb-2' : 'max-h-0 opacity-0'}`}>
            {isSummaryExpanded && (
              <>
                <div className="mb-2 px-1 text-xs font-bold text-blue-600 dark:text-blue-400">
                  <FaRegSquareCheck className="inline-block mr-1.5 mb-0.5" />
                  {t('ui.summaryForSelected', { count: selectedPlansCount, defaultValue: `Materials needed for ${selectedPlansCount} focus students` })}
                </div>
                {Object.keys(totalNeeds).length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <MaterialNeedsSection
                      calculatedNeeds={totalNeeds}
                      eventData={{ icons: iconInfoData } as EventData}
                      iconData={iconData}
                      title={t('ui.totalNeededTitle')}
                      uwSummary={totalUwSummary}
                      incomeByKey={incomeByKey}
                    />
                  </div>
                ) : (
                  <div className="text-center text-sm text-neutral-400 py-4 italic bg-neutral-50 dark:bg-neutral-900/50 rounded-lg">
                    {selectedPlansCount === 0 ? t('ui.noStudentSelected', 'No focus students.') : t('ui.noMaterialsNeeded')}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        <div className="flex justify-center sm:justify-end">
          <button
            onClick={() => addPlan(null)}
            className="flex items-center justify-center gap-1.5 border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
          >
            <FaPlus size={10} />
            {t('ui.addStudentPlan', { defaultValue: 'Add Student Plan' })}
          </button>
        </div>

        {loading || !iconInfoData ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="w-5 h-5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-neutral-500">{t_ui('loading')}</p>
          </div>
        ) : viewMode === 'content' ? (
          <ContentGroupedStudentView contentItems={contentItems} growthPlans={growthPlans} allStudents={allStudents} matchesStudent={matchesAdvancedFilters} />
        ) : viewMode === 'table' ? (
          <div className="space-y-3">
            <SpreadsheetCsvTools growthPlans={growthPlans} allStudents={allStudents as Record<string, { Name: string }>} setGrowthPlans={setGrowthPlans} />
            <StudentSpreadsheetView allStudents={allStudents} searchTerm={searchTerm.trim()} showOnlySelected={showOnlySelected} matchesStudent={matchesAdvancedFilters} />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
              {filteredAndSortedPlans.map((plan) => (
                <div key={plan.uuid}>
                  <StudentGridCard plan={plan} studentInfo={plan.studentId ? allStudents[getCombatStylePlanGroupId(plan.studentId)] : null} onClick={() => setSelectedPlanUuid(plan.uuid)} />
                </div>
              ))}
            </div>

            {unplannedStudents.length > 0 && (
              <section className="border-t border-neutral-200 pt-4 dark:border-neutral-700">
                <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  <FaPlus size={10} />
                  <span>{t('ui.unplannedStudents')}</span>
                  <span className="tabular-nums">{unplannedStudents.length}</span>
                </div>
                <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
                  {unplannedStudents.map((student) => (
                    <button
                      key={student.Id}
                      type="button"
                      onClick={() => {
                        const minStar = student.StarGrade ?? 1;
                        const uuid = addPlanForStudent(getCombatStyleRepresentativeId(student.Id), minStar, minStar);
                        setSelectedPlanUuid(uuid);
                      }}
                      className="group flex flex-col border border-dashed border-neutral-300 bg-white p-1.5 text-left opacity-60 transition-[color,background-color,border-color,opacity] hover:border-blue-500 hover:bg-blue-50 hover:opacity-100 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-800"
                      title={student.Name}
                    >
                      <div
                        className="relative w-full overflow-hidden rounded-xl border border-black/10"
                        style={{
                          borderTop: `3px solid ${student.BulletType === 'Explosion' ? '#b62915' : student.BulletType === 'Pierce' ? '#bc8800' : student.BulletType === 'Mystic' ? '#206d9b' : student.BulletType === 'Sonic' ? '#9a46a8' : '#137973'}`,
                        }}
                      >
                        <div className="aspect-square w-full">
                          <CombatStylePortrait studentId={student.Id} alt={student.Name} />
                        </div>
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 pb-1 pt-5">
                          <p className="truncate text-center text-[10px] font-bold leading-none text-white" title={student.Name}>
                            {student.Name}
                          </p>
                        </div>
                      </div>
                      <span className="mt-auto flex items-center justify-center gap-1 pt-1.5 text-xs font-medium text-neutral-500 group-hover:text-blue-600 dark:text-neutral-400 dark:group-hover:text-blue-400">
                        <FaPlus size={10} />
                        {t('ui.addStudent', { defaultValue: 'Add Student' })}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <ExportImportPanel />
      <StudentAdvancedFilterModal
        open={isAdvancedFilterOpen}
        onClose={() => setIsAdvancedFilterOpen(false)}
        filters={advancedFilters}
        onChange={setAdvancedFilters}
        schools={schoolOptions}
        locale={locale}
        optionCounts={filterOptionCounts.counts}
        skillOptionCounts={filterOptionCounts.skillCounts}
      />
    </div>
  );
};

export default StudentPlannerPage;

export const handle: AppHandle = {
  preload: () => studentSheetPreloadLinks(),
};
