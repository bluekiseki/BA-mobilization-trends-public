import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { crop, imageDataFromBitmap, imageDataToCanvas, unionBoxes } from './image';
import { NAMEPLATE } from './calibration';
import { tenSegmentSampleIndices, voteFixedLayout } from './layout';
import { fractionBox } from './image';
import type { Anchors, CandidateFrame, FixedLayout } from '../types';

type VideoFrameCallbackMetadata = { mediaTime: number; presentedFrames: number };
type VideoWithCallback = HTMLVideoElement & { requestVideoFrameCallback?: (callback: (now: number, metadata: VideoFrameCallbackMetadata) => void) => number };
export type DecoderMode = 'checking' | 'webcodecs' | 'libav' | 'compat';
export interface VideoProgressMessages {
  fastDecode: (current: string, duration: string, candidates: number) => string;
  softwareDecode: (current: string, duration: string, candidates: number) => string;
  softwareFallback: string;
  compatDecode: (current: string, duration: string, candidates: number) => string;
  compatFallback: string;
  layoutSample: (current: number, total: number) => string;
  deduplicate: (current: number, total: number) => string;
  deduplicateRejected: (rejected: number, current: number, total: number) => string;
}

const get2dContext = (canvas: HTMLCanvasElement, options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D => {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('2D canvas context not available');
  return context;
};

// Keep candidate frames at display resolution — downscaling would change the sampled colour
// of type/terrain pixels (only a few dozen px wide) and break the match with the reference pipeline.
const canvasBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Frame compression failed'))), 'image/jpeg', 0.92));

export const loadImageData = async (blob: Blob): Promise<ImageData> => {
  const bitmap = await createImageBitmap(blob);
  const image = imageDataFromBitmap(bitmap);
  bitmap.close();
  return image;
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');
};

// A local icon/badge swap (e.g. squad-type badge, weapon icon rendering a frame or two after the
// rest of the card) changes a tightly clustered patch of the frame; an actual swipe changes
// something in nearly every region of the card (portrait, background, panel) even when two
// consecutive students happen to have similar colors, which can make a plain whole-frame average
// diff dip surprisingly low for a genuine swipe. Splitting the frame into a grid and asking "how
// many regions changed at all" (not "how much did the frame change on average") stays reliable in
// both cases — validated frame-by-frame against five real recordings with different swipe
// styles/frame rates: every hold the previous (single whole-frame average) algorithm found is
// still represented within 150ms, with no lost or spuriously-added holds, while it also fixes
// cases where a lagging badge/icon was mistaken for the start of a swipe. A single combined
// number (e.g. the median cell diff) was tried and rejected — no one cutoff worked for both a
// recording with a lagging badge and one with fast, low-contrast swipes; the two thresholds below
// are the minimum that stayed correct on every tested recording.
const GRID_COLS = 8;
const GRID_ROWS = 4;
const CELL_MEAN_DIFF_THRESHOLD = 2.0;
const GRID_COVERAGE_STABLE_THRESHOLD = 0.25;

// Precomputed once: which of the GRID_COLS x GRID_ROWS cells each of the 160x74 sampled pixels
// belongs to, so the per-frame hot loop below only does an array lookup.
const CELL_INDEX = new Int32Array(160 * 74);
const CELL_PIXEL_COUNT = new Int32Array(GRID_COLS * GRID_ROWS);
{
  const cellW = Math.floor(160 / GRID_COLS);
  const cellH = Math.floor(74 / GRID_ROWS);
  for (let y = 0; y < 74; y += 1) {
    const gridY = Math.min(GRID_ROWS - 1, Math.floor(y / cellH));
    for (let x = 0; x < 160; x += 1) {
      const gridX = Math.min(GRID_COLS - 1, Math.floor(x / cellW));
      const cell = gridY * GRID_COLS + gridX;
      CELL_INDEX[y * 160 + x] = cell;
      CELL_PIXEL_COUNT[cell] += 1;
    }
  }
}

// True once enough grid cells have a real average change to call it motion (a swipe) rather than
// a single lagging UI layer settling into place.
const isMotion = (current: Uint8Array, previous: Uint8Array): boolean => {
  const cellDiffSum = new Float64Array(GRID_COLS * GRID_ROWS);
  for (let i = 0; i < current.length; i += 1) {
    cellDiffSum[CELL_INDEX[i]] += Math.abs(current[i] - previous[i]);
  }
  let touched = 0;
  for (let c = 0; c < cellDiffSum.length; c += 1) {
    if (cellDiffSum[c] / CELL_PIXEL_COUNT[c] > CELL_MEAN_DIFF_THRESHOLD) touched += 1;
  }
  return touched / cellDiffSum.length >= GRID_COVERAGE_STABLE_THRESHOLD;
};

interface ScanFrame {
  canvas: CanvasImageSource & { width: number; height: number };
  timestamp: number;
  duration: number;
  close?: () => void;
}

const collectStableFrames = async (
  frames: AsyncIterable<ScanFrame>,
  duration: number,
  onProgress: (fraction: number, detail: string) => void,
  message: VideoProgressMessages['fastDecode'],
  signal?: AbortSignal,
): Promise<CandidateFrame[]> => {
  const pending = document.createElement('canvas');
  pending.width = 0;
  pending.height = 0;
  const small = document.createElement('canvas');
  small.width = 160;
  small.height = 74;
  const pendingContext = get2dContext(pending);
  const smallContext = get2dContext(small, { willReadFrequently: true });
  let previous: Uint8Array | null = null;
  let stableRun = false;
  let pendingFrame = 0;
  let pendingTime = 0;
  let frameCounter = 0;
  const candidates: CandidateFrame[] = [];
  const sampleGray = (canvas: CanvasImageSource) => {
    smallContext.drawImage(canvas, 0, 0, 160, 74);
    const pixels = smallContext.getImageData(0, 0, 160, 74).data;
    const gray = new Uint8Array(160 * 74);
    for (let p = 0; p < gray.length; p += 1) {
      const i = p * 4;
      gray[p] = Math.round(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
    }
    return gray;
  };
  const flush = async () => {
    if (stableRun) candidates.push({ frameIndex: pendingFrame, time: pendingTime, blob: await canvasBlob(pending) });
    stableRun = false;
  };
  for await (const frame of frames) {
    try {
      throwIfAborted(signal);
      frameCounter += 1;
      if (!pending.width) {
        pending.width = frame.canvas.width;
        pending.height = frame.canvas.height;
      }
      const current = sampleGray(frame.canvas);
      if (previous) {
        if (!isMotion(current, previous)) {
          pendingContext.drawImage(frame.canvas, 0, 0);
          pendingFrame = frameCounter;
          pendingTime = frame.timestamp;
          stableRun = true;
        } else if (stableRun) await flush();
      }
      previous = current;
      onProgress(Math.min(1, duration > 0 ? (frame.timestamp + frame.duration) / duration : 0), message(frame.timestamp.toFixed(1), duration.toFixed(1), candidates.length));
    } finally {
      frame.close?.();
    }
  }
  throwIfAborted(signal);
  await flush();
  return candidates;
};

const scanStableFramesWebCodecs = async (
  file: File,
  onProgress: (fraction: number, detail: string) => void,
  messages: VideoProgressMessages,
  signal?: AbortSignal,
  onReady?: () => void,
): Promise<CandidateFrame[]> => {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Video track not found');
    const codec = await track.getCodec();
    const codecString = await track.getCodecParameterString();
    const decodable = await track.canDecode();
    if (!decodable) {
      throw new Error(`This browser cannot decode the video track with WebCodecs. codec=${codec ?? 'unknown'}, codecString=${codecString ?? 'unknown'}`);
    }
    onReady?.();
    const duration = (await track.getDurationFromMetadata()) ?? (await track.computeDuration());
    const sink = new CanvasSink(track, { poolSize: 2 });
    return await collectStableFrames(sink.canvases(), duration, onProgress, messages.fastDecode, signal);
  } finally {
    input.dispose();
  }
};

const scanStableFramesLibAV = async (
  file: File,
  onProgress: (fraction: number, detail: string) => void,
  messages: VideoProgressMessages,
  signal?: AbortSignal,
  onReady?: () => void,
): Promise<CandidateFrame[]> => {
  // Mediabunny's raw YUV renderer also requires VideoFrame internally.
  if (typeof VideoFrame === 'undefined') throw new Error('Software video conversion requires VideoFrame');
  throwIfAborted(signal);
  const { LibAVDecodeSession } = await import('../../video/libavDecodeSession');
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  let session: Awaited<ReturnType<typeof LibAVDecodeSession.open>> | null = null;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Video track not found');
    const duration = (await track.getDurationFromMetadata()) ?? (await track.computeDuration());
    session = await LibAVDecodeSession.open(file, Number.MAX_SAFE_INTEGER, {
      signal,
      maxQueuedBytes: 16 * 1024 * 1024,
      minQueuedFrames: 1,
      maxQueuedFrames: 8,
      maxConvertedAhead: 2,
      // Keep chroma interpolation identical to CanvasSink for the colour-based student anchors.
      imageSmoothingEnabled: true,
      copyoutFrame: 'video',
    });
    onReady?.();
    async function* canvases(): AsyncGenerator<ScanFrame> {
      if (!session) return;
      for await (const frame of session.frames()) {
        yield { canvas: frame.bitmap, timestamp: frame.timestamp, duration: frame.duration, close: () => frame.bitmap.close() };
      }
    }
    return await collectStableFrames(canvases(), duration, onProgress, messages.softwareDecode, signal);
  } finally {
    session?.dispose();
    input.dispose();
  }
};

