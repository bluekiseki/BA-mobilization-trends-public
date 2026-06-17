import { describe, it, expect } from 'vitest';
import { solveRoadPuzzle } from './solveRoadPuzzle';
import type { Grid } from './solveRoadPuzzle';

const W: Grid[0][0] = { type: 'x' };
const O: Grid[0][0] = { type: 'o' };
const S: Grid[0][0] = { type: 's' };
const G: Grid[0][0] = { type: 'g' };
const r = (a: number, b: number): Grid[0][0] => ({ type: 'r', a, b });

// EASY1 map — Phase 4
// rails: r36 @(4,2), r16 @(7,3), r56 @(5,5), r24 @(1,6)
const EASY1: Grid = [
  [W, W, W, W, O, O, W, W],
  [O, O, r(3, 6), O, W, O, r(5, 6), W],
  [W, O, O, O, O, O, O, W],
  [W, W, O, W, O, O, W, W],
  [W, W, O, O, O, O, O, W],
  [S, O, O, r(4, 6), O, O, O, W],
  [W, W, O, O, O, W, O, W],
  [W, W, W, W, W, W, O, G],
];

// Minimal test map: S → (O) → G, straight path via side 3 then side 6
// Row 0: S O G (even row)
const MINIMAL: Grid = [[S, O, G]];

describe('solveRoadPuzzle', () => {
  it('solves a trivial single-tile path', () => {
    const result = solveRoadPuzzle(MINIMAL, 0);
    expect(result.found).toBe(true);
    expect(result.minTiles).toBe(1);
  });

  it('solves EASY1 map and finds a path', () => {
    const result = solveRoadPuzzle(EASY1, 0);
    expect(result.found).toBe(true);
    expect(result.minTiles).toBeGreaterThan(0);
    expect(result.minTiles).toBeLessThanOrEqual(30);
    const total = (result.tileCounts[1] ?? 0) + (result.tileCounts[2] ?? 0) + (result.tileCounts[3] ?? 0);
    expect(total).toBe(result.minTiles);
    console.log('EASY1 result:', result);
  });

  it('returns not-found for an impossible map', () => {
    const impossible: Grid = [[S, W, G]];
    const result = solveRoadPuzzle(impossible, 0);
    expect(result.found).toBe(false);
  });
});
