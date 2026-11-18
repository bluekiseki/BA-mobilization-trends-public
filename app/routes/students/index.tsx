import { CombatTypeIcon } from '~/components/common/CombatTypeIcon';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { HiXMark, HiArrowPath, HiChevronDown, HiOutlineAdjustmentsHorizontal, HiOutlineBarsArrowDown, HiOutlineBarsArrowUp } from 'react-icons/hi2';
import { Link, useLoaderData, useSearchParams, type ShouldRevalidateFunctionArgs } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Route } from './+types/index';
import { getInstance } from '~/middleware/i18next';
import { loadStudentSummaries } from '~/features/students/data/student.server';
import { studentSummary } from '~/features/students/data/publicStudent';
import { createLinkHreflang, createLocalizedUrl, createMetaDescriptor } from '~/components/shell/head';
import { CombatStylePortrait } from '~/components/student/CombatStylePortrait';
import { isCombatStyleFormOne } from '~/utils/combatStyle';
import type { Locale } from '~/utils/i18n/config';
import { useSearchMatcher } from '~/hooks/useSearchMatcher';
import { type_translation, typecolor } from '~/components/raid/raidToString';
import { getLocaleShortName } from '~/utils/i18n/config';
import { cdn } from '~/utils/cdn';
import { SkillFilterGroups } from '~/features/students/skillFilter/SkillFilterGroups';
import { addSkillOptionCounts, createSkillFilter, createSkillOptionCounts, isSkillFilterActive, matchesSkillFilter } from '~/features/students/skillFilter/skillFilter';
import { BULLET_COLORS, SQUAD_TYPE_COLORS } from '~/utils/gameColors';
import type { StudentData } from '~/types/plannerData';
import { StudentPlanSelect, StudentPlanStars, StudentPlanStats, StudentUnrecruitedLabel } from '~/features/students/components/StudentPlanBadge';
import { StudentPlanViews, type PlanView } from '~/features/students/components/StudentPlanViews';
import ExportImportPanel from '~/components/common/ExportImportPanel';
import { loadScheduleDataV2 } from '~/utils/calender.data.v2';
import { StudentFocusNeeds } from '~/features/students/components/StudentFocusNeeds';
import { DIRECTORY_SORTS, parseDirectorySort, PLAN_STAT_SORTS, sortDirectory } from '~/features/students/logic/directorySort';
import { matchesPlanFilter, PLAN_FILTERS, parsePlanFilter } from '~/features/students/logic/planFilter';
import { GRADES as TERRAIN_GRADES } from '~/features/students/components/StudentTraits';
import { matchesProgressFilter, PROGRESS_OPTIONS, PROGRESS_ROWS, type ProgressField } from '~/features/students/logic/progressFilter';
import { CARD_FIELDS } from '~/features/students/logic/cardFields';
import { useStudentLink } from '~/features/students/logic/useStudentLink';
import { useCardFields } from '~/features/students/logic/useCardFields';
import { usePlanLookup } from '~/features/students/logic/usePlanLookup';
import { ATTACK_TYPES, DEFENSE_TYPES } from '~/features/students/logic/studentFilterFields';
import { studentSearchScore } from '~/features/students/logic/studentSearch';
import { resolvePlanStats } from '~/utils/student/planStats';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { usePlannerAssets } from '~/features/students/logic/usePlannerAssets';
import { calculatedGrowthNeeds } from '~/utils/calculatedGrowthNeeds';
import { StarRating } from '~/components/student/StarRating';
import { studentSheetPreloadLinks } from '~/utils/iconSheet';
import type { AppHandle } from '~/types/link';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';

// Values missing from an explicit order go last, and everything else keeps the default string order
// Multi-select filters keep their chosen options comma-separated in one search param
// Unknown or repeated tokens from a hand-typed URL are dropped
const splitSelected = (value: string | null, options: readonly string[]) => [...new Set((value ?? '').split(','))].filter((token) => options.includes(token));
const rankIn = (order: readonly string[] | undefined, value: string) => (order ? (order.includes(value) ? order.indexOf(value) : order.length) : 0);
const needsSchedules = (query: URLSearchParams) => query.get('needs') === '1' || query.get('view') === 'content';

