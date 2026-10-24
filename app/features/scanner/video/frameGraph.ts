// Port of the validated frame graph. Position evidence never settles quantity votes.
// Numerical gates are frozen to the validated values, not tuned per decoder.
import type { CellBbox } from '../core/geometry';
import type { FrameGraphResult, GraphCell, GraphEdge, GraphFrame, Observation, ReplayFrame, TraceEntry } from './types';

const median = (values: number[]): number => {
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const count = <T>(values: T[], pick: (v: T) => number): number => new Set(values.map(pick)).size;
const dot = (a: number[], b: number[]): number => a.reduce((sum, x, i) => sum + x * b[i], 0);

interface PreparedEntry extends GraphCell {
  col: number;
  localRow: number;
}

interface IndexedObservation {
  i: number;
  row: number;
  col: number;
  key: string;
  quantity: number | null;
}

interface Anchor {
  col: number;
  localRow?: number;
  score?: number;
  quantitySupported?: boolean;
}

const cellColumn = (id: string): number => Number(id.split(':')[2]);

function add<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function reconstructFrames(sourceFrames: GraphFrame[], trace: TraceEntry[], pitch: number): FrameGraphResult {
  if (!(pitch > 0)) throw new Error('Frame graph requires a positive grid pitch');
  const unplacedFrames = sourceFrames.filter((f) => new Set(f.cells.map((c) => cellColumn(c.id))).size < 3);
  const frames = sourceFrames.filter((f) => !unplacedFrames.includes(f));
  const index = new Map<string, IndexedObservation[]>();
  const kindIndex = new Map<string, IndexedObservation[]>();

  const prepared = frames.map((frame, i) => {
    const centers = frame.cells.map((c) => c.box.y + c.box.h / 2);
    const min = Math.min(...centers);
    const top = median(centers.filter((y) => y < min + pitch * 0.3));
    const unique = new Map<string, PreparedEntry[]>();
    const kinds = new Map<string, PreparedEntry[]>();
    const entries: PreparedEntry[] = frame.cells.map((c, n) => {
      const p = c.prediction;
      const col = cellColumn(c.id);
      const localRow = Math.floor((centers[n] - top) / pitch + 0.5);
      const e: PreparedEntry = { ...c, col, localRow };
      if (p.key && p.quantity !== null && p.similarity >= 0.75 && p.ocrConfidence >= 0.8) add(unique, JSON.stringify([col, p.key, p.quantity]), e);
      if (p.key && p.similarity >= 0.75) add(kinds, JSON.stringify([col, p.key]), e);
      return e;
    });
    for (const [key, values] of unique) {
      if (values.length !== 1) continue;
      const [col, kind, quantity] = JSON.parse(key) as [number, string, number];
      add(index, key, { i, row: values[0].localRow, col, key: kind, quantity });
    }
    for (const [key, values] of kinds) {
      if (values.length !== 1) continue;
      const [col, kind] = JSON.parse(key) as [number, string];
      add(kindIndex, key, { i, row: values[0].localRow, col, key: kind, quantity: values[0].prediction.quantity });
    }
    return { frame, top, entries, known: [...unique.values()].filter((v) => v.length === 1).length };
  });

  function collectEdges(map: Map<string, IndexedObservation[]>, kinds: boolean): GraphEdge[] {
    const pairs = new Map<string, { i: number; j: number; total: number; votes: Map<number, Anchor[]> }>();
    for (const observations of map.values()) {
      for (let n = 0; n < observations.length; n++) {
        const a = observations[n];
        for (const b of observations.slice(n + 1)) {
          const key = `${a.i}:${b.i}`;
          let pair = pairs.get(key);
          if (!pair) {
            pair = { i: a.i, j: b.i, total: 0, votes: new Map() };
            pairs.set(key, pair);
          }
          pair.total++;
          add(pair.votes, a.row - b.row, kinds ? { col: a.col, localRow: b.row } : { col: a.col });
        }
      }
    }
    const edges: GraphEdge[] = [];
    for (const { i, j, total, votes } of pairs.values()) {
      const ranked = [...votes].sort((a, b) => b[1].length - a[1].length);
      const [shift, anchors] = ranked[0];
      if (
        anchors.length >= (kinds ? 6 : 3) &&
        count(anchors, (a) => a.col) >= 3 &&
        (!kinds || count(anchors, (a) => a.localRow ?? 0) >= 2) &&
        anchors.length / total >= (kinds ? 0.8 : 0.65) &&
        (ranked.length === 1 || ranked[1][1].length < anchors.length)
      ) {
        edges.push({ i, j, shift, anchors, method: kinds ? 'six-kinds' : 'kind-quantity' });
      }
    }
    return edges.sort((a, b) => b.anchors.length - a.anchors.length || a.j - a.i - (b.j - b.i));
  }

  const edges = collectEdges(index, false);
  const kindEdges = collectEdges(kindIndex, true);
  const pixelEdges: GraphEdge[] = [];
  for (let j = 1; j < prepared.length; j++) {
    const a = prepared[j - 1];
    const b = prepared[j];
    if (b.frame.time - a.frame.time > 0.35) continue;
    const votes = new Map<number, Anchor[]>();
    for (const e of b.entries) {
      const ranked = a.entries
        .filter((p) => p.col === e.col)
        .map((p): [number, PreparedEntry] => [dot(e.signature, p.signature), p])
        .sort((x, y) => y[0] - x[0]);
      if (!ranked.length || ranked[0][0] < 0.94 || (ranked.length > 1 && ranked[0][0] - ranked[1][0] < 0.025)) continue;
      const [score, p] = ranked[0];
      const ep = e.prediction;
      const pp = p.prediction;
      let qtyMatch = ep.quantity !== null && ep.quantity === pp.quantity && Math.min(ep.ocrConfidence, pp.ocrConfidence) >= 0.8;
      if (ep.key && pp.key && ep.key !== pp.key && Math.min(ep.similarity, pp.similarity) >= 0.75) qtyMatch = false;
      const lowContrast = Math.min(e.contrast, p.contrast) < 18;
      const contrastRatio = Math.max(e.contrast, p.contrast) / Math.max(0.01, Math.min(e.contrast, p.contrast));
      const fade = score >= 0.97 && lowContrast && contrastRatio >= 1.3 && Math.abs(e.box.y - p.box.y) < pitch * 0.1;
      if (qtyMatch || fade) add(votes, p.localRow - e.localRow, { col: e.col, localRow: e.localRow, score, quantitySupported: qtyMatch });
    }
    const ranked = [...votes].sort((x, y) => y[1].length - x[1].length);
    if (!ranked.length) continue;
    const [shift, anchors] = ranked[0];
    const total = [...votes.values()].reduce((n, list) => n + list.length, 0);
    const quantityCols = count(
      anchors.filter((x) => x.quantitySupported),
      (x) => x.col,
    );
    if (
      count(anchors, (x) => x.col) >= 3 &&
      (quantityCols >= 3 || (anchors.length >= 6 && count(anchors, (x) => x.localRow ?? 0) >= 2)) &&
      anchors.length / total >= 0.65 &&
      (ranked.length === 1 || ranked[1][1].length < anchors.length)
    ) {
      pixelEdges.push({ i: j - 1, j, shift, anchors, method: quantityCols >= 3 ? 'cell-pixels-quantity' : 'fade-layout' });
    }
  }

  const parent = frames.map((_, i) => i);
  const delta = frames.map(() => 0);
  const acceptedEdges: GraphEdge[] = [];
  const rejectedEdges: Array<GraphEdge & { existingShift: number }> = [];
  function find(i: number): number {
    if (parent[i] !== i) {
      const p = parent[i];
      parent[i] = find(p);
      delta[i] += delta[p];
    }
    return parent[i];
  }
  function connect(edge: GraphEdge): void {
    const { i, j, shift } = edge;
    const ri = find(i);
    const rj = find(j);
    if (ri === rj) {
      if (delta[j] - delta[i] !== shift) rejectedEdges.push({ ...edge, existingShift: delta[j] - delta[i] });
      return;
    }
    const difference = shift + delta[i] - delta[j];
    if (ri < rj) {
      parent[rj] = ri;
      delta[rj] = difference;
    } else {
      parent[ri] = rj;
      delta[ri] = -difference;
    }
    acceptedEdges.push(edge);
  }
  for (const edge of [...edges, ...kindEdges, ...pixelEdges]) connect(edge);
  for (let j = 1; j < prepared.length; j++) {
    const a = prepared[j - 1];
    const b = prepared[j];
    const fa = a.frame;
    const fb = b.frame;
    if (a.known >= 3 && b.known >= 3) continue;
    const interval = trace.filter((t) => fa.time < t.time && t.time <= fb.time + 1e-6);
    if (fb.segment !== fa.segment || fb.time - fa.time > 0.2 || !interval.length || interval.some((t) => !t.reliable || t.motionMethod !== 'phase')) continue;
    const movement = fb.offset - fa.offset;
    if (Math.abs(movement) > pitch * 1.5) continue;
    connect({ i: j - 1, j, shift: Math.floor((b.top - a.top - movement) / pitch + 0.5), anchors: [], method: 'adjacent-phase' });
  }

  const roots = [...new Set(frames.map((_, i) => find(i)))].sort((a, b) => a - b);
  const segments = new Map(roots.map((root, i) => [root, i]));
  const tracks: Record<string, Observation[]> = {};
  const replayFrames: ReplayFrame[] = [];
  prepared.forEach((p, i) => {
    const root = find(i);
    const segment = segments.get(root) ?? 0;
    const rowStart = delta[i];
    const frame = p.frame;
    const offset = p.top - prepared[root].top - rowStart * pitch;
    const cells = p.entries.map((e) => {
      const row = rowStart + e.localRow;
      const id = `${segment}:${row}:${e.col}`;
      const box: CellBbox = e.box;
      const observations = (tracks[id] ??= []);
      const last = observations.at(-1);
      if (!last || (frame.time - last.time >= 0.025 && (frame.time - last.time >= 0.15 || Math.abs(box.y + box.h / 2 - last.box.y - last.box.h / 2) >= pitch * 0.35))) {
        observations.push({ ...e.prediction, frame: frame.frame, time: frame.time, box });
      }
      // Gray descriptors stay private; the result carries predictions and coordinates only.
      return { id, box, prediction: e.prediction, localRow: e.localRow, col: e.col };
    });
    replayFrames.push({ time: frame.time, frame: frame.frame, offset, segment, rowStart, roi: frame.roi, width: frame.width, height: frame.height, cells });
  });
  return { tracks, replayFrames, acceptedEdges, rejectedEdges, components: roots.length, frames: frames.length, unplacedFrames };
}
