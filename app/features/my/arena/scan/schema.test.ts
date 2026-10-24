import { describe, expect, it } from 'vitest';
import { arenaBucketSchema, legacyArenaRecordSchema } from './schema';

const record = {
  id: 'a',
  capturedAt: 1,
  savedAt: 1,
  role: 'attack',
  won: true,
  me: { nickname: '', avatarId: null, m: [{ id: 10000, damage: 5 }], s: [] },
  opponent: { nickname: 'NaCl', avatarId: 13003, m: [], s: [{ id: 20000, damage: null }] },
};

describe('arenaBucketSchema', () => {
  it('accepts a season chunk', () => {
    expect(arenaBucketSchema.safeParse({ records: [record] }).success).toBe(true);
  });

  it('rejects malformed rows', () => {
    expect(arenaBucketSchema.safeParse({ records: [{ ...record, role: 'a' }] }).success).toBe(false);
    expect(arenaBucketSchema.safeParse({ records: [{ ...record, me: { ...record.me, m: Array(5).fill(record.me.m[0]) } }] }).success).toBe(false);
    expect(arenaBucketSchema.safeParse({ records: [{ ...record, opponent: { ...record.opponent, s: Array(3).fill(record.opponent.s[0]) } }] }).success).toBe(false);
  });

  it('drops nickname crop images from older data', () => {
    const parsed = arenaBucketSchema.parse({ records: [{ ...record, ni: 'data:image/webp;base64,AA' }] });
    expect('ni' in parsed.records[0]).toBe(false);
  });

  it('does not accept the pre-season long-key format', () => {
    const legacy = {
      id: 'a',
      savedAt: 1,
      capturedAt: 1,
      myRole: 'attack',
      won: true,
      me: { nickname: '', avatarId: null, team: [{ id: 10000, role: 'striker', damage: 5 }] },
      opponent: { nickname: 'NaCl', avatarId: 13003, team: [] },
    };
    expect(legacyArenaRecordSchema.safeParse(legacy).success).toBe(true);
    expect(arenaBucketSchema.safeParse({ records: [legacy] }).success).toBe(false);
  });
});
