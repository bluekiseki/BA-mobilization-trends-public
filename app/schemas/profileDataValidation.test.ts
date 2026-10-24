import { describe, expect, it } from 'vitest';
import { ProfileDataSchemas, resolveProfileDataKey, validateProfileDataValue } from './profileDataValidation';

describe('resolveProfileDataKey', () => {
  it('allows every registered static key and the prefixed keys the client writes', () => {
    for (const key of Object.keys(ProfileDataSchemas)) expect(resolveProfileDataKey(key)).not.toBeNull();
    expect(resolveProfileDataKey('eventPlans:801')?.schema).not.toBeNull();
    expect(resolveProfileDataKey('arenaHistory:gl-11:0')).toEqual({ schema: null });
    expect(resolveProfileDataKey('arenaHistory:jp-12:3')).not.toBeNull();
  });

  it('rejects keys outside the registry', () => {
    for (const key of [
      'aaa1',
      'toString',
      '__proto__',
      'eventPlans:',
      'eventPlans:../x',
      'eventPlans:801:1',
      'arenaHistory:gl-11',
      'arenaHistory:kr-11:0',
      `eventPlans:${'1'.repeat(1000)}`,
      'unknown:1',
    ])
      expect(resolveProfileDataKey(key)).toBeNull();
  });
});

describe('validateProfileDataValue', () => {
  it('throws for an unknown key before looking at the value', () => {
    expect(() => validateProfileDataValue('aaa1', {})).toThrow(/Unknown key/);
  });

  it('keeps the size and schema checks for registered keys', () => {
    expect(() => validateProfileDataValue('theme', 'dark')).not.toThrow();
    expect(() => validateProfileDataValue('theme', 1)).toThrow(/Invalid 'theme'/);
    expect(() => validateProfileDataValue('eventPlans:801', 'not an object')).toThrow();
    expect(() => validateProfileDataValue('arenaHistory:gl-11:0', { records: [] })).not.toThrow();
    expect(() => validateProfileDataValue('arenaHistory:gl-11:0', 'x'.repeat(1_000_001))).toThrow(/Payload too large/);
  });
});
