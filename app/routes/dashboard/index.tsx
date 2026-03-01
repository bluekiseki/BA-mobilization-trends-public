// app/routes/dashboard/index.tsx

import { data, Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { GAMESERVER_LIST, type GameServer, type RaidFullInfo } from '~/types/data';
import { useTranslation } from 'react-i18next';
import { getMostDifficultLevel, type_translation_sorted, typecolor } from '~/components/raidToString';
import { getLocaleShortName, type Locale, type LocaleShortName } from '~/utils/i18n/config';
import { loadRaidFullInfos } from '~/utils/loadRaidInfo';
import { TerrainIconGameStyle, type Terrain } from '~/components/teran';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { getLiveRaidInfo } from '~/data/liveRaid';
import { isTotalAssault } from '~/components/dashboard/common';
import type { Route } from './+types';
import { getInstance } from '~/middleware/i18next';
import { localeLink } from '~/utils/localeLink';
import bossData from '~/data/bossdata.json';
// import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
// import { getBracketFromTotalScore } from '~/components/Difficulty';
// import { formatTimeToTimestamp } from '~/utils/time';
import { HiUserGroup } from 'react-icons/hi';
// import { FaTrophy } from 'react-icons/fa6';
// import { IoMdTime } from 'react-icons/io';
import { BsPinAngleFill } from 'react-icons/bs';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { getCurrentGlobalraid } from '~/data/globalRaidDates';
// import { usePageHelp } from '~/utils/usePageHelp';

// Define types: Total Assault is RaidInfo, Joint Firing Drill is RaidInfo array.
type GroupedRaidInfo = RaidFullInfo | RaidFullInfo[];

const bossNameData = Object.fromEntries(
  Object.entries(bossData).map(([k, v]) => {
    return [k, v.name as Record<LocaleShortName, string>];
  }),
);

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const { server } = params;
  if (!server || !GAMESERVER_LIST.includes(server as GameServer)) {
    throw new Response('Not Found', { status: 404 });
  }

  // const locale = getLocaleFromHeaders(request);
  let i18n = getInstance(context);
  const locale = i18n.language as Locale;
  // const raidInfos = loadRaidInfos(server as GameServer, locale);
  const raidInfos = loadRaidFullInfos(server as GameServer);

  const raidGroups = new Map<string, RaidFullInfo[]>();
  for (const raid of raidInfos) {
    if (!raidGroups.has(raid.Id)) {
      raidGroups.set(raid.Id, []);
    }
    raidGroups.get(raid.Id)!.push(raid);
  }

  const groupedRaidInfos: GroupedRaidInfo[] = Array.from(raidGroups.values()).map((group) => {
    return group.length === 1 ? group[0] : group;
  });

  // raid search logic to be fixed
  let pinnedTotalAssault: RaidFullInfo | null = null;
  let pinnedGrandAssault: RaidFullInfo[] | null = null;

  if (server === 'jp' && locale !== 'ja') {
    // Sort by current date (latest order)
    const sortedForPin = [...groupedRaidInfos].sort((a, b) => {
      const dateA = Array.isArray(a) ? a[0].Date : a.Date;
      const dateB = Array.isArray(b) ? b[0].Date : b.Date;
      return new Date(dateB.split(' ~ ')[0]).getTime() - new Date(dateA.split(' ~ ')[0]).getTime();
    });

    const currentGlobalraids = getCurrentGlobalraid();

    for (const raidGroup of sortedForPin) {
      if (Array.isArray(raidGroup)) {
        if (currentGlobalraids.includes(raidGroup[0].Id)) pinnedGrandAssault = raidGroup;
      } else if (currentGlobalraids.includes(raidGroup.Id)) pinnedTotalAssault = raidGroup;

      // Stop scanning if you find both types
      if (pinnedTotalAssault && pinnedGrandAssault) break;
    }
  }

  return data({
    title: i18n.t('dashboardIndex:title'),
    description: i18n.t('dashboardIndex:description'),
    siteTitle: i18n.t('common:title'),
    groupedRaidInfos,
    server: server as GameServer,
    locale,
    pinnedTotalAssault, // Raid Data to Stuck
    pinnedGrandAssault, // Raid Data to Stuck
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/3.webp');
}

export function links() {
  return [...createLinkHreflang('/dashboard')];
}

export function headers({ loaderHeaders, parentHeaders }: Route.HeadersArgs) {
  if (process.env.NODE_ENV === 'production')
    return {
      'Cache-Control': CACHE_CONTROL_CONFIG,
    };
}

function MiniStat({ icon, value, sub, className = '' }: { icon?: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-1 leading-none text-neutral-600 dark:text-neutral-400 ${className}`}>
      {icon && <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{icon}</span>}
      <span className="tabular-nums tracking-tight font-medium">{value}</span>
      {sub && <span className="text-[9px] text-neutral-400 dark:text-neutral-500 tabular-nums">{sub}</span>}
    </div>
  );
}

function TotalAssaultCard({ region, raidInfo, locale }: { region: GameServer; raidInfo: RaidFullInfo; locale: Locale }) {
  const { Id: id, Boss, Date: date, Location: location } = raidInfo;
  const { t } = useTranslation('common');
  const difficultLevel = getMostDifficultLevel(raidInfo);
  const difficultClearCount = difficultLevel ? raidInfo.Cnt[difficultLevel] : 0;

  // const timeString = raidInfo.Platinum ? formatTimeToTimestamp(calculateTimeFromScore(raidInfo.Platinum, raidInfo.Boss, region, raidInfo.Id) || 0) : null;

  return (
    <Link
      to={localeLink(locale, `/dashboard/${region}/${id}`)}
      className="group flex flex-col h-full w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-500 transition-all p-3"
    >
      {/* Header */}
      <div className="flex justify-between items-center text-sm text-neutral-500 dark:text-neutral-400 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-xs">{t('raid')}</span>
          <span className="w-px h-2 bg-neutral-300 dark:bg-neutral-600"></span>
          <TerrainIconGameStyle terrain={location as Terrain} size={'1em'} />
        </div>
        <time className="font-mono text-neutral-400 dark:text-neutral-500 font-light text-xs">{date.split('~')[0].trim()}</time>
      </div>

      {/* Main: Boss Name */}
      <div className="flex justify-between items-end mb-3">
        <h3 className="text-xl font-black text-neutral-800 dark:text-neutral-100 truncate pr-2 tracking-tight leading-none">
          <span className="text-xs font-light text-gray-400 mr-1.5 relative -top-1.25">S{id.substring(1)}</span>
          {bossNameData[Boss]?.[getLocaleShortName(locale)] || Boss}
        </h3>
        <div className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500 mb-0.5">
          <MiniStat icon={<HiUserGroup />} value={raidInfo?.TotalParticipants?.toLocaleString()} />
        </div>
      </div>

      {/* Footer: Stats Grid */}
      {}
      {}
      <div className="mt-auto pt-2.5 border-t border-dashed border-neutral-200 dark:border-neutral-700 flex justify-between items-end gap-2">
        {/* Left: Max Diff Clear */}
        <div className="flex items-center gap-1 leading-none mb-0.5">
          <div className="px-1.5 py-0.5 rounded-[2px] bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-600">
            <span className="text-xs font-medium">{difficultLevel}</span>
          </div>
          <span className="text-xs text-neutral-600 dark:text-neutral-300 tabular-nums font-normal ml-0.5">{difficultClearCount?.toLocaleString()}</span>
        </div>

        {/* Right: Platinum (Purple) */}
        {}
        {/* <div className="text-right shrink-0">
          <div className="flex items-center justify-end gap-1.5 text-purple-700 dark:text-purple-400">
            <FaTrophy className="text-sm opacity-60" />
            <span className="text-sm font-semibold tabular-nums">{raidInfo.Platinum?.toLocaleString()}</span>
          </div>
          {timeString && (
            <div className="flex items-center justify-end gap-1 text-xs text-purple-600/70 dark:text-purple-400/60 tabular-nums font-normal mt-0.5">
              <IoMdTime className="text-xs" />
              {timeString}
            </div>
          )}
        </div> */}
      </div>
    </Link>
  );
}

function GrandAssaultCard({ region, raidInfos, locale }: { region: string; raidInfos: RaidFullInfo[]; locale: Locale }) {
  const primaryRaid = raidInfos[0];
  const { Id: id, Boss, Date: date, Location: location } = primaryRaid;
  const { t } = useTranslation('common');

  return (
    <Link
      to={localeLink(locale, `/dashboard/${region}/${id}`)}
      className="group flex flex-col h-full w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-500 transition-all p-3"
    >
      {/* Header */}
      <div className="flex justify-between items-center text-sm text-neutral-500 dark:text-neutral-400 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{t('eraid')}</span>
          <span className="w-px h-2 bg-neutral-300 dark:bg-neutral-600"></span>
          <TerrainIconGameStyle terrain={location as Terrain} size={'1em'} />
        </div>
        <time className="font-mono text-neutral-400 dark:text-neutral-500 font-light text-xs">{date.split('~')[0].trim()}</time>
      </div>

      {/* Main: Boss Name */}
      <div className="flex justify-between items-end mb-4">
        <h3 className="text-xl font-black text-neutral-800 dark:text-neutral-100 truncate pr-2 tracking-tight leading-none">
          <span className="text-xs font-light text-gray-400 mr-1.5 relative -top-1.25">S{id.substring(1)}</span>
          {bossNameData[Boss]?.[getLocaleShortName(locale)] || Boss}
        </h3>
        <div className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500 mb-0.5">
          <MiniStat icon={<HiUserGroup />} value={primaryRaid?.TotalParticipants?.toLocaleString()} />
        </div>
      </div>

      {/* Footer: Defense Types & Platinum */}
      {}
      <div className="mt-auto pt-2.5 border-t border-dashed border-neutral-200 dark:border-neutral-700 flex justify-between items-end gap-2">
        {/* Left: Defense Types List */}
        <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">
          {raidInfos.map((raid) => {
            const diff = getMostDifficultLevel(raid);
            const count = diff ? raid.Cnt[diff] : 0;

            return (
              <div key={raid.Type} className="flex items-center gap-1.5 leading-none">
                {/* Badge */}
                <div className="flex items-center px-1 py-0.5 rounded-[2px] text-white shadow-sm" style={{ backgroundColor: typecolor[raid.Type!] }}>
                  <span className="mr-1 text-xs font-medium tracking-tight">{type_translation_sorted[raid.Type!][getLocaleShortName(locale)]}</span>
                  <span className="text-xs font-normal">{diff}</span>
                </div>
                {/* Count */}
                <span className="text-xs text-neutral-600 dark:text-neutral-300 tabular-nums font-normal">{count?.toLocaleString()}</span>
              </div>
            );
          })}
        </div>

        {/* Right: Platinum */}
        {/* <div className="text-right shrink-0">
          <div className="flex items-center justify-end gap-1.5 text-purple-700 dark:text-purple-400">
            <FaTrophy className="text-sm opacity-60" />
            <span className="text-sm font-semibold tabular-nums">{primaryRaid.Platinum?.toLocaleString()}</span>
          </div>
          <div className="text-xs text-purple-600/70 dark:text-purple-400/60 tabular-nums font-normal mt-0.5">
            {getBracketFromTotalScore(primaryRaid.Platinum)}
          </div>
        </div> */}
      </div>
    </Link>
  );
}

function LiveShortcutCard({ raidInfos, locale }: { raidInfos: RaidFullInfo[]; locale: Locale }) {
  // const { t: t_common } = useTranslation('common');

  // Use the first data entry as the representative info
  const primaryRaid = raidInfos[0];
  const { Id: id, Boss, Date: date, Location: location } = primaryRaid;
  const liveExpired = Number(new Date(date + 'T02:00:00Z')) /* GMT+9 11:00 */ + 3600_000 * 24 * 7 /* add 7 day */ - 3600_000 * 7 < Date.now();

  const israid = isTotalAssault(primaryRaid);

  return (
    <Link
      to={localeLink(locale, `/live`)}
      className="group flex flex-col h-full w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-500 transition-all p-3"
    >
      {/* Header: Live Status + Terrain | Date */}
      <div className="flex justify-between items-center text-sm text-neutral-500 dark:text-neutral-400 mb-2">
        <div className="flex items-center gap-2">
          {/* Live Indicator */}
          <div className="flex items-center gap-1.5">
            {!liveExpired && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            )}
            <span className={`font-mono font-bold text-xs tracking-tight ${!liveExpired ? 'text-red-500 dark:text-red-400' : 'text-neutral-400'}`}>LIVE</span>
          </div>

          <span className="w-px h-2 bg-neutral-300 dark:bg-neutral-600"></span>

          <TerrainIconGameStyle terrain={location as Terrain} size={'1em'} />
        </div>

        {/* Date */}
        <time className="font-mono text-neutral-400 dark:text-neutral-500 font-light text-xs">{date.split('~')[0].trim()}</time>
      </div>

      {/* Main: Boss Name */}
      <div className="flex justify-between items-end mb-3">
        <h3 className="text-xl font-black text-neutral-800 dark:text-neutral-100 truncate pr-2 tracking-tight leading-none">
          <span className="text-xs font-light text-gray-400 mr-1.5 relative -top-1.25">S{id.substring(1)}</span>
          {Boss}
        </h3>
      </div>

      {/* Footer: Details (Diff or Types) */}
      {}
      <div className="mt-auto pt-2.5 border-t border-dashed border-neutral-200 dark:border-neutral-700 flex justify-between items-end gap-2">
        {israid ? (
          /* Case 1: Total Assault (Show Max Difficulty) */
          <div className="flex items-center gap-1 leading-none mb-0.5">
            <div className="px-1.5 py-0.5 rounded-[2px] bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-600">
              <span className="text-xs font-medium">{getMostDifficultLevel(primaryRaid)}</span>
            </div>
            {}
          </div>
        ) : (
          /* Case 2: Grand Assault (Show Defense Types) */
          <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">
            {raidInfos.map((raid) => (
              <div key={raid.Type} className="flex items-center gap-1.5 leading-none">
                {}
                <div className="flex items-center px-1 py-0.5 rounded-[2px] text-white shadow-sm" style={{ backgroundColor: typecolor[raid.Type!] }}>
                  <span className="mr-1 text-xs font-medium tracking-tight">{type_translation_sorted[raid.Type!][getLocaleShortName(locale)]}</span>
                  <span className="text-xs font-normal">{getMostDifficultLevel(raid)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function DashboardIndex() {
  const { groupedRaidInfos, server, locale, pinnedTotalAssault, pinnedGrandAssault } = useLoaderData<typeof loader>();
  const { t } = useTranslation('dashboard');
  const { t: t_index } = useTranslation('dashboardIndex');

  // Sort grouped data by date
  const sortedRaids = groupedRaidInfos.sort((a, b) => {
    const dateA = Array.isArray(a) ? a[0].Date : a.Date;
    const dateB = Array.isArray(b) ? b[0].Date : b.Date;
    return Number(new Date(dateB)) - Number(new Date(dateA));
  });

  const LiveRaidInfos = getLiveRaidInfo(locale);

  return (
    <div className="bg-neutral-50 dark:bg-neutral-900 min-h-screen p-4 sm:p-6 lg:p-8 py-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">
            {t('dashboardList')} ({server.toUpperCase()})
          </h1>
          <p className="text-sm mt-2 text-neutral-600 dark:text-neutral-300">{t_index('description')}</p>
        </header>

        {pinnedTotalAssault && pinnedGrandAssault && (
          <section className="mb-8 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-900/20 p-4">
            <h2 className="text-sm font-bold text-neutral-500 dark:text-neutral-400 mb-3 flex items-center gap-1.5 uppercase tracking-tight px-0.5">
              <BsPinAngleFill className="text-neutral-400 dark:text-neutral-500 text-xs" />
              <span>{t_index('pinnedGlobalTitle')}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {}
              {new Date(pinnedTotalAssault?.Date || 0) < new Date(pinnedGrandAssault[0]?.Date) && <TotalAssaultCard region={server} raidInfo={pinnedTotalAssault} locale={locale} />}

              {pinnedGrandAssault && <GrandAssaultCard region={server} raidInfos={pinnedGrandAssault} locale={locale} />}

              {new Date(pinnedTotalAssault?.Date || 0) > new Date(pinnedGrandAssault[0]?.Date) && <TotalAssaultCard region={server} raidInfo={pinnedTotalAssault} locale={locale} />}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {server === 'jp' && LiveRaidInfos && LiveRaidInfos.length > 0 && <LiveShortcutCard raidInfos={LiveRaidInfos as RaidFullInfo[]} locale={locale} />}

          {sortedRaids.map((raidGroup) => {
            if (Array.isArray(raidGroup)) {
              return <GrandAssaultCard key={raidGroup[0].Id} region={server} raidInfos={raidGroup} locale={locale} />;
            } else {
              return <TotalAssaultCard key={raidGroup.Id} region={server} raidInfo={raidGroup} locale={locale} />;
            }
          })}
        </div>
      </div>
    </div>
  );
}
