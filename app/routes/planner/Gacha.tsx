import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCalculator, FaChartLine, FaClipboardList, FaGlobeAsia, FaServer, FaSpinner, FaInfoCircle, FaTimes, FaExclamationTriangle } from 'react-icons/fa';

import { parseAndGroupBanners, getAllStudents, type SchaleStudent } from '~/utils/gachaData';
import IncomeTab from '~/components/gacha/IncomeTab';
import StrategyTab from '~/components/gacha/StrategyTab';
import ResultTab from '~/components/gacha/ResultTab';

import { loadScheduleData, type ScheduleItem } from '~/utils/calender.data';
import { getInstance } from '~/middleware/i18next';
import type { GameServer } from '~/types/data';
import { data, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import type { Locale } from '~/utils/i18n/config';
import { PYROXENE_PER_EVENT, PYROXENE_PER_MAIN_STORY, type PlannerSchedule } from '~/utils/pyroxeneCalc';
import type { GlobalAggregatedResult } from '~/utils/gachaEngine';
import type { BannerStrategy, StudentStrategyConfig } from '~/types/gacha';
import { createMetaDescriptor } from '~/components/head';
import type { Route } from './+types/Gacha';
import { cdn } from '~/utils/cdn';
import { useLocalStorage } from '~/utils/useLocalStorage';

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
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/f.webp');
}

