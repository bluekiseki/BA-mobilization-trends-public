import { describe, expect, it } from 'vitest';
import { packLibAVPlanes } from './libavPlanes';

describe('LibAV padded planes', () => {
  it('preserves both bytes of 10-bit samples and removes row padding', () => {
    const result = packLibAVPlanes({
      format: 62,
      width: 2,
      height: 2,
      data: new Uint8Array([1, 2, 3, 4, 99, 99, 5, 6, 7, 8, 99, 99, 9, 10, 99, 99, 11, 12, 99, 99]),
      layout: [
        { offset: 0, stride: 6 },
        { offset: 12, stride: 4 },
        { offset: 16, stride: 4 },
      ],
    });
    expect([...new Uint8Array(result.data)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(result.layout).toEqual([
      { offset: 0, stride: 4 },
      { offset: 8, stride: 2 },
      { offset: 10, stride: 2 },
    ]);
  });

  it('rounds chroma dimensions up for an odd-sized 8-bit frame', () => {
    const result = packLibAVPlanes({
      format: 0,
      width: 3,
      height: 1,
      data: new Uint8Array([1, 2, 3, 99, 4, 5, 99, 6, 7, 99]),
      layout: [
        { offset: 0, stride: 4 },
        { offset: 4, stride: 3 },
        { offset: 7, stride: 3 },
      ],
    });
    expect([...new Uint8Array(result.data)]).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('rejects truncated decoded planes', () => {
    expect(() =>
      packLibAVPlanes({
        format: 62,
        width: 2,
        height: 2,
        data: new Uint8Array(4),
        layout: [
          { offset: 0, stride: 4 },
          { offset: 8, stride: 2 },
          { offset: 10, stride: 2 },
        ],
      }),
    ).toThrow('exceeds its buffer');
  });
});
