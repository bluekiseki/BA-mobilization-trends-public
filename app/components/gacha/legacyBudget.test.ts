import { describe, expect, it } from 'vitest';
import type { BannerStrategy } from '~/types/gacha';
import { resolveMaxPull } from '~/utils/gachaEngine';

// The frozen legacy (v1) planner used to store its budget as `maxSparks` (1 spark = 200 pulls) and now
// stores `maxPull` directly. Data saved before the change still carries `maxSparks` / `maxHalfCharges`,
// so those are built from a plain record instead of the (deprecated) typed fields.
const strategy = (fields: Record<string, number>): BannerStrategy => ({ bannerId: 'b', isActive: true, minPulls: 0, studentConfigs: {}, freePulls: 0, isFes: false, ...fields });

describe('legacy planner budget', () => {
  it('a new maxPull selection resolves to the same budget the old maxSparks selection did (spark system)', () => {
    for (let sparks = 1; sparks <= 6; sparks++) {
      const before = strategy({ maxSparks: sparks, maxHalfCharges: 2 });
      const after = strategy({ maxPull: sparks * 200 });
      expect(resolveMaxPull(after, false)).toBe(resolveMaxPull(before, false));
    }
  });

  it('previously saved maxSparks data still resolves to its old budget', () => {
    for (let sparks = 1; sparks <= 6; sparks++) {
      expect(resolveMaxPull(strategy({ maxSparks: sparks }), false) / 200).toBe(sparks);
    }
  });

  it('the new default matches the old default (one spark / two half charges = 200 pulls)', () => {
    const oldDefault = strategy({ maxSparks: 1, maxHalfCharges: 2 });
    const newDefault = strategy({ maxPull: 200 });
    expect(resolveMaxPull(newDefault, false)).toBe(resolveMaxPull(oldDefault, false));
    expect(resolveMaxPull(newDefault, true)).toBe(resolveMaxPull(oldDefault, true));
  });
});
