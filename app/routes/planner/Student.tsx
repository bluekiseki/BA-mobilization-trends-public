import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCompressArrowsAlt, FaExpandArrowsAlt, FaSearch, FaPlus, FaArrowLeft, FaSortAmountDown, FaTable, FaTh, FaList } from 'react-icons/fa';
import { data, Link, useLoaderData, useLocation, type LoaderFunctionArgs } from 'react-router';

// Utils & Stores
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { calculatedGrowthNeeds } from '~/utils/calculatedGrowthNeeds';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import { cdn } from '~/utils/cdn';
import { getInstance } from '~/middleware/i18next';
import { getCharacterStarValue, type Character } from '~/components/dashboard/common';

// Components
import { MaterialNeedsSection } from '~/components/planner/StudentGrowth/MaterialNeedsSection';
import { StudentGrowthPlanCard } from '~/components/planner/StudentGrowth/StudentGrowthPlanCard';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { PageHeader } from '~/components/common/PageHeader';
import { StudentGridCard } from '~/components/StudentGridCard';
import { FaCopy, FaRegSquareCheck } from 'react-icons/fa6';

// Types
import type { ContentItem, EventData, IconData, StudentData, StudentPortraitData } from '~/types/plannerData';
import type { Route } from './+types/Student';
import { StudentSpreadsheetView } from '~/components/planner/StudentGrowth/Spreadsheet/StudentSpreadsheetView';
import { SpreadsheetCsvTools } from '~/components/planner/StudentGrowth/Spreadsheet/SpreadsheetCsvTools';
import ExportImportPanel from '~/components/planner/ExportImportPanel';
import { useSearchMatcher } from '~/utils/useSearchMatcher';
import ContentGroupedStudentView from '~/components/planner/StudentGrowth/ContentGroupedStudentView';
import { loadScheduleDataV2 } from '~/utils/calender.data.v2';
import { getItemLabel, getItemTitle } from '~/utils/scheduleDisplay';

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const krData = loadScheduleDataV2({ server: 'kr', tracksToLoad: ['raid', 'multifloor'] });
  return data({
    siteTitle: i18n.t('common:title'),
    title: i18n.t('planner:page.studentGrowthPlanner'),
    description: i18n.t('planner:page.description.studentGrowthPlanner'),
    krRaid: krData.tracks.raid,
    krMultifloor: krData.tracks.multifloor,
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
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData>({});
  const [iconData, setIconData] = useState<IconData>({});
  const [iconInfoData, setIconInfoData] = useState<EventData['icons'] | null>(null);
  const [loading, setLoading] = useState(true);

  // UI State
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [selectedPlanUuid, setSelectedPlanUuid] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [sortOrder, setSortOrder] = useState<'name' | 'level' | 'date' | 'currentStar' | 'targetStar' | 'id'>('date');
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const location = useLocation();
  // Deep-linked via Link `state={{ view: 'table' }}` (e.g. gacha planner's shortcut) to land on the table view.
  const [viewMode, setViewMode] = useState<'card' | 'table' | 'content'>(() => ((location.state as { view?: string } | null)?.view === 'table' ? 'table' : 'card'));

  const { t, i18n } = useTranslation('planner');
  // const { t: t_c } = useTranslation('common');
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;
  const { growthPlans, addPlan, selectAllPlans, setGrowthPlans } = useGlobalStore();
  const matcher = useSearchMatcher(locale);
  const { krRaid, krMultifloor } = useLoaderData<typeof loader>();
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
        const [studentsRes, portraitsRes, iconImgRes, iconInfoRes] = await Promise.all([
          fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)),
          fetch(cdn('/w/students_portrait.json')),
          fetch(cdn(`/ew/icon_img.json`)),
          fetch(cdn(`/ew/icon_info.json`)),
        ]);
        const students: StudentData = await studentsRes.json();
        const portraits: StudentPortraitData = await portraitsRes.json();
        Object.entries(students).map(([studentId, student]) => {
          student.Portrait = portraits[parseInt(studentId)];
        });
        setAllStudents(students);
        setStudentPortraits(portraits);
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

  const selectedPlansCount = useMemo(() => growthPlans.filter((p) => p.isSelected).length, [growthPlans]);

  const totalNeeds = useMemo(() => {
    const activePlans = growthPlans.filter((p) => p.isSelected);
    return calculatedGrowthNeeds(activePlans, allStudents);
  }, [growthPlans, allStudents]);

  const studentOptions = useMemo(() => Object.entries(allStudents).sort(([, a], [, b]) => a.Name.localeCompare(b.Name)), [allStudents]);

  const selectedPlan = useMemo(() => growthPlans.find((p) => p.uuid === selectedPlanUuid), [growthPlans, selectedPlanUuid]);

  const filteredAndSortedPlans = useMemo(() => {
    let result = [...growthPlans];

    // Filter: Show only selected check
    if (showOnlySelected) {
      result = result.filter((p) => p.isSelected);
    }

    // Filter: Search Term
    if (searchTerm.trim()) {
      const lowerTerm = searchTerm.trim().toLowerCase();
      result = result.filter((p) => {
        const student = p.studentId ? allStudents[p.studentId] : null;
        if (student) return matcher(student.Name, lowerTerm) || matcher(student.PathName, lowerTerm) || student.SearchTags.some((v) => matcher(v, searchTerm));

        return false;
        //  : false;// || matcher(s.FamilyName ?? '', studentSearchQuery);
        // return student ? student.Name.toLowerCase().includes(lowerTerm) : false;
      });
    }

    result.sort((a, b) => {
      const studentA = a.studentId ? allStudents[a.studentId] : null;
      const studentB = b.studentId ? allStudents[b.studentId] : null;

      if (sortOrder === 'name') {
        return (studentA?.Name || '').localeCompare(studentB?.Name || '');
      } else if (sortOrder === 'level') {
        return b.target.level - a.target.level;
      } else if (sortOrder === 'currentStar' || sortOrder === 'targetStar') {
        const rankKey = sortOrder === 'currentStar' ? 'current' : 'target';
        const starA = getCharacterStarValue({
          hasWeapon: a[rankKey].uw > 0,
          star: a[rankKey].star,
          weaponStar: a[rankKey].uw,
        } as Character);
        const starB = getCharacterStarValue({
          hasWeapon: b[rankKey].uw > 0,
          star: b[rankKey].star,
          weaponStar: b[rankKey].uw,
        } as Character);
        return starB - starA;
      } else if (sortOrder === 'id') {
        if (!studentA) return 1;
        if (!studentB) return -1;
        return studentA?.Id - studentB.Id;
      }
      return 0;
    });

    return result;
  }, [growthPlans, searchTerm, sortOrder, allStudents, showOnlySelected]);

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
            studentPortraits={studentPortraits}
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
            <PageHeader title={t('page.studentGrowthPlanner')} description={t('page.description.studentGrowthPlanner')} className="mb-0" />

            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative w-full lg:flex-1">
                  <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs" />
                  <input
                    type="text"
                    placeholder={t_ui('searchStudents')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white dark:bg-neutral-800 dark:border-neutral-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="flex items-center bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg px-1">
                    <button
                      onClick={() => selectAllPlans(true)}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1.5 rounded transition-colors"
                      title={t('ui.selectAllTooltip', 'Select All Students')}
                    >
                      {t('ui.selectAll', 'ALL')}
                    </button>
                    <div className="w-px h-3 bg-neutral-300 dark:bg-neutral-600 mx-0.5" />
                    <button
                      onClick={() => selectAllPlans(false)}
                      className="text-xs font-bold text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 px-2 py-1.5 rounded transition-colors"
                      title={t('ui.deselectAllTooltip', 'Deselect All Students')}
                    >
                      {t('ui.deselectAll', 'NONE')}
                    </button>
                  </div>

                  <div className="flex items-center bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden divide-x divide-neutral-200 dark:divide-neutral-700">
                    <label className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors">
                      <input
                        type="checkbox"
                        checked={showOnlySelected}
                        onChange={(e) => setShowOnlySelected(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3 cursor-pointer"
                      />
                      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 whitespace-nowrap">{t('ui.showSelectedOnly', 'Selected')}</span>
                    </label>
                    <div className="flex items-center px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors">
                      <FaSortAmountDown className="text-neutral-400 mr-1.5 text-xs shrink-0" />
                      <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as 'date' | 'name' | 'level' | 'currentStar' | 'targetStar' | 'id')}
                        className="text-xs ios-compact-12 font-medium bg-transparent border-none focus:ring-0 cursor-pointer text-neutral-700 dark:text-neutral-200 pr-5 pl-0"
                      >
                        <option value="date">{t('ui.sortByDate')}</option>
                        <option value="name">{t('ui.sortByName')}</option>
                        <option value="level">{t('ui.sortByLevel')}</option>
                        <option value="currentStar">{t('ui.sortByCurrentStar', { defaultValue: 'Current Rank' })}</option>
                        <option value="targetStar">{t('ui.sortByTargetStar', { defaultValue: 'Target Rank' })}</option>
                        <option value="id">{t('ui.sortById', 'By Id')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                <div className="flex items-center bg-neutral-100 dark:bg-neutral-700 rounded overflow-hidden divide-x divide-neutral-200 dark:divide-neutral-600">
                  {(
                    [
                      ['card', <FaTh size={12} />, t('ui.cardView', 'Cards')],
                      ['table', <FaTable size={12} />, t('ui.tableView', 'Table')],
                      ['content', <FaList size={12} />, t('ui.contentView', 'By Content')],
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

          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isSummaryExpanded ? 'max-h-[60vh] opacity-100 mt-4 pb-2' : 'max-h-0 opacity-0'}`}>
            {isSummaryExpanded && (
              <>
                <div className="mb-2 px-1 text-xs font-bold text-blue-600 dark:text-blue-400">
                  <FaRegSquareCheck className="inline-block mr-1.5 mb-0.5" />
                  {t('ui.summaryForSelected', { count: selectedPlansCount, defaultValue: `Materials needed for ${selectedPlansCount} selected students` })}
                </div>
                {Object.keys(totalNeeds).length > 0 ? (
                  <MaterialNeedsSection calculatedNeeds={totalNeeds} eventData={{ icons: iconInfoData } as EventData} iconData={iconData} title={t('ui.totalNeededTitle')} />
                ) : (
                  <div className="text-center text-sm text-neutral-400 py-4 italic bg-neutral-50 dark:bg-neutral-900/50 rounded-lg">
                    {selectedPlansCount === 0 ? t('ui.noStudentSelected', 'No students selected.') : t('ui.noMaterialsNeeded')}
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
          <ContentGroupedStudentView contentItems={contentItems} growthPlans={growthPlans} allStudents={allStudents} />
        ) : viewMode === 'table' ? (
          <div className="space-y-3">
            <SpreadsheetCsvTools growthPlans={growthPlans} allStudents={allStudents as Record<string, { Name: string }>} setGrowthPlans={setGrowthPlans} />
            <StudentSpreadsheetView allStudents={allStudents} studentPortraits={studentPortraits} searchTerm={searchTerm.trim()} showOnlySelected={showOnlySelected} />
          </div>
        ) : (
          <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
            {filteredAndSortedPlans.map((plan) => (
              <div key={plan.uuid} className="">
                <StudentGridCard
                  plan={plan}
                  studentInfo={plan.studentId ? allStudents[plan.studentId] : null}
                  portraitBase64={plan.studentId ? studentPortraits[plan.studentId] : undefined}
                  onClick={() => setSelectedPlanUuid(plan.uuid)}
                />
              </div>
            ))}

            <button
              onClick={() => addPlan(null)}
              className="h-44 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-neutral-800 dark:hover:border-blue-500 transition-colors group"
            >
              <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center group-hover:bg-blue-500 transition-colors">
                <FaPlus className="text-neutral-400 group-hover:text-white" />
              </div>
              <span className="px-2 text-center text-xs font-bold text-neutral-500 group-hover:text-blue-600 dark:text-neutral-400">{t('ui.addStudent', { defaultValue: 'Add Student' })}</span>
            </button>
          </div>
        )}
      </div>

      <ExportImportPanel />
    </div>
  );
};

export default StudentPlannerPage;
