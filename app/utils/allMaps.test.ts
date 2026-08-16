import { describe, it, expect } from 'vitest';
import { solveRoadPuzzle } from './solveRoadPuzzle';
import { ROAD_PUZZLE_MAPS } from '../data/roadPuzzleMaps';
import type { Grid } from './solveRoadPuzzle';

// ---------------------------------------------------------------------------
// Connectivity helper: BFS from S, treating 'r' cells as one-way forced exits.
// Returns the set of reachable (col,row) positions from S, plus whether G is in the set.
// ---------------------------------------------------------------------------
function reachableFromStart(grid: Grid, rowOffset: 0 | 1) {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;

  const EVEN: [number, number][] = [
    [-1, -1],
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
  ];
  const ODD: [number, number][] = [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 0],
  ];

  function neighbors(col: number, row: number): [number, number][] {
    const isOdd = (row + rowOffset) % 2 === 1;
    const dirs = isOdd ? ODD : EVEN;
    return dirs.map(([dc, dr]) => [col + dc, row + dr] as [number, number]).filter(([nc, nr]) => nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].type !== 'x');
  }

  let startCol = -1,
    startRow = -1;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (grid[r][c].type === 's') {
        startCol = c;
        startRow = r;
      }

  if (startCol < 0) return { cells: new Set<string>(), goalReachable: false };

  const visited = new Set<string>();
  const queue: [number, number][] = [[startCol, startRow]];
  visited.add(`${startCol},${startRow}`);

  while (queue.length) {
    const next = queue.shift();
    if (!next) break;
    const [col, row] = next;
    for (const [nc, nr] of neighbors(col, row)) {
      const key = `${nc},${nr}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push([nc, nr]);
      }
    }
  }

  let goalReachable = false;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c].type === 'g' && visited.has(`${c},${r}`)) goalReachable = true;

  return { cells: visited, goalReachable };
}

// ---------------------------------------------------------------------------
// Rail validation: for every 'r' cell, both connected sides should lead to
// a non-wall cell (or be accessible), otherwise the rail is "dead-end".
// ---------------------------------------------------------------------------
function checkRails(grid: Grid, rowOffset: 0 | 1) {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;

  const EVEN: [number, number][] = [
    [-1, -1],
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
  ];
  const ODD: [number, number][] = [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 0],
  ];

  const deadEnds: string[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = grid[row][col];
      if (cell.type !== 'r') continue;

      const isOdd = (row + rowOffset) % 2 === 1;
      const dirs = isOdd ? ODD : EVEN;

      for (const side of [cell.a, cell.b]) {
        const [dc, dr] = dirs[side - 1];
        const nc = col + dc,
          nr = row + dr;
        const inBounds = nr >= 0 && nr < rows && nc >= 0 && nc < cols;
        const accessible = inBounds && grid[nr][nc].type !== 'x';
        if (!accessible) {
          deadEnds.push(`r(${cell.a},${cell.b})@(${col},${row}) side ${side} → (${nc},${nr}) is ${inBounds ? 'wall' : 'OOB'}`);
        }
      }
    }
  }

  return deadEnds;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('All map solver', () => {
  Object.entries(ROAD_PUZZLE_MAPS).forEach(([name, mapData]) => {
    it(name, () => {
      if (!mapData) {
        console.log(`${name}: no data (skipped)`);
        return;
      }
      const result = solveRoadPuzzle(mapData.grid, mapData.rowOffset, undefined, mapData.goalEntry, mapData.startEntry);
      if (result.found) {
        console.log(`${name}: tiles=${result.minTiles} path=${result.path.length} counts=${JSON.stringify(result.tileCounts)}`);
      } else {
        // On failure, diagnose connectivity and rail issues
        const { goalReachable } = reachableFromStart(mapData.grid, mapData.rowOffset);
        const deadEnds = checkRails(mapData.grid, mapData.rowOffset);
        console.error(`${name}: NOT FOUND`);
        console.error(`  Goal reachable from S (ignoring rail direction): ${goalReachable}`);
        if (deadEnds.length) console.error('  Dead-end rails:\n    ' + deadEnds.join('\n    '));
      }
      expect(result.found, `${name} should be solvable`).toBe(true);
    });
  });
});

describe('Rail connectivity', () => {
  Object.entries(ROAD_PUZZLE_MAPS).forEach(([name, mapData]) => {
    it(`${name} - S/G reachability`, () => {
      if (!mapData) return;
      const { goalReachable } = reachableFromStart(mapData.grid, mapData.rowOffset);
      expect(goalReachable, `G should be reachable from S in ${name}`).toBe(true);
    });

    it(`${name} - no dead-end rails`, () => {
      if (!mapData) return;
      const deadEnds = checkRails(mapData.grid, mapData.rowOffset);
      if (deadEnds.length) {
        console.error(`${name} dead-end rails:\n  ` + deadEnds.join('\n  '));
      }
      expect(deadEnds, `All rails in ${name} should have two accessible sides`).toHaveLength(0);
    });
  });
});
