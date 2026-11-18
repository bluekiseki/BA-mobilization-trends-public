import type { CellBbox } from '../core/geometry';
import type { CellEntry, GridCell, Grid, MotionEstimate, Observation, Track, CellVote } from './types';

export const PROXY_WIDTH = 160;
export const PROXY_HEIGHT = 100;

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const nextPower = (n: number): number => 2 ** Math.ceil(Math.log2(n));

/** Iterative radix-2 complex FFT over interleaved [re, im] arrays; the inverse is scaled by 1/n. */
class Fft {
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly rev: Uint32Array;

  constructor(readonly size: number) {
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let k = 0; k < size / 2; k++) {
      this.cos[k] = Math.cos((2 * Math.PI * k) / size);
      this.sin[k] = Math.sin((2 * Math.PI * k) / size);
    }
    const bits = Math.log2(size);
    this.rev = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
  }

  run(out: Float64Array, input: Float64Array, inverse: boolean): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      out[i * 2] = input[j * 2];
      out[i * 2 + 1] = input[j * 2 + 1];
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step];
          const wi = inverse ? this.sin[k * step] : -this.sin[k * step];
          const a = i + k;
          const b = a + half;
          const xr = out[b * 2] * wr - out[b * 2 + 1] * wi;
          const xi = out[b * 2] * wi + out[b * 2 + 1] * wr;
          out[b * 2] = out[a * 2] - xr;
          out[b * 2 + 1] = out[a * 2 + 1] - xi;
          out[a * 2] += xr;
          out[a * 2 + 1] += xi;
        }
      }
    }
    if (inverse) for (let i = 0; i < n * 2; i++) out[i] /= n;
  }
}

// Separable 2D FFT phase correlation.
export class PhaseCorrelator {
  private readonly w: number;
  private readonly h: number;
  private readonly fftX: Fft;
  private readonly fftY: Fft;
  private readonly row: Float64Array;
  private readonly rowOut: Float64Array;
  private readonly col: Float64Array;
  private readonly colOut: Float64Array;
  private cachedImage: Uint8Array | null = null;
  private cachedSpectrum: Float64Array | null = null;

  constructor(
    private readonly width = PROXY_WIDTH,
    private readonly height = PROXY_HEIGHT,
  ) {
    this.w = nextPower(width);
    this.h = nextPower(height);
    this.fftX = new Fft(this.w);
    this.fftY = new Fft(this.h);
    this.row = new Float64Array(this.w * 2);
    this.rowOut = new Float64Array(this.w * 2);
    this.col = new Float64Array(this.h * 2);
    this.colOut = new Float64Array(this.h * 2);
  }

  private transform(data: Float64Array, inverse = false): Float64Array {
    const result = new Float64Array(data);
    const { w, h, row, rowOut, col, colOut } = this;
    for (let y = 0; y < h; y++) {
      row.set(result.subarray(y * w * 2, (y + 1) * w * 2));
      this.fftX.run(rowOut, row, inverse);
      result.set(rowOut, y * w * 2);
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        col[y * 2] = result[(y * w + x) * 2];
        col[y * 2 + 1] = result[(y * w + x) * 2 + 1];
      }
      this.fftY.run(colOut, col, inverse);
      for (let y = 0; y < h; y++) {
        result[(y * w + x) * 2] = colOut[y * 2];
        result[(y * w + x) * 2 + 1] = colOut[y * 2 + 1];
      }
    }
    return result;
  }

  private spectrum(gray: Uint8Array): Float64Array {
    let sum = 0;
    for (const value of gray) sum += value;
    const mean = sum / gray.length;
    const data = new Float64Array(this.w * this.h * 2);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) data[(y * this.w + x) * 2] = gray[y * this.width + x] - mean;
    }
    return this.transform(data);
  }

  estimate(previous: Uint8Array, current: Uint8Array): MotionEstimate {
    const a = previous === this.cachedImage && this.cachedSpectrum ? this.cachedSpectrum : this.spectrum(previous);
    const b = this.spectrum(current);
    this.cachedImage = current;
    this.cachedSpectrum = b;
    const cross = new Float64Array(a.length);
    for (let i = 0; i < a.length; i += 2) {
      const real = a[i] * b[i] + a[i + 1] * b[i + 1];
      const imag = a[i] * b[i + 1] - a[i + 1] * b[i];
      const magnitude = Math.max(1e-12, Math.hypot(real, imag));
      cross[i] = real / magnitude;
      cross[i + 1] = imag / magnitude;
    }
    const correlation = this.transform(cross, true);
    let peak = 0;
    for (let i = 2; i < correlation.length; i += 2) if (correlation[i] > correlation[peak]) peak = i;
    const px = (peak / 2) % this.w;
    const py = Math.floor(peak / 2 / this.w);
    let confidence = 0;
    let sumX = 0;
    let sumY = 0;
    for (let y = py - 2; y <= py + 2; y++) {
      for (let x = px - 2; x <= px + 2; x++) {
        const value = correlation[(((y + this.h) % this.h) * this.w + ((x + this.w) % this.w)) * 2];
        confidence += value;
        sumX += value * x;
        sumY += value * y;
      }
    }
    let dx = Math.abs(confidence) > 1e-8 ? sumX / confidence : px;
    let dy = Math.abs(confidence) > 1e-8 ? sumY / confidence : py;
    if (dx > this.w / 2) dx -= this.w;
    if (dy > this.h / 2) dy -= this.h;
    return { dx, dy, confidence };
  }
}

