import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { crop, imageDataFromBitmap, imageDataToCanvas, unionBoxes } from './image';
import { NAMEPLATE } from './calibration';
import { locateAnchors, tenSegmentSampleIndices, voteFixedLayout } from './layout';
import { fractionBox } from './image';
import type { Anchors, CandidateFrame, FixedLayout } from '../types';

type VideoFrameCallbackMetadata = { mediaTime: number; presentedFrames: number };
type VideoWithCallback = HTMLVideoElement & { requestVideoFrameCallback?: (callback: (now: number, metadata: VideoFrameCallbackMetadata) => void) => number };
export type DecoderMode = 'checking' | 'webcodecs' | 'compat';
export interface VideoProgressMessages {
  fastDecode: (current: string, duration: string, candidates: number) => string;
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

// Keep candidate frames at the video's display resolution. Type/terrain
// pixels are only a few dozen pixels wide; downscaling them changes the
// sampled colour and no longer matches the Python/OpenCV pipeline.
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
    for await (const frame of sink.canvases()) {
      throwIfAborted(signal);
      frameCounter += 1;
      if (!pending.width) {
        pending.width = frame.canvas.width;
        pending.height = frame.canvas.height;
      }
      const current = sampleGray(frame.canvas);
      if (previous) {
        let total = 0;
        for (let i = 0; i < current.length; i += 1) total += Math.abs(current[i] - previous[i]);
        if (total / current.length < 1.0) {
          pendingContext.drawImage(frame.canvas, 0, 0);
          pendingFrame = frameCounter;
          pendingTime = frame.timestamp;
          stableRun = true;
        } else if (stableRun) await flush();
      }
      previous = current;
      onProgress(Math.min(1, duration > 0 ? (frame.timestamp + frame.duration) / duration : 0), messages.fastDecode(frame.timestamp.toFixed(1), duration.toFixed(1), candidates.length));
    }
    await flush();
    return candidates;
  } finally {
    input.dispose();
  }
};

const scanStableFramesRealtime = async (file: File, onProgress: (fraction: number, detail: string) => void, messages: VideoProgressMessages, signal?: AbortSignal): Promise<CandidateFrame[]> => {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video') as VideoWithCallback;
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Unable to read video'));
  });
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
  let stopped = false;
  const candidates: CandidateFrame[] = [];
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
    if (previous) {
      let total = 0;
      for (let i = 0; i < current.length; i += 1) total += Math.abs(current[i] - previous[i]);
      if (total / current.length < 1.0) {
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
        void processFrame(metadata);
      });
    else
      requestAnimationFrame(() => {
        void processFrame({ mediaTime: video.currentTime, presentedFrames: ++frameCounter });
      });
  };
  // 1x preserves every presented frame. Short holds in dense swipe videos
  // can disappear when browsers drop frames at accelerated playback.
  video.playbackRate = 1;
  const ended = new Promise<void>((resolve) => {
    video.onended = async () => {
      stopped = true;
      await flush();
      resolve();
    };
  });
  schedule();
  await video.play();
  await ended;
  URL.revokeObjectURL(url);
  return candidates;
};

export const scanStableFrames = async (
  file: File,
  onProgress: (fraction: number, detail: string) => void,
  messages: VideoProgressMessages,
  signal?: AbortSignal,
  onMode?: (mode: DecoderMode) => void,
): Promise<CandidateFrame[]> => {
  if ('VideoDecoder' in globalThis) {
    try {
      return await scanStableFramesWebCodecs(file, onProgress, messages, signal, () => onMode?.('webcodecs'));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      console.error('[BA Student Status] WebCodecs fast decoding failed; switching to compatibility playback.', {
        error,
        file: { name: file.name, type: file.type, size: file.size },
        userAgent: navigator.userAgent,
      });
      onMode?.('compat');
      onProgress(0, messages.compatFallback);
    }
  } else {
    console.warn('[BA Student Status] VideoDecoder API is unavailable; using compatibility playback.', {
      secureContext: globalThis.isSecureContext,
      userAgent: navigator.userAgent,
    });
    onMode?.('compat');
  }
  return scanStableFramesRealtime(file, onProgress, messages, signal);
};

const signature = (image: ImageData, anchors: Anchors): Uint8Array => {
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

export const prepareVideoCandidates = async (
  candidates: CandidateFrame[],
  onProgress: (fraction: number, detail: string) => void,
  messages: VideoProgressMessages,
): Promise<{ candidates: CandidateFrame[]; layout: FixedLayout | null }> => {
  const sampleIndices = tenSegmentSampleIndices(candidates.length);
  const sampleImages: ImageData[] = [];
  for (let i = 0; i < sampleIndices.length; i += 1) {
    sampleImages.push(await loadImageData(candidates[sampleIndices[i]].blob));
    onProgress(((i + 1) / sampleIndices.length) * 0.35, messages.layoutSample(i + 1, sampleIndices.length));
  }
  const layout = voteFixedLayout(sampleImages);
  const signed: { candidate: CandidateFrame; signature: Uint8Array | null }[] = [];
  let rejected = 0;
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const image = await loadImageData(candidates[i].blob);
    const anchors = layout?.anchors ?? locateAnchors(image);
    // A motionless loading/title frame is stable too, but it is not a
    // student page. When layout voting fell back to per-frame detection,
    // exclude such frames here instead of letting one abort the whole run.
    if (!anchors) {
      rejected += 1;
      onProgress(0.35 + ((candidates.length - i) / Math.max(1, candidates.length)) * 0.65, messages.deduplicateRejected(rejected, candidates.length - i, candidates.length));
      continue;
    }
    signed.push({ candidate: candidates[i], signature: anchors ? signature(image, anchors) : null });
    onProgress(0.35 + ((candidates.length - i) / Math.max(1, candidates.length)) * 0.65, messages.deduplicate(candidates.length - i, candidates.length));
  }
  const kept: CandidateFrame[] = [];
  let previous: Uint8Array | null = null;
  for (const item of signed) {
    let same = false;
    if (previous && item.signature) {
      let total = 0;
      for (let p = 0; p < previous.length; p += 1) total += Math.abs(previous[p] - item.signature[p]);
      same = total / previous.length < 8;
    }
    if (!same) {
      kept.push(item.candidate);
      previous = item.signature;
    }
  }
  kept.reverse();
  return { candidates: kept, layout };
};
