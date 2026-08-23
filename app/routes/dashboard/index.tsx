// app/routes/dashboard/index.tsx

import { useState } from 'react';
import { data, Link, useLoaderData, useNavigate, type LoaderFunctionArgs } from 'react-router';
import { GAMESERVER_LIST, type GameServer, type RaidFullInfo } from '~/types/data';
import { useTranslation } from 'react-i18next';
import { getMostDifficultLevel, type_translation_sorted, typecolor } from '~/components/raid/raidToString';
import { useSearchMatcher } from '~/utils/useSearchMatcher';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { loadRaidFullInfos } from '~/utils/loadRaidInfo';
import { TerrainIconGameStyle, type Terrain } from '~/components/raid/teran';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import { getLiveRaidInfo, LIVE_RAID_DURATION } from '~/data/liveRaid';
import { isTotalAssault } from '~/components/dashboard/common';
import type { Route } from './+types';
import { getInstance } from '~/middleware/i18next';
import { localeLink } from '~/utils/localeLink';
import bossData from '~/data/bossdata.json';
import { HiUserGroup } from 'react-icons/hi';
import { BsPinAngleFill } from 'react-icons/bs';
import { CACHE_CONTROL_CONFIG } from '~/utils/cacheControl';
import { getCurrentGlobalraid, getKstTime } from '~/data/globalRaidDates';
import { PageHeader } from '~/components/common/PageHeader';
// import { usePageHelp } from '~/utils/usePageHelp';

// Define types: Total Assault is RaidInfo, Joint Firing Drill is RaidInfo array.
type GroupedRaidInfo = RaidFullInfo | RaidFullInfo[];

const bossNameData = Object.fromEntries(
  Object.entries(bossData).map(([k, v]) => {
    return [k, v.name];
  }),
);

