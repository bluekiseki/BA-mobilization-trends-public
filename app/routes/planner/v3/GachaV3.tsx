// app/routes/planner/Gacha_v2.tsx
import React, { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { parseAndGroupBanners, getAllStudents, normalizePortraitMap, withPickupFallbackStudents, type SchaleStudent, type BannerPeriod } from '~/utils/gachaData';
import type { Student } from '~/types/gacha';
import '~/components/gacha/v3/v3.css';
import IncomePlannerPanelV3 from '~/components/gacha/v3/IncomePlannerPanelV3';
import type { CustomIncome } from '~/utils/pyroxeneCalc';
import BannerPlannerV3 from '~/components/gacha/v3/BannerPlannerV3';

import PyroTimelineChartV3 from '~/components/gacha/v3/PyroTimelineChartV3';
import type { ProbTimelinePoint, CustomLineConfig, BannerStudentMarker } from '~/components/gacha/v3/timelineTypes';

import { loadScheduleDataV2, type ScheduleItemV2 } from '~/utils/calender.data.v2';
import { getItemTitle } from '~/utils/scheduleDisplay';
import { getInstance } from '~/middleware/i18next';
import type { GameServer } from '~/types/data';
import { data, useLoaderData, type LoaderFunctionArgs } from 'react-router';
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
import { PYROXENE_PER_PULL_UNIT, resolveMaxPull, ticketCreditedDist, type GlobalAggregatedResult, type DistributionData } from '~/utils/gachaEngine';
import type { BannerStrategy, StudentStrategyConfig } from '~/types/gacha';
import { createLinkHreflang, createLocalizedUrl, createMetaDescriptor } from '~/components/shell/head';
import type { Route } from './+types/GachaV3';
import { cdn } from '~/utils/cdn';
import { useLocalStorage } from '~/hooks/useLocalStorage';
import { GUIDE_STORAGE_KEY } from '~/components/gacha/PlannerGuide';
import GuideV3 from '~/components/gacha/v3/GuideV3';
import { useSyncStore } from '~/store/syncStore';

import type { AppHandle } from '~/types/link';
import { useGachaResultStore } from '~/store/planner/useGachaResultStore';
import { useGlobalStore } from '~/store/planner/useGlobalStore';
import { ConfirmDialog } from '~/components/common/ConfirmDialog';

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
      ...createLinkHreflang(`/planner/gacha/v3`),
    ];
  },
};

export function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const server = (url.searchParams.get('server') as GameServer) || 'kr';

  const i18n = getInstance(context);
  const locale = i18n.language as Locale;

  const scheduleData = loadScheduleDataV2({ server, tracksToLoad: 'all' });

  return data({
    siteTitle: i18n.t('common:title'),
    title: i18n.t('planner:gacha.title'),
    description: i18n.t('planner:gacha.intro.summary'),
    server,
    scheduleData,
    canonicalUrl: createLocalizedUrl(locale, '/planner/gacha/v3'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    ...createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/gacha.webp', loaderData.canonicalUrl),
    { tagName: 'link', rel: 'canonical', href: loaderData.canonicalUrl },
  ];
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
// Keep route metadata server-rendered; persisted controls mount after hydration.

interface TimelinePoint {
  date: string;
  pyroxene: number;
  logs: { i18nKey?: string; params?: Record<string, string | number>; title?: string; amount: number }[];
}

export const SIMULATION_DAYS = 140;

// Retain the shared preference shape for compatibility with v2.
const SIDEBAR_WIDTH_DEFAULT = 340;

const GACHA_PREFS_DEFAULT = {
  server: 'KR' as 'KR' | 'JP',
  customPercentiles: [] as number[],
  kpiPercentile: 96 as number,
  sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
  incomeConfig: {
    currentPyroxene: 0, //24000,
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
  if ((s.maxPull ?? 200) !== 200 || s.minPulls !== 0 || s.freePulls !== 0) return true;
  if (s.claimRecruitBonus ?? false) return true;
  return Object.values(s.studentConfigs).some((cfg) => cfg.mode !== 'skip');
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
      // Self-heal: drop the deprecated spark/half-charge budget fields, collapsing them into maxPull once.
      const rest = Object.fromEntries(Object.entries(match).filter(([key]) => !['maxSparks', 'maxHalfCharges', 'maxPulls'].includes(key))) as Omit<
        BannerStrategy,
        'maxSparks' | 'maxHalfCharges' | 'maxPulls'
      >;
      next[b.id] = { ...rest, bannerId: b.id, server, maxPull: match.maxPull ?? resolveMaxPull(match, b.useChargeSystem) };
    } else {
      const configs: Record<number, StudentStrategyConfig> = {};
      b.pickupStudents.forEach((s, idx) => {
        configs[s.id] = { studentId: s.id, priority: idx + 1, mode: 'skip', opportunisticThreshold: 50, intentionalSpark: false, intentionalSparkThreshold: 20 };
      });
      next[b.id] = {
        bannerId: b.id,
        server,
        isActive: false,
        minPulls: 0,
        studentConfigs: configs,
        freePulls: 0,
        isFes: false,
        claimRecruitBonus: false,
        recruitBonusThreshold: 10,
      };
    }
  });
  return next;
}

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const PAGE_WRAPPER_CLASS = 'gacha-v3 px-4 py-4 pb-10 text-sm text-neutral-900 dark:text-neutral-100 sm:px-6 sm:pb-12';

