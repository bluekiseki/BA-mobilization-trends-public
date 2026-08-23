import * as ort from 'onnxruntime-web';
import { initDetector } from './detector.client';
import { initClassifier, type EmbeddingsPayload } from './classifier.client';
import { initOCR } from './ocr.client';
import { loadIcons } from './iconLoader';
import type { IconEntry } from './types';
import { cdn } from '~/utils/cdn';

export interface ModelLoadMessages {
  loadingData: string;
  loadingCellDetector: string;
  loadingClassifier: string;
  loadingOcr: string;
  ready: string;
}

let loaded = false;
let loadedIcons: IconEntry[] = [];

export function getLoadedIcons(): IconEntry[] {
  return loadedIcons;
}

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

// Best-effort HTTP cache warm-up — failures here are harmless, onnxruntime-web's own internal
// fetch for the same URL just falls back to a normal network request.
function prefetch(url: string): void {
  void fetch(url, { cache: 'force-cache' }).catch(() => {});
}

export async function loadAllModels(onProgress: (step: string, percent: number) => void, onLog: (msg: string) => void, messages: ModelLoadMessages): Promise<void> {
  if (loaded) return;

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

  // The wasm filename isn't chosen at runtime — this bundle (dist/ort.bundle.min.mjs) always
  // references ort-wasm-simd-threaded.jsep.wasm, so prefetching it here is safe, not a guess.
  prefetch(cdn('/scanner/ort/ort-wasm-simd-threaded.jsep.mjs'));
  prefetch(cdn('/scanner/ort/ort-wasm-simd-threaded.jsep.wasm'));

  // InferenceSession.create() must stay sequential (WASM backend can't run two at once, see
  // classifier.client.ts), but fetching bytes has no such constraint — fetch all up front in
  // parallel and pass raw bytes to create() so each file downloads only once.
  onProgress(messages.loadingData, 0);
  onLog('Loading icon data…');
  const [{ icons }, cellDetectBytes, embedModelBytes, qtyModelBytes, embedResp] = await Promise.all([
    loadIcons(),
    fetchBytes(cdn('/scanner/models/cell_detect_v2.onnx')),
    fetchBytes(cdn('/scanner/models/embed_model.onnx')),
    fetchBytes(cdn('/scanner/models/qty_model.onnx')),
    fetchEmbeddings(cdn('/scanner/embeddings.json')),
  ]);
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
  onLog('All models loaded — ready to scan');
}
