import { describe, expect, it } from 'vitest';
import match from './ja';

describe('ja matcher', () => {
  it('matches kana in any script', () => {
    expect(match('ホシノ', 'ほし')).toBe(true);
    expect(match('ホシノ', 'ホシ')).toBe(true);
  });

  it('matches romaji, including a half-typed syllable', () => {
    expect(match('ホシノ', 'hoshino')).toBe(true);
    expect(match('ホシノ', 'hos')).toBe(true);
    expect(match('ホシノ', 'hosh')).toBe(true);
  });

  it('does not match letters that cannot complete into a syllable', () => {
    expect(match('ホシノ', 'abc')).toBe(false);
    expect(match('ホシノ', 'hobc')).toBe(false);
  });
});
