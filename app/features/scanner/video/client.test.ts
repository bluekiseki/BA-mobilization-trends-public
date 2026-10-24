import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { makeMockVideoScanOutput } from '../core/__test__/fixtures/videoScanOutput';

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  requests: WorkerRequest[] = [];
  failInit = false;
  useCompat = false;
  failCompatFrame: number | null = null;
  compatFrames: number[] = [];
  closedBitmaps = 0;
  maxCompatInFlight = 0;
  private compatInFlight = 0;
  private compatChain: Promise<void> = Promise.resolve();
  constructor() {
    super();
    FakeWorker.instances.push(this);
  }
  postMessage(request: WorkerRequest): void {
    this.requests.push(request);
    if (request.action === 'cancel') return;
    if (request.action === 'compat-start' || request.action === 'compat-frame' || request.action === 'compat-finish') {
      this.handleCompat(request);
      return;
    }
    queueMicrotask(() => {
      if (request.action === 'init') {
        this.send(this.failInit ? { id: request.id, error: { name: 'Error', message: 'Init failed' } } : { id: request.id, result: null });
      } else if (request.action === 'video' && this.useCompat) {
        this.send({ id: request.id, error: { name: 'UseCompatDecoderError', message: 'Use compat', code: 'USE_COMPAT' } });
      } else if (request.action === 'video') {
        this.send({ id: request.id, event: 'progress', step: 'Scanning', percent: 98 });
        this.send({ id: request.id, result: makeMockVideoScanOutput() });
      }
    });
  }
  // Mirrors the worker's serial message queue: one compat request at a time, in arrival order.
  private handleCompat(request: WorkerRequest): void {
    if (request.action === 'compat-frame') {
      this.compatInFlight++;
      this.maxCompatInFlight = Math.max(this.maxCompatInFlight, this.compatInFlight);
    }
    this.compatChain = this.compatChain.then(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (request.action === 'compat-frame') {
        this.compatInFlight--;
        request.bitmap.close();
        if (request.index === this.failCompatFrame) {
          this.send({ id: request.id, error: { name: 'Error', message: `Frame ${request.index} failed` } });
          return;
        }
        this.compatFrames.push(request.index);
      }
      this.send({ id: request.id, result: request.action === 'compat-finish' ? makeMockVideoScanOutput() : null });
    });
  }
  private send(message: WorkerResponse): void {
    this.dispatchEvent(new MessageEvent('message', { data: message }));
  }
}

type FrameCallback = (now: number, metadata: VideoFrameCallbackMetadata) => void;

// Plays a fixed list of frames: each `load`/`play` presents frames until the capture loop pauses.
class FakeVideo extends EventTarget {
  paused = true;
  ended = false;
  src = '';
  duration = 0;
  videoWidth = 4;
  videoHeight = 4;
  muted = false;
  playsInline = false;
  preload = '';
  private callback: FrameCallback | null = null;
  private frames: number[];
  private presented = 0;
  constructor(frameCount: number) {
    super();
    this.frames = Array.from({ length: frameCount }, (_, i) => i / 30);
    this.duration = frameCount / 30;
  }
  requestVideoFrameCallback(cb: FrameCallback): number {
    this.callback = cb;
    return 1;
  }
  cancelVideoFrameCallback(): void {
    this.callback = null;
  }
  removeAttribute(): void {
    this.src = '';
  }
  load(): void {
    if (this.src) queueMicrotask(() => this.present());
  }
  pause(): void {
    this.paused = true;
  }
  play(): Promise<void> {
    this.paused = false;
    queueMicrotask(() => this.present());
    return Promise.resolve();
  }
  private present(): void {
    const mediaTime = this.frames.shift();
    if (mediaTime === undefined) {
      this.ended = true;
      this.dispatchEvent(new Event('ended'));
      return;
    }
    const cb = this.callback;
    this.callback = null;
    this.presented++;
    cb?.(0, { presentationTime: 0, expectedDisplayTime: 0, width: 4, height: 4, mediaTime, presentedFrames: this.presented });
    if (!this.paused) queueMicrotask(() => this.present());
  }
}

let video: FakeVideo;
const openBitmaps = new Set<{ close: () => void }>();