export function signatureSimilarity(a: Float32Array, b: Float32Array): number {
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] * b[i];
  return score;
}

export function fitCellOffset(entries: CellEntry[], references: Map<string, CellEntry>, grid: Grid): number | null {
  const offsets: number[] = [];
  for (const entry of entries) {
    const scores: Array<{ similarity: number; row: number }> = [];
    for (const ref of references.values()) {
      if (ref.segment !== entry.segment || ref.col !== entry.col || Math.abs(ref.row - entry.row) > 16 || !entry.signature || !ref.signature) continue;
      scores.push({ similarity: signatureSimilarity(entry.signature, ref.signature), row: ref.row });
    }
    scores.sort((a, b) => b.similarity - a.similarity);
    if (scores[0]?.similarity >= 0.94 && (scores.length < 2 || scores[0].similarity - scores[1].similarity >= 0.025)) {
      offsets.push(entry.box.y + entry.box.h / 2 - grid.originY - scores[0].row * grid.pitch);
    }
  }
  if (offsets.length < 2) return null;
  const center = median(offsets);
  const agreeing = offsets.filter((v) => Math.abs(v - center) < grid.pitch * 0.2);
  return agreeing.length >= 2 && agreeing.length / offsets.length >= 0.65 ? median(agreeing) : null;
}

export function rowAlignment(entries: CellEntry[], references: Map<string, CellEntry>): { shift: number; votes: Record<string, number> } {
  const votes = new Map<number, number>();
  for (const entry of entries) {
    const scores: Array<{ similarity: number; shift: number }> = [];
    for (const ref of references.values()) {
      if (ref.segment !== entry.segment || ref.col !== entry.col || Math.abs(ref.row - entry.row) > 4 || !entry.signature || !ref.signature) continue;
      scores.push({ similarity: signatureSimilarity(entry.signature, ref.signature), shift: ref.row - entry.row });
    }
    scores.sort((a, b) => b.similarity - a.similarity);
    if (scores[0]?.similarity >= 0.94 && (scores.length < 2 || scores[0].similarity - scores[1].similarity >= 0.025)) {
      votes.set(scores[0].shift, (votes.get(scores[0].shift) ?? 0) + 1);
    }
  }
  const best = [...votes].sort((a, b) => b[1] - a[1])[0];
  const total = [...votes.values()].reduce((a, b) => a + b, 0);
  const shift = best && best[1] >= 2 && best[1] / total >= 0.65 ? best[0] : 0;
  return { shift, votes: Object.fromEntries(votes) };
}

export interface KeyframeInput {
  offset: number;
  lastOffset: number | null;
  pitch: number;
  motionPx: number;
  time: number;
  lastTime: number;
  stableSince: number | null;
  pendingSingle: boolean;
}

export function adaptiveKeyframe({ offset, lastOffset, pitch, motionPx, time, lastTime, stableSince, pendingSingle }: KeyframeInput): { reason: string | null; spacing: number } {
  const spacing = pitch * (Math.abs(motionPx) >= pitch * 0.5 ? 0.25 : 0.5);
  if (lastOffset === null) return { reason: 'initial', spacing };
  if (Math.abs(offset - lastOffset) >= spacing) return { reason: spacing < pitch * 0.5 ? 'fast' : 'moving', spacing };
  if (stableSince !== null && time - stableSince >= 0.15 && time - lastTime >= 0.15) {
    if (pendingSingle) return { reason: 'repeat-stopped', spacing };
    if (Math.abs(offset - lastOffset) >= pitch * 0.3) return { reason: 'stopped', spacing };
  }
  return { reason: null, spacing };
}

