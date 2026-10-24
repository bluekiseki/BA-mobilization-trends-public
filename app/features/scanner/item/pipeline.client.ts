import { detectCells } from './detector.client';
import { classifyBatch } from '../core/classifier.client';
import { readQuantity, parseQtyString } from './ocr.client';
import { scanVideo } from '../video/client';
import type { ImageScanResult, ScanEntry, ScanResult, VideoScanResult } from '../core/types';
import type { CellBbox } from '../core/geometry';
import type { PreviewFrame } from '../video/types';
import { loadAllModels, type ModelLoadMessages } from './modelLoader.client';
import { loadIcons } from '../core/iconLoader';

export interface PipelineCallbacks {
  compatPlaybackLabel?: string;
  webCodecsLabel?: string;
  onCompatPlayback?: () => void;
  onLog: (msg: string, level?: 'info' | 'warn' | 'error') => void;
  onProgress: (step: string, percent: number) => void;
  /** Video scans only: raw per-keyframe recognition for the live preview. The receiver owns `frame.bitmap`. */
  onPreview?: (frame: PreviewFrame) => void;
  signal?: AbortSignal;
  modelMessages?: ModelLoadMessages;
}

const DEFAULT_MODEL_MESSAGES: ModelLoadMessages = {
  loadingData: 'Loading data',
  loadingCellDetector: 'Loading cell detector',
  loadingClassifier: 'Loading classifier',
  loadingOcr: 'Loading quantity model',
  ready: 'Ready',
};

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Scan cancelled.', 'AbortError');
}

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|avi)$/i;

/** True for video files, including containers the browser reports with an empty MIME type (e.g. .mkv). */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || (file.type === '' && VIDEO_EXTENSIONS.test(file.name));
}

export function processFile(file: File, cb: PipelineCallbacks): Promise<ScanEntry> {
  return isVideoFile(file) ? processVideo(file, cb) : processImage(file, cb);
}

async function processVideo(file: File, cb: PipelineCallbacks): Promise<VideoScanResult> {
  const { onLog, onProgress } = cb;
  onLog(`Processing video ${file.name}…`);
  onProgress('Loading video scanner…', 0);

  const output = await scanVideo(file, {
    onLog,
    onProgress,
    onPreview: cb.onPreview,
    signal: cb.signal,
    compatPlaybackLabel: cb.compatPlaybackLabel,
    webCodecsLabel: cb.webCodecsLabel,
    onCompatPlayback: cb.onCompatPlayback,
  });

  const { iconMap: icons } = await loadIcons();
  checkCancelled(cb.signal);
  const results: ScanResult[] = output.results.map((r) => {
    // Position in scroll space keeps reading order stable even though each frame shows only part of the inventory.
    const cell: CellBbox = { x: r.box.x, y: r.scrollY, w: r.box.w, h: r.box.h };
    return {
      cell,
      icon: r.key ? (icons.get(r.key) ?? null) : null,
      similarity: r.similarity,
      quantity: r.quantity ?? 0,
      quantityConfidence: r.ocrConfidence,
      cellId: r.cellId,
      videoStatus: r.status,
    };
  });
  onProgress('Done', 100);
  onLog(`Done: ${results.filter((r) => r.icon).length}/${results.length} recognized (${output.metrics.confirmed} confirmed across frames)`);

  const { replayFrames, trace, width, height, duration } = output;
  return {
    kind: 'video',
    id: crypto.randomUUID(),
    fileName: file.name,
    objectUrl: URL.createObjectURL(file),
    results,
    video: { replayFrames, trace, width, height, duration },
    metrics: output.metrics,
  };
}

async function processImage(file: File, cb: PipelineCallbacks): Promise<ImageScanResult> {
  const { onLog, onProgress } = cb;

  onLog(`Processing ${file.name}…`);
  checkCancelled(cb.signal);
  await loadAllModels((step, percent) => onProgress(step, Math.round(percent * 0.15)), onLog, cb.modelMessages ?? DEFAULT_MODEL_MESSAGES);
  checkCancelled(cb.signal);
  onProgress('Decoding image…', 15);

  const objectUrl = URL.createObjectURL(file);
  const bitmap = await createImageBitmap(file);
  onLog(`Image size: ${bitmap.width}×${bitmap.height}`);

  onProgress('Detecting cells…', 20);
  const cells = await detectCells(bitmap);
  onLog(`Detected ${cells.length} cells`);

  onProgress('Classifying icons…', 50);
  const classifications = await classifyBatch(bitmap, cells);

  onProgress('Reading quantities…', 75);
  const results: ScanResult[] = [];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const { icon, similarity } = classifications[i];

    const { text: rawQty, confidence: quantityConfidence } = await readQuantity(bitmap, cell);
    const quantity = parseQtyString(rawQty);

    if (icon) {
      onLog(`  ${icon.name}: qty=${quantity} (sim=${similarity.toFixed(3)}, qtyConf=${quantityConfidence.toFixed(3)})`);
    } else {
      onLog(`  [unknown] sim=${similarity.toFixed(3)}`, 'warn');
    }

    results.push({ cell, icon, similarity, quantity, quantityConfidence });
  }

  bitmap.close();
  onProgress('Done', 100);
  onLog(`Done: ${results.filter((r) => r.icon).length}/${results.length} recognized`);

  return { kind: 'image', id: crypto.randomUUID(), fileName: file.name, objectUrl, results };
}
