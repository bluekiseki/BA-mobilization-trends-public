import { lazy, Suspense, type ReactNode } from 'react';
import { Link, redirect, useLoaderData, useLocation, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { HiArrowLeft, HiExternalLink } from 'react-icons/hi';
import type { Route } from './+types/detail';
import { getInstance } from '~/middleware/i18next';
import { getCombatStyleRepresentativeId } from '~/utils/combatStyle';
import { loadScheduleDataV2 } from '~/utils/calender.data.v2';
import { loadEventRewards, loadRecruitHistory } from '~/features/students/data/recruitHistory';
import { StudentArtPanel } from '~/features/students/components/StudentArtPanel';
import { StudentRecruitHistory } from '~/features/students/components/StudentRecruitHistory';
import { loadStudentDetail } from '~/features/students/data/student.server';
import { useStudentExtras } from '~/features/students/data/studentExtras';
import { StudentAffectionSection, StudentSkillsSection } from '~/features/students/components/StudentPublicSections';
import { createLinkHreflang, createLocalizedUrl, createMetaDescriptor } from '~/components/shell/head';
import { buildContentItems } from '~/features/students/logic/contentItems';
import { ClientOnly } from '~/components/common/ClientOnly';
import { StudentGrowthSection } from '~/features/students/components/StudentGrowthSection';
import { StudentUsageSection } from '~/features/students/components/StudentUsageSection';
import { SheetIcon } from '~/components/common/SheetIcon';
import { localeLink } from '~/utils/localeLink';
import { StudentTraits } from '~/features/students/components/StudentTraits';
import { StudentQuickSearch } from '~/features/students/components/StudentQuickSearch';
import { BULLET_COLORS } from '~/utils/gameColors';
import type { Locale } from '~/utils/i18n/config';
import { rememberStudentTab, studentPath } from '~/features/students/logic/studentTab';
import { useStudentLink } from '~/features/students/logic/useStudentLink';
import { studentSheetPreloadLinks } from '~/utils/iconSheet';
import type { AppHandle } from '~/types/link';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';

// Pulls in the story data, so it only loads when the tab is opened
const StudentScenarioSection = lazy(() => import('~/features/students/components/StudentScenarioSection').then((m) => ({ default: m.StudentScenarioSection })));

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  // The growth plan and the stories belong to the primary combat style, so the secondary form's tabs open on the primary one
  const tabParam = new URL(request.url).searchParams.get('tab');
  const requestedId = Number(params.studentId);
  if (Number.isInteger(requestedId) && (tabParam === 'growth' || tabParam === 'story')) {
    const primaryId = String(getCombatStyleRepresentativeId(requestedId));
    if (primaryId !== params.studentId) {
      const search = new URL(request.url).searchParams;
      throw redirect(localeLink(locale, `/students/${primaryId}?${search.toString()}`));
    }
  }
  const detail = await loadStudentDetail(request, locale, params.studentId);
  // Goal deadlines come from the schedules of both servers; only needed by the growth tab.
  const growthSchedules =
    new URL(request.url).searchParams.get('tab') === 'growth'
      ? { kr: loadScheduleDataV2({ server: 'kr', tracksToLoad: ['raid', 'multifloor', 'event'] }), jp: loadScheduleDataV2({ server: 'jp', tracksToLoad: ['raid', 'multifloor', 'event'] }) }
      : null;
  return {
    ...detail,
    recruitHistory: loadRecruitHistory(detail.student.Id),
    eventRewards: loadEventRewards(detail.student.Id, locale),
    growthSchedules: growthSchedules && {
      kr: { raid: growthSchedules.kr.tracks.raid, multifloor: growthSchedules.kr.tracks.multifloor, event: growthSchedules.kr.tracks.event },
      jp: { raid: growthSchedules.jp.tracks.raid, multifloor: growthSchedules.jp.tracks.multifloor, event: growthSchedules.jp.tracks.event },
    },
    locale,
    title: i18n.t('students:title'),
    siteTitle: i18n.t('common:title'),
  };
}
export function headers() {
  if (process.env.NODE_ENV === 'production') return { 'Cache-Control': CACHE_CONTROL_CONFIG };
}

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [{ title: 'Student not found' }, { name: 'robots', content: 'noindex' }];
  const path = `/students/${data.student.Id}`;
  const description = data.student.ProfileIntroduction.replace(/\s+/g, ' ').slice(0, 160);
  return [
    ...createMetaDescriptor(`${data.student.Name} · ${data.title} | ${data.siteTitle}`, description, '/img/equipment.webp', createLocalizedUrl(data.locale, path)),
    { tagName: 'link', rel: 'canonical', href: createLocalizedUrl(data.locale, path) },
    ...createLinkHreflang(path).map((link) => ({ tagName: 'link', ...link })),
  ];
}

