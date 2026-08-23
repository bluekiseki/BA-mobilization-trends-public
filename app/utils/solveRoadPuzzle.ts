// Hex grid path solver for the Road Puzzle minigame.
//
// Grid uses offset coordinates: odd rows are shifted right by half a hex.
// Sides are numbered 1-6: 1=UL, 2=UR, 3=R, 4=LR, 5=LL, 6=L.
//
// Tile types:
//   1 (Straight)   - connects opposite sides:  1↔4, 2↔5, 3↔6
//   2 (Long curve) - connects sides 2 apart:   1↔3, 2↔4, 3↔5, 4↔6, 5↔1, 6↔2
//   3 (Short curve)- connects adjacent sides:  1↔2, 2↔3, 3↔4, 4↔5, 5↔6, 6↔1
//
// Rules:
//   - Pre-placed rails ('r') are mandatory: every r-cell must lie on the path.
//   - Each cell is visited at most once (simple path — one tile per hex).
//   - G's door side is auto-detected (single accessible neighbor) or overridden.
//   - When inventory is supplied only tile types with remaining > 0 are used,
//     and per-type usage is tracked.

// Pre-placed rails mandatory; each cell visited once.

export type Cell =
  | { type: 'x' } // wall (impassable)
  | { type: 'o' } // empty, placeable (costs 1 tile)
  | { type: 's' } // start
  | { type: 'g' } // goal
  | { type: 'r'; a: number; b: number }; // pre-placed rail; a↔b, cost 0, mandatory

export type Grid = Cell[][];

export interface PathStep {
  col: number;
  row: number;
  entry: number; // side we entered this cell from; 0 = start cell (no entry)
}

export interface SolveResult {
  found: boolean;
  minTiles: number;
  tileCounts: Record<number, number>; // tileType (1|2|3) → count in optimal path
  path: PathStep[]; // ordered from start to goal; empty if not found
}

const EVEN_NEIGHBORS: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0], // sides 1-6
];
const ODD_NEIGHBORS: [number, number][] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 0], // sides 1-6
];

function getNeighbor(col: number, row: number, side: number, rowOffset: 0 | 1): [number, number] {
  const isOdd = (row + rowOffset) % 2 === 1;
  const [dc, dr] = (isOdd ? ODD_NEIGHBORS : EVEN_NEIGHBORS)[side - 1];
  return [col + dc, row + dr];
}

function opposite(side: number): number {
  return ((side - 1 + 3) % 6) + 1;
}

function getExits(entry: number, tileType: 1 | 2 | 3): number[] {
  const e = entry - 1;
  if (tileType === 1) return [((e + 3) % 6) + 1];
  if (tileType === 2) return [((e + 2) % 6) + 1, ((e + 4) % 6) + 1];
  return [((e + 1) % 6) + 1, ((e + 5) % 6) + 1];
}

// [remaining type1, remaining type2, remaining type3]; -1 = unlimited
type Rem = [number, number, number];