export function alignedSimilarity(previous: Uint8Array, current: Uint8Array, dy: number, width = PROXY_WIDTH, height = PROXY_HEIGHT): number {
  const shift = Math.round(dy);
  const start = Math.max(0, -shift);
  const end = Math.min(height, height - shift);
  let sumA = 0;
  let sumB = 0;
  let sumAA = 0;
  let sumBB = 0;
  let sumAB = 0;
  let count = 0;
  for (let y = start; y < end; y++) {
    for (let x = 0; x < width; x++) {
      const a = previous[y * width + x];
      const b = current[(y + shift) * width + x];
      sumA += a;
      sumB += b;
      sumAA += a * a;
      sumBB += b * b;
      sumAB += a * b;
      count++;
    }
  }
  if (!count) return 0;
  const numerator = sumAB - (sumA * sumB) / count;
  return numerator / Math.max(1e-12, Math.sqrt(Math.max(0, sumAA - (sumA * sumA) / count) * Math.max(0, sumBB - (sumB * sumB) / count)));
}

function cluster(values: number[], tolerance: number): number[] {
  const groups: number[][] = [];
  for (const value of [...values].sort((a, b) => a - b)) {
    const last = groups.at(-1);
    if (!last || value - last.reduce((a, b) => a + b, 0) / last.length > tolerance) groups.push([value]);
    else last.push(value);
  }
  return groups.map(median);
}

export function createGrid(boxes: CellBbox[], width: number, height: number): Grid {
  if (boxes.length < 6) throw new Error('At least two rows of items are needed to set up the grid.');
  const cellH = median(boxes.map((b) => b.h));
  const cellW = median(boxes.map((b) => b.w));
  const columns = cluster(
    boxes.map((b) => b.x + b.w / 2),
    cellH * 0.45,
  );
  const rows = cluster(
    boxes.map((b) => b.y + b.h / 2),
    cellH * 0.45,
  );
  if (columns.length < 2 || rows.length < 2) throw new Error('Could not find the inventory grid spacing.');
  return {
    columns,
    originY: rows[0],
    pitch: median(rows.slice(1).map((v, i) => v - rows[i])),
    cellH,
    cellW,
    roi: {
      x: Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.x)))),
      y: Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.y)) - cellH * 0.12)),
      right: Math.min(width, Math.floor(Math.max(...boxes.map((b) => b.x + b.w)))),
      bottom: Math.min(height, Math.floor(Math.max(...boxes.map((b) => b.y + b.h)) + cellH * 0.08)),
    },
  };
}

export function expandGridRoi(grid: Grid, boxes: CellBbox[], height: number): boolean {
  if (grid.roi.bottom - grid.roi.y >= grid.pitch * 3.5) return false;
  const eligible = boxes.filter(
    (b) =>
      b.h >= grid.cellH * 0.8 && b.h <= grid.cellH * 1.2 && b.w >= grid.cellW * 0.8 && b.w <= grid.cellW * 1.2 && Math.min(...grid.columns.map((c) => Math.abs(b.x + b.w / 2 - c))) < grid.cellW * 0.3,
  );
  if (!eligible.length) return false;
  const top = Math.max(0, Math.floor(Math.min(...eligible.map((b) => b.y)) - grid.cellH * 0.12));
  const bottom = Math.min(height, Math.floor(Math.max(...eligible.map((b) => b.y + b.h)) + grid.cellH * 0.08));
  const changed = top < grid.roi.y || bottom > grid.roi.bottom;
  grid.roi.y = Math.min(top, grid.roi.y);
  grid.roi.bottom = Math.max(bottom, grid.roi.bottom);
  return changed;
}

