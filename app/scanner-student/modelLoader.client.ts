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

// Best-effort HTTP cache warm-up — failures here are harmless, the real fetch/create() calls
// just fall back to a normal network request. Used for files that don't get the "fetch bytes
// and pass through" treatment below (ppocr_chars.txt is tiny and only read lazily on the first
// scan — see pipeline/ocr.ts's getCharacters() — and the wasm runtime binary has no API to
// accept pre-fetched bytes).
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
  // The wasm runtime filename is NOT chosen at runtime based on `executionProviders` — this
  // project's `import * as ort from 'onnxruntime-web'` resolves (via the package's "default"
  // export condition, which Vite uses) to dist/ort.bundle.min.mjs, and that bundle references
  // exactly one wasm binary unconditionally: ort-wasm-simd-threaded.jsep.wasm (verified by
  // grepping the installed package). So prefetching this exact filename is safe, not a guess.
  prefetch(cdn('/scanner/ort/ort-wasm-simd-threaded.jsep.mjs'));
  prefetch(cdn('/scanner/ort/ort-wasm-simd-threaded.jsep.wasm'));

  // InferenceSession.create() calls below must stay sequential — onnxruntime-web's WASM
  // backend can't run two sessions at once (see classifier.client.ts) — but downloading the
  // bytes for each model/data file has no such constraint. Fetch all of them up front, in
  // parallel (alongside icons and portrait histograms, which are plain fetch + parse with no
  // session involved at all), and hand the raw bytes to InferenceSession.create() directly
  // instead of a URL — that way onnxruntime-web never issues its own second fetch for the
  // same file, so each one is downloaded exactly once instead of once here and again inside
  // create().
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

  // Equipment slot classification reuses item scanner's embedding classifier — equipment
  // pieces are already part of its inventory icon set (see pipeline/equipment.ts).
  // Classifier and OCR each create an onnxruntime-web session — the WASM backend can't run
  // two sessions at once (see classifier.client.ts), so these two must stay sequential.
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
