import './debug-gacha.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseAndGroupBanners, getAllStudents, withPickupFallbackStudents, type SchaleStudent, type BannerPeriod } from '~/utils/gachaData';
import { rollSingle, createPoolForBanner, preprocessReleaseDates, calcPullRewards, calcDupeReward, type GachaPools } from '~/utils/gachaEngine';
import { FES_EXCLUSIONS_BY_PICKUP_ID } from '~/utils/gachaRules';
import type { Student } from '~/types/gacha';
import { cdn } from '~/utils/cdn';
import GachaWorker from '~/workers/gacha-engine.worker?worker';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';
import { PageHeader } from '~/components/common/PageHeader';
import { FaStar } from 'react-icons/fa';

interface ChunkStats {
  grade1: number;
  grade2: number;
  grade3: number;
  pickup: number;
  total: number;
  charge: number;
  studentCountsJson: string;
}

type WorkerOutMsg =
  { type: 'progress'; chunkStats: ChunkStats; completed: number; total: number } | { type: 'done'; chunkStats: ChunkStats; completed: number; total: number } | { type: 'error'; message: string };

interface PullResult {
  studentId: number;
  studentName: string;
  grade: number;
  isPickup: boolean;
  isNew: boolean;
  isFes: boolean;
}

interface StudentCount {
  name: string;
  count: number;
  isPickup: boolean;
  isFes: boolean;
}

interface CumulativeStats {
  grade1: number;
  grade2: number;
  grade3: number;
  pickup: number;
  total: number;
  studentCounts: Record<1 | 2 | 3, Record<number, StudentCount>>;
}

const EMPTY_STATS = (): CumulativeStats => ({
  grade1: 0,
  grade2: 0,
  grade3: 0,
  pickup: 0,
  total: 0,
  studentCounts: { 1: {}, 2: {}, 3: {} },
});

const CARD_STYLE: Record<1 | 2 | 3, { frame: string; panel: string; stars: string; glow: string }> = {
  1: {
    frame: 'border-[#d9e0e8] bg-[#edf2f6]',
    panel: 'bg-[#667180]',
    stars: 'text-[#f6e94b]',
    glow: '',
  },
  2: {
    frame: 'border-[#f8eb78] bg-[#fff6b2]',
    panel: 'bg-[#747164]',
    stars: 'text-[#fff39a]',
    glow: 'shadow-[0_0_clamp(2px,0.8vw,6px)_clamp(1px,0.15vw,1px)_#fff6b2,0_0_clamp(3px,1.2vw,10px)_clamp(1px,0.3vw,3px)_#f8eb78]',
  },
  3: {
    frame: 'border-[#f4c6ff] bg-[#f8e3ff]',
    panel: 'bg-[#9a7ca5]',
    stars: 'text-[#fff1a5]',
    glow: 'shadow-[0_0_clamp(3px,1vw,8px)_clamp(1px,0.2vw,2px)_#f8e3ff,0_0_clamp(4px,1.6vw,14px)_clamp(1px,0.4vw,4px)_#f4c6ff]',
  },
};

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms >= 1) return `${ms.toFixed(1)}ms`;
  if (ms >= 0.001) return `${(ms * 1000).toFixed(1)}µs`;
  return `${(ms * 1_000_000).toFixed(1)}ns`;
}

function pct(count: number, total: number, decimals = 4): string {
  return total > 0 ? ((count / total) * 100).toFixed(decimals) : '0.0000';
}

