import { describe, expect, it } from 'vitest';
import { matchGridBorders, type ColumnBorders } from './gridGeometry';
import type { Grid } from './types';

const grid: Grid = { columns: [50, 150, 250], originY: 70, pitch: 120, cellH: 80, cellW: 90, roi: { x: 0, right: 300, y: 0, bottom: 450 } };
const models = (): ColumnBorders[] =>
  grid.columns.map((x) => {
    const top = new Float32Array(17);
    const bottom = new Float32Array(17);
    top[7] = top[8] = 100;
    bottom[7] = bottom[8] = -100;
    return { x: x - 45, w: 90, h: 80, top, bottom, contrast: Math.sqrt(20000) };
  });
const profiles = (shift = 0, contrast = 100): Float32Array[] =>
  grid.columns.map(() => {
    const profile = new Float32Array(450).fill(100);
    for (let row = -1; row < 5; row++) {
      const top = 30 + row * 120 + shift;
      for (let y = Math.max(0, top); y < Math.min(450, top + 80); y++) profile[y] = 100 + contrast;
    }
    return profile;
  });

describe('grid border geometry', () => {
  it('refines vertical position without changing column coordinates or card size', () => {
    const boxes = matchGridBorders(profiles(7), models(), grid, 0);
    expect(boxes).toHaveLength(9);
    expect(boxes?.[0]).toEqual({ x: 5, y: 37, w: 90, h: 80 });
    expect(boxes?.[3].y).toBe(157);
  });

  it('generates newly entering rows after a full row of scroll without detector boxes', () => {
    const boxes = matchGridBorders(profiles(), models(), grid, -120);
    expect(boxes).toHaveLength(9);
    expect(boxes?.[0].y).toBe(30);
  });

  it('ignores changing icon contents away from the card borders', () => {
    const current = profiles();
    for (const profile of current) for (let row = 0; row < 3; row++) for (let y = 50 + row * 120; y < 90 + row * 120; y++) profile[y] = y % 2 ? 20 : 240;
    expect(matchGridBorders(current, models(), grid, 0)).toHaveLength(9);
  });

  it('rejects obscured borders and fades instead of creating cells on a modal overlay', () => {
    expect(
      matchGridBorders(
        grid.columns.map(() => new Float32Array(450).fill(220)),
        models(),
        grid,
        0,
      ),
    ).toBeNull();
    expect(matchGridBorders(profiles(0, 20), models(), grid, 0)).toBeNull();
  });

  it('retains a highlighted card when independent columns still establish the row', () => {
    const fiveColumns = { ...grid, columns: [50, 150, 250, 350, 450], roi: { ...grid.roi, right: 500 } };
    const templates = Array.from({ length: 5 }, (_, i) => ({ ...models()[0], x: i * 100 + 5 }));
    const current = Array.from({ length: 5 }, () => profiles()[0]);
    current[3] = profiles(7)[0];
    const boxes = matchGridBorders(current, templates, fiveColumns, 0);
    expect(boxes).toHaveLength(15);
    expect(boxes?.find((box) => box.x === 305)?.y).toBe(30);
  });

  it('requests detection rather than omitting a cell with missing borders', () => {
    const current = profiles();
    current[2].fill(100, 260);
    const boxes = matchGridBorders(current, models(), grid, 0);
    expect(boxes).toBeNull();
  });
});
