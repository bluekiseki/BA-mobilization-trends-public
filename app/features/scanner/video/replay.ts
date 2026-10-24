import type { ReplayFrame, TraceEntry } from './types';

export interface ReplayView {
  frame: ReplayFrame;
  index: number;
  /** Vertical shift (frame pixels) from the keyframe's cell positions to the currently displayed frame. */
  delta: number;
}

function preceding(entries: Array<{ time: number }>, time: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (entries[middle].time <= time + 1e-5) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

/**
 * Finds the recognised keyframe to draw at `time` and how far the grid has scrolled since it.
 * Exact on keyframes, interpolated between motion samples, and null where no reliable link exists.
 */
export function replayAt(frames: ReplayFrame[], motion: TraceEntry[], time: number): ReplayView | null {
  const index = preceding(frames, time);
  if (index < 0) return null;
  const frame = frames[index];
  const i = preceding(motion, time);
  const before = motion[i];
  const after = motion[i + 1];
  if (!before || before.segment !== frame.segment) return null;
  let offset = before.offset;
  if (after && after.segment === before.segment && after.time - before.time <= 0.3) {
    const fraction = Math.max(0, Math.min(1, (time - before.time) / (after.time - before.time || 1)));
    offset += (after.offset - before.offset) * fraction;
  } else if (time - before.time > 0.15) return null;
  return { frame, index, delta: offset - frame.offset };
}
