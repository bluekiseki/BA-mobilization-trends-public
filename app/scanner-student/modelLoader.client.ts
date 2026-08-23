import * as ort from 'onnxruntime-web';
import { initClassifier, type EmbeddingsPayload } from '~/scanner/classifier.client';
import { loadIcons } from '~/scanner/iconLoader';
import { initOCR } from './pipeline/ocr';
import { loadPortraitHistograms } from './portraitLoader';
import { cdn } from '~/utils/cdn';

export interface ModelLoadMessages {
  loadingData: string;
  loadingClassifier: string;
  loadingOcr: string;
  ready: string;
}

let loaded = false;

export function isModelsLoaded(): boolean {
  return loaded;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const resp = await fetch(url);
  return new Uint8Array(await resp.arrayBuffer());
}

async function fetchEmbeddings(url: string): Promise<EmbeddingsPayload> {
  const resp = await fetch(url);
  return resp.json();
}

// Best-effort HTTP cache warm-up; failures are harmless since fetch/create() falls back to a
// normal request. Used for files that skip the "fetch bytes and pass through" treatment below.
function prefetch(url: string): void {
  void fetch(url, { cache: 'force-cache' }).catch(() => {});
}

export async function loadAllModels(onProgress: (step: string, percent: number) => void, onLog: (msg: string) => void, messages: ModelLoadMessages): Promise<void> {
  if (loaded) return;

  // Shares the same onnxruntime-web wasm binaries item scanner already hosts.
  ort.env.wasm.wasmPaths = cdn('/scanner/ort/');
  ort.env.wasm.numThreads = 1;

  let providers: string[];
  try {
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    providers = adapter ? ['webgpu', 'wasm'] : ['wasm'];
  } catch {
    providers = ['wasm'];
  }
  const backend = providers[0] === 'webgpu' ? 'WebGPU' : 'WASM';
  onLog(`Backend: ${backend}`);

  prefetch(cdn('/student-scanner/models/ppocr_chars.txt'));
  // ort's default export always resolves to dist/ort.bundle.min.mjs, which references exactly
  // one wasm binary (ort-wasm-simd-threaded.jsep.wasm) — verified in the package, not a guess.
  prefetch(cdn('/scanner/ort/ort-wasm-simd-threaded.jsep.mjs'));
  prefetch(cdn('/scanner/ort/ort-wasm-simd-threaded.jsep.wasm'));

  // Sessions must be sequential (onnxruntime-web limit), but fetch all data in parallel first, then pass raw bytes to create().
  onProgress(messages.loadingData, 0);
  onLog('Loading icon data…');
  onLog('Loading portrait reference data…');
  const [{ icons }, , embedModelBytes, ocrModelBytes, embedResp] = await Promise.all([
    loadIcons(),
    loadPortraitHistograms(),
    fetchBytes(cdn('/scanner/models/embed_model.onnx')),
    fetchBytes(cdn('/student-scanner/models/PP-OCRv6_rec_small.onnx')),
    fetchEmbeddings(cdn('/scanner/embeddings.json')),
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
