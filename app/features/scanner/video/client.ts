import { MAX_VIDEO_DURATION_SECONDS, VideoTooLongError, VideoUnsupportedError } from './errors';
import { capturePlayback, FramePipeline } from './playbackCapture';
import type { WorkerRequest, WorkerResponse } from './protocol';
import type { PreviewFrame, VideoLogLevel, VideoScanOutput } from './types';

export interface VideoScanCallbacks {
  compatPlaybackLabel?: string;
  webCodecsLabel?: string;
  onCompatPlayback?: () => void;
  onLog: (message: string, level?: VideoLogLevel) => void;
  onProgress: (step: string, percent: number) => void;
  onPreview?: (frame: PreviewFrame) => void;
  signal?: AbortSignal;
}

/**
 * Captured frames that may wait for worker analysis while playback continues. Each holds a full-resolution bitmap
 * (about 8 MB at 1080x1920), so this bounds the extra memory to roughly that times the limit.
 */
export const MAX_COMPAT_FRAMES_IN_FLIGHT = 8;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type RequestBody = DistributiveOmit<WorkerRequest, 'id'>;

interface Pending {
  resolve: (value: VideoScanOutput | null) => void;
  reject: (error: Error) => void;
  callbacks: VideoScanCallbacks;
}

let worker: Worker | null = null;
let nextId = 1;
let modelsReady: Promise<void> | null = null;
let modelsInitialized = false;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL('./videoScan.worker.ts', import.meta.url), { type: 'module' });
  created.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
    const message = e.data;
    const entry = pending.get(message.id);
    if (!entry) {
      if ('frame' in message) message.frame.bitmap.close();
      return;
    }
    if ('event' in message) {
      if (message.event === 'log') entry.callbacks.onLog(message.message, message.level);
      else if (message.event === 'progress') entry.callbacks.onProgress(message.step, message.percent);
      else if (entry.callbacks.onPreview) entry.callbacks.onPreview(message.frame);
      else message.frame.bitmap.close();
      return;
    }
    pending.delete(message.id);
    if ('error' in message) entry.reject(Object.assign(new Error(message.error.message), { name: message.error.name, code: message.error.code }));
    else entry.resolve(message.result);
  });
  created.addEventListener('error', (e) => {
    for (const entry of pending.values()) entry.reject(new Error(e.message || 'Video worker crashed'));
    pending.clear();
    worker = null;
    modelsReady = null;
    modelsInitialized = false;
  });
  worker = created;
  return created;
}

function call(body: RequestBody, callbacks: VideoScanCallbacks, transfer: Transferable[] = []): Promise<VideoScanOutput | null> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, callbacks });
    // The union is narrowed by `action`; the id is attached here once for every request kind.
    getWorker().postMessage({ ...body, id }, { transfer });
  });
}

/** Loads the models inside the worker once; later scans reuse them. */
function ensureModels(callbacks: VideoScanCallbacks): Promise<void> {
  modelsReady ??= call({ action: 'init' }, callbacks)
    .then(() => {
      modelsInitialized = true;
    })
    .catch((error: unknown) => {
      modelsReady = null;
      throw error;
    });
  return modelsReady;
}

export function isUseCompatError(error: unknown): boolean {
  return error instanceof Error && (error as { code?: string }).code === 'USE_COMPAT';
}

/**
 * Copies the frame as displayed. `createImageBitmap(video)` can return the unrotated coded frame for phone recordings
 * with rotation metadata, while drawing the element onto a canvas applies the same rotation the player shows.
 */
async function captureDisplayedFrame(video: HTMLVideoElement, canvas: OffscreenCanvas): Promise<ImageBitmap> {
  if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
  if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return createImageBitmap(canvas);
}

