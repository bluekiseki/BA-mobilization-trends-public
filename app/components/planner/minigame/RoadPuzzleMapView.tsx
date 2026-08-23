// Hex grid SVG renderer for Road Puzzle maps (pointy-top hexes, offset coords).
// Side numbering matches the solver: 1=UL, 2=UR, 3=R, 4=LR, 5=LL, 6=L
import type { Grid, PathStep } from '~/utils/solveRoadPuzzle';

const HEX_R = 18; // circumradius (center to vertex)
const SQRT3 = Math.sqrt(3);

// Hex center in SVG space
function hexCenter(col: number, row: number, rowOffset: 0 | 1): [number, number] {
  const isOdd = (row + rowOffset) % 2 === 1;
  const cx = col * SQRT3 * HEX_R + (isOdd ? (SQRT3 * HEX_R) / 2 : 0);
  const cy = row * 1.5 * HEX_R;
  return [cx, cy];
}

// Pointy-top hex vertex i (0=top, clockwise)
function hexVertex(cx: number, cy: number, i: number): [number, number] {
  const angle = (Math.PI / 3) * i - Math.PI / 2;
  return [cx + HEX_R * Math.cos(angle), cy + HEX_R * Math.sin(angle)];
}

// Midpoint of the edge on `side` (1–6) relative to hex center
// Side 1(UL)=between v5&v0, Side 2(UR)=v0&v1, ..., Side 6(L)=v4&v5
function edgeMidpoint(cx: number, cy: number, side: number): [number, number] {
  const v0 = hexVertex(cx, cy, (side - 2 + 6) % 6);
  const v1 = hexVertex(cx, cy, (side - 1 + 6) % 6);
  return [(v0[0] + v1[0]) / 2, (v0[1] + v1[1]) / 2];
}

function hexPoints(cx: number, cy: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const [x, y] = hexVertex(cx, cy, i);
    return `${x},${y}`;
  }).join(' ');
}

function cellFill(type: Grid[0][0]['type'], onPath: boolean, isDark: boolean): string {
  if (type === 'x') return isDark ? '#1a1a1a' : '#9ca3af';
  if (type === 's') return onPath ? (isDark ? '#166534' : '#86efac') : isDark ? '#14532d' : '#bbf7d0';
  if (type === 'g') return onPath ? (isDark ? '#92400e' : '#fbbf24') : isDark ? '#78350f' : '#fde68a';
  if (type === 'r') return isDark ? '#a16207' : '#fef3c7';
  if (onPath) return isDark ? '#1e3a8a' : '#bfdbfe';
  return isDark ? '#303030' : '#f3f4f6';
}

function cellStroke(type: Grid[0][0]['type'], isDark: boolean): string {
  if (type === 'x') return isDark ? '#0d0d0d' : '#6b7280';
  if (type === 's') return isDark ? '#22c55e' : '#16a34a';
  if (type === 'g') return isDark ? '#f59e0b' : '#d97706';
  if (type === 'r') return isDark ? '#fbbf24' : '#d97706';
  return isDark ? '#555555' : '#d1d5db';
}

interface Props {
  grid: Grid;
  rowOffset: 0 | 1;
  path?: PathStep[];
  isDark?: boolean;
}

