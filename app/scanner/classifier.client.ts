import * as ort from 'onnxruntime-web';
import type { CellBbox, IconEntry } from './types';

export interface EmbeddingsPayload {
  dim: number;
  keys: string[];
  data: string;
}

const EMBED_SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const SIMILARITY_THRESHOLD = 0.55;
const TOP_K = 8;
const PALETTE_WEIGHT = 0.22;
const EMBED_MARGIN = 0.08;

let session: ort.InferenceSession | null = null;
let keys: string[] = [];
let embedMat: Float32Array | null = null;
let dim = 0;
let iconMap: Map<string, IconEntry> = new Map();
let colorFeatures: Map<string, Float32Array> | null = null;
let paletteGroups: Map<string, number[]> | null = null;
let initialized = false;

export function isClassifierLoaded(): boolean {
  return initialized;
}

// Guard against re-creating ONNX session: shared by item and student scanners; onnxruntime-web can't run two at once.
export async function initClassifier(
  providers: string[],
  icons: IconEntry[],
  onProgress: (msg: string) => void,
  modelBytes: Uint8Array,
  embedResp: EmbeddingsPayload,
  onColorProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (initialized) {
    onProgress('Embedding model already loaded');
    return;
  }

  // Icon map only depends on the `icons` param, so it can be built before the
  // network/CPU work below — paletteGroups construction after that work needs it.
  iconMap = new Map(icons.map((ic) => [ic.inventoryKey, ic]));

  // modelBytes/embedResp are already fetched by modelLoader.client.ts, so the only remaining
  // work is the CPU-bound session compile and color-feature build — run concurrently.
  onProgress('Loading embedding model and palette color features…');
  const [sess, features] = await Promise.all([ort.InferenceSession.create(modelBytes, { executionProviders: providers }), buildColorFeatures(icons, onColorProgress)]);

  session = sess;
  dim = embedResp.dim;
  keys = embedResp.keys;

  const bin = atob(embedResp.data);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  embedMat = new Float32Array(buf.buffer);

  colorFeatures = features;
  const groups = new Map<string, number[]>();
  keys.forEach((key, idx) => {
    const group = paletteGroup(iconMap.get(key));
    if (!group) return;
    const members = groups.get(group) ?? [];
    members.push(idx);
    groups.set(group, members);
  });
  paletteGroups = groups;
  initialized = true;
}