// Filtering and sorting are client-side, so search param changes only need the loader when the schedules become required
export function shouldRevalidate({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formMethod || currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate;
  return needsSchedules(nextUrl.searchParams) && !needsSchedules(currentUrl.searchParams);
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  const catalog = await loadStudentSummaries(request, locale);
  // Income estimates for the materials summary need the schedules; nobody else does
  const query = new URL(request.url).searchParams;
  const needs = needsSchedules(query);
  const kr = needs ? loadScheduleDataV2({ server: 'kr', tracksToLoad: ['raid', 'multifloor', 'event'] }).tracks : null;
  const jp = needs ? loadScheduleDataV2({ server: 'jp', tracksToLoad: ['raid', 'multifloor', 'event'] }).tracks : null;
  return {
    locale,
    schedules: kr && jp && { kr: { raid: kr.raid, multifloor: kr.multifloor, event: kr.event }, jp: { raid: jp.raid, multifloor: jp.multifloor, event: jp.event } },
    // A student with two combat styles is one card (the primary style); the detail page switches between the styles
    students: catalog.filter((student) => !isCombatStyleFormOne(student.Id)).map(studentSummary),
    title: i18n.t('students:title'),
    description: i18n.t('students:description'),
    siteTitle: i18n.t('common:title'),
  };
}
export function headers() {
  if (process.env.NODE_ENV === 'production') return { 'Cache-Control': CACHE_CONTROL_CONFIG };
}

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [{ title: 'Students' }];
  return [...createMetaDescriptor(`${data.title} | ${data.siteTitle}`, data.description), { tagName: 'link', rel: 'canonical', href: createLocalizedUrl(data.locale, '/students') }];
}
export function links() {
  return createLinkHreflang('/students');
}

const fieldClass =
  'h-8 w-full rounded border border-neutral-300 bg-white px-2 text-sm placeholder:text-neutral-400 focus:border-ba-btn-blue-dark focus:outline-none focus:ring-2 focus:ring-ba-btn-blue/40 dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:text-neutral-500';

