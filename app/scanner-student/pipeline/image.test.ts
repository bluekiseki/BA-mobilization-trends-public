import { describe, expect, it } from 'vitest';
import { connectedComponents, median } from './image';

describe('image primitives', () => {
  it('computes odd and even medians like numpy', () => {
    expect(median([9, 1, 5])).toBe(5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('finds 8-connected components and bounds', () => {
    const mask = new Uint8Array([1, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1]);
    const components = connectedComponents(mask, 4, 3);
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ x: 0, y: 0, width: 4, height: 3, area: 6 });
  });
});
