// app/routes/dashboard.$server.$id.tsx

import { useLoaderData, type LoaderFunctionArgs, data, useLocation, useSearchParams } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GAMESERVER_LIST, type FullData, type GameServer, type Student } from '~/types/data';
import { loadRaidInfosById } from '~/utils/loadRaidInfo';
import { isTotalAssault, type PortraitData, type ReportEntry, type ReportEntryRank, type StudentData } from '~/components/dashboard/common';
import type { loader as rootLorder } from '~/root';
import { HiOutlineChartPie, HiOutlineUsers } from 'react-icons/hi2'; // Icon example

// Import UI components
import RaidHeader from '~/components/dashboard/RaidHeader';
import { getMostDifficultLevel, type_translation, typecolor } from '~/components/raidToString';
import DashboardUI from '~/components/dashboard/dashboardUI';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import type { AppHandle } from '~/types/link';
import { useDataCacheJson } from '~/utils/useDataCacheJson';
import OverviewDashboardUI from '~/components/dashboard/OverviewDashboardUI';
import TierSummary from '~/components/dashboard/TierSummary';
import { getInstance } from '~/middleware/i18next';
import type { Route } from './+types/$server.$id';
import { cdn } from '~/utils/cdn';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { useHelpKey } from '~/utils/usePageHelp';

export function meta({ loaderData }: Route.MetaArgs) {
  const raidInfo = loaderData.raidInfos[0]; //loadRaidInfo(server, locale, params.id || '', params.type || '')
  if (raidInfo) {
    const raid = raidInfo;
    // const bosaType = raid.Type ? type_translation[raid.Type][loaderData.locale] : undefined
    const raidType = loaderData.raidType;
    return createMetaDescriptor(
      // `${raid.Id.replace(/\w/, 'S')} ${raidType} ${raid.Boss} ${raid.Location}${/*bosaType ? ' ' + bosaType :*/ ''} ${loaderData.title}` + ' - ' + loaderData.siteTitle,
      `${raid.Id.replace(/\w/, 'S')} ${raid.Boss} ${raid.Location} - ${raidType} ${loaderData.title}` + ' | ' + loaderData.siteTitle,
      loaderData.description,
      '/img/3.webp',
    );
  }

  return [];
}