export default function StudentDirectory() {
  const { students, locale, schedules } = useLoaderData<typeof loader>();
  const { t } = useTranslation(['students', 'ui', 'planner']);
  const { t: club } = useTranslation('club');
  const { t: game } = useTranslation('game');
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  // Keep input text local so asynchronous URL updates do not interrupt IME composition.
  // q is written with replace, so only the reset below changes it from outside.
  const [searchText, setSearchText] = useState(query);
  const matcher = useSearchMatcher(locale);
  // Skills are not part of the list payload; the full catalog is fetched the first time the skill filter is opened.
  // Active conditions remain visible even when the filter controls are folded.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const skillOpen = openGroup === 'skill';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [skillFilter, setSkillFilter] = useState(createSkillFilter);
  const [catalog, setCatalog] = useState<StudentData | null>(null);
  // The stats of a plan need the full catalog (equipment, weapons, bond values), which the list payload does not carry
  const statSortActive = PLAN_STAT_SORTS[parseDirectorySort(params.get('sort'))] !== undefined;
  useEffect(() => {
    if (!(skillOpen || statSortActive) || catalog) return;
    let cancelled = false;
    void fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`))
      .then((res): Promise<StudentData> => res.json())
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [skillOpen, statSortActive, catalog, locale]);
  const typeLabel = (value: string) => type_translation[value as keyof typeof type_translation]?.[getLocaleShortName(locale)] ?? value;
  const roleLabel = (value: string) => game(`tactic_roles.${value.charAt(0).toLowerCase() + value.slice(1)}`, { defaultValue: value });
  // Each chip filter is a URL param so the filtered list survives reloads and back navigation.
  const chipFilters = [
    { key: 'school', label: t('school'), field: (s: (typeof students)[number]) => s.School, format: (v: string) => club(v, { defaultValue: v }) },
    {
      key: 'attack',
      label: t('filterAttack'),
      labelIcon: <CombatTypeIcon kind="attack" />,
      field: (s: (typeof students)[number]) => s.BulletType,
      order: ATTACK_TYPES,
      format: typeLabel,
      color: (v: string) => BULLET_COLORS[v],
    },
    {
      key: 'defense',
      label: t('filterDefense'),
      labelIcon: <CombatTypeIcon kind="defense" />,
      field: (s: (typeof students)[number]) => s.ArmorType,
      order: DEFENSE_TYPES,
      format: typeLabel,
      color: (v: string) => typecolor[v as keyof typeof typecolor],
    },
    { key: 'role', label: t('filterRole'), field: (s: (typeof students)[number]) => s.TacticRole, format: roleLabel },
    {
      key: 'squad',
      label: t('filterSquad'),
      field: (s: (typeof students)[number]) => s.SquadType,
      format: (v: string) => (v === 'Main' ? t('striker') : t('special')),
      color: (v: string) => SQUAD_TYPE_COLORS[v as keyof typeof SQUAD_TYPE_COLORS],
    },
    {
      key: 'star',
      label: `${t('sort.base')} ${t('filterStar')}`,
      group: 'star',
      groupLabel: t('filterStar'),
      rowLabel: t('sort.base'),
      order: ['5', '4', '3', '2', '1'],
      field: (s: (typeof students)[number]) => String(s.StarGrade),
      format: (v: string) => `${v}★`,
      icon: (v: string) => <StarRating n={Number(v)} size={22} />,
    },
    ...(
      [
        ['urban', 'Street', 'StreetBattleAdaptation'],
        ['outdoor', 'Outdoor', 'OutdoorBattleAdaptation'],
        ['indoor', 'Indoor', 'IndoorBattleAdaptation'],
      ] as const
    ).map(([name, terrain, grade]) => ({
      key: name,
      group: 'terrain',
      groupLabel: t('terrain'),
      rowLabel: t(name),
      label: `${t('terrain')} · ${t(name)}`,
      field: (s: (typeof students)[number]) => String(s[grade]),
      // A unique weapon raises the grade, so a student matches every grade from the base up to the boosted one
      matches: (s: (typeof students)[number], v: string) => {
        const boost = s.Weapon?.AdaptationType === terrain ? (s.Weapon.AdaptationValue ?? 0) : 0;
        return s[grade] <= Number(v) && Number(v) <= s[grade] + boost;
      },
      fixedOptions: ['5', '4', '3', '2', '1', '0'],
      format: (v: string) => TERRAIN_GRADES[Number(v)] ?? '-',
    })),
  ].map(
    (filter: {
      key: string;
      label: string;
      labelIcon?: ReactNode;
      // Filters sharing a group are rows of one button in the filter bar
      group?: string;
      groupLabel?: string;
      rowLabel?: string;
      field: (s: (typeof students)[number]) => string;
      format: (v: string) => string;
      icon?: (v: string) => ReactNode;
      color?: (v: string) => string | undefined;
      order?: readonly string[];
      matches?: (s: (typeof students)[number], v: string) => boolean;
      fixedOptions?: readonly string[];
    }) => {
      const options = filter.fixedOptions ?? [...new Set(students.map(filter.field))].sort((a, b) => rankIn(filter.order, a) - rankIn(filter.order, b) || (a < b ? -1 : a > b ? 1 : 0));
      return { ...filter, options, selected: splitSelected(params.get(filter.key), options) };
    },
  );
  const baseFiltered = students.filter(
    (student) =>
      chipFilters.every((filter) => filter.selected.length === 0 || filter.selected.some((v) => (filter.matches ? filter.matches(student, v) : filter.field(student) === v))) &&
      studentSearchScore(student, query, matcher) > 0,
  );
  const skillActive = isSkillFilterActive(skillFilter);
  const sort = parseDirectorySort(params.get('sort'));
  const reversed = params.get('desc') === '1';
  const { planOf, plans } = usePlanLookup();
  const studentLink = useStudentLink(locale);
  const { fields: cardFields, toggle: toggleCardField } = useCardFields();
  const [cardFieldsOpen, setCardFieldsOpen] = useState(false);
  // Names that already exist elsewhere are reused instead of adding keys
  // Without any plan every student would count as unrecruited, so dimming only starts once the reader tracks someone
  const dimmed = (studentId: number) => cardFields.includes('dimUnrecruited') && plans.length > 0 && matchesPlanFilter(planOf(studentId), 'unrecruited');
  const cardFieldLabel = (field: (typeof CARD_FIELDS)[number]) =>
    ({
      stars: t('filterStar'),
      school: t('school'),
      unrecruited: t('planner:growthCard.unrecruited'),
      dimUnrecruited: t('cardFields.dimUnrecruited'),
      level: t('level'),
      affection: t('affection'),
      skills: t('skills'),
      equipment: game('equipment'),
    })[field];
  const selectAllPlans = useGlobalStore((state) => state.selectAllPlans);
  const planFilter = parsePlanFilter(params.get('mine'));
  const progressFieldLabel: Record<ProgressField, string> = { star: t('filterStar'), level: t('level'), affection: t('affection') };
  const progressOptionLabel = (field: ProgressField, option: string) =>
    field === 'level' ? `Lv.${option}` : field === 'star' ? (Number(option) > 5 ? `UE${Number(option) - 6}` : `${option}★`) : option;
  // Plan-based rows (current/target star, level, bond) only make sense once the reader tracks someone
  const progressRows = PROGRESS_ROWS.map((row) => {
    const side = t(`ui:${row.side}`);
    const star = row.field === 'star';
    return {
      key: row.param,
      label: `${side} ${progressFieldLabel[row.field]}`,
      group: star ? 'star' : 'progress',
      groupLabel: star ? t('filterStar') : `${t('level')} · ${t('affection')}`,
      rowLabel: star ? side : `${side} ${progressFieldLabel[row.field]}`,
      options: PROGRESS_OPTIONS[row.field],
      selected: splitSelected(params.get(row.param), PROGRESS_OPTIONS[row.field]),
      format: (v: string) => progressOptionLabel(row.field, v),
      icon: star ? (v: string) => <StarRating n={Number(v)} size={22} /> : undefined,
      color: undefined,
      labelIcon: undefined,
    };
  });
  const progressChosen = Object.fromEntries(progressRows.map((row) => [row.key, row.selected]));
  const progressActive = progressRows.some((row) => row.selected.length > 0);
  const filterRows = [...chipFilters, ...(plans.length > 0 || progressActive ? progressRows : [])];
  const needsOpen = params.get('needs') === '1';
  // The count on the materials toggle needs the catalog, which is fetched only when someone is in focus
  const growthPlans = useGlobalStore((state) => state.growthPlans);
  const hasFocus = growthPlans.some((plan) => plan.isSelected);
  const { assets: needsAssets, failed: needsFailed } = usePlannerAssets(locale, hasFocus || needsOpen);
  const needsCount = useMemo(
    () =>
      needsAssets
        ? Object.values(
            calculatedGrowthNeeds(
              growthPlans.filter((plan) => plan.isSelected),
              needsAssets.allStudents,
            ),
          ).filter((amount) => amount > 0).length
        : null,
    [growthPlans, needsAssets],
  );
  // Filters that narrow the list, for the badge on the toggle (sorting is not counted)
  const activeFilters = filterRows.filter((filter) => filter.selected.length > 0).length + (planFilter !== 'all' ? 1 : 0) + (skillActive ? 1 : 0);
  const viewParam = params.get('view');
  const planView: PlanView | null = viewParam === 'table' || viewParam === 'content' ? viewParam : null;
  const skillMatched = skillActive && catalog ? baseFiltered.filter((student) => matchesSkillFilter(catalog[student.Id]?.Skills, skillFilter)) : baseFiltered;
  const planMatched = planFilter === 'all' ? skillMatched : skillMatched.filter((student) => matchesPlanFilter(planOf(student.Id), planFilter));
  const matched = progressActive ? planMatched.filter((student) => matchesProgressFilter(planOf(student.Id), progressChosen)) : planMatched;
  const statSort = PLAN_STAT_SORTS[sort];
  // Worked out once per sort and plan change instead of on every comparison
  const planStatValues = useMemo(() => {
    const values = new Map<number, number | null>();
    if (!statSort || !catalog) return values;
    for (const student of students) {
      const plan = planOf(student.Id);
      values.set(student.Id, plan ? (resolvePlanStats(plan, statSort.side, catalog, plans)?.[statSort.stat] ?? null) : null);
    }
    return values;
  }, [statSort, catalog, students, planOf, plans]);
  const filtered = sortDirectory(matched, sort, reversed, planOf, (studentId) => planStatValues.get(studentId) ?? null);
  const { t: stat } = useTranslation('stat');
  // Names that already exist elsewhere are reused instead of adding keys
  const sortLabels: Record<(typeof DIRECTORY_SORTS)[number], string> = {
    default: t('sort.default'),
    name: t('sort.name'),
    id: t('sort.id'),
    star: t('filterStar'),
    birthday: t('birthday'),
    height: t('height'),
    attack: `${t('sort.base')} ${stat('Buff_ATK')}`,
    hp: `${t('sort.base')} ${stat('Buff_MAXHP')}`,
    defense: `${t('sort.base')} ${stat('Buff_DEF')}`,
    heal: `${t('sort.base')} ${stat('Buff_HealPower')}`,
    planCurrentLevel: t('sort.planCurrentLevel'),
    planTargetLevel: t('sort.planTargetLevel'),
    planCurrentStar: t('sort.planCurrentStar'),
    planTargetStar: t('sort.planTargetStar'),
    planAcquired: t('sort.planAcquired'),
    planCurrentAttack: `${t('ui:current')} ${stat('Buff_ATK')}`,
    planTargetAttack: `${t('ui:target')} ${stat('Buff_ATK')}`,
    planCurrentHp: `${t('ui:current')} ${stat('Buff_MAXHP')}`,
    planTargetHp: `${t('ui:target')} ${stat('Buff_MAXHP')}`,
    planCurrentDefense: `${t('ui:current')} ${stat('Buff_DEF')}`,
    planTargetDefense: `${t('ui:target')} ${stat('Buff_DEF')}`,
    planCurrentHeal: `${t('ui:current')} ${stat('Buff_HealPower')}`,
    planTargetHeal: `${t('ui:target')} ${stat('Buff_HealPower')}`,
  };
  const skillCounts = createSkillOptionCounts();
  if (catalog) for (const student of baseFiltered) addSkillOptionCounts(skillCounts, [catalog[student.Id]?.Skills], skillFilter);
  const colorDot = (color: string | undefined) => (color ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden /> : null);
  // Chips that draw an icon keep their own colors, so they show the selection with a ring instead of a fill
  const chipButton = (selected: boolean, hasIcon = false) =>
    `min-h-7 rounded border px-2 py-0.5 text-xs ${selected ? (hasIcon ? 'border-ba-btn-blue-dark ring-1 ring-ba-btn-blue dark:border-ba-btn-blue' : 'border-ba-btn-blue bg-ba-btn-blue text-neutral-900') : 'border-neutral-300 dark:border-neutral-600'}`;
  // Each group is a button in the filter bar; the options of the open one are listed below the bar
  const filterGroups = [
    ...[...new Set(filterRows.map((row) => row.group ?? row.key))].map((groupKey) => {
      const rows = filterRows.filter((row) => (row.group ?? row.key) === groupKey);
      const first = rows[0];
      // There is no "all" chip: pressing a chosen chip again clears it, and no chosen chip means all
      const chips = (filter: (typeof rows)[number]) =>
        filter.options.map((option) => {
          const pressed = filter.selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={pressed}
              onClick={() => update(filter.key, (pressed ? filter.selected.filter((v) => v !== option) : [...filter.selected, option]).join(','))}
              className={`${chipButton(pressed, !!filter.icon)} inline-flex items-center gap-1`}
            >
              {colorDot(filter.color?.(option))}
              {filter.icon?.(option) ?? filter.format(option)}
            </button>
          );
        });
      const activeRows = rows.filter((row) => row.selected.length > 0);
      return {
        key: groupKey,
        label: first.groupLabel ?? first.label,
        labelIcon: rows.length === 1 ? first.labelIcon : undefined,
        summary:
          rows.length === 1 && first.selected.length === 1 ? (
            <>
              {colorDot(first.color?.(first.selected[0]))}
              {first.icon?.(first.selected[0]) ?? first.format(first.selected[0])}
            </>
          ) : (
            String(activeRows.reduce((sum, row) => sum + row.selected.length, 0))
          ),
        active: activeRows.length > 0,
        content:
          rows.length === 1 ? (
            chips(first)
          ) : (
            <div className="flex w-full flex-col gap-2">
              {rows.map((row) => (
                <div key={row.key} className="grid grid-cols-1 gap-1 sm:grid-cols-[7rem_1fr] sm:gap-x-2">
                  <span className="flex min-h-7 items-center whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">{row.rowLabel}</span>
                  <div className="flex flex-wrap gap-1">{chips(row)}</div>
                </div>
              ))}
            </div>
          ),
      };
    }),
    ...(plans.length > 0 || planFilter !== 'all'
      ? [
          {
            key: 'mine',
            label: t('planFilter'),
            summary: t(`planFilters.${planFilter}`),
            active: planFilter !== 'all',
            content: (
              <>
                {PLAN_FILTERS.map((value) => (
                  <button key={value} type="button" aria-pressed={planFilter === value} onClick={() => update('mine', value === 'all' ? '' : value)} className={chipButton(planFilter === value)}>
                    {t(`planFilters.${value}`)}
                  </button>
                ))}
                <span className="ml-2 inline-flex divide-x divide-neutral-300 overflow-hidden rounded border border-neutral-300 text-xs dark:divide-neutral-600 dark:border-neutral-600">
                  <button type="button" className="min-h-7 px-2 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-700" onClick={() => selectAllPlans(true)}>
                    {t('ui:selectAll')}
                  </button>
                  <button type="button" className="min-h-7 px-2 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-700" onClick={() => selectAllPlans(false)}>
                    {t('ui:deselectAll')}
                  </button>
                </span>
              </>
            ),
          },
        ]
      : []),
    {
      key: 'skill',
      label: t('skillFilter'),
      summary: skillActive ? '*' : t('all'),
      active: skillActive,
      content: catalog ? (
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SkillFilterGroups filter={skillFilter} onChange={setSkillFilter} counts={skillCounts} />
        </div>
      ) : (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('skillFilterLoading')}</p>
      ),
    },
  ];
  function clearAllFilters(clearQuery = false) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const filter of filterRows) next.delete(filter.key);
        next.delete('mine');
        if (clearQuery) next.delete('q');
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
    setSkillFilter(createSkillFilter());
    if (clearQuery) setSearchText('');
  }
  const metric = (student: (typeof students)[number]): string | null => {
    if (statSort) return planStatValues.get(student.Id)?.toLocaleString() ?? null;
    switch (sort) {
      case 'star':
        return `${student.StarGrade}★`;
      case 'birthday':
        return student.BirthDay || null;
      case 'height':
        return student.CharHeightMetric || null;
      case 'attack':
        return String(student.AttackPower100 || '') || null;
      case 'hp':
        return String(student.MaxHP100 || '') || null;
      case 'defense':
        return String(student.DefensePower100 || '') || null;
      case 'heal':
        return String(student.HealPower100 || '') || null;
      case 'id':
        return `#${student.Id}`;
      default:
        return null;
    }
  };
  function update(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }
  return (
    <div className="space-y-3 px-4 py-4 text-neutral-900 dark:text-neutral-100">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{t('description')}</p>
        </div>
      </header>
      <div className="space-y-2">
        <form onSubmit={(event) => event.preventDefault()} className="flex gap-2">
          <label className="flex-1">
            <span className="sr-only">{t('search')}</span>
            <input
              type="search"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                update('q', event.target.value);
              }}
              placeholder={t('search')}
              className={fieldClass}
            />
          </label>
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="student-filters"
            aria-label={t('ui:filter')}
            title={t('ui:filter')}
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`relative flex h-8 shrink-0 items-center justify-center gap-1 rounded border px-2 text-sm ${filtersOpen ? 'border-neutral-900 dark:border-neutral-100' : 'border-neutral-300 dark:border-neutral-700'}`}
          >
            <HiOutlineAdjustmentsHorizontal className="h-4 w-4" aria-hidden />
            <span>{t('ui:filter')}</span>
            {activeFilters > 0 && <span className="tabular-nums text-neutral-500 dark:text-neutral-400">{activeFilters}</span>}
          </button>
          {(hasFocus || needsOpen) && (
            <button
              type="button"
              aria-expanded={needsOpen}
              onClick={() => update('needs', needsOpen ? '' : '1')}
              className={`flex h-8 shrink-0 items-center justify-center gap-1 rounded border px-2 text-sm ${needsOpen ? 'border-neutral-900 dark:border-neutral-100' : 'border-neutral-300 dark:border-neutral-700'}`}
            >
              <span>{t('planNeeds')}</span>
              {needsCount !== null && <span className="tabular-nums text-neutral-500 dark:text-neutral-400">{needsCount}</span>}
            </button>
          )}
        </form>
        {needsOpen && <StudentFocusNeeds schedules={schedules} today={new Date().toISOString().slice(0, 10)} assets={needsAssets} failed={needsFailed} />}
        {activeFilters > 0 && (
          <div className="flex flex-wrap items-center gap-2" aria-label={t('activeFilters')}>
            {[
              ...filterRows.filter((filter) => filter.selected.length > 0).map((filter) => ({ key: filter.key, label: `${filter.label}: ${filter.selected.map(filter.format).join(' / ')}` })),
              ...(planFilter !== 'all' ? [{ key: 'mine', label: t(`planFilters.${planFilter}`) }] : []),
              ...(skillActive ? [{ key: 'skill', label: t('skillFilter') }] : []),
            ].map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => (filter.key === 'skill' ? setSkillFilter(createSkillFilter()) : update(filter.key, ''))}
                aria-label={t('removeFilter', { filter: filter.label })}
                className="inline-flex min-h-7 items-center gap-1 rounded bg-neutral-100 px-2 text-xs dark:bg-neutral-800"
              >
                {filter.label}
                <HiXMark className="h-4 w-4" aria-hidden />
              </button>
            ))}
            <button
              type="button"
              onClick={() => clearAllFilters()}
              aria-label={t('ui:reset')}
              title={t('ui:reset')}
              className="flex h-7 w-7 items-center justify-center rounded border border-neutral-300 text-neutral-600 hover:border-ba-btn-blue dark:border-neutral-600 dark:text-neutral-300"
            >
              <HiArrowPath className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
        {filtersOpen && (
          <div id="student-filters" className="space-y-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {filterGroups.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  aria-expanded={openGroup === group.key}
                  aria-controls="student-filter-options"
                  onClick={() => setOpenGroup(openGroup === group.key ? null : group.key)}
                  className={`flex min-h-7 min-w-0 items-center gap-1 border-b py-0.5 text-xs ${openGroup === group.key ? 'border-ba-btn-blue-dark dark:border-ba-btn-blue' : 'border-neutral-200 dark:border-neutral-800'}`}
                >
                  <span className={`inline-flex items-center gap-1 ${group.active ? 'font-medium' : 'text-neutral-600 dark:text-neutral-400'}`}>
                    {'labelIcon' in group ? group.labelIcon : null}
                    {group.label}
                    {group.active && <>: {group.summary}</>}
                  </span>
                  <HiChevronDown className={`h-3 w-3 shrink-0 text-neutral-500 transition-transform ${openGroup === group.key ? 'rotate-180' : ''}`} aria-hidden />
                </button>
              ))}
            </div>
            {openGroup && (
              <div id="student-filter-options" className="flex flex-wrap items-center gap-1 py-1">
                {filterGroups.find((group) => group.key === openGroup)?.content}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] items-center gap-x-4 border-b border-neutral-200 dark:border-neutral-800">
        <div className="contents">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('count', { count: filtered.length })}</p>
          {planView !== 'content' && (
            <div className="col-start-2 row-start-1 flex min-w-0 items-center justify-self-end gap-1 sm:col-start-3">
              <label className="relative min-w-0">
                <span className="sr-only">{t('sortCriteria')}</span>
                <select
                  value={sort}
                  onChange={(event) => update('sort', event.target.value === 'default' ? '' : event.target.value)}
                  className="h-8 w-36 appearance-none rounded bg-transparent pl-2 pr-7 text-right text-sm focus:outline-2 focus:outline-ba-btn-blue dark:bg-neutral-900 sm:w-44"
                >
                  {DIRECTORY_SORTS.map((value) => (
                    <option key={value} value={value}>
                      {sortLabels[value]}
                    </option>
                  ))}
                </select>
                <HiChevronDown className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-neutral-500 dark:text-neutral-400" aria-hidden />
              </label>
              <button
                type="button"
                onClick={() => update('desc', reversed ? '' : '1')}
                title={reversed ? t('sortDescending') : t('sortAscending')}
                aria-label={reversed ? t('sortDescending') : t('sortAscending')}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                {reversed ? <HiOutlineBarsArrowDown className="h-4 w-4" aria-hidden /> : <HiOutlineBarsArrowUp className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          )}
        </div>
        <div className="col-span-2 flex gap-4 sm:col-span-1 sm:col-start-2 sm:row-start-1" role="group" aria-label={t('viewMode')}>
          {(['cards', 'table', 'content'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={(planView ?? 'cards') === value}
              onClick={() => update('view', value === 'cards' ? '' : value)}
              className={`-mb-px min-h-8 border-b-2 px-1 text-sm ${(planView ?? 'cards') === value ? 'border-ba-btn-blue-dark font-semibold text-neutral-900 dark:border-ba-btn-blue dark:text-neutral-100' : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'}`}
            >
              {value === 'table' ? t('ui:table') : t(`planViews.${value}`)}
            </button>
          ))}
          {!planView && (
            <button
              type="button"
              aria-expanded={cardFieldsOpen}
              onClick={() => setCardFieldsOpen(!cardFieldsOpen)}
              className="-mb-px flex min-h-8 items-center gap-1 px-1 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              {t('cardFields.title')}
              <HiChevronDown size={12} className={cardFieldsOpen ? 'rotate-180' : ''} aria-hidden />
            </button>
          )}
        </div>
      </div>
      {!planView && cardFieldsOpen && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {CARD_FIELDS.map((field) => (
            <label key={field} className="flex min-h-7 cursor-pointer items-center gap-1.5 text-sm">
              <input type="checkbox" checked={cardFields.includes(field)} onChange={() => toggleCardField(field)} className="h-4 w-4 cursor-pointer rounded border-neutral-300 text-blue-600" />
              {cardFieldLabel(field)}
            </label>
          ))}
        </div>
      )}
      {planView ? (
        <StudentPlanViews
          view={planView}
          shownIds={new Set(filtered.map((student) => student.Id))}
          order={filtered.map((student) => student.Id)}
          schedules={schedules}
          today={new Date().toISOString().slice(0, 10)}
          locale={locale}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
          {filtered.map((student) => {
            const value = metric(student);
            // The sort value when sorting by one, otherwise the academy if the reader asked for it
            const subtitle = value ?? (cardFields.includes('school') ? club(student.School, { defaultValue: student.School }) : null);
            return (
              <div
                key={student.Id}
                className="relative flex flex-col overflow-hidden rounded border border-neutral-200 hover:border-ba-btn-blue focus-within:border-ba-btn-blue dark:border-neutral-700"
              >
                <Link to={studentLink(student.Id)} prefetch="intent" state={{ listSearch: params.toString() }} className="flex flex-col focus-visible:outline-2 focus-visible:outline-ba-btn-blue">
                  <div className="relative aspect-square w-full bg-neutral-100 dark:bg-neutral-800">
                    <div className={`h-full w-full ${dimmed(student.Id) ? 'opacity-40' : ''}`}>
                      <CombatStylePortrait studentId={student.Id} alt="" />
                    </div>
                    {cardFields.includes('stars') && <StudentPlanStars plan={planOf(student.Id)} />}
                  </div>
                  <div className="h-1 shrink-0" style={{ backgroundColor: BULLET_COLORS[student.BulletType] }} />
                  <div className="min-w-0 px-1.5 py-1">
                    <h2 className="truncate text-xs font-semibold" title={student.Name}>
                      {student.Name}
                    </h2>
                    {subtitle !== null && (
                      // Keep the academy off small screens to leave more room for the student name
                      <p className={`truncate text-xs text-neutral-500 dark:text-neutral-400 ${value ? '' : 'hidden sm:block'}`} title={subtitle}>
                        {subtitle}
                      </p>
                    )}
                  </div>
                </Link>
                <StudentPlanSelect name={student.Name} plan={planOf(student.Id)} />
                {cardFields.includes('unrecruited') && <StudentUnrecruitedLabel plan={planOf(student.Id)} />}
                <StudentPlanStats plan={planOf(student.Id)} fields={cardFields} />
              </div>
            );
          })}
        </div>
      )}
      {!planView && !filtered.length && (
        <div className="space-y-3 py-10 text-center">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t(planFilter === 'goal' && !students.some((student) => matchesPlanFilter(planOf(student.Id), 'goal')) ? 'emptyGoals' : 'empty')}
          </p>
          {(activeFilters > 0 || query) && (
            <button type="button" onClick={() => clearAllFilters(true)} className="rounded-md bg-ba-btn-blue px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-ba-btn-blue-dark">
              {t('showAllStudents')}
            </button>
          )}
        </div>
      )}
      <details className="border-t border-neutral-200 pt-4 dark:border-neutral-700">
        <summary className="cursor-pointer py-2 text-sm font-medium">{t('planner:dataExchange.title')}</summary>
        <ExportImportPanel compact />
      </details>
    </div>
  );
}

export const handle: AppHandle = {
  preload: () => studentSheetPreloadLinks(),
};
