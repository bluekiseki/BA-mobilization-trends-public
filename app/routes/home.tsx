// app/routes/home.tsx
import { useState } from 'react';
import { RemainingTime } from '~/components/common/RemainingTime';
import { needsDocumentLoad } from '~/hooks/isolatedRoutes';
import { Trans, useTranslation } from 'react-i18next';
import { EventCard, ServerBadge, StatusBadge } from '~/features/home/EventStatusCard';
import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import type { Route } from './+types/home';
import { DEFAULT_LOCALE, getLocaleShortName, SUPORTED_LOCALES, type Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import { CalendarWidget } from '~/features/calendar/CalendarWidget';
import { LOCALE_DEFAULT_REGION, NoticeWidget } from '~/features/notices/NoticeWidget';
import { cdn } from '~/utils/cdn';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { createLinkHreflang, createMetaDescriptor } from '~/components/shell/head';
import { useIsDarkState } from '~/store/isDarkState';
import type { GameServer } from '~/types/data';

import { loginEnabled } from '~/data/livedataServer.json';

import { typecolor, type_translation_sorted } from '~/components/raid/raidToString';
import { TerrainIconGameStyle, type Terrain } from '~/components/raid/teran';

import { MonthEndResetBanner } from '~/features/home/MonthEndResetBanner';
import { LoginAvailableBanner } from '~/features/home/LoginAvailableBanner';
import { Changelog } from '~/features/notices/Changelog';

import { BirthdayWidget } from '~/features/home/BirthdayWidget';
import { HiChevronRight } from 'react-icons/hi2';

// Screenshot images
import heatmapImage from '/img/2.webp'; // no dark variant
import type { AppHandle } from '~/types/link';

import { type StatusRaid } from '~/features/home/homeStatus';
import { loadHomeStatus } from '~/features/home/loadHomeStatus';

export function loader(args: LoaderFunctionArgs) {
  return loadHomeStatus(args);
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.siteTitle, loaderData.description, '/img/1.webp');
}

export function links() {
  return [...createLinkHreflang('/')];
}

export const handle: AppHandle = {
  preload: (data: unknown) => {
    const d = data as Record<string, unknown> | undefined;
    const locale = typeof d?.locale === 'string' && SUPORTED_LOCALES.includes(d.locale as Locale) ? (d.locale as Locale) : DEFAULT_LOCALE;
    const newsServer = LOCALE_DEFAULT_REGION[locale];
    return [
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: `/api/notices?region=${newsServer}&sort=new&type=ALL&limit=5`,
        as: 'fetch',
      },
    ];
  },
};

