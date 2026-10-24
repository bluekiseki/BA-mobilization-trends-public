import type { CellBbox } from '../core/geometry';

export interface Roi {
  x: number;
  y: number;
  right: number;
  bottom: number;
}

export interface Grid {
  columns: number[];
  originY: number;
  pitch: number;
  cellH: number;
  cellW: number;
  roi: Roi;
}

/** One cell's recognition result on a single frame. `key` is the icon's inventoryKey. */
export interface CellPrediction {
  key: string | null;
  quantity: number | null;
  rawQty: string | null;
  similarity: number;
  ocrConfidence: number;
}

export interface GridCell {
  id: string; // `${segment}:${row}:${col}`
  row: number;
  col: number;
  segment: number;
  box: CellBbox;
}

export interface CellEntry extends GridCell {
  signature?: Float32Array;
  prediction?: CellPrediction;
}

export interface Observation extends CellPrediction {
  frame: number;
  time: number;
  box: CellBbox;
}

export interface Track {
  id: string;
  row: number;
  col: number;
  segment: number;
  observations: Observation[];
}

export interface MotionEstimate {
  dx: number;
  dy: number;
  confidence: number;
}

export interface TraceEntry {
  frame: number;
  time: number;
  dx?: number;
  dy?: number;
  confidence?: number;
  offset: number;
  segment?: number;
  reliable: boolean;
  motionMethod?: string;
  keyframeReason?: string;
  keyframeSpacing?: number;
  roiExpanded?: Roi;
  gridCorrection?: number;
  semanticPositionCorrection?: number;
  proposedCellAlignmentShift?: number;
  verifiedCellAlignmentShift?: number;
  cellAlignmentCorrection?: number;
  alignmentVotes?: Record<string, number>;
}

export interface GraphCell {
  id: string;
  box: CellBbox;
  prediction: CellPrediction;
  signature: number[];
  contrast: number;
}

/** One recognised keyframe kept for the frame graph (signature/contrast are private descriptors). */
export interface GraphFrame {
  time: number;
  frame: number;
  offset: number;
  segment: number;
  roi: Roi;
  width: number;
  height: number;
  motionReliable: boolean;
  cells: GraphCell[];
}

export interface ReplayCell {
  id: string;
  box: CellBbox;
  prediction: CellPrediction;
  localRow: number;
  col: number;
}

/** A keyframe after graph reconstruction, used to draw the overlay on the playing video. */
export interface ReplayFrame {
  time: number;
  frame: number;
  offset: number;
  segment: number;
  rowStart: number;
  roi: Roi;
  width: number;
  height: number;
  cells: ReplayCell[];
}

export interface GraphEdge {
  i: number;
  j: number;
  shift: number;
  anchors: Array<{ col: number }>;
  method: string;
}

export interface FrameGraphResult {
  tracks: Record<string, Observation[]>;
  replayFrames: ReplayFrame[];
  acceptedEdges: GraphEdge[];
  rejectedEdges: Array<GraphEdge & { existingShift: number }>;
  components: number;
  frames: number;
  unplacedFrames: GraphFrame[];
}

export type VoteStatus = 'confirmed' | 'uncertain';

export interface CellVote {
  key: string | null;
  quantity: number | null;
  status: VoteStatus;
}

/** One reconstructed inventory cell, merged over every frame it was observed in. */
export interface VideoCellResult extends CellVote {
  cellId: string;
  row: number;
  col: number;
  segment: number;
  similarity: number;
  ocrConfidence: number;
  observationCount: number;
  /** Box on the frame where the cell was best observed; y is in that frame's coordinates. */
  box: CellBbox;
  /** Vertical position in the reconstructed scroll space (row * pitch), used for reading order. */
  scrollY: number;
}

/** Everything needed to draw the detection overlay on the playing video. */
export interface VideoReplay {
  replayFrames: ReplayFrame[];
  /** Reliable motion samples, sorted by time, used to interpolate the overlay between keyframes. */
  trace: TraceEntry[];
  width: number;
  height: number;
  duration: number;
}

export interface VideoScanTimings {
  // frameAnalysisMs includes detect/classify/OCR/motion/geometry/preview; finishMs includes graphMs.
  frameAnalysisMs: number;
  detectMs: number;
  classifyMs: number;
  // These four measurements are included in classifyMs, not additional elapsed time.
  classifyCropMs: number;
  classifyPreprocessMs: number;
  classifyInferenceMs: number;
  classifyMatchMs: number;
  ocrMs: number;
  motionMs: number;
  geometryMs: number;
  pixelCopyMs: number;
  cellPixelsMs: number;
  signatureMs: number;
  positionMs: number;
  graphPrepareMs: number;
  // Verification timings are subsets of detectMs/classifyMs/ocrMs.
  verificationDetectMs: number;
  verificationClassifyMs: number;
  verificationOcrMs: number;
  previewMs: number;
  graphMs: number;
  finishMs: number;
  decoderSetupMs: number;
  decodeWaitMs: number;
  captureMs: number;
  playbackWaitMs: number;
  // Compat playback only: capture blocked on a full analysis pipeline, then waiting for the remaining frames after playback.
  backpressureWaitMs: number;
  drainWaitMs: number;
  fallbackAttemptMs: number;
  modelWaitMs: number;
  totalMs: number;
  // Measured in the client, including model preparation and worker message delivery.
  firstPreviewMs: number | null;
}

export interface VideoScanMetrics {
  frames: number;
  keyframes: number;
  rejectedMotionFrames: number;
  segments: number;
  cells: number;
  confirmed: number;
  uncertain: number;
  detectCalls: number;
  gridFrames: number;
  verificationCells: number;
  recognitionCalls: number;
  classifiedCells: number;
  classifierCalls: number;
  classifierRetries: number;
  decoder: 'webcodecs' | 'wasm' | 'playback' | null;
  requestedProviders: string[];
  modelsReused: boolean;
  timings: VideoScanTimings;
}

export interface VideoScanOutput extends VideoReplay {
  results: VideoCellResult[];
  metrics: VideoScanMetrics;
}

export type VideoLogLevel = 'info' | 'warn' | 'error';

/** Messages the scan code emits while running; the worker forwards them to the page. */
export interface VideoScanNotifier {
  log: (message: string, level?: VideoLogLevel) => void;
  progress: (percent: number, step: string) => void;
  /** Raw per-keyframe recognition for the live preview; may be dropped without affecting results. */
  preview: (frame: PreviewFrame) => void;
}

export interface PreviewFrame {
  time: number;
  width: number;
  height: number;
  /** Downscaled copy of the analysed frame. */
  bitmap: ImageBitmap;
  cells: Array<{ box: CellBbox; key: string | null; quantity: number | null; similarity: number }>;
}