function EnvelopeCard({ pull, portraits, delayMs, fromBottom }: { pull: PullResult; portraits: Record<number, string>; delayMs: number; fromBottom: boolean }) {
  const portrait = portraits[pull.studentId];
  const style = CARD_STYLE[pull.grade as 1 | 2 | 3] ?? CARD_STYLE[1];
  return (
    <div className={`relative ${fromBottom ? 'animate-gacha-reveal-from-bottom' : 'animate-gacha-reveal'}`} style={{ animationDelay: `${delayMs}ms` }}>
      {pull.grade === 3 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 h-[240%] -translate-y-1/2 -skew-x-6 bg-linear-to-b from-transparent via-[#f4c6ff]/80 to-transparent blur-[3px] mix-blend-screen"
        />
      )}
      <div
        className={`relative w-full -skew-x-6 overflow-hidden rounded-[clamp(3px,0.4vw,6px)] border-[clamp(1px,0.14vw,2px)] p-[clamp(1px,0.28vw,4px)] ${style.frame} ${style.glow}`}
        title={pull.studentName}
      >
        <div className="aspect-[1.15] w-full skew-x-6 overflow-hidden rounded-[clamp(2px,0.25vw,4px)] bg-white/45">
          {portrait ? <img src={`data:image/webp;base64,${portrait}`} alt={pull.studentName} className="h-full w-full object-cover" /> : <div className="h-full w-full bg-neutral-200" />}
        </div>
        <div className={`flex aspect-[4.5] w-full items-center justify-center border-t border-white/40 ${style.panel}`}>
          <div className="flex skew-x-6 gap-0.5">
            {Array.from({ length: pull.grade }, (_, index) => (
              <FaStar key={index} aria-hidden className={`h-[clamp(10px,1.2vw,17px)] w-[clamp(10px,1.2vw,17px)] ${style.stars}`} />
            ))}
          </div>
        </div>
        {(pull.isNew || pull.isPickup) && (
          <div className="absolute left-0.5 top-0.5 flex flex-col items-start gap-1 -skew-x-6 font-black italic leading-[0.8] tracking-[-0.08em]">
            {pull.isNew && <span className="gacha-new-label inline-block skew-x-6 text-[clamp(10px,2.1vw,21px)]">New</span>}
            {pull.isPickup && <span className="gacha-pickup-label inline-block skew-x-6 text-[clamp(10px,2.1vw,21px)]">Pick Up!</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, count, total, expected }: { label: string; count: number; total: number; expected?: number }) {
  const actual = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="p-3 bg-white dark:bg-neutral-800 rounded text-center">
      <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">{label}</div>
      <div className="text-xl font-bold">{count.toLocaleString()}</div>
      <div className="text-xs text-neutral-400">{actual.toFixed(4)}%</div>
      {expected !== undefined && <div className={`text-xs mt-0.5 font-medium ${Math.abs(actual - expected) > 1 ? 'text-red-400' : 'text-neutral-400'}`}>Exp. {expected.toFixed(2)}%</div>}
    </div>
  );
}

type GradeTab = 1 | 2 | 3;

function StudentCountTable({
  counts,
  total,
  grade,
  countLabel,
  rateLabel,
  elephLabel,
  eligmaLabel,
}: {
  counts: Record<number, StudentCount>;
  total: number;
  grade: 1 | 2 | 3;
  countLabel: string;
  rateLabel: string;
  elephLabel: string;
  eligmaLabel: string;
}) {
  const sorted = Object.entries(counts)
    .map(([id, v]) => ({ id: Number(id), ...v }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length === 0) return <p className="text-xs text-neutral-400 py-2">No data</p>;

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-neutral-500 border-b dark:border-neutral-700">
          <th className="py-1 text-left font-medium">Student</th>
          <th className="py-1 text-right font-medium">{countLabel}</th>
          <th className="py-1 text-right font-medium">{rateLabel}</th>
          <th className="py-1 text-right font-medium">{elephLabel}</th>
          <th className="py-1 text-right font-medium">{eligmaLabel}</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(({ id, name, count, isPickup, isFes }) => {
          const items = calcPullRewards(count, grade, isPickup, id);
          const eleph = items[`Item_${id}`] ?? 0;
          const eligma = items['Item_23'] ?? 0;
          return (
            <tr key={id} className="border-b dark:border-neutral-700 last:border-0">
              <td className="py-1 flex items-center gap-1">
                {isPickup && <span className="text-yellow-400 text-xs">★</span>}
                {isFes && !isPickup && <span className="text-pink-400 text-xs">F</span>}
                {name}
              </td>
              <td className="py-1 text-right tabular-nums">{count}</td>
              <td className="py-1 text-right tabular-nums">{pct(count, total)}%</td>
              <td className="py-1 text-right tabular-nums">{eleph > 0 ? eleph.toLocaleString() : '-'}</td>
              <td className="py-1 text-right tabular-nums">{eligma > 0 ? eligma.toLocaleString() : '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function DebugGachaPage() {
  const [banners, setBanners] = useState<BannerPeriod[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [selectedBannerId, setSelectedBannerId] = useState<string>('');
  const [batches, setBatches] = useState<PullResult[][]>([]);
  const [stats, setStats] = useState<CumulativeStats>(EMPTY_STATS());
  const [loading, setLoading] = useState(false);
  const [portraits, setPortraits] = useState<Record<number, string>>({});
  const [activeTab, setActiveTab] = useState<GradeTab>(3);
  const [selectedPickupId, setSelectedPickupId] = useState<number | null>(null);
  const [customCount, setCustomCount] = useState<string>('100000000');
  // "Recruit charge" pity counter (new system) — only meaningful when chargeSystemOverride is on; reset alongside stats.
  const [charge, setCharge] = useState(0);
  // Whether to simulate the "recruit charge" pity system. Defaults to the banner's useChargeSystem flag (gachaData.ts cutoff logic), but can be flipped manually.
  const [chargeSystemOverride, setChargeSystemOverride] = useState(false);
  // When on, every single pull is forced to start at charge=99 (instead of continuing from the real counter),
  // so it always lands exactly on the 100-count soft pity checkpoint — for bulk-testing that probability split.
  const [checkpointTestMode, setCheckpointTestMode] = useState(false);
  const [useWasm, setUseWasm] = useState(false);
  const [showBatches, setShowBatches] = useState(false);
  const [showCumulativeStats, setShowCumulativeStats] = useState(true);
  const [latestResultKey, setLatestResultKey] = useState(0);
  const [wasmProgress, setWasmProgress] = useState<{ completed: number; total: number } | null>(null);
  const [timingResult, setTimingResult] = useState<{ totalPulls: number; elapsedMs: number } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'gacha' });
  const { t: tPlanner } = useTranslation('planner');
  const { t: t_ui } = useTranslation('ui');
  const { t: t_g } = useTranslation('game');
  const locale = i18n.language as Locale;

  useEffect(() => {
    const loadData = async () => {
      try {
        const studentRes = await fetch(cdn(`/schaledb.com/${locale}.students.min.json`));
        const rawStudentData: SchaleStudent[] | Record<string, SchaleStudent> = await studentRes.json();

        const studentMap: Record<string, SchaleStudent> = {};
        if (Array.isArray(rawStudentData)) {
          rawStudentData.forEach((s) => {
            studentMap[s.Id] = s;
          });
        } else {
          Object.assign(studentMap, rawStudentData);
        }

        const parsedBanners = parseAndGroupBanners('KR', studentMap);
        const students = withPickupFallbackStudents(getAllStudents(studentMap), parsedBanners) as unknown as Student[];

        const portraitRes = await fetch(cdn('/w/students_portrait.json'));
        const portraitData: Record<number, string> = await portraitRes.json();

        setBanners(parsedBanners);
        setAllStudents(students);
        setPortraits(portraitData);
        if (parsedBanners.length > 0) {
          const lastBanner = parsedBanners[parsedBanners.length - 1];
          setSelectedBannerId(lastBanner.id);
          setSelectedPickupId(lastBanner.pickupStudents[0]?.id ?? null);
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };
    void loadData();
  }, []);

  // Re-sync the charge-system checkbox to the newly selected banner's real cutoff each time it changes;
  // the user can still flip it manually afterward.
  useEffect(() => {
    const banner = banners.find((b) => b.id === selectedBannerId);
    setChargeSystemOverride(banner?.useChargeSystem ?? false);
  }, [selectedBannerId, banners]);

  const pools: GachaPools | null = useMemo(() => {
    const banner = banners.find((b) => b.id === selectedBannerId);
    if (!banner || allStudents.length === 0) return null;

    const bannersMap = banners.reduce<Record<string, BannerPeriod>>((acc, b) => {
      acc[b.id] = b;
      return acc;
    }, {});
    const releaseDateMap = preprocessReleaseDates(bannersMap as unknown as Parameters<typeof preprocessReleaseDates>[0]);
    return createPoolForBanner(allStudents, banner.startTime, releaseDateMap);
  }, [selectedBannerId, banners, allStudents]);

  const studentMap = useMemo(() => new Map(allStudents.map((s) => [s.id, s])), [allStudents]);

  const rewardTotals = useMemo(() => {
    const eligmaByGrade: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
    const elephByGrade: Record<1 | 2 | 3, { id: number; name: string; eleph: number }[]> = { 1: [], 2: [], 3: [] };
    for (const g of [1, 2, 3] as const) {
      for (const [idStr, { name, count, isPickup }] of Object.entries(stats.studentCounts[g])) {
        const id = Number(idStr);
        const items = calcPullRewards(count, g, isPickup, id);
        eligmaByGrade[g] += items['Item_23'] ?? 0;
        const eleph = items[`Item_${id}`] ?? 0;
        if (eleph > 0) elephByGrade[g].push({ id, name, eleph });
      }
      elephByGrade[g].sort((a, b) => b.eleph - a.eleph);
    }
    return {
      eligmaByGrade,
      totalEligma: eligmaByGrade[1] + eligmaByGrade[2] + eligmaByGrade[3],
      elephByGrade,
    };
  }, [stats.studentCounts]);

  const CHUNK_SIZE = 100000;

  const doPulls = (count: number) => {
    const banner = banners.find((b) => b.id === selectedBannerId);
    if (!banner || !pools || selectedPickupId === null) return;
    setLoading(true);
    const startTime = performance.now();

    const bannerPickupIds = banner.pickupStudents.map((s) => s.id);
    const useCharge = chargeSystemOverride;
    let currentCharge = charge;
    let remaining = count;
    let currentStats: CumulativeStats = {
      ...stats,
      studentCounts: {
        1: { ...stats.studentCounts[1] },
        2: { ...stats.studentCounts[2] },
        3: { ...stats.studentCounts[3] },
      },
    };

    const runChunk = () => {
      const chunkCount = Math.min(remaining, CHUNK_SIZE);
      remaining -= chunkCount;

      const newBatches: PullResult[][] = [];
      // Fresh references each chunk so the rewardTotals useMemo actually detects the change.
      const newStats: CumulativeStats = {
        ...currentStats,
        studentCounts: {
          1: { ...currentStats.studentCounts[1] },
          2: { ...currentStats.studentCounts[2] },
          3: { ...currentStats.studentCounts[3] },
        },
      };

      for (let b = 0; b < chunkCount / 10; b++) {
        const batch: PullResult[] = [];
        for (let i = 0; i < 10; i++) {
          let forced: 'pickup' | 'random3star' | undefined;
          if (useCharge) {
            if (checkpointTestMode) currentCharge = 99;
            currentCharge += 1;
            forced = currentCharge === 200 ? 'pickup' : currentCharge === 100 ? (Math.random() < 0.5 ? 'pickup' : 'random3star') : undefined;
          }
          const result = rollSingle(i === 9, banner.isFes, selectedPickupId, pools, bannerPickupIds, forced);
          if (useCharge && result.isPickup) currentCharge = 0;
          const student = studentMap.get(result.id);
          const isNew = !Object.values(currentStats.studentCounts).some((counts) => counts[result.id] !== undefined);
          const pull: PullResult = {
            studentId: result.id,
            studentName: student?.name ?? `Unknown (${result.id})`,
            grade: result.grade,
            isPickup: result.isPickup,
            isNew,
            isFes: student?.isFes ?? false,
          };
          batch.push(pull);

          const gradeKey = result.grade as GradeTab;
          const existing = newStats.studentCounts[gradeKey][result.id];
          if (existing) {
            existing.count++;
          } else {
            newStats.studentCounts[gradeKey][result.id] = {
              name: pull.studentName,
              count: 1,
              isPickup: result.isPickup,
              isFes: pull.isFes,
            };
          }

          if (result.grade === 3) newStats.grade3++;
          else if (result.grade === 2) newStats.grade2++;
          else newStats.grade1++;
          if (result.isPickup) newStats.pickup++;
          newStats.total++;
        }
        newBatches.push(batch);
      }

      currentStats = newStats;
      if (newBatches.length > 0) {
        setBatches([newBatches[newBatches.length - 1]]);
        setShowBatches(true);
        setLatestResultKey((key) => key + 1);
      }
      setStats({ ...newStats });
      if (useCharge) setCharge(currentCharge);

      if (remaining > 0) {
        setTimeout(runChunk, 0);
      } else {
        setTimingResult({ totalPulls: count, elapsedMs: performance.now() - startTime });
        setLoading(false);
      }
    };

    setTimeout(runChunk, 0);
  };

  const handleReset = () => {
    setBatches([]);
    setStats(EMPTY_STATS());
    setWasmProgress(null);
    setTimingResult(null);
    setCharge(0);
  };

  const mergeWasmChunk = (prev: CumulativeStats, chunk: ChunkStats, pickupId: number): CumulativeStats => {
    const counts = JSON.parse(chunk.studentCountsJson) as Record<string, number>;
    const sc: CumulativeStats['studentCounts'] = {
      1: { ...prev.studentCounts[1] },
      2: { ...prev.studentCounts[2] },
      3: { ...prev.studentCounts[3] },
    };
    for (const [idStr, count] of Object.entries(counts)) {
      const id = Number(idStr);
      const student = studentMap.get(id);
      // `studentMap` is typed as `~/types/gacha`'s Student (with `rarity`), but at runtime it holds
      // `~/utils/gachaData.ts`'s Student (with `starGrade`) via the `as unknown as Student[]` cast above.
      const grade = ((student as { starGrade?: number } | undefined)?.starGrade ?? 1) as 1 | 2 | 3;
      if (grade !== 1 && grade !== 2 && grade !== 3) continue;
      const existing = sc[grade][id];
      if (existing) {
        existing.count += count;
      } else {
        sc[grade][id] = {
          name: student?.name ?? `Unknown(${id})`,
          count,
          isPickup: id === pickupId,
          isFes: student?.isFes ?? false,
        };
      }
    }
    return {
      grade1: prev.grade1 + chunk.grade1,
      grade2: prev.grade2 + chunk.grade2,
      grade3: prev.grade3 + chunk.grade3,
      pickup: prev.pickup + chunk.pickup,
      total: prev.total + chunk.total,
      studentCounts: sc,
    };
  };

  const doWasmPulls = (count: number) => {
    const banner = banners.find((b) => b.id === selectedBannerId);
    if (!banner || !pools || selectedPickupId === null) return;
    setLoading(true);
    setWasmProgress({ completed: 0, total: count });
    const wasmStartTime = performance.now();

    const bannerPickupIds = banner.pickupStudents.map((s) => s.id);
    const fesExcludedIds = [...new Set(bannerPickupIds.flatMap((id) => FES_EXCLUSIONS_BY_PICKUP_ID[id] ?? []))];

    if (!workerRef.current) {
      workerRef.current = new GachaWorker();
    }
    const worker = workerRef.current;
    let latestStats: CumulativeStats = {
      ...stats,
      studentCounts: {
        1: { ...stats.studentCounts[1] },
        2: { ...stats.studentCounts[2] },
        3: { ...stats.studentCounts[3] },
      },
    };
    const currentPickupId = selectedPickupId;

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as WorkerOutMsg;
      if (msg.type === 'error') {
        console.error('Wasm worker error:', msg.message);
        setLoading(false);
        setWasmProgress(null);
        return;
      }
      latestStats = mergeWasmChunk(latestStats, msg.chunkStats, currentPickupId);
      setStats({ ...latestStats });
      if (chargeSystemOverride) setCharge(msg.chunkStats.charge);
      setWasmProgress({ completed: msg.completed, total: msg.total });
      if (msg.type === 'done') {
        setTimingResult({ totalPulls: count, elapsedMs: performance.now() - wasmStartTime });
        setLoading(false);
        setWasmProgress(null);
      }
    };

    worker.postMessage({
      grade3Ids: pools.grade3.map((s) => s.id),
      grade2Ids: pools.grade2.map((s) => s.id),
      grade1Ids: pools.grade1.map((s) => s.id),
      fesIds: pools.fes.map((s) => s.id),
      fesExcludedIds,
      bannerPickupIds,
      pickupId: selectedPickupId,
      isFes: banner.isFes,
      useChargeSystem: chargeSystemOverride,
      initialCharge: charge,
      checkpointTestMode,
      totalPullCount: count,
    });
  };

  const selectedBanner = banners.find((b) => b.id === selectedBannerId);
  const expectedR3 = selectedBanner?.isFes ? 6 : 3;
  const expectedPickup = 0.7;

  if (banners.length === 0) {
    return <div className="p-3 text-sm text-neutral-500 sm:p-4 lg:p-6">Loading...</div>;
  }

  return (
    <div className="space-y-4 p-3 sm:p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Gacha Engine Debug" eyebrow="Debug" />

      <div>
        <label className="block text-sm font-medium mb-1">Select Banner</label>
        <select
          value={selectedBannerId}
          onChange={(e) => {
            const newBanner = banners.find((b) => b.id === e.target.value);
            setSelectedBannerId(e.target.value);
            setSelectedPickupId(newBanner?.pickupStudents[0]?.id ?? null);
            handleReset();
          }}
          className="w-full px-3 py-2 border rounded-lg dark:bg-neutral-800 dark:border-neutral-600"
        >
          {banners.map((banner) => (
            <option key={banner.id} value={banner.id}>
              {banner.pickupStudents.map((s) => s.name).join('/')} ({banner.startTime.split(' ')[0]}){banner.isFes ? ' [FES]' : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedBanner && selectedBanner.pickupStudents.length > 1 && (
        <div>
          <label className="block text-sm font-medium mb-1">Select Pickup Student</label>
          <div className="flex gap-2 flex-wrap">
            {selectedBanner.pickupStudents.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedPickupId(s.id);
                  handleReset();
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  selectedPickupId === s.id ? 'border-ba-btn-blue bg-ba-btn-blue text-neutral-900 hover:bg-ba-btn-blue-dark' : 'border-neutral-300 bg-ba-btn-gray text-neutral-900 hover:brightness-95'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500">{t('result.panel.engine_label')}:</span>
        <button
          onClick={() => setUseWasm(false)}
          className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${
            !useWasm ? 'border-ba-btn-blue bg-ba-btn-blue text-neutral-900 hover:bg-ba-btn-blue-dark' : 'border-neutral-300 bg-ba-btn-gray text-neutral-900 hover:brightness-95'
          }`}
        >
          JS
        </button>
        <button
          onClick={() => setUseWasm(true)}
          className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${
            useWasm ? 'border-ba-btn-yellow bg-ba-btn-yellow text-neutral-900 hover:brightness-95' : 'border-neutral-300 bg-ba-btn-gray text-neutral-900 hover:brightness-95'
          }`}
        >
          Rust⚡
        </button>
        {useWasm && <span className="text-xs text-neutral-400">Bulk simulation — envelope grid disabled</span>}
      </div>

      <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300 cursor-pointer">
        <input type="checkbox" checked={chargeSystemOverride} onChange={(e) => setChargeSystemOverride(e.target.checked)} className="rounded" />
        Use recruit charge system (new pity){selectedBanner && <span className="text-neutral-400"> — banner default: {selectedBanner.useChargeSystem ? 'on' : 'off'}</span>}
      </label>

      {chargeSystemOverride && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
          Charge: <span className="font-bold text-neutral-800 dark:text-neutral-100">{charge}</span> / 200
        </div>
      )}

      {chargeSystemOverride && (
        <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300 cursor-pointer">
          <input type="checkbox" checked={checkpointTestMode} onChange={(e) => setCheckpointTestMode(e.target.checked)} className="rounded" />
          Force 100-charge checkpoint (every pull starts at charge=99, so it always hits the checkpoint)
        </label>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => (useWasm ? doWasmPulls : doPulls)(10)}
          disabled={loading || !pools}
          className="rounded-lg border border-ba-btn-blue bg-ba-btn-blue px-4 py-2 font-medium text-neutral-900 hover:bg-ba-btn-blue-dark disabled:opacity-50"
        >
          ×10
        </button>
        <button
          onClick={() => (useWasm ? doWasmPulls : doPulls)(100)}
          disabled={loading || !pools}
          className="rounded-lg border border-ba-btn-blue bg-ba-btn-blue px-4 py-2 font-medium text-neutral-900 hover:bg-ba-btn-blue-dark disabled:opacity-50"
        >
          +100
        </button>
        <button
          onClick={() => (useWasm ? doWasmPulls : doPulls)(200)}
          disabled={loading || !pools}
          className="rounded-lg border border-ba-btn-blue bg-ba-btn-blue px-4 py-2 font-medium text-neutral-900 hover:bg-ba-btn-blue-dark disabled:opacity-50"
        >
          +200
        </button>
        <button
          onClick={() => (useWasm ? doWasmPulls : doPulls)(1000)}
          disabled={loading || !pools}
          className="rounded-lg border border-ba-btn-blue bg-ba-btn-blue px-4 py-2 font-medium text-neutral-900 hover:bg-ba-btn-blue-dark disabled:opacity-50"
        >
          +1K
        </button>
        <button
          onClick={() => (useWasm ? doWasmPulls : doPulls)(10000)}
          disabled={loading || !pools}
          className="rounded-lg border border-ba-btn-blue bg-ba-btn-blue px-4 py-2 font-medium text-neutral-900 hover:bg-ba-btn-blue-dark disabled:opacity-50"
        >
          +10K
        </button>
        <button
          onClick={() => (useWasm ? doWasmPulls : doPulls)(1000000)}
          disabled={loading || !pools}
          className="rounded-lg border border-ba-btn-blue bg-ba-btn-blue px-4 py-2 font-medium text-neutral-900 hover:bg-ba-btn-blue-dark disabled:opacity-50"
        >
          +1M
        </button>
        {stats.total > 0 && (
          <button onClick={handleReset} className="ml-auto rounded-lg border border-neutral-300 bg-ba-btn-gray px-4 py-2 font-medium text-neutral-900 hover:brightness-95">
            {t_ui('reset')}
          </button>
        )}
      </div>

      <div className="flex gap-2 items-center">
        <input
          type="number"
          min={10}
          step={10}
          value={customCount}
          onChange={(e) => setCustomCount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const n = Math.max(10, Math.round(Number(customCount) / 10) * 10);
              if (useWasm) doWasmPulls(n);
              else doPulls(n);
            }
          }}
          className="w-36 px-3 py-2 border rounded-lg text-sm dark:bg-neutral-800 dark:border-neutral-600 tabular-nums"
          placeholder={t_ui('count')}
        />
        <button
          onClick={() => {
            const n = Math.max(10, Math.round(Number(customCount) / 10) * 10);
            if (useWasm) doWasmPulls(n);
            else doPulls(n);
          }}
          disabled={loading || !pools || !customCount}
          className="rounded-lg border border-ba-btn-blue bg-ba-btn-blue px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-ba-btn-blue-dark disabled:opacity-50"
        >
          Pull
        </button>
        {loading && !wasmProgress && <span className="text-xs text-neutral-400 animate-pulse">Simulating...</span>}
      </div>

      {wasmProgress && (
        <div className="space-y-1">
          <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 overflow-hidden">
            <div className="bg-blue-600 h-2 rounded-full transition-all duration-200" style={{ width: `${(wasmProgress.completed / wasmProgress.total) * 100}%` }} />
          </div>
          <p className="text-xs text-neutral-400 tabular-nums">
            {wasmProgress.completed.toLocaleString()} / {wasmProgress.total.toLocaleString()} complete &nbsp;({((wasmProgress.completed / wasmProgress.total) * 100).toFixed(1)}%)
          </p>
        </div>
      )}

      {timingResult && (
        <div className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
          {tPlanner('ui.total')} <span className="font-semibold text-neutral-700 dark:text-neutral-200">{timingResult.totalPulls.toLocaleString()}</span> pulls &nbsp;·&nbsp;
          <span className="font-semibold text-neutral-700 dark:text-neutral-200">{formatDuration(timingResult.elapsedMs)}</span> &nbsp;·&nbsp;average per 10 pulls{' '}
          <span className="font-semibold text-neutral-700 dark:text-neutral-200">{formatDuration(timingResult.elapsedMs / (timingResult.totalPulls / 10))}</span>
        </div>
      )}

      {stats.total > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-500">Cumulative Stats ({stats.total} pulls)</span>
            <button
              type="button"
              onClick={() => setShowCumulativeStats((visible) => !visible)}
              className="rounded border border-neutral-300 bg-ba-btn-gray px-2 py-1 text-xs font-medium text-neutral-900 hover:brightness-95"
            >
              {showCumulativeStats ? t_ui('close') : t_ui('open')}
            </button>
          </div>
          {showCumulativeStats && (
            <>
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="★1" count={stats.grade1} total={stats.total} expected={78.5} />
                <StatCard label="★2" count={stats.grade2} total={stats.total} expected={18.5} />
                <StatCard label="★3" count={stats.grade3} total={stats.total} expected={expectedR3} />
                <StatCard label={t('result_view.filter.pickup')} count={stats.pickup} total={stats.total} expected={expectedPickup} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="text-xs border dark:border-neutral-700 rounded-lg max-h-64 overflow-y-auto">
                  <div className="py-1.5 px-3 font-medium bg-neutral-50 dark:bg-neutral-800 border-b dark:border-neutral-700 sticky top-0">{t_g('eleph')} (per student)</div>
                  {([3, 2, 1] as const).map((g) => {
                    const students = rewardTotals.elephByGrade[g];
                    if (students.length === 0) return null;
                    return (
                      <div key={g} className="border-t dark:border-neutral-700 first:border-0">
                        <div className="py-1 px-3 text-neutral-500 bg-neutral-50/50 dark:bg-neutral-800/50">★{g}</div>
                        {students.map(({ id, name, eleph }) => (
                          <div key={id} className="flex justify-between py-0.5 px-3 border-t dark:border-neutral-700/50">
                            <span>{name}</span>
                            <span className="tabular-nums">{eleph.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs border dark:border-neutral-700 rounded-lg overflow-hidden">
                  <div className="py-1.5 px-3 font-medium bg-neutral-50 dark:bg-neutral-800 border-b dark:border-neutral-700">{t_g('eligma')} (shared)</div>
                  {([3, 2, 1] as const).map((g) => (
                    <div key={g} className="flex justify-between py-1.5 px-3 border-t dark:border-neutral-700">
                      <span>★{g}</span>
                      <span className="tabular-nums">{rewardTotals.eligmaByGrade[g].toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-1.5 px-3 border-t dark:border-neutral-700 font-semibold bg-neutral-50 dark:bg-neutral-800">
                    <span>{tPlanner('ui.total')}</span>
                    <span className="tabular-nums">{rewardTotals.totalEligma.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex gap-1 mb-2">
                  {([3, 2, 1] as GradeTab[]).map((g) => (
                    <button
                      key={g}
                      onClick={() => setActiveTab(g)}
                      className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                        activeTab === g
                          ? g === 3
                            ? 'border border-ba-btn-blue bg-ba-btn-blue text-neutral-900'
                            : g === 2
                              ? 'border border-ba-btn-yellow bg-ba-btn-yellow text-neutral-900'
                              : 'border border-neutral-300 bg-ba-btn-gray text-neutral-900'
                          : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                      }`}
                    >
                      ★{g} ({Object.keys(stats.studentCounts[g]).length} types)
                    </button>
                  ))}
                </div>
                <div className="border dark:border-neutral-700 rounded-lg p-3 max-h-64 overflow-y-auto">
                  <StudentCountTable
                    counts={stats.studentCounts[activeTab]}
                    total={stats.total}
                    grade={activeTab}
                    countLabel={t_ui('count')}
                    rateLabel={t('result_view.student_stats.rate_obtain')}
                    elephLabel={t_g('eleph')}
                    eligmaLabel={t_g('eligma')}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {!useWasm && batches.length > 0 && (
        <button onClick={() => setShowBatches((v) => !v)} className="rounded border border-neutral-300 bg-ba-btn-gray px-2 py-1 text-xs font-medium text-neutral-900 hover:brightness-95">
          {showBatches ? t_ui('close') : t_ui('open')} latest pull result
        </button>
      )}

      {!useWasm &&
        showBatches &&
        batches.length > 0 &&
        (() => {
          const latestBatch = batches.at(-1);
          if (!latestBatch) return null;
          return (
            <div>
              {(() => {
                const batch = latestBatch;
                const elephByStudent: Record<number, { name: string; amount: number }> = {};
                let totalEligma = 0;
                for (const pull of batch) {
                  const items = calcDupeReward(pull.grade as 1 | 2 | 3, pull.isPickup, pull.studentId);
                  const eleph = items[`Item_${pull.studentId}`] ?? 0;
                  const eligma = items['Item_23'] ?? 0;
                  if (eleph > 0) {
                    const prev = elephByStudent[pull.studentId];
                    elephByStudent[pull.studentId] = { name: pull.studentName, amount: (prev?.amount ?? 0) + eleph };
                  }
                  totalEligma += eligma;
                }
                const elephEntries = Object.entries(elephByStudent);
                const hasRewards = elephEntries.length > 0 || totalEligma > 0;
                return (
                  <div className="space-y-1">
                    <div
                      key={latestResultKey}
                      className="grid perspective-[900px] grid-cols-[repeat(5,var(--gacha-card-w))] justify-center gap-[calc(var(--gacha-card-w)/4.5)] overflow-hidden rounded-lg bg-linear-to-b from-[#b5e1f4] via-[#cae6f8] to-[#d8e1ed] p-5 px-9"
                      style={{ '--gacha-card-w': 'min(9rem, calc((100% - 2rem) / 5))' } as React.CSSProperties}
                    >
                      {batch.map((pull, pIdx) => (
                        <EnvelopeCard key={pIdx} pull={pull} portraits={portraits} delayMs={pIdx * 35} fromBottom={pIdx >= 5} />
                      ))}
                    </div>
                    {hasRewards && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 justify-end text-xs text-neutral-400 tabular-nums">
                        {elephEntries.map(([id, { name, amount }]) => (
                          <span key={id}>
                            {name} {t_g('eleph')} +{amount}
                          </span>
                        ))}
                        {totalEligma > 0 && (
                          <span>
                            {t_g('eligma')} +{totalEligma}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })()}
    </div>
  );
}