export function headers() {
  if (process.env.NODE_ENV === 'production') return { 'Cache-Control': CACHE_CONTROL_CONFIG };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RaidCard({ raid, server, locale }: { raid: StatusRaid | null; server: 'JP' | 'GL/KR'; locale: Locale }) {
  const { t: t_g } = useTranslation('game');
  if (!raid) return <EmptyRaidCard server={server} />;

  const seasonNum = raid.id.substring(1);
  const localeShort = getLocaleShortName(locale);
  const raidTypeLabel = raid.isGrand ? t_g('eraid') : t_g('raid');

  const inner = (
    <>
      {/* Header: badges + terrain */}
      <div className="flex items-center gap-1.5">
        <ServerBadge server={server} />
        <StatusBadge status={raid.status} />
        {raid.locations.length > 0 && (
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {raid.locations.map((terrain) => (
              <TerrainIconGameStyle key={terrain} terrain={terrain as Terrain} size="1em" />
            ))}
          </span>
        )}
      </div>

      {/* Boss name */}
      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 leading-snug grow">
        <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500 mr-1">S{seasonNum}</span>
        {raid.bossName}
      </p>

      {/* Footer: type badges (Grand) or type label (Total) + end date */}
      <div className="flex items-center gap-1 flex-wrap">
        {raid.isGrand && raid.types && raid.types.length > 0 ? (
          raid.types.map((type) => (
            <span key={type} className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white leading-none" style={{ backgroundColor: typecolor[type as keyof typeof typecolor] }}>
              {type_translation_sorted[type as keyof typeof type_translation_sorted]?.[localeShort] ?? type}
            </span>
          ))
        ) : (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">{raidTypeLabel}</span>
        )}
        {raid.endDateIso && raid.startDateIso && (
          <RemainingTime
            targetDate={raid.status === 'upcoming' ? new Date(raid.startDateIso) : new Date(raid.endDateIso)}
            isUpcoming={raid.status === 'upcoming'}
            className="text-xs text-neutral-400 dark:text-neutral-500 ml-auto"
          />
        )}
      </div>
    </>
  );

  // No link for JP upcoming, or when live/dashboard data is not yet available
  if (server === 'JP' && (raid.status === 'upcoming' || raid.noLink)) {
    return (
      <div className="rounded-sm border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-800/70 backdrop-blur-sm p-3.5 flex flex-col gap-2 min-h-24 cursor-default">{inner}</div>
    );
  }

  const to = raid.status === 'live' ? localeLink(locale, '/live') : localeLink(locale, `/dashboard/jp/${raid.id}`);
  return (
    <Link
      to={to}
      className="group rounded-sm border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-800/70 backdrop-blur-sm p-3.5 hover:border-blue-400 dark:hover:border-blue-500 flex flex-col gap-2 min-h-24"
    >
      {inner}
    </Link>
  );
}

function EmptyRaidCard({ server }: { server: 'JP' | 'GL/KR' }) {
  const { t } = useTranslation('common');
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-800/70 backdrop-blur-sm p-3.5 flex flex-col gap-2 min-h-24">
      <div className="flex items-center gap-1.5">
        <ServerBadge server={server} />
      </div>
      <p className="text-sm text-neutral-400 dark:text-neutral-500 grow flex items-center">{t('home.kivotosPeace')}</p>
    </div>
  );
}

