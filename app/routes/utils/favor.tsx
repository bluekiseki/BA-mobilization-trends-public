import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FaExternalLinkAlt, FaHeart } from 'react-icons/fa';
import { data, useNavigate, type LoaderFunctionArgs } from 'react-router';

// Utils & Stores
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { cdn } from '~/utils/cdn';
import { getInstance } from '~/middleware/i18next';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { PageHeader } from '~/components/common/PageHeader';
import { localeLink } from '~/utils/localeLink';
import { getGiftAffectionList } from '~/components/planner/StudentGrowth/giftAffectionList';

// Components
import { AffectionTab } from '~/components/planner/StudentGrowth/FaverTab';
import StudentSearchDropdown from '~/components/StudentSearchDropdown';

// Types
import type { EventData, IconData, Student, StudentPortraitData } from '~/types/plannerData';
import type { Route } from './+types/favor';
import type { AppHandle } from '~/types/link';

const BULLET_TYPE_COLORS: Record<string, string> = {
  Explosion: '#b62915',
  Pierce: '#bc8800',
  Mystic: '#206d9b',
  Sonic: '#9a46a8',
  Chemical: '#137973',
};

interface PlanTemplate {
  current: { affection: number; affectionExp: number };
  target: { affection: number };
}

const DEFAULT_PLAN_TEMPLATE: PlanTemplate = {
  current: { affection: 1, affectionExp: 0 },
  target: { affection: 25 },
};

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  return data({
    siteTitle: i18n.t('common:title'),
    title: i18n.t('planner:page.favorCalculator'),
    description: i18n.t('planner:page.description.favorCalculator'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/favorcalc.webp');
}

export function links() {
  return [
    {
      rel: 'preload',
      href: cdn(`/w/students_portrait.json`),
      crossOrigin: 'anonymous',
      as: 'fetch',
    },
    {
      rel: 'preload',
      href: cdn(`/ew/icon_img.json`),
      as: 'fetch',
      crossOrigin: 'anonymous',
    },
    {
      rel: 'preload',
      href: cdn(`/ew/icon_info.json`),
      as: 'fetch',
      crossOrigin: 'anonymous',
    },
    ...createLinkHreflang('/utils/favor'),
  ];
}

export const handle: AppHandle = {
  preload: (data: unknown) => {
    const d = data as Record<string, unknown> | undefined;
    if (!d?.locale) return [];
    const locale = d.locale as Locale;
    return [
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
    ];
  },
};

export const FavorPlannerPage = () => {
  // 1. Data Loading State
  const [allStudents, setAllStudents] = useState<Record<string, Student>>({});
  const [studentPortraits, setStudentPortraits] = useState<StudentPortraitData>({});
  const [iconData, setIconData] = useState<IconData>({});
  const [iconInfoData, setIconInfoData] = useState<EventData['icons'] | null>(null);
  const [loading, setLoading] = useState(true);

  // 2. Local UI State (Independent of Global Store)
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [localPlan, setLocalPlan] = useState<PlanTemplate>(DEFAULT_PLAN_TEMPLATE);

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
        const students: Record<string, Student> = await studentsRes.json();
        const portraits: StudentPortraitData = await portraitsRes.json();

        Object.entries(students).forEach(([id, student]) => {
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
    void fetchData();
  }, [locale]);

  // Handlers
  const handleStudentSelect = useCallback(
    (studentId: number) => {
      setSelectedStudentId(studentId);
      const existingPlan = growthPlans.find((p) => p.studentId === studentId);
      setLocalPlan(
        existingPlan
          ? {
              current: { affection: existingPlan.current.affection, affectionExp: existingPlan.current.affectionExp },
              target: { affection: existingPlan.target.affection },
            }
          : DEFAULT_PLAN_TEMPLATE,
      );
    },
    [growthPlans],
  );

  const handlePlanChange = useCallback((field: string, value: string | number | boolean) => {
    setLocalPlan((prev) => {
      const next: PlanTemplate = { ...prev };
      const numValue = typeof value === 'number' ? value : Number(value);
      if (field.includes('.')) {
        const [p, c] = field.split('.');
        if (p === 'current' || p === 'target') {
          // @ts-expect-error - dynamic nested object update
          next[p] = { ...next[p], [c]: numValue };
        }
      } else {
        // @ts-expect-error - dynamic object update
        next[field as keyof PlanTemplate] = numValue;
      }
      if (field == 'target.affection' && numValue < prev.current.affection) next.current.affection = numValue;
      if (field == 'current.affection' && numValue > prev.target.affection) next.target.affection = numValue;

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
      void navigate(localeLink(locale, '/planner/students'));
    }
  };

  const giftAffectionList = useMemo(() => {
    if (!selectedStudentId || !allStudents[selectedStudentId] || !iconInfoData || !iconInfoData.Item) return [];
    return getGiftAffectionList(allStudents[selectedStudentId], { icons: iconInfoData } as EventData);
  }, [selectedStudentId, allStudents, iconInfoData]);

  if (loading)
    return (
      <div className="flex flex-col justify-center items-center py-32 gap-3">
        <FaHeart className="text-pink-400 animate-pulse" size={28} />
        <p className="text-neutral-400 text-sm">Loading...</p>
      </div>
    );

  const isSelected = selectedStudentId !== null;

  return (
    <div className="px-4 py-8 md:py-10 w-full mx-auto">
      <PageHeader icon={<span className="text-red-400">♥</span>} title={t('page.favorCalculator')} description={t('page.description.favorCalculator')} />

      {/* Student Selection Bar */}
      {!isSelected ? (
        <div className="w-full relative z-10">
          <StudentSearchDropdown students={allStudents} selectedStudentId={selectedStudentId} setSelectedStudentId={handleStudentSelect} hideLavel={true} />
        </div>
      ) : (
        <>
          {/* Selected Student Bar */}
          <div className="flex items-center gap-3 mb-5 p-2 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 animate-fadeIn">
            <div
              className="flex items-center justify-center rounded-full shrink-0 shadow"
              style={{ width: '44px', height: '44px', backgroundColor: BULLET_TYPE_COLORS[allStudents[selectedStudentId].BulletType] || '#888' }}
            >
              {studentPortraits[selectedStudentId] && <img src={`data:image/webp;base64,${studentPortraits[selectedStudentId]}`} alt="icon" width={38} height={38} className="rounded-full" />}
            </div>
            <div className="flex-1 relative z-20">
              <StudentSearchDropdown students={allStudents} selectedStudentId={selectedStudentId} setSelectedStudentId={handleStudentSelect} hideLavel={true} />
            </div>
          </div>

          {/* Calculator Content */}
          <div className="animate-fadeIn w-full">
            <AffectionTab
              plan={localPlan as GrowthPlan}
              giftAffectionList={giftAffectionList}
              eventData={{ icons: iconInfoData } as EventData}
              iconData={iconData}
              handlePlanChange={handlePlanChange}
              allStudents={allStudents}
              studentPortraits={studentPortraits}
            />

            {/* Open in Planner Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleGoToPlanner}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-ba-btn-blue dark:bg-ba-btn-blue-dark text-neutral-900 dark:text-neutral-900 transition-opacity hover:opacity-80 cursor-pointer"
              >
                <span>{t('ui.openInPlanner', 'Open in Planner')}</span>
                <FaExternalLinkAlt className="text-xs" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FavorPlannerPage;