async function scanByPlayback(file: File, callbacks: VideoScanCallbacks): Promise<VideoScanOutput> {
  if (typeof HTMLVideoElement === 'undefined' || !('requestVideoFrameCallback' in HTMLVideoElement.prototype)) {
    throw new VideoUnsupportedError('This browser cannot decode or play the video for scanning.');
  }
  callbacks.onLog('Fast decoding is unavailable; scanning by real-time playback. This is slower and may reduce recognition accuracy when frames are skipped.', 'warn');
  callbacks.onCompatPlayback?.();
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const url = URL.createObjectURL(file);
  let duration = 0;
  const canvas = new OffscreenCanvas(1, 1);
  let captureMs = 0;
  let playbackWaitMs = 0;
  const pipeline = new FramePipeline(MAX_COMPAT_FRAMES_IN_FLIGHT, callbacks.signal);
  try {
    await call({ action: 'compat-start' }, callbacks);
    let waitStarted = performance.now();
    const capture = await capturePlayback(
      video,
      () => {
        video.src = url;
        video.load();
      },
      async (metadata, index) => {
        playbackWaitMs += performance.now() - waitStarted;
        duration = video.duration;
        if (duration > MAX_VIDEO_DURATION_SECONDS) throw new VideoTooLongError(`Video is ${Math.round(duration)}s long; the limit is ${MAX_VIDEO_DURATION_SECONDS}s.`);
        const captureStarted = performance.now();
        const bitmap = await captureDisplayedFrame(video, canvas);
        captureMs += performance.now() - captureStarted;
        callbacks.onProgress(
          `${callbacks.compatPlaybackLabel ?? 'Compatibility playback'} · ${metadata.mediaTime.toFixed(1)} / ${duration.toFixed(1)}s`,
          Math.min(98, (metadata.mediaTime / duration) * 98),
        );
        try {
          // The worker analyses frames strictly in arrival order; only a full pipeline holds playback here.
          await pipeline.submit(() => call({ action: 'compat-frame', bitmap, time: metadata.mediaTime, index }, callbacks, [bitmap]));
        } catch (error) {
          // No-op once transferred; releases the bitmap when the pipeline had already stopped before posting it.
          bitmap.close();
          throw error;
        }
        waitStarted = performance.now();
      },
      callbacks.signal,
    );
    playbackWaitMs += performance.now() - waitStarted;
    // Real-time capture can skip frames when the decoder lags; reporting it explains weaker results.
    callbacks.onLog(
      `Playback capture: ${capture.capturedFrames} frames over ${duration.toFixed(1)}s, ${capture.skippedPresentedFrames} presented frames skipped`,
      capture.skippedPresentedFrames > 0 ? 'warn' : 'info',
    );
    await pipeline.drain();
    const result = await call({ action: 'compat-finish', duration }, callbacks);
    if (!result) throw new Error('The video scan returned no result.');
    result.metrics.decoder = 'playback';
    result.metrics.timings.captureMs = captureMs;
    result.metrics.timings.playbackWaitMs = playbackWaitMs;
    result.metrics.timings.backpressureWaitMs = pipeline.backpressureWaitMs;
    result.metrics.timings.drainWaitMs = pipeline.drainWaitMs;
    return result;
  } catch (error) {
    // Frames still queued in the worker would be analysed for nothing; the next scan request clears the flag.
    if (pipeline.pending > 0) getWorker().postMessage({ action: 'cancel', id: 0 } satisfies WorkerRequest);
    throw error;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Scans one inventory scroll video; WebCodecs decoding in the worker first, real-time playback capture as a fallback. */
export async function scanVideo(file: File, callbacks: VideoScanCallbacks): Promise<VideoScanOutput> {
  const started = performance.now();
  const modelsReused = modelsInitialized;
  let preparingModels = true;
  let firstPreviewMs: number | null = null;
  const measuredCallbacks: VideoScanCallbacks = {
    ...callbacks,
    onProgress: (step, percent) => callbacks.onProgress(step, Math.round(preparingModels ? percent * 0.15 : 15 + percent * 0.85)),
    onPreview: (frame) => {
      firstPreviewMs ??= performance.now() - started;
      if (callbacks.onPreview) callbacks.onPreview(frame);
      else frame.bitmap.close();
    },
  };
  const { signal } = callbacks;
  const onAbort = () => getWorker().postMessage({ action: 'cancel', id: 0 } satisfies WorkerRequest);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal?.aborted) throw new DOMException('Scan cancelled.', 'AbortError');
    const modelStarted = performance.now();
    await ensureModels(measuredCallbacks);
    const modelWaitMs = performance.now() - modelStarted;
    preparingModels = false;
    if (signal?.aborted) throw new DOMException('Scan cancelled.', 'AbortError');
    let result: VideoScanOutput;
    let fallbackAttemptMs = 0;
    const decodeStarted = performance.now();
    try {
      const output = await call(
        { action: 'video', file },
        {
          ...measuredCallbacks,
          onProgress: (step, percent) => measuredCallbacks.onProgress(`${callbacks.webCodecsLabel ?? 'Fast decoding (WebCodecs)'} · ${step}`, percent),
        },
      );
      if (!output) throw new Error('The video scan returned no result.');
      result = output;
    } catch (error) {
      if (!isUseCompatError(error)) throw error;
      if (signal?.aborted) throw new DOMException('Scan cancelled.', 'AbortError');
      fallbackAttemptMs = performance.now() - decodeStarted;
      result = await scanByPlayback(file, measuredCallbacks);
    }
    result.metrics.modelsReused = modelsReused;
    Object.assign(result.metrics.timings, { modelWaitMs, fallbackAttemptMs, firstPreviewMs, totalMs: performance.now() - started });
    const { metrics } = result;
    const t = metrics.timings;
    callbacks.onLog(
      `[performance] classification breakdown: crop ${Math.round(t.classifyCropMs)}ms, preprocessing ${Math.round(t.classifyPreprocessMs)}ms, ONNX ${Math.round(t.classifyInferenceMs)}ms, matching ${Math.round(t.classifyMatchMs)}ms; ${metrics.classifierCalls} model calls, ${metrics.classifierRetries} retries (included in classification time)`,
    );
    callbacks.onLog(
      `[performance] ${metrics.decoder ?? 'unknown'}, ${modelsReused ? 'warm' : 'cold'} worker models, requested providers: ${metrics.requestedProviders.join(', ')}; total ${Math.round(t.totalMs)}ms, model wait ${Math.round(t.modelWaitMs)}ms, first preview ${t.firstPreviewMs === null ? 'none' : `${Math.round(t.firstPreviewMs)}ms`}`,
    );
    callbacks.onLog(
      `[performance] frame analysis ${Math.round(t.frameAnalysisMs)}ms (detect ${Math.round(t.detectMs)}, classify ${Math.round(t.classifyMs)}, OCR ${Math.round(t.ocrMs)}, motion ${Math.round(t.motionMs)}, geometry ${Math.round(t.geometryMs)}, preview ${Math.round(t.previewMs)}); finish ${Math.round(t.finishMs)}ms (graph ${Math.round(t.graphMs)}); detector calls ${metrics.detectCalls}, grid frames ${metrics.gridFrames}, recognition calls ${metrics.recognitionCalls}, classified cells ${metrics.classifiedCells}`,
    );
    callbacks.onLog(
      `[performance] geometry verification: ${metrics.verificationCells} recropped cells, detect ${Math.round(t.verificationDetectMs)}ms, classify ${Math.round(t.verificationClassifyMs)}ms, OCR ${Math.round(t.verificationOcrMs)}ms (subsets of stage totals); pixel copy ${Math.round(t.pixelCopyMs)}ms, cell pixels ${Math.round(t.cellPixelsMs)}ms, signatures ${Math.round(t.signatureMs)}ms, position ${Math.round(t.positionMs)}ms, graph preparation ${Math.round(t.graphPrepareMs)}ms`,
    );
    callbacks.onLog(
      `[performance] decoder setup ${Math.round(t.decoderSetupMs)}ms, decode wait ${Math.round(t.decodeWaitMs)}ms, playback wait ${Math.round(t.playbackWaitMs)}ms, capture ${Math.round(t.captureMs)}ms, analysis backpressure ${Math.round(t.backpressureWaitMs)}ms, analysis drain ${Math.round(t.drainWaitMs)}ms, fallback attempt ${Math.round(t.fallbackAttemptMs)}ms; video ${result.width}x${result.height}, ${result.duration.toFixed(1)}s, ${metrics.frames} frames, ${metrics.keyframes} keyframes`,
    );
    return result;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
