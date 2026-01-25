import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCompressArrowsAlt, FaExpandArrowsAlt, FaSearch, FaPlus, FaArrowLeft, FaSortAmountDown } from 'react-icons/fa';
import { data, Link, type LoaderFunctionArgs } from 'react-router';

// Utils & Stores
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import { calculatedGrowthNeeds } from '~/utils/calculatedGrowthNeeds';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import { cdn } from '~/utils/cdn';
import { getInstance } from '~/middleware/i18next';
import { getCharacterStarValue, type Character } from '~/components/dashboard/common';

// Components
import { ItemIcon } from '~/components/planner/common/Icon';
import { StudentGrowthPlanCard } from '~/components/planner/StudentGrowth/StudentGrowthPlanCard';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { StudentGridCard } from '~/components/StudentGridCard';
import { getItemSortPriority } from '~/utils/itemSort';
import { FaCopy, FaRegSquareCheck } from 'react-icons/fa6';

// Types
import type { EventData, IconData, StudentData, StudentPortraitData } from '~/types/plannerData';
import type { Route } from './+types/Student';
import { PlannerJsonExchange } from '~/components/planner/StudentGrowth/PlannerJsonExchange';

export async function loader({ context }: LoaderFunctionArgs) {
  let i18n = getInstance(context);
  return data({
    siteTitle: i18n.t('home:title'),
    title: i18n.t('planner:page.studentGrowthPlanner'),
    description: i18n.t('planner:page.description.studentGrowthPlanner'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/p.webp');
}

export function links() {
  return [...createLinkHreflang('/planner/students')];
}

export const StudentPlannerPage = () => {
  const [allStudents, setAllStudents] = useState<StudentData>({});
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData>({});
  const [iconData, setIconData] = useState<IconData>({});
  const [iconInfoData, setIconInfoData] = useState<EventData['icons']>({} as any);
  const [loading, setLoading] = useState(true);

  // UI State
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [selectedPlanUuid, setSelectedPlanUuid] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [sortOrder, setSortOrder] = useState<'name' | 'level' | 'date' | 'star'>('date');
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  const { t, i18n } = useTranslation('planner');
  const { t: t_c } = useTranslation('common');
  const locale = i18n.language as Locale;
  const { growthPlans, addPlan, updatePlan, selectAllPlans } = useGlobalStore();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [studentsRes, portraitsRes, iconImgRes, iconInfoRes] = await Promise.all([
          fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)),
          fetch(cdn('/w/students_portrait.json')),
          fetch(cdn(`/ew/icon_img.json`)),
          fetch(cdn(`/ew/icon_info.json`)),
        ]);
        const students = (await studentsRes.json()) as StudentData;
        const portraits = (await portraitsRes.json()) as StudentPortraitData;
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
    fetchData();
  }, [locale]);

  const selectedPlansCount = useMemo(() => growthPlans.filter((p) => p.isSelected !== false).length, [growthPlans]);

  const totalNeeds = useMemo(() => {
    const activePlans = growthPlans.filter((p) => p.isSelected !== false);
    return calculatedGrowthNeeds(activePlans, allStudents);
  }, [growthPlans, allStudents]);

  const studentOptions = useMemo(() => Object.entries(allStudents).sort(([, a], [, b]) => a.Name.localeCompare(b.Name)), [allStudents]);

  const selectedPlan = useMemo(() => growthPlans.find((p) => p.uuid === selectedPlanUuid), [growthPlans, selectedPlanUuid]);

  const handleDuplicatePlan = (e: React.MouseEvent, plan: GrowthPlan) => {
    e.stopPropagation();
    /* const newUuid = */ addPlan(plan.studentId);

    setTimeout(() => {
      const plans = useGlobalStore.getState().growthPlans;
      const createdPlan = plans[plans.length - 1];
      if (createdPlan) {
        updatePlan(createdPlan.uuid, 'current', { ...plan.current });
        updatePlan(createdPlan.uuid, 'target', { ...plan.target });
      }
    }, 50);
  };

  const filteredAndSortedPlans = useMemo(() => {
    let result = [...growthPlans];

    // Filter: Show only selected check
    if (showOnlySelected) {
      result = result.filter((p) => p.isSelected !== false);
    }

    // Filter: Search Term
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter((p) => {
        const student = p.studentId ? allStudents[p.studentId] : null;
        return student ? student.Name.toLowerCase().includes(lowerTerm) : false;
      });
    }

    result.sort((a, b) => {
      const studentA = a.studentId ? allStudents[a.studentId] : null;
      const studentB = b.studentId ? allStudents[b.studentId] : null;

      if (sortOrder === 'name') {
        return (studentA?.Name || '').localeCompare(studentB?.Name || '');
      } else if (sortOrder === 'level') {
        return b.target.level - a.target.level;
      } else if (sortOrder === 'star') {
        const starA = getCharacterStarValue({
          hasWeapon: a.target.uw > 0,
          star: a.target.star,
          weaponStar: a.target.uw,
        } as Character);
        const starB = getCharacterStarValue({
          hasWeapon: b.target.uw > 0,
          star: b.target.star,
          weaponStar: b.target.uw,
        } as Character);
        return starB - starA;
      }
      return 0;
    });

    return result;
  }, [growthPlans, searchTerm, sortOrder, allStudents, showOnlySelected]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50 dark:bg-neutral-900">
        <p className="text-gray-500">{t_c('loading_txt')}</p>
      </div>
    );
  }

  if (selectedPlanUuid && selectedPlan) {
    return (
      <div className="bg-gray-100 dark:bg-neutral-900 min-h-screen p-4">
        <div className="max-w-5xl mx-auto">
          <button onClick={() => setSelectedPlanUuid(null)} className="flex items-center gap-2 mb-4 text-gray-600 dark:text-gray-300 hover:text-blue-500 transition-colors font-medium">
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
            onClose={() => setSelectedPlanUuid(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-neutral-900 min-h-screen pb-20">
      {}
      <div className="bg-white dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3 md:gap-0">
            {/* Title & Description */}
            <div className="flex-1 pr-0 md:pr-4">
              <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">{t('page.studentGrowthPlanner')}</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-keep">{t('page.description.studentGrowthPlanner')}</p>
            </div>

            {}
            <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-3 md:gap-1 w-full md:w-auto border-t md:border-t-0 border-gray-100 dark:border-neutral-700 pt-3 md:pt-0 mt-1 md:mt-0">
              <div className="flex items-center gap-2">
                <PlannerJsonExchange />
                <button
                  onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200 px-3 py-1.5 rounded transition-colors whitespace-nowrap h-[32px]"
                >
                  {isSummaryExpanded ? <FaCompressArrowsAlt /> : <FaExpandArrowsAlt />}
                  {isSummaryExpanded ? t_c('close') : `${t('ui.totalNeededTitle')} (${selectedPlansCount})`}
                </button>
              </div>

              <Link to={localeLink(locale, '/planner/equipment')} className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 whitespace-nowrap">
                <FaCopy />
                {t('equipment.goToPlanner')}
              </Link>
            </div>
          </div>

          {}
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isSummaryExpanded ? 'max-h-[60vh] opacity-100 mt-4 pb-2' : 'max-h-0 opacity-0'}`}>
            {isSummaryExpanded && (
              <div className="mb-2 px-1 text-xs font-bold text-blue-600 dark:text-blue-400">
                <FaRegSquareCheck className="inline-block mr-1.5 mb-0.5" />
                {t('ui.summaryForSelected', {
                  count: selectedPlansCount,
                  defaultValue: `Materials needed for ${selectedPlansCount} selected students`,
                })}
              </div>
            )}

            {Object.keys(totalNeeds).length > 0 ? (
              <div className="flex flex-wrap gap-2 p-1 rounded-lg overflow-y-auto max-h-[50vh] scrollbar-thin">
                {Object.entries(totalNeeds)
                  .sort(([a], [b]) =>
                    getItemSortPriority(a, {
                      icons: iconInfoData,
                    } as EventData) > getItemSortPriority(b, { icons: iconInfoData } as EventData)
                      ? 1
                      : 0,
                  )
                  .map(([key, amount]) => {
                    if (amount <= 0) return null;
                    const [type, id] = key.split('_');
                    return <ItemIcon key={key} type={type} itemId={id} amount={amount as number} size={12} eventData={{ icons: iconInfoData } as EventData} iconData={iconData} />;
                  })}
              </div>
            ) : (
              <div className="text-center text-sm text-gray-400 py-4 italic bg-gray-50 dark:bg-neutral-900/50 rounded-lg">
                {selectedPlansCount === 0 ? t('ui.noStudentSelected', 'No students selected.') : t('ui.noMaterialsNeeded')}
              </div>
            )}
          </div>
        </div>
      </div>

      {}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {}
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          {}
          <div className="relative w-full lg:w-96">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
            <input
              type="text"
              placeholder={t('ui.searchStudentPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white dark:bg-neutral-800 dark:border-neutral-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
            {/* Bulk Selection (ALL / NONE) */}
            <div className="flex items-center bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg px-2 h-[38px]">
              <button
                onClick={() => selectAllPlans(true)}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1.5 rounded transition-colors"
                title={t('ui.selectAllTooltip', 'Select All Students')}
              >
                {t('ui.selectAll', 'ALL')}
              </button>
              <div className="w-px h-3 bg-gray-300 dark:bg-neutral-600 mx-1"></div>
              <button
                onClick={() => selectAllPlans(false)}
                className="text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-700 px-2 py-1.5 rounded transition-colors"
                title={t('ui.deselectAllTooltip', 'Deselect All Students')}
              >
                {t('ui.deselectAll', 'NONE')}
              </button>
            </div>

            {/* Sort & Filter Group */}
            <div className="flex items-center gap-0 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg h-[38px] overflow-hidden divide-x divide-gray-200 dark:divide-neutral-700">
              {/* Checkbox Filter */}
              <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors h-full">
                <input
                  type="checkbox"
                  checked={showOnlySelected}
                  onChange={(e) => setShowOnlySelected(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">{t('ui.showSelectedOnly', 'Selected')}</span>
              </label>

              {/* Sort Dropdown */}
              <div className="flex items-center px-2 hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors h-full">
                <FaSortAmountDown className="text-gray-400 mr-2 text-xs" />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="text-xs font-medium bg-transparent border-none focus:ring-0 cursor-pointer text-gray-700 dark:text-gray-200 py-1 pr-6 pl-0"
                >
                  <option value="date">{t('ui.sortByDate')}</option>
                  <option value="name">{t('ui.sortByName')}</option>
                  <option value="level">{t('ui.sortByLevel')}</option>
                  <option value="star">{t('ui.sortByStar', 'By Star')}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filteredAndSortedPlans.map((plan) => (
            <div key={plan.uuid} className="h-44">
              <StudentGridCard
                plan={plan}
                studentInfo={plan.studentId ? allStudents[plan.studentId] : null}
                portraitBase64={plan.studentId ? studentPortraits[plan.studentId] : undefined}
                onClick={() => setSelectedPlanUuid(plan.uuid)}
                onDuplicate={(e) => handleDuplicatePlan(e, plan)}
              />
            </div>
          ))}

          <button
            onClick={() => addPlan(null)}
            className="h-44 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 dark:border-neutral-700 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-neutral-800 dark:hover:border-blue-500 transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-neutral-800 flex items-center justify-center group-hover:bg-blue-500 transition-colors">
              <FaPlus className="text-gray-400 group-hover:text-white" />
            </div>
            <span className="text-xs font-bold text-gray-500 group-hover:text-blue-600 dark:text-gray-400">{t('ui.addNewPlan')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentPlannerPage;