function stubPlaybackGlobals(frameCount: number): void {
  video = new FakeVideo(frameCount);
  openBitmaps.clear();
  vi.stubGlobal('HTMLVideoElement', { prototype: { requestVideoFrameCallback: () => 0 } });
  vi.stubGlobal('document', { createElement: () => video });
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width = 1;
      height = 1;
      getContext() {
        return { drawImage: () => {} };
      }
    },
  );
  vi.stubGlobal('createImageBitmap', () => {
    const bitmap = { close: () => openBitmaps.delete(bitmap) };
    openBitmaps.add(bitmap);
    return Promise.resolve(bitmap);
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
}

beforeEach(() => {
  vi.resetModules();
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const file = () => new File(['video'], 'inventory.mp4', { type: 'video/mp4' });
const callbacks = () => ({ onLog: vi.fn(), onProgress: vi.fn() });

describe('video worker initialization', () => {
  it('reuses initialized worker models and records cold/warm metrics', async () => {
    const { scanVideo } = await import('./client');
    const cb = callbacks();
    const cold = await scanVideo(file(), cb);
    const warm = await scanVideo(file(), cb);
    const worker = FakeWorker.instances[0];
    expect(worker.requests.map((r) => r.action)).toEqual(['init', 'video', 'video']);
    expect(cold.metrics.modelsReused).toBe(false);
    expect(warm.metrics.modelsReused).toBe(true);
    expect(warm.metrics.timings.totalMs).toBeGreaterThanOrEqual(warm.metrics.timings.modelWaitMs);
    expect(cb.onLog).toHaveBeenCalledWith(expect.stringContaining('[performance]'));
    expect(cb.onProgress).toHaveBeenCalledWith('Fast decoding (WebCodecs) · Scanning', 98);
  });

  it('stops after cancellation during init, then allows a subsequent scan to reuse models', async () => {
    const { scanVideo } = await import('./client');
    const controller = new AbortController();
    // Abort before the queued initialization response is delivered.
    const task = scanVideo(file(), { ...callbacks(), signal: controller.signal });
    const worker = FakeWorker.instances[0];
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.requests.map((r) => r.action)).toEqual(['init', 'cancel']);
    expect((await scanVideo(file(), callbacks())).metrics.modelsReused).toBe(true);
  });

  it('retries initialization after failure instead of retaining a rejected promise', async () => {
    const { scanVideo } = await import('./client');
    const task = scanVideo(file(), callbacks());
    const worker = FakeWorker.instances[0];
    worker.failInit = true;
    await expect(task).rejects.toThrow('Init failed');
    worker.failInit = false;
    expect((await scanVideo(file(), callbacks())).metrics.modelsReused).toBe(false);
    expect(worker.requests.map((r) => r.action)).toEqual(['init', 'init', 'video']);
  });
});

describe('compat playback pipeline', () => {
  it('posts every frame once and in order while keeping at most the limit in flight', async () => {
    stubPlaybackGlobals(30);
    const { scanVideo, MAX_COMPAT_FRAMES_IN_FLIGHT } = await import('./client');
    const onCompatPlayback = vi.fn();
    const pending = scanVideo(file(), { ...callbacks(), onCompatPlayback });
    const worker = FakeWorker.instances[0];
    worker.useCompat = true;
    const result = await pending;
    const frameRequests = worker.requests.flatMap((r) => (r.action === 'compat-frame' ? [r.index] : []));
    const order = Array.from({ length: 30 }, (_, i) => i);
    expect(frameRequests).toEqual(order);
    expect(worker.compatFrames).toEqual(order);
    expect(worker.requests.map((r) => r.action).at(-1)).toBe('compat-finish');
    expect(worker.maxCompatInFlight).toBe(MAX_COMPAT_FRAMES_IN_FLIGHT);
    expect(openBitmaps.size).toBe(0);
    expect(result.metrics.decoder).toBe('playback');
    expect(onCompatPlayback).toHaveBeenCalledOnce();
    expect(result.metrics.timings.backpressureWaitMs).toBeGreaterThan(0);
  });

  it('rejects the scan when a queued frame fails, without finishing or leaking bitmaps', async () => {
    stubPlaybackGlobals(30);
    const { scanVideo } = await import('./client');
    const pending = scanVideo(file(), callbacks());
    const worker = FakeWorker.instances[0];
    worker.useCompat = true;
    worker.failCompatFrame = 5;
    await expect(pending).rejects.toThrow('Frame 5 failed');
    expect(worker.requests.some((r) => r.action === 'compat-finish')).toBe(false);
    expect(worker.compatFrames).toEqual([0, 1, 2, 3, 4]);
    // Frames still queued behind the failure are cancelled in the worker.
    expect(worker.requests.at(-1)?.action).toBe('cancel');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(openBitmaps.size).toBe(0);
    expect(video.paused).toBe(true);
  });
});
