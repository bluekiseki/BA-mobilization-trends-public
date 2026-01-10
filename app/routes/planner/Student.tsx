// app/routes/planner/Student.tsx
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ItemIcon } from '~/components/planner/common/Icon';
import { StudentGrowthPlanCard } from '~/components/planner/StudentGrowth/StudentGrowthPlanCard';
import { StudentGrowthSummaryCard } from '~/components/planner/StudentGrowth/StudentGrowthSummaryCard';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import type { EventData, IconData, StudentData, StudentPortraitData } from '~/types/plannerData';
import { calculatedGrowthNeeds } from '~/utils/calculatedGrowthNeeds';
// import iconDataInfoModule from "~/data/event/icon_info.json"
// import iconDataAllModule from "~/data/event/icon_img.json"
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { data, Link, type LoaderFunctionArgs } from 'react-router';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import type { Route } from './+types/Student';
import { getInstance } from '~/middleware/i18next';
import { FaCompressArrowsAlt, FaExpandArrowsAlt, FaExternalLinkAlt } from 'react-icons/fa';
import { localeLink } from '~/utils/localeLink';
import { cdn } from '~/utils/cdn';

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  let i18n = getInstance(context);
  return data({
    siteTitle: i18n.t("home:title"),
    title: i18n.t("planner:page.studentGrowthPlanner"),
    description: i18n.t("planner:page.description.studentGrowthPlanner"),
  })
}


export function meta({ loaderData }: Route.MetaArgs) {

  return createMetaDescriptor(
    loaderData.title + ' | ' + loaderData.siteTitle,
    loaderData.description,
    "/img/p.webp"
  )
}

export function links() {
  return [
    ...createLinkHreflang('/planner/students')
  ]
}

