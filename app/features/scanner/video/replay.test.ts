import { describe, expect, it } from 'vitest';
import { replayAt } from './replay';
import type { ReplayFrame, TraceEntry } from './types';

const roi = { x: 0, y: 0, right: 100, bottom: 100 };
const frame = (time: number, offset: number, segment = 0): ReplayFrame => ({ time, frame: Math.round(time * 100), offset, segment, rowStart: 0, roi, width: 100, height: 100, cells: [] });
const step = (time: number, offset: number, segment = 0): TraceEntry => ({ frame: 0, time, offset, segment, reliable: true });

describe('replayAt', () => {
  it('returns null before the first keyframe', () => {
    expect(replayAt([frame(1, 0)], [step(1, 0)], 0.5)).toBeNull();
  });

  it('is exact on a keyframe and interpolates scroll offset between motion samples', () => {
    const frames = [frame(1, 0)];
    const motion = [step(1, 0), step(1.2, -40)];
    expect(replayAt(frames, motion, 1)?.delta).toBe(0);
    expect(replayAt(frames, motion, 1.1)?.delta).toBeCloseTo(-20);
  });

  it('gives up when the motion trace has a gap or crosses a segment', () => {
    const frames = [frame(1, 0)];
    expect(replayAt(frames, [step(1, 0)], 1.5)).toBeNull();
    expect(replayAt(frames, [step(1, 0, 1)], 1)).toBeNull();
  });
});