export function assignCells(boxes: CellBbox[], grid: Grid, offset: number, segment = 0): { cells: GridCell[]; offset: number; correction: number } {
  const { roi, cellH, cellW, pitch, originY, columns } = grid;
  // Edge margins must match top and bottom: the ROI is built with 0.12/0.08 cell slack, so a stricter bottom margin
  // would drop the lowest initial row, which only reverse (downward) scrolling never brings back into the middle.
  const full = boxes.filter((b) => b.h >= cellH * 0.92 && b.w >= cellW * 0.9 && b.y >= roi.y + cellH * 0.04 && b.y + b.h <= roi.bottom - cellH * 0.04);
  const residuals = full.map((b) => {
    const row = (b.y + b.h / 2 - offset - originY) / pitch;
    return (row - Math.round(row)) * pitch;
  });
  let correction = residuals.length ? median(residuals) : 0;
  if (Math.abs(correction) >= pitch * 0.35) correction = 0;
  offset += correction;
  const unique = new Map<string, GridCell>();
  for (const box of full) {
    if (box.x < roi.x - box.w * 0.1 || box.x + box.w > roi.right + box.w * 0.1) continue;
    const row = Math.round((box.y + box.h / 2 - offset - originY) / pitch);
    let col = 0;
    for (let i = 1; i < columns.length; i++) {
      if (Math.abs(box.x + box.w / 2 - columns[i]) < Math.abs(box.x + box.w / 2 - columns[col])) col = i;
    }
    const id = `${segment}:${row}:${col}`;
    if (!unique.has(id)) unique.set(id, { id, row, col, segment, box });
  }
  return { cells: [...unique.values()], offset, correction };
}

export function shouldObserve(observations: Observation[], time: number, box: CellBbox, pitch: number): boolean {
  if (observations.length >= 5) return false;
  const last = observations.at(-1);
  if (!last) return true;
  const dt = time - last.time;
  const distance = Math.abs(box.y + box.h / 2 - last.box.y - last.box.h / 2);
  return dt >= 0.025 && (distance >= pitch * 0.35 || dt >= 0.15);
}

export function resolveVotes(observations: Observation[]): CellVote {
  const kinds = new Map<string, number>();
  const amounts = new Map<number, number>();
  for (const o of observations) if (o.key) kinds.set(o.key, (kinds.get(o.key) ?? 0) + o.similarity);
  const winner = <K>(map: Map<K, number>): K | null => [...map].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const key = winner(kinds);
  for (const o of observations) {
    if (key && o.key === key && o.quantity !== null && o.quantity > 0) amounts.set(o.quantity, (amounts.get(o.quantity) ?? 0) + Math.max(0.05, o.ocrConfidence));
  }
  const quantity = winner(amounts);
  const share = <K>(map: Map<K, number>, value: K | null): number => (value === null ? 0 : (map.get(value) ?? 0) / [...map.values()].reduce((a, b) => a + b, 0));
  const agreement = observations.filter((o) => key && o.key === key && quantity !== null && o.quantity === quantity).length;
  const confirmed =
    key !== null && quantity !== null && amounts.size === 1 && agreement >= 3 && agreement / observations.length >= 0.6 && share(kinds, key) >= 0.65 && share(amounts, quantity) >= 0.65;
  return { key, quantity, status: confirmed ? 'confirmed' : 'uncertain' };
}

// Reconnect a failed motion estimate only when independent columns agree on
// the absolute inventory position. Ambiguous repeated identities cannot anchor.
export function semanticOffset(entries: CellEntry[], tracks: Map<string, Track>, grid: Grid, segment: number): number | null {
  const index = new Map<string, Set<number>>();
  const matches: Array<{ offset: number; col: number }> = [];
  const identity = (col: number, o: { key: string | null; quantity: number | null }) => JSON.stringify([col, o.key, o.quantity]);
  const eligible = (o: { key: string | null; quantity: number | null; similarity: number; ocrConfidence: number }) =>
    o.key !== null && o.quantity !== null && o.similarity >= 0.75 && o.ocrConfidence >= 0.8;
  for (const track of tracks.values()) {
    if (track.segment !== segment) continue;
    for (const o of track.observations) {
      if (!eligible(o)) continue;
      const key = identity(track.col, o);
      if (!index.has(key)) index.set(key, new Set());
      index.get(key)?.add(track.row);
    }
  }
  for (const e of entries) {
    if (!e.prediction || !eligible(e.prediction)) continue;
    const rows = [...(index.get(identity(e.col, e.prediction)) ?? [])].filter((row) => Math.abs(row - e.row) <= 16);
    if (rows.length === 1) matches.push({ offset: e.box.y + e.box.h / 2 - grid.originY - rows[0] * grid.pitch, col: e.col });
  }
  if (matches.length < 3) return null;
  const center = median(matches.map((m) => m.offset));
  const agreeing = matches.filter((m) => Math.abs(m.offset - center) < grid.pitch * 0.2);
  return new Set(agreeing.map((m) => m.col)).size >= 3 && agreeing.length / matches.length >= 0.65 ? median(agreeing.map((m) => m.offset)) : null;
}
