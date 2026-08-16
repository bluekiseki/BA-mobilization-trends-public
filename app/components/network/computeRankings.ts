import type { NetworkNode, NetworkEdge } from './types';

export interface NodeRanking {
  id: number;
  pageRank: number;
  strength: number;
  degree: number;
  betweenness: number;
}

export function computeRankings(nodes: NetworkNode[], edges: NetworkEdge[], damping = 0.85, iterations = 60): NodeRanking[] {
  if (nodes.length === 0) return [];
  const N = nodes.length;
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);

  const outWeight = new Map<number, number>();
  const inLinks = new Map<number, { from: number; w: number }[]>();
  const degree = new Map<number, number>();

  for (const id of ids) {
    outWeight.set(id, 0);
    inLinks.set(id, []);
    degree.set(id, 0);
  }

  for (const e of edges) {
    const { source: s, target: t, weight: w } = e;
    if (!idSet.has(s) || !idSet.has(t)) continue;
    outWeight.set(s, (outWeight.get(s) ?? 0) + w);
    outWeight.set(t, (outWeight.get(t) ?? 0) + w);
    inLinks.get(s)?.push({ from: t, w });
    inLinks.get(t)?.push({ from: s, w });
    degree.set(s, (degree.get(s) ?? 0) + 1);
    degree.set(t, (degree.get(t) ?? 0) + 1);
  }

  const rank = new Map<number, number>(ids.map((id) => [id, 1 / N]));

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Map<number, number>();
    for (const id of ids) {
      let sum = 0;
      for (const { from, w } of inLinks.get(id) ?? []) {
        const out = outWeight.get(from) ?? 1;
        sum += (rank.get(from) ?? 0) * (w / out);
      }
      next.set(id, (1 - damping) / N + damping * sum);
    }
    for (const id of ids) rank.set(id, next.get(id) ?? 0);
  }

  const maxPR = Math.max(...rank.values(), 1e-9);

  const strength = new Map<number, number>();
  for (const id of ids) strength.set(id, 0);
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    strength.set(e.source, (strength.get(e.source) ?? 0) + e.weight);
    strength.set(e.target, (strength.get(e.target) ?? 0) + e.weight);
  }

  const betweenness = computeBetweenness(nodes, edges);

  return ids.map((id) => ({
    id,
    pageRank: (rank.get(id) ?? 0) / maxPR,
    strength: strength.get(id) ?? 0,
    degree: degree.get(id) ?? 0,
    betweenness: betweenness.get(id) ?? 0,
  }));
}

// Weighted betweenness centrality via Brandes' algorithm.
// Edge distance = 1/weight so stronger co-occurrence = shorter path.
function computeBetweenness(nodes: NetworkNode[], edges: NetworkEdge[]): Map<number, number> {
  const N = nodes.length;
  if (N < 3) return new Map(nodes.map((n) => [n.id, 0]));

  const ids = nodes.map((n) => n.id);
  const idx = new Map<number, number>(ids.map((id, i) => [id, i]));

  const adj: { to: number; dist: number }[][] = Array.from({ length: N }, () => []);
  for (const e of edges) {
    const s = idx.get(e.source),
      t = idx.get(e.target);
    if (s === undefined || t === undefined) continue;
    const d = 1 / e.weight;
    adj[s].push({ to: t, dist: d });
    adj[t].push({ to: s, dist: d });
  }

  const cb = new Float64Array(N);

  for (let s = 0; s < N; s++) {
    const stack: number[] = [];
    const pred: number[][] = Array.from({ length: N }, () => []);
    const sigma = new Float64Array(N);
    sigma[s] = 1;
    const dist = new Float64Array(N).fill(Infinity);
    dist[s] = 0;

    const pq: [number, number][] = [[0, s]];

    while (pq.length > 0) {
      let mi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i][0] < pq[mi][0]) mi = i;
      const [dv, v] = pq[mi];
      pq.splice(mi, 1);
      if (dv > dist[v]) continue;
      stack.push(v);

      for (const { to: w, dist: ew } of adj[v]) {
        const nd = dist[v] + ew;
        if (nd < dist[w] - 1e-12) {
          dist[w] = nd;
          sigma[w] = sigma[v];
          pred[w] = [v];
          pq.push([nd, w]);
        } else if (Math.abs(nd - dist[w]) < 1e-12) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }

    const delta = new Float64Array(N);
    let wTop: number | undefined;
    while ((wTop = stack.pop()) !== undefined) {
      const w = wTop;
      for (const v of pred[w]) {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      }
      if (w !== s) cb[w] += delta[w];
    }
  }

  const norm = (N - 1) * (N - 2);
  return new Map(ids.map((id, i) => [id, cb[i] / norm]));
}
