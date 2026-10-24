import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { data, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { Trans, useTranslation } from 'react-i18next';
import 'rc-tooltip/assets/bootstrap.css';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineArrowUpTray, HiOutlineArrowDownTray, HiOutlineArrowsUpDown } from 'react-icons/hi2';
import StudentSearchDropdown from '~/components/student/StudentSearchDropdown';
import { CombatStylePortrait } from '~/components/student/CombatStylePortrait';
import { StudentIcon } from '~/components/student/studentIcon';
import { getInstance } from '~/middleware/i18next';
import { createLinkHreflang, createMetaDescriptor } from '~/components/shell/head';
import { PageHeader } from '~/components/common/PageHeader';
import { HistoryExternalEditPromptButton } from '~/features/my/common/HistoryExternalEditPromptButton';
import { cdn } from '~/utils/cdn';
import { downloadFile } from '~/utils/downloadFile';
import { GACHA_HISTORY_EXPORT_VERSION } from '~/features/my/common/historyJsonExchange';
import { parseAndGroupBanners, type BannerPeriod } from '~/utils/gachaData';
import {
  calculateGachaHistoryStats,
  calculateGachaHistoryStatsByBanner,
  calculateTopRecruitedStudentGroups,
  DEFAULT_SIMULATION_COUNT,
  isValidGachaHistorySimulationCount,
  MAX_SIMULATION_COUNT,
  MIN_SIMULATION_COUNT,
  type DistributionSummary,
  type GachaHistoryStats,
  type StudentRecruitmentScope,
} from '~/features/my/gacha/logic/gachaHistoryStats';
import { createPoolForBanner, preprocessReleaseDates } from '~/utils/gachaEngine';
import { ProfileDataSchemas } from '~/schemas/profileDataValidation';
import { useGachaHistoryStore } from '~/store/planner/useGachaHistoryStore';
import { useAuthStore } from '~/store/authStore';
import { useSearchMatcher } from '~/hooks/useSearchMatcher';
import type { GachaHistoryEntry, GachaHistoryResult, GachaHistoryServer, GachaResultSource } from '~/types/gachaHistory';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import type { Student, StudentData, StudentPortraitData } from '~/types/plannerData';
import type { BannerPeriod as SimulationBannerPeriod, Student as SimulationStudent } from '~/types/gacha';
import { useGachaStatsSimulation } from '~/features/my/gacha/useGachaStatsSimulation';
import GachaHistoryStatsWorker from '~/workers/gacha-history-stats.worker?worker';
import { getBannerDate, bannerLabel, createForm, type FormState, BannerLuckRangeChart, type LuckRangePoint, DistributionChart } from '~/features/my/gacha/GachaHistoryParts';

type HistoryBanner = BannerPeriod & { historyId: string; server: GachaHistoryServer };

// Maps a result source to its locale key under `mypage:gacha.source.*`.
const SOURCE_LABEL_KEY: Record<GachaResultSource, 'gacha.source.normal' | 'gacha.source.halfPity' | 'gacha.source.hardPity' | 'gacha.source.pointExchange'> = {
  normal: 'gacha.source.normal',
  half_pity: 'gacha.source.halfPity',
  hard_pity: 'gacha.source.hardPity',
  point_exchange: 'gacha.source.pointExchange',
};

const MAX_VISIBLE_BANNER_STUDENTS = 4;

// 'GL' covers the Global/KR schedule (identical), so it is shown as "GL/KR".
const SERVER_LABEL: Record<GachaHistoryServer, string> = {
  GL: 'GL/KR',
  JP: 'JP',
};

// The banner schedule CSV still uses the 'KR' region key for the Global/KR schedule.
const BANNER_REGION: Record<GachaHistoryServer, 'KR' | 'JP'> = {
  GL: 'KR',
  JP: 'JP',
};

function createStatsWorker(): Worker {
  return new GachaHistoryStatsWorker();
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  return data({ siteTitle: i18n.t('common:title'), title: i18n.t('mypage:gacha.title'), description: i18n.t('mypage:gacha.description'), locale: i18n.language as Locale });
}

export function meta({ loaderData }: { loaderData: { title: string; siteTitle: string; description: string } }) {
  return createMetaDescriptor(`${loaderData.title} | ${loaderData.siteTitle}`, loaderData.description);
}

export function links() {
  return createLinkHreflang('/my/gacha');
}

