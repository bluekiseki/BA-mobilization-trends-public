import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { data, Link, useLoaderData } from 'react-router';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import type { GameServer } from '~/types/data';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { Trans } from 'react-i18next';

import rankingImage from '/img/1.webp';
import heatmapImage from '/img/2.webp';
import dashboardImage from '/img/3.webp';
import jukeboxImage from '/img/j.webp';
import plannerImage from '/img/p.webp';
import plannerDarkImage from '/img/p_dark.webp';
import favorImage from '/img/f.webp';
import favorDarkImage from '/img/f_dark.webp';

import rankingDarkImage from '/img/1_dark.webp';
const heatmapDarkImage = heatmapImage;
import dashboarDarkdImage from '/img/3_dark.webp';
import jukeboxDarkImage from '/img/j_dark.webp';
import { useIsDarkState } from '~/store/isDarkState';
import { Changelog } from '~/components/Changelog';
import changelogJson from '~/data/changelog.json';
import { getInstance } from '~/middleware/i18next';
import type { Route } from './+types/home';
import { localeLink } from '~/utils/localeLink';
import { CalendarWidget, loadCalendarWidgetData } from '~/components/CalendarWidget';
import type { AppHandle } from '~/types/link';
import { cdn } from '~/utils/cdn';

export async function loader(args: Route.LoaderArgs) {
  const { request: _request, context, params: _params } = args;
  let i18n = getInstance(context);
  const [calendarDataJp, calendarDataKr] = await Promise.all([loadCalendarWidgetData(context, 'jp'), loadCalendarWidgetData(context, 'kr')]);

  return data({
    title: i18n.t('common:site-title'),
    description: i18n.t('common:description'),
    calendarDataJp,
    calendarDataKr,
    trans: {
      dashboard: {
        title: i18n.t('common:dashboard-btn'),
        description: i18n.t('dashboard:description1'),
        go: i18n.t('common:dashboard-btn-go'),
      },
      planner: {
        title: i18n.t('planner:page.planner'),
        description: i18n.t('planner:page.plannerescription'),
        go: i18n.t('planner:page.planner-go'),
      },
      jukebox: {
        title: i18n.t('planner:page.jukebox'),
        description: i18n.t('planner:page.jukeboxdescription'),
        go: i18n.t('planner:page.jukebox-go'),
      },
      ranking: {
        title: i18n.t('common:btn2'),
        description: i18n.t('charts:ranking.description1'),
        go: i18n.t('common:btn2-go'),
      },
      heatmap: {
        title: i18n.t('common:btn1'),
        description: i18n.t('charts:heatmap.description1'),
        go: i18n.t('common:btn1-go'),
      },
      emblem: {
        title: i18n.t('emblemCounter:title'),
        description: i18n.t('emblemCounter:description'),
        go: i18n.t('emblemCounter:go'),
      },
    },
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title, loaderData.description, '/img/1.webp');
}

export function links() {
  return [...createLinkHreflang('')];
}

export const handle: AppHandle = {
  preload: (data) => {
    return [
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(data?.locale)}.students.min.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: cdn(`/w/students_portrait.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
    ];
  },
};

export default function Home() {
  const locale = useTranslation().i18n.language as Locale;
  const { t } = useTranslation('common');
  const { t: t_c } = useTranslation('common');
  // const { t: t_d } = useTranslation("dashboard");
  // const { t: t_p } = useTranslation("planner");
  // const { t: t_e } = useTranslation("emblemCounter");
  // const { t: t_chart } = useTranslation("charts");
  const { isDark } = useIsDarkState();
  const { calendarDataJp, calendarDataKr, trans } = useLoaderData<typeof loader>();

  const [selectedServer, setSelectedServer] = useState<GameServer>('jp');
  // const getServerButtonStyle = (server: GameServer) => {
  //   const baseStyle = "w-full sm:w-auto px-6 py-3 text-lg font-semibold rounded-lg shadow-md transition-colors duration-300";
  //   if (selectedServer === server) {
  //     // Selected
  //     return `${baseStyle} bg-blue-600 text-white cursor-default`;
  //   }
  //   // Unselected
  //   return `${baseStyle} bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600`;
  // };

  const calendarData = selectedServer === 'jp' ? calendarDataJp : calendarDataKr;

  return (
    <>
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-sky-100 to-neutral-50 dark:from-neutral-700 dark:to-neutral-900" />
        <div className="relative m-auto max-w-4xl text-center py-20 px-6 transition-colors duration-300">
          <h1 className="text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-blue-500 to-cyan-400 mb-4 tracking-tight font-pretendard">{t('title')}</h1>
          <p className={'text-lg md:text-xl max-w-2xl mx-auto text-neutral-600 dark:text-neutral-300 mb-10 ' + (locale == 'ko' ? 'break-keep' : '')}>{t('description')}</p>
          <div className="flex justify-center items-center gap-3 mb-4">
            <label htmlFor="server-select" className="text-lg font-semibold text-neutral-700 dark:text-neutral-200">
              Select a Server:
            </label>
            <select
              id="server-select"
              value={selectedServer}
              onChange={(e) => setSelectedServer(e.target.value as GameServer)}
              className="px-4 py-2 text-base text-neutral-800 dark:text-white bg-white/80 dark:bg-neutral-700/80 border border-neutral-300 dark:border-neutral-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm transition"
            >
              <option value="jp">JP</option>
              <option value="kr">KR</option>
            </select>
          </div>
        </div>
      </div>

      <div className="m-auto max-w-5xl px-6 pb-20 -mt-1">
        <div className="m-auto p-0 pt-4 pb-8">
          <CalendarWidget loaderData={calendarData} server={selectedServer} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Link
            to={localeLink(locale, `/dashboard/${selectedServer}`)}
            // to={`/dashboard/${selectedServer}`}
            className="group flex flex-col bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden z-10"
          >
            <div className="aspect-square w-full p-4 max-h-60">
              <img src={isDark == 'dark' ? dashboarDarkdImage : dashboardImage} alt="Dashboard" className="w-full h-full object-cover  object-top" />
            </div>
            <div className="p-6 flex flex-col grow" style={{ wordBreak: 'keep-all' }}>
              <h3 className="text-2xl font-bold text-neutral-800 dark:text-white mb-2">
                {/* <Trans i18nKey="common:dashboard-btn" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.dashboard.title}</Trans>
              </h3>
              <p className="text-neutral-500 dark:text-neutral-400 mb-4 grow">
                {/* <Trans i18nKey="dashboard:description1" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.dashboard.description}</Trans>
              </p>
              <span className="font-semibold text-blue-600 dark:text-blue-400 group-hover:underline mt-2">
                {/* <Trans i18nKey="common:dashboard-btn-go" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.dashboard.go}</Trans>({selectedServer.toUpperCase()}) &rarr;
              </span>
            </div>
          </Link>

          <Link
            to={localeLink(locale, `/planner/event`)}
            // to={`/planner/event/`}
            className="group flex flex-col bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden z-10"
          >
            <div className="aspect-square w-full p-4 max-h-60">
              <img src={isDark == 'dark' ? plannerDarkImage : plannerImage} alt="jukebox" className="w-full h-full object-cover" />
            </div>
            <div className="p-6 flex flex-col grow">
              <h3 className="text-2xl font-bold text-neutral-800 dark:text-white mb-2">
                {/* <Trans i18nKey="planner:page.planner" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.planner.title}</Trans>
                {/* <b>(Experimental)</b> */}
              </h3>
              <p className="text-neutral-500 dark:text-neutral-400 mb-4 grow">
                {/* <Trans i18nKey="planner:page.plannerescription" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.planner.description}</Trans>
              </p>
              <span className="font-semibold text-blue-600 dark:text-blue-400 group-hover:underline mt-2">
                {/* <Trans i18nKey="planner:page.planner-go" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.planner.go}</Trans>
                &rarr;
              </span>
            </div>
          </Link>

          <Link
            to={localeLink(locale, `/utils/jukebox`)}
            // to={`/utils/jukebox`}
            className="group flex flex-col bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden z-10"
          >
            <div className="aspect-square w-full p-4 max-h-60">
              <img src={isDark == 'dark' ? jukeboxDarkImage : jukeboxImage} alt="jukebox" className="w-full h-full object-cover" />
            </div>
            <div className="p-6 flex flex-col grow">
              <h3 className="text-2xl font-bold text-neutral-800 dark:text-white mb-2">
                {/* <Trans i18nKey="planner:page.jukebox" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.jukebox.title}</Trans>
              </h3>
              <p className="text-neutral-500 dark:text-neutral-400 mb-4 grow">
                {/* <Trans i18nKey="planner:page.jukeboxdescription" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.jukebox.description}</Trans>
              </p>
              <span className="font-semibold text-blue-600 dark:text-blue-400 group-hover:underline mt-2">
                {/* <Trans i18nKey="planner:page.jukebox-go" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.jukebox.go}</Trans> &rarr;
              </span>
            </div>
          </Link>

          <Link
            to={localeLink(locale, `/charts/${selectedServer}/ranking`)}
            // to={`/charts/${selectedServer}/ranking`}
            className="group flex flex-col bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden z-10"
          >
            <div className="aspect-square w-full p-4 max-h-60">
              <img src={isDark == 'dark' ? rankingDarkImage : rankingImage} alt="Ranking" className="w-full h-full object-cover" />
            </div>
            <div className="p-6 flex flex-col grow">
              <h3 className="text-2xl font-bold text-neutral-800 dark:text-white mb-2">
                {/* <Trans i18nKey="common:btn2" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.ranking.title}</Trans>
              </h3>
              <p className="text-neutral-500 dark:text-neutral-400 mb-4 grow">
                {/* <Trans i18nKey="charts:ranking.description1" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.ranking.description}</Trans>
              </p>
              <span className="font-semibold text-blue-600 dark:text-blue-400 group-hover:underline mt-2">
                {/* <Trans i18nKey="common:btn2-go" components={[<wbr />]} />  */}
                <Trans components={[<wbr />]}>{trans.ranking.go}</Trans>({selectedServer.toUpperCase()}) &rarr;
              </span>
            </div>
          </Link>

          <Link
            to={localeLink(locale, `/charts/${selectedServer}/heatmap`)}
            // to={`/charts/${selectedServer}/heatmap`}
            className="group flex flex-col bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden z-10"
          >
            <div className="aspect-square w-full p-4 max-h-60">
              <img src={isDark == 'dark' ? heatmapDarkImage : heatmapImage} alt="Heatmap" className="w-full h-full object-cover" />
            </div>
            <div className="p-6 flex flex-col grow">
              <h3 className="text-2xl font-bold text-neutral-800 dark:text-white mb-2">
                {/* <Trans i18nKey="common:btn1" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.heatmap.title}</Trans>
              </h3>
              <p className="text-neutral-500 dark:text-neutral-400 mb-4 grow">
                {/* <Trans i18nKey="charts:heatmap.description1" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.heatmap.description}</Trans>
              </p>
              <span className="font-semibold text-blue-600 dark:text-blue-400 group-hover:underline mt-2">
                {/* <Trans i18nKey="common:btn1-go" components={[<wbr />]} />  */}
                <Trans components={[<wbr />]}>{trans.heatmap.go}</Trans>({selectedServer.toUpperCase()}) &rarr;
              </span>
            </div>
          </Link>

          <Link
            to={localeLink(locale, `/charts/favor`)}
            // to={`/charts/favor`}
            className="group flex flex-col bg-white dark:bg-neutral-800 rounded-2xl shadow-lg border border-neutral-200 dark:border-neutral-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden z-10"
          >
            <div className="aspect-square w-full p-4 max-h-60">
              <img src={isDark == 'dark' ? favorDarkImage : favorImage} alt="Heatmap" className="w-full h-full object-cover" />
            </div>
            <div className="p-6 flex flex-col grow">
              <h3 className="text-2xl font-bold text-neutral-800 dark:text-white mb-2">
                {/* <Trans i18nKey="emblemCounter:title" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.emblem.title}</Trans>
              </h3>
              <p className="text-neutral-500 dark:text-neutral-400 mb-4 grow">
                {/* <Trans i18nKey="emblemCounter:description" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.emblem.description}</Trans>
              </p>
              <span className="font-semibold text-blue-600 dark:text-blue-400 group-hover:underline mt-2">
                {/* <Trans i18nKey="emblemCounter:go" components={[<wbr />]} /> */}
                <Trans components={[<wbr />]}>{trans.emblem.go}</Trans>({selectedServer.toUpperCase()}) &rarr;
              </span>
            </div>
          </Link>
        </div>
        <div className="pt-10">
          <Changelog changelogData={changelogJson} />
        </div>
      </div>

      <div className="text-center py-8 m-auto max-w-5xl px-4">
        <p className="text-sm text-neutral-500 dark:text-neutral-400 py-3">
          {t('last-update')} <time>{changelogJson[0].date}</time> (JP), 2025-09-09 (KR)
        </p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 py-3">{t_c('dataWarning')}</p>
      </div>
    </>
  );
}
