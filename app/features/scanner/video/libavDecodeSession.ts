import { cdn } from '~/utils/cdn';
import type { LibAVDecoderRequest, LibAVDecoderResponse } from './libavProtocol';

/**
 * Software decoding fallback for the scan worker. A decoder-only libav.js build runs in its own worker, demuxes the file
 * there, decodes ahead of analysis and converts frames off this thread (see libavDecoder.worker.ts).
 *
 * Two simpler designs were measured and rejected: feeding packets from this worker starved the decoder because this
 * thread is blocked by inference (prefetch never exceeded one frame), and letting mediabunny's CanvasSink draw the
 * decoded frames here cost about 30 ms per frame on this thread.
 */

const LIBAV_BASE_PATH = '/scanner/libav';
const LIBAV_LOADER = 'libav-scandec.mjs';
/** YUV frames queued ahead of analysis are bounded by bytes (about 4.4 MB per 1170x2532 I420 frame). */
const MAX_QUEUED_BYTES = 384 * 1024 * 1024;
const MIN_QUEUED_FRAMES = 8;
const MAX_QUEUED_FRAMES = 160;
/**
 * RGBA bitmaps converted ahead of the scan loop (about 11.8 MB each at 1170x2532). Frames reach this thread only when
 * it is idle between analyses, so a short lead leaves the scan loop waiting (7s HEVC clip: 4 ahead waited 23 ms per
 * frame, 12 ahead 11 ms).
 */
const MAX_CONVERTED_AHEAD = 16;

export type LibAVDecodeOptions = Partial<
  Pick<Extract<LibAVDecoderRequest, { type: 'start' }>, 'maxQueuedBytes' | 'minQueuedFrames' | 'maxQueuedFrames' | 'maxConvertedAhead' | 'imageSmoothingEnabled' | 'copyoutFrame'>
> & { signal?: AbortSignal };

type DecodedFrame = Extract<LibAVDecoderResponse, { type: 'frame' }>;

export interface LibAVDecodeStats {
  frames: number;
  /** Peak YUV frames queued in the decoder worker, and their bytes. */
  peakQueuedFrames: number;
  peakQueuedBytes: number;
  /** Decoder worker time inside libav decoding, in parallel with analysis. */
  workerDecodeMs: number;
  workerDemuxMs: number;
  /** YUV to RGBA conversion, rotation and scaling in the decoder worker. */
  workerConvertMs: number;
  /** Decoder worker idle time because the queue was full, i.e. decoding was ahead of analysis. */
  workerCreditWaitMs: number;
  /** 'videoframe' when the browser converts YUV via VideoFrame, 'raw' when mediabunny converts it in JS. */
  framePath: 'videoframe' | 'raw' | 'none';
  /** Frames the scan loop asked for before one had arrived, and the time it waited. */
  starved: number;
  starvedMs: number;
}

export class LibAVDecodeSession {
  private readonly worker: Worker;
  private removeAbortListener: (() => void) | null = null;
  private failure: Error | null = null;
  private disposed = false;
  private ended = false;
  private ready = false;
  private pending: DecodedFrame[] = [];
  private consumedCount = 0;
  private wake: (() => void) | null = null;
  width = 0;
  height = 0;
  readonly stats: LibAVDecodeStats = {
    frames: 0,
    peakQueuedFrames: 0,
    peakQueuedBytes: 0,
    workerDecodeMs: 0,
    workerDemuxMs: 0,
    workerConvertMs: 0,
    workerCreditWaitMs: 0,
    framePath: 'none',
    starved: 0,
    starvedMs: 0,
  };