export function RoadPuzzleMapView({ grid, rowOffset, path, isDark = false }: Props) {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  if (rows === 0 || cols === 0) return null;

  const pathSet = new Set<string>();
  if (path) {
    for (const step of path) pathSet.add(`${step.col},${step.row}`);
  }

  // SVG dimensions with padding
  const PAD = HEX_R + 2;
  const maxRow = rows - 1;
  const maxCol = cols - 1;
  const [maxCx, maxCy] = hexCenter(maxCol, maxRow, rowOffset);
  const svgW = maxCx + HEX_R + PAD;
  const svgH = maxCy + HEX_R + PAD;

  const railColor = isDark ? '#fbbf24' : '#d97706';
  const pathColor = isDark ? '#60a5fa' : '#2563eb';

  // Compute exit side for a path step (opposite of the next step's entry)
  function exitSide(i: number): number | null {
    if (!path || i >= path.length - 1) return null;
    const nextEntry = path[i + 1].entry;
    return ((nextEntry - 1 + 3) % 6) + 1; // opposite
  }

  return (
    <svg viewBox={`${-PAD} ${-PAD} ${svgW + PAD} ${svgH + PAD}`} width="100%" style={{ maxWidth: `${svgW + PAD * 2}px` }} className="overflow-visible">
      {/* Cell backgrounds */}
      {grid.map((row, ri) =>
        row.map((cell, ci) => {
          const [cx, cy] = hexCenter(ci, ri, rowOffset);
          const onPath = pathSet.has(`${ci},${ri}`);
          return <polygon key={`bg-${ri}-${ci}`} points={hexPoints(cx, cy)} fill={cellFill(cell.type, onPath, isDark)} stroke={cellStroke(cell.type, isDark)} strokeWidth={onPath ? 1.5 : 0.8} />;
        }),
      )}

      {/* Pre-placed rail connections (always visible) */}
      {grid.map((row, ri) =>
        row.map((cell, ci) => {
          if (cell.type !== 'r') return null;
          const [cx, cy] = hexCenter(ci, ri, rowOffset);
          const [ax, ay] = edgeMidpoint(cx, cy, cell.a);
          const [bx, by] = edgeMidpoint(cx, cy, cell.b);
          const onPath = pathSet.has(`${ci},${ri}`);
          return <path key={`rail-${ri}-${ci}`} d={`M ${ax},${ay} Q ${cx},${cy} ${bx},${by}`} stroke={onPath ? pathColor : railColor} strokeWidth={3} strokeLinecap="round" fill="none" />;
        }),
      )}

      {/* Path connections for 'o' cells */}
      {path?.map((step, i) => {
        const cell = grid[step.row]?.[step.col];
        if (!cell || cell.type !== 'o') return null;
        const exit = exitSide(i);
        if (!step.entry || !exit) return null;
        const [cx, cy] = hexCenter(step.col, step.row, rowOffset);
        const [ex, ey] = edgeMidpoint(cx, cy, step.entry);
        const [fx, fy] = edgeMidpoint(cx, cy, exit);
        return <path key={`path-${i}`} d={`M ${ex},${ey} Q ${cx},${cy} ${fx},${fy}`} stroke={pathColor} strokeWidth={3} strokeLinecap="round" fill="none" />;
      })}

      {/* Start exit line */}
      {path &&
        path.length >= 2 &&
        (() => {
          const start = path[0];
          const cell = grid[start.row]?.[start.col];
          if (!cell || cell.type !== 's') return null;
          const exitS = exitSide(0);
          if (!exitS) return null;
          const [cx, cy] = hexCenter(start.col, start.row, rowOffset);
          const [fx, fy] = edgeMidpoint(cx, cy, exitS);
          return <line key="start-exit" x1={cx} y1={cy} x2={fx} y2={fy} stroke={pathColor} strokeWidth={3} strokeLinecap="round" />;
        })()}

      {/* Goal entry line */}
      {path &&
        path.length >= 1 &&
        (() => {
          const goal = path[path.length - 1];
          const cell = grid[goal.row]?.[goal.col];
          if (!cell || cell.type !== 'g' || !goal.entry) return null;
          const [cx, cy] = hexCenter(goal.col, goal.row, rowOffset);
          const [ex, ey] = edgeMidpoint(cx, cy, goal.entry);
          return <line key="goal-entry" x1={ex} y1={ey} x2={cx} y2={cy} stroke={pathColor} strokeWidth={3} strokeLinecap="round" />;
        })()}

      {/* Cell labels */}
      {grid.map((row, ri) =>
        row.map((cell, ci) => {
          const [cx, cy] = hexCenter(ci, ri, rowOffset);
          if (cell.type === 's') {
            return (
              <text key={`lbl-${ri}-${ci}`} x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight="bold" fill={isDark ? '#86efac' : '#15803d'}>
                S
              </text>
            );
          }
          if (cell.type === 'g') {
            return (
              <text key={`lbl-${ri}-${ci}`} x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight="bold" fill={isDark ? '#fde68a' : '#92400e'}>
                G
              </text>
            );
          }
          return null;
        }),
      )}
    </svg>
  );
}
