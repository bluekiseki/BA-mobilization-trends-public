import * as ort from 'onnxruntime-web';
import { threadedWasmPaths } from '../core/ortWasm.client';
import { initDetector } from './detector.client';
import { initClassifier, type EmbeddingsPayload } from '../core/classifier.client';
import { initOCR } from './ocr.client';
import { loadIcons } from '../core/iconLoader';
import type { IconEntry } from '../core/types';
import { cdn } from '~/utils/cdn';
import { fetchWithProgress, fetchJsonWithProgress } from '../../../utils/fetchWithProgress';
import { createDownloadTracker } from '../../../utils/downloadTracker';

export interface ModelLoadMessages {
  loadingData: string;
  loadingCellDetector: string;
  loadingClassifier: string;
  loadingOcr: string;
  ready: string;
}

// Approximate decompressed sizes of the parallel downloads, used only as a fallback when a
// response has no Content-Length so the progress bar still advances.
const DOWNLOAD_ESTIMATES = {
  icons: 6_700_000,
  cellDetect: 9_800_000,
  embedModel: 10_000_000,
  qtyModel: 2_400_000,
  embeddings: 5_700_000,
} as const;

let loaded = false;
let loadedIcons: IconEntry[] = [];
let loadingPromise: Promise<void> | null = null;
let requestedProviders: string[] = [];

export function getRequestedProviders(): string[] {
  return [...requestedProviders];
}

export function getLoadedIcons(): IconEntry[] {
  return loadedIcons;
}

export function isModelsLoaded(): boolean {
  return loaded;
}

// Best-effort HTTP cache warm-up — failures here are harmless, onnxruntime-web's own internal
// fetch for the same URL just falls back to a normal network request.
function prefetch(url: string): void {
  void fetch(url, { cache: 'force-cache' }).catch(() => {});
}

// Upper bound for onnxruntime-web's WASM thread pool. Chosen from the item-scanner scaling curve;
// one core is left free for the video decoder worker and the main thread.
const MAX_ORT_THREADS = 4;

// Multithreaded WASM needs SharedArrayBuffer, which only exists in a cross-origin isolated
// context (see the COOP/COEP headers on routes/planner/ItemScanner.tsx). Works in workers too.
export function pickOrtThreadCount(): number {
  if (typeof crossOriginIsolated === 'undefined' || !crossOriginIsolated) return 1;
  const cores = navigator.hardwareConcurrency || 1;
  return Math.max(1, Math.min(MAX_ORT_THREADS, cores - 1));
}

export function loadAllModels(onProgress: (step: string, percent: number) => void, onLog: (msg: string) => void, messages: ModelLoadMessages): Promise<void> {
  if (loaded) return Promise.resolve();
  loadingPromise ??= initializeModels(onProgress, onLog, messages).catch((error: unknown) => {
    loadingPromise = null;
    throw error;
  });
  return loadingPromise;
}

async function initializeModels(onProgress: (step: string, percent: number) => void, onLog: (msg: string) => void, messages: ModelLoadMessages): Promise<void> {
  const started = performance.now();

  const requestedThreads = pickOrtThreadCount();
  const threadedPaths = requestedThreads > 1 ? await threadedWasmPaths() : null;
  ort.env.wasm.numThreads = threadedPaths ? requestedThreads : 1;
  ort.env.wasm.wasmPaths = threadedPaths ?? cdn('/scanner/ort/');

  let providers: string[];
  try {
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    providers = adapter ? ['webgpu', 'wasm'] : ['wasm'];
  } catch {
    providers = ['wasm'];
  }
  requestedProviders = providers;
  onLog(`Requested execution providers: ${providers.join(', ')} (OCR: wasm)`);
  onLog(`WASM threads: ${ort.env.wasm.numThreads}`);

  // The wasm filename isn't chosen at runtime — this bundle (dist/ort.bundle.min.mjs) always
  // references ort-wasm-simd-threaded.jsep.wasm, so prefetching it here is safe, not a guess.
  prefetch(cdn('/scanner/ort/ort-wasm-simd-threaded.jsep.mjs'));
  prefetch(cdn('/scanner/ort/ort-wasm-simd-threaded.jsep.wasm'));

  // InferenceSession.create() must stay sequential (WASM backend can't run two at once, see
  // classifier.client.ts), but fetching bytes has no such constraint — fetch all up front in
  // parallel and pass raw bytes to create() so each file downloads only once.
  onProgress(messages.loadingData, 0);
  onLog('Loading icon data…');
  // Streams every parallel download and maps their combined byte progress into the 0-20% band,
  // so the bar rises steadily instead of sitting at 0 until every file has finished.
  const tracker = createDownloadTracker(DOWNLOAD_ESTIMATES, 0, 20, (percent) => onProgress(messages.loadingData, percent));
  const [{ icons }, cellDetectBytes, embedModelBytes, qtyModelBytes, embedResp] = await Promise.all([
    loadIcons(tracker.report('icons')),
    fetchWithProgress(cdn('/scanner/models/cell_detect_v2_rect.onnx'), tracker.report('cellDetect')),
    fetchWithProgress(cdn('/scanner/models/embed_model.onnx'), tracker.report('embedModel')),
    fetchWithProgress(cdn('/scanner/models/qty_model_v2.onnx'), tracker.report('qtyModel')),
    fetchJsonWithProgress<EmbeddingsPayload>(cdn('/scanner/embeddings.json'), tracker.report('embeddings')),
  ]);
  tracker.settle('icons');
  loadedIcons = icons;
  onLog(`Loaded ${icons.length} icons`);

  onProgress(messages.loadingCellDetector, 20);
  onLog('Loading cell detector (YOLO)…');
  await initDetector(providers, cellDetectBytes);
  onLog('Cell detector ready');

  onProgress(messages.loadingClassifier, 50);
  onLog('Loading embedding classifier…');
  await initClassifier(providers, icons, onLog, embedModelBytes, embedResp, (done, total) => onProgress(messages.loadingClassifier, 50 + Math.round((done / total) * 30)));
  onLog('Classifier ready');

  onProgress(messages.loadingOcr, 80);
  onLog('Loading quantity OCR model…');
  await initOCR(qtyModelBytes);
  onLog('OCR model ready');

  loaded = true;
  onProgress(messages.ready, 100);
  onLog(`All models loaded — ready to scan (${Math.round(performance.now() - started)}ms)`);
}
