import { describe, expect, it } from 'vitest';
import { adaptiveKeyframe, assignCells, expandGridRoi, fitCellOffset, resolveVotes, semanticOffset, shouldObserve } from './math';
import type { CellEntry, Grid, Observation, Track } from './types';

const pred = (key: string | null, quantity: number | null, similarity = 0.9, ocrConfidence = 0.9) => ({ key, quantity, rawQty: null, similarity, ocrConfidence });
const obs = (quantity: number | null, key = 'Item_10'): Observation => ({ ...pred(key, quantity), frame: 0, time: 0, box: { x: 0, y: 0, w: 0, h: 0 } });
const grid = (overrides: Partial<Grid>): Grid => ({ columns: [100, 230], originY: 100, pitch: 100, cellH: 80, cellW: 100, roi: { x: 40, right: 290, y: 50, bottom: 360 }, ...overrides });

describe('video math', () => {
  it('recognition anchoring requires three independent columns and rejects repeated identities', () => {
    const g = grid({ originY: 50 });
    const tracks = new Map<string, Track>();
    const entries: CellEntry[] = [];
    for (let col = 0; col < 3; col++) {
      const prediction = pred(`Item_${col}`, 10 + col, 0.9, 0.95);
      tracks.set(`0:5:${col}`, { id: `0:5:${col}`, segment: 0, row: 5, col, observations: [{ ...prediction, frame: 0, time: 0, box: { x: 0, y: 0, w: 0, h: 0 } }] });
      entries.push({ id: `0:3:${col}`, segment: 0, row: 3, col, box: { x: 0, y: 300, w: 100, h: 100 }, prediction });
    }
    expect(semanticOffset(entries, tracks, g, 0)).toBe(-200);
    expect(semanticOffset(entries.slice(0, 2), tracks, g, 0)).toBeNull();
    tracks.set('0:6:0', { id: '0:6:0', segment: 0, row: 6, col: 0, observations: tracks.get('0:5:0')?.observations ?? [] });
    expect(semanticOffset(entries, tracks, g, 0)).toBeNull();
    tracks.delete('0:6:0');
    expect(
      semanticOffset(
        entries.map((e) => ({ ...e, prediction: e.prediction && { ...e.prediction, quantity: 999 } })),
        tracks,
        g,
        0,
      ),
    ).toBeNull();
    expect(semanticOffset(entries, tracks, g, 1)).toBeNull();
  });

  it('adaptive sampling covers a fast row and repeats single views at the stationary boundaries', () => {
    const base = { offset: -16154.3, lastOffset: -16033.8, pitch: 170.85, motionPx: -121.6, time: 8.25, lastTime: 8.217, stableSince: null, pendingSingle: true };
    expect(adaptiveKeyframe(base).reason).toBe('fast');
    expect(adaptiveKeyframe({ ...base, motionPx: -20 }).reason).toBe('moving');
    const still = { ...base, offset: 0, lastOffset: 0, motionPx: 0, time: 0.2, lastTime: 0, stableSince: 0 };
    expect(adaptiveKeyframe(still).reason).toBe('repeat-stopped');
    expect(adaptiveKeyframe({ ...still, pendingSingle: false }).reason).toBeNull();
  });

  it('partial rows cannot collide with a complete cell and grid drift is corrected', () => {
    const result = assignCells(
      [
        { x: 50, y: 67, w: 100, h: 80 },
        { x: 50, y: 167, w: 100, h: 80 },
        { x: 50, y: 267, w: 100, h: 60 },
      ],
      grid({}),
      0,
    );
    expect(Math.abs(result.correction - 7)).toBeLessThan(1e-9);
    expect(result.cells.map((c) => c.id)).toEqual(['0:0:0', '0:1:0']);
  });

  it('cell votes preserve one inventory quantity and leave single/ambiguous views uncertain', () => {
    expect(resolveVotes([obs(540), obs(540), obs(540)])).toEqual({ key: 'Item_10', quantity: 540, status: 'confirmed' });
    expect(resolveVotes([obs(56), obs(56), obs(56), obs(56), obs(156)]).status).toBe('uncertain');
    expect(resolveVotes([obs(540), obs(540)]).status).toBe('uncertain');
    expect(resolveVotes([obs(540), obs(540), obs(54)]).status).toBe('uncertain');
    expect(resolveVotes([obs(540)]).status).toBe('uncertain');
    expect(resolveVotes([obs(540), obs(54)]).status).toBe('uncertain');
    expect(resolveVotes([obs(null), obs(null)]).quantity).toBeNull();
    expect(resolveVotes([obs(0), obs(0)]).status).toBe('uncertain');
  });

  it('matching views do not stop sampling; repeated adjacent views are skipped and cap is five', () => {
    const box = { x: 0, y: 100, w: 100, h: 80 };
    const view = (time: number): Observation => ({ ...pred('Item_10', 540), frame: 0, time, box });
    const views = [view(0), view(0.2)];
    expect(shouldObserve(views, 0.21, { x: 0, y: 160, w: 100, h: 80 }, 100)).toBe(false);
    expect(shouldObserve(views, 0.25, { x: 0, y: 120, w: 100, h: 80 }, 100)).toBe(false);
    expect(shouldObserve(views, 0.25, { x: 0, y: 140, w: 100, h: 80 }, 100)).toBe(true);
    expect(shouldObserve(views, 0.36, box, 100)).toBe(true);
    expect(shouldObserve([...views, ...views, views[0]], 0.6, box, 100)).toBe(false);
  });

  it('initial missing rows expand the ROI, while a complete viewport keeps fixed bounds', () => {
    const narrow = grid({ roi: { x: 40, right: 290, y: 150, bottom: 350 } });
    expect(
      expandGridRoi(
        narrow,
        [
          { x: 50, y: 50, w: 100, h: 80 },
          { x: 180, y: 280, w: 100, h: 80 },
        ],
        500,
      ),
    ).toBe(true);
    expect(narrow.roi.y).toBe(40);
    const complete = grid({ roi: { x: 40, right: 290, y: 40, bottom: 440 } });
    expect(expandGridRoi(complete, [{ x: 50, y: 20, w: 100, h: 80 }], 500)).toBe(false);
    expect(complete.roi.y).toBe(40);
  });

  it('pixel anchors reconnect after more than four rows but reject identical ambiguous references', () => {
    const entries: CellEntry[] = [0, 1, 2].map((col) => ({ id: `0:4:${col}`, segment: 0, row: 4, col, signature: new Float32Array(col ? [0, 1] : [1, 0]), box: { x: 0, y: 160, w: 100, h: 80 } }));
    const refs = new Map(entries.map((e) => [String(e.col), { ...e, row: 10 }]));
    const g = grid({});
    expect(fitCellOffset(entries, refs, g)).toBe(-900);
    expect(fitCellOffset(entries.slice(0, 1), refs, g)).toBeNull();
    for (let i = 0; i < 3; i++) refs.set(String(i + 3), { ...entries[i], row: 11 });
    expect(fitCellOffset(entries, refs, g)).toBeNull();
  });
});
