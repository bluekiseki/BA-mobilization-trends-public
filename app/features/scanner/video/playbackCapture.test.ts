import { describe, expect, it } from 'vitest';
import { capturePlayback, FramePipeline } from './playbackCapture';

type FrameCallback = (now: number, metadata: VideoFrameCallbackMetadata) => void;

// Minimal stand-in for the parts of HTMLVideoElement that playback capture touches.
class FakeVideo extends EventTarget {
  paused = true;
  ended = false;
  handles = new Map<number, FrameCallback>();
  private next = 0;
  constructor(private frames: Array<{ mediaTime: number; presentedFrames: number }>) {
    super();
  }
  requestVideoFrameCallback(cb: FrameCallback): number {
    const id = ++this.next;
    this.handles.set(id, cb);
    return id;
  }
  cancelVideoFrameCallback(id: number): void {
    this.handles.delete(id);
  }
  pause(): void {
    this.paused = true;
  }
  play(): Promise<void> {
    this.paused = false;
    queueMicrotask(() => {
      const frame = this.frames.shift();
      if (!frame) {
        this.ended = true;
        this.dispatchEvent(new Event('ended'));
        return;
      }
      const first = this.handles.entries().next().value;
      if (!first) return;
      const [id, cb] = first;
      this.handles.delete(id);
      cb(0, { presentationTime: 0, expectedDisplayTime: 0, width: 0, height: 0, mediaTime: frame.mediaTime, presentedFrames: frame.presentedFrames });
      // Duplicate callbacks are ignored without pausing; deliver the next sample.
      if (!this.paused) void this.play();
    });
    return Promise.resolve();
  }
}

const asVideo = (v: FakeVideo) => v as unknown as HTMLVideoElement;

describe('capturePlayback', () => {
  it('pauses the producer through processing, skips duplicate views and never seeks', async () => {
    const video = new FakeVideo([
      { mediaTime: 0, presentedFrames: 1 },
      { mediaTime: 0, presentedFrames: 1 },
      { mediaTime: 0.033, presentedFrames: 2 },
      { mediaTime: 0.1, presentedFrames: 4 },
    ]);
    const processed: Array<[number, number]> = [];
    const result = await capturePlayback(
      asVideo(video),
      () => video.play(),
      async (metadata, index) => {
        expect(video.paused).toBe(true);
        await Promise.resolve();
        expect(video.paused).toBe(true);
        processed.push([index, metadata.mediaTime]);
      },
    );
    expect(processed).toEqual([
      [0, 0],
      [1, 0.033],
      [2, 0.1],
    ]);
    expect(result.skippedPresentedFrames).toBe(1);
    expect(result.capturedFrames).toBe(3);
    expect(video.handles.size).toBe(0);
    expect(video.paused).toBe(true);
  });

  it('finishes when playback sits at the end without an ended event', async () => {
    // Firefox quirk: the last frame is presented, then currentTime reaches duration but `ended` never fires.
    class StuckAtEndVideo extends FakeVideo {
      duration = 0.1;
      currentTime = 0;
      seeking = false;
      override play(): Promise<void> {
        if (this.currentTime >= this.duration) return Promise.resolve();
        return super.play().then(() => {
          this.currentTime = this.duration;
        });
      }
      override dispatchEvent(event: Event): boolean {
        return event.type === 'ended' ? true : super.dispatchEvent(event);
      }
    }
    const video = new StuckAtEndVideo([{ mediaTime: 0.05, presentedFrames: 1 }]);
    const processed: number[] = [];
    const result = await capturePlayback(
      asVideo(video),
      () => video.play(),
      (metadata) => {
        processed.push(metadata.mediaTime);
        return Promise.resolve();
      },
    );
    expect(processed).toEqual([0.05]);
    expect(result.capturedFrames).toBe(1);
    expect(video.handles.size).toBe(0);
  });

  it('clears the pending callback and pauses playback on cancellation', async () => {
    const video = new FakeVideo([]);
    const controller = new AbortController();
    await expect(
      capturePlayback(
        asVideo(video),
        () => controller.abort(),
        () => Promise.resolve(),
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(video.handles.size).toBe(0);
    expect(video.paused).toBe(true);
  });

  it('cleans up the callback when playback is rejected', async () => {
    const video = new FakeVideo([]);
    await expect(
      capturePlayback(
        asVideo(video),
        () => Promise.reject(new Error('Cannot play')),
        () => Promise.resolve(),
      ),
    ).rejects.toThrow('Cannot play');
    expect(video.handles.size).toBe(0);
  });
});

/** Serial stand-in for the worker queue: frames are acknowledged one at a time, in arrival order. */
function serialWorker(failAt?: number) {
  let chain: Promise<void> = Promise.resolve();
  const processed: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const post = (index: number): Promise<void> => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const done = chain.then(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      if (index === failAt) throw new Error(`Frame ${index} failed`);
      processed.push(index);
    });
    chain = done.catch(() => undefined);
    return done;
  };
  return { post, processed, maxInFlight: () => maxInFlight };
}

