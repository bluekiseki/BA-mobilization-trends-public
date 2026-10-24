import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Tooltip from 'rc-tooltip';
import 'rc-tooltip/assets/bootstrap.css';
import { HiOutlineQuestionMarkCircle } from 'react-icons/hi2';
import type { TreasureReward, TreasureRound } from '~/types/plannerData';
import { OBS_EMPTY, OBS_FIXED, OBS_UNKNOWN, type TreasureProbResult } from '~/features/event-planner/logic/treasureProbability';
import type { TreasureProbWorkerIn, TreasureProbWorkerOut } from '~/workers/treasure-prob.worker';
import TreasureProbWorker from '~/workers/treasure-prob.worker?worker';
import { ShapeGlyph } from './TreasureShape';
import { treasureColor } from './colors';

type Mode = 'exact' | 'approx';

/** A treasure the user found and placed on the board */
interface PlacedTreasure {
  type: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ProbabilityCalculatorProps {
  rounds: TreasureRound[];
  rewards: Record<string, TreasureReward>;
  loopRound: number;
}

const BRUSH_EMPTY = -1;

// Long-standing community calculators; shown as references in random order
const EXTERNAL_CALCULATORS = [
  { url: 'https://schale-inventory-management.terry-u16.net/', host: 'schale-inventory-management.terry-u16.net', langs: 'English, 한국어, 日本語, 简体中文' },
  { url: 'https://blueaka.alphaorderly.com/inventory/predict', host: 'blueaka.alphaorderly.com', langs: '한국어' },
];

export const ProbabilityCalculator = ({ rounds, rewards, loopRound }: ProbabilityCalculatorProps) => {
  const { t } = useTranslation('planner', { keyPrefix: 'treasure' });
  const { t: t_ui } = useTranslation('ui');

  const [roundNum, setRoundNum] = useState(rounds[0]?.TreasureRound ?? 1);
  const round = rounds.find((r) => r.TreasureRound === roundNum) ?? rounds[0];
  const [width, height] = round.TreasureRoundSize;
  const n = width * height;

  const [emptyCells, setEmptyCells] = useState<Set<number>>(() => new Set());
  const [placed, setPlaced] = useState<PlacedTreasure[]>([]);
  const [brush, setBrush] = useState<number>(BRUSH_EMPTY);
  const [rotated, setRotated] = useState(false);
  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('exact');
  const [result, setResult] = useState<TreasureProbResult | null>(null);
  const [computing, setComputing] = useState(false);
  // Shuffled on the client only, so SSR markup stays deterministic
  const [externalLinks, setExternalLinks] = useState<typeof EXTERNAL_CALCULATORS>([]);

  useEffect(() => {
    const shuffled = [...EXTERNAL_CALCULATORS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setExternalLinks(shuffled);
  }, []);

  const types = useMemo(
    () =>
      round.RewardId.map((id, idx) => {
        const r = rewards[id];
        return { w: r.CellUnderImageWidth, h: r.CellUnderImageHeight, count: round.RewardAmount[idx] };
      }),
    [round, rewards],
  );

  // Placed treasure index per cell (-1 = none)
  const owner = useMemo(() => {
    const arr = Array<number>(n).fill(-1);
    placed.forEach((p, i) => {
      for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) arr[(p.y + dy) * width + p.x + dx] = i;
    });
    return arr;
  }, [placed, n, width]);

  const remaining = useMemo(() => types.map((tp, k) => tp.count - placed.filter((p) => p.type === k).length), [types, placed]);

  // Solver input: placed treasures occupy their cells and are removed from the counts
  const solverInput = useMemo(() => {
    const obs = Array<number>(n).fill(OBS_UNKNOWN);
    for (const c of emptyCells) obs[c] = OBS_EMPTY;
    for (let c = 0; c < n; c++) if (owner[c] >= 0) obs[c] = OBS_FIXED;
    return { width, height, types: types.map((tp, k) => ({ ...tp, count: remaining[k] })), obs };
  }, [n, emptyCells, owner, width, height, types, remaining]);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  // Empty-board results per round/mode, so switching rounds is instant
  const emptyCacheRef = useRef(new Map<string, TreasureProbResult>());

  useEffect(() => {
    const worker = new TreasureProbWorker();
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const isEmptyBoard = emptyCells.size === 0 && placed.length === 0;
    const cacheKey = `${roundNum}-${mode}`;
    const cached = isEmptyBoard ? emptyCacheRef.current.get(cacheKey) : undefined;
    if (cached) {
      setResult(cached);
      setComputing(false);
      return;
    }

    const id = ++requestIdRef.current;
    setComputing(true);
    const onMessage = (e: MessageEvent<TreasureProbWorkerOut>) => {
      // Ignore stale responses from earlier requests
      if (e.data.id !== requestIdRef.current) return;
      if (isEmptyBoard) emptyCacheRef.current.set(cacheKey, e.data.result);
      setResult(e.data.result);
      setComputing(false);
    };
    worker.addEventListener('message', onMessage);
    const msg: TreasureProbWorkerIn = { id, input: solverInput, mode };
    worker.postMessage(msg);
    return () => worker.removeEventListener('message', onMessage);
  }, [solverInput, mode, roundNum, emptyCells, placed]);

  const resetBoard = () => {
    setEmptyCells(new Set());
    setPlaced([]);
    setBrush(BRUSH_EMPTY);
    setRotated(false);
  };

  const selectRound = (r: number) => {
    if (!rounds.some((x) => x.TreasureRound === r)) return;
    setRoundNum(r);
    resetBoard();
    setResult(null);
  };

  // Footprint for the current treasure brush anchored at cell c, shifted inside the board
  const footprintAt = (c: number): PlacedTreasure | null => {
    if (brush < 0) return null;
    const tp = types[brush];
    const w = rotated ? tp.h : tp.w;
    const h = rotated ? tp.w : tp.h;
    if (w > width || h > height) return null;
    const x = Math.min(c % width, width - w);
    const y = Math.min(Math.floor(c / width), height - h);
    return { type: brush, x, y, w, h };
  };

  const fitsFootprint = (f: PlacedTreasure) => {
    for (let dy = 0; dy < f.h; dy++) for (let dx = 0; dx < f.w; dx++) if (owner[(f.y + dy) * width + f.x + dx] >= 0) return false;
    return true;
  };

  const handleCellClick = (c: number) => {
    // Clicking a placed treasure removes it
    if (owner[c] >= 0) {
      const idx = owner[c];
      setPlaced((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    if (brush === BRUSH_EMPTY) {
      setEmptyCells((prev) => {
        const next = new Set(prev);
        if (next.has(c)) next.delete(c);
        else next.add(c);
        return next;
      });
      return;
    }
    const f = footprintAt(c);
    if (!f || remaining[brush] <= 0 || !fitsFootprint(f)) return;
    setPlaced((prev) => [...prev, f]);
    // A placed treasure overrides cells previously marked empty
    setEmptyCells((prev) => {
      const next = new Set(prev);
      for (let dy = 0; dy < f.h; dy++) for (let dx = 0; dx < f.w; dx++) next.delete((f.y + dy) * width + f.x + dx);
      return next;
    });
    // Go back to the empty brush once this type is fully placed
    if (remaining[brush] - 1 <= 0) setBrush(BRUSH_EMPTY);
  };

  const preview = hoverCell !== null && owner[hoverCell] < 0 ? footprintAt(hoverCell) : null;
  const previewValid = preview !== null && brush >= 0 && remaining[brush] > 0 && fitsFootprint(preview);

  // Single recommended cell: highest probability, first in reading order on ties
  const bestCell = useMemo(() => {
    if (!result || result.status === 'contradiction') return -1;
    let best = -1;
    let bestP = 0;
    for (let c = 0; c < n; c++) {
      if (emptyCells.has(c) || owner[c] >= 0) continue;
      const p = result.cover[c] ?? 0;
      if (p > bestP + 1e-9) {
        bestP = p;
        best = c;
      }
    }
    return best;
  }, [result, emptyCells, owner, n]);

  // Shade relative to the current min/max so small differences stay visible
  const [minP, maxP] = useMemo(() => {
    if (!result || result.status === 'contradiction') return [0, 1];
    let lo = Infinity;
    let hi = -Infinity;
    for (let c = 0; c < n; c++) {
      if (emptyCells.has(c) || owner[c] >= 0) continue;
      const p = result.cover[c] ?? 0;
      if (p < lo) lo = p;
      if (p > hi) hi = p;
    }
    return lo === Infinity ? [0, 1] : [lo, hi];
  }, [result, emptyCells, owner, n]);

  const hasInput = emptyCells.size > 0 || placed.length > 0;
  const isApprox = result !== null && !result.exact;

  const formatPct = (p: number) => {
    const pct = p * 100;
    if (pct >= 99.95 && pct < 100 - 1e-9) return '>99.9';
    if (pct > 1e-9 && pct < 0.05) return '<0.1';
    if (pct >= 100 - 1e-9) return '100';
    if (pct <= 1e-9) return '0';
    return pct.toFixed(1);
  };

  const cellTitle = (c: number) => {
    if (!result) return undefined;
    return types.map((tp, k) => `${tp.w}×${tp.h}: ${formatPct(result.coverByType[k]?.[c] ?? 0)}%`).join('\n');
  };

  const chipClass = (active: boolean) =>
    `px-2.5 py-1 text-xs rounded border tabular-nums disabled:opacity-40 ${active ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/40 dark:text-blue-300' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'}`;

  const overlayGrid: React.CSSProperties = {
    gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${height}, minmax(0, 1fr))`,
  };

  return (
    <div className="space-y-3">
      {/* Round + mode */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {rounds.map((r) => (
            <button key={r.TreasureRound} onClick={() => selectRound(r.TreasureRound)} className={chipClass(r.TreasureRound === roundNum)}>
              {r.TreasureRound === loopRound ? `${r.TreasureRound}+` : r.TreasureRound}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {(['exact', 'approx'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={chipClass(mode === m)}>
              {t(m)}
            </button>
          ))}
          <Tooltip placement="topRight" overlay={<span className="text-xs">{t('dpAssumption')}</span>} mouseEnterDelay={0.05}>
            <span className="cursor-help p-1 text-neutral-400 dark:text-neutral-500" aria-label={t('dpAssumption')}>
              <HiOutlineQuestionMarkCircle className="text-base" />
            </span>
          </Tooltip>
        </div>
      </div>

      {/* Brush palette */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button onClick={() => setBrush(BRUSH_EMPTY)} className={`${chipClass(brush === BRUSH_EMPTY)} flex h-8 items-center gap-1.5`}>
          <span className="inline-block h-3 w-3 rounded-[1px] bg-neutral-400 dark:bg-neutral-500" />
          {t('brushEmpty')}
        </button>
        {types.map((tp, k) => (
          <div key={k} className={`flex items-center gap-1 ${remaining[k] <= 0 ? 'opacity-40' : ''}`}>
            {(tp.w === tp.h ? [false] : [false, true]).map((rot) => (
              <button
                key={String(rot)}
                onClick={() => {
                  setBrush(k);
                  setRotated(rot);
                }}
                disabled={remaining[k] <= 0}
                className={`${chipClass(brush === k && rotated === rot)} flex h-8 min-w-8 items-center justify-center`}
                title={`${rot ? tp.h : tp.w}×${rot ? tp.w : tp.h}`}
              >
                <ShapeGlyph w={rot ? tp.h : tp.w} h={rot ? tp.w : tp.h} typeIndex={k} cell={5} />
              </button>
            ))}
            <span className="text-xs font-semibold tabular-nums text-neutral-700 dark:text-neutral-300">×{remaining[k]}</span>
          </div>
        ))}
        <button onClick={resetBoard} disabled={!hasInput} className="ml-auto px-2.5 py-1 text-xs rounded bg-ba-btn-gray text-neutral-800 disabled:opacity-40">
          {t_ui('reset')}
        </button>
      </div>

      {/* Board */}
      <div className="relative select-none" onMouseLeave={() => setHoverCell(null)}>
        <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}>
          {Array.from({ length: n }).map((_, c) => {
            const p = result?.cover[c] ?? 0;
            const isBest = c === bestCell;
            let style: React.CSSProperties | undefined;
            let content: React.ReactNode = null;
            let cls = 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100';
            if (owner[c] >= 0) {
              cls = '';
              style = { backgroundColor: treasureColor(placed[owner[c]].type) };
            } else if (emptyCells.has(c)) {
              cls = 'bg-neutral-300 dark:bg-neutral-600';
            } else if (result && result.status !== 'contradiction') {
              const rel = maxP - minP > 1e-9 ? (p - minP) / (maxP - minP) : 0.5;
              style = { backgroundColor: `rgba(37, 99, 235, ${(0.05 + rel * 0.85).toFixed(3)})` };
              if (rel > 0.55) cls = 'text-white';
              if (isBest) cls += ' ring-[3px] ring-inset ring-neutral-900 dark:ring-white';
              content = formatPct(p);
            }
            return (
              <button
                key={c}
                onClick={() => handleCellClick(c)}
                onMouseEnter={() => setHoverCell(c)}
                title={owner[c] < 0 && !emptyCells.has(c) ? cellTitle(c) : undefined}
                className={`aspect-square rounded-sm text-[10px] sm:text-xs font-semibold tabular-nums flex items-center justify-center transition-colors ${cls} ${computing ? 'opacity-80' : ''}`}
                style={style}
              >
                {content}
              </button>
            );
          })}
        </div>

        {/* Outlines of placed treasures and the placement preview */}
        <div className="pointer-events-none absolute inset-0 grid gap-0.5" style={overlayGrid}>
          {placed.map((p, i) => (
            <div key={i} className="rounded-sm border-2 border-white/90 dark:border-neutral-900/90" style={{ gridColumn: `${p.x + 1} / span ${p.w}`, gridRow: `${p.y + 1} / span ${p.h}` }} />
          ))}
          {preview && (
            <div
              className={`rounded-sm border-[3px] ${previewValid ? '' : 'border-red-500 bg-red-500/20'}`}
              style={{
                gridColumn: `${preview.x + 1} / span ${preview.w}`,
                gridRow: `${preview.y + 1} / span ${preview.h}`,
                ...(previewValid ? { borderColor: treasureColor(preview.type), backgroundColor: `${treasureColor(preview.type)}66` } : {}),
              }}
            />
          )}
        </div>
      </div>

      {/* Status */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
        {result?.status === 'contradiction' ? (
          <span className="text-red-600 dark:text-red-400">{t('contradiction')}</span>
        ) : (
          <>
            {result?.exact && (
              <span>
                {t('possibleLayouts')}: <span className="font-semibold text-neutral-700 dark:text-neutral-200">{Math.round(result.total).toLocaleString()}</span>
              </span>
            )}
            {result?.status === 'aborted' && <span className="text-amber-600 dark:text-amber-400">{t('approxFallback')}</span>}
            {isApprox && result?.status !== 'aborted' && <span>≈</span>}
          </>
        )}
        {bestCell >= 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-blue-600 ring-2 ring-inset ring-neutral-900 dark:ring-white" />
            {t('nextBest')}
          </span>
        )}
      </div>

      {externalLinks.length > 0 && (
        <div className="border-t border-neutral-200 pt-3 text-xs dark:border-neutral-700">
          <div className="font-semibold text-neutral-700 dark:text-neutral-300">{t('otherCalculators')}</div>
          <p className="mb-1.5 text-neutral-500 dark:text-neutral-400">{t('otherCalculatorsNote')}</p>
          <ul className="space-y-1">
            {externalLinks.map((l) => (
              <li key={l.url} className="flex flex-wrap items-baseline gap-x-2">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
                  {l.host}
                </a>
                <span className="text-neutral-400 dark:text-neutral-500">{l.langs}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
