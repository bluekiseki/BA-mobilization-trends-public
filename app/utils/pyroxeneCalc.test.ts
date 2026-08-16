import { describe, expect, it } from 'vitest';
import { getEventPyroxeneReward } from './pyroxeneCalc';

describe('getEventPyroxeneReward', () => {
  it("does not grant Pyroxenes for Balancing Schale's Books events", () => {
    expect(getEventPyroxeneReward(60017)).toBe(0);
    expect(getEventPyroxeneReward(60019)).toBe(0);
  });

  it('uses extracted rewards and the fallback for other events', () => {
    expect(getEventPyroxeneReward(850)).toBe(1860);
    expect(getEventPyroxeneReward(999)).toBe(1800);
  });
});
