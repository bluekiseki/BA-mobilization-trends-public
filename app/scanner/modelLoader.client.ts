import * as ort from 'onnxruntime-web';
import { initDetector } from './detector.client';
import { initClassifier } from './classifier.client';
import { initOCR } from './ocr.client';
import { loadIcons } from './iconLoader';
import type { IconEntry } from './types';
import { cdn } from '~/utils/cdn';

let loaded = false;
let loadedIcons: IconEntry[] = [];

export function getLoadedIcons(): IconEntry[] {
  return loadedIcons;
}

export function isModelsLoaded(): boolean {
  return loaded;
}

export async function loadAllModels(onProgress: (step: string, percent: number) => void, onLog: (msg: string) => void): Promise<void> {
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

  onProgress('Loading icon data…', 0);
  onLog('Loading icon data…');
  const { icons } = await loadIcons();
  loadedIcons = icons;
  onLog(`Loaded ${icons.length} icons`);

  onProgress('Loading cell detector…', 20);
  onLog('Loading cell detector (YOLO)…');
  await initDetector(providers);
  onLog('Cell detector ready');

  onProgress('Loading classifier…', 50);
  onLog('Loading embedding classifier…');
  await initClassifier(providers, icons, onLog);
  onLog('Classifier ready');

  onProgress('Loading OCR model…', 80);
  onLog('Loading quantity OCR model…');
  await initOCR();
  onLog('OCR model ready');

  loaded = true;
  onProgress('Ready', 100);
  onLog('All models loaded — ready to scan');
}
