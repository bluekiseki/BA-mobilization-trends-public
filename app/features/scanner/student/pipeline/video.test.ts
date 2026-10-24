import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scanStableFrames, type VideoProgressMessages } from './video';

const mocks = vi.hoisted(() => ({
  canDecode: vi.fn(),
  open: vi.fn(),
  disposeInput: vi.fn(),
  disposeSession: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
}));

vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {
    constructor(readonly file: Blob) {}
  },
  Input: class {
    getPrimaryVideoTrack() {
      return Promise.resolve({
        getCodec: () => Promise.resolve('avc'),
        getCodecParameterString: () => Promise.resolve('avc1'),
        canDecode: mocks.canDecode,
        getDurationFromMetadata: () => Promise.resolve(1),
      });
    }
    dispose = mocks.disposeInput;
  },
  CanvasSink: class {
    async *canvases() {}
  },
}));
vi.mock('../../video/libavDecodeSession', () => ({ LibAVDecodeSession: { open: mocks.open } }));

const messages: VideoProgressMessages = {
  fastDecode: () => 'native',
  softwareDecode: () => 'software',
  softwareFallback: 'loading software',
  compatDecode: () => 'playback',
  compatFallback: 'loading playback',
  layoutSample: () => '',
  deduplicate: () => '',
  deduplicateRejected: () => '',
};

describe('student video decoder fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canDecode.mockResolvedValue(true);
    mocks.open.mockResolvedValue({ dispose: mocks.disposeSession, async *frames() {} });
    vi.stubGlobal('VideoDecoder', vi.fn());
    vi.stubGlobal('VideoFrame', vi.fn());
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag === 'canvas') return { width: 0, height: 0, getContext: () => ({}) };
        const video = {
          onloadedmetadata: () => {},
          onended: () => {},
          set src(_url: string) {
            queueMicrotask(() => video.onloadedmetadata());
          },
          play: () => {
            mocks.play();
            queueMicrotask(() => video.onended());
            return Promise.resolve();
          },
          pause: mocks.pause,
          load: vi.fn(),
          removeAttribute: vi.fn(),
          requestVideoFrameCallback: vi.fn(),
        };
        return video;
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const file = () => new File(['video'], 'scan.mp4', { type: 'video/mp4' });

  it('keeps native decoding first without loading LibAV', async () => {
    const mode = vi.fn();
    await scanStableFrames(file(), vi.fn(), messages, undefined, mode);
    expect(mode.mock.calls).toEqual([['webcodecs']]);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.play).not.toHaveBeenCalled();
  });

  it('uses bounded, full-resolution LibAV when the codec is unsupported natively', async () => {
    mocks.canDecode.mockResolvedValue(false);
    const mode = vi.fn();
    await scanStableFrames(file(), vi.fn(), messages, undefined, mode);
    expect(mode.mock.calls).toEqual([['libav']]);
    expect(mocks.open).toHaveBeenCalledWith(
      expect.any(File),
      Number.MAX_SAFE_INTEGER,
      expect.objectContaining({
        maxQueuedBytes: 16 * 1024 * 1024,
        maxQueuedFrames: 8,
        maxConvertedAhead: 2,
        imageSmoothingEnabled: true,
        copyoutFrame: 'video',
      }),
    );
    expect(mocks.disposeSession).toHaveBeenCalledOnce();
    expect(mocks.play).not.toHaveBeenCalled();
  });

  it('can use LibAV when VideoDecoder is missing but VideoFrame exists', async () => {
    vi.stubGlobal('VideoDecoder', undefined);
    await scanStableFrames(file(), vi.fn(), messages);
    expect(mocks.open).toHaveBeenCalledOnce();
  });

  it('falls back to playback when LibAV cannot load', async () => {
    mocks.canDecode.mockResolvedValue(false);
    mocks.open.mockRejectedValue(new Error('WASM unavailable'));
    const mode = vi.fn();
    await scanStableFrames(file(), vi.fn(), messages, undefined, mode);
    expect(mode.mock.calls).toEqual([['compat']]);
    expect(mocks.play).toHaveBeenCalledOnce();
  });

  it('skips LibAV when VideoFrame is missing', async () => {
    vi.stubGlobal('VideoDecoder', undefined);
    vi.stubGlobal('VideoFrame', undefined);
    await scanStableFrames(file(), vi.fn(), messages);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.play).toHaveBeenCalledOnce();
  });

  it('does not start playback after cancellation in the software decoder', async () => {
    mocks.canDecode.mockResolvedValue(false);
    mocks.open.mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    await expect(scanStableFrames(file(), vi.fn(), messages)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.play).not.toHaveBeenCalled();
  });
  it('rejects playback cancellation and releases the video URL', async () => {
    vi.stubGlobal('VideoDecoder', undefined);
    vi.stubGlobal('VideoFrame', undefined);
    const controller = new AbortController();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    mocks.play.mockImplementationOnce(() => controller.abort());
    await expect(scanStableFrames(file(), vi.fn(), messages, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.pause).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledOnce();
  });

  it('disposes a failing software session before starting playback', async () => {
    mocks.canDecode.mockResolvedValue(false);
    mocks.open.mockResolvedValue({
      dispose: mocks.disposeSession,
      async *frames() {
        await Promise.resolve();
        throw new Error('Unsupported decoded pixel format');
      },
    });
    await scanStableFrames(file(), vi.fn(), messages);
    expect(mocks.disposeSession).toHaveBeenCalledOnce();
    expect(mocks.play).toHaveBeenCalledOnce();
    expect(mocks.disposeSession.mock.invocationCallOrder[0]).toBeLessThan(mocks.play.mock.invocationCallOrder[0]);
  });
});