const scanStableFramesRealtime = async (file: File, onProgress: (fraction: number, detail: string) => void, messages: VideoProgressMessages, signal?: AbortSignal): Promise<CandidateFrame[]> => {
  throwIfAborted(signal);
  const url = URL.createObjectURL(file);
  const video = document.createElement('video') as VideoWithCallback;
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  let stopped = false;
  let rejectPlayback: ((reason: unknown) => void) | undefined;
  const abort = () => {
    stopped = true;
    video.pause();
    rejectPlayback?.(new DOMException('Scan cancelled', 'AbortError'));
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      rejectPlayback = reject;
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Unable to read video'));
      if (signal?.aborted) abort();
    });
    throwIfAborted(signal);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = get2dContext(canvas, { willReadFrequently: true });
    const pending = document.createElement('canvas');
    pending.width = canvas.width;
    pending.height = canvas.height;
    const pendingContext = get2dContext(pending);
    const small = document.createElement('canvas');
    small.width = 160;
    small.height = 74;
    const smallContext = get2dContext(small, { willReadFrequently: true });
    let previous: Uint8Array | null = null;
    let stableRun = false;
    let pendingFrame = 0;
    let pendingTime = 0;
    let frameCounter = 0;
    const candidates: CandidateFrame[] = [];

    // Adaptive playback-rate backoff: real-time playback plus per-frame canvas work can fall
    // behind when the browser can't keep up (e.g. software HEVC decode, or the host machine busy
    // with other work) — the browser then silently drops presented frames before we ever see them.
    // getVideoPlaybackQuality().droppedVideoFrames is a standard, cumulative count of exactly that,
    // so back off playbackRate only when drops are actually happening, rather than guessing a fixed
    // slower speed up front. Ratchets down only (never speeds back up) — simple and adequate for a
    // one-shot scan; not universally supported, so this is a no-op where the API is unavailable.
    const supportsPlaybackQuality = typeof video.getVideoPlaybackQuality === 'function';
    const PLAYBACK_RATE_FLOOR = 0.15;
    const PLAYBACK_BACKOFF_FACTOR = 0.5;
    const DROP_CHECK_FRAME_INTERVAL = 30;
    let lastDroppedFrames = 0;
    let lastCheckedAtFrame = 0;
    const maybeBackOffPlaybackRate = () => {
      if (!supportsPlaybackQuality) return;
      if (frameCounter - lastCheckedAtFrame < DROP_CHECK_FRAME_INTERVAL) return;
      lastCheckedAtFrame = frameCounter;
      const dropped = video.getVideoPlaybackQuality().droppedVideoFrames;
      if (dropped > lastDroppedFrames && video.playbackRate > PLAYBACK_RATE_FLOOR) {
        const next = Math.max(PLAYBACK_RATE_FLOOR, video.playbackRate * PLAYBACK_BACKOFF_FACTOR);
        console.warn(
          `[BA Student Status] Detected ${dropped - lastDroppedFrames} dropped video frame(s); slowing compatibility playback from ${video.playbackRate.toFixed(2)}x to ${next.toFixed(2)}x.`,
        );
        video.playbackRate = next;
      }
      lastDroppedFrames = dropped;
    };
    const sampleGray = () => {
      smallContext.drawImage(canvas, 0, 0, 160, 74);
      const pixels = smallContext.getImageData(0, 0, 160, 74).data;
      const gray = new Uint8Array(160 * 74);
      for (let p = 0; p < gray.length; p += 1) {
        const i = p * 4;
        gray[p] = Math.round(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
      }
      return gray;
    };
    const flush = async () => {
      if (stableRun) candidates.push({ frameIndex: pendingFrame, time: pendingTime, blob: await canvasBlob(pending) });
      stableRun = false;
    };
    const processFrame = async (metadata: VideoFrameCallbackMetadata) => {
      if (stopped) return;
      if (signal?.aborted) {
        stopped = true;
        video.pause();
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const current = sampleGray();
      frameCounter = metadata.presentedFrames || frameCounter + 1;
      maybeBackOffPlaybackRate();
      if (previous) {
        if (!isMotion(current, previous)) {
          pendingContext.drawImage(canvas, 0, 0);
          pendingFrame = frameCounter;
          pendingTime = metadata.mediaTime;
          stableRun = true;
        } else if (stableRun) await flush();
      }
      previous = current;
      onProgress(Math.min(1, metadata.mediaTime / video.duration), messages.compatDecode(metadata.mediaTime.toFixed(1), video.duration.toFixed(1), candidates.length));
      if (!video.ended && !stopped) schedule();
    };
    const schedule = () => {
      if (video.requestVideoFrameCallback)
        video.requestVideoFrameCallback((_now, metadata) => {
          void processFrame(metadata).catch((error: unknown) => rejectPlayback?.(error));
        });
      else
        requestAnimationFrame(() => {
          void processFrame({ mediaTime: video.currentTime, presentedFrames: ++frameCounter }).catch((error: unknown) => rejectPlayback?.(error));
        });
    };
    // Start at 1x — preserves every presented frame when the browser can keep up. Short holds in
    // dense swipe videos can disappear when browsers drop frames, which maybeBackOffPlaybackRate
    // above corrects for mid-scan if it actually happens.
    video.playbackRate = 1;
    const ended = new Promise<void>((resolve, reject) => {
      rejectPlayback = reject;
      video.onerror = () => reject(new Error('Unable to play video'));
      video.onended = () => {
        stopped = true;
        void flush().then(resolve, reject);
      };
      schedule();
      void video.play().catch(reject);
      if (signal?.aborted) abort();
    });
    await ended;
    throwIfAborted(signal);
    return candidates;
  } finally {
    stopped = true;
    signal?.removeEventListener('abort', abort);
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
};

export const scanStableFrames = async (
  file: File,
  onProgress: (fraction: number, detail: string) => void,
  messages: VideoProgressMessages,
  signal?: AbortSignal,
  onMode?: (mode: DecoderMode) => void,
): Promise<CandidateFrame[]> => {
  throwIfAborted(signal);
  if (typeof VideoDecoder !== 'undefined') {
    try {
      return await scanStableFramesWebCodecs(file, onProgress, messages, signal, () => onMode?.('webcodecs'));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      console.error('[BA Student Status] WebCodecs fast decoding failed; trying software decoding.', {
        error,
        file: { name: file.name, type: file.type, size: file.size },
        userAgent: navigator.userAgent,
      });
    }
  }
  throwIfAborted(signal);
  if (typeof VideoFrame !== 'undefined') {
    onProgress(0, messages.softwareFallback);
    try {
      return await scanStableFramesLibAV(file, onProgress, messages, signal, () => onMode?.('libav'));
    } catch (error) {
      throwIfAborted(signal);
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      console.warn('[BA Student Status] Software decoding failed; using compatibility playback.', error);
    }
  }
  throwIfAborted(signal);
  onMode?.('compat');
  onProgress(0, messages.compatFallback);
  return scanStableFramesRealtime(file, onProgress, messages, signal);
};

// A small grayscale fingerprint of the nameplate area (name/star/badge icons), used to tell two
// candidates apart without comparing full frames. Exported so the caller can decode each raw
// candidate exactly once and reuse that same ImageData for both the dedup decision and (when
// kept) student extraction, instead of prepareVideoCandidates and extractStudent each decoding
// the blob separately.
export const computeCandidateSignature = (image: ImageData, anchors: Anchors): Uint8Array => {
  const anchorBox = unionBoxes([
    anchors.damageBadge,
    anchors.armorBadge,
    ...anchors.moodCircles.map((circle) => ({ x: circle.x - circle.radius, y: circle.y - circle.radius, width: circle.radius * 2, height: circle.radius * 2 })),
  ]);
  const box = unionBoxes([anchorBox, fractionBox(anchorBox, NAMEPLATE.studentName), fractionBox(anchorBox, NAMEPLATE.starGrade)]);
  const source = imageDataToCanvas(crop(image, box));
  const target = document.createElement('canvas');
  target.width = 160;
  target.height = 100;
  const context = get2dContext(target, { willReadFrequently: true });
  context.drawImage(source, 0, 0, 160, 100);
  const pixels = context.getImageData(0, 0, 160, 100).data;
  const gray = new Uint8Array(160 * 100);
  for (let p = 0; p < gray.length; p += 1) {
    const i = p * 4;
    gray[p] = Math.round(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
  }
  return gray;
};

// True if two candidate signatures are close enough to be the same held student card.
export const isDuplicateSignature = (a: Uint8Array | null, b: Uint8Array | null): boolean => {
  if (!a || !b) return false;
  let total = 0;
  for (let p = 0; p < a.length; p += 1) total += Math.abs(a[p] - b[p]);
  return total / a.length < 8;
};

// Votes a single fixed anchor/panel layout from ~10 sample frames across the video, so per-frame
// extraction can skip its own (more expensive) layout detection. Candidate dedup now happens
// alongside extraction in pipeline.client.ts, decoding each raw candidate only once.
export const detectVideoLayout = async (
  candidates: CandidateFrame[],
  onProgress: (fraction: number, detail: string) => void,
  messages: Pick<VideoProgressMessages, 'layoutSample'>,
): Promise<FixedLayout | null> => {
  const sampleIndices = tenSegmentSampleIndices(candidates.length);
  const sampleImages: ImageData[] = [];
  for (let i = 0; i < sampleIndices.length; i += 1) {
    sampleImages.push(await loadImageData(candidates[sampleIndices[i]].blob));
    onProgress((i + 1) / sampleIndices.length, messages.layoutSample(i + 1, sampleIndices.length));
  }
  return voteFixedLayout(sampleImages);
};
