import * as ort from 'onnxruntime-web';
import type { FrameSource } from '../core/types';
import type { CellBbox } from '../core/geometry';

const IMG_H = 32;
const IMG_W = 128;
const CHARS = ['', 'x', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'K'];

let session: ort.InferenceSession | null = null;

// modelBytes is fetched by modelLoader.client.ts up front; passing bytes directly avoids a redundant fetch by onnxruntime-web.
export async function initOCR(modelBytes: Uint8Array): Promise<void> {
  session = await ort.InferenceSession.create(modelBytes, {
    executionProviders: ['wasm'], // OCR is lightweight; always use WASM
  });
}

export interface QuantityReading {
  text: string | null;
  confidence: number; // average decoded-character probability from the CTC output, 0 when nothing was read
}

const EMPTY_READING: QuantityReading = { text: null, confidence: 0 };

export async function readQuantity(bitmap: FrameSource, cell: CellBbox): Promise<QuantityReading> {
  return (await readQuantities(bitmap, [cell]))[0];
}

// Reads several cells of one frame in batches; cells whose quantity strip falls outside the frame yield an empty reading.
export async function readQuantities(bitmap: FrameSource, cells: CellBbox[], batchSize = 32): Promise<QuantityReading[]> {
  const results: QuantityReading[] = cells.map(() => EMPTY_READING);
  if (!session || cells.length === 0) return results;

  const canvas = new OffscreenCanvas(IMG_W, IMG_H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return results;

  for (let start = 0; start < cells.length; start += batchSize) {
    const valid: Array<{ index: number; gray: Float32Array }> = [];
    for (let i = start; i < Math.min(cells.length, start + batchSize); i++) {
      const { x, y, w, h } = cells[i];
      const sx1 = x + Math.round(w * 0.35);
      const sx2 = x + Math.round(w * 0.85);
      const stripY = Math.round(y + h - h * 0.28);
      const stripH = Math.round(h * (0.28 - 0.03));
      if (sx2 > bitmap.width || stripY + stripH > bitmap.height || sx1 < 0 || stripY < 0 || stripH < 1) continue;
      ctx.clearRect(0, 0, IMG_W, IMG_H);
      ctx.drawImage(bitmap, sx1, stripY, sx2 - sx1, stripH, 0, 0, IMG_W, IMG_H);
      valid.push({ index: i, gray: rgbaToGray(ctx.getImageData(0, 0, IMG_W, IMG_H).data) });
    }
    if (valid.length === 0) continue;

    const input = new Float32Array(valid.length * IMG_W * IMG_H);
    valid.forEach((v, i) => input.set(v.gray, i * IMG_W * IMG_H));
    const tensor = new ort.Tensor('float32', input, [valid.length, 1, IMG_H, IMG_W]);
    const out = await session.run({ input: tensor });
    const logProbs = out['log_probs'];
    valid.forEach((v, i) => {
      results[v.index] = ctcGreedyDecode(logProbs.data as Float32Array, logProbs.dims as number[], i);
    });
    tensor.dispose();
    Object.values(out).forEach((value) => value.dispose());
  }
  return results;
}

export function parseQtyString(raw: string | null): number {
  if (!raw) return 0;
  const m = raw.match(/x(\d+)(K?)/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return m[2] === 'K' ? n * 1000 : n;
}

function meanConfidence(logProbs: number[]): number {
  if (logProbs.length === 0) return 0;
  const avgLogProb = logProbs.reduce((sum, v) => sum + v, 0) / logProbs.length;
  return Math.exp(avgLogProb);
}

function rgbaToGray(data: Uint8ClampedArray): Float32Array {
  const n = IMG_H * IMG_W;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  }
  return out;
}

// logProbs is laid out [T, batch, C]; batchIndex picks one sample out of the batch.
function ctcGreedyDecode(logProbs: Float32Array, dims: number[], batchIndex: number): QuantityReading {
  const [T, B, C] = dims;
  let prev = -1;
  let text = '';
  const keptLogProbs: number[] = [];
  for (let t = 0; t < T; t++) {
    const offset = (t * B + batchIndex) * C;
    let bestIdx = 0,
      bestVal = -Infinity;
    for (let c = 0; c < C; c++) {
      if (logProbs[offset + c] > bestVal) {
        bestVal = logProbs[offset + c];
        bestIdx = c;
      }
    }
    if (bestIdx !== prev && bestIdx !== 0) {
      text += CHARS[bestIdx];
      keptLogProbs.push(bestVal);
    }
    prev = bestIdx;
  }
  const m = text.match(/x\d+K?/);
  if (!m) return EMPTY_READING;
  return { text: m[0], confidence: meanConfidence(keptLogProbs) };
}