export const handle: AppHandle = {
  preload: (data) => {
    // Create a link dynamically using the return value (data) of the root loader

    const { id } = useLoaderData<typeof rootLorder>().params;

    const pathname = useLocation().pathname;
    const match = pathname.match(/\/dashboard\/([a-zA-Z]{2})\//);

    if (!match || !GAMESERVER_LIST.includes(match[1] as GameServer)) return [];
    const server = match[1] as GameServer;
    if (!data?.locale) return [];
    const raidInfos = loadRaidInfosById(server, data?.locale, id || '');

    if (!raidInfos || !id || !raidInfos.length) return [];
    const isRaid = isTotalAssault(raidInfos[0]);

    const raidDataUrl = isRaid ? cdn(`/w/${server}/raid/${id.replace(/\w/, '')}.bin`) : cdn(`/w/${server}/eraid/${id.replace(/\w/, '')}-${raidInfos[0].Type}.bin`);
    return [
      {
        rel: 'preload',
        href: raidDataUrl,
        crossOrigin: 'anonymous',
        as: 'fetch',
      },
      {
        rel: 'preload',
        href: cdn(`/w/${getLocaleShortName(data?.locale)}.students.bin`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/fulldata/${server}/${id}.bin`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      ...createLinkHreflang(`/dashboard/${server}/${id}`),
    ];
  },
};

export function restoreFromDifferenceArray(diffArray: Int32Array): Int32Array {
  if (!diffArray || diffArray.length === 0) return new Int32Array();

  const original: Int32Array = new Int32Array(diffArray.length);
  original[0] = diffArray[0];

  for (let i = 1; i < diffArray.length; i++) {
    original[i] = original[i - 1] - diffArray[i];
  }

  return original;
}

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const { server, id } = params;
  if (!server || !id || !GAMESERVER_LIST.includes(server as GameServer)) {
    throw new Response('Not Found', { status: 404 });
  }

  // const locale = getLocaleFromHeaders(request);
  let i18n = getInstance(context);
  const locale = i18n.language as Locale;
  const raidInfos = loadRaidInfosById(server as GameServer, locale, id);
  if (!raidInfos || raidInfos.length === 0) {
    throw new Response('Raid Info Not Found', { status: 404 });
  }

  const isRaid = isTotalAssault(raidInfos[0]);

  return data({
    locale,
    title: i18n.t('dashboard:shorttitle'),
    description: i18n.t('dashboard:description1'),
    siteTitle: i18n.t('common:title'),
    raidType: isRaid ? i18n.t('common:raid') : i18n.t('common:eraid'),
    raidInfos,
    server: server as GameServer,
    isGrandAssault: raidInfos.length > 1,
    id,
  });
}

export function headers({ loaderHeaders, parentHeaders }: Route.HeadersArgs) {
  if (process.env.NODE_ENV === 'production')
    return {
      // Browser: 5m, Cloudflare Edge: 7d (604800s), SWR: 30d
      'Cache-Control': CACHE_CONTROL_CONFIG,
    };
}

export default function RaidDetailsPage() {
  const { raidInfos, server, isGrandAssault, id } = useLoaderData<typeof loader>();

  const [searchParams, setSearchParams] = useSearchParams();
  const mainView = searchParams.get('view') === 'detail' ? 'detail' : 'overview'; // Default value 'overview'
  const grandAssaultTabs = useMemo(() => (isGrandAssault ? ['All', ...raidInfos.map((r) => r.Type!)] : []), [isGrandAssault, raidInfos]);

  const isRaid = isTotalAssault(raidInfos[0]);
  const helpKeys = useMemo(() => {
    return [
      'dashboard.common', // 1. Common guide to show unconditionally
      isRaid ? 'dashboard.raid' : 'dashboard.elimination', // 2. Conditional-only guide
    ];
  }, [isRaid]);
  useHelpKey(helpKeys);
  const activeTab = useMemo(() => {
    const tabFromUrl = searchParams.get('tab');

    if (isGrandAssault) {
      // Check if tab exists in URL and is in the valid tab list
      if (tabFromUrl && grandAssaultTabs.includes(tabFromUrl)) {
        // [Edge case handling]
        // If 'All' tab (which is disabled) was accessed directly in 'detail' view,
        // force change to the first valid tab.
        if (mainView === 'detail' && tabFromUrl === 'All') {
          return grandAssaultTabs.find((t) => t !== 'All') || raidInfos[0]?.Type || 'All';
        }
        return tabFromUrl;
      }
      // Default value if invalid or missing
      return 'All';
    }
    // Default value for Total Assault
    return 'default';
  }, [searchParams, isGrandAssault, grandAssaultTabs, mainView, raidInfos]);

  const { t: t_c, i18n } = useTranslation('common');
  const { t } = useTranslation('dashboard');
  const locale = i18n.language as Locale;

  // const filteredRaidInfo = raidInfos.filter(v => v.Cnt.Torment)
  // const initType = filteredRaidInfo.length ? filteredRaidInfo[0].Type : raidInfos[0].Type
  // JFD tab state
  // const [activeType, setActiveType] = useState<string>(initType || '');
  // Data caching and state
  const [cachedData, setCachedData] = useState<Record<string, ReportEntryRank[]>>({});
  const [studentData, setStudentData] = useState<StudentData>({});
  const [portraitData, setPortraitData] = useState<PortraitData>({});
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [fullData, setFullData] = useState<FullData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const fetchStudents = useDataCacheJson<Record<string, Student>>();
  const fetchRaidData = useDataCacheJson<ReportEntry[]>();
  const fetchFullData = useDataCacheJson<FullData>();

  // Loading common data (student info, etc.)
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStudents(cdn(`/w/${getLocaleShortName(locale)}.students.bin`)), fetch(cdn('/w/students_portrait.json')).then((res) => res.json() as any)])
      .then(([studentJson, portraitJson]) => {
        setStudentData(studentJson);
        setPortraitData(portraitJson);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load common data:', err);
        setLoading(false);
      });
  }, [locale]);

  useEffect(() => {
    setFullData(null);
    setOverviewLoading(true);
    Promise.all([
      // fetch(`/fulldata/${server}/${id}.json`).then(res => res.json())
      // fetchFullData(`/fulldata/${server}/${id}.bin`, res => res.json()),
      fetchFullData(cdn(`/fulldata/${server}/${id}.bin`)),
    ])
      .then(([data]) => {
        const newdata = {
          rank: new Int32Array(),
          tier_counter: {},
        } as FullData;

        newdata.rank = restoreFromDifferenceArray(Int32Array.from(data.rank));
        if (data.rank_1) newdata.rank_1 = restoreFromDifferenceArray(Int32Array.from(data.rank_1)); // [...data.rank_1])
        if (data.rank_2) newdata.rank_2 = restoreFromDifferenceArray(Int32Array.from(data.rank_2)); // [...data.rank_2)
        if (data.rank_3) newdata.rank_3 = restoreFromDifferenceArray(Int32Array.from(data.rank_3)); // [...data.rank_3])
        if (data.rank_default) newdata.rank_default = structuredClone(data.rank_default);
        if (data.tier_counter) newdata.tier_counter = structuredClone(data.tier_counter);
        setFullData(newdata);
      })
      .catch((err) => {
        console.error('Failed to load common data:', err);
        setFullData(null);
      })
      .finally(() => {
        setOverviewLoading(false); // Finish loading regardless of success/failure
      });
  }, [server, id]);

  // Loading Total Assault / JFD data
  useEffect(() => {
    if (mainView === 'overview') {
      setDashboardLoading(false);
      return;
    }

    if (isGrandAssault && activeTab === 'All') {
      setDashboardLoading(false);
      return;
    }

    const typeKey = isGrandAssault ? activeTab : 'total';
    if (cachedData[typeKey]) {
      setDashboardLoading(false);
      return;
    }

    const raidInfo = isGrandAssault ? raidInfos.find((r) => r.Type === activeTab) : raidInfos[0];
    if (!raidInfo) return;

    const raidDataUrl = isGrandAssault ? cdn(`/w/${server}/eraid/${raidInfo.Id.replace(/\w/, '')}-${raidInfo.Type}.bin`) : cdn(`/w/${server}/raid/${raidInfo.Id.replace(/\w/, '')}.bin`);

    setDashboardLoading(true);
    fetchRaidData(raidDataUrl)
      .then((reportJson) => {
        const reportRankJson = reportJson
          .sort((a, b) => -a.s + b.s)
          .map((v, i) => {
            const vv = v as ReportEntryRank;
            vv.typeRanking = i + 1;
            return vv;
          });
        setCachedData((prev) => ({ ...prev, [typeKey]: reportRankJson }));
        setDashboardLoading(false);
      })
      .catch((err) => {
        console.error(`Failed to load data for ${typeKey}:`, err);
        setDashboardLoading(false);
      });
  }, [mainView, activeTab, server, raidInfos, isGrandAssault, cachedData, fetchRaidData]);

  const setMainView = (view: 'overview' | 'detail') => {
    setSearchParams(
      (prev) => {
        prev.set('view', view);

        // [Edge case handling]
        // If switching to 'detail' view and the current tab is 'All'
        // also change to the first valid tab.
        if (view === 'detail' && prev.get('tab') === 'All') {
          const firstValidType = grandAssaultTabs.find((t) => t !== 'All') || raidInfos[0]?.Type || 'Explosion';
          prev.set('tab', firstValidType);
        }
        return prev;
      },
      { replace: true, preventScrollReset: true },
    ); // Use replace: true to avoid piling up browser history
  };

  const setActiveTab = (tab: string) => {
    // Prevent changing to a disabled tab (&#39;All&#39; in detail view). (Already handled in JSX, but as a double defense)
    if (mainView === 'detail' && tab === 'All') {
      return;
    }
    setOverviewLoading(true);

    setSearchParams(
      (prev) => {
        prev.set('tab', tab);
        return prev;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  // raidInfo corresponding to the currently selected tab (passed to Header and DashboardUI)
  const currentRaidInfo = useMemo(() => {
    // If 'All', or if not in party analysis view, use the first raidInfo (representative info)
    if (!isGrandAssault || activeTab === 'All') {
      return raidInfos[0];
    }
    // If an individual boss tab, use that tab&#39;s raidInfo
    return raidInfos.find((r) => r.Type === activeTab) || raidInfos[0];
  }, [activeTab, raidInfos, isGrandAssault]);

  const handleGoToDetail = () => {
    setMainView('detail');
    // Scroll to the top of the page (navigation area)
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const translatedTypeName = useMemo(() => {
    // Total Assault
    if (!isGrandAssault) {
      return t_c('raid'); // e.g., "Total Assault"
    }
    // JFD (if not allType)
    if (activeTab !== 'All' && type_translation[activeTab as keyof typeof type_translation]) {
      return type_translation[activeTab as keyof typeof type_translation][getLocaleShortName(locale)];
    }
    // Others (All, etc.)
    return '';
  }, [isGrandAssault, activeTab, locale, t]);

  const currentDashboardData = cachedData[isGrandAssault ? activeTab : 'total'];
  const anyDashboardData = currentDashboardData || Object.values(cachedData)[0];

  return (
    <div className="py-2 gap-y-40 px-0 sm:px-4">
      {/* --- Common Header --- */}
      <div className="grid grid-cols-1 lg:grid-cols-1 xl:grid-cols-1 mb-8 ">
        <RaidHeader raidInfo={currentRaidInfo} server={server} isGrandAssault={isGrandAssault} allData={anyDashboardData} showType={isGrandAssault && activeTab !== 'All'} />

        <TierSummary fullData={fullData} raidInfos={raidInfos} server={server} activeTab={activeTab} />
      </div>

      {/* --- Step 1: Main View Selector (Always displayed) --- */}
      <div className="border-b border-gray-200 dark:border-neutral-700 mb-4 px-4">
        <nav className="-mb-px flex justify-center space-x-4 sm:space-x-8" aria-label="Tabs">
          <button
            onClick={() => setMainView('overview')}
            className={`flex items-center justify-center gap-2 whitespace-nowrap py-4 px-1 border-b-2 font-semibold text-sm sm:text-base transition-all ${
              mainView === 'overview'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-neutral-400 hover:border-gray-300 dark:hover:border-neutral-600 hover:text-gray-700 dark:hover:text-neutral-300'
            }`}
          >
            <HiOutlineChartPie className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>{t('overviewStats')}</span>
          </button>
          <button
            onClick={() => setMainView('detail')}
            className={`flex items-center justify-center gap-2 whitespace-nowrap py-4 px-1 border-b-2 font-semibold text-sm sm:text-base transition-all ${
              mainView === 'detail'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-neutral-400 hover:border-gray-300 dark:hover:border-neutral-600 hover:text-gray-700 dark:hover:text-neutral-300'
            }`}
          >
            <HiOutlineUsers className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>{t('topRankTeams')}</span>
          </button>
        </nav>
      </div>

      {/* --- Step 2: Boss Attribute Tabs (JFD only) --- */}
      {isGrandAssault && (
        <div className="flex justify-center flex-wrap gap-3 px-4 pt-2 sm:pb-5 pb-3">
          {grandAssaultTabs.map((tab) => {
            const raidInfoForTab = raidInfos.find((r) => r.Type === tab);
            const isTotalTab = tab === 'All';
            const isDisabled = mainView === 'detail' && isTotalTab;

            return (
              <button
                key={tab}
                onClick={() => !isDisabled && setActiveTab(tab)}
                disabled={isDisabled}
                className={`sm:px-5 px-3.5 sm:py-2.5 py-1.5 text-sm font-semibold rounded-lg transition-all ${activeTab === tab ? 'text-white shadow-lg' : 'text-gray-600 dark:text-neutral-300 bg-gray-200 dark:bg-neutral-800'} ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-80'}`}
                style={{
                  backgroundColor: activeTab === tab ? typecolor[tab as keyof typeof typecolor] || '#0ea5e9' : undefined,
                }}
                title={isDisabled ? 'totalTabDisabledInDetailView' /*t('totalTabDisabledInDetailView')*/ : undefined}
              >
                {isTotalTab ? (
                  'Total'
                ) : (
                  <div className="flex flex-col items-center justify-center text-center leading-tight">
                    <span className="font-semibold">{type_translation[tab as keyof typeof type_translation][getLocaleShortName(locale)]}</span>
                    {raidInfoForTab && (
                      <span className={`mt-1 text-xs  dark:text-neutral-400 ${activeTab === tab ? 'text-neutral-200' : 'text-neutral-500'}`}>{getMostDifficultLevel(raidInfoForTab)}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <hr className="py-3 border-0"></hr>
      {/* overviewLoading:{overviewLoading} / activeTab:{activeTab} / mainView={mainView} */}
      {/* --- Content Area (Common structure) --- */}
      {loading ? (
        <div className="min-h-[50vh] flex justify-center items-center text-2xl cursor-progress">{t_c('loading_txt')}</div>
      ) : (
        <>
          {/* --- 1. 'Overall Score Distribution' (Overview) View --- */}
          {mainView === 'overview' && (
            <>
              {fullData ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-1 xl:grid-cols-1 gap-8 mb-8 ">
                    {/* <Card title={t('totalClearStatus')} defaultExpanded={true}> */}
                    <OverviewDashboardUI activeTab={activeTab} raidInfos={raidInfos} fullData={fullData} server={server} overviewLoading={overviewLoading} setOverviewLoading={setOverviewLoading} />
                    {/* </Card> */}
                  </div>

                  {/* Show button only when not on 'All' tab */}
                  {activeTab !== 'All' && !overviewLoading && (
                    <>
                      <div className="text-center mb-12">
                        <button
                          onClick={handleGoToDetail}
                          className="inline-flex items-center gap-2.5 py-3 px-6 text-white font-semibold rounded-lg shadow-md hover:opacity-80  transition-all"
                          style={{
                            backgroundColor: activeTab !== t_c('raid') ? typecolor[activeTab as keyof typeof typecolor] || '#0ea5e9' : undefined,
                          }}
                        >
                          <HiOutlineUsers className="w-5 h-5" />
                          {t('goToDetailView', { type: translatedTypeName })}
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : overviewLoading ? (
                <div className="min-h-[50vh] flex justify-center items-center text-2xl cursor-progress">{t_c('loading_txt')}</div>
              ) : (
                <div className="min-h-[50vh] flex justify-center items-center text-2xl text-red-500">
                  {/* {t('overviewDataLoadError')} */}
                  overviewDataLoadError
                </div>
              )}
            </>
          )}

          {/* --- 2. 'Top-Rank Party Analysis' (Detail) View --- */}
          {mainView === 'detail' && (
            <>
              {dashboardLoading ? (
                <div className="min-h-[50vh] flex justify-center items-center text-2xl cursor-progress">{t_c('loading_txt')}</div>
              ) : currentDashboardData ? (
                <DashboardUI dashboardData={currentDashboardData} studentData={studentData} portraitData={portraitData} raidInfo={currentRaidInfo} server={server} />
              ) : (
                <div className="min-h-[25vh] text-center px-2 pb-30 sm:px-2 flex justify-center items-center text-2xl">
                  {
                    isGrandAssault && activeTab === 'All' ? t('select_boss_type_for_stats') : 'dataLoadError' //t('dataLoadError') // Failed to load raid data or other error
                  }
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
