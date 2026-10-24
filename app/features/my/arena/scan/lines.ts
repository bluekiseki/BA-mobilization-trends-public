import { close, components, median, open, roundHalfEven, toGray, type Pixels } from './image';

// Horizontal divider segment: [x0, y, x1].
export type Segment = [number, number, number];

function flatRatio(values: number[]): number {
  if (!values.length) return 0;
  const m = median(values);
  let flat = 0;
  for (const v of values) if (Math.abs(v - m) <= 6) flat += 1;
  return flat / values.length;
}

// Long, thin, single-color horizontal lines (header divider and bar baseline on each side).
export function findLines(img: Pixels): Segment[] {
  const { width: W, height: H } = img;
  const g = toGray(img);
  const d = Math.max(3, roundHalfEven(H / 250)); // vertical probe offset, ~line thickness
  const raw = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    const up = ((y - d + H) % H) * W;
    const down = ((y + d) % H) * W;
    for (let x = 0; x < W; x += 1) {
      const v = g[y * W + x];
      raw[y * W + x] = v < g[up + x] - 12 && v < g[down + x] - 12 && v > 120 ? 1 : 0;
    }
  }
  // Bridge gaps where bars touch the line, then keep only long horizontal runs.
  const bridged = close(raw, W, H, Math.max(5, Math.floor(W / 40)), 1);
  const longRuns = open(bridged, W, H, Math.floor(W / 8), 1);

  const segs: Segment[] = [];
  for (const c of components(longRuns, W, H)) {
    if (c.w <= W * 0.15) continue;
    // A real divider is one flat color; judge only pixels that are line (bars may cover parts of it).
    const score = (r: number): number => {
      const values: number[] = [];
      for (let x = c.x; x < c.x + c.w; x += 1) if (raw[r * W + x]) values.push(g[r * W + x]);
      return values.length / c.w >= 0.6 ? flatRatio(values) : 0;
    };
    let best = c.y;
    let bestScore = score(c.y);
    for (let r = c.y + 1; r < c.y + c.h; r += 1) {
      const s = score(r);
      if (s > bestScore) {
        best = r;
        bestScore = s;
      }
    }
    if (bestScore > 0.9) segs.push([c.x, best, c.x + c.w]);
  }
  segs.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const out: Segment[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && Math.abs(s[1] - last[1]) <= 2 * d && Math.abs(s[0] - last[0]) < W * 0.02) continue;
    out.push(s);
  }
  return out;
}

// Left/right segments at the same height with the same length, ordered top to bottom.
export function linePairs(img: Pixels): [Segment, Segment][] {
  const segs = findLines(img);
  const pairs: [Segment, Segment][] = [];
  for (const a of segs) for (const b of segs) if (a[2] < b[0] && Math.abs(a[1] - b[1]) <= 3 && Math.abs(a[2] - a[0] - (b[2] - b[0])) < 0.03 * (a[2] - a[0])) pairs.push([a, b]);
  return pairs.sort((p, q) => p[0][1] - q[0][1]);
}