export async function classifyBatch(bitmap: ImageBitmap, cells: CellBbox[]): Promise<Array<{ icon: IconEntry | null; similarity: number }>> {
  if (!session || !embedMat || !colorFeatures || !paletteGroups) throw new Error('Classifier not initialized');

  const sess = session;
  const mat = embedMat;
  const features = colorFeatures;
  const groups = paletteGroups;

  const canvas = new OffscreenCanvas(EMBED_SIZE, EMBED_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas not initialized');
  const results: Array<{ icon: IconEntry | null; similarity: number }> = [];

  const classifyImgData = async (imgData: Uint8ClampedArray, queryColor: Float32Array) => {
    const tensor = new ort.Tensor('float32', rgbaToNchw(imgData), [1, 3, EMBED_SIZE, EMBED_SIZE]);
    const out = await sess.run({ input: tensor });
    const feat = (out['embedding']?.data ?? out[Object.keys(out)[0]].data) as Float32Array;
    const embedding = l2normalize(feat);
    const candidates = cosineTopK(embedding, mat, dim, TOP_K);
    return rerankPaletteCandidates(candidates, embedding, queryColor, keys, iconMap, features, groups, mat, dim);
  };

  for (const { x, y, w, h } of cells) {
    const grab = (mx: number, my: number) => {
      ctx.clearRect(0, 0, EMBED_SIZE, EMBED_SIZE);
      ctx.drawImage(bitmap, x + mx, y + my, w - 2 * mx, h - 2 * my, 0, 0, EMBED_SIZE, EMBED_SIZE);
      return ctx.getImageData(0, 0, EMBED_SIZE, EMBED_SIZE).data;
    };

    const queryColor = colorFeature(grab(0, 0), EMBED_SIZE);

    let { idx, sim } = await classifyImgData(grab(0, 0), queryColor);

    if (sim < SIMILARITY_THRESHOLD) {
      const retry = await classifyImgData(grab(w * EMBED_MARGIN, h * EMBED_MARGIN), queryColor);
      if (retry.sim > sim) ({ idx, sim } = retry);
    }

    if (sim < SIMILARITY_THRESHOLD) {
      results.push({ icon: null, similarity: sim });
      continue;
    }

    const key = keys[idx];
    const icon = iconMap.get(key);
    if (!icon) {
      console.warn(`[Scanner] Unrecognized item: key=${key}, sim=${(sim * 100).toFixed(1)}%, exists in icon_img=${icon !== undefined}`);
    }
    results.push({ icon: icon ?? null, similarity: sim });
  }
  return results;
}

function rgbaToNchw(data: Uint8ClampedArray): Float32Array {
  const n = EMBED_SIZE * EMBED_SIZE;
  const out = new Float32Array(3 * n);
  for (let p = 0; p < n; p++) {
    out[0 * n + p] = (data[p * 4] / 255 - MEAN[0]) / STD[0];
    out[1 * n + p] = (data[p * 4 + 1] / 255 - MEAN[1]) / STD[1];
    out[2 * n + p] = (data[p * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }
  return out;
}

function l2normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

function cosineTopK(query: Float32Array, mat: Float32Array, d: number, k: number): Array<{ idx: number; sim: number }> {
  const n = mat.length / d;
  const top: Array<{ idx: number; sim: number }> = [];
  for (let i = 0; i < n; i++) {
    let dot = 0;
    const offset = i * d;
    for (let d_idx = 0; d_idx < d; d_idx++) dot += query[d_idx] * mat[offset + d_idx];
    if (top.length < k || dot > top[top.length - 1].sim) {
      top.push({ idx: i, sim: dot });
      top.sort((a, b) => b.sim - a.sim);
      if (top.length > k) top.pop();
    }
  }
  return top;
}

function paletteGroup(icon: IconEntry | undefined): string | null {
  if (!icon) return null;
  const key = icon.inventoryKey;
  if (key.startsWith('Item_')) {
    const id = parseInt(key.split('_')[1]);
    if (id >= 10 && id <= 13) return 'item-report';
    if (id >= 3000 && id <= 4999 && id % 10 <= 3) {
      return `item-${Math.floor(id / 10)}`;
    }
    if (id >= 150000 && id <= 150003) return 'item-15000';
    if (id >= 150004 && id <= 150007) return 'item-15004';
  }
  if (key.startsWith('Equipment_')) {
    const id = parseInt(key.split('_')[1]);
    if (id >= 1 && id <= 4) return 'equipment-exp';
  }
  return null;
}

function rerankPaletteCandidates(
  candidates: Array<{ idx: number; sim: number }>,
  embedding: Float32Array,
  queryColor: Float32Array,
  keys: string[],
  iconMap: Map<string, IconEntry>,
  colorFeatures: Map<string, Float32Array>,
  paletteGroups: Map<string, number[]>,
  embedMat: Float32Array,
  dim: number,
): { idx: number; sim: number } {
  const best = candidates[0];
  const group = paletteGroup(iconMap.get(keys[best.idx]));
  if (!group) return best;

  const family = paletteGroups.get(group) ?? [];
  if (family.length < 2) return best;

  let winner = best;
  let bestScore = -Infinity;
  for (const idx of family) {
    const sim = cosineAt(embedding, embedMat, dim, idx);
    const referenceColor = colorFeatures.get(keys[idx]);
    const paletteSim = referenceColor ? cosineColor(queryColor, referenceColor) : 0;
    const score = sim * (1 - PALETTE_WEIGHT) + paletteSim * PALETTE_WEIGHT;
    if (score > bestScore) {
      winner = { idx, sim };
      bestScore = score;
    }
  }
  return winner;
}

function cosineAt(query: Float32Array, mat: Float32Array, dim: number, idx: number): number {
  let dot = 0;
  const offset = idx * dim;
  for (let d = 0; d < dim; d++) dot += query[d] * mat[offset + d];
  return dot;
}

const COLOR_FEATURE_CHUNK_SIZE = 32;

// Decode dataUrl directly instead of round-tripping through fetch()/Response — the saved
// overhead adds up over hundreds of icons.
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = /data:(.*);base64/.exec(header)?.[1] ?? 'image/webp';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function buildColorFeatures(icons: IconEntry[], onChunkProgress?: (done: number, total: number) => void): Promise<Map<string, Float32Array>> {
  const features = new Map<string, Float32Array>();
  const canvas = new OffscreenCanvas(EMBED_SIZE, EMBED_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return features;

  for (let start = 0; start < icons.length; start += COLOR_FEATURE_CHUNK_SIZE) {
    const chunk = icons.slice(start, start + COLOR_FEATURE_CHUNK_SIZE);

    // Decode this chunk's bitmaps concurrently — createImageBitmap decoding happens
    // off the main thread in most browsers, so batching lets it overlap.
    const bitmaps = await Promise.all(
      chunk.map(async (icon) => {
        if (!icon.dataUrl) return null;
        try {
          return await createImageBitmap(dataUrlToBlob(icon.dataUrl));
        } catch {
          return null;
        }
      }),
    );

    // Canvas reads/writes must stay serialized — only one shared OffscreenCanvas.
    for (let i = 0; i < chunk.length; i++) {
      const bitmap = bitmaps[i];
      if (!bitmap) continue;
      ctx.clearRect(0, 0, EMBED_SIZE, EMBED_SIZE);
      ctx.drawImage(bitmap, 0, 0, EMBED_SIZE, EMBED_SIZE);
      const imgData = ctx.getImageData(0, 0, EMBED_SIZE, EMBED_SIZE).data;
      features.set(chunk[i].inventoryKey, colorFeature(imgData, EMBED_SIZE));
      bitmap.close();
    }

    onChunkProgress?.(Math.min(start + COLOR_FEATURE_CHUNK_SIZE, icons.length), icons.length);
    // Yield back to the event loop between chunks so the tab stays responsive
    // (repaints, input) instead of blocking for the entire ~769-icon pass.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return features;
}

function colorFeature(data: Uint8ClampedArray, size: number): Float32Array {
  const bins = new Float32Array(27);
  const start = Math.floor(size * 0.12);
  const end = Math.ceil(size * 0.88);
  for (let y = start; y < end; y++) {
    for (let x = start; x < end; x++) {
      const i = (y * size + x) * 4;
      if (data[i + 3] < 32) continue;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      const sat = max === 0 ? 0 : delta / max;
      if (sat < 0.12) {
        bins[24 + Math.min(2, Math.floor(max * 3))]++;
        continue;
      }
      let hue = 0;
      if (max === r) hue = ((g - b) / delta + 6) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      const hueBin = Math.min(11, Math.floor(hue * 2));
      const satBand = sat < 0.45 ? 0 : 1;
      bins[hueBin * 2 + satBand]++;
    }
  }
  return l2normalize(bins);
}

function cosineColor(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
