import { describe, expect, it } from 'vitest';
import { reconstructFrames } from './frameGraph';
import { resolveVotes } from './math';
import type { GraphCell, GraphFrame } from './types';

const signature = Array.from({ length: 256 }, () => 0);

function frame(n: number, start: number, quantities: Record<string, number> = {}): GraphFrame {
  const cells: GraphCell[] = Array.from({ length: 6 }, (_, i) => {
    const row = Math.floor(i / 3) + start;
    const col = i % 3;
    const key = `Item_${row * 3 + col}`;
    // Deliberately wrong provisional rows: reconstruction must ignore them.
    return {
      id: `${n}:999:${col}`,
      box: { x: col * 100, y: (row - start) * 100, w: 80, h: 80 },
      prediction: { key, quantity: quantities[key] ?? row * 3 + col + 10, rawQty: '', similarity: 0.9, ocrConfidence: 0.99 },
      signature,
      contrast: 30,
    };
  });
  return { frame: n, time: n * 0.16, offset: 0, segment: n, roi: { x: 0, y: 0, right: 300, bottom: 300 }, width: 300, height: 300, motionReliable: true, cells };
}

describe('reconstructFrames', () => {
  it('three column frame evidence reconstructs rows despite corrupted provisional IDs', () => {
    const graph = reconstructFrames([frame(0, 0), frame(1, 1), frame(2, 1), frame(3, 1)], [], 100);
    expect(graph.components).toBe(1);
    expect(Object.keys(graph.tracks)).toHaveLength(9);
    expect(graph.tracks['0:1:0']).toHaveLength(4);
    expect(graph.tracks['0:1:0'].map((o) => o.frame)).toEqual([0, 1, 2, 3]);
    expect(graph.replayFrames[1].offset).toBe(-100);
  });

  it('six kind anchors can establish position while quantity disagreement remains uncertain', () => {
    const a = frame(0, 0);
    const quantities: Record<string, number> = {};
    for (const c of a.cells) if (c.prediction.key) quantities[c.prediction.key] = 900;
    const b = frame(1, 0, quantities);
    const graph = reconstructFrames([a, b, frame(2, 0), frame(3, 0)], [], 100);
    expect(graph.components).toBe(1);
    expect(graph.acceptedEdges.some((e) => e.method === 'six-kinds')).toBe(true);
    expect(resolveVotes(graph.tracks['0:0:0']).status).toBe('uncertain');
  });

  it('insufficient columns stay unplaced rather than being silently lost or falsely merged', () => {
    const full = frame(1, 0);
    const short = { ...full, cells: full.cells.slice(0, 2) };
    const graph = reconstructFrames([frame(0, 0), short], [], 100);
    expect(graph.unplacedFrames).toHaveLength(1);
    expect(graph.unplacedFrames[0].cells).toHaveLength(2);
    expect(Object.keys(graph.tracks)).toHaveLength(6);
    expect(reconstructFrames([short], [], 100).components).toBe(0);
  });

  it('repeated source-time views do not multiply a cell vote', () => {
    const graph = reconstructFrames([frame(0, 0), { ...frame(1, 0), time: 0.01 }], [], 100);
    expect(graph.tracks['0:0:0']).toHaveLength(1);
  });
});