// inventory: tileType → available count (undefined = no limit). goalEntryOverride/startEntryOverride
// restrict G's door / S's first exit to one side (all sides tried when omitted).
export function solveRoadPuzzle(grid: Grid, rowOffset: 0 | 1 = 0, inventory?: Record<number, number>, goalEntryOverride?: number, startEntryOverride?: number): SolveResult {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;

  let startCol = -1,
    startRow = -1;
  let goalCol = -1,
    goalRow = -1;
  const railCellIndex = new Map<string, number>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.type === 's') {
        startCol = c;
        startRow = r;
      }
      if (cell.type === 'g') {
        goalCol = c;
        goalRow = r;
      }
      if (cell.type === 'r') railCellIndex.set(`${c},${r}`, railCellIndex.size);
    }
  }

  if (startCol < 0) return { found: false, minTiles: 0, tileCounts: {}, path: [] };

  const numRails = railCellIndex.size;
  const fullMask = (1 << numRails) - 1;

  // Build rail coordinates and required exits for each neighbor cell
  const railCoords: Array<[number, number]> = new Array<[number, number]>(numRails);
  // railSideRequired[r][c] = [{ railIdx, requiredExit }, ...]
  // tells which rail side must connect if a tile is placed at (c,r)
  const railSideRequired: Array<Array<Array<{ railIdx: number; requiredExit: number }>>> = Array.from({ length: rows }, () => Array.from({ length: cols }, () => []));

  for (const [key, idx] of railCellIndex) {
    const [c, r] = key.split(',').map(Number);
    railCoords[idx] = [c, r];

    // For each neighbor of this rail, record which exit side must connect
    const rail = grid[r][c] as { a: number; b: number };

    const [ncA, nrA] = getNeighbor(c, r, rail.a, rowOffset);
    if (nrA >= 0 && nrA < rows && ncA >= 0 && ncA < cols) {
      // If tile placed at (ncA, nrA), it must exit with opposite(rail.a) to connect to the rail
      railSideRequired[nrA][ncA].push({ railIdx: idx, requiredExit: opposite(rail.a) });
    }

    const [ncB, nrB] = getNeighbor(c, r, rail.b, rowOffset);
    if (nrB >= 0 && nrB < rows && ncB >= 0 && ncB < cols) {
      // If tile placed at (ncB, nrB), it must exit with opposite(rail.b) to connect to the rail
      railSideRequired[nrB][ncB].push({ railIdx: idx, requiredExit: opposite(rail.b) });
    }
  }

  let goalEntry = goalEntryOverride ?? 0;
  if (!goalEntry && goalCol >= 0) {
    const isOdd = (goalRow + rowOffset) % 2 === 1;
    const dirs = isOdd ? ODD_NEIGHBORS : EVEN_NEIGHBORS;
    for (let s = 0; s < 6; s++) {
      const [dc, dr] = dirs[s];
      const nc = goalCol + dc,
        nr = goalRow + dr;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].type !== 'x') {
        goalEntry = s + 1;
        break;
      }
    }
  }

  const hasInv = inventory !== undefined;
  const initRem: Rem = hasInv ? [inventory[1] ?? 0, inventory[2] ?? 0, inventory[3] ?? 0] : [-1, -1, -1];

  const MAX_COST = 60;
  let bestCost = hasInv ? Math.min(MAX_COST + 1, initRem[0] + initRem[1] + initRem[2] + 1) : MAX_COST + 1;

  // hDist[r][c] = min 'o' tiles to reach G from (c,r)
  const INF = MAX_COST + 2;
  const hDist: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(INF));
  if (goalCol >= 0) {
    hDist[goalRow][goalCol] = 0;
    const deque: [number, number, number][] = [[goalCol, goalRow, 0]];
    while (deque.length) {
      const item = deque.shift();
      if (!item) break;
      const [c, r, d] = item;
      if (d > hDist[r][c]) continue;
      const isOdd = (r + rowOffset) % 2 === 1;
      const dirs = isOdd ? ODD_NEIGHBORS : EVEN_NEIGHBORS;
      for (let s = 0; s < 6; s++) {
        const [dc, dr] = dirs[s];
        const nc = c + dc,
          nr = r + dr;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (grid[nr][nc].type === 'x') continue;
        const moveCost = grid[nr][nc].type === 'o' ? 1 : 0;
        const nd = d + moveCost;
        if (nd < hDist[nr][nc]) {
          hDist[nr][nc] = nd;
          if (moveCost === 0) deque.unshift([nc, nr, nd]);
          else deque.push([nc, nr, nd]);
        }
      }
    }
  }

  let foundSolution = false;
  let bestPath: PathStep[] = [];
  let bestCounts: [number, number, number] = [0, 0, 0];

  // Use 2D boolean array instead of Set<string> for visited tracking
  const visited: boolean[][] = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));

  const path: PathStep[] = [{ col: startCol, row: startRow, entry: 0 }];
  const counts: [number, number, number] = [0, 0, 0];

  const nb = (c: number, r: number, side: number) => getNeighbor(c, r, side, rowOffset);

  function dfs(col: number, row: number, entry: number, mask: number, rem: Rem, cost: number) {
    if (cost >= bestCost) return;
    if (cost + hDist[row][col] >= bestCost) return;

    const cell = grid[row][col];

    if (cell.type === 'g') {
      if (goalEntry > 0 && entry !== goalEntry) return;
      if (mask !== fullMask) return;
      bestCost = cost;
      bestPath = [...path];
      bestCounts = [...counts] as [number, number, number];
      foundSolution = true;
      return;
    }

    if (visited[row][col]) return;
    visited[row][col] = true;

    if (cell.type === 'o') {
      // Check if this cell must satisfy essential rail connectivity constraints
      const required = railSideRequired[row][col];

      // Collect all valid moves with goal-distance
      const moves: Array<{ t: 1 | 2 | 3; ne: number; nc: number; nr: number; dist: number }> = [];

      for (const t of [1, 2, 3] as const) {
        if (hasInv && rem[t - 1] <= 0) continue;

        // Check if this tile type satisfies rail requirements for the current cell
        if (mask !== fullMask && required.length > 0) {
          let isValid = true;
          for (const { railIdx, requiredExit } of required) {
            if ((mask & (1 << railIdx)) === 0) {
              // unvisited rail
              const exits = getExits(entry, t);
              if (!exits.includes(requiredExit)) {
                isValid = false;
                break;
              }
            }
          }
          if (!isValid) continue;
        }

        for (const exit of getExits(entry, t)) {
          const [nc, nr] = nb(col, row, exit);
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (grid[nr][nc].type === 'x') continue;

          const h = hDist[nr][nc];
          if (cost + 1 + h >= bestCost) continue; // prune before pushing
          moves.push({ t, ne: opposite(exit), nc, nr, dist: h });
        }
      }

      // Sort moves by distance
      moves.sort((a, b) => a.dist - b.dist);

      for (const { t, ne, nc, nr } of moves) {
        counts[t - 1]++;
        path.push({ col: nc, row: nr, entry: ne });

        // Backtrack: decrement rem
        rem[t - 1]--;
        dfs(nc, nr, ne, mask, rem, cost + 1);
        rem[t - 1]++;

        path.pop();
        counts[t - 1]--;
      }
    } else if (cell.type === 'r') {
      const rail = cell;
      const exit = entry === rail.a ? rail.b : entry === rail.b ? rail.a : 0;
      if (exit) {
        const [nc, nr] = nb(col, row, exit);
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].type !== 'x') {
          const key = `${col},${row}`;
          const ri = railCellIndex.get(key) ?? -1;
          const newMask = ri >= 0 ? mask | (1 << ri) : mask;
          const ne = opposite(exit);
          path.push({ col: nc, row: nr, entry: ne });
          dfs(nc, nr, ne, newMask, rem, cost);
          path.pop();
        }
      }
    }

    visited[row][col] = false;
  }

  for (let side = 1; side <= 6; side++) {
    if (startEntryOverride && side !== startEntryOverride) continue;
    const [nc, nr] = nb(startCol, startRow, side);
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    if (grid[nr][nc].type === 'x') continue;
    const ne = opposite(side);
    path.push({ col: nc, row: nr, entry: ne });
    dfs(nc, nr, ne, 0, initRem, 0);
    path.pop();
  }

  if (foundSolution) {
    return {
      found: true,
      minTiles: bestCost,
      tileCounts: { 1: bestCounts[0], 2: bestCounts[1], 3: bestCounts[2] },
      path: bestPath,
    };
  }
  return { found: false, minTiles: 0, tileCounts: {}, path: [] };
}
