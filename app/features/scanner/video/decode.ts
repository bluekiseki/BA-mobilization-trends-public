import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { FrameSource } from '../core/types';
import { MAX_VIDEO_DURATION_SECONDS, UseCompatDecoderError, VideoTooLongError } from './errors';
import type { LibAVDecodeSession } from './libavDecodeSession';
import type { InventoryVideoScanner } from './scanner';
import type { VideoScanNotifier, VideoScanOutput } from './types';

const MAX_DECODE_DIMENSION = 2560;
const PROGRESS_EVERY_FRAMES = 10;

interface DecodedFrame {
  source: FrameSource;
  timestamp: number;
  release: () => void;
}

/**
 * Decodes every frame in order and feeds it to the scanner; inference runs only on selected keyframes.
 * WebCodecs first; a software WASM decoder (libav.js) when WebCodecs cannot decode the codec. Real-time playback
 * capture (client.ts) is used only when the WASM decoder itself cannot be loaded.
 */
export async function scanVideoFile(file: Blob, scanner: InventoryVideoScanner, notify: VideoScanNotifier, checkCancelled: () => void): Promise<VideoScanOutput> {
  const started = performance.now();
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  let wasm: LibAVDecodeSession | null = null;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new UseCompatDecoderError('No video track is available.');
    const duration = (await track.getDurationFromMetadata()) ?? (await track.computeDuration());
    if (duration > MAX_VIDEO_DURATION_SECONDS) throw new VideoTooLongError(`Video is ${Math.round(duration)}s long; the limit is ${MAX_VIDEO_DURATION_SECONDS}s.`);

    const displayWidth = await track.getDisplayWidth();
    const displayHeight = await track.getDisplayHeight();
    let frames: AsyncIterable<DecodedFrame>;
    if (typeof VideoDecoder === 'undefined' || !(await track.canDecode())) {
      // The software path converts frames through VideoFrame, so without it only real-time playback works.
      if (typeof VideoFrame === 'undefined') throw new UseCompatDecoderError('Software video conversion requires VideoFrame.');
      // Lazy-loaded only on fallback.
      try {
        const { LibAVDecodeSession } = await import('./libavDecodeSession');
        checkCancelled();
        wasm = await LibAVDecodeSession.open(file, MAX_DECODE_DIMENSION, { copyoutFrame: 'video' });
      } catch (error) {
        checkCancelled();
        if (error instanceof Error && error.name === 'AbortError') throw error;
        notify.log(`libav.js software decoder could not be loaded: ${error instanceof Error ? error.message : String(error)}`, 'warn');
        throw new UseCompatDecoderError('This codec cannot be decoded directly.');
      }
      notify.log(`Decoding with libav.js (software WASM): ${duration.toFixed(1)}s, ${wasm.width}x${wasm.height}`);
      const session = wasm;
      frames = (async function* () {
        for await (const frame of session.frames()) yield { source: frame.bitmap, timestamp: frame.timestamp, release: () => frame.bitmap.close() };
      })();
    } else {
      const longSide = Math.max(displayWidth, displayHeight);
      const scale = longSide > MAX_DECODE_DIMENSION ? MAX_DECODE_DIMENSION / longSide : 1;
      const sink = new CanvasSink(track, { poolSize: 2, ...(scale < 1 ? { width: Math.round(displayWidth * scale), height: Math.round(displayHeight * scale) } : {}) });
      notify.log(`Decoding with WebCodecs: ${duration.toFixed(1)}s, ${Math.round(displayWidth * scale)}x${Math.round(displayHeight * scale)}`);
      frames = (async function* () {
        // Pooled canvases are reused by the sink, so there is nothing to release.
        for await (const frame of sink.canvases()) yield { source: frame.canvas, timestamp: frame.timestamp, release: () => undefined };
      })();
    }

    let index = 0;
    const decoderSetupMs = performance.now() - started;
    let decodeWaitMs = 0;
    let waitStarted = performance.now();
    for await (const frame of frames) {
      decodeWaitMs += performance.now() - waitStarted;
      try {
        checkCancelled();
        await scanner.frame(frame.source, frame.timestamp, index++);
      } finally {
        frame.release();
      }
      if (index % PROGRESS_EVERY_FRAMES === 0) {
        notify.progress(Math.min(98, (frame.timestamp / duration) * 98), `${frame.timestamp.toFixed(1)} / ${duration.toFixed(1)}s · ${scanner.cellCount} cells`);
      }
      waitStarted = performance.now();
    }
    decodeWaitMs += performance.now() - waitStarted;
    const output = scanner.finish(duration);
    output.metrics.decoder = wasm ? 'wasm' : 'webcodecs';
    output.metrics.timings.decoderSetupMs = decoderSetupMs;
    output.metrics.timings.decodeWaitMs = decodeWaitMs;
    return output;
  } finally {
    wasm?.dispose();
    input.dispose();
  }
}
