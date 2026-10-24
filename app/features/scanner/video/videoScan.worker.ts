import { detectCells } from '../item/detector.client';
import { classifyBatch } from '../core/classifier.client';
import { readQuantities } from '../item/ocr.client';
import { loadAllModels, isModelsLoaded, getRequestedProviders } from '../item/modelLoader.client';
import { scanVideoFile } from './decode';
import { UseCompatDecoderError } from './errors';
import { InventoryVideoScanner, type VideoScanDeps } from './scanner';
import type { VideoScanNotifier } from './types';
import type { WorkerRequest, WorkerResponse } from './protocol';

// Runs the video scan off the main thread. Models are loaded here too (from the HTTP cache) because ORT sessions can't be shared across threads.
// Four-cell batches reduced ONNX calls from 4708 to 1744 (21s clip) and 578 to 163 (7.4s clip).
// OCR and voting stay unchanged; repeated warm timings did not show a consistent total speedup.
const deps: VideoScanDeps = { detect: detectCells, classify: (source, boxes, onMetrics) => classifyBatch(source, boxes, onMetrics, 4), readQuantities };

let cancelled = false;
let compatScanner: InventoryVideoScanner | null = null;
let queue: Promise<void> = Promise.resolve();

const send = (message: WorkerResponse, transfer: Transferable[] = []): void => {
  self.postMessage(message, { transfer });
};

const checkCancelled = (): void => {
  if (cancelled) throw new DOMException('Scan cancelled.', 'AbortError');
};

const makeNotifier = (id: number): VideoScanNotifier => ({
  log: (message, level) => send({ id, event: 'log', message, level }),
  progress: (percent, step) => send({ id, event: 'progress', percent, step }),
  preview: (frame) => send({ id, event: 'preview', frame }, [frame.bitmap]),
});

const NO_MESSAGES = { loadingData: 'Loading data', loadingCellDetector: 'Loading cell detector', loadingClassifier: 'Loading classifier', loadingOcr: 'Loading quantity model', ready: 'Ready' };

async function handle(data: WorkerRequest): Promise<void> {
  const notify = makeNotifier(data.id);
  try {
    if (data.action === 'init') {
      cancelled = false;
      if (!isModelsLoaded())
        await loadAllModels(
          (step, percent) => notify.progress(percent, step),
          (message) => notify.log(message),
          NO_MESSAGES,
        );
      send({ id: data.id, result: null });
    } else if (data.action === 'video') {
      cancelled = false;
      const scanner = new InventoryVideoScanner(deps, notify, checkCancelled);
      const result = await scanVideoFile(data.file, scanner, notify, checkCancelled);
      result.metrics.requestedProviders = getRequestedProviders();
      send({ id: data.id, result });
    } else if (data.action === 'compat-start') {
      cancelled = false;
      compatScanner = new InventoryVideoScanner(deps, notify, checkCancelled);
      send({ id: data.id, result: null });
    } else if (data.action === 'compat-frame') {
      // The client posts frames without awaiting each one; the message queue below keeps them in arrival order.
      try {
        if (!compatScanner) throw new Error('No compat scan in progress.');
        await compatScanner.frame(data.bitmap, data.time, data.index);
      } catch (error) {
        // Later queued frames of a failed scan must not be analysed out of sequence; they fail fast instead.
        compatScanner = null;
        throw error;
      } finally {
        data.bitmap.close();
      }
      send({ id: data.id, result: null });
    } else if (data.action === 'compat-finish') {
      const scanner = compatScanner;
      compatScanner = null;
      if (!scanner) throw new Error('No compat scan in progress.');
      const result = scanner.finish(data.duration);
      result.metrics.requestedProviders = getRequestedProviders();
      send({ id: data.id, result });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    send({ id: data.id, error: { message: err.message, name: err.name, code: error instanceof UseCompatDecoderError ? error.code : (error as { code?: string }).code } });
  }
}

self.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
  // Cancel must bypass the queue so it can interrupt the scan that is currently running.
  if (e.data.action === 'cancel') {
    cancelled = true;
    return;
  }
  // Strictly sequential: compat frames and compat-finish run one at a time in arrival order. `handle` never rejects.
  queue = queue.then(() => handle(e.data));
});
