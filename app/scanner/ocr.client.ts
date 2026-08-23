import * as ort from 'onnxruntime-web';
import type { CellBbox } from './types';

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

export async function readQuantity(bitmap: ImageBitmap, cell: CellBbox): Promise<string | null> {
  if (!session) return null;

  const { x, y, w, h } = cell;
  const sx1 = x + Math.round(w * 0.35);
  const sx2 = x + Math.round(w * 0.85);
  const stripY = Math.round(y + h - h * 0.28);
  const stripH = Math.round(h * (0.28 - 0.03));

  if (sx2 > bitmap.width || stripY + stripH > bitmap.height || sx1 < 0 || stripY < 0) return null;

  const canvas = new OffscreenCanvas(IMG_W, IMG_H);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, sx1, stripY, sx2 - sx1, stripH, 0, 0, IMG_W, IMG_H);

  const imgData = ctx.getImageData(0, 0, IMG_W, IMG_H).data;
  const input = rgbaToGray(imgData);

  const tensor = new ort.Tensor('float32', input, [1, 1, IMG_H, IMG_W]);
  const out = await session.run({ input: tensor });
  const logProbs = out['log_probs'];
  return ctcGreedyDecode(logProbs.data as Float32Array, logProbs.dims as number[]);
}

export function parseQtyString(raw: string | null): number {
  if (!raw) return 0;
  const m = raw.match(/x(\d+)(K?)/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return m[2] === 'K' ? n * 1000 : n;
}

function rgbaToGray(data: Uint8ClampedArray): Float32Array {
  const n = IMG_H * IMG_W;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  }
  return out;
}

function ctcGreedyDecode(logProbs: Float32Array, dims: number[]): string | null {
  const [T, , C] = dims;
  let prev = -1;
  let text = '';
  for (let t = 0; t < T; t++) {
    const offset = t * C;
    let bestIdx = 0,
      bestVal = -Infinity;
    for (let c = 0; c < C; c++) {
      if (logProbs[offset + c] > bestVal) {
        bestVal = logProbs[offset + c];
        bestIdx = c;
      }
    }
    if (bestIdx !== prev && bestIdx !== 0) text += CHARS[bestIdx];
    prev = bestIdx;
  }
  const m = text.match(/x\d+K?/);
  return m ? m[0] : null;
}
