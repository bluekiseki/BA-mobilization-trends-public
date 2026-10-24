// Messages between the scan worker and the libav.js decoder worker, plus the subset of the libav.js API that is used.

export type LibAVDecoderRequest =
  | {
      type: 'start';
      file: Blob;
      base: string;
      loader: string;
      /** Long-side cap applied while drawing, the same rule as the WebCodecs path. */
      maxDimension: number;
      maxQueuedBytes: number;
      minQueuedFrames: number;
      maxQueuedFrames: number;
      maxConvertedAhead: number;
      imageSmoothingEnabled?: boolean;
      copyoutFrame?: 'video' | 'video_packed';
    }
  /** Total number of frames the scan loop has taken so far; frees prefetch credit in the decoder worker. */
  | { type: 'consumed'; count: number };

export type LibAVDecoderResponse =
  | { type: 'ready'; codec: string; width: number; height: number }
  /** Frame already converted to RGBA, rotated and scaled exactly like mediabunny's CanvasSink does. */
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number; duration: number }
  | {
      type: 'end';
      frames: number;
      decodeMs: number;
      demuxMs: number;
      convertMs: number;
      creditWaitMs: number;
      peakQueuedFrames: number;
      peakQueuedBytes: number;
      framePath: 'videoframe' | 'raw';
    }
  | { type: 'error'; message: string; phase: 'load' | 'decode' };

export interface LibAVPlaneLayout {
  offset: number;
  stride: number;
}

export interface LibAVDecodedFrame {
  data: Uint8Array;
  format: number;
  layout?: LibAVPlaneLayout[];
  width?: number;
  height?: number;
  pts?: number;
}

export interface LibAVPacketIn {
  data: Uint8Array;
  pts: number;
  ptshi: number;
  flags: number;
}

interface LibAVCodecParametersIn {
  codec_type: number;
  codec_id: number;
  format: number;
  width?: number;
  height?: number;
  extradata?: Uint8Array;
}

export interface LibAVInstance {
  ff_init_decoder(name: string, config: { codecpar: LibAVCodecParametersIn; time_base: [number, number] }): Promise<[number, number, number, number]>;
  ff_decode_multi(
    c: number,
    pkt: number,
    frame: number,
    packets: LibAVPacketIn[],
    config: { fin?: boolean; ignoreErrors?: boolean; copyoutFrame: 'video' | 'video_packed' },
  ): Promise<LibAVDecodedFrame[]>;
  ff_free_decoder(c: number, pkt: number, frame: number): Promise<void>;
}

export interface LibAVModule {
  LibAV(opts: { noworker: true; nothreads: true; base: string }): Promise<LibAVInstance>;
}
