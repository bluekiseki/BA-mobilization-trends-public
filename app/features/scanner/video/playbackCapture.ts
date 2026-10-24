// The producer is paused while each presented frame is captured; analysis runs behind it in a bounded pipeline.
// Presentation callbacks only: no seeking and no source-frame recovery.
export interface PlaybackCaptureResult {
  capturedFrames: number;
  skippedPresentedFrames: number;
}

const FRAME_TIMEOUT_MS = 15000;
// Firefox can stop at the last position (currentTime === duration, not paused) without firing `ended`.
const END_POLL_MS = 250;
// Lets a presentation callback that is already due run before the position check concludes the stream.
const END_GRACE_MS = 200;

export async function capturePlayback(
  video: HTMLVideoElement,
  load: () => void | Promise<void>,
  consume: (metadata: VideoFrameCallbackMetadata, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<PlaybackCaptureResult> {
  const aborted = () => new DOMException('Scan cancelled.', 'AbortError');
  const check = () => {
    if (signal?.aborted) throw aborted();
  };
  let lastTime = -Infinity;
  let lastPresented: number | null = null;
  let skippedPresentedFrames = 0;
  let captured = 0;

  function nextFrame(start: () => void | Promise<void>): Promise<VideoFrameCallbackMetadata | null> {
    return new Promise((resolve, reject) => {
      let handle: number | undefined;
      let endGrace: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        clearTimeout(timer);
        clearInterval(endPoll);
        clearTimeout(endGrace);
        if (handle !== undefined) video.cancelVideoFrameCallback(handle);
        video.removeEventListener('ended', ended);
        video.removeEventListener('error', failed);
        signal?.removeEventListener('abort', abort);
      };
      const done = (value: VideoFrameCallbackMetadata | null) => {
        cleanup();
        resolve(value);
      };
      const fail = (error: unknown) => {
        cleanup();
        video.pause();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const ended = () => done(null);
      const failed = () => fail(new Error('This browser cannot play the video. Try another browser or an H.264 MP4 file.'));
      const abort = () => fail(aborted());
      const frame = (_now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
        if (!Number.isFinite(metadata.mediaTime)) {
          fail(new Error('Could not read the video frame time.'));
          return;
        }
        // Resume can present the same frame again; wait for a new one without voting twice.
        if (metadata.mediaTime <= lastTime) {
          handle = video.requestVideoFrameCallback(frame);
          return;
        }
        video.pause();
        done(metadata);
      };
      video.addEventListener('ended', ended, { once: true });
      video.addEventListener('error', failed, { once: true });
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => fail(new Error('Timed out waiting for a video frame. Try another browser or an H.264 MP4 file.')), FRAME_TIMEOUT_MS);
      const atEnd = () => Number.isFinite(video.duration) && video.duration > 0 && video.currentTime >= video.duration && !video.seeking;
      const endPoll = setInterval(() => {
        if (endGrace === undefined && atEnd()) endGrace = setTimeout(() => done(null), END_GRACE_MS);
      }, END_POLL_MS);
      if (signal?.aborted) {
        abort();
        return;
      }
      if (video.ended) {
        done(null);
        return;
      }
      handle = video.requestVideoFrameCallback(frame);
      Promise.resolve().then(start).catch(fail);
    });
  }

  try {
    check();
    // Register before loading so the initial paused frame is retained too.
    let metadata = await nextFrame(load);
    while (metadata) {
      check();
      if (lastPresented !== null && Number.isFinite(metadata.presentedFrames)) skippedPresentedFrames += Math.max(0, metadata.presentedFrames - lastPresented - 1);
      lastPresented = metadata.presentedFrames;
      lastTime = metadata.mediaTime;
      await consume(metadata, captured);
      captured++;
      check();
      metadata = await nextFrame(() => video.play());
    }
    return { capturedFrames: captured, skippedPresentedFrames };
  } finally {
    video.pause();
  }
}

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/**
 * Bounds how many captured frames may wait for worker analysis. `submit` starts a send without awaiting its result and
 * only blocks while the limit is reached, so playback keeps moving while earlier frames are analysed. The first failed
 * send is kept and rethrown by every later `submit`/`drain`, which stops capture and the scan.
 */
export class FramePipeline {
  private inFlight = 0;
  private failure: Error | null = null;
  private waiters: Array<() => void> = [];
  /** Time `submit` spent blocked because the limit was reached. */
  backpressureWaitMs = 0;
  /** Time `drain` spent waiting for the remaining frames. */
  drainWaitMs = 0;

  constructor(
    private readonly limit: number,
    private readonly signal?: AbortSignal,
  ) {
    if (!(limit >= 1)) throw new Error('The frame pipeline limit must be at least 1.');
  }

  get pending(): number {
    return this.inFlight;
  }

  async submit(send: () => Promise<unknown>): Promise<void> {
    this.throwIfStopped();
    this.inFlight++;
    let sent: Promise<unknown>;
    try {
      sent = send();
    } catch (error) {
      sent = Promise.reject(toError(error));
    }
    sent.then(
      () => this.settle(null),
      (error: unknown) => this.settle(toError(error)),
    );
    if (this.inFlight < this.limit) return;
    const started = performance.now();
    try {
      await this.waitUntil(() => this.inFlight < this.limit);
    } finally {
      this.backpressureWaitMs += performance.now() - started;
    }
  }

  /** Resolves once every submitted frame is acknowledged; rejects with the first failure. */
  async drain(): Promise<void> {
    const started = performance.now();
    try {
      await this.waitUntil(() => this.inFlight === 0);
    } finally {
      this.drainWaitMs += performance.now() - started;
    }
  }

  private settle(error: Error | null): void {
    this.inFlight--;
    if (error) this.failure ??= error;
    const waiters = this.waiters;
    this.waiters = [];
    for (const wake of waiters) wake();
  }

  private throwIfStopped(): void {
    if (this.failure) throw this.failure;
    if (this.signal?.aborted) throw new DOMException('Scan cancelled.', 'AbortError');
  }

  private async waitUntil(ready: () => boolean): Promise<void> {
    this.throwIfStopped();
    while (!ready()) {
      await new Promise<void>((resolve) => {
        const wake = () => {
          this.signal?.removeEventListener('abort', wake);
          resolve();
        };
        this.waiters.push(wake);
        this.signal?.addEventListener('abort', wake, { once: true });
      });
      this.throwIfStopped();
    }
  }
}