export function loader({ context, params }: LoaderFunctionArgs) {
  const { server } = params;
  if (!server || !GAMESERVER_LIST.includes(server as GameServer)) {
    throw new Response('Not Found', { status: 404 });
  }

  // const locale = getLocaleFromHeaders(request);
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;
  // const raidInfos = loadRaidInfos(server as GameServer, locale);
  const raidInfos = loadRaidFullInfos(server as GameServer);

  const raidGroups = new Map<string, RaidFullInfo[]>();
  for (const raid of raidInfos) {
    if (!raidGroups.has(raid.Id)) {
      raidGroups.set(raid.Id, []);
    }
    const group = raidGroups.get(raid.Id);
    if (group) {
      group.push(raid);
    }
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
    title: i18n.t('ui:dashboardList'),
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

export function headers() {
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

function RaidCard({ region, raidInfos, locale }: { region: GameServer; raidInfos: RaidFullInfo[]; locale: Locale }) {
  const isGrand = raidInfos.length > 1;
  const primaryRaid = raidInfos[0];
  const navigate = useNavigate();
  const { Id: id, Boss, Date: date, Location: location } = primaryRaid;
  const { t: t_g } = useTranslation('game');
  const difficultLevel = getMostDifficultLevel(primaryRaid);
  const difficultClearCount = difficultLevel ? primaryRaid.Cnt[difficultLevel] : 0;

  return (
    <Link
      to={localeLink(locale, `/dashboard/${region}/${id}`)}
      className="group flex flex-col h-full w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-500 transition-all p-3"
    >
      {/* Header */}
      <div className="flex justify-between items-center text-sm text-neutral-500 dark:text-neutral-400 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-xs">{isGrand ? t_g('eraid') : t_g('raid')}</span>
          <span className="w-px h-2 bg-neutral-300 dark:bg-neutral-600"></span>
          <TerrainIconGameStyle terrain={location as Terrain} size={'1em'} />
        </div>
        <time className="font-mono text-neutral-400 dark:text-neutral-500 font-light text-xs">{date.split('~')[0].trim()}</time>
      </div>

      {/* Main: Boss Name */}
      <div className={`flex justify-between items-end ${isGrand ? 'mb-4' : 'mb-3'}`}>
        <h3 className="text-xl font-black text-neutral-800 dark:text-neutral-100 truncate pr-2 tracking-tight leading-none">
          <span className="text-xs font-light text-neutral-400 mr-1.5 relative -top-1.25">S{id.substring(1)}</span>
          {bossNameData[Boss]?.[getLocaleShortName(locale)] || Boss}
        </h3>
        <div className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500 mb-0.5">
          <MiniStat icon={<HiUserGroup />} value={primaryRaid?.TotalParticipants?.toLocaleString()} />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-2.5 border-t border-dashed border-neutral-200 dark:border-neutral-700 flex justify-between items-end gap-2">
        {isGrand ? (
          <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">
            {raidInfos.map((raid) => {
              const diff = getMostDifficultLevel(raid);
              const count = diff ? raid.Cnt[diff] : 0;
              if (!raid.Type) return null;
              return (
                <button
                  key={raid.Type}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void navigate(localeLink(locale, `/dashboard/${region}/${raid.Id}?tab=${raid.Type}`));
                  }}
                  className="flex items-center gap-1.5 leading-none hover:scale-101"
                >
                  <div className="flex items-center px-1 py-0.5 rounded-xs text-white shadow-sm" style={{ backgroundColor: typecolor[raid.Type] }}>
                    <span className="mr-1 text-xs font-medium tracking-tight">{type_translation_sorted[raid.Type][getLocaleShortName(locale)]}</span>
                    <span className="text-xs font-normal">{diff}</span>
                  </div>
                  <span className="text-xs text-neutral-600 dark:text-neutral-300 tabular-nums font-normal">{count?.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-1 leading-none mb-0.5">
            <div className="px-1.5 py-0.5 rounded-xs bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-600">
              <span className="text-xs font-medium">{difficultLevel}</span>
            </div>
            <span className="text-xs text-neutral-600 dark:text-neutral-300 tabular-nums font-normal ml-0.5">{difficultClearCount?.toLocaleString()}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function LiveShortcutCard({ raidInfos, locale }: { raidInfos: RaidFullInfo[]; locale: Locale }) {
  // const { t: t_common } = useTranslation('common');

  // Use the first data entry as the representative info
  const primaryRaid = raidInfos[0];
  const { Id: id, Boss, Date: date, Location: location } = primaryRaid;
  // console.log('date',date)
  const liveExpired = getKstTime(date) /* GMT+9 11:00 */ + 3600_000 * 24 * LIVE_RAID_DURATION /* add 7 day */ - 3600_000 * 7 < Date.now();

  const israid = isTotalAssault(primaryRaid);

  return (
    <Link
      to={localeLink(locale, `/live`)}
      className={
        'group flex flex-col h-full w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-500 transition-all p-3' +
        (!liveExpired ? '' : ' opacity-80')
      }
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
          <span className="text-xs font-light text-neutral-400 mr-1.5 relative -top-1.25">S{id.substring(1)}</span>
          {Boss}
        </h3>
      </div>

      {/* Footer: Details (Diff or Types) */}
      {}
      <div className="mt-auto pt-2.5 border-t border-dashed border-neutral-200 dark:border-neutral-700 flex justify-between items-end gap-2">
        {israid ? (
          /* Case 1: Total Assault (Show Max Difficulty) */
          <div className="flex items-center gap-1 leading-none mb-0.5">
            <div className="px-1.5 py-0.5 rounded-xs bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-600">
              <span className="text-xs font-medium">{getMostDifficultLevel(primaryRaid)}</span>
            </div>
            {}
          </div>
        ) : (
          /* Case 2: Grand Assault (Show Defense Types) */
          <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">
            {raidInfos.map((raid) => {
              if (!raid.Type) return null;
              return (
                <div key={raid.Type} className="flex items-center gap-1.5 leading-none">
                  {}
                  <div className="flex items-center px-1 py-0.5 rounded-xs text-white shadow-sm" style={{ backgroundColor: typecolor[raid.Type] }}>
                    <span className="mr-1 text-xs font-medium tracking-tight">{type_translation_sorted[raid.Type][getLocaleShortName(locale)]}</span>
                    <span className="text-xs font-normal">{getMostDifficultLevel(raid)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function DashboardIndex() {
  const { groupedRaidInfos, server, locale, pinnedTotalAssault, pinnedGrandAssault } = useLoaderData<typeof loader>();
  // const { t } = useTranslation('dashboard');
  const { t: t_index } = useTranslation('dashboardIndex');
  // const { t: t_common } = useTranslation('common');
  const { t: t_ui } = useTranslation('ui');
  const { t: t_g } = useTranslation('game');

  // Sort grouped data by date
  const sortedRaids = groupedRaidInfos.sort((a, b) => {
    const dateA = Array.isArray(a) ? a[0].Date : a.Date;
    const dateB = Array.isArray(b) ? b[0].Date : b.Date;
    return Number(new Date(dateB)) - Number(new Date(dateA));
  });

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'raid' | 'eraid'>('all');
  const match = useSearchMatcher(locale);

  const LiveRaidInfos = getLiveRaidInfo(locale);

  const filteredRaids = sortedRaids.filter((raidGroup) => {
    const isGrand = Array.isArray(raidGroup);
    if (typeFilter === 'raid' && isGrand) return false;
    if (typeFilter === 'eraid' && !isGrand) return false;
    if (!query.trim()) return true;
    const primary = isGrand ? raidGroup[0] : raidGroup;
    const localeName = bossNameData[primary.Boss]?.[getLocaleShortName(locale)] || primary.Boss;
    return match(localeName, query) || match(primary.Boss, query) || match(primary.Id, query);
  });

  const liveRaidMatches =
    !query.trim() ||
    (LiveRaidInfos &&
      LiveRaidInfos.length > 0 &&
      LiveRaidInfos.some((raid) => {
        const localeName = bossNameData[raid.Boss]?.[getLocaleShortName(locale)] || raid.Boss;
        return match(localeName, query) || match(raid.Boss, query) || match(raid.Id, query);
      }));

  return (
    <div className="bg-neutral-50 dark:bg-neutral-900 min-h-screen p-4 sm:p-6 lg:p-8 py-6">
      <div className="max-w-7xl mx-auto">
        <PageHeader title={`${t_ui('dashboardList')} (${server.toUpperCase()})`} description={t_index('description')} />

        <div className="mb-6 flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t_index('searchPlaceholder')}
            className="flex-1 px-3 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-500 transition-colors"
          />
          <div className="flex shrink-0 rounded overflow-hidden border border-neutral-200 dark:border-neutral-700 text-xs font-medium">
            {(['all', 'raid', 'eraid'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setTypeFilter(opt)}
                className={`px-3 py-1.5 transition-colors ${typeFilter === opt ? 'bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900' : 'bg-white dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
              >
                {opt === 'all' ? t_ui('all') : t_g(opt)}
              </button>
            ))}
          </div>
        </div>

        {!query.trim() && typeFilter === 'all' && pinnedTotalAssault && pinnedGrandAssault && (
          <section className="mb-8 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-900/20 p-4">
            <h2 className="text-sm font-bold text-neutral-500 dark:text-neutral-400 mb-3 flex items-center gap-1.5 uppercase tracking-tight px-0.5">
              <BsPinAngleFill className="text-neutral-400 dark:text-neutral-500 text-xs" />
              <span>{t_index('pinnedGlobalTitle')}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {new Date(pinnedTotalAssault?.Date || 0) < new Date(pinnedGrandAssault[0]?.Date) && <RaidCard region={server} raidInfos={[pinnedTotalAssault]} locale={locale} />}
              {pinnedGrandAssault && <RaidCard region={server} raidInfos={pinnedGrandAssault} locale={locale} />}
              {new Date(pinnedTotalAssault?.Date || 0) > new Date(pinnedGrandAssault[0]?.Date) && <RaidCard region={server} raidInfos={[pinnedTotalAssault]} locale={locale} />}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {typeFilter === 'all' && server === 'jp' && LiveRaidInfos && LiveRaidInfos.length > 0 && liveRaidMatches && <LiveShortcutCard raidInfos={LiveRaidInfos as RaidFullInfo[]} locale={locale} />}

          {filteredRaids.map((raidGroup) => {
            const raidInfos = Array.isArray(raidGroup) ? raidGroup : [raidGroup];
            return <RaidCard key={raidInfos[0].Id} region={server} raidInfos={raidInfos} locale={locale} />;
          })}
        </div>
      </div>
    </div>
  );
}