// Underline marks the open tab; the -mb-px lets it cover the nav's own bottom border
const tabClass = (active: boolean) =>
  `-mb-px border-b-2 px-3 py-2.5 ${active ? 'border-neutral-900 font-bold text-neutral-900 dark:border-neutral-100 dark:text-neutral-100' : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'}`;

export default function StudentDetail() {
  const { student, summons, styles, related, posters, fullArt, growthSchedules, recruitHistory, eventRewards, locale } = useLoaderData<typeof loader>();
  const { t } = useTranslation('students');
  const [searchParams] = useSearchParams();
  // Filters of the list this page was opened from, so going back keeps them
  const location = useLocation();
  const navState: unknown = location.state;
  const studentLink = useStudentLink(locale);
  const listSearch = (location.state as { listSearch?: unknown } | null)?.listSearch;
  // The tab lives in the URL so it survives reloads and can be linked directly
  const tabParam = searchParams.get('tab');
  // Tabs of the student's primary combat style, the one the growth plan and the stories are kept under
  const primaryId = getCombatStyleRepresentativeId(student.Id);
  const hasArt = !!fullArt || posters.length > 0;
  const tab = tabParam === 'stats' || tabParam === 'growth' || tabParam === 'story' ? tabParam : 'info';
  // The story tab only needs the stories; the profile also reads the jukebox and the item icons (for the gifts)
  const { memorialRank, bgm, gifts, favorStories } = useStudentExtras(student, locale, { stories: tab === 'info' || tab === 'story', music: tab === 'info', icons: tab === 'info' });
  const { t: club } = useTranslation('club');
  const { t: game } = useTranslation('game');
  const { i18n } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const growthContentItems = {
    kr: growthSchedules ? buildContentItems([...growthSchedules.kr.raid, ...growthSchedules.kr.multifloor], today, locale, i18n) : [],
    jp: growthSchedules ? buildContentItems([...growthSchedules.jp.raid, ...growthSchedules.jp.multifloor], today, locale, i18n) : [],
  };
  const familyName = student.FamilyNameRuby ? (
    <ruby>
      {student.FamilyName}
      <rt>{student.FamilyNameRuby}</rt>
    </ruby>
  ) : (
    student.FamilyName
  );
  const facts: [string, ReactNode][] = [
    [t('school'), club(student.School, { defaultValue: student.School })],
    [t('club'), club(student.Club, { defaultValue: student.Club })],
    [t('voice'), student.CharacterVoice],
    [t('height'), student.CharHeightMetric],
    [t('age'), student.CharacterAge],
    [t('birthday'), student.Birthday],
    [t('hobby'), student.Hobby],
  ];
  return (
    <div className="px-4 py-6 text-neutral-900 dark:text-neutral-100">
      <div className="flex items-center justify-between gap-3">
        <Link
          prefetch="intent"
          className="flex shrink-0 items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
          to={localeLink(locale, `/students${typeof listSearch === 'string' && listSearch ? `?${listSearch}` : ''}`)}
        >
          <HiArrowLeft aria-hidden size={14} />
          {t('title')}
        </Link>
        <StudentQuickSearch locale={locale} tab={tab} listState={navState} />
      </div>
      <header className="my-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 sm:gap-x-5">
        <div className="relative h-16 w-16 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800 sm:row-span-2 sm:h-24 sm:w-24">
          <SheetIcon sheet="student" id={student.Id} alt={student.Name} />
          <div className="absolute inset-x-0 bottom-0 h-1" style={{ backgroundColor: BULLET_COLORS[student.BulletType] }} />
        </div>
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
            {student.FamilyName && student.FamilyName !== student.Name && <span className="mr-2 text-neutral-500 dark:text-neutral-400">{familyName}</span>}
            {student.Name}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {club(student.School, { defaultValue: student.School })} · {club(student.Club, { defaultValue: student.Club })}
          </p>
        </div>
        {/* Full width under the icon on phones so the badges do not wrap into a narrow column */}
        <div className="col-span-2 space-y-2 sm:col-span-1 sm:col-start-2">
          <StudentTraits student={student} locale={locale} />
          {styles.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">{t('combatStyle')}</span>
              {styles.map((style) => (
                <Link
                  key={style.Id}
                  replace
                  preventScrollReset
                  state={navState}
                  aria-current={style.Id === student.Id ? 'page' : undefined}
                  to={localeLink(locale, studentPath(style.Id, tab))}
                  className={`rounded border px-2 py-0.5 ${style.Id === student.Id ? 'border-ba-btn-blue bg-ba-btn-blue text-neutral-900' : 'border-neutral-300 dark:border-neutral-600'}`}
                >
                  {style.Name} · {game(`tactic_roles.${style.TacticRole.charAt(0).toLowerCase() + style.TacticRole.slice(1)}`, { defaultValue: style.TacticRole })}
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>
      <nav aria-label={t('tabs')} className="mb-4 flex flex-wrap gap-x-1 border-b border-neutral-200 text-sm dark:border-neutral-700">
        <Link
          replace
          preventScrollReset
          state={navState}
          onClick={() => rememberStudentTab('info')}
          aria-current={tab === 'info' ? 'page' : undefined}
          className={tabClass(tab === 'info')}
          to={localeLink(locale, `/students/${student.Id}`)}
        >
          {t('tabInfo')}
        </Link>
        <Link
          replace
          preventScrollReset
          state={navState}
          onClick={() => rememberStudentTab('stats')}
          aria-current={tab === 'stats' ? 'page' : undefined}
          className={tabClass(tab === 'stats')}
          to={localeLink(locale, `/students/${student.Id}?tab=stats`)}
        >
          {t('tabUsage')}
        </Link>
        <Link
          replace
          preventScrollReset
          state={navState}
          onClick={() => rememberStudentTab('growth')}
          aria-current={tab === 'growth' ? 'page' : undefined}
          className={tabClass(tab === 'growth')}
          to={localeLink(locale, `/students/${primaryId}?tab=growth`)}
        >
          {t('tabGrowth')}
        </Link>
        <Link
          replace
          preventScrollReset
          state={navState}
          onClick={() => rememberStudentTab('story')}
          aria-current={tab === 'story' ? 'page' : undefined}
          className={tabClass(tab === 'story')}
          to={localeLink(locale, `/students/${primaryId}?tab=story`)}
        >
          {t('tabScenario')}
        </Link>
      </nav>
      {tab === 'stats' ? (
        <StudentUsageSection studentId={student.Id} />
      ) : tab === 'story' ? (
        <ClientOnly>
          <Suspense fallback={null}>
            <StudentScenarioSection
              key={student.Id}
              studentId={student.Id}
              favorStories={favorStories}
              globalReleased={student.IsReleased[1] ?? true}
              locale={locale}
              outfitNames={Object.fromEntries([student, ...related].map((outfit) => [`Favor/${outfit.Id}`, outfit.Name]))}
            />
          </Suspense>
        </ClientOnly>
      ) : tab === 'growth' ? (
        <StudentGrowthSection key={student.Id} studentId={student.Id} starGrade={student.StarGrade} contentItems={growthContentItems} schedules={growthSchedules} today={today} />
      ) : (
        <>
          <section id="profile" className={`scroll-mt-24 grid gap-x-4 gap-y-4 py-6 lg:gap-x-8 ${hasArt ? 'grid-cols-[1fr_auto]' : ''}`}>
            <h2 className="col-span-full -mb-2 text-xl font-bold">{t('profile')}</h2>
            <p className="whitespace-pre-line text-sm leading-6">{student.ProfileIntroduction.trim().replace(/\n{2,}/g, '\n')}</p>
            {hasArt && (
              <StudentArtPanel
                key={`art-${student.Id}`}
                studentId={student.Id}
                name={student.Name}
                art={fullArt ?? null}
                posters={posters}
                locale={locale}
                className="col-start-2 row-start-2 sm:row-span-3"
              />
            )}
            <dl aria-label={t('factsTitle')} className={`grid grid-cols-2 gap-x-6 text-sm ${hasArt ? 'col-span-2 sm:col-span-1 sm:col-start-1' : 'sm:grid-cols-4'}`}>
              {facts.map(([label, value]) => (
                <div key={label} className="border-t border-neutral-200 py-2 dark:border-neutral-700">
                  <dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt>
                  <dd className="font-medium">{value || t('unknown')}</dd>
                </div>
              ))}
            </dl>
            {!!related.length && (
              <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${hasArt ? 'col-span-2 sm:col-span-1 sm:col-start-1' : ''}`}>
                <h3 className="text-sm font-semibold">{t('outfits')}</h3>
                {related.map((alt) => (
                  <Link key={alt.Id} className="flex items-center gap-2 text-sm hover:underline" to={studentLink(alt.Id)}>
                    <span className="h-8 w-8 shrink-0 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
                      <SheetIcon sheet="student" id={alt.Id} alt="" />
                    </span>
                    {alt.Name}
                  </Link>
                ))}
              </div>
            )}
            {student.PathName && (
              <a
                href={`https://schaledb.com/student/${student.PathName}`}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-1 text-xs text-neutral-500 hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400 ${hasArt ? 'col-span-2 sm:col-span-1 sm:col-start-1' : ''}`}
              >
                {t('dataSource')}: SchaleDB
                <HiExternalLink aria-hidden />
              </a>
            )}
          </section>
          <StudentSkillsSection key={`skills-${student.Id}`} student={student} summons={summons} />
          <div className="grid gap-x-10 lg:grid-cols-2">
            <StudentAffectionSection key={`affection-${student.Id}`} student={student} outfits={related} gifts={gifts} memorialRank={memorialRank} bgm={bgm} locale={locale} />
            <div>
              <StudentRecruitHistory key={`recruit-${student.Id}`} history={recruitHistory} events={eventRewards} locale={locale} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export const handle: AppHandle = {
  preload: () => studentSheetPreloadLinks(),
};
