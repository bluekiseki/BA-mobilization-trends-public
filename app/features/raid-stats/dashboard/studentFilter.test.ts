import { describe, expect, it } from 'vitest';
import { createStudentFilter, matchesStudentFilter } from './studentFilter';

describe('matchesStudentFilter', () => {
  it('rejects any excluded student when assists are disabled', () => {
    expect(matchesStudentFilter([[1, 2], [3]], { excludeIds: [3], includeIds: [], allowAssist: false })).toBe(false);
  });

  it('allows one excluded student per party, rather than per video', () => {
    const filter = { excludeIds: [1, 2], includeIds: [], allowAssist: true };
    expect(
      matchesStudentFilter(
        [
          [1, 3],
          [2, 4],
        ],
        filter,
      ),
    ).toBe(true);
    expect(
      matchesStudentFilter(
        [
          [1, 2],
          [3, 4],
        ],
        filter,
      ),
    ).toBe(false);
  });

  it('requires all included students across the combined parties', () => {
    const filter = { excludeIds: [1], includeIds: [3, 4], allowAssist: true };
    expect(matchesStudentFilter([[1, 3], [4]], filter)).toBe(true);
    expect(matchesStudentFilter([[1, 3], [5]], filter)).toBe(false);
  });

  it('counts duplicate student IDs only once per party', () => {
    expect(matchesStudentFilter([[1, 1]], { excludeIds: [1, 1], includeIds: [], allowAssist: true })).toBe(true);
  });

  it('keeps unknown parties unless an inclusion requires known students', () => {
    expect(matchesStudentFilter([[]], createStudentFilter())).toBe(true);
    expect(matchesStudentFilter([], { ...createStudentFilter(), includeIds: [1] })).toBe(false);
  });

  it('creates independent default states', () => {
    const first = createStudentFilter();
    first.excludeIds.push(1);
    expect(createStudentFilter()).toEqual({ excludeIds: [], includeIds: [], allowAssist: false });
  });
});
