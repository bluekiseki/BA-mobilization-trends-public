// app/routes/planner/Gacha.tsx
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaChartLine, FaClipboardList, FaSpinner, FaInfoCircle, FaTimes, FaExclamationTriangle, FaChevronRight } from 'react-icons/fa';

import { parseAndGroupBanners, getAllStudents, type SchaleStudent, type BannerPeriod } from '~/utils/gachaData';
import type { Student } from '~/types/gacha';
import IncomePlannerPanel, { type CustomIncome } from '~/components/gacha/IncomePlannerPanel';
import BannerPlanner from '~/components/gacha/BannerPlanner';
import PyroTimelineChart, { type ProbTimelinePoint, type CustomLineConfig, type BannerStudentMarker } from '~/components/gacha/PyroTimelineChart';

import { loadScheduleData, type ScheduleItem } from '~/utils/calender.data';
import { getInstance } from '~/middleware/i18next';
import type { GameServer } from '~/types/data';
import { data, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import type { Locale } from '~/utils/i18n/config';
import { calculatePyroxeneTimeline, getCdfByBinValue, getBinStartByCdf, PYROXENE_PER_EVENT, PYROXENE_PER_MAIN_STORY, type PlannerSchedule, type SimulationStats } from '~/utils/pyroxeneCalc';
import type { GlobalAggregatedResult, DistributionData } from '~/utils/gachaEngine';
import type { BannerStrategy, StudentStrategyConfig } from '~/types/gacha';
import { createMetaDescriptor } from '~/components/head';
import type { Route } from './+types/Gacha';
import { cdn } from '~/utils/cdn';
import { useLocalStorage } from '~/utils/useLocalStorage';
import { SlUserFemale } from 'react-icons/sl';

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
  raidRank: 'platinum' | 'gold' | 'silver' | 'bronze';
  pvpRankTier: number;
}

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const server = (url.searchParams.get('server') as GameServer) || 'kr';

  let i18n = await getInstance(context);
  const locale = (i18n.language as Locale) || 'ko';

  const scheduleData = await loadScheduleData({
    server: server,
    locale,
    i18n,
    tracksToLoad: 'all',
  });

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
  logs: { i18nKey?: string; params?: Record<string, unknown>; title?: string; amount: number }[];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function GachaMain() {
  const { scheduleData } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'gacha' });
  const { t: t_planner } = useTranslation('planner');
  const { t: t_cal } = useTranslation('calendar');
  const locale = i18n.language as Locale;

  // --- Server & UI state ---
  const [server, setServer] = useState<'KR' | 'JP'>('KR');
  const [showIntro, setShowIntro] = useState(true);
  const [strategyDrawerOpen, setStrategyDrawerOpen] = useState(false);

  // --- Custom Prob Lines State ---
  const [customPercentiles, setCustomPercentiles] = useLocalStorage<number[]>('gacha_custom_percentiles', []);

  // --- Data state ---
  const [banners, setBanners] = useState<BannerPeriod[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [portraitMap, setPortraitMap] = useState<Record<number, string>>({});
  const [strategies, setStrategies] = useLocalStorage<Record<string, BannerStrategy>>('gacha_strategies_v1', {});
  const [_error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [gachaSimResult, setGachaSimResult] = useState<GlobalAggregatedResult | null>(null);

  // --- Income config + AP overrides ---
  const [incomeConfig, setIncomeConfig] = useState<PyroxeneConfig & { customIncomes?: CustomIncome[] }>({
    currentPyroxene: 24000,
    currentTicket1: 0,
    currentTicket10: 0,
    monthlyCard: true,
    halfMonthlyCard: false,
    monthlyPackCost: 0,
    monthlyExtraGem: 1200,
    apRefreshes_normal: 0,
    apRefreshes_event: 0,
    raidRank: 'platinum',
    pvpRankTier: 100,
  });
  const [apOverrides, setApOverrides] = useState<Record<string, number>>({});
  const [includeGacha, setIncludeGacha] = useState(true);

  // --- Schedule transformation ---
  const plannerSchedules: PlannerSchedule[] = useMemo(() => {
    if (!scheduleData || !scheduleData.tracks) return [];

    const tracks = scheduleData.tracks;
    const result: PlannerSchedule[] = [];
    const toYMD = (dateStr: string) => (dateStr ? dateStr.split('T')[0] : '');

    const mapItems = (items: ScheduleItem[], type: PlannerSchedule['type']) => {
      if (!items) return;
      items.forEach((item) => {
        if (type == 'Campaign') {
          if (item.type === 'campaign' && item.details?.campaignType) {
            const rawTitle = t_cal(`campaign.${item.details.campaignType.toLowerCase()}` as any) as string;
            const multiplier = item.title.split(' x')[1];
            item.title = multiplier ? `${rawTitle} x${multiplier}` : rawTitle;
          }
        }
        let amount: undefined | number = undefined;
        if (type == 'Event') {
          const event_season = Number(item.id.split('-')[1]);
          amount = event_season in PYROXENE_PER_EVENT ? PYROXENE_PER_EVENT[event_season] : 1800;
        }
        if (type == 'MainStory') {
          amount = item.title.trim() in PYROXENE_PER_MAIN_STORY ? PYROXENE_PER_MAIN_STORY[item.title.trim()] : 100;
        }
        result.push({ id: item.id, name: item.title, start: toYMD(item.startTime), end: toYMD(item.endTime), type, amount });
      });
    };

    mapItems(
      tracks['raid'].filter((v) => v.type == 'raid'),
      'Raid',
    );
    mapItems(
      tracks['raid'].filter((v) => v.type == 'jointFiringDrill'),
      'JointFiringDrill',
    );
    mapItems(
      tracks['raid'].filter((v) => v.type == 'eraid'),
      'Elimination',
    );
    mapItems(tracks['multifloor'], 'Multifloor');
    mapItems(tracks['event'], 'Event');
    mapItems(tracks['campaign'], 'Campaign');
    mapItems(tracks['mainstory'], 'MainStory');
    if (tracks['ministory']) mapItems(tracks['ministory'], 'MiniStory');
    if (tracks['maintenance']) mapItems(tracks['maintenance'], 'Maintenance');

    return result;
  }, [scheduleData, t_cal]);

  // --- Base timeline + stats ---
  const { timeline: baseTimeline, stats } = useMemo(() => {
    return calculatePyroxeneTimeline(incomeConfig, plannerSchedules, {
      simulationDays: 150,
      customApOverrides: apOverrides,
      customIncomes: incomeConfig.customIncomes || [],
    });
  }, [incomeConfig, plannerSchedules, apOverrides]);

  // Stats with gacha expense merged from sim result
  const displayStats = useMemo((): SimulationStats => {
    if (!includeGacha || !gachaSimResult) return stats;
    return { ...stats, expense: { ...stats.expense, gacha: gachaSimResult.avgTotalCost } };
  }, [stats, includeGacha, gachaSimResult]);

  // --- Probability timeline (percentile balance lines) ---
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

      if (dist && includeGacha) {
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
  }, [baseTimeline, banners, strategies, gachaSimResult, includeGacha, customPercentiles]);

  // Bankruptcy rate derived from minMaxCdf
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

  const allTargetedStudents = useMemo(() => {
    const seen = new Set<number>();
    return studentMarkers
      .flatMap((m) => m.students)
      .filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
  }, [studentMarkers]);

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

  // --- Data loading ---
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [studentRes, portraitRes] = await Promise.all([fetch(cdn(`/schaledb.com/${locale}.students.min.json`)), fetch(cdn('/w/students_portrait.json'))]);
        if (!studentRes.ok) throw new Error(t('errors.load_students'));
        const rawStudentData = (await studentRes.json()) as SchaleStudent[] | Record<string, SchaleStudent>;
        const rawPortraitData = portraitRes.ok ? ((await portraitRes.json()) as Record<number, string>) : {};
        setPortraitMap(rawPortraitData);
        const studentMap: Record<string, SchaleStudent> = {};
        (Array.isArray(rawStudentData) ? rawStudentData : Object.values(rawStudentData)).forEach((s) => {
          studentMap[s.Id] = s;
        });
        const loadedBanners = parseAndGroupBanners(server, studentMap);
        setBanners(loadedBanners);
        setAllStudents(getAllStudents(studentMap) as unknown as Student[]);
        setStrategies((prev) => {
          const next: Record<string, BannerStrategy> = {};
          loadedBanners.forEach((b) => {
            if (prev[b.id]) {
              next[b.id] = prev[b.id];
            } else {
              const configs: Record<number, StudentStrategyConfig> = {};
              b.pickupStudents.forEach((s, idx) => {
                configs[s.id] = { studentId: s.id, priority: idx + 1, mode: 'skip', opportunisticThreshold: 50, intentionalSpark: false, intentionalSparkThreshold: 20 };
              });
              next[b.id] = { bannerId: b.id, isActive: false, maxSparks: 1, minPulls: 0, studentConfigs: configs, freePulls: 0, maxPulls: 200, isFes: false, targets: [] };
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
    loadData();
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

  const activeStrategyCount = Object.values(strategies).filter((s) => s.isActive).length;

  return (
    <div className="max-w-7xl mx-auto p-4 min-h-screen transition-colors">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('title')} (BETA)</h1>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStrategyDrawerOpen(true)}
            className="whitespace-nowrap relative flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold shadow transition-colors"
          >
            {allTargetedStudents.length > 0 && allTargetedStudents[0].portrait ? (
              <img src={allTargetedStudents[0].portrait} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
            ) : (
              <SlUserFemale />
            )}
            {t('tabs.strategy')}
            {activeStrategyCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-yellow-400 text-[10px] font-black text-neutral-900 flex items-center justify-center">
                {activeStrategyCount}
              </span>
            )}
            <FaChevronRight className="text-xs opacity-70" />
          </button>

          <div className="bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex text-sm font-bold">
            <button
              onClick={() => setServer('KR')}
              className={`whitespace-nowrap px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${
                server === 'KR' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {t('server.kr_global')}
            </button>
            <div className="w-px bg-slate-200 dark:bg-slate-800 my-1 mx-1" />
            <button
              onClick={() => setServer('JP')}
              className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${
                server === 'JP' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {t('server.jp')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Intro ── */}
      {showIntro && (
        <div className="relative mb-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button onClick={() => setShowIntro(false)} className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors z-10">
            <FaTimes />
          </button>
          <div className="p-5">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-3">
              <FaInfoCircle className="text-blue-500" /> {t('intro.title')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed pr-8">{t('intro.summary')}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              {[
                { n: 1, title: t('intro.feat2_title'), desc: t('intro.feat2_desc'), color: 'indigo' },
                { n: 2, title: t('intro.feat3_title'), desc: t('intro.feat3_desc'), color: 'green' },
                { n: 3, title: t('intro.feat1_title'), desc: t('intro.feat1_desc'), color: 'blue' },
              ].map(({ n, title, desc, color }) => (
                <div key={n} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200 mb-1">
                    <div className={`w-6 h-6 rounded-full bg-${color}-100 dark:bg-${color}-900/50 text-${color}-600 flex items-center justify-center text-xs`}>{n}</div>
                    {title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 pl-8">{desc}</div>
                </div>
              ))}
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-lg border border-amber-200 dark:border-amber-800/30">
              <h3 className="text-sm font-bold text-amber-800 dark:text-amber-500 mb-2 flex items-center gap-1.5">
                <FaExclamationTriangle className="text-amber-500" /> {t('intro.notes.title')}
              </h3>
              <ul className="list-disc list-inside text-[13px] text-amber-900/80 dark:text-amber-200/70 space-y-1.5">
                <li>
                  {t('intro.notes.note1_pre')}
                  <a
                    href="https://docs.google.com/spreadsheets/d/1_Zjt_OM9XXidY3uYYDK92W9GrR3DN5cQsZ0IJsoEbjY"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    Google Spreadsheet
                  </a>
                  {t('intro.notes.note1_post')}
                </li>
                <li>{t('intro.notes.note2')}</li>
                <li>{t('intro.notes.note3')}</li>
                <li>{t('intro.notes.note4')}</li>
                <li>{t('intro.notes.note5')}</li>
                <li>{t('intro.notes.note6')}</li>
                <li>{t('intro.notes.note7')}</li>
                <li>{t('intro.notes.note9')}</li>
                <li>
                  <span className="font-semibold">{t('intro.notes.note8')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ══ HERO: Pyroxene Timeline Chart ══ */}
      <section className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-2 border-b border-slate-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <FaChartLine className="text-emerald-500" />
            <span className="font-bold text-slate-700 dark:text-neutral-200">{t('tabs.income')}</span>
          </div>
        </div>

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
          <div className="h-48 flex items-center justify-center text-slate-400 dark:text-neutral-500 bg-slate-50 dark:bg-neutral-900 rounded-xl border border-dashed border-slate-200 dark:border-neutral-800">
            <FaSpinner className="animate-spin mr-2" />
            {t_planner('equipment.inventoryLoadingData')}
          </div>
        )}
      </section>

      {/* ══ Merged: Income Settings + Simulation ══ */}
      <section>
        <IncomePlannerPanel
          config={incomeConfig}
          setConfig={setIncomeConfig}
          schedules={plannerSchedules}
          apOverrides={apOverrides}
          onApChange={handleApChange}
          includeGacha={includeGacha}
          onToggleIncludeGacha={() => setIncludeGacha((v) => !v)}
          banners={banners}
          strategies={strategies}
          allStudents={allStudents}
          portraitMap={portraitMap}
          gachaSimResult={gachaSimResult}
          setGachaSimResult={setGachaSimResult}
          bankruptcyRate={bankruptcyRate}
          stats={displayStats}
          minMaxCdf={minMaxCdf}
          hasSimulation={gachaSimResult !== null}
        />
      </section>

      {/* ══ Strategy Drawer ══ */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${strategyDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setStrategyDrawerOpen(false)}
      />
      <div
        className={`fixed top-0 right-0 h-full z-50 w-full md:w-[520px] bg-white dark:bg-neutral-900 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
          strategyDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-neutral-800 shrink-0">
          <h2 className="font-bold text-slate-800 dark:text-neutral-100 flex items-center gap-2">
            <FaClipboardList className="text-indigo-500" /> {t('tabs.strategy')}
          </h2>
          <button
            onClick={() => setStrategyDrawerOpen(false)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <FaTimes />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <BannerPlanner banners={banners} strategies={strategies} portraitMap={portraitMap} onUpdateStrategy={updateStrategy} onUpdateStudentConfig={updateStudentConfig} currentServer={server} />
        </div>
      </div>
    </div>
  );
}
