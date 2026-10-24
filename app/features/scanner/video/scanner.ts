import type { FrameSource, IconEntry } from '../core/types';
import type { CellBbox } from '../core/geometry';
import type { QuantityReading } from '../item/ocr.client';
import { SIMILARITY_THRESHOLD, type ClassificationTimings } from '../core/classifier.client';
import {
  PhaseCorrelator,
  PROXY_HEIGHT,
  PROXY_WIDTH,
  adaptiveKeyframe,
  alignedSimilarity,
  assignCells,
  createGrid,
  expandGridRoi,
  fitCellOffset,
  resolveVotes,
  rowAlignment,
  semanticOffset,
  shouldObserve,
} from './math';
import { reconstructFrames } from './frameGraph';
import { GridGeometryTracker } from './gridGeometry';
import { parseQtyString } from '../item/ocr.client';
import type { CellEntry, CellPrediction, Grid, GraphCell, GraphFrame, MotionEstimate, Observation, ReplayFrame, Track, TraceEntry, VideoCellResult, VideoScanNotifier, VideoScanOutput } from './types';

/** Model calls the scanner depends on; injected so the geometry/voting logic can be tested without ONNX. */
export interface VideoScanDeps {
  detect: (source: FrameSource) => Promise<CellBbox[]>;
  classify: (source: FrameSource, boxes: CellBbox[], onMetrics?: (timings: ClassificationTimings) => void) => Promise<Array<{ icon: IconEntry | null; similarity: number }>>;
  readQuantities: (source: FrameSource, boxes: CellBbox[]) => Promise<QuantityReading[]>;
}

const PREVIEW_WIDTH = 360;
const SIGNATURE_SIZE = 16;

type Canvas2D = OffscreenCanvasRenderingContext2D;

function createContext(width: number, height: number): { canvas: OffscreenCanvas; ctx: Canvas2D } {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context is not available');
  return { canvas, ctx };
}

const boxKey = (b: CellBbox): string => [b.x, b.y, b.w, b.h].join(',');

export class InventoryVideoScanner {
  private grid: Grid | null = null;
  private previous: Uint8Array | null = null;
  private offset = 0;
  private lastKeyOffset: number | null = null;
  private lastKeyTime = -1;
  private segment = 0;
  private rejected = 0;
  private consecutiveRejected = 0;
  private keyframes = 0;
  private frames = 0;
  private stableSince: number | null = null;
  private lastReliableTime: number | null = null;
  private width: number | undefined;
  private height = 0;
  private graphPitch: number | null = null;
  private readonly tracks = new Map<string, Track>();
  private readonly trace: TraceEntry[] = [];
  private readonly graphFrames: GraphFrame[] = [];
  private readonly references = new Map<string, CellEntry>();
  private readonly correlator = new PhaseCorrelator();
  private readonly small = createContext(PROXY_WIDTH, PROXY_HEIGHT);
  private readonly framePixels = createContext(1, 1);
  private framePixelsReady = false;
  private readonly signature = createContext(SIGNATURE_SIZE, SIGNATURE_SIZE);
  private readonly timings = {
    detectMs: 0,
    classifyMs: 0,
    ocrMs: 0,
    motionMs: 0,
    geometryMs: 0,
    pixelCopyMs: 0,
    cellPixelsMs: 0,
    signatureMs: 0,
    positionMs: 0,
    graphPrepareMs: 0,
    verificationDetectMs: 0,
    verificationClassifyMs: 0,
    verificationOcrMs: 0,
    verificationCells: 0,
    gridFrames: 0,
    previewMs: 0,
    frameAnalysisMs: 0,
    detectCalls: 0,
    recognitionCalls: 0,
    classifiedCells: 0,
  };
  private readonly signaturePixels = new Map<string, Uint8ClampedArray>();
  private readonly signatures = new Map<string, Float32Array>();
  private geometry = new GridGeometryTracker();
  private readonly classification: ClassificationTimings = { cropMs: 0, preprocessMs: 0, inferenceMs: 0, matchMs: 0, inferenceCalls: 0, retries: 0 };

  constructor(
    private readonly deps: VideoScanDeps,
    private readonly notify: VideoScanNotifier,
    private readonly checkCancelled: () => void,
  ) {}

  get cellCount(): number {
    return this.tracks.size;
  }

