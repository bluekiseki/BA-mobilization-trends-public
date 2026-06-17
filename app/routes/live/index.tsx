import { useState, useEffect } from 'react';
import { data, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import type { LastData, TimelineData } from '~/types/livetype';
import type { Student } from '~/types/data';
import { isTotalAssault, type PortraitData } from '~/components/dashboard/common';
import { useDataCacheJson } from '~/utils/useDataCacheJson';
import RankScatterChart from '~/components/live/RankScatterChart';
import ScoreTimelineChart from '~/components/live/ScoreTimelineChart';
import TierAnalysisDashboard from '~/components/live/TierAnalysisDashboard';
import Top10Rankings from '~/components/live/Top10Rankings';
import MaxScoreTimelineChart from '~/components/live/MaxScoreTimelineChart';
import { useTranslation } from 'react-i18next';
import { formatDateToDayString } from '~/components/live/formatDateToDayString';
import { getLiveRaidInfo } from '~/data/liveRaid';

import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { getMostDifficultLevel } from '~/components/raid/raidToString';
import { TerrainIconGameStyle, type Terrain } from '~/components/raid/teran';
import { lastdataURL, timelineURL } from '~/data/livedataServer.json';
import { getInstance } from '~/middleware/i18next';
import type { Route } from './+types';
import { cdn } from '~/utils/cdn';
import { env } from 'cloudflare:workers';
import { YouTubeSearchGenerator } from '~/components/dashboard/YouTubeSearchGenerator';
import type { AppHandle } from '~/types/link';

const RANKS_TO_PLOT = [
  1,
  ...Array(20)
    .fill(0)
    .map((_, i) => (1 + i) * 1000),
];

export function meta({ loaderData }: Route.MetaArgs) {
  const raidInfo = loaderData.raidInfos[0];
  const { pageTitle, siteTitle, description, raidType } = loaderData;

  if (raidInfo) {
    const raid = raidInfo;
    // const bosaType = raid.Type ? type_translation[raid.Type][locale] : undefined
    // const isRaid = isTotalAssault(raidInfo)
    return createMetaDescriptor(
      // ${raid.Id.replace(/\w/, 'S')}
      // `${raid.Boss} ${bosaType ? ' ' + bosaType : ''} - ${raidType} ${pageTitle}` + ' | ' + siteTitle,
      `${raid.Id.replace(/\w/, 'S')} ${raid.Boss} ${raidType} -  ${pageTitle}` + ' | ' + siteTitle,
      description,
      '/img/3.webp',
    );
  }

  const title = pageTitle + ' | ' + siteTitle;
  return [{ title }, { property: 'og:title', content: title }, { property: 'twitter:title', content: title }];
}

export async function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  const raidInfos = getLiveRaidInfo(locale);

  if (raidInfos.length == 0) {
    throw new Response('There is currently no raid in progress.', {
      status: 503,
    });
  }
  const isRaid = isTotalAssault(raidInfos[0]);

  // Extract Cloudflare environment variables (env) from context only once.
  // const env = (context as any).cloudflare?.env;

  // Check R2 first; if missing, request via fallbackUrl.
  // Not sure if it's actually faster. Existing ~600ms vs current 500~800ms range is similar.
  const fetchWithR2Fallback = async <T,>(filename: string, fallbackUrl: string) => {
    type R2Object = {
      json: () => Promise<T>;
    };
    type EnvWithBucket = {
      MY_BUCKET?: {
        get: (filename: string) => Promise<R2Object | null>;
      };
    };

    const typedEnv = env as EnvWithBucket;
    if (typedEnv.MY_BUCKET) {
      try {
        const r2Object = await typedEnv.MY_BUCKET.get(filename);
        if (r2Object !== null) {
          // console.log(`[HIT] Retrieved ${filename} from R2.`);
          return await r2Object.json();
        }
      } catch {
        // console.error(`[ERROR] Error querying R2 for ${filename}, falling back to original URL:`, error);
      }
    }

    // Call external URL only if the file is missing in R2 or an error occurred
    // console.log(`[MISS] Data not in R2. Fetching ${filename} from external URL.`);
    const res = await fetch(fallbackUrl);
    if (!res.ok) throw new Error(`Failed to fetch ${filename}`);
    return res.json() as unknown as T;
  };

  try {
    // Using a common function to call both data points in parallel cleanly!
    const [lastData, timelineData] = await Promise.all([fetchWithR2Fallback<LastData>('lastdata.json', lastdataURL), fetchWithR2Fallback<TimelineData>('timeline.json', timelineURL)]);

    // Pass data to components in JSON format.
    return data({
      locale,
      siteTitle: i18n.t('common:title'),
      pageTitle: i18n.t('dashboardIndex:liveBetaTitle'),
      description: i18n.t('liveDashboard:description'),
      raidType: isRaid ? i18n.t('common:raid') : i18n.t('common:eraid'),
      raidInfos,

      lastData,
      timelineData,
    });
  } catch (error) {
    console.error('Error in live dashboard loader:', error);
    throw new Response('Server error', { status: 500 });
  }
}

export function links() {
  return [...createLinkHreflang('/live')];
}

