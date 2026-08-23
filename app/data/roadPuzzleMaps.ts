import type { Grid } from '~/utils/solveRoadPuzzle';

// Hexagon side numbering used by rail (r) and goalEntry: 1=UL, 2=UR, 3=R, 4=LR, 5=LL, 6=L.
//
//      /\
//   1 /  \ 2
//    |    |
//  6 |    | 3
//    |    |
//   5 \  / 4
//      \/
//
export interface MapData {
  grid: Grid;
  // 0 = row 0 is even (no visual indent), 1 = row 0 is odd (has visual indent)
  rowOffset: 0 | 1;
  // Explicit door side for G (1-6). Auto-detected from the grid when omitted.
  goalEntry?: number;
  // Restrict the first tile placed next to S to a single exit side (1-6). All sides allowed when omitted.
  startEntry?: number;
}

const W: Grid[0][0] = { type: 'x' };
const O: Grid[0][0] = { type: 'o' };
const S: Grid[0][0] = { type: 's' };
const G: Grid[0][0] = { type: 'g' };
const r = (a: number, b: number): Grid[0][0] => ({ type: 'r', a, b });

// Phase 4 / RoadPuzzleMapName_EASY1
// rails: 1=r36 @(4,2), 2=r16 @(7,3), 3=r56 @(5,5), 4=r24 @(1,6)
const EASY1: MapData = {
  rowOffset: 0,
  grid: [
    [W, W, O, O, O, W, O, W, W],
    [G, O, W, O, W, O, O, O, W],
    [W, W, W, O, r(3, 6), O, W, O, W],
    [S, O, W, W, W, W, O, r(1, 6), W],
    [W, W, O, W, O, O, W, O, W],
    [W, O, W, O, O, r(5, 6), W, O, W],
    [W, r(2, 4), W, O, W, O, O, O, O],
    [W, O, O, O, W, W, W, W, W],
  ],
};

// Phase 5 / RoadPuzzleMapName_30-1
// rails: 1=r36 @(2,1), 2=r56 @(6,1), 3=r46 @(3,5)
const MAP_30_1: MapData = {
  rowOffset: 0,
  grid: [
    [W, W, W, W, O, O, W, W],
    [O, O, r(3, 6), O, W, O, r(5, 6), W],
    [W, O, O, O, O, O, O, W],
    [W, W, O, W, O, O, W, W],
    [W, W, O, O, O, O, O, W],
    [S, O, O, r(4, 6), O, O, O, W],
    [W, W, O, O, O, W, O, W],
    [W, W, W, W, W, W, O, G],
  ],
};

// Phase 6 / RoadPuzzle_1
// First row has indent (rowOffset=1)
// rails: 1=r34 @(5,1), 2=r26 @(6,4), 3=r26 @(5,6)
const ROAD_PUZZLE_1: MapData = {
  rowOffset: 1,
  grid: [
    [W, W, W, W, W, W, W, G],
    [S, O, O, W, W, r(3, 4), O, O],
    [W, O, W, W, W, O, O, W],
    [W, O, O, W, W, O, O, O],
    [O, O, O, O, O, O, r(2, 6), W],
    [W, O, O, O, W, O, O, O],
    [O, O, O, W, W, r(1, 3), O, W],
    [W, O, O, W, W, W, W, W],
  ],
};
// Round 7 / RoadPuzzle_2
// First row has indent (rowOffset=1)
// rails: 1=r24 @(3,2), 2=r45 @(3,5), 3=r25 @(6,6)
// S only connects out through side 3 (R)
const ROAD_PUZZLE_2: MapData = {
  rowOffset: 1,
  startEntry: 3,
  grid: [
    [W, W, W, O, O, O, W, W],
    [S, O, O, O, O, O, O, W],
    [O, W, O, r(2, 4), W, W, W, W],
    [O, O, O, W, O, W, W, W],
    [W, W, W, W, O, O, W, W],
    [W, W, W, r(4, 5), W, O, O, O],
    [G, O, O, O, O, O, r(2, 5), W],
    [W, W, O, O, O, O, O, W],
  ],
};

// Round 7 / RoadPuzzle_3
// First row has indent (rowOffset=1)
// rails: 1=r26 @(6,2), 2=r35 @(1,3), 3=r14 @(6,5)
const ROAD_PUZZLE_3: MapData = {
  rowOffset: 1,
  grid: [
    [O, O, W, W, W, W, W, G, W],
    [W, O, O, W, W, W, W, O, W],
    [W, O, O, W, W, O, r(2, 6), W, W],
    [W, r(3, 5), O, O, W, O, O, W, W],
    [O, W, W, O, W, O, O, W, W],
    [O, O, W, W, O, O, r(1, 4), O, W],
    [O, O, W, O, O, W, O, O, W],
    [S, W, W, W, O, W, W, O, O],
  ],
};

// Round 7 / RoadPuzzle_4
// rails: 1=r45 @(5,0), 2=r25 @(2,2), 3=r56 @(6,5)
const ROAD_PUZZLE_4: MapData = {
  rowOffset: 0,
  grid: [
    [W, W, W, W, W, r(4, 5), W, W, W],
    [W, W, O, O, O, O, W, W, W],
    [W, W, r(2, 5), O, O, W, O, W, W],
    [W, O, W, O, W, O, W, W, W],
    [W, O, O, W, W, O, W, W, O],
    [O, O, O, W, W, O, r(5, 6), O, O],
    [W, O, O, O, W, W, O, O, O],
    [S, W, O, O, W, O, O, W, G],
  ],
};

