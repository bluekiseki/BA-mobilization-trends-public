// ONNX inference for the arena parser: ArcFace student icon embedder + PP-OCR recognizers.
// Preprocessing: bilinear resize; embedder RGB + ImageNet norm; OCR BGR + [-1, 1].
import * as ort from 'onnxruntime-web';
import { resizeBilinear, roundHalfEven, type Pixels } from './image';
import type { ArenaModels, OcrResult, Recognizer } from './combatReport';

const EMBED_SIZE = 160;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const OCR_HEIGHT = 48;

export interface StudentRefsPayload {
  dim: number;
  sids: number[];
  data: string; // base64 float32, row-major [sids.length x dim], rows L2-normalized
}

function decodeRefs(payload: StudentRefsPayload): Float32Array {
  const bin = atob(payload.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

// One PP-OCR CTC recognizer (the default model, or the Korean one used for nicknames on the ko locale).
export function createRecognizer(session: ort.InferenceSession, chars: string[]): Recognizer {
  const characters = ['blank', ...chars, ' '];
  const digitClasses = [0, ...characters.flatMap((c, i) => (/^[0-9]$/.test(c) ? [i] : []))];
  return async (crop: Pixels, digitsOnly: boolean): Promise<OcrResult> => {
    if (!crop.width || !crop.height) return { text: '', conf: 0, ends: [] };
    const width = Math.max(8, roundHalfEven((OCR_HEIGHT * crop.width) / crop.height));
    const r = resizeBilinear(crop, width, OCR_HEIGHT).data;
    const plane = width * OCR_HEIGHT;
    const input = new Float32Array(3 * plane);
    // PaddleOCR expects BGR channel order.
    for (let p = 0; p < plane; p += 1) for (let ch = 0; ch < 3; ch += 1) input[ch * plane + p] = (r[p * 4 + (2 - ch)] / 255 - 0.5) / 0.5;
    const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, OCR_HEIGHT, width]) });
    const tensor = out[session.outputNames[0]];
    const [, steps, classes] = tensor.dims.map(Number);
    const values = tensor.data as Float32Array;
    const step = crop.width / steps;
    let text = '';
    const probs: number[] = [];
    const ends: number[] = [];
    let previous = -1;
    for (let t = 0; t < steps; t += 1) {
      const offset = t * classes;
      // Constrained CTC decode: argmax only over allowed classes (blank + digits for damage labels).
      let best = 0;
      if (digitsOnly) {
        for (const c of digitClasses) if (values[offset + c] > values[offset + best]) best = c;
      } else {
        for (let c = 1; c < classes; c += 1) if (values[offset + c] > values[offset + best]) best = c;
      }
      if (best !== 0 && best !== previous) {
        text += characters[best] ?? '';
        probs.push(values[offset + best]);
        ends.push((t + 1) * step);
      } else if (best !== 0) {
        ends[ends.length - 1] = (t + 1) * step;
      }
      previous = best;
    }
    const conf = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : 0;
    return { text, conf, ends };
  };
}

export function createArenaModels(embedSession: ort.InferenceSession, recognize: Recognizer, refsPayload: StudentRefsPayload, nicknameRecognizers: Recognizer[] = []): ArenaModels {
  const refs = decodeRefs(refsPayload);
  const { dim, sids } = refsPayload;

  const similarity = async (crops: Pixels[]): Promise<Float32Array[]> => {
    if (!crops.length) return [];
    const plane = EMBED_SIZE * EMBED_SIZE;
    const input = new Float32Array(crops.length * 3 * plane);
    crops.forEach((c, n) => {
      const r = resizeBilinear(c, EMBED_SIZE, EMBED_SIZE).data;
      for (let p = 0; p < plane; p += 1) for (let ch = 0; ch < 3; ch += 1) input[(n * 3 + ch) * plane + p] = (r[p * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
    });
    const out = await embedSession.run({ [embedSession.inputNames[0]]: new ort.Tensor('float32', input, [crops.length, 3, EMBED_SIZE, EMBED_SIZE]) });
    const feats = out[embedSession.outputNames[0]].data as Float32Array;
    return crops.map((_, n) => {
      const f = feats.subarray(n * dim, (n + 1) * dim);
      let norm = 0;
      for (let i = 0; i < dim; i += 1) norm += f[i] * f[i];
      norm = Math.sqrt(norm) || 1;
      const row = new Float32Array(sids.length);
      for (let j = 0; j < sids.length; j += 1) {
        let dot = 0;
        const base = j * dim;
        for (let i = 0; i < dim; i += 1) dot += f[i] * refs[base + i];
        row[j] = dot / norm;
      }
      return row;
    });
  };

  return { sids, similarity, recognize, nicknameRecognizers };
}
