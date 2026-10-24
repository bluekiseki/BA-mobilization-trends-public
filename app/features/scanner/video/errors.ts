// Guard for mobile memory and run time; longer videos are rejected up front instead of crashing the tab mid-scan.
export const MAX_VIDEO_DURATION_SECONDS = 20 * 60;

/** Raised when fast WebCodecs decoding is unavailable and the page should fall back to real-time playback capture. */
export class UseCompatDecoderError extends Error {
  readonly code = 'USE_COMPAT';
}

export class VideoTooLongError extends Error {
  readonly code = 'VIDEO_TOO_LONG';
}

export class VideoUnsupportedError extends Error {
  readonly code = 'VIDEO_UNSUPPORTED';
}
