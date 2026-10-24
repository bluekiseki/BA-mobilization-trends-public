// Exact expected favor EXP when you always craft the best of the 5 nodes offered at a tier.
//
// Each craft shows 5 nodes = a weighted successive sample without replacement from the tier pool
// (gift + non-gift nodes, weighted by `Property`). Using the exponential-clock representation
// (sample = the 5 smallest Exp(w_i) clocks) and integration by parts:
//
//   P(set F entirely absent) = W_F · ∫₀^∞ P(#(pool\F) below t ≥ 5) · e^{-W_F t} dt      (W_F = Σ_{f∈F} w_f)
//
// which needs only a Poisson-binomial CDF — no per-node leave-one-out. With gift nodes ranked by
// perCraft desc (g_1 ≥ g_2 ≥ …) and Q_j = P({g_1..g_j} absent), Q_0 = 1:
//
//   E[best] = Σ_m perCraft(g_m) · (Q_{m-1} − Q_m)
//
// Verified against SchaleDB's precomputed ChanceGlobal (== Q-based single-node inclusion) to 4dp
// and against Monte-Carlo simulation to <0.1%.

const SAMPLE = 5;

interface GiftNode {
  weight: number;
  perCraft: number;
}

export function tierBestExpectedExp(giftNodes: GiftNode[], otherWeights: number[]): number {
  const sorted = [...giftNodes].sort((a, b) => b.perCraft - a.perCraft);
  const k = sorted.length;
  if (k === 0) return 0;

  const minW = Math.min(...sorted.map((g) => g.weight), ...otherWeights);
  const tMax = Math.min(3000, 32 / minW);
  const STEPS = 900;
  const OW = otherWeights;
  const OM = OW.length;

  // P(a + b < 5) for two truncated Poisson-binomial distributions = P(#below < 5)
  const cdfBelow5 = (x: number[], y: number[]): number => {
    let s = 0;
    for (let a = 0; a < SAMPLE; a++) {
      if (!x[a]) continue;
      for (let b = 0; a + b < SAMPLE; b++) s += x[a] * y[b];
    }
    return s;
  };

  const foldIn = (dist: number[], e: number): number[] => {
    const c = [0, 0, 0, 0, 0];
    for (let d = 0; d < SAMPLE; d++) {
      c[d] += dist[d] * e;
      if (d + 1 < SAMPLE) c[d + 1] += dist[d] * (1 - e);
    }
    return c;
  };

  const Q = new Array<number>(k + 1).fill(0);
  Q[0] = 1;
  const prevF = new Array<number>(k + 1).fill(0);
  let prevT = 0;

  for (let step = 1; step <= STEPS; step++) {
    const t = tMax * (step / STEPS) ** 2;

    // Poisson-binomial dist of the non-gift ("other") nodes below t
    let owPB = [1, 0, 0, 0, 0];
    for (let i = 0; i < OM; i++) owPB = foldIn(owPB, Math.exp(-OW[i] * t));

    // sweep j = k..1, accumulating the ranked gift nodes into `giftPB` from the back
    let giftPB = [1, 0, 0, 0, 0];
    let wSum = sorted.reduce((s, g) => s + g.weight, 0); // Σ_{i ≤ j} w
    for (let j = k; j >= 1; j--) {
      const f = wSum * (1 - cdfBelow5(owPB, giftPB)) * Math.exp(-wSum * t);
      Q[j] += ((f + prevF[j]) / 2) * (t - prevT);
      prevF[j] = f;
      giftPB = foldIn(giftPB, Math.exp(-sorted[j - 1].weight * t));
      wSum -= sorted[j - 1].weight;
    }
    prevT = t;
  }

  let expected = 0;
  for (let m = 1; m <= k; m++) expected += sorted[m - 1].perCraft * (Q[m - 1] - Q[m]);
  return expected;
}
