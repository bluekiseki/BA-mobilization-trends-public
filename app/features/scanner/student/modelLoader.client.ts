import * as ort from 'onnxruntime-web';
import { initClassifier, type EmbeddingsPayload } from '~/features/scanner/core/classifier.client';
import { loadIcons } from '~/features/scanner/core/iconLoader';
import { initOCR } from './pipeline/ocr';
import { loadPortraitHistograms } from './portraitLoader';
import { loadTacticRoleTemplates } from './pipeline/tactic-role';
import { cdn } from '~/utils/cdn';
import { fetchWithProgress, fetchJsonWithProgress } from '~/utils/fetchWithProgress';
import { createDownloadTracker } from '~/utils/downloadTracker';
import { threadedWasmPaths } from '~/features/scanner/core/ortWasm.client';
import { pickStudentThreadCount } from './threadCount';

// Approximate decompressed sizes of the parallel downloads, used only as a fallback when a
// response has no Content-Length so the progress bar still advances.
const DOWNLOAD_ESTIMATES = {
  icons: 6_700_000,
  portraitHistograms: 4_400_000,
  roleTemplates: 20_000,
  embedModel: 10_000_000,
  ocrModel: 21_300_000,
  embeddings: 5_700_000,
} as const;

export interface ModelLoadMessages {
  loadingData: string;
  loadingClassifier: string;
  loadingOcr: string;
  ready: string;
}

let loaded = false;
let loadingPromise: Promise<void> | null = null;

export function isModelsLoaded(): boolean {
  return loaded;
}

// Best-effort HTTP cache warm-up; failures are harmless since fetch/create() falls back to a
// normal request. Used for files that skip the "fetch bytes and pass through" treatment below.
function prefetch(url: string): void {
  void fetch(url, { cache: 'force-cache' }).catch(() => {});
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
  // Shares the same onnxruntime-web wasm binaries item scanner already hosts.
  const requestedThreads = pickStudentThreadCount();
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
  const backend = providers[0] === 'webgpu' ? 'WebGPU' : 'WASM';
  onLog(`Backend: ${backend}`);
  onLog(`WASM threads: ${ort.env.wasm.numThreads}`);

  prefetch(cdn('/student-scanner/models/ppocr_chars.txt'));
  // ort's default export always resolves to dist/ort.bundle.min.mjs, which references exactly
  // one wasm binary (ort-wasm-simd-threaded.jsep.wasm) — verified in the package, not a guess.
  prefetch(cdn('/scanner/ort/ort-wasm-simd-threaded.jsep.mjs'));
  prefetch(cdn('/scanner/ort/ort-wasm-simd-threaded.jsep.wasm'));

  // Sessions must be sequential (onnxruntime-web limit), but fetch all data in parallel first, then pass raw bytes to create().
  onProgress(messages.loadingData, 0);
  onLog('Loading icon data…');
  onLog('Loading portrait reference data…');
  // Streams every parallel download and maps their combined byte progress into the 0-30% band,
  // so the bar rises steadily instead of sitting at 0 until ~45 MB has finished.
  const tracker = createDownloadTracker(DOWNLOAD_ESTIMATES, 0, 30, (percent) => onProgress(messages.loadingData, percent));
  const [{ icons }, , , embedModelBytes, ocrModelBytes, embedResp] = await Promise.all([
    loadIcons(tracker.report('icons')),
    loadPortraitHistograms(tracker.report('portraitHistograms')),
    loadTacticRoleTemplates(tracker.report('roleTemplates')),
    fetchWithProgress(cdn('/scanner/models/embed_model.onnx'), tracker.report('embedModel')),
    fetchWithProgress(cdn('/student-scanner/models/PP-OCRv6_rec_small.onnx'), tracker.report('ocrModel')),
    fetchJsonWithProgress<EmbeddingsPayload>(cdn('/scanner/embeddings.json'), tracker.report('embeddings')),
  ]);
  onLog(`Loaded ${icons.length} icons`);
  onLog('Portrait reference data ready');

  // Reuses item scanner's embedding classifier for equipment slots. Classifier and OCR each
  // create an onnxruntime-web session, and WASM can't run two at once, so they stay sequential.
  onProgress(messages.loadingClassifier, 30);
  onLog('Loading equipment classifier…');
  await initClassifier(providers, icons, onLog, embedModelBytes, embedResp, (done, total) => onProgress(messages.loadingClassifier, 30 + Math.round((done / total) * 40)));
  onLog('Equipment classifier ready');

  onProgress(messages.loadingOcr, 70);
  onLog('Loading text recognition model…');
  await initOCR(providers, ocrModelBytes);
  onLog('OCR model ready');

  loaded = true;
  onProgress(messages.ready, 100);
  onLog('All models loaded — ready to scan');
}
