import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FaExternalLinkAlt, FaSearch, FaHeart } from 'react-icons/fa';
import { data, useNavigate, type LoaderFunctionArgs } from 'react-router';

// Utils & Stores
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { cdn } from '~/utils/cdn';
import { getInstance } from '~/middleware/i18next';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { localeLink } from '~/utils/localeLink';
import { getGiftAffectionList } from '~/components/planner/StudentGrowth/giftAffectionList';

// Components
import { AffectionTab } from '~/components/planner/StudentGrowth/FaverTab';
import StudentSearchDropdown from '~/components/StudentSearchDropdown';

// Types
import type { EventData, IconData, StudentData, StudentPortraitData } from '~/types/plannerData';
import type { Route } from './+types/favor';

const BULLET_TYPE_COLORS: Record<string, string> = {
  Explosion: '#b62915',
  Pierce: '#bc8800',
  Mystic: '#206d9b',
  Sonic: '#9a46a8',
  Chemical: '#137973',
};

const DEFAULT_PLAN_TEMPLATE = {
  current: { affection: 1, affectionExp: 0 },
  target: { affection: 25 },
};

export async function loader({ context }: LoaderFunctionArgs) {
  let i18n = getInstance(context);
  return data({
    siteTitle: i18n.t('common:title'),
    title: i18n.t('planner:page.favorCalculator'),
    description: i18n.t('planner:page.description.favorCalculator'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/f.webp');
}

export function links() {
  return [...createLinkHreflang('/planner/favor')];
}

export const FavorPlannerPage = () => {
  // 1. Data Loading State
  const [allStudents, setAllStudents] = useState<StudentData>({});
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData>({});
  const [iconData, setIconData] = useState<IconData>({});
  const [iconInfoData, setIconInfoData] = useState<EventData['icons']>({} as any);
  const [loading, setLoading] = useState(true);

  // 2. Local UI State (Independent of Global Store)
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [localPlan, setLocalPlan] = useState(DEFAULT_PLAN_TEMPLATE);

  const { t, i18n } = useTranslation('planner');
  const locale = i18n.language as Locale;
  const navigate = useNavigate();
  const { growthPlans, addPlan, updatePlan } = useGlobalStore();

  // Fetch Data
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

        Object.entries(students).forEach(([id, student]: any) => {
          student.Portrait = portraits[parseInt(id)];
        });

        setAllStudents(students);
        setStudentPortraits(portraits);
        setIconData(await iconImgRes.json());
        setIconInfoData(await iconInfoRes.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [locale]);

  // Handlers
  const handleStudentSelect = useCallback((studentId: number) => {
    setSelectedStudentId(studentId);
    setLocalPlan(DEFAULT_PLAN_TEMPLATE); // Reset to default on new selection
  }, []);

  const handlePlanChange = useCallback((field: string, value: any) => {
    1;
    console.log('handlePlanChange', field, value);
    setLocalPlan((prev) => {
      const next = { ...prev };
      if (field.includes('.')) {
        const [p, c] = field.split('.');
        // @ts-ignore
        next[p] = { ...next[p], [c]: value };
      } else {
        // @ts-ignore
        next[field] = value;
      }
      if (field == 'target.affection' && value < prev.current.affection) next.current.affection = value;
      if (field == 'current.affection' && value > prev.target.affection) next.target.affection = value;

      return next;
    });
  }, []);

  const handleGoToPlanner = () => {
    if (!selectedStudentId) return;

    let targetUuid = growthPlans.find((p) => p.studentId === selectedStudentId)?.uuid;

    // Create new plan if not exists
    if (!targetUuid) {
      targetUuid = addPlan(null);
      if (targetUuid) updatePlan(targetUuid, 'studentId', selectedStudentId);
      else {
        // Handle case where addPlan returns null (e.g. max plans reached, reuse empty)
        const empty = useGlobalStore.getState().growthPlans.find((p) => p.studentId === null);
        if (empty) {
          targetUuid = empty.uuid;
          updatePlan(targetUuid, 'studentId', selectedStudentId);
        }
      }
    }

    // Update Global Store with Local Calculation
    if (targetUuid) {
      updatePlan(targetUuid, 'current.affection', localPlan.current.affection);
      updatePlan(targetUuid, 'target.affection', localPlan.target.affection);
      navigate(localeLink(locale, '/planner/students'));
    }
  };

  const giftAffectionList = useMemo(() => {
    if (!selectedStudentId || !allStudents[selectedStudentId] || !iconInfoData.Item) return [];
    return getGiftAffectionList(allStudents[selectedStudentId], { icons: iconInfoData } as EventData);
  }, [selectedStudentId, allStudents, iconInfoData]);

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <p className="text-neutral-400">Loading...</p>
      </div>
    );

  const isSelected = selectedStudentId !== null;

  return (
    <div className="px-4 py-8 md:py-10 w-full mx-auto">
      {/* Title */}
      <div className="mb-6">
        <h1 className="text-xl font-bold flex items-center gap-2 text-neutral-800 dark:text-neutral-100">
          <FaHeart className="text-pink-500" />
          <span>{t('page.favorCalculator')}</span>
        </h1>
        {!isSelected && <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{t('page.description.favorCalculator')}</p>}
      </div>

      {/* Search Section */}
      <section className={`transition-all duration-300 w-full ${isSelected ? 'mb-4' : 'min-h-[40vh] flex flex-col justify-center items-center'}`}>
        {!isSelected ? (
          <div className="w-full max-w-lg text-center space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-500">
              <FaSearch size={32} />
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-neutral-700 dark:text-neutral-200">{t('ui.selectStudentToStart', 'Select a student to start')}</h2>
            <div className="w-full relative z-10">
              <StudentSearchDropdown students={allStudents as any} selectedStudentId={selectedStudentId} setSelectedStudentId={handleStudentSelect} hideLavel={true} />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 w-full animate-fadeIn">
            <div
              className="flex items-center justify-center rounded-full shrink-0 shadow-sm"
              style={{ width: '48px', height: '48px', backgroundColor: BULLET_TYPE_COLORS[allStudents[selectedStudentId!].BulletType] || '#888' }}
            >
              {studentPortraits[selectedStudentId!] && <img src={`data:image/webp;base64,${studentPortraits[selectedStudentId!]}`} alt="icon" width={40} height={40} className="rounded-full" />}
            </div>
            <div className="flex-1 relative z-20">
              <StudentSearchDropdown students={allStudents as any} selectedStudentId={selectedStudentId} setSelectedStudentId={handleStudentSelect} hideLavel={true} />
            </div>
          </div>
        )}
      </section>

      {/* Calculator Content */}
      {isSelected && (
        <div className="animate-fadeIn w-full space-y-6">
          <AffectionTab
            plan={localPlan as GrowthPlan} // Type assertion for UI component compatibility
            giftAffectionList={giftAffectionList}
            eventData={{ icons: iconInfoData } as EventData}
            iconData={iconData}
            handlePlanChange={handlePlanChange}
          />
          <div className="flex justify-end">
            <button
              onClick={handleGoToPlanner}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition-all font-medium text-sm"
            >
              <span>{t('ui.openInPlanner', 'Open in Student Growth Planner')}</span>
              <FaExternalLinkAlt className="text-xs" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FavorPlannerPage;