// Tool links — Analytics rows (server-toggled) + Tool cards (with descriptions)
function ToolLinks({ locale, isDark }: { locale: Locale; isDark: boolean }) {
  const [server, setServer] = useState<'jp' | 'kr'>('jp');
  const { t: tCommon } = useTranslation('common');
  const { t: tDashboard } = useTranslation('dashboard');
  const { t: tCharts } = useTranslation('charts');
  // Uses common:navigation/homeFeatures (not planner namespace) to avoid pulling in the ~76KB planner.json bundle.
  const { t: tNav } = useTranslation('common', { keyPrefix: 'navigation' });
  const { t: t_ui } = useTranslation('ui');
  const { t: tHomeFeatures } = useTranslation('common', { keyPrefix: 'homeFeatures' });
  const { t: tEmblem } = useTranslation('emblemCounter');
  const { t: tMypage } = useTranslation('mypage');

  const s = server.toUpperCase();

  const analyticsLinks = [
    {
      to: localeLink(locale, `/dashboard/${server}`),
      img: isDark ? '/img/3_dark.webp' : '/img/3.webp',
      title: tCommon('dashboard-btn'),
      desc: tDashboard('description1'),
      badge: s,
    },
    {
      to: localeLink(locale, `/charts/${server}/ranking`),
      img: isDark ? '/img/1_dark.webp' : '/img/1.webp',
      title: tCommon('btn2'),
      desc: tCharts('ranking.description1'),
      badge: s,
    },
    {
      to: localeLink(locale, '/students/10000?tab=stats'),
      img: heatmapImage,
      title: tCommon('btn1'),
      desc: tCharts('heatmap.description1'),
      badge: s,
    },
  ];

  const toolCards = [
    {
      to: localeLink(locale, '/planner/event'),
      img: isDark ? '/img/p_dark.webp' : '/img/p.webp',
      title: tNav('eventPlanner'),
      desc: tHomeFeatures('eventPlannerDesc'),
    },
    {
      to: localeLink(locale, '/planner/gacha'),
      img: isDark ? '/img/gacha_dark.webp' : '/img/gacha.webp',
      title: `${tNav('gachaPlanner', 'Pyroxene Planner')} (BETA)`,
      desc: tHomeFeatures('gachaPlannerDesc', 'Calculate income & Simulate gacha'),
    },
    {
      to: localeLink(locale, '/students'),
      img: isDark ? '/img/growth_dark.webp' : '/img/growth.webp',
      title: t_ui('studentGrowthPlanner'),
      desc: tHomeFeatures('studentGrowthPlannerDesc'),
    },
    {
      to: localeLink(locale, '/planner/equipment'),
      img: isDark ? '/img/equipment_dark.webp' : '/img/equipment.webp',
      title: `${tNav('equipmentFarmingPlanner')} (BETA)`,
      desc: tHomeFeatures('equipmentFarmingPlannerDesc'),
    },
    {
      to: localeLink(locale, '/charts/favor'),
      img: isDark ? '/img/f_dark.webp' : '/img/f.webp',
      title: tEmblem('title'),
      desc: tEmblem('description'),
    },
    {
      to: localeLink(locale, '/utils/favor'),
      img: isDark ? '/img/favorcalc_dark.webp' : '/img/favorcalc.webp',
      title: tNav('favorCalculator'),
      desc: tHomeFeatures('favorCalculatorDesc'),
    },
    {
      to: localeLink(locale, '/utils/jukebox'),
      img: isDark ? '/img/j_dark.webp' : '/img/j.webp',
      title: tNav('jukebox'),
      desc: tHomeFeatures('jukeboxDesc'),
    },
    {
      to: localeLink(locale, '/scanner/item'),
      img: isDark ? '/img/scanner_dark.webp' : '/img/scanner.webp',
      title: tNav('itemScanner'),
      desc: tHomeFeatures('itemScannerDesc'),
    },
    {
      to: localeLink(locale, '/scanner/student'),
      img: cdn('/img/student-scanner.webp'),
      title: tNav('studentScanner'),
      desc: tHomeFeatures('studentScannerDesc'),
    },
    {
      to: localeLink(locale, '/my/raids'),
      img: isDark ? '/img/myRaids_dark.webp' : '/img/myRaids.webp',
      title: tMypage('raids.title'),
      desc: tMypage('raids.description'),
    },
    {
      to: localeLink(locale, '/my/gacha'),
      img: isDark ? '/img/myGacha_dark.webp' : '/img/myGacha.webp',
      title: tMypage('gacha.title'),
      desc: tMypage('gacha.description'),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Analytics — server toggle + compact rows */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{tCommon('home.analytics')}</span>
          <div className="inline-flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
            {(['jp', 'kr'] as const).map((sv) => (
              <button
                key={sv}
                onClick={() => setServer(sv)}
                className={`px-3 py-1 text-sm font-bold rounded-md transition-all ${
                  server === sv
                    ? 'bg-white dark:bg-neutral-600 text-blue-600 dark:text-blue-300 shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                }`}
              >
                {sv.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {analyticsLinks.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              reloadDocument={needsDocumentLoad(item.to)}
              className="flex items-center gap-3 p-2.5 rounded-sm bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-blue-400 dark:hover:border-blue-500 group"
            >
              <img src={item.img} alt={item.title} className="w-22 h-22 rounded object-cover object-top shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold text-neutral-800 dark:text-neutral-100">
                    <Trans components={[<wbr />]}>{item.title}</Trans>
                  </span>
                  <span className="text-sm font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">{item.badge}</span>
                </div>
                <p className="text-sm text-neutral-400 line-clamp-3 mt-0.5">
                  <Trans components={[<wbr />]}>{item.desc}</Trans>
                </p>
              </div>
              <HiChevronRight className="text-neutral-400 group-hover:text-blue-500 shrink-0 transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      {/* Tools — 3-column cards with screenshot + description */}
      <div>
        {loginEnabled && <LoginAvailableBanner locale={locale} />}
        <span className="text-sm font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 block mb-6">{tCommon('home.plannersAndTools')}</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {toolCards.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              reloadDocument={needsDocumentLoad(item.to)}
              className="group flex flex-col rounded-sm p-2 border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-blue-400 dark:hover:border-blue-500 overflow-hidden"
            >
              <div className="aspect-video overflow-hidden bg-neutral-50 dark:bg-neutral-900">
                <img src={item.img} alt={item.title} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" />
              </div>
              <div className="p-1.5 mt-3">
                <h3 className="text-base font-bold text-neutral-800 dark:text-neutral-100">
                  <Trans components={[<wbr />]}>{item.title}</Trans>
                </h3>
                <p className="text-sm text-neutral-400 line-clamp-3 mt-1 leading-tight">
                  <Trans components={[<wbr />]}>{item.desc}</Trans>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomeV2() {
  const { locale, jpEvent, glEvent, jpRaid, glRaid, calendarWidgets, recentChangelog } = useLoaderData<typeof loader>();
  const { t } = useTranslation('common');
  const { isDark } = useIsDarkState();
  const [calendarServer, setCalendarServer] = useState<GameServer>(locale === 'ja' ? 'jp' : 'kr');

  // return <></>

  return (
    <>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-sky-100 to-neutral-50 dark:from-neutral-800 dark:to-neutral-900" />
        <div className="relative m-auto max-w-7xl px-6 md:py-24 py-20 text-center transition-colors duration-300">
          {/* <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-blue-500 to-cyan-400 mb-2 tracking-tight font-pretendard">{t('title')}</h1>
          <p className="text-base text-neutral-500 dark:text-neutral-400 max-w-xl mx-auto">{t('description')}</p> */}
          <h1 className="text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-blue-500 to-cyan-400 mb-4 tracking-tight font-pretendard">{t('title')}</h1>
          <p className={'text-lg md:text-xl max-w-2xl mx-auto text-neutral-600 dark:text-neutral-300 mb-10 ' + (locale == 'ko' ? 'break-keep' : '')}>{t('description')}</p>
        </div>
      </div>

      <div className="m-auto max-w-7xl px-4 pb-20 -mt-1 space-y-12">
        {/* Status Grid */}
        <section className="pt-1">
          {/* Month-end shop reset warning — client-side only */}
          <MonthEndResetBanner />
          {/* <h2 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-2.5">{t('home.currentStatus')}</h2> */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <RaidCard raid={jpRaid} server="JP" locale={locale} />
            <RaidCard raid={glRaid} server="GL/KR" locale={locale} />
            <EventCard event={jpEvent} server="JP" locale={locale} />
            <EventCard event={glEvent} server="GL/KR" locale={locale} />
          </div>
        </section>

        {/* Birthday */}
        <BirthdayWidget locale={locale} />

        {/* Calendar */}
        <section>
          <div className="flex items-center justify-between mb-6.5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t('home.schedule')}</h2>
            <div className="inline-flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
              {(['jp', 'kr'] as GameServer[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setCalendarServer(s)}
                  className={`px-2.5 py-1 text-sm font-medium rounded-md transition-all ${
                    calendarServer === s
                      ? 'bg-white dark:bg-neutral-600 text-blue-600 dark:text-blue-300 shadow-sm'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                  }`}
                >
                  {s === 'jp' ? 'JP' : 'GL/KR'}
                </button>
              ))}
            </div>
          </div>
          <CalendarWidget key={`${locale}-${calendarServer}`} server={calendarServer} scheduleData={calendarWidgets[calendarServer]} />
        </section>

        {/* Tool Links */}
        <section>
          {/* <h2 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-2.5">{t('home.tools')}</h2> */}
          <ToolLinks locale={locale} isDark={isDark === 'dark'} />
        </section>

        {/* Notice */}
        <section>
          {/* <h2 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-2.5">{t('home.notices')}</h2> */}
          <NoticeWidget />
        </section>

        {/* Changelog */}
        <section>
          <Changelog changelogData={recentChangelog} moreHref="/changelog" />
        </section>

        <p className="text-center text-xs text-neutral-400 dark:text-neutral-500 pb-4">
          {t('last-update')} <time>{recentChangelog[0]?.date}</time> (JP), 2025-09-09 (KR)
        </p>
      </div>
    </>
  );
}
