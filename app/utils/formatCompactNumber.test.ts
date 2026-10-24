import { describe, expect, it } from 'vitest';
import { formatCompactNumber } from './formatCompactNumber';

describe('formatCompactNumber', () => {
  it('keeps values under 10k as plain numbers', () => {
    expect(formatCompactNumber(9999)).toBe('9,999');
  });
  it('uses k from 10,000', () => {
    expect(formatCompactNumber(12000)).toBe('12k');
    expect(formatCompactNumber(144000)).toBe('144k');
    expect(formatCompactNumber(15500)).toBe('15.5k');
  });
  it('uses M from 10,000,000', () => {
    expect(formatCompactNumber(21276000)).toBe('21.3M');
  });
});