export default function MyGachaHistoryPage() {
  const { title, description, locale } = useLoaderData<typeof loader>();
  const { t } = useTranslation(['mypage', 'ui', 'game', 'planner', 'common']);
  const user = useAuthStore((state) => state.user);
  const activeProfileId = useAuthStore((state) => state.activeProfileId);
  const entries = useGachaHistoryStore((state) => state.entries);
  const addEntry = useGachaHistoryStore((state) => state.addEntry);
  const updateEntry = useGachaHistoryStore((state) => state.updateEntry);
  const deleteEntry = useGachaHistoryStore((state) => state.deleteEntry);
  const replaceEntries = useGachaHistoryStore((state) => state.replaceEntries);
  const simulationCount = useGachaHistoryStore((state) => state.simulationCount ?? DEFAULT_SIMULATION_COUNT);
  const setSimulationCount = useGachaHistoryStore((state) => state.setSimulationCount);
  const [students, setStudents] = useState<Record<number, Student>>({});
  const [portraits, setPortraits] = useState<StudentPortraitData>({});
  const [tab, setTab] = useState<'records' | 'stats' | 'studentStats'>('records');
  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statsScope, setStatsScope] = useState<'all' | 'banner'>('all');
  const [selectedStatsEntryId, setSelectedStatsEntryId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [bannerQuery, setBannerQuery] = useState('');
  const matcher = useSearchMatcher(locale);
  const [selectedResultStudentId, setSelectedResultStudentId] = useState<number | null>(null);
  const [simulationCountInput, setSimulationCountInput] = useState(String(simulationCount));
  const [recordsSortAscending, setRecordsSortAscending] = useState(false);
  const [studentRecruitmentScope, setStudentRecruitmentScope] = useState<StudentRecruitmentScope>('all');
  const [resultsReversed, setResultsReversed] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const activeProfileServer = user?.profiles?.find((profile) => profile.id === activeProfileId)?.server;
  const defaultHistoryServer: GachaHistoryServer = activeProfileServer === 'jp' ? 'JP' : 'GL';

  useEffect(() => {
    setSimulationCountInput(String(simulationCount));
  }, [simulationCount]);

  const bannerOptions = useMemo<HistoryBanner[]>(
    () => (['GL', 'JP'] as const).flatMap((server) => parseAndGroupBanners(BANNER_REGION[server], null).map((banner) => ({ ...banner, server, historyId: `${server}:${banner.id}` }))),
    [],
  );
  const bannersById = useMemo(() => new Map<string, HistoryBanner>(bannerOptions.map((banner) => [banner.historyId, banner])), [bannerOptions]);
  const historyEntries = useMemo(() => entries.slice().sort((left, right) => right.date.localeCompare(left.date)), [entries]);
  const recordsListEntries = useMemo(() => (recordsSortAscending ? [...historyEntries].reverse() : historyEntries), [historyEntries, recordsSortAscending]);
  const activeStatsEntryId = selectedStatsEntryId ?? historyEntries[0]?.id ?? null;
  const selectedEntries = useMemo(() => (statsScope === 'all' ? entries : entries.filter((entry) => entry.id === activeStatsEntryId)), [activeStatsEntryId, entries, statsScope]);
  const statsContextKey = useMemo(() => `${statsScope}:${activeStatsEntryId ?? ''}:${JSON.stringify(selectedEntries)}`, [activeStatsEntryId, selectedEntries, statsScope]);
  const analyticalStats = useMemo(() => calculateGachaHistoryStats(selectedEntries, bannersById, 0), [selectedEntries, bannersById]);
  const analyticalPerBannerStats = useMemo(() => (statsScope === 'all' ? calculateGachaHistoryStatsByBanner(entries, bannersById, 0) : []), [bannersById, entries, statsScope]);
  const { completedStatsForContext, isStatsCalculating, statsSimulationErrorKey, startStatsSimulation } = useGachaStatsSimulation({
    tab,
    statsContextKey,
    selectedEntries,
    bannersById,
    statsScope,
    simulationCountInput,
    setSimulationCount,
    createWorker: createStatsWorker,
  });
  const stats = completedStatsForContext?.stats ?? analyticalStats;
  const perBannerStats = completedStatsForContext?.perBannerStats ?? analyticalPerBannerStats;

  const overview = useMemo(() => {
    const results = entries.flatMap((entry) => entry.results);
    const pickupCount = results.filter((result) => result.isPickup).length;
    return {
      pullCount: entries.reduce((sum, entry) => sum + entry.pullCount, 0),
      bannerCount: new Set(entries.map((entry) => entry.bannerId)).size,
      threeStarCount: results.length,
      // "New recruits": distinct students flagged as a first acquisition, deduped across all entries.
      newRecruitCount: new Set(results.filter((result) => result.isFirstAcquisition).map((result) => result.studentId)).size,
      pickupCount,
      pickupRate: results.length > 0 ? (pickupCount / results.length) * 100 : null,
    };
  }, [entries]);
  const topRecruitedStudentGroups = useMemo(() => calculateTopRecruitedStudentGroups(entries, studentRecruitmentScope), [entries, studentRecruitmentScope]);
  const activeBanner = form ? bannerOptions.find((banner) => banner.historyId === form.bannerId && banner.server === form.server) : undefined;
  const pickupIds = useMemo(() => new Set(activeBanner?.pickupStudents.map((student) => student.id) ?? []), [activeBanner]);
  // A banner running a normal-recruitment pickup and a limited-recruitment pickup at once has two
  // independent "recruit charge" counters, so it needs two starting-charge inputs.
  const bannerHasBothPickupTypes = useMemo(() => (activeBanner?.pickupStudents.some((s) => s.isLimited) ?? false) && (activeBanner?.pickupStudents.some((s) => !s.isLimited) ?? false), [activeBanner]);
  const goalIds = useMemo(() => new Set(form?.results.filter((result) => result.countTowardGoal).map((result) => result.studentId) ?? []), [form]);
  const roster = useMemo(() => Object.values(students).filter((student) => student.StarGrade === 3), [students]);
  const studentNames = useMemo(() => new Map(roster.map((student) => [student.Id, student.Name])), [roster]);
  const studentAliases = useMemo(() => new Map(roster.map((student) => [student.Id, student.SearchTags])), [roster]);
  const createLuckRangePoints = (selectSummary: (bannerStats: GachaHistoryStats) => DistributionSummary | null): LuckRangePoint[] =>
    perBannerStats.flatMap(({ bannerId, stats: bannerStats }) => {
      const banner = bannersById.get(bannerId);
      const summary = selectSummary(bannerStats);
      if (!banner || !summary) return [];
      const targetStudentIds = [
        ...new Set(
          entries
            .filter((entry) => entry.bannerId === bannerId)
            .flatMap((entry) => entry.results)
            .filter((result) => result.countTowardGoal)
            .map((result) => result.studentId),
        ),
      ].slice(0, 3);
      const representativeStudentIds = targetStudentIds.length > 0 ? targetStudentIds : banner.pickupStudents.slice(0, 1).map((student) => student.id);
      return [
        {
          id: bannerId,
          label: `${SERVER_LABEL[banner.server]} · ${bannerLabel(banner, studentNames)}`,
          date: banner.startTime.slice(0, 10),
          students: representativeStudentIds.map((studentId) => ({
            id: studentId,
            name: studentNames.get(studentId) ?? t('gacha.form.unknownStudent', { id: studentId }),
            portrait: portraits[studentId] ?? students[studentId]?.Portrait,
          })),
          min: summary.topPercentMin,
          max: summary.topPercentMax,
        },
      ];
    });
  const threeStarLuckPoints = createLuckRangePoints((bannerStats) => bannerStats.threeStar);
  const goalLuckPoints = createLuckRangePoints((bannerStats) => bannerStats.goals);
  const halfPityLuckPoints = createLuckRangePoints((bannerStats) => bannerStats.halfPity);
  const availableResultStudents = useMemo(() => {
    if (!activeBanner) return {};
    const poolStudents: SimulationStudent[] = roster.map((student) => ({
      id: student.Id,
      name: student.Name,
      rarity: student.StarGrade,
      isLimited: student.IsLimited?.[0] === 1,
      isFes: student.IsLimited?.[0] === 3,
      releaseDate: 0,
      isRerun: false,
    }));
    const serverBanners = bannerOptions.filter((banner) => banner.server === activeBanner.server);
    const bannersMap = serverBanners.reduce<Record<string, SimulationBannerPeriod>>((map, banner) => {
      map[banner.id] = {
        id: banner.id,
        startTime: banner.startTime,
        endTime: banner.endTime,
        isFes: banner.isFes,
        isLimitedBanner: banner.isLimitedBanner,
        isRerunBanner: banner.isRerunBanner,
        isRecall: banner.isRecall,
        freePulls: banner.freePulls,
        excludedFesId: [],
        useChargeSystem: banner.useChargeSystem,
        pickupStudents: banner.pickupStudents.map((student) => ({
          id: student.id,
          name: student.name,
          rarity: 3,
          isLimited: student.isLimited,
          isFes: student.isFes,
          releaseDate: 0,
          isRerun: student.isRerun,
        })),
      };
      return map;
    }, {});
    const pools = createPoolForBanner(poolStudents, activeBanner.startTime, preprocessReleaseDates(bannersMap), BANNER_REGION[activeBanner.server]);
    const availableIds = new Set([...pools.grade3, ...(activeBanner.isFes ? pools.fes : []), ...activeBanner.pickupStudents].map((student) => student.id));
    return Object.fromEntries(roster.filter((student) => availableIds.has(student.Id)).map((student) => [student.Id, student]));
  }, [activeBanner, bannerOptions, roster]);
  const visibleBanners = useMemo(() => {
    if (!form) return [];
    const query = bannerQuery.trim();
    const now = Date.now();
    const matchesQuery = (banner: HistoryBanner) =>
      !query || matcher(bannerLabel(banner, studentNames), query) || banner.pickupStudents.some((student) => (studentAliases.get(student.id) ?? []).some((tag) => matcher(tag, query)));
    return bannerOptions
      .filter((banner) => banner.server === form.server && new Date(banner.startTime).getTime() <= now && matchesQuery(banner))
      .sort((left, right) => right.startTime.localeCompare(left.startTime))
      .slice(0, 80);
  }, [bannerOptions, bannerQuery, form, matcher, studentAliases, studentNames]);

  const bannerTypeLabel = (banner: BannerPeriod, short = false): string =>
    banner.isFes ? t('game:fest') : banner.useChargeSystem ? (short ? t('planner:gacha.banner_planner.badge.charge_system') : t('gacha.bannerType.chargeSystem')) : t('gacha.bannerType.pointSystem');

  const studentDisplayName = (studentId: number): string => studentNames.get(studentId) ?? t('gacha.form.unknownStudent', { id: studentId });

  useEffect(() => {
    const loadRoster = async () => {
      const [studentsResponse, portraitsResponse] = await Promise.all([fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`)), fetch(cdn('/w/students_portrait.json'))]);
      if (!studentsResponse.ok || !portraitsResponse.ok) return;
      const rawStudentData: StudentData | Student[] = await studentsResponse.json();
      const studentRows = Array.isArray(rawStudentData) ? rawStudentData : Object.values(rawStudentData);
      const portraitData: StudentPortraitData = await portraitsResponse.json();
      const merged: Record<number, Student> = {};
      for (const student of studentRows) merged[student.Id] = { ...student, Portrait: portraitData[student.Id] };
      setStudents(merged);
      setPortraits(portraitData);
    };
    void loadRoster();
  }, [locale]);

  const addResultForStudent = (studentId: number) => {
    setForm((current) => {
      if (!current) return current;
      const isBannerStudent = pickupIds.has(studentId);
      const hasFirstAcquisitionInForm = current.results.some((result) => result.studentId === studentId && result.isFirstAcquisition);
      const hasFirstAcquisitionSaved = entries.some(
        (entry) => entry.server === current.server && entry.id !== editingId && entry.results.some((result) => result.studentId === studentId && result.isFirstAcquisition),
      );
      return {
        ...current,
        results: [
          ...current.results,
          {
            id: createId(),
            studentId,
            isFirstAcquisition: !hasFirstAcquisitionInForm && !hasFirstAcquisitionSaved,
            isPickup: isBannerStudent,
            countTowardGoal: isBannerStudent,
            source: 'normal',
          },
        ],
      };
    });
    setSelectedResultStudentId(null);
  };

  const portraitFor = (studentId: number): string | undefined => portraits[studentId] ?? students[studentId]?.Portrait;

  const updateResult = (id: string, patch: Partial<GachaHistoryResult>) => {
    setForm((current) =>
      current
        ? {
            ...current,
            results: current.results.map((result) => {
              if (result.id !== id) return result;
              const next = { ...result, ...patch };
              const eligible = pickupIds.has(next.studentId);
              if (!eligible) return { ...next, isPickup: false, countTowardGoal: false };
              if (next.isPickup) return { ...next, countTowardGoal: true };
              return next;
            }),
          }
        : current,
    );
  };

  const save = () => {
    if (!form || !activeBanner) return setMessage(t('gacha.form.errorNoBanner'));
    const pullCount = Number(form.pullCount);
    const initialCharge = Number(form.initialCharge);
    const initialChargeLimited = Number(form.initialChargeLimited);
    const isValidCharge = (value: number) => Number.isInteger(value) && value >= 0 && value <= 199;
    if (!Number.isInteger(pullCount) || pullCount < 1) return setMessage(t('gacha.form.errorPullCount'));
    if (activeBanner.useChargeSystem && !isValidCharge(initialCharge)) return setMessage(t('gacha.form.errorInitialCharge'));
    if (activeBanner.useChargeSystem && bannerHasBothPickupTypes && !isValidCharge(initialChargeLimited)) return setMessage(t('gacha.form.errorInitialCharge'));
    const guaranteed = form.results.filter((result) => result.source === 'half_pity' || result.source === 'hard_pity').length;
    if (guaranteed > pullCount) return setMessage(t('gacha.form.errorGuaranteed'));
    const firstAcquisitionIds = new Set<number>();
    for (const result of form.results) {
      if (result.isFirstAcquisition && firstAcquisitionIds.has(result.studentId)) return setMessage(t('gacha.form.errorDuplicateFirst'));
      if (result.isFirstAcquisition) firstAcquisitionIds.add(result.studentId);
      if (result.isPickup && !pickupIds.has(result.studentId)) return setMessage(t('gacha.form.errorPickupNotInBanner'));
      if (result.countTowardGoal && !pickupIds.has(result.studentId)) return setMessage(t('gacha.form.errorGoalNotInBanner'));
      if (result.isPickup && !result.countTowardGoal) return setMessage(t('gacha.form.errorPickupMustBeGoal'));
      if (activeBanner.useChargeSystem && result.source === 'point_exchange') return setMessage(t('gacha.form.errorNoPointExchange'));
      if (!activeBanner.useChargeSystem && (result.source === 'half_pity' || result.source === 'hard_pity')) return setMessage(t('gacha.form.errorNoPity'));
    }
    const entry: GachaHistoryEntry = {
      id: editingId ?? createId(),
      bannerId: form.bannerId,
      server: form.server,
      date: form.date,
      pullCount,
      initialCharge: activeBanner.useChargeSystem ? initialCharge : undefined,
      initialChargeLimited: activeBanner.useChargeSystem && bannerHasBothPickupTypes ? initialChargeLimited : undefined,
      results: form.results,
      notes: form.notes.trim() || undefined,
    };
    if (editingId) updateEntry(entry);
    else addEntry(entry);
    setForm(null);
    setEditingId(null);
    setMessage(null);
  };

  const deleteEditingEntry = () => {
    if (!editingId) return;
    deleteEntry(editingId);
    setForm(null);
    setEditingId(null);
    setMessage(null);
  };

  const processImportFile = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const normalized = Array.isArray(parsed) ? { entries: parsed } : parsed;
      const validation = ProfileDataSchemas.gachaHistory.safeParse(normalized);
      if (!validation.success) throw new Error('invalid format');
      replaceEntries(validation.data.entries);
      setMessage(t('raids.importSuccess', { count: validation.data.entries.length }));
    } catch {
      setMessage(t('gacha.importInvalid'));
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) await processImportFile(file);
    event.currentTarget.value = '';
  };

  const requestedSimulationCount = Number(simulationCountInput);
  const isSimulationCountValid = isValidGachaHistorySimulationCount(requestedSimulationCount);
  const showManualSimulationButton = isSimulationCountValid && requestedSimulationCount >= DEFAULT_SIMULATION_COUNT;
  const showStatsSimulationError = statsSimulationErrorKey === `${statsContextKey}:${requestedSimulationCount}`;

  return (
    <div className="space-y-5 px-3 py-4 sm:px-4 xl:px-0">
      <PageHeader title={title} description={description} />
      <div className="flex flex-wrap gap-2">
        <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importFile(event)} />
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={() => setIsDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragActive(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void processImportFile(file);
          }}
          className={`inline-flex items-center gap-2 rounded border px-3 py-2 text-sm font-semibold transition-colors ${
            isDragActive
              ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/20 dark:text-blue-300'
              : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800'
          }`}
          aria-label={t('raids.action.import')}
          title={t('raids.action.import')}
        >
          <HiOutlineArrowUpTray className="h-4 w-4" />
          <span className="hidden sm:inline">{t('raids.action.import')}</span>
        </button>
        <button
          type="button"
          onClick={() =>
            downloadFile(
              JSON.stringify({ entries, version: GACHA_HISTORY_EXPORT_VERSION, timestamp: new Date().toISOString() }, null, 2),
              `BA_GachaHistory_${new Date().toISOString().slice(0, 10)}.json`,
            )
          }
          className="inline-flex items-center gap-2 rounded border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          aria-label={t('raids.action.export')}
          title={t('raids.action.export')}
        >
          <HiOutlineArrowDownTray className="h-4 w-4" />
          <span className="hidden sm:inline">{t('raids.action.export')}</span>
        </button>
        <HistoryExternalEditPromptButton kind="gacha" />
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setEditingId(null);
            setForm(createForm(defaultHistoryServer));
          }}
          className="inline-flex items-center gap-2 rounded bg-ba-btn-blue px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-ba-btn-blue-dark"
        >
          <HiOutlinePlus className="h-4 w-4" />
          {t('raids.action.addRecord')}
        </button>
      </div>
      {message && !form && <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-300">{message}</div>}

      <div className="flex border-b border-neutral-200 dark:border-neutral-800">
        {(['records', 'stats', 'studentStats'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold ${tab === value ? 'border-neutral-950 text-neutral-950 dark:border-neutral-50 dark:text-neutral-50' : 'border-transparent text-neutral-500 dark:text-neutral-400'}`}
          >
            {value === 'records' ? t('raids.tabs.records') : value === 'stats' ? t('raids.tabs.stats') : t('gacha.tabs.studentStats')}
          </button>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('gacha.summary.heading')}</h2>
        <div className="grid grid-cols-2 divide-x divide-y divide-neutral-200 border-y border-neutral-200 text-sm dark:divide-neutral-800 dark:border-neutral-800 sm:grid-cols-4 sm:divide-y-0">
          <div className="min-w-0 px-3 py-2.5">
            <div className="text-neutral-500 dark:text-neutral-400">{t('gacha.summary.totalPulls')}</div>
            <div className="mt-1 font-semibold tabular-nums text-neutral-950 dark:text-neutral-50">
              {t('planner:gacha.result_view.chart.unit_count', { count: overview.pullCount.toLocaleString() })}
            </div>
          </div>
          <div className="min-w-0 px-3 py-2.5">
            <div className="text-neutral-500 dark:text-neutral-400">{t('gacha.summary.recordedBanners')}</div>
            <div className="mt-1 font-semibold tabular-nums text-neutral-950 dark:text-neutral-50">{overview.bannerCount}</div>
          </div>
          <div className="min-w-0 px-3 py-2.5">
            <div className="text-neutral-500 dark:text-neutral-400">{t('gacha.summary.threeStarAcquired')}</div>
            <div className="mt-1 font-semibold tabular-nums text-neutral-950 dark:text-neutral-50">
              {overview.threeStarCount}
              {t('planner:affectionTab.units.students')}{' '}
              <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">· {t('gacha.summary.newRecruits', { n: overview.newRecruitCount })}</span>
            </div>
          </div>
          <div className="min-w-0 px-3 py-2.5">
            <div className="text-neutral-500 dark:text-neutral-400">{t('gacha.summary.pickupAcquired')}</div>
            <div className="mt-1 font-semibold tabular-nums text-neutral-950 dark:text-neutral-50">
              {overview.pickupCount}
              {t('planner:affectionTab.units.students')}{' '}
              {overview.pickupRate !== null && (
                <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">· {t('gacha.summary.pickupShareOfThreeStar', { percent: overview.pickupRate.toFixed(1) })}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {tab === 'records' ? (
        <div className="space-y-3">
          {entries.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setRecordsSortAscending((current) => !current)}
                className="inline-flex items-center gap-1.5 rounded border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <HiOutlineArrowsUpDown className="h-3.5 w-3.5" />
                {recordsSortAscending ? t('raids.filters.sortByDateDesc') : t('raids.filters.sortByDateAsc')}
              </button>
            </div>
          )}
          {entries.length === 0 ? (
            <div className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">{t('gacha.records.empty')}</div>
          ) : (
            recordsListEntries.map((entry) => {
              const banner = bannersById.get(entry.bannerId);
              const goalStudentIds = new Set(entry.results.filter((result) => result.countTowardGoal).map((result) => result.studentId));
              return (
                <div key={entry.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 py-3 dark:border-neutral-800">
                  <div className="min-w-0">
                    <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {banner ? (
                        <>
                          {banner.startTime.slice(0, 10)} ·{' '}
                          {banner.pickupStudents.map((student, index) => (
                            <span key={student.id}>
                              {index > 0 && ' / '}
                              <span
                                className={
                                  goalStudentIds.has(student.id)
                                    ? 'bg-[linear-gradient(transparent_62%,rgba(37,99,235,0.3)_62%)] dark:bg-[linear-gradient(transparent_62%,rgba(96,165,250,0.35)_62%)]'
                                    : undefined
                                }
                              >
                                {studentNames.get(student.id) ?? student.name}
                              </span>
                            </span>
                          ))}
                        </>
                      ) : (
                        t('gacha.records.unknownBanner')
                      )}
                    </div>
                    <div className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                      <Trans
                        i18nKey="gacha.records.entryMeta"
                        ns="mypage"
                        values={{
                          date: entry.date,
                          pulls: entry.pullCount.toLocaleString(),
                          threeStar: entry.results.length,
                          goal: goalStudentIds.size,
                        }}
                        components={{ 1: <span className={entry.pullCount >= 200 ? 'font-semibold text-blue-600 dark:text-blue-400' : undefined} /> }}
                      />
                    </div>
                    {entry.results.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {entry.results.map((result) => (
                          <div key={result.id} className="w-9">
                            <StudentIcon
                              character={{ id: result.studentId, level: 0, star: 0, hasWeapon: false, weaponStar: 0, isAssist: false }}
                              student={students[result.studentId]}
                              portraitData={portraits}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {entry.notes && <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{entry.notes}</div>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMessage(null);
                        setEditingId(entry.id);
                        setForm(createForm(entry.server, entry));
                      }}
                      className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
                    >
                      {t('gacha.records.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEntry(entry.id)}
                      aria-label={t('raids.action.deleteRecord')}
                      className="rounded border border-red-200 p-1.5 text-red-600 dark:border-red-900/60 dark:text-red-300"
                    >
                      <HiOutlineTrash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : tab === 'stats' ? (
        <div className="space-y-7">
          <div className="border-b border-neutral-200 pb-4 dark:border-neutral-800">
            <div className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('gacha.stats.scopeHeading')}</div>
            <div className="inline-flex rounded border border-neutral-300 p-1 dark:border-neutral-700">
              <button
                type="button"
                onClick={() => setStatsScope('all')}
                className={`rounded px-3 py-2 text-sm font-semibold ${statsScope === 'all' ? 'bg-ba-btn-blue text-neutral-950' : 'text-neutral-600 dark:text-neutral-300'}`}
              >
                {t('gacha.stats.scopeAll')}
              </button>
              <button
                type="button"
                onClick={() => setStatsScope('banner')}
                className={`rounded px-3 py-2 text-sm font-semibold ${statsScope === 'banner' ? 'bg-ba-btn-blue text-neutral-950' : 'text-neutral-600 dark:text-neutral-300'}`}
              >
                {t('gacha.stats.scopeBanner')}
              </button>
            </div>
            {statsScope === 'banner' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {historyEntries.map((entry) => {
                  const banner = bannersById.get(entry.bannerId);
                  const icons = banner?.pickupStudents.slice(0, MAX_VISIBLE_BANNER_STUDENTS) ?? [];
                  const hiddenIconCount = Math.max(0, (banner?.pickupStudents.length ?? 0) - icons.length);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedStatsEntryId(entry.id)}
                      className={`inline-flex items-center gap-2 rounded border px-2 py-2 text-sm ${activeStatsEntryId === entry.id ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30' : 'border-neutral-300 dark:border-neutral-700'}`}
                    >
                      <span className="flex -space-x-1.5" aria-label={banner ? bannerLabel(banner, studentNames) : entry.date}>
                        {icons.map((student, index) => {
                          const portrait = portraitFor(student.id);
                          return portrait ? (
                            <div
                              key={student.id}
                              style={{ zIndex: icons.length - index }}
                              className="relative h-7 w-7 overflow-hidden rounded-full border border-white bg-neutral-100 dark:border-neutral-900 dark:bg-neutral-800"
                            >
                              <CombatStylePortrait studentId={student.id} portraits={portraits} alt="" />
                            </div>
                          ) : (
                            <span
                              key={student.id}
                              style={{ zIndex: icons.length - index }}
                              className="relative h-7 w-7 rounded-full border border-white bg-neutral-200 dark:border-neutral-900 dark:bg-neutral-700"
                            />
                          );
                        })}
                        {hiddenIconCount > 0 && (
                          <span className="relative z-0 flex h-7 min-w-7 items-center justify-center rounded-full border border-white bg-neutral-200 px-1 text-[10px] font-semibold text-neutral-700 dark:border-neutral-900 dark:bg-neutral-700 dark:text-neutral-200">
                            +{hiddenIconCount}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-neutral-600 dark:text-neutral-300">{entry.date}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DistributionChart
            title={t('gacha.stats.threeStarTitle')}
            subtitle={t('gacha.stats.threeStarSubtitle', { pulls: stats.eligiblePulls.toLocaleString() })}
            description={t('gacha.stats.threeStarDescription')}
            valueUnit={t('planner:affectionTab.units.students')}
            summary={stats.threeStar}
          />
          {statsScope === 'all' && <BannerLuckRangeChart title={`${t('gacha.stats.threeStarTitle')} · ${t('gacha.stats.byBanner')}`} points={threeStarLuckPoints} />}
          <div className="space-y-3">
            <DistributionChart
              title={t('gacha.stats.goalTicketsTitle')}
              subtitle={t('gacha.stats.goalTicketsSubtitle', { n: stats.goalCount })}
              valueUnit={t('planner:gacha.income.unit_sheets')}
              summary={stats.goals}
              lowerIsBetter
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <label htmlFor="gacha-history-simulation-count">{t('planner:cardShop.simulationCount')}</label>
              <input
                id="gacha-history-simulation-count"
                type="number"
                min={MIN_SIMULATION_COUNT}
                max={MAX_SIMULATION_COUNT}
                step={100}
                value={simulationCountInput}
                onChange={(event) => setSimulationCountInput(event.currentTarget.value)}
                onBlur={(event) => {
                  if (!isValidGachaHistorySimulationCount(Number(event.currentTarget.value))) setSimulationCountInput(String(simulationCount));
                }}
                className="w-24 rounded border border-neutral-300 bg-white px-2 py-1 text-right tabular-nums text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                aria-label={t('planner:cardShop.simulationCount')}
              />
              {showManualSimulationButton && (
                <button
                  type="button"
                  onClick={() => startStatsSimulation(requestedSimulationCount)}
                  disabled={isStatsCalculating}
                  className="rounded bg-ba-btn-blue px-3 py-1 font-semibold text-neutral-900 hover:bg-ba-btn-blue-dark disabled:cursor-wait disabled:opacity-60"
                >
                  {isStatsCalculating ? t('planner:gacha.result.panel.btn_running') : t('ui:run')}
                </button>
              )}
              {isStatsCalculating && (
                <span role="status" aria-live="polite" className="font-medium text-blue-600 dark:text-blue-400">
                  {t('planner:gacha.result.panel.btn_running')}
                </span>
              )}
              {showStatsSimulationError && <span className="font-medium text-red-600 dark:text-red-400">{t('planner:gacha.result.alert_error')}</span>}
            </div>
            {statsScope === 'all' && <BannerLuckRangeChart title={`${t('gacha.stats.goalTicketsTitle')} · ${t('gacha.stats.byBanner')}`} points={goalLuckPoints} />}
          </div>
          <DistributionChart
            title={t('gacha.stats.halfPityTitle')}
            subtitle={t('gacha.stats.halfPitySubtitle', { hit: stats.halfPityPickupCount, total: stats.halfPityCount })}
            description={t('gacha.stats.halfPityDescription')}
            valueUnit={t('common:times')}
            summary={stats.halfPity}
          />
          {statsScope === 'all' && <BannerLuckRangeChart title={`${t('gacha.stats.halfPityTitle')} · ${t('gacha.stats.byBanner')}`} points={halfPityLuckPoints} />}
        </div>
      ) : (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">{t('gacha.studentStats.mostRecruited')}</h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t('gacha.studentStats.recordedThreeStarNote')}</p>
          </div>
          <div className="inline-flex rounded border border-neutral-300 p-1 dark:border-neutral-700">
            {(['all', 'normal'] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                aria-pressed={studentRecruitmentScope === scope}
                onClick={() => setStudentRecruitmentScope(scope)}
                className={`rounded px-3 py-2 text-sm font-semibold ${studentRecruitmentScope === scope ? 'bg-ba-btn-blue text-neutral-950' : 'text-neutral-600 dark:text-neutral-300'}`}
              >
                {scope === 'all' ? t('gacha.studentStats.allAcquisitions') : t('gacha.source.normal')}
              </button>
            ))}
          </div>
          <div className="border-y border-neutral-200 dark:border-neutral-800">
            {topRecruitedStudentGroups.length === 0 ? (
              <p className="py-5 text-sm text-neutral-500 dark:text-neutral-400">{t('raids.stats.noData')}</p>
            ) : (
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800 sm:flex sm:divide-x sm:divide-y-0">
                {topRecruitedStudentGroups.map(({ studentIds, count }, index) => {
                  const names = studentIds.map((studentId) => studentNames.get(studentId) ?? t('gacha.form.unknownStudent', { id: studentId }));
                  return (
                    <div key={count} className="min-w-0 px-3 py-4 sm:flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">#{index + 1}</span>
                        <span className="text-base font-semibold tabular-nums text-neutral-950 dark:text-neutral-50">
                          {count.toLocaleString()}
                          {t('common:times')}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {studentIds.map((studentId) => {
                          const portrait = portraitFor(studentId);
                          const name = studentNames.get(studentId) ?? t('gacha.form.unknownStudent', { id: studentId });
                          return portrait ? (
                            <div key={studentId} title={name} className="h-10 w-10 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800">
                              <CombatStylePortrait studentId={studentId} portraits={portraits} alt={name} />
                            </div>
                          ) : (
                            <span
                              key={studentId}
                              title={name}
                              className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-xs font-semibold text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                            >
                              {name.slice(0, 1)}
                            </span>
                          );
                        })}
                      </div>
                      <p className="mt-2 truncate text-xs text-neutral-600 dark:text-neutral-300" title={names.join(', ')}>
                        {names.join(', ')}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {form && (
        <div className="fixed inset-0 z-200 overflow-x-hidden overflow-y-auto bg-neutral-950/50 p-3 sm:p-8">
          <div className="mx-auto w-full min-w-0 overflow-x-hidden rounded border border-neutral-300 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900 lg:w-5/6">
            <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
              <h2 className="min-w-0 truncate text-lg font-semibold text-neutral-950 dark:text-neutral-50" title={editingId ? t('gacha.form.editTitle') : t('gacha.form.addTitle')}>
                {editingId ? t('gacha.form.editTitle') : t('gacha.form.addTitle')}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setForm(null);
                  setEditingId(null);
                }}
                className="text-sm text-neutral-600 dark:text-neutral-300"
              >
                {t('ui:close')}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="mb-2 text-sm font-medium">{t('ui:server')}</div>
                <div className="inline-flex rounded border border-neutral-300 p-1 dark:border-neutral-700">
                  {(['GL', 'JP'] as const).map((server) => (
                    <button
                      key={server}
                      type="button"
                      onClick={() => {
                        setBannerQuery('');
                        setForm((current) => (current ? { ...current, server, bannerId: '', results: [] } : current));
                      }}
                      className={`rounded px-4 py-2 text-sm font-semibold ${form.server === server ? 'bg-ba-btn-blue text-neutral-950' : 'text-neutral-600 dark:text-neutral-300'}`}
                    >
                      {SERVER_LABEL[server]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2 border-y border-neutral-200 py-4 dark:border-neutral-800">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="gacha-banner-search" className="text-sm font-medium">
                    {t('gacha.form.bannerLabel')}
                  </label>
                  {activeBanner && (
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      {t('ui:selected')} · {bannerTypeLabel(activeBanner)}
                    </span>
                  )}
                </div>
                <input
                  id="gacha-banner-search"
                  value={bannerQuery}
                  onChange={(event) => setBannerQuery(event.currentTarget.value)}
                  placeholder={t('gacha.form.bannerSearchPlaceholder')}
                  className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                />
                <div className="mt-2 grid max-h-52 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
                  {visibleBanners.map((banner) => (
                    <button
                      key={banner.historyId}
                      type="button"
                      onClick={() => setForm((current) => (current ? { ...current, bannerId: banner.historyId, date: getBannerDate(banner, current.date), results: [] } : current))}
                      className={`min-w-0 overflow-hidden rounded border px-3 py-2 text-left text-sm ${form.bannerId === banner.historyId ? 'border-blue-600 bg-blue-50 text-neutral-950 dark:border-blue-400 dark:bg-blue-950/30 dark:text-neutral-50' : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex shrink-0 -space-x-1.5">
                          {banner.pickupStudents.slice(0, MAX_VISIBLE_BANNER_STUDENTS).map((student, index) => {
                            const portrait = portraitFor(student.id);
                            const zIndex = Math.min(banner.pickupStudents.length, MAX_VISIBLE_BANNER_STUDENTS) - index;
                            return portrait ? (
                              <div
                                key={student.id}
                                style={{ zIndex }}
                                className="relative h-8 w-8 overflow-hidden rounded-full border border-white bg-neutral-100 dark:border-neutral-900 dark:bg-neutral-800"
                              >
                                <CombatStylePortrait studentId={student.id} portraits={portraits} alt="" />
                              </div>
                            ) : (
                              <span key={student.id} style={{ zIndex }} className="relative h-8 w-8 rounded-full border border-white bg-neutral-200 dark:border-neutral-900 dark:bg-neutral-700" />
                            );
                          })}
                          {banner.pickupStudents.length > MAX_VISIBLE_BANNER_STUDENTS && (
                            <span className="relative z-0 flex h-8 min-w-8 items-center justify-center rounded-full border border-white bg-neutral-200 px-1 text-[10px] font-semibold text-neutral-700 dark:border-neutral-900 dark:bg-neutral-700 dark:text-neutral-200">
                              +{banner.pickupStudents.length - MAX_VISIBLE_BANNER_STUDENTS}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold" title={banner.pickupStudents.map((student) => studentNames.get(student.id) ?? student.name).join(' / ')}>
                            {banner.pickupStudents.map((student) => studentNames.get(student.id) ?? student.name).join(' / ')}
                          </span>
                          <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                            {banner.startTime.slice(0, 10)} · {bannerTypeLabel(banner, true)}
                          </span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="text-sm font-medium">
                {t('ui:date')}
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => {
                    const date = event.currentTarget.value;
                    setForm((current) => (current ? { ...current, date } : current));
                  }}
                  className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
                />
              </label>
              <label className="text-sm font-medium">
                {t('gacha.summary.totalPulls')}
                <input
                  inputMode="numeric"
                  value={form.pullCount}
                  onChange={(event) => {
                    const pullCount = event.currentTarget.value;
                    setForm((current) => (current ? { ...current, pullCount } : current));
                  }}
                  className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
                />
              </label>
              {activeBanner?.useChargeSystem && (
                <label className="text-sm font-medium">
                  {bannerHasBothPickupTypes ? t('gacha.form.initialChargeNormalLabel') : t('gacha.form.initialChargeLabel')}
                  <input
                    inputMode="numeric"
                    value={form.initialCharge}
                    onChange={(event) => {
                      const initialCharge = event.currentTarget.value;
                      setForm((current) => (current ? { ...current, initialCharge } : current));
                    }}
                    className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
                  />
                </label>
              )}
              {activeBanner?.useChargeSystem && bannerHasBothPickupTypes && (
                <label className="text-sm font-medium">
                  {t('gacha.form.initialChargeLimitedLabel')}
                  <input
                    inputMode="numeric"
                    value={form.initialChargeLimited}
                    onChange={(event) => {
                      const initialChargeLimited = event.currentTarget.value;
                      setForm((current) => (current ? { ...current, initialChargeLimited } : current));
                    }}
                    className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
                  />
                </label>
              )}
            </div>
            <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <div className="mb-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">{t('gacha.form.resultsHeading')}</h3>
                  {form.results.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setResultsReversed((current) => !current)}
                      className="inline-flex items-center gap-1.5 rounded border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      <HiOutlineArrowsUpDown className="h-3.5 w-3.5" />
                      {resultsReversed ? t('planner:equipment.sortOrderAsc') : t('planner:equipment.sortOrderDesc')}
                    </button>
                  )}
                </div>
                {activeBanner ? (
                  <StudentSearchDropdown
                    students={availableResultStudents}
                    selectedStudentId={selectedResultStudentId}
                    setSelectedStudentId={addResultForStudent}
                    hideLavel
                    priorityStudentIds={pickupIds}
                    mergeCombatStyleForms
                  />
                ) : (
                  <div className="rounded border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                    {t('gacha.form.selectBannerFirst')}
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {(resultsReversed ? [...form.results].reverse() : form.results).map((result) => {
                  const canBePickup = pickupIds.has(result.studentId);
                  const hasOtherFirstAcquisition = form.results.some((item) => item.id !== result.id && item.studentId === result.studentId && item.isFirstAcquisition);
                  return (
                    <div key={result.id} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-200 pb-3 dark:border-neutral-800">
                      <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
                        {portraitFor(result.studentId) ? (
                          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                            <CombatStylePortrait studentId={result.studentId} portraits={portraits} alt="" />
                          </div>
                        ) : (
                          <span className="h-8 w-8 shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                        )}
                        <span className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100" title={studentDisplayName(result.studentId)}>
                          {studentDisplayName(result.studentId)}
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={result.isFirstAcquisition}
                          disabled={!result.isFirstAcquisition && hasOtherFirstAcquisition}
                          onChange={(event) => updateResult(result.id, { isFirstAcquisition: event.currentTarget.checked })}
                        />
                        {t('planner:minigame_janken.label_first')}
                      </label>
                      <label className="inline-flex items-center gap-1 text-sm">
                        <input type="checkbox" checked={result.isPickup} disabled={!canBePickup} onChange={(event) => updateResult(result.id, { isPickup: event.currentTarget.checked })} />
                        {t('planner:gacha.result_view.filter.pickup')}
                      </label>
                      <label className="inline-flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={result.countTowardGoal || result.isPickup}
                          disabled={!canBePickup || result.isPickup || (goalIds.has(result.studentId) && !result.countTowardGoal)}
                          onChange={(event) => updateResult(result.id, { countTowardGoal: event.currentTarget.checked })}
                        />
                        {t('ui:target')}
                      </label>
                      <select
                        value={result.source}
                        onChange={(event) => updateResult(result.id, { source: event.currentTarget.value as GachaResultSource })}
                        className="rounded border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                      >
                        {(activeBanner?.useChargeSystem ? (['normal', 'half_pity', 'hard_pity'] as const) : (['normal', 'point_exchange'] as const)).map((source) => (
                          <option key={source} value={source}>
                            {t(SOURCE_LABEL_KEY[source])}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setForm((current) => (current ? { ...current, results: current.results.filter((item) => item.id !== result.id) } : current))}
                        aria-label={t('gacha.form.deleteResult')}
                        className="text-red-600 dark:text-red-300"
                      >
                        <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <label className="mt-5 block border-t border-neutral-200 pt-4 text-sm font-medium dark:border-neutral-800">
              {t('raids.notes')}
              <input
                value={form.notes}
                onChange={(event) => {
                  const notes = event.currentTarget.value;
                  setForm((current) => (current ? { ...current, notes } : current));
                }}
                className="mt-1 w-full rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={deleteEditingEntry}
                  className="min-h-11 rounded border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/20 sm:min-h-0"
                >
                  {t('raids.action.deleteRecord')}
                </button>
              )}
              {message && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-300">
                  {message}
                </p>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setForm(null);
                    setEditingId(null);
                  }}
                  className="min-h-11 rounded border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700 sm:min-h-0"
                >
                  {t('ui:cancel')}
                </button>
                <button type="button" onClick={save} className="min-h-11 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 sm:min-h-0">
                  {t('ui:save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
