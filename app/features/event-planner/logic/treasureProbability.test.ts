import { describe, expect, it, vi } from 'vitest';
import { getLoadedEvent, loadEventsFromCdn } from './loadEventsFromCdn';
import { OBS_EMPTY, OBS_FIXED, OBS_UNKNOWN, solveTreasure, solveTreasureExact, type TreasureProbInput, type TreasureTypeSpec } from './treasureProbability';

vi.hoisted(() => vi.stubEnv('VITE_USE_CDN', 'true'));

const eventData = getLoadedEvent(await loadEventsFromCdn([10847]), 10847);

// Scan-order-independent enumerator: product of per-type placement combinations, filtered by disjointness and observations.
function bruteForce({ width, height, types, obs }: TreasureProbInput) {
  const n = width * height;
  const placementsByType = types.map((t, k) => {
    const orients =
      t.w === t.h
        ? [[t.w, t.h]]
        : [
            [t.w, t.h],
            [t.h, t.w],
          ];
    const list: number[][] = [];
    for (const [pw, ph] of orients) {
      for (let y = 0; y + ph <= height; y++) {
        for (let x = 0; x + pw <= width; x++) {
          const cells: number[] = [];
          for (let dy = 0; dy < ph; dy++) for (let dx = 0; dx < pw; dx++) cells.push((y + dy) * width + x + dx);
          if (cells.every((c) => obs[c] === OBS_UNKNOWN || obs[c] === k)) list.push(cells);
        }
      }
    }
    return list;
  });

  let total = 0;
  const coverByType = types.map(() => Array<number>(n).fill(0));
  const owner = Array<number>(n).fill(-1);

  const chooseType = (k: number) => {
    if (k === types.length) {
      for (let c = 0; c < n; c++) if (obs[c] >= 0 && owner[c] !== obs[c]) return;
      total++;
      for (let c = 0; c < n; c++) if (owner[c] >= 0) coverByType[owner[c]][c]++;
      return;
    }
    const list = placementsByType[k];
    const pick = (start: number, left: number) => {
      if (left === 0) {
        chooseType(k + 1);
        return;
      }
      for (let p = start; p < list.length; p++) {
        const cells = list[p];
        if (cells.some((c) => owner[c] !== -1)) continue;
        for (const c of cells) owner[c] = k;
        pick(p + 1, left - 1);
        for (const c of cells) owner[c] = -1;
      }
    };
    pick(0, types[k].count);
  };
  chooseType(0);
  return { total, coverByType: coverByType.map((row) => row.map((v) => (total ? v / total : 0))) };
}

// Deterministic PRNG for reproducible random cases
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Random sequential placement (largest first) returning a row-major owner array, or null on failure
function sampleArrangement(width: number, height: number, types: TreasureTypeSpec[], rand: () => number): number[] | null {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const owner = Array<number>(width * height).fill(-1);
    const order = types.flatMap((t, k) => Array<number>(t.count).fill(k)).sort((a, b) => types[b].w * types[b].h - types[a].w * types[a].h);
    let ok = true;
    for (const k of order) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const rot = rand() < 0.5;
        const pw = rot ? types[k].h : types[k].w;
        const ph = rot ? types[k].w : types[k].h;
        if (pw > width || ph > height) continue;
        const x = Math.floor(rand() * (width - pw + 1));
        const y = Math.floor(rand() * (height - ph + 1));
        const cells: number[] = [];
        for (let dy = 0; dy < ph; dy++) for (let dx = 0; dx < pw; dx++) cells.push((y + dy) * width + x + dx);
        if (cells.some((c) => owner[c] !== -1)) continue;
        for (const c of cells) owner[c] = k;
        placed = true;
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) return owner;
  }
  return null;
}

function expectMatchesBrute(input: TreasureProbInput) {
  const brute = bruteForce(input);
  const dp = solveTreasureExact(input);
  expect(dp.total).toBe(brute.total);
  if (brute.total === 0) {
    expect(dp.status).toBe('contradiction');
    return;
  }
  expect(dp.status).toBe('ok');
  for (let k = 0; k < input.types.length; k++) {
    for (let c = 0; c < input.width * input.height; c++) {
      expect(Math.abs(dp.coverByType[k][c] - brute.coverByType[k][c])).toBeLessThan(1e-12);
    }
  }
}

