import { describe, expect, it } from 'vitest';
import { assertCanCreateKey, MAX_KEYS_PER_PROFILE, type CountQueryDb } from './profileDataLimits';

const dbWithCount = (c: number): CountQueryDb & { params: unknown[][] } => {
  const params: unknown[][] = [];
  return {
    params,
    prepare: () => ({
      bind: (...values: unknown[]) => {
        params.push(values);
        return { first: <T>() => Promise.resolve({ c } as T) };
      },
    }),
  };
};

describe('assertCanCreateKey', () => {
  it('allows a new key below the cap and counts only that profile', async () => {
    const db = dbWithCount(MAX_KEYS_PER_PROFILE - 1);
    await expect(assertCanCreateKey(db, 'p1')).resolves.toBeUndefined();
    expect(db.params).toEqual([['p1']]);
  });

  it('rejects a new key at the cap', async () => {
    await expect(assertCanCreateKey(dbWithCount(MAX_KEYS_PER_PROFILE), 'p1')).rejects.toThrow(/Too many keys/);
  });
});