const sequentialFrames = (count: number) => Array.from({ length: count }, (_, i) => ({ mediaTime: i / 30, presentedFrames: i + 1 }));

describe('FramePipeline', () => {
  it('delivers every frame once, in order, without exceeding the in-flight limit', async () => {
    const video = new FakeVideo(sequentialFrames(20));
    const worker = serialWorker();
    const pipeline = new FramePipeline(3);
    const result = await capturePlayback(
      asVideo(video),
      () => video.play(),
      async (_metadata, index) => {
        expect(video.paused).toBe(true);
        await pipeline.submit(() => worker.post(index));
        expect(pipeline.pending).toBeLessThan(3);
      },
    );
    await pipeline.drain();
    expect(result).toEqual({ capturedFrames: 20, skippedPresentedFrames: 0 });
    expect(worker.processed).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(worker.maxInFlight()).toBe(3);
    expect(pipeline.pending).toBe(0);
    expect(pipeline.backpressureWaitMs).toBeGreaterThan(0);
  });

  it('returns from submit without waiting for analysis while there is room', async () => {
    const pipeline = new FramePipeline(2);
    let release = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    await pipeline.submit(() => blocked);
    expect(pipeline.pending).toBe(1);
    let secondReturned = false;
    const second = pipeline
      .submit(() => new Promise<void>(() => {}))
      .then(() => {
        secondReturned = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 5));
    // The limit is reached, so the producer stays blocked until a frame is acknowledged.
    expect(secondReturned).toBe(false);
    release();
    await second;
    expect(secondReturned).toBe(true);
    expect(pipeline.pending).toBe(1);
  });

  it('rejects the capture when a queued frame fails and stops submitting later frames', async () => {
    const video = new FakeVideo(sequentialFrames(20));
    const worker = serialWorker(4);
    const pipeline = new FramePipeline(3);
    const submitted: number[] = [];
    await expect(
      capturePlayback(
        asVideo(video),
        () => video.play(),
        async (_metadata, index) => {
          await pipeline.submit(() => {
            submitted.push(index);
            return worker.post(index);
          });
        },
      ),
    ).rejects.toThrow('Frame 4 failed');
    expect(worker.processed).toEqual([0, 1, 2, 3]);
    // At most limit - 1 frames can be posted behind the failing one before the failure is observed.
    expect(Math.max(...submitted)).toBeLessThanOrEqual(4 + 2);
    expect(video.handles.size).toBe(0);
    expect(video.paused).toBe(true);
    await expect(pipeline.drain()).rejects.toThrow('Frame 4 failed');
  });

  it('stops waiting for room when the scan is cancelled', async () => {
    const controller = new AbortController();
    const pipeline = new FramePipeline(1, controller.signal);
    const waiting = pipeline.submit(() => new Promise<void>(() => {}));
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    await expect(pipeline.submit(() => Promise.resolve())).rejects.toMatchObject({ name: 'AbortError' });
  });
});