describe('solveTreasureExact vs brute force', () => {
  it('matches fixed small cases', () => {
    const cases: TreasureProbInput[] = [
      { width: 3, height: 2, types: [{ w: 1, h: 2, count: 2 }], obs: Array(6).fill(OBS_UNKNOWN) },
      {
        width: 4,
        height: 3,
        types: [
          { w: 2, h: 2, count: 1 },
          { w: 1, h: 2, count: 2 },
        ],
        obs: Array(12).fill(OBS_UNKNOWN),
      },
      // Same shape, different types
      {
        width: 4,
        height: 3,
        types: [
          { w: 1, h: 2, count: 1 },
          { w: 2, h: 1, count: 2 },
        ],
        obs: Array(12).fill(OBS_UNKNOWN),
      },
      // Tall board (transposed scan)
      {
        width: 3,
        height: 5,
        types: [
          { w: 3, h: 1, count: 2 },
          { w: 1, h: 1, count: 2 },
        ],
        obs: Array(15).fill(OBS_UNKNOWN),
      },
      // Zero-count type
      {
        width: 4,
        height: 4,
        types: [
          { w: 2, h: 2, count: 0 },
          { w: 1, h: 3, count: 2 },
        ],
        obs: Array(16).fill(OBS_UNKNOWN),
      },
    ];
    for (const c of cases) expectMatchesBrute(c);
  });

  it('matches random boards with random observations', () => {
    const rand = mulberry32(42);
    const ri = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    for (let iter = 0; iter < 150; iter++) {
      const width = ri(3, 5);
      const height = ri(3, 4);
      const K = ri(1, 3);
      const types: TreasureTypeSpec[] = [];
      for (let k = 0; k < K; k++) types.push({ w: ri(1, 3), h: ri(1, 2), count: ri(0, 2) });
      const n = width * height;
      const obs = Array<number>(n).fill(OBS_UNKNOWN);
      const numObs = ri(0, 4);
      for (let o = 0; o < numObs; o++) {
        const roll = rand();
        obs[ri(0, n - 1)] = roll < 0.5 ? OBS_EMPTY : roll < 0.7 ? OBS_FIXED : ri(0, K - 1);
      }
      expectMatchesBrute({ width, height, types, obs });
    }
  });

  it('reports contradiction for impossible observations', () => {
    // A 2x2 hit pattern of a 1x3 type cannot be explained by one piece; two pieces need 6 cells.
    const obs = Array<number>(9).fill(OBS_UNKNOWN);
    obs[0] = 0;
    obs[1] = 0;
    obs[3] = 0;
    obs[4] = 0;
    const res = solveTreasureExact({ width: 3, height: 3, types: [{ w: 1, h: 3, count: 1 }], obs });
    expect(res.status).toBe('contradiction');
    expect(res.total).toBe(0);
  });
});

describe('solveTreasureExact on real rounds (event 10847)', () => {
  const treasure = eventData.treasure;
  if (!treasure) throw new Error('Event 10847 should have treasure data');
  const rounds = treasure.round.filter((r) => [1, 2, 3, 7].includes(r.TreasureRound));

  for (const r of rounds) {
    const types = r.RewardId.map((id, idx) => {
      const t = treasure.reward[String(id)];
      return { w: t.CellUnderImageWidth, h: t.CellUnderImageHeight, count: r.RewardAmount[idx] };
    });
    const [width, height] = r.TreasureRoundSize;
    const n = width * height;
    const area = types.reduce((a, t) => a + t.w * t.h * t.count, 0);

    it(`round ${r.TreasureRound}: empty board is fast and consistent`, () => {
      const t0 = performance.now();
      const res = solveTreasureExact({ width, height, types, obs: Array(n).fill(OBS_UNKNOWN) }, { timeBudgetMs: 5000 });
      const ms = performance.now() - t0;
      console.log(`R${r.TreasureRound}: ${ms.toFixed(1)}ms, peak states ${res.maxLayerStates}, N=${res.total.toExponential(3)}`);
      expect(res.status).toBe('ok');
      const sum = res.cover.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - area)).toBeLessThan(1e-6);
      expect(ms).toBeLessThan(1000);
    });

    it(`round ${r.TreasureRound}: half-dug board`, () => {
      const rand = mulberry32(r.TreasureRound);
      const truth = sampleArrangement(width, height, types, rand);
      if (!truth) throw new Error('failed to sample an arrangement');
      // Reveal every other cell of a real arrangement so the observation is always consistent
      const obs = Array<number>(n).fill(OBS_UNKNOWN);
      for (let c = 0; c < n; c += 2) obs[c] = truth[c] >= 0 ? truth[c] : OBS_EMPTY;
      const t0 = performance.now();
      const res = solveTreasureExact({ width, height, types, obs }, { timeBudgetMs: 5000 });
      const ms = performance.now() - t0;
      console.log(`R${r.TreasureRound} half: ${ms.toFixed(1)}ms, status ${res.status}, peak ${res.maxLayerStates}`);
      expect(res.status).toBe('ok');
      expect(ms).toBeLessThan(1000);
    });
  }

  it('falls back to the approximation when the state budget is exceeded', () => {
    const r = rounds[0];
    const types = r.RewardId.map((id, idx) => {
      const t = treasure.reward[String(id)];
      return { w: t.CellUnderImageWidth, h: t.CellUnderImageHeight, count: r.RewardAmount[idx] };
    });
    const res = solveTreasure({ width: 9, height: 5, types, obs: Array(45).fill(OBS_UNKNOWN) }, 'exact', { maxLayerStates: 10 });
    expect(res.status).toBe('aborted');
    expect(res.exact).toBe(false);
    expect(res.cover.some((v) => v > 0)).toBe(true);
  });
});
