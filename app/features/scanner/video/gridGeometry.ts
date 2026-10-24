import type { FrameSource } from '../core/types';
import type { CellBbox } from '../core/geometry';
import type { Grid } from './types';

const PROFILE_WIDTH = 160;
const BORDER_RADIUS = 8;
const BORDER_LENGTH = BORDER_RADIUS * 2 + 1;
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export interface ColumnBorders {
  x: number;
  w: number;
  h: number;
  top: Float32Array;
  bottom: Float32Array;
  contrast: number;
  centerOffset?: number;
}

function border(profile: Float32Array, y: number): Float32Array {
  const result = new Float32Array(BORDER_LENGTH);
  for (let i = 0; i < result.length; i++) {
    const row = Math.round(y) + i - BORDER_RADIUS;
    if (row > 0 && row + 1 < profile.length) result[i] = profile[row + 1] - profile[row - 1];
  }
  return result;
}

function correlation(template: Float32Array, current: Float32Array): number {
  let dot = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < template.length; i++) {
    dot += template[i] * current[i];
    a += template[i] ** 2;
    b += current[i] ** 2;
  }
  return dot / Math.max(1e-12, Math.sqrt(a * b));
}

function norm(values: Float32Array): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

/** Locate card rows from their shared borders; icon contents are excluded from the search. */
export function matchGridBorders(profiles: Float32Array[], columns: ColumnBorders[], grid: Grid, offset: number): CellBbox[] | null {
  if (profiles.length !== columns.length || columns.length < 3) return null;
  const first = Math.ceil((grid.roi.y + grid.cellH * 0.54 - grid.originY - offset) / grid.pitch);
  const last = Math.floor((grid.roi.bottom - grid.cellH * 0.6 - grid.originY - offset) / grid.pitch);
  if (last - first < 1) return null;
  let bestShift = 0;
  let bestScore = -Infinity;
  const radius = Math.floor(grid.pitch * 0.5);
  for (let shift = -radius; shift <= radius; shift++) {
    let sum = 0;
    let count = 0;
    for (let row = first; row <= last; row++) {
      for (let col = 0; col < columns.length; col++) {
        const model = columns[col];
        const top = grid.originY + offset + row * grid.pitch + (model.centerOffset ?? 0) - model.h / 2 + shift - grid.roi.y;
        if (top - BORDER_RADIUS < 0 || top + model.h + BORDER_RADIUS >= profiles[col].length) continue;
        sum += (correlation(model.top, border(profiles[col], top)) + correlation(model.bottom, border(profiles[col], top + model.h))) / 2;
        count++;
      }
    }
    const score = count >= columns.length * 2 ? sum / count : -Infinity;
    if (score > bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }
  if (bestScore < 0.7) return null;
  const boxes: CellBbox[] = [];
  let checked = 0;
  const start = Math.ceil((grid.roi.y + grid.cellH * 0.54 - grid.originY - offset - bestShift) / grid.pitch);
  const end = Math.floor((grid.roi.bottom - grid.cellH * 0.6 - grid.originY - offset - bestShift) / grid.pitch);
  for (let row = start; row <= end; row++) {
    const rowBoxes: CellBbox[] = [];
    const uncertain: Array<{ box: CellBbox; expected: number }> = [];
    const adjustments: number[] = [];
    for (let col = 0; col < columns.length; col++) {
      const model = columns[col];
      const expected = grid.originY + offset + row * grid.pitch + (model.centerOffset ?? 0) - model.h / 2 + bestShift;
      let y = expected;
      let score = -Infinity;
      let contrast = 0;
      for (let adjustment = -3; adjustment <= 3; adjustment++) {
        const top = border(profiles[col], expected + adjustment - grid.roi.y);
        const bottom = border(profiles[col], expected + adjustment + model.h - grid.roi.y);
        const candidate = (correlation(model.top, top) + correlation(model.bottom, bottom)) / 2;
        const currentContrast = (norm(top) + norm(bottom)) / 2;
        if (candidate > score || (candidate === score && currentContrast > contrast)) {
          score = candidate;
          y = expected + adjustment;
          contrast = currentContrast;
        }
      }
      checked++;
      if (contrast < model.contrast * 0.45) return null;
      const box = { x: model.x, y, w: model.w, h: model.h };
      if (score >= 0.65) {
        rowBoxes.push(box);
        adjustments.push(y - expected);
      } else {
        uncertain.push({ box, expected });
      }
    }
    // Independent columns establish the row even when a selected card's glow obscures its own border.
    if (rowBoxes.length < 3) return null;
    const adjustment = median(adjustments);
    for (const cell of uncertain) rowBoxes.push({ ...cell.box, y: cell.expected + adjustment });
    boxes.push(...rowBoxes);
  }
  // Missing borders may indicate a modal overlay or a changed layout, rather than empty inventory cells.
  return boxes.length >= 6 && boxes.length === checked ? boxes : null;
}

export class GridGeometryTracker {
  private readonly canvas = new OffscreenCanvas(PROFILE_WIDTH, 1);
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  private columns: ColumnBorders[] | null = null;
  private layout: { pitch: number; originY: number } | null = null;

  constructor() {
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D context is not available');
    this.ctx = ctx;
  }

  private profiles(source: FrameSource, grid: Grid): Float32Array[] {
    const { roi } = grid;
    const height = Math.ceil(roi.bottom - roi.y);
    if (this.canvas.height !== height) this.canvas.height = height;
    this.ctx.drawImage(source, roi.x, roi.y, roi.right - roi.x, roi.bottom - roi.y, 0, 0, PROFILE_WIDTH, height);
    const pixels = this.ctx.getImageData(0, 0, PROFILE_WIDTH, height).data;
    const scale = PROFILE_WIDTH / (roi.right - roi.x);
    return grid.columns.map((center) => {
      const left = Math.max(0, Math.round((center - grid.cellW * 0.34 - roi.x) * scale));
      const right = Math.min(PROFILE_WIDTH, Math.round((center - grid.cellW * 0.22 - roi.x) * scale));
      const profile = new Float32Array(height);
      for (let y = 0; y < height; y++) {
        let sum = 0;
        for (let x = left; x < right; x++) {
          const i = (y * PROFILE_WIDTH + x) * 4;
          sum += pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
        }
        profile[y] = sum / Math.max(1, right - left);
      }
      const smoothed = new Float32Array(height);
      for (let y = 2; y < height - 2; y++) smoothed[y] = (profile[y - 2] + profile[y - 1] * 4 + profile[y] * 6 + profile[y + 1] * 4 + profile[y + 2]) / 16;
      return smoothed;
    });
  }

  calibrate(source: FrameSource, grid: Grid, boxes: CellBbox[], offset = 0): void {
    const profiles = this.profiles(source, grid);
    const columns: ColumnBorders[] = [];
    const full = boxes.filter((b) => b.h >= grid.cellH * 0.92 && b.y - grid.roi.y > BORDER_RADIUS && b.y + b.h + BORDER_RADIUS < grid.roi.bottom);
    const gaps: number[] = [];
    for (const center of grid.columns) {
      const ys = full
        .filter((b) => Math.abs(b.x + b.w / 2 - center) < grid.cellW * 0.25)
        .map((b) => b.y + b.h / 2)
        .sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > grid.pitch * 0.8 && ys[i] - ys[i - 1] < grid.pitch * 1.2) gaps.push(ys[i] - ys[i - 1]);
    }
    if (!gaps.length) return;
    const pitch = median(gaps);
    const row = (b: CellBbox): number => Math.round((b.y + b.h / 2 - grid.originY - offset) / grid.pitch);
    const originY = median(full.map((b) => b.y + b.h / 2 - row(b) * pitch - offset));
    for (let col = 0; col < grid.columns.length; col++) {
      const eligible = full.filter(
        (b) => Math.abs(b.x + b.w / 2 - grid.columns[col]) < grid.cellW * 0.25 && b.h >= grid.cellH * 0.92 && b.y - grid.roi.y > BORDER_RADIUS && b.y + b.h + BORDER_RADIUS < grid.roi.bottom,
      );
      if (eligible.length < 2) return;
      const top = new Float32Array(BORDER_LENGTH);
      const bottom = new Float32Array(BORDER_LENGTH);
      for (const box of eligible) {
        const a = border(profiles[col], box.y - grid.roi.y);
        const b = border(profiles[col], box.y + box.h - grid.roi.y);
        for (let i = 0; i < BORDER_LENGTH; i++) {
          top[i] += a[i] / eligible.length;
          bottom[i] += b[i] / eligible.length;
        }
      }
      columns.push({
        x: median(eligible.map((b) => b.x)),
        w: median(eligible.map((b) => b.w)),
        h: median(eligible.map((b) => b.h)),
        top,
        bottom,
        centerOffset: median(eligible.map((b) => b.y + b.h / 2 - row(b) * pitch - offset)) - originY,
        contrast: (norm(top) + norm(bottom)) / 2,
      });
    }
    this.columns = columns;
    this.layout = { pitch, originY };
  }

  locate(source: FrameSource, grid: Grid, offset: number): CellBbox[] | null {
    return this.columns && this.layout ? matchGridBorders(this.profiles(source, grid), this.columns, { ...grid, ...this.layout }, offset) : null;
  }
}
