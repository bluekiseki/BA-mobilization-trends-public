import { describe, expect, it } from 'vitest';
import { fitTemplate, SECTION_TEMPLATE } from './sections';

const transformed = (index: number) => 0.9 * SECTION_TEMPLATE[index] + 0.03;

describe('panel section template alignment', () => {
  it('rejects spurious bands and aligns the complete template by ratio', () => {
    const correct = SECTION_TEMPLATE.map((_value, index) => [transformed(index), 0.01] as [number, number]);
    const result = fitTemplate([[0.31, 0.03], ...correct, [0.71, 0.04]]);
    expect(result.matches).toHaveLength(5);
    expect(result.predicted).toEqual(expect.arrayContaining(correct.map(([center]): unknown => expect.closeTo(center, 8))));
    expect(result.fit[0]).toBeCloseTo(0.9, 8);
    expect(result.fit[1]).toBeCloseTo(0.03, 8);
  });

  it('fills a missing boundary from the winning affine fit', () => {
    const bands = [0, 2, 3, 4].map((index) => [transformed(index), 0.01] as [number, number]);
    const result = fitTemplate(bands);
    expect(result.matches).toHaveLength(4);
    expect(result.predicted[1]).toBeCloseTo(transformed(1), 8);
  });

  it('uses the unchanged template when fewer than two bands exist', () => {
    expect(fitTemplate([[0.3, 0.02]]).predicted).toEqual([...SECTION_TEMPLATE]);
  });
});