export const handle: AppHandle = {
  preload: (data: unknown) => {
    // Create a link dynamically using the return value (data) of the root loader
    type LoaderData = { locale?: Locale };
    const SUPPORTED_LOCALES: Locale[] = ['en', 'ko', 'ja', 'zh-Hant'];
    const DEFAULT_LOCALE: Locale = 'en';
    const loaderData = data as LoaderData;
    const userLocale = loaderData?.locale;
    const locale: Locale = userLocale && SUPPORTED_LOCALES.includes(userLocale) ? userLocale : DEFAULT_LOCALE;
    // if (!data?.locale) return [];
    return [
      {
        rel: 'preload',
        href: cdn(`/w/${getLocaleShortName(locale)}.students.bin`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn('/w/students_portrait.json'),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      ...createLinkHreflang(`/live`),
    ];
  },
};

export default function LiveDashboardPage() {
  const { lastData: lastData, timelineData: timelineData, raidInfos } = useLoaderData<typeof loader>();
  // const [lastData, setLastData] = useState<LastData>(lastData_f as LastData);
  // const [timelineData, setTimelineData] = useState<TimelineData>(timelineData_f as any);

  const [studentData, setStudentData] = useState<Record<string, Student>>({});
  const [portraitData, setPortraitData] = useState<PortraitData>({});
  const fetchStudents = useDataCacheJson<Record<string, Student>>();
  const { t: t_d, i18n } = useTranslation('dashboardIndex');
  const { t } = useTranslation('liveDashboard');
  const { t: t_c } = useTranslation('common');
  const locale = i18n.language as Locale;
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    console.log('useeffet');
    setIsReady(false);
    Promise.all([fetchStudents(cdn(`/w/${getLocaleShortName(locale)}.students.bin`)), fetch(cdn('/w/students_portrait.json')).then((res) => res.json() as unknown)])
      .then(([studentJson, portraitJson]) => {
        setStudentData(studentJson);
        setPortraitData(portraitJson as PortraitData);
        setIsReady(true);
      })
      .catch((err: unknown) => {
        console.error('Failed to load common data:', err);
        setIsReady(true);
      });
  }, [fetchStudents, locale]);

  const server = 'jp';
  // const raidInfos = LiveRaidInfos
  const isRaid = isTotalAssault(raidInfos[0]);

  if (!raidInfos) return <div className="p-8 text-center">Loading or Processing Data...</div>;

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-12 bg-neutral-50 dark:bg-neutral-900">
      <header className="text-center pb-4 border-b border-neutral-200 dark:border-neutral-700">
        <h1 className="text-xl font-extrabold text-neutral-900 dark:text-white mb-2">{t_d('liveBetaTitle')}</h1>

        <h1 className="text-5xl font-extrabold text-neutral-900 dark:text-white leading-tight">{raidInfos[0].Boss}</h1>

        <div className="flex justify-center items-center gap-2 mt-4">
          <span className="inline-block px-3 py-1 text-sm font-semibold text-black bg-ba-btn-blue rounded-full">
            {(isRaid ? t_c('raid') : t_c('eraid')).replace(/Assault/gi, '').trim()} {/* 総力戦 */}
          </span>
          <span className="inline-flex items-center px-3 py-1 text-sm font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-200 dark:bg-neutral-700 rounded-full">
            <TerrainIconGameStyle terrain={raidInfos[0].Location as Terrain} size={'1.2em'} />
          </span>
          <span className="inline-block px-3 py-1 text-sm font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-200 dark:bg-neutral-700 rounded-full">
            {getMostDifficultLevel(raidInfos[0])} {/* Lunatic */}
          </span>

          <YouTubeSearchGenerator raidInfo={raidInfos[0]} showType={raidInfos.every((v) => v.Type != undefined) ? raidInfos.map((v) => v.Type) : false} />
        </div>

        <div className="mt-6 text-center">
          <p className="pb-1 text-sm text-neutral-500 dark:text-neutral-400">
            Last Update: <span className="font-medium text-neutral-800 dark:text-neutral-300">{formatDateToDayString(new Date(lastData.time.replace(' ', 'T') + 'Z'), raidInfos[0])}</span>
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {t('service_discontinuation_notice')} {t('irregular_update_notice')}
          </p>
          {/* for yesod */}
          {/* <p className="text-sm font-medium text-red-500 dark:text-red-400">
                        The clear times above Insane are estimates.
                    </p> */}
        </div>
      </header>

      <section>
        <h2 className="text-2xl font-bold mb-4">Overview</h2>
        <TierAnalysisDashboard timelineData={timelineData} raidInfos={raidInfos} isRaid={isRaid} />
      </section>

      {/* Clear Distribution Chart*/}

      {isReady && (
        <>
          <section>
            <h2 className="text-2xl font-bold mb-4">{t('platinum_tier_distribution')}</h2>
            <RankScatterChart isRaid={isRaid} lastData={lastData} raidInfos={raidInfos} server={server} />
          </section>

          <section>
            <Top10Rankings isRaid={isRaid} lastData={lastData} raidInfos={raidInfos} server={server} studentData={studentData} portraitData={portraitData} />
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">{t('ranking_cutoff_fluctuation')}</h2>

            <ScoreTimelineChart
              isRaid={isRaid}
              timelineData={timelineData}
              ranksToPlot={RANKS_TO_PLOT}
              // ranksToPlot={[1, 5000, 10000, 20000]}
              raidInfos={raidInfos}
            />
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">{t('highscore_change_by_difficulty')}</h2>
            <MaxScoreTimelineChart isRaid={isRaid} timelineData={timelineData} raidInfos={raidInfos} server={server} />
          </section>
        </>
      )}
    </main>
  );
}