// Round 7 / RoadPuzzle_5
// rails: 1=r35 @(1,1), 2=r36 @(4,1), 3=r25 @(8,4)
const ROAD_PUZZLE_5: MapData = {
  rowOffset: 0,
  grid: [
    [W, W, W, W, W, W, O, W, W, W],
    [W, r(3, 5), O, O, r(3, 6), O, O, O, O, W],
    [W, O, O, W, W, W, W, O, O, W],
    [W, W, O, W, W, W, W, O, W, W],
    [W, W, O, W, W, W, W, r(2, 5), W, W],
    [W, O, O, O, W, O, O, O, O, W],
    [W, O, O, O, W, W, O, O, O, W],
    [S, W, W, W, W, O, O, O, W, W],
    [W, W, W, W, W, W, W, W, G, W],
  ],
};

// Round 7 / RoadPuzzle_6
// rails: 1=r46 @(2,0), 2=r36 @(1,3), 3=r26 @(6,3)
const ROAD_PUZZLE_6: MapData = {
  rowOffset: 1,
  grid: [
    [W, O, r(4, 6), W, W, W, W, G],
    [W, O, W, O, W, W, O, O],
    [O, W, W, O, W, O, O, W],
    [O, r(3, 6), O, O, O, O, r(2, 6), W],
    [O, O, O, O, O, W, W, W],
    [O, W, W, O, W, O, W, W],
    [O, W, O, W, W, O, W, W],
    [S, W, O, O, O, O, O, W],
  ],
};

// Round 1 / RoadPuzzleMapName_START2
// rails: 1=r15 @(3,1), 2=r14 @(5,4), 3=r36 @(4,5)
const START2: MapData = {
  rowOffset: 0,
  grid: [
    [S, O, O, O, W, W, W, W, W],
    [W, W, W, r(1, 5), W, W, W, W, W],
    [W, W, W, O, W, O, O, O, G],
    [W, W, O, W, O, W, W, W, W],
    [W, W, O, W, W, r(1, 4), W, W, W],
    [W, W, O, O, r(3, 6), O, W, W, W],
  ],
};

// Round 2 / RoadPuzzleMapName_EASY2
// rails: 1=r13 @(3,3), 2=r56 @(7,3) and @(5,5), 3=r24 @(0,6)
const EASY2: MapData = {
  rowOffset: 1,
  grid: [
    [W, O, O, W, W, O, O, O, W],
    [G, O, W, O, W, O, W, W, O],
    [W, W, O, W, O, W, O, O, W],
    [S, O, W, r(1, 3), O, W, O, r(1, 6), W],
    [W, O, W, W, W, W, O, W, W],
    [W, O, W, O, O, r(5, 6), W, O, W],
    [r(2, 4), W, O, W, O, O, W, O, W],
    [W, O, O, W, W, W, O, O, W],
  ],
};

// Round 3 / RoadPuzzleMapName_LessStraight
// rails: 1=r35 @(6,2), 2=r12 @(3,5), 3=r13 @(4,7)
// G at (7,3) has two accessible neighbors; door is side 4 (LR) only
const LESS_STRAIGHT: MapData = {
  rowOffset: 0,
  goalEntry: 4,
  grid: [
    [S, O, O, W, W, O, O, O, W, W],
    [W, O, W, O, O, W, W, O, W, W],
    [W, W, O, O, W, W, r(3, 5), O, W, W],
    [W, W, W, W, O, O, W, G, W, W],
    [W, O, O, O, O, W, W, W, O, W],
    [O, W, W, r(1, 2), W, O, O, O, W, W],
    [W, O, O, W, O, W, O, W, W, W],
    [W, W, O, O, r(1, 3), O, W, W, W, W],
  ],
};

export const ROAD_PUZZLE_MAPS: Record<string, MapData | null> = {
  RoadPuzzleMapName_EASY1: EASY1,
  RoadPuzzleMapName_START2: START2,
  RoadPuzzleMapName_EASY2: EASY2,
  RoadPuzzleMapName_LessStraight: LESS_STRAIGHT,
  'RoadPuzzleMapName_30-1': MAP_30_1,
  RoadPuzzle_1: ROAD_PUZZLE_1,
  RoadPuzzle_2: ROAD_PUZZLE_2,
  RoadPuzzle_3: ROAD_PUZZLE_3,
  RoadPuzzle_4: ROAD_PUZZLE_4,
  RoadPuzzle_5: ROAD_PUZZLE_5,
  RoadPuzzle_6: ROAD_PUZZLE_6,
};

export interface RailCounts {
  straight: number;
  longCurve: number;
  shortCurve: number;
}

export function calculateMapRails(mapData: MapData): RailCounts {
  let straight = 0;
  let longCurve = 0;
  let shortCurve = 0;

  for (const row of mapData.grid) {
    for (const cell of row) {
      if (cell.type === 'r' && cell.a !== undefined && cell.b !== undefined) {
        const [minSide, maxSide] = [Math.min(cell.a, cell.b), Math.max(cell.a, cell.b)];
        // Straight rails: (1,4), (2,5), (3,6)
        if ((minSide === 1 && maxSide === 4) || (minSide === 2 && maxSide === 5) || (minSide === 3 && maxSide === 6)) {
          straight++;
        } else {
          // Adjacent sides are curved. Determine if long (distance 2) or short (distance 1)
          const dist = maxSide - minSide;
          if (dist === 2 || dist === 4) {
            longCurve++;
          } else {
            shortCurve++;
          }
        }
      }
    }
  }

  return { straight, longCurve, shortCurve };
}