  private constructor() {
    this.worker = new Worker(new URL('./libavDecoder.worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', (e: MessageEvent<LibAVDecoderResponse>) => this.onMessage(e.data));
    this.worker.addEventListener('error', (e) => this.fail(new Error(e.message || 'libav.js decoder worker crashed')));
  }

  /**
   * Spawns the decoder worker, loads the WASM decoder and configures it for the file; decoding starts right away.
   * Rejects if the decoder cannot be loaded or initialised.
   */
  static async open(file: Blob, maxDimension: number, options: LibAVDecodeOptions = {}): Promise<LibAVDecodeSession> {
    if (options.signal?.aborted) throw new DOMException('Scan cancelled.', 'AbortError');
    const session = new LibAVDecodeSession();
    const abort = () => session.dispose();
    options.signal?.addEventListener('abort', abort, { once: true });
    session.removeAbortListener = () => options.signal?.removeEventListener('abort', abort);
    const timer = setTimeout(() => session.fail(new Error('Software decoder initialization timed out')), 30_000);
    try {
      session.post({
        type: 'start',
        file,
        base: new URL(cdn(LIBAV_BASE_PATH, true), self.location.href).href,
        loader: LIBAV_LOADER,
        maxDimension,
        maxQueuedBytes: options.maxQueuedBytes ?? MAX_QUEUED_BYTES,
        minQueuedFrames: options.minQueuedFrames ?? MIN_QUEUED_FRAMES,
        maxQueuedFrames: options.maxQueuedFrames ?? MAX_QUEUED_FRAMES,
        maxConvertedAhead: options.maxConvertedAhead ?? MAX_CONVERTED_AHEAD,
        imageSmoothingEnabled: options.imageSmoothingEnabled,
        copyoutFrame: options.copyoutFrame,
      });
      while (!session.ready) await session.next();
      return session;
    } catch (error) {
      session.dispose();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Yields frames in presentation order; the caller must close each bitmap once analysed. */
  async *frames(): AsyncGenerator<DecodedFrame> {
    while (true) {
      if (this.disposed) throw new DOMException('Scan cancelled.', 'AbortError');
      if (this.failure) throw this.failure;
      const frame = this.pending.shift();
      if (frame) {
        this.consumedCount++;
        this.post({ type: 'consumed', count: this.consumedCount });
        yield frame;
      } else if (this.ended) {
        return;
      } else {
        const waitStarted = performance.now();
        this.stats.starved++;
        await this.next();
        this.stats.starvedMs += performance.now() - waitStarted;
      }
    }
  }

  /** Terminates the decoder worker, which frees the WASM heap, and closes every frame not yet taken. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeAbortListener?.();
    this.removeAbortListener = null;
    this.worker.terminate();
    for (const frame of this.pending) frame.bitmap.close();
    this.pending = [];
    this.notify();
  }

  private next(): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.disposed) return Promise.reject(new DOMException('Scan cancelled.', 'AbortError'));
    return new Promise((resolve) => {
      this.wake = resolve;
    });
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }

  private onMessage(message: LibAVDecoderResponse): void {
    if (this.disposed) {
      if (message.type === 'frame') message.bitmap.close();
      return;
    }
    if (message.type === 'error') {
      this.fail(new Error(`libav.js decoder${message.phase === 'load' ? ' could not start' : ''}: ${message.message}`));
      return;
    }
    if (message.type === 'ready') {
      this.ready = true;
      this.width = message.width;
      this.height = message.height;
    } else if (message.type === 'frame') {
      this.pending.push(message);
    } else if (message.type === 'end') {
      this.ended = true;
      Object.assign(this.stats, {
        frames: message.frames,
        peakQueuedFrames: message.peakQueuedFrames,
        peakQueuedBytes: message.peakQueuedBytes,
        workerDecodeMs: message.decodeMs,
        workerDemuxMs: message.demuxMs,
        workerConvertMs: message.convertMs,
        workerCreditWaitMs: message.creditWaitMs,
        framePath: message.framePath,
      });
    }
    this.notify();
  }

  private post(message: LibAVDecoderRequest): void {
    if (!this.disposed) this.worker.postMessage(message);
  }

  private fail(error: Error): void {
    if (this.failure || this.disposed) return;
    this.failure = error;
    this.notify();
  }
}
