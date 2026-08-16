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
import type { Locale } from '~/utils/i18n/config';
import { calculatePyroxeneTimeline, getCdfByBinValue, getBinStartByCdf, getEventPyroxeneReward, PYROXENE_PER_MAIN_STORY, type PlannerSchedule, type SimulationStats } from '~/utils/pyroxeneCalc';
import type { GlobalAggregatedResult, DistributionData } from '~/utils/gachaEngine';
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

export interface PyroxeneConfig {
  currentPyroxene: number;
  currentTicket1: number;
  currentTicket10: number;
  monthlyCard: boolean;
  halfMonthlyCard: boolean;
  monthlyExtraGem: number;
  monthlyPackCost: number;
  apRefreshes_normal: number;
  apRefreshes_event: number;
  apRefreshes_campaigns?: Record<string, number>;
  raidRank: 'platinum' | 'gold' | 'silver' | 'bronze';
  pvpRankTier: number;
}

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
      { rel: 'preload', href: cdn(`/ew/icon_img.json`), as: 'fetch', crossOrigin: 'anonymous' },
      { rel: 'preload', href: cdn(`/ew/icon_img.854.json`), as: 'fetch', crossOrigin: 'anonymous' },
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
    currentTicket1: 0,
    currentTicket10: 0,
    monthlyCard: true,
    halfMonthlyCard: false,
    monthlyPackCost: 0,
    monthlyExtraGem: 1200,
    apRefreshes_normal: 0,
    apRefreshes_event: 0,
    apRefreshes_campaigns: {},
    raidRank: 'platinum',
    pvpRankTier: 100,
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