export const StudentPlannerPage = () => {
  const [allStudents, setAllStudents] = useState<StudentData>({});
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData>({});
  // const [iconData, setIconData] = useState<IconData | null>(null);
  // const [iconInfoData, setIconInfoData] = useState<EventData["icons"] | null>(null);
  // const iconInfoData = iconDataInfoModule as any as EventData["icons"]
  // const iconData = iconDataAllModule as IconData
  const [iconData, setIconData] = useState<IconData>({});
  const [iconInfoData, setIconInfoData] = useState<EventData["icons"]>({} as any);
  const [loading, setLoading] = useState(true);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  // State to store the uuid of the currently selected (detail view) card
  const [selectedPlanUuid, setSelectedPlanUuid] = useState<string | null>(null);
  const { t, i18n } = useTranslation("planner");
  const { t: t_c } = useTranslation("common");
  const locale = i18n.language as Locale


  useEffect(() => {
    const fetchData = async () => {
      try {
        const [studentsRes, portraitsRes, iconImgRes, iconInfoRes] = await Promise.all([
          fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)),
          fetch(cdn('/w/students_portrait.json')),
          fetch(cdn(`/ew/icon_img.json`)),
          fetch(cdn(`/ew/icon_info.json`)),
        ]);
        setAllStudents(await studentsRes.json());
        setStudentPortraits(await portraitsRes.json());
        setIconData(await iconImgRes.json());
        setIconInfoData(await iconInfoRes.json())
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [locale]);

  const { growthPlans, addPlan } = useGlobalStore();

  const totalNeeds = useMemo(() => {
    return calculatedGrowthNeeds(growthPlans, allStudents)
  }, [growthPlans, allStudents]);

  const studentOptions = useMemo(() =>
    Object.entries(allStudents).sort(([, a], [, b]) => a.Name.localeCompare(b.Name)),
    [allStudents]);

  // Find the Plan object for the selected student
  const selectedPlan = useMemo(() =>
    growthPlans.find(p => p.uuid === selectedPlanUuid),
    [growthPlans, selectedPlanUuid]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>{t_c("loading_txt")}</p>
      </div>
    );
  }


  return (
    <div className="bg-gray-100 dark:bg-neutral-900 min-h-screen p-3 sm:p-7">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="p-1 flex justify-between items-center">
          <h1 className="text-3xl font-bold dark:text-gray-100">{t('page.studentGrowthPlanner')}</h1>
          <button onClick={() => addPlan(null)} className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors">
            {t("ui.addNewPlan")}
          </button>
        </header>


        {/* 2-column / fullscreen layout based on screen size */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* --- Left: Student list (hidden on mobile when viewing details) --- */}
          <div className={`lg:col-span-1 space-y-4 ${selectedPlanUuid ? 'hidden lg:block' : 'block'}`}>
            {growthPlans.length > 0 ? (
              growthPlans.map(plan => (
                <StudentGrowthSummaryCard
                  key={plan.uuid}
                  plan={plan}
                  allStudents={allStudents}
                  studentPortraits={studentPortraits}
                  isSelected={plan.uuid === selectedPlanUuid}
                  onClick={() => setSelectedPlanUuid(plan.uuid)}
                />
              ))
            ) : (
              <div className="text-center text-gray-500 dark:text-gray-400 p-10 bg-white dark:bg-neutral-800 rounded-lg shadow-sm border dark:border-neutral-700">
                <p className="font-semibold dark:text-gray-200">{t("ui.noStudentGrowthPlan")}</p>
                <p className="text-sm mt-1">{t("ui.startByAddingNewPlan")}</p>
              </div>
            )}

            {/* Total required materials */}
            {Object.keys(totalNeeds).length > 0 && iconData && (
              <div className="p-4 bg-white dark:bg-neutral-800 rounded-xl shadow-md sticky top-4">

                {/* 1. Header: Title and Expand Button */}
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-xl font-bold dark:text-gray-100">
                    {t('ui.totalNeededTitle', 'Total Requirements')}
                  </h2>
                  <button
                    onClick={() => setIsSummaryExpanded(prev => !prev)}
                    className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
                    title={isSummaryExpanded ? t_c('close') : t_c('open')}
                  >
                    {isSummaryExpanded ? <FaCompressArrowsAlt size={14} /> : <FaExpandArrowsAlt size={14} />}
                  </button>
                </div>

                {/* 2. Link Area (Considering extensibility) */}
                <div className="flex items-center gap-4 mb-3 pb-3 border-b dark:border-neutral-700">
                  <Link
                    to={localeLink(locale, "/planner/equipment")}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <FaExternalLinkAlt size={10} />
                    {/* Add text label */}
                    <span>{t('equipment.goToPlanner', 'Go to Equipment Planner')}</span>
                  </Link>
                  {/* Other links can be added here later */}
                </div>

                {/* 3. Content Area */}
                <div className={`flex flex-wrap gap-2 transition-all duration-300 ease-in-out ${isSummaryExpanded ? 'max-h-[50vh] overflow-y-auto' : 'max-h-48 overflow-y-auto'
                  } scrollbar-thin`}>
                  {Object.entries(totalNeeds).map(([key, amount]) => {
                    if (amount <= 0) return null;
                    const [type, id] = key.split('_');
                    return <ItemIcon key={key} type={type} itemId={id} amount={amount as number} size={14} eventData={{ icons: iconInfoData } as EventData} iconData={iconData} />;
                  })}
                </div>
              </div>
            )}

          </div>

          {/* --- Right: Detail view (fullscreen on mobile, shown on right on desktop) --- */}
          {selectedPlan && (
            <div className="lg:col-span-2 sticky top-4">
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
          )}

          {/* Placeholder when nothing is selected on desktop */}
          {!selectedPlanUuid && (
            <div className="hidden lg:flex lg:col-span-2 items-center justify-center h-96 bg-white dark:bg-neutral-800 rounded-lg shadow-sm border-2 border-dashed dark:border-neutral-700">
              <p className="text-gray-400 dark:text-gray-500">{t("ui.selectStudentForDetails")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


export default StudentPlannerPage