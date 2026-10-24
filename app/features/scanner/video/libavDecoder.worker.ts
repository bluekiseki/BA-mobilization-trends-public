// Software H.264/HEVC decoding (decoder-only libav.js build) on its own core.
// This worker demuxes the file itself and keeps decoding ahead while the scan worker's thread is busy with analysis;
// the scan worker only returns consumption counts. Each frame is copied out of the WASM heap once into a YUV buffer
// and queued here. Shortly before it is needed, the buffer is adopted by a VideoFrame and drawn with mediabunny's
// own CanvasSink drawing (fit, rotation, scaling) onto an OffscreenCanvas, so the single YUV to RGBA conversion also
// runs off the scan thread. The result is transferred as an ImageBitmap, never cloned.
import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input, VideoSample, type VideoSamplePixelFormat } from 'mediabunny';
import type { LibAVDecodedFrame, LibAVDecoderRequest, LibAVDecoderResponse, LibAVInstance, LibAVModule, LibAVPacketIn, LibAVPlaneLayout } from './libavProtocol';

import { packLibAVPlanes } from './libavPlanes';

const AV_PKT_FLAG_KEY = 1;
const TIME_BASE: [number, number] = [1, 1_000_000];

const PIXEL_FORMATS: Record<number, VideoSamplePixelFormat> = {
  0: 'I420', // yuv420p
  4: 'I422', // yuv422p
  5: 'I444', // yuv444p
  12: 'I420', // yuvj420p (full range)
  13: 'I422', // yuvj422p
  14: 'I444', // yuvj444p
  62: 'I420P10', // yuv420p10le
};
const FULL_RANGE_FORMATS = new Set([12, 13, 14]);

interface QueuedFrame {
  data: ArrayBuffer;
  format: number;
  width: number;
  height: number;
  layout: LibAVPlaneLayout[];
  timestamp: number;
  duration: number;
}

let consumed = 0;
let onConsumed: (() => void) | null = null;

const send = (message: LibAVDecoderResponse, transfer: Transferable[] = []): void => {
  self.postMessage(message, { transfer });
};

async function loadLibAV(base: string, loader: string): Promise<LibAVInstance> {
  const mod = (await import(/* @vite-ignore */ `${base}/${loader}`)) as { default?: LibAVModule; LibAV?: LibAVModule['LibAV'] };
  const factory = mod.default ?? (mod.LibAV ? { LibAV: mod.LibAV } : null);
  if (!factory) throw new Error('libav.js loader has no LibAV export');
  return factory.LibAV({ noworker: true, nothreads: true, base });
}

