import { describe, expect, it } from 'vitest';
import { compareRows, type Row } from './spreadsheetSort';

const row = (studentId: number, name: string, school = 'A'): Row => ({ studentId, name, school, plan: null, hasGear: false, minStar: 1 });

describe('compareRows base order', () => {
  const rows = [row(1, 'Aru'), row(2, 'Hina'), row(3, 'Mika', 'B')];

  it('falls back to academy and name without a base order', () => {
    expect(rows.sort((a, b) => compareRows(a, b, [])).map((r) => r.studentId)).toEqual([1, 2, 3]);
  });

  it('follows the base order when no header sort is set', () => {
    const baseOrder = new Map([
      [3, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(rows.sort((a, b) => compareRows(a, b, [], baseOrder)).map((r) => r.studentId)).toEqual([3, 1, 2]);
  });

  it('puts students missing from the base order last', () => {
    const baseOrder = new Map([[2, 0]]);
    expect(rows.sort((a, b) => compareRows(a, b, [], baseOrder)).map((r) => r.studentId)).toEqual([2, 1, 3]);
  });
});