export default function GachaMain() {
  const { scheduleData } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'gacha' });
  const { t: t_cal } = useTranslation('calendar');
  const locale = i18n.language as Locale;

  // --- State ---
  const [server, setServer] = useState<'KR' | 'JP'>('KR');
  const [activeTab, setActiveTab] = useState<'income' | 'strategy' | 'result'>('income');

  // State for showing/hiding the introduction section
  const [showIntro, setShowIntro] = useState(true);

  // State for banner and student data
  const [banners, setBanners] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [portraitMap, setPortraitMap] = useState<Record<number, string>>({});
  // const [strategies, setStrategies] = useState<Record<string, BannerStrategy>>({});
  const [strategies, setStrategies] = useLocalStorage<Record<string, BannerStrategy>>('gacha_strategies_v1', {});
  const [_error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [gachaSimResult, setGachaSimResult] = useState<GlobalAggregatedResult | null>(null);
  const [bankruptcyRate, setBankruptcyRate] = useState<number | null>(null);

  // State for currency supply settings
  const [incomeConfig, setIncomeConfig] = useState<PyroxeneConfig>({
    currentPyroxene: 24000,
    currentTicket1: 0,
    currentTicket10: 0,
    monthlyCard: true,
    halfMonthlyCard: false,
    monthlyPackCost: 0,
    monthlyExtraGem: 1200, // Default value: 1200
    apRefreshes_normal: 0,
    apRefreshes_event: 0,
    raidRank: 'platinum',
    pvpRankTier: 100,
  });

  // --- Schedule data transformation logic ---
  const plannerSchedules: PlannerSchedule[] = useMemo(() => {
    if (!scheduleData || !scheduleData.tracks) return [];

    const tracks = scheduleData.tracks;
    const result: PlannerSchedule[] = [];

    const toYMD = (dateStr: string) => (dateStr ? dateStr.split('T')[0] : '');

    const mapItems = (items: ScheduleItem[], type: PlannerSchedule['type']) => {
      if (!items) return;

      items.forEach((item) => {
        if (type == 'Campaign') {
          let displayTitle = item.title;
          if (item.type === 'campaign' && item.details?.campaignType) {
            const rawTitle = t_cal(`campaign.${item.details.campaignType.toLowerCase()}` as any) as string;
            const multiplier = item.title.split(' x')[1];
            displayTitle = multiplier ? `${rawTitle} x${multiplier}` : rawTitle;
            item.title = displayTitle;
          }
        }

        let amount: undefined | number = undefined;
        if (type == 'Event') {
          const event_season = Number(item.id.split('-')[1]);
          amount = event_season in PYROXENE_PER_EVENT ? PYROXENE_PER_EVENT[event_season] : 1800; // Default to 1800 if no data
        }

        if (type == 'MainStory') {
          amount = item.title.trim() in PYROXENE_PER_MAIN_STORY ? PYROXENE_PER_MAIN_STORY[item.title.trim()] : 100;
        }

        result.push({
          id: item.id,
          name: item.title,
          start: toYMD(item.startTime),
          end: toYMD(item.endTime),
          type: type,
          amount: amount,
        });
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

    return result;
  }, [scheduleData, t_cal]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [studentRes, portraitRes] = await Promise.all([fetch(cdn(`/schaledb.com/${locale}.students.min.json`)), fetch(cdn('/w/students_portrait.json'))]);
        if (!studentRes.ok) throw new Error(t('errors.load_students'));
        const rawStudentData = (await studentRes.json()) as any;
        const rawPortraitData = portraitRes.ok ? ((await portraitRes.json()) as any) : {};
        setPortraitMap(rawPortraitData);
        const studentMap: Record<string, SchaleStudent> = {};
        const studentList = Array.isArray(rawStudentData) ? rawStudentData : Object.values(rawStudentData);
        studentList.forEach((s: any) => {
          studentMap[s.Id] = s;
        });
        const loadedBanners = parseAndGroupBanners(server, studentMap);
        const students = getAllStudents(studentMap);
        setBanners(loadedBanners);
        setAllStudents(students);
        setStrategies((prev) => {
          const newStrategies: Record<string, BannerStrategy> = {};
          loadedBanners.forEach((b) => {
            if (prev[b.id]) {
              newStrategies[b.id] = prev[b.id];
            } else {
              const configs: Record<number, StudentStrategyConfig> = {};
              b.pickupStudents.forEach((s, idx) => {
                configs[s.id] = {
                  studentId: s.id,
                  priority: idx + 1,
                  mode: 'skip',
                  opportunisticThreshold: 50,
                  intentionalSpark: false,
                  intentionalSparkThreshold: 20,
                };
              });
              newStrategies[b.id] = {
                bannerId: b.id,
                isActive: false,
                maxSparks: 1,
                minPulls: 0,
                studentConfigs: configs,
                freePulls: 0,
                maxPulls: 200,
                isFes: false,
                targets: [],
              };
            }
          });
          return newStrategies;
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

  useEffect(() => {
    if (server === 'JP' && activeTab === 'income') {
      setActiveTab('strategy');
    }
  }, [server]);

  const updateStrategy = (id: string, updates: Partial<BannerStrategy>) => {
    setStrategies((prev) => ({ ...prev, [id]: { ...prev[id], ...updates } }));
  };

  const updateStudentConfig = (bid: string, sid: number, updates: Partial<StudentStrategyConfig>) => {
    setStrategies((prev) => ({
      ...prev,
      [bid]: {
        ...prev[bid],
        studentConfigs: {
          ...prev[bid].studentConfigs,
          [sid]: { ...prev[bid].studentConfigs[sid], ...updates },
        },
      },
    }));
  };

  if (loading)
    return (
      <div className="p-10 flex justify-center min-h-screen">
        <FaSpinner className="animate-spin text-3xl text-blue-600 dark:text-blue-400" />
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto p-4 min-h-screen transition-colors">
      {/* 1. Header & Server selection */}
      <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">{t('title')} (BETA)</h1>

        <div className="bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm flex text-sm font-bold">
          <button
            onClick={() => setServer('KR')}
            className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${
              server === 'KR' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <FaGlobeAsia /> {t('server.kr_global')}
          </button>
          <div className="w-px bg-slate-200 dark:bg-slate-800 my-1 mx-1"></div>
          <button
            onClick={() => setServer('JP')}
            className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${
              server === 'JP' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <FaServer /> {t('server.jp')}
          </button>
        </div>
      </div>

      {showIntro && (
        <div className="relative mb-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowIntro(false)}
            className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors z-10"
            aria-label="Close introduction"
          >
            <FaTimes />
          </button>

          <div className="p-5">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-3">
              <FaInfoCircle className="text-blue-500" />
              {t('intro.title')}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed pr-8">{t('intro.summary')}</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              {/* Feature 2: Strategy formulation */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200 mb-1">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 flex items-center justify-center text-xs">1</div>
                  {t('intro.feat2_title')}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 pl-8">{t('intro.feat2_desc')}</div>
              </div>

              {/* Feature 3: Simulation */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200 mb-1">
                  <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/50 text-green-600 flex items-center justify-center text-xs">2</div>
                  {t('intro.feat3_title')}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 pl-8">{t('intro.feat3_desc')}</div>
              </div>

              {/* Feature 1: Currency supply calculation */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200 mb-1">
                  <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 flex items-center justify-center text-xs">3</div>
                  {t('intro.feat1_title')}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 pl-8">{t('intro.feat1_desc')}</div>
              </div>
            </div>

            {/* Notes and assumptions section */}
            <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-lg border border-amber-200 dark:border-amber-800/30">
              <h3 className="text-sm font-bold text-amber-800 dark:text-amber-500 mb-2 flex items-center gap-1.5">
                <FaExclamationTriangle className="text-amber-500" />
                {t('intro.notes.title')}
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

      {/* 3. Tab navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 mb-6 overflow-x-auto">
        <TabButton isActive={activeTab === 'strategy'} onClick={() => setActiveTab('strategy')} icon={<FaClipboardList />} label={t('tabs.strategy')} />
        <TabButton isActive={activeTab === 'result'} onClick={() => setActiveTab('result')} icon={<FaCalculator />} label={t('tabs.result')} />
        {server === 'KR' && <TabButton isActive={activeTab === 'income'} onClick={() => setActiveTab('income')} icon={<FaChartLine />} label={t('tabs.income')} />}
      </div>

      <div className="mt-6">
        {activeTab === 'income' && (
          <IncomeTab
            config={incomeConfig}
            setConfig={setIncomeConfig}
            banners={banners}
            strategies={strategies}
            schedules={plannerSchedules}
            gachaSimResult={gachaSimResult}
            setBankruptcyRate={setBankruptcyRate}
          />
        )}
        {activeTab === 'strategy' && (
          <StrategyTab banners={banners} strategies={strategies} portraitMap={portraitMap} onUpdateStrategy={updateStrategy} onUpdateStudentConfig={updateStudentConfig} server={server} />
        )}
        {activeTab === 'result' && (
          <ResultTab
            config={incomeConfig}
            banners={banners}
            strategies={strategies}
            allStudents={allStudents}
            portraitMap={portraitMap}
            gachaSimResult={gachaSimResult}
            setGachaSimResult={setGachaSimResult}
            bankruptcyRate={bankruptcyRate}
            setBankruptcyRate={setBankruptcyRate}
          />
        )}
      </div>
    </div>
  );
}

const TabButton = ({ isActive, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-colors whitespace-nowrap ${
      isActive
        ? 'border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400 font-bold bg-blue-50/50 dark:bg-blue-900/20'
        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/50'
    }`}
  >
    {icon} <span>{label}</span>
  </button>
);
