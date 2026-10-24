import type { StoryIndex } from './types';

export interface GraphNode {
  id: string;
  depth: number; // negative = read before, 0 = this series, positive = continues in
  row: number; // vertical position inside its column (can be fractional so every column is centered)
}

export interface GraphEdge {
  from: string; // read first
  to: string;
}

export interface RelationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  minDepth: number;
  maxDepth: number;
  rows: number; // height of the tallest column
}

// The series around one series: what it follows and what follows it, a few hops each way.
export function relationGraph(index: StoryIndex, seriesId: string, hops = 2): RelationGraph {
  const depthOf = new Map<string, number>([[seriesId, 0]]);

  let frontier = [seriesId];
  for (let depth = -1; depth >= -hops; depth--) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const before of index.series[id]?.a ?? []) {
        if (index.series[before] && !depthOf.has(before)) {
          depthOf.set(before, depth);
          next.push(before);
        }
      }
    }
    frontier = next;
  }

  frontier = [seriesId];
  for (let depth = 1; depth <= hops; depth++) {
    const next: string[] = [];
    for (const [id, series] of Object.entries(index.series)) {
      if (!depthOf.has(id) && series.a?.some((before) => frontier.includes(before))) {
        depthOf.set(id, depth);
        next.push(id);
      }
    }
    frontier = next;
  }

  const columns = new Map<number, string[]>();
  for (const [id, depth] of depthOf) columns.set(depth, [...(columns.get(depth) ?? []), id]);
  const rows = Math.max(...[...columns.values()].map((ids) => ids.length));
  const nodes: GraphNode[] = [];
  for (const [depth, ids] of columns) {
    ids.forEach((id, i) => nodes.push({ id, depth, row: i + (rows - ids.length) / 2 }));
  }

  const edges: GraphEdge[] = [];
  for (const id of depthOf.keys()) {
    for (const before of index.series[id]?.a ?? []) {
      if (depthOf.has(before)) edges.push({ from: before, to: id });
    }
  }

  const depths = [...depthOf.values()];
  return { nodes, edges, minDepth: Math.min(...depths), maxDepth: Math.max(...depths), rows };
}
