import * as ort from 'onnxruntime-web';
import type { CellBbox, IconEntry } from './types';
import { cdn } from '~/utils/cdn';

const EMBED_SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const SIMILARITY_THRESHOLD = 0.55;

let session: ort.InferenceSession | null = null;
let keys: string[] = [];
let embedMat: Float32Array | null = null;
let dim = 0;
let iconMap: Map<string, IconEntry> = new Map();

export async function initClassifier(providers: string[], icons: IconEntry[], onProgress: (msg: string) => void): Promise<void> {
  onProgress('Loading embedding model…');
  session = await ort.InferenceSession.create(cdn('/scanner/models/embed_model.onnx'), {
    executionProviders: providers,
  });

  onProgress('Loading reference embeddings…');
  const resp: { dim: number; keys: string[]; data: string } = await (await fetch(cdn('/scanner/embeddings.json'))).json();
  const { dim: d, keys: k, data } = resp;
  dim = d;
  keys = k;

  const bin = atob(data);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  embedMat = new Float32Array(buf.buffer);

  iconMap = new Map(icons.map((ic) => [ic.inventoryKey, ic]));
}

export async function classifyBatch(bitmap: ImageBitmap, cells: CellBbox[]): Promise<Array<{ icon: IconEntry | null; similarity: number }>> {
  if (!session || !embedMat) throw new Error('Classifier not initialized');

  const canvas = new OffscreenCanvas(EMBED_SIZE, EMBED_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas not initialized');
  const results: Array<{ icon: IconEntry | null; similarity: number }> = [];

  for (const { x, y, w, h } of cells) {
    ctx.clearRect(0, 0, EMBED_SIZE, EMBED_SIZE);
    ctx.drawImage(bitmap, x, y, w, h, 0, 0, EMBED_SIZE, EMBED_SIZE);
    const imgData = ctx.getImageData(0, 0, EMBED_SIZE, EMBED_SIZE).data;

    const tensor = new ort.Tensor('float32', rgbaToNchw(imgData), [1, 3, EMBED_SIZE, EMBED_SIZE]);
    const out = await session.run({ input: tensor });
    const feat = (out['embedding']?.data ?? out[Object.keys(out)[0]].data) as Float32Array;

    const embedding = l2normalize(feat);
    const { idx, sim } = cosineSim(embedding, embedMat, dim);

    if (sim < SIMILARITY_THRESHOLD) {
      results.push({ icon: null, similarity: sim });
      continue;
    }

    const key = keys[idx];
    results.push({ icon: iconMap.get(key) ?? null, similarity: sim });
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

function cosineSim(query: Float32Array, mat: Float32Array, d: number): { idx: number; sim: number } {
  const n = mat.length / d;
  let bestIdx = -1,
    bestSim = -Infinity;
  for (let i = 0; i < n; i++) {
    let dot = 0;
    const offset = i * d;
    for (let k = 0; k < d; k++) dot += query[k] * mat[offset + k];
    if (dot > bestSim) {
      bestSim = dot;
      bestIdx = i;
    }
  }
  return { idx: bestIdx, sim: bestSim };
}