export default function GachaMain() {
  const { scheduleData } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'gacha' });
  const { t: t_planner } = useTranslation('planner');
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

  const [banners, setBanners] = useState<BannerPeriod[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [portraitMap, setPortraitMap] = useState<Record<number, string>>({});
  const [pyroxeneIcon, setPyroxeneIcon] = useState<string | null>(null);
  const [apIcon, setApIcon] = useState<string | null>(null);
  const [elephIconMap, setElephIconMap] = useState<Record<string, string>>({});
  const [ticket1Icon, setTicket1Icon] = useState<string | null>(null);
  const [ticket10Icon, setTicket10Icon] = useState<string | null>(null);

  const [savedStrategies] = useLocalStorage<Record<string, BannerStrategy>>('gacha_strategies_v2', {});
  const savedStrategiesRef = useRef(savedStrategies);
  savedStrategiesRef.current = savedStrategies;
  const [strategies, setStrategies] = useState<Record<string, BannerStrategy>>({});

  useEffect(() => {
    if (Object.keys(strategies).length === 0) return;
    try {
      const modified = Object.fromEntries(Object.entries(strategies).filter(([, s]) => isStrategyModified(s)));
      window.localStorage.setItem('gacha_strategies_v2', JSON.stringify(modified));
      syncPush('gacha_strategies', modified, 2);
    } catch {}
  }, [strategies, syncPush]);

  useEffect(() => {
    syncPush('gacha_prefs', prefs, 1);
  }, [prefs, syncPush]);

  const [_error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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
          amount = title.trim() in PYROXENE_PER_MAIN_STORY ? PYROXENE_PER_MAIN_STORY[title.trim()] : 100;
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

  const displayStats = useMemo((): SimulationStats => {
    if (!gachaSimResult) return stats;
    return { ...stats, expense: { ...stats.expense, gacha: gachaSimResult.avgTotalCost } };
  }, [stats, gachaSimResult]);

  const { probTimeline, minMaxCdf } = useMemo(() => {
    if (!baseTimeline.length) return { probTimeline: [] as ProbTimelinePoint[], minMaxCdf: 100 };

    let minMaxCdfVal = 100;
    let currentDist: DistributionData[] | null = null;

    const result: ProbTimelinePoint[] = (baseTimeline as TimelinePoint[]).map((point) => {
      const activeOrPastBanners = banners.filter((b) => b.startTime <= point.date).sort((a, b) => b.startTime.localeCompare(a.startTime));

      if (activeOrPastBanners.length) {
        const latestTime = activeOrPastBanners[0].startTime;
        for (const lb of activeOrPastBanners.filter((b) => b.startTime === latestTime)) {
          if (strategies[lb.id]?.isActive && gachaSimResult?.distCostMap[lb.id]) {
            currentDist = gachaSimResult.distCostMap[lb.id];
          }
        }
      }

      const dist = currentDist;
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

      return { date: point.date, pyroxene: point.pyroxene, pyroxeneAvg, pyroxeneHigh, pyroxeneLow, pyroxeneWorst, maxCdf, logs: point.logs || [], ...customValues };
    });

    return { probTimeline: result, minMaxCdf: minMaxCdfVal };
  }, [baseTimeline, banners, strategies, gachaSimResult, customPercentiles]);

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

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [studentRes, portraitRes, iconImgRes, iconImgExtraRes] = await Promise.all([
          fetch(cdn(`/schaledb.com/${locale}.students.min.json`)),
          fetch(cdn('/w/students_portrait.json')),
          fetch(cdn('/ew/icon_img.json')),
          fetch(cdn('/ew/icon_img.854.json')),
        ]);
        if (!studentRes.ok) throw new Error(t('errors.load_students'));
        const rawStudentData: SchaleStudent[] | Record<string, SchaleStudent> = await studentRes.json();
        const rawPortraitData: Record<string, string> = portraitRes.ok ? await portraitRes.json() : {};
        setPortraitMap(normalizePortraitMap(rawPortraitData));
        if (iconImgRes.ok) {
          const iconImgData: Record<string, Record<string, string>> = await iconImgRes.json();
          if (iconImgExtraRes.ok) {
            const extra: Record<string, Record<string, string>> = await iconImgExtraRes.json();
            for (const key of Object.keys(extra)) {
              iconImgData[key] = { ...(iconImgData[key] ?? {}), ...extra[key] };
            }
          }
          setPyroxeneIcon(iconImgData?.Currency?.['3'] ?? null);
          setApIcon(iconImgData?.Currency?.['5'] ?? null);
          setElephIconMap(iconImgData?.Item ?? {});
          setTicket1Icon(iconImgData?.Item?.['6998'] ?? null);
          setTicket10Icon(iconImgData?.Item?.['6999'] ?? null);
        }
        const studentMap: Record<string, SchaleStudent> = {};
        (Array.isArray(rawStudentData) ? rawStudentData : Object.values(rawStudentData)).forEach((s) => {
          studentMap[s.Id] = s;
        });
        const loadedBanners = parseAndGroupBanners(server, studentMap);
        setBanners(loadedBanners);
        setAllStudents(withPickupFallbackStudents(getAllStudents(studentMap), loadedBanners) as unknown as Student[]);
        setStrategies(() => {
          let saved = savedStrategiesRef.current;
          if (Object.keys(saved).length === 0) {
            try {
              const v1Raw = window.localStorage.getItem('gacha_strategies_v1');
              if (v1Raw) {
                const v1Data = JSON.parse(v1Raw) as Record<string, BannerStrategy>;
                saved = Object.fromEntries(Object.entries(v1Data).filter(([, s]) => isStrategyModified(s)));
              }
            } catch {}
          }
          const next: Record<string, BannerStrategy> = {};
          loadedBanners.forEach((b) => {
            if (saved[b.id]) {
              next[b.id] = saved[b.id];
            } else {
              const configs: Record<number, StudentStrategyConfig> = {};
              b.pickupStudents.forEach((s, idx) => {
                configs[s.id] = { studentId: s.id, priority: idx + 1, mode: 'skip', opportunisticThreshold: 50, intentionalSpark: false, intentionalSparkThreshold: 20 };
              });
              next[b.id] = {
                bannerId: b.id,
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
        });
      } catch (err) {
        console.error(err);
        setError(t('errors.load_data'));
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [server, t, locale]);

  const updateStrategy = (id: string, updates: Partial<BannerStrategy>) => setStrategies((prev) => ({ ...prev, [id]: { ...prev[id], ...updates } }));

  const updateStudentConfig = (bid: string, sid: number, updates: Partial<StudentStrategyConfig>) =>
    setStrategies((prev) => ({
      ...prev,
      [bid]: { ...prev[bid], studentConfigs: { ...prev[bid].studentConfigs, [sid]: { ...prev[bid].studentConfigs[sid], ...updates } } },
    }));

  const handleApChange = (id: string, val: string) => setApOverrides((prev) => ({ ...prev, [id]: Number(val) }));

  if (loading)
    return (
      <div className="p-10 flex justify-center min-h-screen">
        <FaSpinner className="animate-spin text-3xl text-blue-600 dark:text-blue-400" />
      </div>
    );

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
      <PlannerGuide collapsed={guideHidden} onToggle={() => setGuideHidden((v) => !v)} />

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
            {t_planner('equipment.inventoryLoadingData')}
          </div>
        )}
      </section>

      {/* ── Two-column layout: banners (left) + settings sidebar (right) ── */}
      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-5 lg:items-start pb-8">
        {/* Left: Banner strategy */}
        <section className="mb-5 lg:mb-0 min-w-0">
          <SectionDivider label={t('section_strategy')} right={activeStrategyCount > 0 ? t('active_banner_count', { count: activeStrategyCount }) : undefined} />
          <BannerPlanner_v2
            banners={banners}
            strategies={strategies}
            portraitMap={portraitMap}
            pyroxeneIcon={pyroxeneIcon}
            onUpdateStrategy={updateStrategy}
            onUpdateStudentConfig={updateStudentConfig}
            gachaSimResult={gachaSimResult}
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
