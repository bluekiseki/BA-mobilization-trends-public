// app/routes/planner/Gacha_v2.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FaSpinner } from 'react-icons/fa';

import { parseAndGroupBanners, getAllStudents, normalizePortraitMap, withPickupFallbackStudents, type SchaleStudent, type BannerPeriod } from '~/utils/gachaData';
import type { Student } from '~/types/gacha';
import { PageHeader } from '~/components/common/PageHeader';
import IncomePlannerPanel_v2, { type CustomIncome } from '~/components/gacha/IncomePlannerPanel_v2';
import BannerPlanner_v2 from '~/components/gacha/BannerPlanner_v2';
import PyroTimelineChart, { type ProbTimelinePoint, type CustomLineConfig, type BannerStudentMarker } from '~/components/gacha/PyroTimelineChart';

import { loadScheduleDataV2, type ScheduleItemV2 } from '~/utils/calender.data.v2';
import { getItemTitle } from '~/utils/scheduleDisplay';
import { getInstance } from '~/middleware/i18next';
import type { GameServer } from '~/types/data';
import { data, Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { DEFAULT_LOCALE, type Locale } from '~/utils/i18n/config';
import {
  calculatePyroxeneTimeline,
  getCdfByBinValue,
  getBinStartByCdf,
  getEventPyroxeneReward,
  PYROXENE_PER_MAIN_STORY,
  buildInitialTicketBatches,
  type PlannerSchedule,
  type PyroxeneConfig,
  type SimulationStats,
  PYROXENE_PER_MINI_STORY,
} from '~/utils/pyroxeneCalc';
import { PYROXENE_PER_PULL_UNIT, ticketCreditedDist, type GlobalAggregatedResult, type DistributionData } from '~/utils/gachaEngine';
import type { BannerStrategy, StudentStrategyConfig } from '~/types/gacha';
import { createLinkHreflang, createMetaDescriptor } from '~/components/head';
import type { Route } from './+types/Gacha_v2';
import { cdn } from '~/utils/cdn';
import { useLocalStorage } from '~/utils/useLocalStorage';
import PlannerGuide, { GUIDE_STORAGE_KEY } from '~/components/gacha/PlannerGuide';
import { useSyncStore } from '~/store/syncStore';
import { localeLink } from '~/utils/localeLink';
import type { AppHandle } from '~/types/link';
import { useGachaResultStore } from '~/store/planner/useGachaResultStore';
import { useGlobalStore } from '~/store/planner/useGlobalStore';

export type { PyroxeneConfig } from '~/utils/pyroxeneCalc';

type IconImageData = Record<string, Record<string, string>>;

export const handle: AppHandle = {
  preload: (data: unknown) => {
    // Create a link dynamically using the return value (data) of the root loader

    type DataType = { locale?: Locale };
    const typedData = data as DataType;
    const locale = typedData?.locale;
    return [
      {
        rel: 'preload',
        href: cdn(`/schaledb.com/${locale}.students.min.json`),
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      { rel: 'preload', href: cdn(`/w/students_portrait.json`), as: 'fetch', crossOrigin: 'anonymous' },
      // icon_img.json isn't preloaded — decorative, loaded lazily off the critical path.
      // { rel: 'preload', href: cdn(`/ew/icon_img.854.json`), as: 'fetch', crossOrigin: 'anonymous' }, // re-enable only if icon_img.json stops carrying Currency.3/5, Item.23/6998/6999
      ...createLinkHreflang(`/planner/gacha`),
    ];
  },
};

export function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const server = (url.searchParams.get('server') as GameServer) || 'kr';

  const i18n = getInstance(context);

  const scheduleData = loadScheduleDataV2({ server, tracksToLoad: 'all' });

  return data({
    siteTitle: i18n.t('common:title'),
    title: i18n.t('planner:gacha.title'),
    description: i18n.t('planner:gacha.intro.summary'),
    server,
    scheduleData,
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/gacha.webp');
}

// Fetch roster/portrait during hydration, not in useEffect — avoids blocking on useTranslation() Suspense.
// icon_img.json loaded afterward (decorative, not on critical path).
export async function clientLoader({ params, serverLoader }: Route.ClientLoaderArgs) {
  const serverData = await serverLoader();
  const locale = (params.locale as Locale) || DEFAULT_LOCALE;

  const [studentRes, portraitRes] = await Promise.all([fetch(cdn(`/schaledb.com/${locale}.students.min.json`)), fetch(cdn('/w/students_portrait.json'))]);

  const rawStudentData: SchaleStudent[] | Record<string, SchaleStudent> = studentRes.ok ? await studentRes.json() : {};
  const rawPortraitData: Record<string, string> = portraitRes.ok ? await portraitRes.json() : {};

  const studentMap: Record<string, SchaleStudent> = {};
  (Array.isArray(rawStudentData) ? rawStudentData : Object.values(rawStudentData)).forEach((s) => {
    studentMap[s.Id] = s;
  });

  return {
    ...serverData,
    studentMap,
    baseStudents: getAllStudents(studentMap),
    portraitMap: normalizePortraitMap(rawPortraitData),
  };
}
clientLoader.hydrate = true;
// No HydrateFallback: a route with one drops SSR title/meta (see shouldHydrateRouteLoader), breaking
// link previews. GachaMain renders its full shell immediately instead, using CSV names as a fallback
// until clientLoader resolves.

interface TimelinePoint {
  date: string;
  pyroxene: number;
  logs: { i18nKey?: string; params?: Record<string, string | number>; title?: string; amount: number }[];
}

export const SIMULATION_DAYS = 150;

const GACHA_PREFS_DEFAULT = {
  server: 'KR' as 'KR' | 'JP',
  customPercentiles: [] as number[],
  incomeConfig: {
    currentPyroxene: 24000,
    monthlyCard: true,
    halfMonthlyCard: false,
    monthlyPackCost: 0,
    monthlyExtraGem: 1200,
    apRefreshes_normal: 0,
    apRefreshes_event: 0,
    apRefreshes_campaigns: {},
    raidRank: 'platinum',
    pvpRankTier: 100,
    manualTicketBatches: [],
    selectedEraidTicketIds: [],
    consumeExpiringTickets: true,
  } as PyroxeneConfig & { customIncomes?: CustomIncome[] },
};

function isStrategyModified(s: BannerStrategy): boolean {
  if (s.isActive) return true;
  if (s.maxSparks !== 1 || (s.maxHalfCharges ?? 2) !== 2 || s.minPulls !== 0 || s.maxPulls !== 200 || s.freePulls !== 0) return true;
  if (s.claimRecruitBonus ?? false) return true;
  return Object.values(s.studentConfigs).some((cfg) => cfg.mode !== 'skip');
}

const monoStyle = { fontFamily: 'inherit' };

function SectionDivider({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500 whitespace-nowrap" style={monoStyle}>
        {label}
      </span>
      <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      {right && (
        <span className="text-[11px] text-neutral-400 dark:text-neutral-500 whitespace-nowrap" style={monoStyle}>
          {right}
        </span>
      )}
    </div>
  );
}

// rate = bankruptcy rate; color for sufficiency = inverse
function bankruptcyColor(rate: number): string {
  if (rate < 8) return '#16a34a';
  if (rate < 22) return '#d97706';
  return '#dc2626';
}

// Identifies a banner by lineup (server + bannerType + sorted pickup IDs) rather than date range;
// '_' is a safe delimiter since none of these fields can contain it.
function strategyFamilyKey(banner: BannerPeriod, server: 'KR' | 'JP'): string {
  const roster = banner.pickupStudents
    .map((s) => s.id)
    .sort((a, b) => a - b)
    .join(',');
  return `${server}_${banner.bannerType}_${roster}`;
}

// Storage key = family + start time (ms). Predicted schedule dates often get corrected later, so
// buildStrategies falls back to family-only matching when the date changes.
function strategyStorageKey(banner: BannerPeriod, server: 'KR' | 'JP'): string {
  return `${strategyFamilyKey(banner, server)}_${new Date(banner.startTime).getTime()}`;
}

function buildStrategies(loadedBanners: BannerPeriod[], saved: Record<string, BannerStrategy>, server: 'KR' | 'JP', prevRuntime?: Record<string, BannerStrategy>): Record<string, BannerStrategy> {
  // Count of currently loaded banners per lineup — determines whether family-only matching is safe,
  // or whether same-roster reruns need the date to disambiguate.
  const currentFamilyCounts = new Map<string, number>();
  loadedBanners.forEach((b) => {
    const fam = strategyFamilyKey(b, server);
    currentFamilyCounts.set(fam, (currentFamilyCounts.get(fam) ?? 0) + 1);
  });

  const consumed = new Set<string>();
  const next: Record<string, BannerStrategy> = {};

  loadedBanners.forEach((b) => {
    // In-flight edit already in memory for this banner (e.g. banners recomputed mid-session) always wins
    // over whatever is in localStorage, so a user's just-made change is never silently discarded.
    if (prevRuntime?.[b.id]) {
      next[b.id] = prevRuntime[b.id];
      return;
    }

    const fam = strategyFamilyKey(b, server);
    const exactKey = `${fam}_${new Date(b.startTime).getTime()}`;
    let match: BannerStrategy | undefined;

    if (saved[exactKey] && !consumed.has(exactKey)) {
      match = saved[exactKey];
      consumed.add(exactKey);
    } else {
      const candidates = Object.entries(saved).filter(([key]) => !consumed.has(key) && key.startsWith(`${fam}_`));
      if (candidates.length > 0) {
        const isAmbiguous = (currentFamilyCounts.get(fam) ?? 0) > 1;
        const [bestKey, bestStrategy] = candidates.reduce((best, cur) => {
          if (!isAmbiguous) {
            // Unambiguous lineup: any stale-dated saved entry for it is this banner's own settings
            // under a since-corrected date — prefer the most recently saved one.
            return Number(cur[0].slice(fam.length + 1)) > Number(best[0].slice(fam.length + 1)) ? cur : best;
          }
          // Ambiguous (multiple current banners share this exact lineup): only here does the date
          // act as a disambiguator — pick whichever saved candidate started closest to this banner.
          const targetMs = new Date(b.startTime).getTime();
          const bestDiff = Math.abs(Number(best[0].slice(fam.length + 1)) - targetMs);
          const curDiff = Math.abs(Number(cur[0].slice(fam.length + 1)) - targetMs);
          return curDiff < bestDiff ? cur : best;
        });
        match = bestStrategy;
        consumed.add(bestKey);
      }
    }

    if (match) {
      next[b.id] = { ...match, bannerId: b.id, server };
    } else {
      const configs: Record<number, StudentStrategyConfig> = {};
      b.pickupStudents.forEach((s, idx) => {
        configs[s.id] = { studentId: s.id, priority: idx + 1, mode: 'skip', opportunisticThreshold: 50, intentionalSpark: false, intentionalSparkThreshold: 20 };
      });
      next[b.id] = {
        bannerId: b.id,
        server,
        isActive: false,
        maxSparks: 1,
        maxHalfCharges: 2,
        minPulls: 0,
        studentConfigs: configs,
        freePulls: 0,
        maxPulls: 200,
        isFes: false,
        claimRecruitBonus: false,
        recruitBonusThreshold: 10,
      };
    }
  });
  return next;
}

export default function GachaMain() {
  // studentMap/baseStudents/portraitMap only land once clientLoader resolves; during SSR and early
  // hydration (no HydrateFallback) they read as undefined rather than showing a fallback.
  const loaderData = useLoaderData<typeof clientLoader>();
  const { scheduleData, studentMap } = loaderData;
  const baseStudents = loaderData.baseStudents ?? [];
  const portraitMap = loaderData.portraitMap ?? {};
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'gacha' });
  const { t: t_ui } = useTranslation('ui');
  useTranslation('calendar'); // Load schedule labels for mini stories and joint firing drills.
  useTranslation('jukebox'); // Load main story title translations for the income timeline.
  const locale = i18n.language as Locale;

  const syncPush = useSyncStore((s) => s.push);

  const [guideHidden, setGuideHidden] = useLocalStorage(GUIDE_STORAGE_KEY, false);

  const [prefs, setPrefs] = useLocalStorage('gacha_prefs_v1', GACHA_PREFS_DEFAULT);
  const { server, customPercentiles, incomeConfig } = prefs;
  const setServer = (s: 'KR' | 'JP') => setPrefs((p) => ({ ...p, server: s }));
  const setCustomPercentiles = (v: number[] | ((prev: number[]) => number[])) => setPrefs((p) => ({ ...p, customPercentiles: v instanceof Function ? v(p.customPercentiles) : v }));
  const setIncomeConfig: React.Dispatch<React.SetStateAction<PyroxeneConfig & { customIncomes?: CustomIncome[] }>> = (v) =>
    setPrefs((p) => ({ ...p, incomeConfig: v instanceof Function ? v(p.incomeConfig) : v }));

  // Server-dependent (KR/JP) derivation from studentMap, no refetch needed. parseAndGroupBanners falls
  // back to bundled CSV names when studentMap is null, so real dates/pickups show before clientLoader resolves.
  const banners = useMemo<BannerPeriod[]>(() => parseAndGroupBanners(server, studentMap ?? null), [server, studentMap]);
  const allStudents = useMemo<Student[]>(() => withPickupFallbackStudents(baseStudents, banners) as unknown as Student[], [baseStudents, banners]);

  // Icons are decorative — fetched after mount instead of inside clientLoader so they never gate the
  // critical banner/portrait/timeline content.
  const [pyroxeneIcon, setPyroxeneIcon] = useState<string | null>(null);
  const [apIcon, setApIcon] = useState<string | null>(null);
  const [elephIconMap, setElephIconMap] = useState<Record<string, string>>({});
  const [ticket1Icon, setTicket1Icon] = useState<string | null>(null);
  const [ticket10Icon, setTicket10Icon] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(cdn('/ew/icon_img.json'))
      .then(async (res) => {
        if (!res.ok) return null;

        const iconImgData: IconImageData = await res.json();
        return iconImgData;
      })
      .then((iconImgData) => {
        if (cancelled || !iconImgData) return;
        setPyroxeneIcon(iconImgData.Currency?.['3'] ?? null);
        setApIcon(iconImgData.Currency?.['5'] ?? null);
        setElephIconMap(iconImgData.Item ?? {});
        setTicket1Icon(iconImgData.Item?.['6998'] ?? null);
        setTicket10Icon(iconImgData.Item?.['6999'] ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Student IDs already owned, so gacha sim dupes pay eligma from the first roll. Reuses the same
  // "recruited" signal (has a growth plan) as StudentSpreadsheetView and the video scanner.
  const growthPlans = useGlobalStore((s) => s.growthPlans);
  const ownedStudentIds = useMemo(() => Array.from(new Set(growthPlans.filter((p) => p.studentId !== null).map((p) => p.studentId as number))), [growthPlans]);

  const [savedStrategies] = useLocalStorage<Record<string, BannerStrategy>>('gacha_strategies_v3', {});
  const savedStrategiesRef = useRef(savedStrategies);
  savedStrategiesRef.current = savedStrategies;
  const [strategies, setStrategies] = useState<Record<string, BannerStrategy>>(() => buildStrategies(banners, savedStrategiesRef.current, server));
  // Skip the redundant rebuild on mount; re-run only when `banners` actually changes (server toggle or
  // studentMap landing). Passes current state as `prevRuntime` so a strategy edit made in that window isn't discarded.
  const prevBannersForStrategiesRef = useRef(banners);
  useEffect(() => {
    if (prevBannersForStrategiesRef.current === banners) return;
    prevBannersForStrategiesRef.current = banners;
    setStrategies((prev) => buildStrategies(banners, savedStrategiesRef.current, server, prev));
  }, [banners, server]);

  useEffect(() => {
    if (Object.keys(strategies).length === 0) return;
    try {
      const bannerById = new Map(banners.map((b) => [b.id, b]));
      const toStore: Record<string, BannerStrategy> = {};
      Object.entries(strategies).forEach(([bannerId, s]) => {
        if (!isStrategyModified(s)) return;
        const banner = bannerById.get(bannerId);
        if (!banner) return;
        toStore[strategyStorageKey(banner, server)] = s;
      });
      window.localStorage.setItem('gacha_strategies_v3', JSON.stringify(toStore));
      syncPush('gacha_strategies', toStore, 3);
    } catch {}
  }, [strategies, banners, server, syncPush]);

  useEffect(() => {
    syncPush('gacha_prefs', prefs, 1);
  }, [prefs, syncPush]);

  const [gachaSimResult, setGachaSimResultLocal] = useState<GlobalAggregatedResult | null>(null);
  const { setResult: setGachaResultStore } = useGachaResultStore();
  const setGachaSimResult = (result: GlobalAggregatedResult | null) => {
    setGachaSimResultLocal(result);
    setGachaResultStore(result);
  };

  const [apOverrides, setApOverrides] = useState<Record<string, number>>({});

  const plannerSchedules: PlannerSchedule[] = useMemo(() => {
    if (!scheduleData || !scheduleData.tracks) return [];

    const tracks = scheduleData.tracks;
    const result: PlannerSchedule[] = [];
    const toYMD = (dateStr: string) => (dateStr ? dateStr.split('T')[0] : '');

    const mapItems = (items: ScheduleItemV2[], type: PlannerSchedule['type']) => {
      if (!items) return;
      // console.log('items',)
      items.forEach((item) => {
        const title = getItemTitle(item, locale, i18n);
        let amount: undefined | number = undefined;
        let isApEvent: boolean | undefined = undefined;
        if (type === 'Event') {
          const event_season = Number(item.id.split('-')[1]);
          amount = getEventPyroxeneReward(event_season);
          isApEvent = (event_season >= 800 && event_season <= 899) || (event_season >= 10800 && event_season <= 10899);
        }
        if (type === 'MainStory') {
          const storyTitleKey = [item.details?.storyTitleKey, item.details?.part]
            .filter((v) => v)
            .join('_part')
            .trim();
          // console.log('title-MainStory',title, storyTitleKey, item)
          amount = title.trim() in PYROXENE_PER_MAIN_STORY ? PYROXENE_PER_MAIN_STORY[title.trim()] : storyTitleKey in PYROXENE_PER_MAIN_STORY ? PYROXENE_PER_MAIN_STORY[storyTitleKey] : 100;
        }
        if (type === 'MiniStory') {
          const miniId = item?.details?.id;

          // console.log('title-MiniStory', title, item);
          amount = miniId && miniId in PYROXENE_PER_MINI_STORY ? PYROXENE_PER_MINI_STORY[miniId] : undefined;
        }
        const campaignType = type === 'Campaign' ? item.details?.campaignType : undefined;
        result.push({ id: item.id, name: title, start: toYMD(item.startTime), end: toYMD(item.endTime), type, amount, campaignType, multiplier: item.details?.multiplier, isApEvent });
      });
    };

    mapItems(
      tracks['raid'].filter((v) => v.type === 'raid'),
      'Raid',
    );
    mapItems(
      tracks['raid'].filter((v) => v.type === 'jointFiringDrill'),
      'JointFiringDrill',
    );
    mapItems(
      tracks['raid'].filter((v) => v.type === 'eraid'),
      'Elimination',
    );
    mapItems(tracks['multifloor'], 'Multifloor');
    mapItems(tracks['event'], 'Event');
    mapItems(tracks['campaign'], 'Campaign');
    mapItems(tracks['mainstory'], 'MainStory');
    if (tracks['ministory']) mapItems(tracks['ministory'], 'MiniStory');
    if (tracks['maintenance']) mapItems(tracks['maintenance'], 'Maintenance');

    return result;
  }, [scheduleData, locale, i18n]);

  const { timeline: baseTimeline, stats } = useMemo(() => {
    return calculatePyroxeneTimeline(incomeConfig, plannerSchedules, {
      simulationDays: SIMULATION_DAYS,
      customApOverrides: apOverrides,
      customIncomes: incomeConfig.customIncomes || [],
    });
  }, [incomeConfig, plannerSchedules, apOverrides]);

  // Tickets held before any banner runs are seeded into the sim's pool, but the chart has no per-banner
  // distribution yet — add their pyroxene-equivalent value directly so the "+tickets" line isn't flat 0.
  const initialTicketBatches = useMemo(() => buildInitialTicketBatches(incomeConfig, plannerSchedules), [incomeConfig, plannerSchedules]);

  const displayStats = useMemo((): SimulationStats => {
    if (!gachaSimResult) return stats;
    return { ...stats, expense: { ...stats.expense, gacha: gachaSimResult.cost.avg('inf') } };
  }, [stats, gachaSimResult]);

  const { probTimeline, minMaxCdf } = useMemo(() => {
    if (!baseTimeline.length) return { probTimeline: [] as ProbTimelinePoint[], minMaxCdf: 100 };

    let minMaxCdfVal = 100;
    let currentDist: DistributionData[] | null = null;
    let currentDistWithTickets: DistributionData[] | null = null;

    // Checkpoints to snap to: each banner's start plus ticket grant/expiry checkpoints already recorded
    // in result.cost (see gachaEngine.ts's extraCheckpointsByBanner) — just read back, not recomputed.
    const todayMs = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    const checkpoints: Array<{ id: string; date: number }> = banners
      .filter((b) => strategies[b.id]?.isActive)
      .map((b) => {
        const startMs = new Date(b.startTime).getTime();
        const endMs = new Date(b.endTime).getTime();
        // A currently-running banner hasn't been pulled yet, so snap its checkpoint to today instead of
        // its (past) startTime; other banners keep their real date.
        const isOngoing = todayMs >= startMs && todayMs <= endMs;
        return { id: b.id, date: isOngoing ? todayMs : startMs };
      });
    if (gachaSimResult) {
      for (const key of gachaSimResult.cost.keys()) {
        if (!key.startsWith('ticket-')) continue;
        const date = Number(key.slice('ticket-'.length));
        if (!Number.isNaN(date)) checkpoints.push({ id: key, date });
      }
    }
    checkpoints.sort((a, b) => a.date - b.date);

    const result: ProbTimelinePoint[] = (baseTimeline as TimelinePoint[]).map((point) => {
      const pointTime = new Date(point.date).getTime();
      for (const cp of checkpoints) {
        if (cp.date > pointTime) break;
        if (gachaSimResult && gachaSimResult.cost.count(cp.id) > 0) {
          currentDist = gachaSimResult.cost.dist(cp.id);
          currentDistWithTickets = ticketCreditedDist(gachaSimResult.costWithTickets, gachaSimResult.cost, cp.id);
        }
      }

      const dist = currentDist;
      const distWithTickets = currentDistWithTickets;
      let maxCdf = 100;
      if (dist) {
        maxCdf = getCdfByBinValue(dist, point.pyroxene);
        if (maxCdf < minMaxCdfVal) minMaxCdfVal = maxCdf;
      }

      let pyroxeneAvg = point.pyroxene;
      let pyroxeneHigh = point.pyroxene;
      let pyroxeneLow = point.pyroxene;
      let pyroxeneWorst = point.pyroxene;
      const customValues: Record<string, number> = {};

      if (dist) {
        pyroxeneHigh = point.pyroxene - getBinStartByCdf(dist, 10);
        pyroxeneAvg = point.pyroxene - getBinStartByCdf(dist, 50);
        pyroxeneLow = point.pyroxene - getBinStartByCdf(dist, 90);
        pyroxeneWorst = point.pyroxene - getBinStartByCdf(dist, 99.5);
        customPercentiles.forEach((p) => {
          customValues[`custom_${p}`] = point.pyroxene - getBinStartByCdf(dist, p);
        });
      } else {
        customPercentiles.forEach((p) => {
          customValues[`custom_${p}`] = point.pyroxene;
        });
      }

      // "Balance including tickets" = balance + still-held ticket value (pyroxene-equivalent) — same
      // percentile lookup as pyroxeneHigh/Avg/Low/Worst above, just against distWithTickets instead of dist.
      let pyroxeneHighWithTickets = pyroxeneHigh;
      let pyroxeneAvgWithTickets = pyroxeneAvg;
      let pyroxeneLowWithTickets = pyroxeneLow;
      let pyroxeneWorstWithTickets = pyroxeneWorst;
      if (distWithTickets) {
        pyroxeneHighWithTickets = point.pyroxene - getBinStartByCdf(distWithTickets, 10);
        pyroxeneAvgWithTickets = point.pyroxene - getBinStartByCdf(distWithTickets, 50);
        pyroxeneLowWithTickets = point.pyroxene - getBinStartByCdf(distWithTickets, 90);
        pyroxeneWorstWithTickets = point.pyroxene - getBinStartByCdf(distWithTickets, 99.5);
      } else {
        // No sim distribution reaches this point yet (before the first active banner) — no randomness has
        // happened, so just add whatever ticket value is already held/available on this exact date.
        const heldPullUnits = initialTicketBatches.reduce((sum, b) => (pointTime >= b.availableFrom && (b.expiresAt === null || b.expiresAt > pointTime) ? sum + b.pullUnits : sum), 0);
        const heldPyroxene = heldPullUnits * PYROXENE_PER_PULL_UNIT;
        pyroxeneHighWithTickets = pyroxeneHigh + heldPyroxene;
        pyroxeneAvgWithTickets = pyroxeneAvg + heldPyroxene;
        pyroxeneLowWithTickets = pyroxeneLow + heldPyroxene;
        pyroxeneWorstWithTickets = pyroxeneWorst + heldPyroxene;
      }

      return {
        date: point.date,
        pyroxene: point.pyroxene,
        pyroxeneAvg,
        pyroxeneHigh,
        pyroxeneLow,
        pyroxeneWorst,
        pyroxeneWorstWithTickets,
        maxCdf,
        logs: point.logs || [],
        pyroxeneHighWithTickets,
        pyroxeneAvgWithTickets,
        pyroxeneLowWithTickets,
        ...customValues,
      };
    });

    return { probTimeline: result, minMaxCdf: minMaxCdfVal };
  }, [baseTimeline, banners, strategies, gachaSimResult, customPercentiles, initialTicketBatches]);

  const bankruptcyRate = useMemo<number | null>(() => {
    if (!gachaSimResult || !baseTimeline.length) return null;
    return parseFloat((100 - minMaxCdf).toFixed(1));
  }, [gachaSimResult, baseTimeline, minMaxCdf]);

  const studentMarkers = useMemo<BannerStudentMarker[]>(() => {
    const map = new Map<string, BannerStudentMarker>();
    banners.forEach((b) => {
      const strategy = strategies[b.id];
      if (!strategy?.isActive) return;
      const targeted = b.pickupStudents.filter((s) => {
        const cfg = strategy.studentConfigs?.[s.id];
        return cfg && cfg.mode !== 'skip';
      });
      if (!targeted.length) return;
      const date = b.startTime.slice(0, 10);
      const students = targeted.map((s) => ({
        id: s.id,
        name: s.name,
        portrait: portraitMap[s.id] ? (portraitMap[s.id].startsWith('data:') ? portraitMap[s.id] : `data:image/webp;base64,${portraitMap[s.id]}`) : undefined,
      }));
      const existing = map.get(date);
      if (existing) existing.students.push(...students);
      else map.set(date, { date, students });
    });
    return Array.from(map.values());
  }, [banners, strategies, portraitMap]);

  const customLinesConfig = useMemo<CustomLineConfig[]>(() => {
    const palette = ['#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
    return customPercentiles.map((p, i) => ({
      dataKey: `custom_${p}`,
      name: t('income.chart.upper_x', { x: p }),
      color: palette[i % palette.length],
      strokeDasharray: '3 3',
      strokeWidth: 1.5,
    }));
  }, [customPercentiles, t]);

  const updateStrategy = (id: string, updates: Partial<BannerStrategy>) => setStrategies((prev) => ({ ...prev, [id]: { ...prev[id], ...updates } }));

  const updateStudentConfig = (bid: string, sid: number, updates: Partial<StudentStrategyConfig>) =>
    setStrategies((prev) => ({
      ...prev,
      [bid]: { ...prev[bid], studentConfigs: { ...prev[bid].studentConfigs, [sid]: { ...prev[bid].studentConfigs[sid], ...updates } } },
    }));

  const handleApChange = (id: string, val: string) => setApOverrides((prev) => ({ ...prev, [id]: Number(val) }));

  // Escape hatch for corrupted saved settings (e.g. an old localStorage shape the app can no longer parse) —
  // clears every gacha-planner-scoped key and reloads, without touching other planners' saved data.
  const handleResetPlannerData = () => {
    if (!window.confirm(t('reset_confirm'))) return;
    localStorage.removeItem('gacha_prefs_v1');
    localStorage.removeItem('gacha_strategies_v3');
    localStorage.removeItem(GUIDE_STORAGE_KEY);
    localStorage.removeItem('gacha-result-v1');
    window.location.reload();
  };

  // ── Derived KPI values ──
  const activeStrategyCount = Object.values(strategies).filter((s) => s.isActive).length;
  const p90Balance = gachaSimResult && probTimeline.length > 0 ? Math.min(...probTimeline.map((point) => point.pyroxeneLow)) : null;
  const failedUsersPerHundred = bankruptcyRate === null ? null : Math.round(bankruptcyRate);
  const numberLocale = locale.replace('_', '-');
  const fmt = (n: number) => Math.round(n).toLocaleString(numberLocale);

  return (
    <div className="py-4 sm:py-6 px-2 sm:px-4 min-h-screen">
      {/* ── Header row ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="p-1">
          <PageHeader title={t('title')} badge="BETA" description={t('intro.summary')} />
        </div>

        {/* Server toggle pill */}
        <div className="flex rounded-lg bg-neutral-200/70 dark:bg-neutral-800 p-1 shrink-0 self-start sm:mt-1">
          <button
            onClick={() => setServer('KR')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              server === 'KR' ? 'bg-white dark:bg-neutral-700 text-ba-btn-blue' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            {t('server.kr_global')}
          </button>
          <button
            onClick={() => setServer('JP')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              server === 'JP' ? 'bg-white dark:bg-neutral-700 text-amber-600' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            {t('server.jp')}
          </button>
        </div>
      </div>

      {/* ── Legacy link ── */}
      <Link
        to={localeLink(locale, `/planner/gacha_old`)}
        className="mb-4 flex items-center justify-between rounded-lg border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800/60 px-4 py-3 hover:border-neutral-400 dark:hover:border-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors group"
      >
        <div>
          <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">{t('old_version_title')}</div>
          <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{t('old_version_description')}</div>
        </div>
        <span className="text-lg text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors">→</span>
      </Link>

      {/* ── Guide ── */}
      <PlannerGuide collapsed={guideHidden} onToggle={() => setGuideHidden((v) => !v)} gachaTestPath={localeLink(locale, '/planner/gacha-test')} />

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 rounded-xl border border-neutral-200 dark:border-neutral-800 divide-x divide-y divide-neutral-200 dark:divide-neutral-800 mb-5 overflow-hidden">
        {/* Currently owned — Manual input available */}
        <div className="px-4 py-3">
          <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mb-1 flex items-center gap-1" style={monoStyle}>
            {pyroxeneIcon && (
              <span className="shrink-0 inline-flex items-center justify-center" style={{ width: 12, height: 12 }}>
                <img src={`data:image/webp;base64,${pyroxeneIcon}`} className="max-w-full max-h-full object-cover" />
              </span>
            )}
            {t('current_balance_input')}
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={t('current_balance_input')}
            value={fmt(incomeConfig.currentPyroxene)}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, '');
              setIncomeConfig((prev) => ({ ...prev, currentPyroxene: digits ? Number(digits) : 0 }));
            }}
            className="min-w-0 w-full text-[26px] font-black tabular-nums leading-none bg-transparent border-none outline-none"
            style={{ ...monoStyle, color: '#77e0ff', fontSize: '26px', WebkitTextSizeAdjust: '100%' }}
          />
        </div>

        {/* P90 balance at the tightest point in the plan */}
        <div className="px-4 py-3">
          <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mb-1 flex items-center gap-1" style={monoStyle}>
            {pyroxeneIcon && (
              <span className="shrink-0 inline-flex items-center justify-center" style={{ width: 12, height: 12 }}>
                <img src={`data:image/webp;base64,${pyroxeneIcon}`} className="max-w-full max-h-full object-cover" />
              </span>
            )}
            {t('balance_p90')}
          </div>
          <div
            className={`flex items-baseline gap-1.5 ${p90Balance === null ? 'text-neutral-400 dark:text-neutral-500' : p90Balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
            style={monoStyle}
          >
            <span className="text-[26px] font-black tabular-nums leading-none">{p90Balance !== null ? `${p90Balance < 0 ? '-' : '+'}${fmt(Math.abs(p90Balance))}` : '—'}</span>
            {p90Balance !== null && <span className="text-[11px] font-bold">{t(p90Balance < 0 ? 'balance_shortfall' : 'balance_surplus')}</span>}
          </div>
        </div>

        {/* Planned banners */}
        <div className="px-4 py-3">
          <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mb-1" style={monoStyle}>
            {t('planned_banners')}
          </div>
          <div className="text-[26px] font-black tabular-nums leading-none text-neutral-800 dark:text-neutral-100" style={monoStyle}>
            {activeStrategyCount}
          </div>
        </div>

        {/* Pyroxene sufficiency probability */}
        <div className="px-4 py-3">
          <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mb-1" style={monoStyle}>
            {t('result_view.summary.safety.title')}
          </div>
          <div className="text-[26px] font-black tabular-nums leading-none" style={{ ...monoStyle, color: bankruptcyRate !== null ? bankruptcyColor(bankruptcyRate) : '#a3a3a3' }}>
            {bankruptcyRate !== null ? `${(100 - bankruptcyRate).toFixed(1)}%` : '—'}
          </div>
          {failedUsersPerHundred !== null && <div className="mt-1.5 text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">{t('failure_out_of_100', { count: failedUsersPerHundred })}</div>}
        </div>
      </div>

      {/* ── Timeline chart ── */}
      <section className="mb-5">
        <SectionDivider label={t('section_result')} />
        {probTimeline.length > 0 ? (
          <PyroTimelineChart
            probTimeline={probTimeline}
            customLines={customLinesConfig}
            customPercentiles={customPercentiles}
            bannerMarkers={studentMarkers}
            onAddCustomLine={(val) => {
              if (!customPercentiles.includes(val)) {
                setCustomPercentiles([...customPercentiles, val].sort((a, b) => a - b));
              }
            }}
            onRemoveCustomLine={(val) => {
              setCustomPercentiles((prev) => prev.filter((v) => v !== val));
            }}
          />
        ) : (
          <div className="h-48 flex items-center justify-center text-neutral-400 dark:text-neutral-500 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800">
            <FaSpinner className="animate-spin mr-2" />
            {t_ui('loading')}
          </div>
        )}
      </section>

      {/* ── Two-column layout: banners (left) + settings sidebar (right) ── */}
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-5 lg:items-start pb-8">
        {/* Left: Banner strategy */}
        <section className="mb-5 lg:mb-0 min-w-0">
          <SectionDivider label={t('section_strategy')} right={activeStrategyCount > 0 ? t('active_banner_count', { count: activeStrategyCount }) : undefined} />
          {/* CSV banners enriched by clientLoader (portraits/names/school in place) */}
          <BannerPlanner_v2
            banners={banners}
            strategies={strategies}
            portraitMap={portraitMap}
            pyroxeneIcon={pyroxeneIcon}
            onUpdateStrategy={updateStrategy}
            onUpdateStudentConfig={updateStudentConfig}
            gachaSimResult={gachaSimResult}
            onResetPlannerData={handleResetPlannerData}
          />
        </section>

        {/* Right: Sim + Income settings sidebar */}
        <div className="lg:sticky lg:top-4">
          <SectionDivider label={t('section_settings')} />
          <IncomePlannerPanel_v2
            config={incomeConfig}
            setConfig={setIncomeConfig}
            schedules={plannerSchedules}
            apOverrides={apOverrides}
            onApChange={handleApChange}
            banners={banners}
            strategies={strategies}
            allStudents={allStudents}
            ownedStudentIds={ownedStudentIds}
            portraitMap={portraitMap}
            pyroxeneIcon={pyroxeneIcon}
            apIcon={apIcon}
            elephIconMap={elephIconMap}
            ticket1Icon={ticket1Icon}
            ticket10Icon={ticket10Icon}
            gachaSimResult={gachaSimResult}
            setGachaSimResult={setGachaSimResult}
            bankruptcyRate={bankruptcyRate}
            stats={displayStats}
            minMaxCdf={minMaxCdf}
            hasSimulation={gachaSimResult !== null}
            simulationDays={SIMULATION_DAYS}
          />
        </div>
      </div>
    </div>
  );
}