// Shared by the pre-hydration fallback and the main page so the header does not shift when the planner mounts.
function PageHeader({ server, onServerChange }: { server: 'KR' | 'JP'; onServerChange?: (server: 'KR' | 'JP') => void }) {
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'gacha' });
  const { t: tUi } = useTranslation('ui');
  return (
    <header className="v3-page-header mb-8 lg:mb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">
          {t('title')} <span className="text-xs text-neutral-500">BETA · v3</span>
        </h1>
        <div className="flex flex-wrap gap-3">
          <div role="group" aria-label={tUi('server')} className="flex gap-1">
            {(['KR', 'JP'] as const).map((value) => (
              <button key={value} aria-pressed={server === value} disabled={!onServerChange} className={server === value ? 'v3-selected' : 'v3-button'} onClick={() => onServerChange?.(value)}>
                {t(value === 'KR' ? 'server.kr_global' : 'server.jp')}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-neutral-600 dark:text-neutral-400">{t('v3.page.intro')}</p>
      </div>
      <GuideV3 locale={i18n.language as Locale} />
    </header>
  );
}

export default function GachaV3() {
  const hydrated = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  const { t } = useTranslation('planner', { keyPrefix: 'gacha' });
  // Mount persisted planner state after hydration so server defaults cannot overwrite saved strategies.
  return hydrated ? (
    <GachaMain />
  ) : (
    <div className={PAGE_WRAPPER_CLASS}>
      <PageHeader server="KR" />
      <p role="status" className="text-neutral-600 dark:text-neutral-400">
        {t('v3.page.loading')}
      </p>
    </div>
  );
}

function GachaMain() {
  // studentMap/baseStudents/portraitMap only land once clientLoader resolves; during SSR and early
  // hydration (no HydrateFallback) they read as undefined rather than showing a fallback.
  const loaderData = useLoaderData<typeof clientLoader>();
  const { scheduleData, studentMap } = loaderData;
  const baseStudents = loaderData.baseStudents ?? [];
  const portraitMap = loaderData.portraitMap ?? {};
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'gacha' });

  useTranslation('calendar'); // Load schedule labels for mini stories and joint firing drills.
  useTranslation('jukebox'); // Load main story title translations for the income timeline.
  const locale = i18n.language as Locale;

  const syncPush = useSyncStore((s) => s.push);

  // Default hidden: a fresh visitor sees the collapsed pill first (see PlannerGuide.tsx's FOUC script,
  // which is written for this same default). Anyone who already interacted with it keeps their choice.

  // Simple/expert display mode — 'expert' keeps today's full-featured planner untouched; 'simple'
  // hides advanced controls the rest of this file conditions on `mode`. Same useLocalStorage pattern
  // as guideHidden/prefs above; scoped to this route only, so no need for a separate store module.

  const [prefs, setPrefs] = useLocalStorage('gacha_prefs_v1', GACHA_PREFS_DEFAULT);
  const { server, customPercentiles, incomeConfig } = prefs;
  // Prefs saved only by the v2/old routes lack this field.
  const kpiPercentile = prefs.kpiPercentile ?? GACHA_PREFS_DEFAULT.kpiPercentile;
  const setServer = (s: 'KR' | 'JP') => setPrefs((p) => ({ ...p, server: s }));
  const setCustomPercentiles = (v: number[] | ((prev: number[]) => number[])) => setPrefs((p) => ({ ...p, customPercentiles: v instanceof Function ? v(p.customPercentiles) : v }));
  const setKpiPercentile = (v: number) => setPrefs((p) => ({ ...p, kpiPercentile: v }));
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
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

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
    mapItems(
      tracks['campaign'].filter((item) => item.details?.campaignType !== 'Exp'),
      'Campaign',
    );
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
      let pyroxeneKpi = point.pyroxene;
      const customValues: Record<string, number> = {};

      if (dist) {
        pyroxeneHigh = point.pyroxene - getBinStartByCdf(dist, 10);
        pyroxeneAvg = point.pyroxene - getBinStartByCdf(dist, 50);
        pyroxeneLow = point.pyroxene - getBinStartByCdf(dist, 90);
        pyroxeneWorst = point.pyroxene - getBinStartByCdf(dist, 99.5);
        pyroxeneKpi = point.pyroxene - getBinStartByCdf(dist, kpiPercentile);
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
        pyroxeneKpi,
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
  }, [baseTimeline, banners, strategies, gachaSimResult, customPercentiles, kpiPercentile, initialTicketBatches]);

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
    // Achromatic (grayscale) so a custom line never reads as a semantic warning/danger color like the
    // app's amber/red — distinguished from each other and from --v3-cash/--v3-ticket by shade + dash rhythm.
    const colors = ['var(--v3-custom-1)', 'var(--v3-custom-2)', 'var(--v3-custom-3)', 'var(--v3-custom-4)'];
    const dashes = ['6 3', '2 2', '9 3 2 3', '1 4'];
    return customPercentiles.map((p, i) => ({
      dataKey: `custom_${p}`,
      name: t('income.chart.upper_x', { x: p }),
      color: colors[i % colors.length],
      strokeDasharray: dashes[i % dashes.length],
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
    setResetConfirmOpen(false);
    localStorage.removeItem('gacha_prefs_v1');
    localStorage.removeItem('gacha_strategies_v3');
    localStorage.removeItem('gacha_v3_banner_view');
    localStorage.removeItem(GUIDE_STORAGE_KEY);
    localStorage.removeItem('gacha-result-v1');
    window.location.reload();
  };

  // ── Derived KPI values ──
  const kpiBalance = gachaSimResult && probTimeline.length > 0 ? Math.min(...probTimeline.map((point) => point.pyroxeneKpi)) : null;
  return (
    <div className={PAGE_WRAPPER_CLASS}>
      <PageHeader server={server} onServerChange={setServer} />
      <IncomePlannerPanelV3
        config={incomeConfig}
        setConfig={setIncomeConfig}
        schedules={plannerSchedules}
        apOverrides={apOverrides}
        onApChange={handleApChange}
        banners={banners}
        strategies={strategies}
        allStudents={allStudents}
        region={server}
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
        kpiBalance={kpiBalance}
        kpiPercentile={kpiPercentile}
        onKpiPercentileChange={setKpiPercentile}
        timeline={
          <PyroTimelineChartV3
            probTimeline={probTimeline}
            customLines={customLinesConfig}
            customPercentiles={customPercentiles}
            bannerMarkers={studentMarkers}
            hasResults={gachaSimResult !== null}
            onAddCustomLine={(value) => setCustomPercentiles((prev) => (prev.includes(value) ? prev : [...prev, value].sort((a, b) => a - b)))}
            onRemoveCustomLine={(value) => setCustomPercentiles((prev) => prev.filter((p) => p !== value))}
          />
        }
        plan={(resultState) => (
          <section className="min-w-0">
            <BannerPlannerV3
              banners={banners}
              strategies={strategies}
              portraitMap={portraitMap}
              pyroxeneIcon={pyroxeneIcon}
              onUpdateStrategy={updateStrategy}
              onUpdateStudentConfig={updateStudentConfig}
              gachaSimResult={gachaSimResult}
              resultState={resultState}
            />
          </section>
        )}
      />
      <button type="button" className="mt-4 text-xs text-neutral-600 underline dark:text-neutral-400" onClick={() => setResetConfirmOpen(true)}>
        {t('v3.page.reset')}
      </button>
      <ConfirmDialog open={resetConfirmOpen} message={t('reset_confirm')} danger onCancel={() => setResetConfirmOpen(false)} onConfirm={handleResetPlannerData} />
    </div>
  );
}