  private async detect(source: FrameSource, verification = false): Promise<CellBbox[]> {
    const started = performance.now();
    const boxes = await this.deps.detect(source);
    const elapsed = performance.now() - started;
    this.timings.detectMs += elapsed;
    if (verification) this.timings.verificationDetectMs += elapsed;
    this.timings.detectCalls++;
    return boxes;
  }

  /**
   * Copy once so classification, OCR and tracking share frame pixels.
   * With grid tracking, local warm WebCodecs tests took 79.42 → 58.45s (21s clip)
   * and 13.91 → 9.99s (7.4s clip), with identical cell/item/quantity/status outputs.
   */
  private pixelSource(source: FrameSource): OffscreenCanvas {
    if (!this.framePixelsReady) {
      const started = performance.now();
      const { canvas, ctx } = this.framePixels;
      if (canvas.width !== source.width) canvas.width = source.width;
      if (canvas.height !== source.height) canvas.height = source.height;
      ctx.drawImage(source, 0, 0);
      this.framePixelsReady = true;
      this.timings.pixelCopyMs += performance.now() - started;
    }
    return this.framePixels.canvas;
  }

  private async recognize(source: FrameSource, boxes: CellBbox[], verification = false): Promise<CellPrediction[]> {
    if (!boxes.length) return [];
    this.timings.recognitionCalls++;
    if (verification) this.timings.verificationCells += boxes.length;
    const pixels = this.pixelSource(source);
    let started = performance.now();
    const matches = await this.deps.classify(pixels, boxes, (timings) => {
      for (const key of Object.keys(this.classification) as Array<keyof ClassificationTimings>) this.classification[key] += timings[key];
    });
    const classifyMs = performance.now() - started;
    this.timings.classifyMs += classifyMs;
    if (verification) this.timings.verificationClassifyMs += classifyMs;
    this.checkCancelled();
    started = performance.now();
    const quantities = await this.deps.readQuantities(pixels, boxes);
    const ocrMs = performance.now() - started;
    this.timings.ocrMs += ocrMs;
    if (verification) this.timings.verificationOcrMs += ocrMs;
    this.timings.classifiedCells += boxes.length;
    return matches.map(({ icon, similarity }, i) => {
      const raw = quantities[i].text;
      const quantity = raw ? parseQtyString(raw) || null : null;
      return { key: icon?.inventoryKey ?? null, quantity, rawQty: raw, similarity, ocrConfidence: quantities[i].confidence };
    });
  }

  private iconPixels(source: FrameSource, { x, y, w, h }: CellBbox): Uint8ClampedArray {
    const key = boxKey({ x, y, w, h });
    const cached = this.signaturePixels.get(key);
    if (cached) return cached;
    const pixelsSource = this.pixelSource(source);
    const started = performance.now();
    this.signature.ctx.drawImage(pixelsSource, x + w * 0.12, y + h * 0.08, w * 0.76, h * 0.6, 0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE);
    const pixels = this.signature.ctx.getImageData(0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE).data;
    this.signaturePixels.set(key, pixels);
    this.timings.cellPixelsMs += performance.now() - started;
    return pixels;
  }

