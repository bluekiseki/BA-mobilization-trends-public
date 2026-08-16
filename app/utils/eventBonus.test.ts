import { describe, expect, it } from 'vitest';
import { applyRepeatableEventBonus } from './eventBonus';

describe('applyRepeatableEventBonus', () => {
  it('rounds the bonus portion up for each repeatable run', () => {
    expect(applyRepeatableEventBonus(23, 11_000)).toBe(49);
    expect(applyRepeatableEventBonus(2, 10_500)).toBe(5);
  });

  it('returns the base reward when there is no bonus', () => {
    expect(applyRepeatableEventBonus(23, 0)).toBe(23);
  });

  it('rounds before multiplying by the number of runs', () => {
    expect(applyRepeatableEventBonus(23, 11_000) * 20).toBe(980);
    expect(applyRepeatableEventBonus(2, 10_500) * 20).toBe(100);
  });
});