async function run(request: Extract<LibAVDecoderRequest, { type: 'start' }>): Promise<void> {
  let phase: 'load' | 'decode' = 'load';
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(request.file) });
  try {
    const [libav, track] = await Promise.all([loadLibAV(request.base, request.loader), input.getPrimaryVideoTrack()]);
    if (!track) throw new Error('No video track is available.');
    const codec = await track.getCodec();
    if (codec !== 'avc' && codec !== 'hevc') throw new Error(`Unsupported codec ${codec ?? 'unknown'}`);
    const config = await track.getDecoderConfig();
    let extradata: Uint8Array | undefined;
    const description = config?.description;
    if (description) extradata = ArrayBuffer.isView(description) ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength).slice() : new Uint8Array(description).slice();
    const codedWidth = await track.getCodedWidth();
    const codedHeight = await track.getCodedHeight();
    const [, c, pkt, frame] = await libav.ff_init_decoder(codec === 'hevc' ? 'hevc' : 'h264', {
      // codec_id 0 lets libav.js take the id from the decoder found by name.
      codecpar: { codec_type: 0, codec_id: 0, format: -1, width: codedWidth, height: codedHeight, ...(extradata ? { extradata } : {}) },
      time_base: TIME_BASE,
    });
    // Output size and rotation exactly as decode.ts configures CanvasSink on the WebCodecs path.
    const displayWidth = await track.getDisplayWidth();
    const displayHeight = await track.getDisplayHeight();
    const rotation = await track.getRotation();
    const longSide = Math.max(displayWidth, displayHeight);
    const scale = longSide > request.maxDimension ? request.maxDimension / longSide : 1;
    const width = scale < 1 ? Math.round(displayWidth * scale) : displayWidth;
    const height = scale < 1 ? Math.round(displayHeight * scale) : displayHeight;
    const canvas = new OffscreenCanvas(width, height);
    // CanvasSink uses an alpha canvas on Firefox and fills it black; for opaque video every pixel is overwritten anyway.
    // willReadFrequently keeps the canvas CPU-backed, so the YUV conversion runs on this core and the resulting bitmap
    // moves to the scan worker without a GPU readback.
    const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!context) throw new Error('OffscreenCanvas 2D context is not available');
    send({ type: 'ready', codec, width, height });
    phase = 'decode';

    const useVideoFrame = typeof VideoFrame !== 'undefined';
    const configured = config?.colorSpace;
    const colorSpaceFor = (format: number): VideoColorSpaceInit => ({
      // Same defaults Chromium's WebCodecs path gets from mediabunny, so the YUV to RGB conversion matches.
      primaries: configured?.primaries ?? 'bt709',
      matrix: configured?.matrix ?? 'bt709',
      transfer: configured?.transfer ?? 'bt709',
      fullRange: configured?.fullRange ?? FULL_RANGE_FORMATS.has(format),
    });

    // Original packet timing, keyed by the integer pts handed to libav, so frames carry mediabunny's exact values.
    const timing = new Map<number, { timestamp: number; duration: number }>();
    const queue: QueuedFrame[] = [];
    let queuedBytes = 0;
    let decoded = 0;
    let posted = 0;
    let decodeMs = 0;
    let demuxMs = 0;
    let convertMs = 0;
    let creditWaitMs = 0;
    let peakQueuedFrames = 0;
    let peakQueuedBytes = 0;
    let frameBytes = Math.ceil(codedWidth * codedHeight * 1.5);
    const frameLimit = () => Math.max(request.minQueuedFrames, Math.min(request.maxQueuedFrames, Math.floor(request.maxQueuedBytes / frameBytes)));

    const enqueue = (frames: LibAVDecodedFrame[]) => {
      for (const out of frames) {
        const pts = out.pts ?? 0;
        const time = timing.get(pts) ?? { timestamp: pts / 1_000_000, duration: 0 };
        timing.delete(pts);
        const view = out.data;
        // libav.js already copied the frame out of the WASM heap; keep that buffer when it is exactly the array.
        const packed = request.copyoutFrame === 'video' ? packLibAVPlanes(out) : null;
        const data = packed?.data ?? (view.byteOffset === 0 && view.buffer instanceof ArrayBuffer && view.byteLength === view.buffer.byteLength ? view.buffer : view.slice().buffer);
        frameBytes = data.byteLength;
        queue.push({ data, format: out.format, width: out.width ?? 0, height: out.height ?? 0, layout: packed?.layout ?? out.layout ?? [], timestamp: time.timestamp, duration: time.duration });
        queuedBytes += data.byteLength;
        decoded++;
        if (queue.length > peakQueuedFrames) peakQueuedFrames = queue.length;
        if (queuedBytes > peakQueuedBytes) peakQueuedBytes = queuedBytes;
      }
    };

    // Converts and posts queued frames while fewer than `maxConvertedAhead` are waiting in the scan worker.
    const convertAhead = (): void => {
      while (queue.length > 0 && posted - consumed < request.maxConvertedAhead) {
        const next = queue.shift();
        if (!next) break;
        queuedBytes -= next.data.byteLength;
        const format = PIXEL_FORMATS[next.format];
        if (!format) throw new Error(`Unsupported decoded pixel format ${next.format}`);
        const colorSpace = colorSpaceFor(next.format);
        const started = performance.now();
        const layout = next.layout.length > 0 ? next.layout : undefined;
        let sample: VideoSample;
        if (useVideoFrame && (format === 'I420' || format === 'I422' || format === 'I444')) {
          // `transfer` is part of WebCodecs but not yet in the TypeScript DOM types; it lets the frame adopt the buffer.
          const init: VideoFrameBufferInit & { transfer?: ArrayBuffer[] } = {
            format,
            codedWidth: next.width,
            codedHeight: next.height,
            timestamp: Math.round(next.timestamp * 1_000_000),
            colorSpace,
            ...(layout ? { layout } : {}),
            transfer: [next.data],
          };
          sample = new VideoSample(new VideoFrame(next.data, init));
        } else {
          // Mediabunny converts formats not accepted directly by VideoFrame; drawing still requires VideoFrame.
          sample = new VideoSample(next.data, { format, codedWidth: next.width, codedHeight: next.height, timestamp: next.timestamp, colorSpace, ...(layout ? { layout } : {}) });
        }
        try {
          // Keep the inventory default; student anchors require CanvasSink's chroma interpolation even at 1:1.
          context.imageSmoothingEnabled = request.imageSmoothingEnabled ?? scale < 1;
          context.imageSmoothingQuality = 'high';
          context.fillStyle = 'black';
          context.fillRect(0, 0, width, height);
          sample.drawWithFit(context, { fit: 'fill', rotation });
        } finally {
          sample.close();
        }
        const bitmap = canvas.transferToImageBitmap();
        convertMs += performance.now() - started;
        send({ type: 'frame', bitmap, timestamp: next.timestamp, duration: next.duration }, [bitmap]);
        posted++;
      }
    };
    let failed: unknown = null;
    let creditWake: (() => void) | null = null;
    const wakeDecoder = () => {
      const wake = creditWake;
      creditWake = null;
      wake?.();
    };
    const fail = (error: unknown) => {
      failed ??= error;
      wakeDecoder();
    };
    onConsumed = () => {
      try {
        convertAhead();
      } catch (error) {
        fail(error);
      }
      wakeDecoder();
    };

    const packets = new EncodedPacketSink(track).packets();
    let demuxStarted = performance.now();
    for await (const packet of packets) {
      demuxMs += performance.now() - demuxStarted;
      if (failed) throw failed;
      if (decoded - consumed >= frameLimit()) {
        const waitStarted = performance.now();
        while (decoded - consumed >= frameLimit() && !failed) await new Promise<void>((resolve) => (creditWake = resolve));
        creditWaitMs += performance.now() - waitStarted;
        if (failed) throw failed;
      }
      const pts = Math.round(packet.timestamp * 1_000_000);
      timing.set(pts, { timestamp: packet.timestamp, duration: packet.duration });
      const packetIn: LibAVPacketIn = { data: packet.data, pts, ptshi: 0, flags: packet.type === 'key' ? AV_PKT_FLAG_KEY : 0 };
      const started = performance.now();
      // Packed planes (stride = width): Firefox ignores padded strides in VideoFrame layouts and draws sheared frames.
      const frames = await libav.ff_decode_multi(c, pkt, frame, [packetIn], { copyoutFrame: request.copyoutFrame ?? 'video_packed', ignoreErrors: true });
      decodeMs += performance.now() - started;
      enqueue(frames);
      if (frames.length > 0) convertAhead();
      demuxStarted = performance.now();
    }
    const started = performance.now();
    enqueue(await libav.ff_decode_multi(c, pkt, frame, [], { fin: true, copyoutFrame: request.copyoutFrame ?? 'video_packed', ignoreErrors: true }));
    decodeMs += performance.now() - started;
    await libav.ff_free_decoder(c, pkt, frame);
    // Hand over the remaining frames as the scan loop consumes them.
    while (queue.length > 0) {
      if (failed) throw failed;
      convertAhead();
      if (queue.length > 0) await new Promise<void>((resolve) => (creditWake = resolve));
    }
    if (failed) throw failed;
    send({ type: 'end', frames: posted, decodeMs, demuxMs, convertMs, creditWaitMs, peakQueuedFrames, peakQueuedBytes, framePath: useVideoFrame ? 'videoframe' : 'raw' });
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error), phase });
  } finally {
    input.dispose();
  }
}

self.addEventListener('message', (e: MessageEvent<LibAVDecoderRequest>) => {
  const data = e.data;
  if (data.type === 'consumed') {
    consumed = data.count;
    onConsumed?.();
  } else if (data.type === 'start') {
    void run(data);
  }
});
