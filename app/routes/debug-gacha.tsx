import { useEffect, useMemo, useRef, useState } from 'react';
import { parseAndGroupBanners, getAllStudents, type SchaleStudent, type BannerPeriod } from '~/utils/gachaData';
import { rollSingle, createPoolForBanner, preprocessReleaseDates, type GachaPools } from '~/utils/gachaEngine';
import { FES_EXCLUSIONS_BY_PICKUP_ID } from '~/utils/gachaRules';
import type { Student } from '~/types/gacha';
import { cdn } from '~/utils/cdn';
import GachaWorker from '~/workers/gacha-engine.worker?worker';
import { useTranslation } from 'react-i18next';
import type { Locale } from '~/utils/i18n/config';

interface ChunkStats {
  grade1: number;
  grade2: number;
  grade3: number;
  pickup: number;
  total: number;
  studentCountsJson: string;
}

type WorkerOutMsg =
  | { type: 'progress'; chunkStats: ChunkStats; completed: number; total: number }
  | { type: 'done'; chunkStats: ChunkStats; completed: number; total: number }
  | { type: 'error'; message: string };

interface PullResult {
  studentId: number;
  studentName: string;
  grade: number;
  isPickup: boolean;
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

const GRADE_STYLE: Record<number, string> = {
  1: 'bg-blue-400',
  2: 'bg-yellow-400',
  3: 'bg-gradient-to-br from-blue-500 via-blue-300 to-blue-400',
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

function EnvelopeCard({ pull, portraits }: { pull: PullResult; portraits: Record<number, string> }) {
  const portrait = portraits[pull.studentId];
  return (
    <div className={`relative flex flex-col items-center justify-center rounded-lg p-2 aspect-square ${GRADE_STYLE[pull.grade] ?? 'bg-neutral-400'}`}>
      {portrait && <img src={`data:image/webp;base64,${portrait}`} alt={pull.studentName} className="w-10 h-10 rounded-full object-cover" />}
      <span className="text-white text-xs font-bold mt-1 text-center leading-tight truncate w-full">{pull.studentName}</span>
      {pull.isPickup && <span className="absolute top-1 right-1 text-yellow-200 text-xs font-bold">★</span>}
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

function StudentCountTable({ counts, total }: { counts: Record<number, StudentCount>; total: number }) {
  const sorted = Object.entries(counts)
    .map(([id, v]) => ({ id: Number(id), ...v }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length === 0) return <p className="text-xs text-neutral-400 py-2">No data</p>;

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-neutral-500 border-b dark:border-neutral-700">
          <th className="py-1 text-left font-medium">Student</th>
          <th className="py-1 text-right font-medium">Count</th>
          <th className="py-1 text-right font-medium">Rate</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(({ id, name, count, isPickup, isFes }) => (
          <tr key={id} className="border-b dark:border-neutral-700 last:border-0">
            <td className="py-1 flex items-center gap-1">
              {isPickup && <span className="text-yellow-400 text-xs">★</span>}
              {isFes && !isPickup && <span className="text-pink-400 text-xs">F</span>}
              {name}
            </td>
            <td className="py-1 text-right">{count}</td>
            <td className="py-1 text-right tabular-nums">{pct(count, total)}%</td>
          </tr>
        ))}
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
  const [useWasm, setUseWasm] = useState(false);
  const [wasmProgress, setWasmProgress] = useState<{ completed: number; total: number } | null>(null);
  const [timingResult, setTimingResult] = useState<{ totalPulls: number; elapsedMs: number } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const { i18n } = useTranslation('planner', { keyPrefix: 'gacha' });
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
        const students = getAllStudents(studentMap) as unknown as Student[];

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

  const CHUNK_SIZE = 100000;

  const doPulls = (count: number) => {
    const banner = banners.find((b) => b.id === selectedBannerId);
    if (!banner || !pools || selectedPickupId === null) return;
    setLoading(true);
    const startTime = performance.now();

    const bannerPickupIds = banner.pickupStudents.map((s) => s.id);
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
      const newStats = currentStats;

      for (let b = 0; b < chunkCount / 10; b++) {
        const batch: PullResult[] = [];
        for (let i = 0; i < 10; i++) {
          const result = rollSingle(i === 9, banner.isFes, selectedPickupId, pools, bannerPickupIds);
          const student = studentMap.get(result.id);
          const pull: PullResult = {
            studentId: result.id,
            studentName: student?.name ?? `Unknown (${result.id})`,
            grade: result.grade,
            isPickup: result.isPickup,
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
      setBatches((prev) => [...prev, ...newBatches]);
      setStats({ ...newStats });

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
      const grade = (student?.rarity ?? 1) as 1 | 2 | 3;
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
      totalPullCount: count,
    });
  };

  const selectedBanner = banners.find((b) => b.id === selectedBannerId);
  const expectedR3 = selectedBanner?.isFes ? 6 : 3;
  const expectedPickup = 0.7;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">Gacha Engine Debug</h1>

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
                  selectedPickupId === s.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 hover:border-blue-400'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500">Engine:</span>
        <button
          onClick={() => setUseWasm(false)}
          className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${
            !useWasm ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300'
          }`}
        >
          JS
        </button>
        <button
          onClick={() => setUseWasm(true)}
          className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${
            useWasm ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300'
          }`}
        >
          Rust⚡
        </button>
        {useWasm && <span className="text-xs text-neutral-400">Bulk simulation — envelope grid disabled</span>}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => (useWasm ? doWasmPulls : doPulls)(10)}
          disabled={loading || !pools}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 font-medium"
        >
          ×10
        </button>
        <button
          onClick={() => (useWasm ? doWasmPulls : doPulls)(200)}
          disabled={loading || !pools}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 font-medium"
        >
          +200
        </button>
        <button
          onClick={() => (useWasm ? doWasmPulls : doPulls)(1000)}
          disabled={loading || !pools}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 font-medium"
        >
          +1K
        </button>
        <button
          onClick={() => (useWasm ? doWasmPulls : doPulls)(10000)}
          disabled={loading || !pools}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 font-medium"
        >
          +10K
        </button>
        <button
          onClick={() => (useWasm ? doWasmPulls : doPulls)(1000000)}
          disabled={loading || !pools}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 font-medium"
        >
          +1M
        </button>
        {batches.length > 0 && (
          <button onClick={handleReset} className="px-4 py-2 bg-neutral-500 text-white rounded-lg hover:bg-neutral-600 dark:bg-neutral-600 dark:hover:bg-neutral-700 font-medium ml-auto">
            Reset
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
          placeholder="Count"
        />
        <button
          onClick={() => {
            const n = Math.max(10, Math.round(Number(customCount) / 10) * 10);
            if (useWasm) doWasmPulls(n);
            else doPulls(n);
          }}
          disabled={loading || !pools || !customCount}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 font-medium text-sm"
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
          Total <span className="font-semibold text-neutral-700 dark:text-neutral-200">{timingResult.totalPulls.toLocaleString()}</span> pulls &nbsp;·&nbsp;
          <span className="font-semibold text-neutral-700 dark:text-neutral-200">{formatDuration(timingResult.elapsedMs)}</span> &nbsp;·&nbsp;per 10 pulls{' '}
          <span className="font-semibold text-neutral-700 dark:text-neutral-200">{formatDuration(timingResult.elapsedMs / (timingResult.totalPulls / 10))}</span>
        </div>
      )}

      {stats.total > 0 && (
        <div className="space-y-4">
          <div className="text-sm font-medium text-neutral-500">Cumulative Stats ({stats.total} pulls)</div>
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="★1" count={stats.grade1} total={stats.total} expected={78.5} />
            <StatCard label="★2" count={stats.grade2} total={stats.total} expected={18.5} />
            <StatCard label="★3" count={stats.grade3} total={stats.total} expected={expectedR3} />
            <StatCard label="Pickup" count={stats.pickup} total={stats.total} expected={expectedPickup} />
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
                        ? 'bg-blue-600 text-white'
                        : g === 2
                          ? 'bg-yellow-500 text-white'
                          : 'bg-blue-600 text-white'
                      : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  ★{g} ({Object.keys(stats.studentCounts[g]).length} types)
                </button>
              ))}
            </div>
            <div className="border dark:border-neutral-700 rounded-lg p-3 max-h-64 overflow-y-auto">
              <StudentCountTable counts={stats.studentCounts[activeTab]} total={stats.total} />
            </div>
          </div>
        </div>
      )}

      {!useWasm &&
        batches.length > 0 &&
        (() => {
          const MAX_VISIBLE = 50;
          const hidden = batches.length - MAX_VISIBLE;
          const visible = batches.slice(-MAX_VISIBLE).reverse();
          return (
            <div className="space-y-8">
              {hidden > 0 && (
                <p className="text-xs text-center text-neutral-400">
                  {hidden * 10} pulls hidden (total {batches.length * 10} pulls)
                </p>
              )}
              {visible.map((batch, bIdx) => (
                <div key={bIdx} className="grid grid-cols-5 gap-2">
                  {batch.map((pull, pIdx) => (
                    <EnvelopeCard key={pIdx} pull={pull} portraits={portraits} />
                  ))}
                </div>
              ))}
            </div>
          );
        })()}
    </div>
  );
}