  /** Mean-centred, unit-norm 16x16 RGB descriptor of the cell icon area, used to match the same cell across frames. */
  private cellSignature(source: FrameSource, { x, y, w, h }: CellBbox): Float32Array {
    const key = boxKey({ x, y, w, h });
    const cached = this.signatures.get(key);
    if (cached) return cached;
    const signature = new Float32Array(SIGNATURE_SIZE * SIGNATURE_SIZE * 3);
    const pixels = this.iconPixels(source, { x, y, w, h });
    const started = performance.now();
    const n = SIGNATURE_SIZE * SIGNATURE_SIZE;
    let mean = 0;
    let norm = 0;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        signature[i * 3 + c] = pixels[i * 4 + c];
        mean += pixels[i * 4 + c];
      }
    }
    mean /= n * 3;
    for (let i = 0; i < signature.length; i++) {
      signature[i] -= mean;
      norm += signature[i] ** 2;
    }
    norm = Math.max(1e-12, Math.sqrt(norm));
    for (let i = 0; i < signature.length; i++) signature[i] /= norm;
    this.signatures.set(key, signature);
    this.timings.signatureMs += performance.now() - started;
    return signature;
  }

  private saveGraphFrame(source: FrameSource, entries: CellEntry[], time: number, index: number, reliable: boolean, grid: Grid): void {
    const predicted = entries.filter((e) => e.prediction);
    if (!predicted.length) return;
    const pixelsBefore = this.timings.cellPixelsMs;
    const started = performance.now();
    this.graphPitch ??= grid.pitch;
    const cells: GraphCell[] = [];
    for (const e of predicted) {
      const prediction = e.prediction;
      if (!prediction) continue;
      const { x, y, w, h } = e.box;
      const rgba = this.iconPixels(source, { x, y, w, h });
      const gray = Array.from({ length: 256 }, (_, i) => Math.round(rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114));
      const mean = gray.reduce((n, v) => n + v, 0) / 256;
      const centered = gray.map((v) => v - mean);
      const norm = Math.sqrt(centered.reduce((n, v) => n + v * v, 0));
      cells.push({ id: e.id, box: e.box, prediction, signature: centered.map((v) => v / Math.max(1e-12, norm)), contrast: norm / 16 });
    }
    this.graphFrames.push({ time, frame: index, offset: this.offset, segment: this.segment, roi: { ...grid.roi }, width: source.width, height: source.height, motionReliable: reliable, cells });
    this.timings.graphPrepareMs += performance.now() - started - (this.timings.cellPixelsMs - pixelsBefore);
    if (!reliable) this.notify.log(`[preserved] ${time.toFixed(3)}s f${index}: motion link failed, kept ${cells.length} recognised cells for the frame graph`, 'warn');
  }

  private position<T>(calculate: () => T): T {
    const started = performance.now();
    const result = calculate();
    this.timings.positionMs += performance.now() - started;
    return result;
  }

  private sample(source: FrameSource, grid: Grid): Uint8Array {
    const roi = grid.roi;
    this.small.ctx.drawImage(source, roi.x, roi.y, roi.right - roi.x, roi.bottom - roi.y, 0, 0, PROXY_WIDTH, PROXY_HEIGHT);
    const pixels = this.small.ctx.getImageData(0, 0, PROXY_WIDTH, PROXY_HEIGHT).data;
    const gray = new Uint8Array(PROXY_WIDTH * PROXY_HEIGHT);
    for (let i = 0; i < gray.length; i++) gray[i] = Math.round(pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114);
    return gray;
  }

  private resetSegment(): void {
    this.segment++;
    this.geometry = new GridGeometryTracker();
    this.grid = null;
    this.previous = null;
    this.offset = 0;
    this.lastKeyOffset = null;
    this.lastReliableTime = null;
    this.stableSince = null;
  }

  /** Emits the raw, not yet graph-aligned recognition of one keyframe for the live preview. */
  private emitPreview(source: FrameSource, entries: CellEntry[], time: number): void {
    const started = performance.now();
    const scale = Math.min(1, PREVIEW_WIDTH / source.width);
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale)));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    this.notify.preview({
      time,
      width: source.width,
      height: source.height,
      bitmap: canvas.transferToImageBitmap(),
      cells: entries.filter((e) => e.prediction).map((e) => ({ box: e.box, key: e.prediction?.key ?? null, quantity: e.prediction?.quantity ?? null, similarity: e.prediction?.similarity ?? 0 })),
    });
    this.timings.previewMs += performance.now() - started;
  }

  async frame(source: FrameSource, time: number, index: number): Promise<void> {
    const started = performance.now();
    try {
      await this.processFrame(source, time, index);
    } finally {
      this.timings.frameAnalysisMs += performance.now() - started;
    }
  }

  private async processFrame(source: FrameSource, time: number, index: number): Promise<void> {
    this.checkCancelled();
    this.framePixelsReady = false;
    this.signaturePixels.clear();
    this.signatures.clear();
    this.frames++;
    const predictionCache = new Map<string, CellPrediction>();
    const recognizeEntries = async (entries: CellEntry[], verification = false): Promise<void> => {
      const missing = entries.filter((e) => !predictionCache.has(boxKey(e.box)));
      const predictions = await this.recognize(
        source,
        missing.map((e) => e.box),
        verification,
      );
      missing.forEach((e, i) => predictionCache.set(boxKey(e.box), predictions[i]));
      for (const e of entries) e.prediction = predictionCache.get(boxKey(e.box));
    };
    const width = source.width;
    const height = source.height;
    if (this.width !== undefined && (width !== this.width || height !== this.height)) {
      this.resetSegment();
      this.notify.log('Video frame size changed; starting a new segment.', 'warn');
    }
    this.width = width;
    this.height = height;

    let boxes: CellBbox[] | null = null;
    if (!this.grid) {
      boxes = await this.detect(source);
      try {
        this.grid = createGrid(boxes, width, height);
      } catch {
        return; // Inventory not visible yet; try again on the next frame.
      }
      const roi = this.grid.roi;
      this.notify.log(
        `Grid: ${this.grid.columns.length} columns, row pitch ${this.grid.pitch.toFixed(1)}px, cell ${this.grid.cellW.toFixed(1)}x${this.grid.cellH.toFixed(1)}px, ROI (${roi.x},${roi.y})-(${roi.right},${roi.bottom})`,
      );
    }
    const grid = this.grid;

    const motionStarted = performance.now();
    const gray = this.sample(source, grid);
    let motion: MotionEstimate = this.previous ? this.correlator.estimate(this.previous, gray) : { dx: 0, dy: 0, confidence: 1 };
    const match = this.previous ? alignedSimilarity(this.previous, gray, motion.dy) : 1;
    this.timings.motionMs += performance.now() - motionStarted;
    let reliable = (motion.confidence >= 0.25 || (motion.confidence >= 0.12 && match >= 0.45)) && Math.abs(motion.dx) <= 5 && Math.abs(motion.dy) < PROXY_HEIGHT * 0.48;
    if (this.lastReliableTime !== null && time - this.lastReliableTime > 0.15 && match < 0.98) reliable = false;
    // A uniform transition has no readable cards; no model-based recovery is needed.
    if (Math.max(...gray) - Math.min(...gray) < 4) boxes = [];
    let motionMethod = 'phase';
    const roiHeight = () => grid.roi.bottom - grid.roi.y;
    let usedGeometry = false;
    const locate = async (): Promise<CellBbox[]> => {
      const pixels = this.pixelSource(source);
      const started = performance.now();
      const predicted = this.geometry.locate(pixels, grid, this.offset);
      this.timings.geometryMs += performance.now() - started;
      if (predicted) {
        usedGeometry = true;
        this.timings.gridFrames++;
        return predicted;
      }
      const detected = await this.detect(source);
      const calibrationStarted = performance.now();
      this.geometry.calibrate(pixels, grid, detected, this.offset);
      this.timings.geometryMs += performance.now() - calibrationStarted;
      return detected;
    };
    if (boxes?.length) {
      const pixels = this.pixelSource(source);
      const started = performance.now();
      this.geometry.calibrate(pixels, grid, boxes, this.offset);
      this.timings.geometryMs += performance.now() - started;
    }

    if (!reliable && this.references.size) {
      boxes ??= await this.detect(source);
      const candidates: CellEntry[] = assignCells(boxes, grid, this.offset, this.segment).cells.map((c) => ({ ...c, signature: this.cellSignature(source, c.box) }));
      let anchored = this.position(() => fitCellOffset(candidates, this.references, grid));
      if (anchored !== null) {
        await recognizeEntries(candidates);
        anchored = this.position(() => semanticOffset(candidates, this.tracks, grid, this.segment));
      }
      if (anchored !== null) {
        motion = { ...motion, dx: 0, dy: ((anchored - this.offset) * PROXY_HEIGHT) / roiHeight() };
        reliable = true;
        motionMethod = 'cell-pixels-verified';
        this.notify.log(`[recovered] ${time.toFixed(3)}s f${index}: re-linked by cell pixels at offset ${anchored.toFixed(1)}px`, 'warn');
      }
    }
    if (!reliable && boxes && boxes.length >= 6 && this.tracks.size) {
      const candidates: CellEntry[] = assignCells(boxes, grid, this.offset, this.segment).cells;
      await recognizeEntries(candidates);
      const anchored = this.position(() => semanticOffset(candidates, this.tracks, grid, this.segment));
      if (anchored !== null) {
        motion = { ...motion, dx: 0, dy: ((anchored - this.offset) * PROXY_HEIGHT) / roiHeight() };
        reliable = true;
        motionMethod = 'cell-recognition';
        this.notify.log(`[recovered] ${time.toFixed(3)}s f${index}: re-linked by recognised cells at offset ${anchored.toFixed(1)}px`, 'warn');
      }
    }

    if (!reliable) {
      if (predictionCache.size && boxes) {
        const entries: CellEntry[] = assignCells(boxes, grid, this.offset, this.segment).cells;
        for (const e of entries) e.prediction = predictionCache.get(boxKey(e.box));
        this.saveGraphFrame(source, entries, time, index, false, grid);
      }
      this.rejected++;
      this.consecutiveRejected++;
      this.trace.push({ frame: index, time, ...motion, offset: this.offset, reliable: false });
      if (this.lastReliableTime !== null && time - this.lastReliableTime >= 0.5 && boxes && boxes.length >= 6) {
        this.resetSegment();
        this.consecutiveRejected = 0;
        this.notify.log(`Could not link motion at ${time.toFixed(2)}s; splitting the results before and after.`, 'warn');
      }
      return;
    }

    this.consecutiveRejected = 0;
    const motionPx = (motion.dy * roiHeight()) / PROXY_HEIGHT;
    this.lastReliableTime = time;
    this.offset += motionPx;
    this.previous = gray;
    const entry: TraceEntry = { frame: index, time, ...motion, offset: this.offset, segment: this.segment, reliable: true, motionMethod };
    this.trace.push(entry);
    this.stableSince = Math.abs(motion.dy) < 0.2 ? (this.stableSince ?? time) : null;
    const pendingSingle = [...this.tracks.values()].some((track) => {
      const y = grid.originY + track.row * grid.pitch + this.offset;
      return track.segment === this.segment && track.observations.length < 5 && y >= grid.roi.y + grid.cellH / 2 && y <= grid.roi.bottom - grid.cellH / 2;
    });
    const selection = adaptiveKeyframe({
      offset: this.offset,
      lastOffset: this.lastKeyOffset,
      pitch: grid.pitch,
      motionPx,
      time,
      lastTime: this.lastKeyTime,
      stableSince: this.stableSince,
      pendingSingle,
    });
    if (!selection.reason) return;
    entry.keyframeReason = selection.reason;
    entry.keyframeSpacing = selection.spacing;

    boxes ??= await locate();
    if (expandGridRoi(grid, boxes, height)) {
      this.previous = this.sample(source, grid);
      entry.roiExpanded = { ...grid.roi };
    }
    let assignment = assignCells(boxes, grid, this.offset, this.segment);
    this.offset = assignment.offset;
    entry.offset = this.offset;
    entry.gridCorrection = assignment.correction;
    let entries: CellEntry[] = assignment.cells.map((c) => ({ ...c, signature: this.cellSignature(source, c.box) }));
    // Validate location before the per-cell cap: a bad ID must not suppress a new item.
    await recognizeEntries(entries);
    const positioning = this.position(() => semanticOffset(entries, this.tracks, grid, this.segment));
    const recognisedOffset = positioning ?? this.offset;
    const positioned = assignCells(boxes, grid, recognisedOffset, this.segment).cells;
    const needsVerification = (cell: CellEntry, i: number): boolean => {
      const prediction = cell.prediction;
      // Use the existing recognition threshold; the stricter 0.75 gate remains specific to position anchors.
      if (!prediction || prediction.quantity === null || prediction.similarity < SIMILARITY_THRESHOLD || prediction.ocrConfidence < 0.8) return true;
      const previous = this.tracks.get(positioned[i]?.id ?? cell.id)?.observations ?? [];
      const supported = previous.filter((o) => o.key === prediction.key && o.similarity >= 0.75 && o.ocrConfidence >= 0.8 && o.quantity !== null);
      const quantities = new Set(supported.map((o) => o.quantity));
      return quantities.size === 1 && !quantities.has(prediction.quantity);
    };
    const unverified = new Set(entries.filter(needsVerification).map((cell) => boxKey(cell.box)));
    if (usedGeometry && unverified.size) {
      this.timings.gridFrames--;
      boxes = await this.detect(source, true);
      const pixels = this.pixelSource(source);
      const started = performance.now();
      this.geometry.calibrate(pixels, grid, boxes, this.offset);
      this.timings.geometryMs += performance.now() - started;
      const previousEntries = entries;
      assignment = assignCells(boxes, grid, this.offset, this.segment);
      this.offset = assignment.offset;
      entries = assignment.cells.map((cell) => ({ ...cell, signature: this.cellSignature(source, cell.box) }));
      // Preserve verified current-frame predictions when detector refinement still points at the same card.
      for (const cell of entries) {
        const previous = previousEntries.find(
          (candidate) => !unverified.has(boxKey(candidate.box)) && candidate.col === cell.col && Math.abs(candidate.box.y + candidate.box.h / 2 - cell.box.y - cell.box.h / 2) < grid.pitch * 0.2,
        );
        if (previous?.prediction) predictionCache.set(boxKey(cell.box), previous.prediction);
      }
      await recognizeEntries(entries, true);
    }
    const semanticPosition = this.position(() => semanticOffset(entries, this.tracks, grid, this.segment));
    if (semanticPosition !== null) {
      entry.semanticPositionCorrection = semanticPosition - this.offset;
      assignment = assignCells(boxes, grid, semanticPosition, this.segment);
      this.offset = assignment.offset;
      entry.offset = this.offset;
      entries = assignment.cells.map((c) => ({ ...c, signature: this.cellSignature(source, c.box), prediction: predictionCache.get(boxKey(c.box)) }));
    }
    const alignment =
      semanticPosition !== null || motionMethod === 'cell-recognition' || motionMethod === 'cell-pixels-verified'
        ? { shift: 0, votes: {} as Record<string, number> }
        : this.position(() => rowAlignment(entries, this.references));
    if (alignment.shift) {
      entry.proposedCellAlignmentShift = alignment.shift;
      await recognizeEntries(entries);
      const anchored = this.position(() => semanticOffset(entries, this.tracks, grid, this.segment));
      alignment.shift = anchored === null ? 0 : Math.round((this.offset - anchored) / grid.pitch);
      entry.verifiedCellAlignmentShift = alignment.shift;
    }
    if (alignment.shift) {
      this.notify.log(`[row correction] ${time.toFixed(3)}s f${index}: ${alignment.shift} rows`, 'warn');
      this.offset -= alignment.shift * grid.pitch;
      entry.offset = this.offset;
      entry.cellAlignmentCorrection = -alignment.shift * grid.pitch;
      for (const e of entries) {
        e.row += alignment.shift;
        e.id = `${e.segment}:${e.row}:${e.col}`;
      }
    }
    entry.alignmentVotes = alignment.votes;
    for (const e of entries) this.references.set(e.id, e);
    this.saveGraphFrame(source, entries, time, index, true, grid);
    this.emitPreview(source, entries, time);
    this.lastKeyOffset = this.offset;
    this.lastKeyTime = time;
    this.keyframes++;

    // Provisional tracks only drive keyframe selection and position anchors; final votes come from the frame graph.
    const cells = entries.filter((c) => shouldObserve(this.tracks.get(c.id)?.observations ?? [], time, c.box, grid.pitch));
    if (!cells.length) return;
    const missing = cells.filter((c) => !predictionCache.has(boxKey(c.box)));
    const predictions = await this.recognize(
      source,
      missing.map((c) => c.box),
    );
    missing.forEach((c, i) => predictionCache.set(boxKey(c.box), predictions[i]));
    for (const c of cells) {
      const prediction = predictionCache.get(boxKey(c.box));
      if (!prediction) continue;
      const observation: Observation = { ...prediction, frame: index, time, box: c.box };
      const track = this.tracks.get(c.id) ?? { id: c.id, row: c.row, col: c.col, segment: c.segment, observations: [] };
      track.observations.push(observation);
      this.tracks.set(c.id, track);
    }
  }

  finish(duration: number): VideoScanOutput {
    const started = performance.now();
    this.checkCancelled();
    if (!this.grid && !this.tracks.size) throw new Error('No item inventory was found in the video.');
    const pitch = this.graphPitch ?? this.grid?.pitch ?? 0;
    const graphStarted = performance.now();
    const graph = reconstructFrames(this.graphFrames, this.trace, pitch);
    const graphMs = performance.now() - graphStarted;
    const replayFrames: ReplayFrame[] = graph.replayFrames;
    for (const edge of graph.rejectedEdges) {
      this.notify.log(
        `[link conflict] f${replayFrames[edge.i].frame} -> f${replayFrames[edge.j].frame}: ${edge.method} proposed ${edge.shift} rows, existing ${edge.existingShift}; proposal rejected`,
        'warn',
      );
    }
    for (const f of graph.unplacedFrames) {
      this.notify.log(`[unplaced] ${f.time.toFixed(3)}s f${f.frame}: ${f.cells.length} cells detected but too few columns to place`, 'warn');
    }
    const results: VideoCellResult[] = [];
    const ordered = Object.entries(graph.tracks).map(([id, observations]) => {
      const [segment, row, col] = id.split(':').map(Number);
      return { id, segment, row, col, observations };
    });
    ordered.sort((a, b) => a.segment - b.segment || a.row - b.row || a.col - b.col);
    for (const track of ordered) {
      const vote = resolveVotes(track.observations);
      const matching = track.observations.filter((o) => o.key === vote.key);
      const best = (matching.length ? matching : track.observations).reduce((a, b) => (a.similarity + a.ocrConfidence >= b.similarity + b.ocrConfidence ? a : b));
      results.push({
        ...vote,
        cellId: track.id,
        row: track.row,
        col: track.col,
        segment: track.segment,
        similarity: Math.max(...matching.map((o) => o.similarity), 0),
        ocrConfidence: Math.max(...matching.filter((o) => o.quantity === vote.quantity).map((o) => o.ocrConfidence), 0),
        observationCount: track.observations.length,
        box: best.box,
        // Scroll-space position: segments are stacked so reading order stays stable across the whole video.
        scrollY: track.segment * 1e6 + track.row * pitch,
      });
    }
    // Replay interpolation uses the graph-corrected offsets, per recognised keyframe.
    const replayTrace: TraceEntry[] = replayFrames.map((f) => ({ frame: f.frame, time: f.time, segment: f.segment, offset: f.offset, reliable: true, motionMethod: 'frame-graph' }));
    const confirmed = results.filter((r) => r.status === 'confirmed').length;
    this.notify.log(
      `Done: ${this.frames} frames, ${this.keyframes} keyframes, ${results.length} cells (${confirmed} confirmed), ${this.rejected} rejected motion estimates, ${graph.components} segments`,
    );
    return {
      results,
      replayFrames,
      trace: replayTrace,
      width: this.width ?? 0,
      height: this.height,
      duration,
      metrics: {
        frames: this.frames,
        keyframes: this.keyframes,
        rejectedMotionFrames: this.rejected,
        segments: graph.components,
        cells: results.length,
        confirmed,
        uncertain: results.length - confirmed,
        detectCalls: this.timings.detectCalls,
        gridFrames: this.timings.gridFrames,
        verificationCells: this.timings.verificationCells,
        recognitionCalls: this.timings.recognitionCalls,
        classifiedCells: this.timings.classifiedCells,
        classifierCalls: this.classification.inferenceCalls,
        classifierRetries: this.classification.retries,
        decoder: null,
        requestedProviders: [],
        modelsReused: false,
        timings: {
          frameAnalysisMs: this.timings.frameAnalysisMs,
          detectMs: this.timings.detectMs,
          classifyMs: this.timings.classifyMs,
          classifyCropMs: this.classification.cropMs,
          classifyPreprocessMs: this.classification.preprocessMs,
          classifyInferenceMs: this.classification.inferenceMs,
          classifyMatchMs: this.classification.matchMs,
          ocrMs: this.timings.ocrMs,
          motionMs: this.timings.motionMs,
          geometryMs: this.timings.geometryMs,
          pixelCopyMs: this.timings.pixelCopyMs,
          cellPixelsMs: this.timings.cellPixelsMs,
          signatureMs: this.timings.signatureMs,
          positionMs: this.timings.positionMs,
          graphPrepareMs: this.timings.graphPrepareMs,
          verificationDetectMs: this.timings.verificationDetectMs,
          verificationClassifyMs: this.timings.verificationClassifyMs,
          verificationOcrMs: this.timings.verificationOcrMs,
          previewMs: this.timings.previewMs,
          graphMs,
          finishMs: performance.now() - started,
          decoderSetupMs: 0,
          decodeWaitMs: 0,
          captureMs: 0,
          playbackWaitMs: 0,
          backpressureWaitMs: 0,
          drainWaitMs: 0,
          fallbackAttemptMs: 0,
          modelWaitMs: 0,
          totalMs: 0,
          firstPreviewMs: null,
        },
      },
    };
  }
}
