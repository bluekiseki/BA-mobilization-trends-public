import { describe, expect, it } from 'vitest';
import { parseTier } from './tier';

describe('equipment tier parsing', () => {
  it('accepts only T-prefixed values like the Python parser', () => {
    expect(parseTier('T1', 10)).toBe(1);
    expect(parseTier(' T10 ', 10)).toBe(10);
    expect(parseTier('TD', 10)).toBe(1);
    expect(parseTier('1', 10)).toBeNull();
    expect(parseTier('L', 10)).toBeNull();
    expect(parseTier('', 10)).toBeNull();
  });

  it('enforces the gear tier limit', () => {
    expect(parseTier('T2', 2)).toBe(2);
    expect(parseTier('T3', 2)).toBeNull();
  });
});
