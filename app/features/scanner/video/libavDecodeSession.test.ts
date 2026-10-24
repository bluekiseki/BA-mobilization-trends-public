import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibAVDecodeSession } from './libavDecodeSession';
import type { LibAVDecoderRequest, LibAVDecoderResponse } from './libavProtocol';

class DecoderWorker {
  static instances: DecoderWorker[] = [];
  static response: 'ready' | 'error' | 'none' = 'ready';
  listener: ((event: MessageEvent<LibAVDecoderResponse>) => void) | null = null;
  terminated = false;
  startRequest: Extract<LibAVDecoderRequest, { type: 'start' }> | null = null;
  constructor() {
    DecoderWorker.instances.push(this);
  }
  addEventListener(type: string, listener: (event: MessageEvent<LibAVDecoderResponse>) => void): void {
    if (type === 'message') this.listener = listener;
  }
  postMessage(request: LibAVDecoderRequest): void {
    if (request.type !== 'start') return;
    this.startRequest = request;
    if (DecoderWorker.response === 'none') return;
    queueMicrotask(() =>
      this.emit(DecoderWorker.response === 'error' ? { type: 'error', phase: 'load', message: 'Simulated WASM load failure' } : { type: 'ready', codec: 'avc', width: 560, height: 316 }),
    );
  }
  emit(response: LibAVDecoderResponse): void {
    this.listener?.({ data: response } as MessageEvent<LibAVDecoderResponse>);
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('software decoder resource lifecycle', () => {
  beforeEach(() => {
    DecoderWorker.instances = [];
    DecoderWorker.response = 'ready';
    vi.stubGlobal('Worker', DecoderWorker);
    vi.stubGlobal('self', { location: { href: 'http://127.0.0.1:5174/benchmark/' } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('terminates the worker when WASM initialization fails', async () => {
    DecoderWorker.response = 'error';
    await expect(LibAVDecodeSession.open(new Blob(), 2560)).rejects.toThrow('Simulated WASM load failure');
    expect(DecoderWorker.instances[0].terminated).toBe(true);
  });

  it('aborts while initialization is waiting for ready', async () => {
    DecoderWorker.response = 'none';
    const controller = new AbortController();
    const pending = LibAVDecodeSession.open(new Blob(), 2560, { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(DecoderWorker.instances[0].terminated).toBe(true);
  });

  it('closes queued bitmaps and terminates on cancellation', async () => {
    const controller = new AbortController();
    const session = await LibAVDecodeSession.open(new Blob(), 2560, { signal: controller.signal });
    const close = vi.fn();
    DecoderWorker.instances[0].emit({ type: 'frame', bitmap: { close } as unknown as ImageBitmap, timestamp: 0, duration: 1 / 30 });
    controller.abort();
    expect(close).toHaveBeenCalledOnce();
    expect(DecoderWorker.instances[0].terminated).toBe(true);
    await expect(session.frames().next()).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('times out a decoder that never becomes ready', async () => {
    vi.useFakeTimers();
    DecoderWorker.response = 'none';
    const pending = LibAVDecodeSession.open(new Blob(), 2560);
    const rejected = expect(pending).rejects.toThrow('initialization timed out');
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(DecoderWorker.instances[0].terminated).toBe(true);
  });

  it('does not start a worker for an already cancelled scan', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(LibAVDecodeSession.open(new Blob(), 2560, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(DecoderWorker.instances).toHaveLength(0);
  });
  it('preserves inventory defaults when no overrides are passed', async () => {
    const session = await LibAVDecodeSession.open(new Blob(), 2560);
    expect(DecoderWorker.instances[0].startRequest).toMatchObject({
      maxQueuedBytes: 384 * 1024 * 1024,
      minQueuedFrames: 8,
      maxQueuedFrames: 160,
      maxConvertedAhead: 16,
      imageSmoothingEnabled: undefined,
      copyoutFrame: undefined,
    });
    session.dispose();
  });
});
