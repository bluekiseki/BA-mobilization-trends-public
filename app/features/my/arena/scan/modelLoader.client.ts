import * as ort from 'onnxruntime-web';
import { cdn } from '~/utils/cdn';
import { fetchJsonWithProgress, fetchWithProgress } from '~/utils/fetchWithProgress';
import { createDownloadTracker } from '~/utils/downloadTracker';
import { createArenaModels, createRecognizer, type StudentRefsPayload } from './inference';
import type { ArenaModels, Recognizer } from './combatReport';

// Fallback sizes for progress when a response has no Content-Length.
const DOWNLOAD_ESTIMATES = { embedModel: 9_940_000, refs: 1_890_000, ocrModel: 21_300_000, chars: 75_000 } as const;
const KOREAN_DOWNLOAD_ESTIMATES = { koreanModel: 13_400_000, koreanChars: 47_000 } as const;

// Korean nicknames need a separate recognizer (the default charset has no Hangul); only the ko locale downloads it.
export const arenaDownloadMb = (korean: boolean) => (korean ? 47 : 33);

export interface ArenaLoadMessages {
  loadingData: string;
  loadingClassifier: string;
  loadingOcr: string;
  ready: string;
}

const modelsPromises = new Map<boolean, Promise<ArenaModels>>();

async function load(onProgress: (step: string, percent: number) => void, messages: ArenaLoadMessages, korean: boolean): Promise<ArenaModels> {
  // Shares the onnxruntime-web wasm binaries the item scanner already hosts.
  ort.env.wasm.wasmPaths = cdn('/scanner/ort/');
  ort.env.wasm.numThreads = 1;
  let providers: string[];
  try {
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    providers = adapter ? ['webgpu', 'wasm'] : ['wasm'];
  } catch {
    providers = ['wasm'];
  }

  onProgress(messages.loadingData, 0);
  const tracker = createDownloadTracker({ ...DOWNLOAD_ESTIMATES, ...(korean ? KOREAN_DOWNLOAD_ESTIMATES : {}) }, 0, 70, (percent) => onProgress(messages.loadingData, percent));
  const [embedBytes, refs, ocrBytes, charsBytes, korBytes, korChars] = await Promise.all([
    fetchWithProgress(cdn('/arena-scanner/models/student_embed.onnx'), tracker.report('embedModel')),
    fetchJsonWithProgress<StudentRefsPayload>(cdn('/arena-scanner/models/student_refs.json'), tracker.report('refs')),
    fetchWithProgress(cdn('/student-scanner/models/PP-OCRv6_rec_small.onnx'), tracker.report('ocrModel')),
    fetchWithProgress(cdn('/student-scanner/models/ppocr_chars.txt'), tracker.report('chars')),
    korean ? fetchWithProgress(cdn('/arena-scanner/models/korean_PP-OCRv5_mobile_rec.onnx'), tracker.report('koreanModel')) : null,
    korean ? fetchWithProgress(cdn('/arena-scanner/models/korean_dict.txt'), tracker.report('koreanChars')) : null,
  ]);

  // Sessions are created one after another: onnxruntime-web cannot initialize two at once.
  onProgress(messages.loadingClassifier, 70);
  const embed = await ort.InferenceSession.create(embedBytes, { executionProviders: providers, graphOptimizationLevel: 'all' });
  onProgress(messages.loadingOcr, 85);
  const ocr = await ort.InferenceSession.create(ocrBytes, { executionProviders: providers, graphOptimizationLevel: 'all' });
  const decodeChars = (bytes: Uint8Array) => new TextDecoder().decode(bytes).split(/\r?\n/);
  const nicknameRecognizers: Recognizer[] = [];
  if (korBytes && korChars) {
    const korOcr = await ort.InferenceSession.create(korBytes, { executionProviders: providers, graphOptimizationLevel: 'all' });
    nicknameRecognizers.push(createRecognizer(korOcr, decodeChars(korChars)));
  }
  onProgress(messages.ready, 100);
  return createArenaModels(embed, createRecognizer(ocr, decodeChars(charsBytes)), refs, nicknameRecognizers);
}

export function loadArenaModels(onProgress: (step: string, percent: number) => void, messages: ArenaLoadMessages, korean: boolean): Promise<ArenaModels> {
  let promise = modelsPromises.get(korean);
  if (!promise) {
    promise = load(onProgress, messages, korean).catch((error: unknown) => {
      modelsPromises.delete(korean);
      throw error;
    });
    modelsPromises.set(korean, promise);
  }
  return promise;
}

export async function decodeImageFile(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D canvas context not available');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

// Small WebP data URL of a region, used to keep an unreadable nickname for manual entry later.
export function regionToDataUrl(image: ImageData, x0: number, y0: number, x1: number, y1: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, x1 - x0);
  canvas.height = Math.max(1, y1 - y0);
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.putImageData(image, -x0, -y0, x0, y0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.8);
}
