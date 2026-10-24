import * as ort from 'onnxruntime-web';
import type { FrameSource } from '../core/types';
import type { CellBbox } from '../core/geometry';

// Longest side of the model input. The model has dynamic H/W, so the short side is only padded up
// to the network stride instead of to a full square, which skips the letterbox bands entirely
// (a 2532x1170 frame runs at 640x320, half the work of 640x640) while keeping the 640 scale.
const INPUT_SIZE = 640;
const STRIDE = 32;
const CONF_THRESH = 0.25;
const IOU_THRESH = 0.45;

let session: ort.InferenceSession | null = null;

// modelBytes is fetched by modelLoader.client.ts up front; passing bytes directly avoids a redundant fetch by onnxruntime-web.
export async function initDetector(providers: string[], modelBytes: Uint8Array): Promise<void> {
  session = await ort.InferenceSession.create(modelBytes, {
    executionProviders: providers,
  });
}

export async function detectCells(bitmap: FrameSource): Promise<CellBbox[]> {
  if (!session) throw new Error('Detector not initialized');
  const { tensor, scale, padX, padY } = preprocess(bitmap);
  const results = await session.run({ images: tensor });
  const output = results['output0'];
  return postprocess(output.data as Float32Array, bitmap.width, bitmap.height, scale, padX, padY);
}

function preprocess(bitmap: FrameSource) {
  const W = bitmap.width;
  const H = bitmap.height;
  const fit = INPUT_SIZE / Math.max(W, H);
  const inW = Math.ceil((W * fit) / STRIDE) * STRIDE;
  const inH = Math.ceil((H * fit) / STRIDE) * STRIDE;
  const scale = Math.min(inW / W, inH / H);
  const newW = Math.round(W * scale);
  const newH = Math.round(H * scale);
  const padX = (inW - newW) / 2;
  const padY = (inH - newH) / 2;

  const canvas = new OffscreenCanvas(inW, inH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('canvas init fail');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, inW, inH);
  ctx.drawImage(bitmap, padX, padY, newW, newH);

  const { data } = ctx.getImageData(0, 0, inW, inH);
  const N = inW * inH;
  const buf = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    buf[i] = data[i * 4] / 255;
    buf[N + i] = data[i * 4 + 1] / 255;
    buf[2 * N + i] = data[i * 4 + 2] / 255;
  }

  return {
    tensor: new ort.Tensor('float32', buf, [1, 3, inH, inW]),
    scale,
    padX,
    padY,
  };
}

function postprocess(data: Float32Array, origW: number, origH: number, scale: number, padX: number, padY: number): CellBbox[] {
  const N = 300;
  const cols = 6;
  const candidates: (CellBbox & { score: number })[] = [];

  for (let i = 0; i < N; i++) {
    const off = i * cols;
    const score = data[off + 4];
    if (score < CONF_THRESH) continue;

    const x1 = (data[off] - padX) / scale;
    const y1 = (data[off + 1] - padY) / scale;
    const x2 = (data[off + 2] - padX) / scale;
    const y2 = (data[off + 3] - padY) / scale;

    const x = Math.max(0, x1);
    const y = Math.max(0, y1);
    const w = Math.min(origW, x2) - x;
    const h = Math.min(origH, y2) - y;

    const ratio = w / h;
    if (ratio < 1.15 || ratio > 1.45) continue;

    candidates.push({ x, y, w, h, score });
  }

  return nms(candidates);
}

function nms(cells: (CellBbox & { score: number })[]): CellBbox[] {
  cells.sort((a, b) => b.score - a.score);
  const suppressed = new Uint8Array(cells.length);
  const keep: CellBbox[] = [];

  for (let i = 0; i < cells.length; i++) {
    if (suppressed[i]) continue;
    keep.push({ x: cells[i].x, y: cells[i].y, w: cells[i].w, h: cells[i].h });
    for (let j = i + 1; j < cells.length; j++) {
      if (!suppressed[j] && iou(cells[i], cells[j]) > IOU_THRESH) suppressed[j] = 1;
    }
  }
  return keep;
}

function iou(a: CellBbox & { score: number }, b: CellBbox & { score: number }): number {
  const ax2 = a.x + a.w,
    ay2 = a.y + a.h;
  const bx2 = b.x + b.w,
    by2 = b.y + b.h;
  const ix1 = Math.max(a.x, b.x),
    iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2),
    iy2 = Math.min(ay2, by2);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  return inter / (a.w * a.h + b.w * b.h - inter);
}
